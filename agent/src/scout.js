/**
 * Addition D — Discovery-first scout.
 *
 * A separate weekly agent whose sole job is finding event SOURCES the
 * system doesn't know about. Differs from the planner (decides what to
 * scrape from known sources) and from discoverSources() (uses SerpAPI
 * with monitor-created queries on the daily run).
 *
 * The scout's approach is cross-referencing: fetch public aggregator
 * pages, compare what's listed against what we already have, and flag
 * gaps. It doesn't scrape events directly — it finds LISTING PAGES
 * that should be added as sources.
 *
 * Discovery strategies:
 *   1. Luma city page cross-reference — events on luma.com/austin that
 *      come from organizers we don't have as sources
 *   2. Coverage audit gaps — events the watchdog flagged as missing,
 *      trace them back to their source listing pages
 *   3. Feedback-submitted URLs — analyze any unprocessed feedback for
 *      new source patterns
 *
 * Writes findings to experiment_log as discovery hypotheses so the
 * planner can evaluate them on subsequent runs.
 *
 * Run manually: cd agent && node src/scout.js
 * Run via cron: .github/workflows/scout.yml (weekly)
 */

import { config } from './config.js';
import { validateConfig } from './config.js';
import { getClient } from './utils/claude.js';
import { getSupabase, isReadOnlyMode } from './utils/supabase.js';
import { createCostTracker } from './utils/costTracker.js';
import { routeToParser } from './utils/parserRouter.js';
import { probeUrl } from './utils/inlineProbe.js';
import * as cheerio from 'cheerio';

/**
 * Strategy 1: Luma city page cross-reference.
 *
 * Fetch luma.com/austin, extract all event organizer URLs, compare
 * against known sources. Any organizer NOT in our sources table is
 * a potential new source to add.
 */
async function crossReferenceLumaCity() {
  console.log('   🔍 Strategy 1: Luma city page cross-reference...');

  const findings = [];

  try {
    const response = await fetch('https://luma.com/austin', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.log(`      Luma fetch failed: HTTP ${response.status}`);
      return findings;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Parse __NEXT_DATA__ for event entries with host/organizer info
    const nextDataScript = $('script#__NEXT_DATA__').html();
    if (!nextDataScript) {
      console.log('      No __NEXT_DATA__ found on Luma city page');
      return findings;
    }

    let nextData;
    try {
      nextData = JSON.parse(nextDataScript);
    } catch {
      console.log('      Failed to parse __NEXT_DATA__');
      return findings;
    }

    const pageProps = nextData?.props?.pageProps || nextData?.pageProps;
    const entries = pageProps?.initialData?.events
      || pageProps?.initialData?.data?.events
      || [];

    if (!Array.isArray(entries) || entries.length === 0) {
      console.log('      No events found in Luma city page data');
      return findings;
    }

    // Get known source URLs for comparison
    const supabase = getSupabase();
    const { data: knownSources } = await supabase
      .from('sources')
      .select('url, name')
      .neq('trust_tier', 'demoted');

    const knownUrls = new Set((knownSources || []).map(s => {
      try { return new URL(s.url).pathname.split('/').filter(Boolean)[0]?.toLowerCase(); }
      catch { return null; }
    }).filter(Boolean));

    // Also add config source slugs
    for (const s of config.sources) {
      try {
        const slug = new URL(s.url).pathname.split('/').filter(Boolean)[0]?.toLowerCase();
        if (slug) knownUrls.add(slug);
      } catch { /* ignore */ }
    }

    // Extract unique organizer/host slugs from events
    const organizerMap = new Map(); // slug → {name, eventCount, sampleEvents}
    const now = new Date();

    for (const entry of entries) {
      const evt = entry.event || entry;
      if (!evt.name || !evt.start_at) continue;
      if (new Date(evt.start_at) < now) continue;

      // Extract host info
      const hosts = entry.hosts || [];
      for (const host of hosts) {
        const slug = host.username || host.slug;
        if (!slug) continue;
        const slugLower = slug.toLowerCase();

        if (!organizerMap.has(slugLower)) {
          organizerMap.set(slugLower, {
            name: host.name || slug,
            slug: slugLower,
            url: `https://lu.ma/${slug}`,
            eventCount: 0,
            sampleEvents: [],
          });
        }
        const org = organizerMap.get(slugLower);
        org.eventCount++;
        if (org.sampleEvents.length < 3) {
          org.sampleEvents.push(evt.name);
        }
      }
    }

    // Find organizers NOT in our known sources
    for (const [slug, org] of organizerMap) {
      if (knownUrls.has(slug)) continue;

      findings.push({
        strategy: 'luma_city_crossref',
        url: org.url,
        name: org.name,
        reason: `Organizer "${org.name}" has ${org.eventCount} upcoming event(s) on luma.com/austin but is not a known source. Sample: ${org.sampleEvents.join(', ')}`,
        eventCount: org.eventCount,
        confidence: org.eventCount >= 2 ? 0.8 : 0.5,
      });
    }

    console.log(`      Found ${entries.length} events from ${organizerMap.size} organizers, ${findings.length} unknown`);
  } catch (error) {
    console.log(`      Luma cross-reference failed: ${error.message}`);
  }

  return findings;
}

/**
 * Strategy 2: Coverage audit gap analysis.
 *
 * Read the most recent coverage_audits row from the watchdog. For each
 * gap event title, try to trace it back to a source listing page that
 * we should be scraping.
 */
async function analyzeCoverageGaps() {
  console.log('   🔍 Strategy 2: Coverage audit gap analysis...');

  const findings = [];
  const supabase = getSupabase();

  const { data: audits } = await supabase
    .from('coverage_audits')
    .select('gap_event_titles, events_on_luma, coverage_percentage, created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!audits || audits.length === 0 || !audits[0].gap_event_titles?.length) {
    console.log('      No coverage gaps found in recent audits');
    return findings;
  }

  const gaps = audits[0].gap_event_titles;
  console.log(`      ${gaps.length} gap event(s) from watchdog audit (${audits[0].created_at})`);

  for (const title of gaps.slice(0, 5)) {
    findings.push({
      strategy: 'coverage_gap',
      name: title,
      reason: `Event "${title}" was on luma.com/austin but not in our DB per the watchdog's coverage audit. May indicate a source we should add.`,
      confidence: 0.6,
    });
  }

  return findings;
}

/**
 * Strategy 3: Probe high-value unknown organizers.
 *
 * For the top findings from strategies 1-2, actually probe the URL
 * to see if it's a viable listing page with multiple events.
 */
async function probeTopFindings(findings, maxProbes = 3) {
  console.log(`   🔍 Strategy 3: Probing top ${maxProbes} findings...`);

  const probed = [];

  // Sort by confidence * eventCount, take top N
  const sorted = [...findings]
    .filter(f => f.url)
    .sort((a, b) => (b.confidence * (b.eventCount || 1)) - (a.confidence * (a.eventCount || 1)))
    .slice(0, maxProbes);

  for (const finding of sorted) {
    try {
      console.log(`      Probing ${finding.url}...`);
      const result = await probeUrl(finding.url, 'scrape', { name: finding.name });

      probed.push({
        ...finding,
        probe_result: {
          events: result.events.length,
          scraperType: result.scraperType,
          status: result.status,
        },
      });

      if (result.events.length > 0) {
        console.log(`      ✅ ${finding.name}: ${result.events.length} event(s) via ${result.scraperType}`);
      } else {
        console.log(`      ⚪ ${finding.name}: 0 events (${result.status})`);
      }
    } catch (error) {
      console.log(`      ⚠️  Probe failed for ${finding.url}: ${error.message}`);
      probed.push({ ...finding, probe_result: { events: 0, status: 'error', error: error.message } });
    }
  }

  return probed;
}

/**
 * Run the scout. Executes all strategies, writes findings to DB.
 */
export async function runScout() {
  console.log('=' .repeat(50));
  console.log('SCOUT: Source Discovery Agent');
  console.log('=' .repeat(50) + '\n');

  const costTracker = await createCostTracker();
  console.log(`   💰 ${costTracker.summary()}`);

  if (costTracker.shouldRefuseStart()) {
    console.warn('   🔒 Daily cost cap reached. Skipping scout.');
    return null;
  }

  // Execute discovery strategies (no Opus calls — just fetching + cross-referencing)
  const lumaFindings = await crossReferenceLumaCity();
  const gapFindings = await analyzeCoverageGaps();

  const allFindings = [...lumaFindings, ...gapFindings];
  console.log(`\n   📊 Total findings: ${allFindings.length} (Luma: ${lumaFindings.length}, Gaps: ${gapFindings.length})`);

  if (allFindings.length === 0) {
    console.log('\n   ✅ No new sources discovered this run.\n');
    return { findings: [], probed: [] };
  }

  // Probe the top findings to verify they're viable
  const probed = await probeTopFindings(allFindings, 3);

  // Write findings to DB as source suggestions (not directly as sources —
  // the planner decides whether to add them on the next run)
  if (!isReadOnlyMode()) {
    const supabase = getSupabase();

    // Write viable findings (probe returned events) as experiment_log entries
    // so the planner sees them and can include the URLs in extra_urls
    const viable = probed.filter(f => f.probe_result?.events > 0);
    if (viable.length > 0) {
      for (const finding of viable) {
        await supabase
          .from('experiment_log')
          .insert({
            agent: 'scout',
            hypothesis: `Source "${finding.name}" (${finding.url}) will produce ${finding.probe_result.events}+ events per scrape`,
            action_taken: `Scout probed ${finding.url} and found ${finding.probe_result.events} events via ${finding.probe_result.scraperType}`,
            prediction: `${finding.probe_result.events}+ events per scrape, parser: ${finding.probe_result.scraperType}`,
            expected_outcome: { events_per_scrape: finding.probe_result.events, parser: finding.probe_result.scraperType },
            evaluation_window_runs: 3,
            evaluate_after: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'pending',
          });
      }
      console.log(`\n   🧪 Wrote ${viable.length} discovery hypothesis(es) to experiment_log`);
    }
  }

  // Print summary
  console.log('\n' + '─'.repeat(50));
  console.log('🔍 Scout Report');
  console.log('─'.repeat(50));
  console.log(`   Total findings:         ${allFindings.length}`);
  console.log(`   Probed:                 ${probed.length}`);
  console.log(`   Viable (events found):  ${probed.filter(f => f.probe_result?.events > 0).length}`);
  console.log(`   Empty (0 events):       ${probed.filter(f => f.probe_result?.events === 0).length}`);

  if (probed.length > 0) {
    console.log('\n   Results:');
    for (const f of probed) {
      const icon = f.probe_result?.events > 0 ? '✅' : '⚪';
      console.log(`   ${icon} ${f.name} (${f.url}) — ${f.probe_result?.events || 0} events via ${f.probe_result?.scraperType || 'n/a'}`);
    }
  }

  console.log('─'.repeat(50) + '\n');
  console.log(`   💰 ${costTracker.summary()}`);

  return { findings: allFindings, probed };
}

// CLI entry point
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('/scout.js') ||
  process.argv[1].endsWith('\\scout.js')
);

if (isDirectRun) {
  validateConfig();
  runScout()
    .then(result => {
      if (result) {
        console.log('\n✨ Scout complete.');
      } else {
        console.log('\n⚪ Scout skipped (budget or no data).');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Scout failed:', error);
      process.exit(1);
    });
}
