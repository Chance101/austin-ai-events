import { config, validateConfig } from './config.js';
import { scrapeMeetup } from './sources/meetup.js';
import { scrapeLuma } from './sources/luma.js';
import { scrapeGeneric } from './sources/generic.js';
import { searchEvents } from './sources/websearch.js';
import { scrapeAustinForum } from './sources/austinforum.js';
import { scrapeAIAccelerator } from './sources/aiaccelerator.js';
import { scrapeAustinAI } from './sources/austinai.js';
import { scrapeLeadersInAI } from './sources/leadersinai.js';
import { scrapeAICamp } from './sources/aicamp.js';
import { scrapeCapitalFactory } from './sources/capitalfactory.js';
import { scrapeUTAustin } from './sources/utaustin.js';
import { validateEvent, classifyEvent, extractLocationFromImage, verifyPageHasEvents } from './utils/claude.js';
import { findDuplicates, getEventHash } from './utils/dedup.js';
import { upsertEvent, getExistingEvents, updateEventFields, logAgentRun, getSupabase, isReadOnlyMode } from './utils/supabase.js';
import { discoverSources, getTrustedSources, getProbationSources, updateSourceStats, updateSourceValidationStats, getEventSearchQueries } from './discovery/sourceDiscovery.js';
import { analyzeUnprocessedFeedback } from './feedback/analyzeFeedback.js';
import { runMonitor } from './monitor.js';
import { runPlanner, completeRunPlan } from './planner.js';
import { probeUrl } from './utils/inlineProbe.js';
import { RunDecisionLog } from './utils/decisionLog.js';
import { checkAustinLocation, isMalformedTitle } from './utils/filters.js';
import { ScrapeResult } from './utils/scrapeResult.js';
import { classifyScrapeError, classifySilentFailure } from './utils/errors.js';
import { routeToParser } from './utils/parserRouter.js';
import { createMidCycleObserver } from './utils/midCycleObserver.js';

/**
 * Create initial run stats object for tracking throughout the pipeline
 */
function createRunStats() {
  return {
    runType: process.env.RUN_TYPE || 'scheduled',
    startTime: Date.now(),
    queriesRun: 0,
    newSourcesFound: 0,
    newQueriesGenerated: 0,
    sourcesScraped: 0,
    eventsDiscovered: 0,
    eventsValidated: 0,
    eventsAdded: 0,
    eventsUpdated: 0,
    duplicatesSkipped: 0,
    errors: 0,
    errorMessages: [],
    claudeApiCalls: 0,
    serpapiCalls: 0,
    feedbackAnalyzed: 0,
    feedbackSourcesAdded: 0,
    feedbackQueriesAdded: 0,
  };
}

/**
 * Map database source_type to scraper type
 */
function mapSourceType(dbType) {
  const typeMap = {
    'meetup': 'meetup',
    'luma': 'luma',
    'eventbrite': 'scrape',
    'website': 'scrape',
    'university': 'scrape',
    'other': 'scrape',
  };
  return typeMap[dbType] || 'scrape';
}

async function discoverEvents() {
  console.log('🚀 Starting Austin AI Events discovery...\n');

  if (isReadOnlyMode()) {
    console.log('🔒 READONLY_MODE=1 — all database writes will be suppressed.\n');
  }

  // Phase 1 feature flag: use monitor-as-planner at start of cycle.
  // When unset, use the existing day-of-week schedule-based path.
  // When set, the planner produces a runPlan that drives scrape/probe/query selection.
  const usePlanner = process.env.USE_PLANNER === '1';
  if (usePlanner) {
    console.log('🧠 USE_PLANNER=1 — planner will drive this run\n');
  }

  // Initialize run stats for tracking throughout the pipeline
  const runStats = createRunStats();
  const decisionLog = new RunDecisionLog();

  // Validate configuration
  validateConfig();

  const allDiscoveredEvents = [];

  // Phase 1: Planner (when USE_PLANNER=1)
  let runPlan = null;
  let planRowId = null;
  let plannerCostTracker = null;
  if (usePlanner) {
    try {
      const plannerResult = await runPlanner();
      runPlan = plannerResult.plan;
      planRowId = plannerResult.planRowId;
      plannerCostTracker = plannerResult.costTracker;
      if (plannerCostTracker) {
        runStats.claudeApiCalls += plannerCostTracker.callLog?.strategic || 0;
      }
      if (!runPlan) {
        console.warn(`   ⚠️  Planner did not produce a plan (${plannerResult.reason}) — falling back to schedule-based path\n`);
      }
    } catch (error) {
      console.error(`   ❌ Planner crashed: ${error.message} — falling back to schedule-based path\n`);
      runPlan = null;
    }
  }

  // 0. Run source discovery first (find new sources via search)
  console.log('=' .repeat(50));
  console.log('PHASE 1: SOURCE DISCOVERY');
  console.log('=' .repeat(50) + '\n');

  try {
    const discoveryStats = await discoverSources(runStats);
    runStats.queriesRun = discoveryStats.queriesRun;
    runStats.newSourcesFound = discoveryStats.sourcesDiscovered;
    runStats.newQueriesGenerated = 0;
    runStats.serpapiCalls += discoveryStats.serpapiCalls || 0;
    runStats.claudeApiCalls += discoveryStats.claudeApiCalls || 0;

    // Inline probing: events scraped from newly-discovered URLs in the same
    // run they were found. These skip the probation queue entirely and flow
    // straight into the main dedup/validation/upsert pipeline. This is how
    // a source like luma.com/austin gets tested immediately instead of
    // waiting weeks for probation rotation.
    if (discoveryStats.probedEvents && discoveryStats.probedEvents.length > 0) {
      allDiscoveredEvents.push(...discoveryStats.probedEvents);
      runStats.inlineProbeEvents = discoveryStats.probedEvents.length;
      console.log(`  🎯 ${discoveryStats.probedEvents.length} event(s) from inline probing — queued for validation\n`);
    }
  } catch (error) {
    console.error('Source discovery error:', error.message);
    runStats.errors++;
    runStats.errorMessages.push(`Source discovery: ${error.message}`);
  }

  // 1.5. Analyze feedback on missed events
  console.log('=' .repeat(50));
  console.log('PHASE 1.5: FEEDBACK ANALYSIS');
  console.log('=' .repeat(50) + '\n');

  try {
    const feedbackStats = await analyzeUnprocessedFeedback(runStats);
    runStats.feedbackAnalyzed = feedbackStats.analyzed;
    runStats.feedbackSourcesAdded = feedbackStats.sourcesAdded;
    runStats.feedbackQueriesAdded = feedbackStats.queriesAdded;

    // Inject scraped feedback events into the pipeline
    if (feedbackStats.scrapedEvents && feedbackStats.scrapedEvents.length > 0) {
      allDiscoveredEvents.push(...feedbackStats.scrapedEvents);
      console.log(`  📥 ${feedbackStats.scrapedEvents.length} event(s) scraped from user feedback — queued for validation\n`);
    }
  } catch (error) {
    console.error('Feedback analysis error:', error.message);
    runStats.errors++;
    runStats.errorMessages.push(`Feedback analysis: ${error.message}`);
  }

  // 2. Get all sources to scrape (config + trusted DB sources)
  console.log('=' .repeat(50));
  console.log('PHASE 2: EVENT SCRAPING');
  console.log('=' .repeat(50) + '\n');

  console.log('📡 Gathering sources...');

  // Source selection: planner-driven OR schedule-based OR scrape-all override.
  const scrapeAll = process.env.SCRAPE_ALL === '1';
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let scheduledSources;
  let skippedSources;

  if (scrapeAll) {
    scheduledSources = config.sources;
    skippedSources = [];
    console.log(`  🔓 SCRAPE_ALL=1 override: ${scheduledSources.length} config sources`);
  } else if (usePlanner && runPlan) {
    // Planner-driven selection. runPlan.config_sources is a list of {name, url, reason}.
    // The floor rule has already been applied inside runPlanner(), so any config
    // source that needed scraping (7-day floor) is guaranteed to be in the plan.
    const plannedUrls = new Set((runPlan.config_sources || []).map(s => s.url));
    scheduledSources = config.sources.filter(s => plannedUrls.has(s.url));
    skippedSources = config.sources.filter(s => !plannedUrls.has(s.url));
    console.log(`  🧠 Planner-driven: ${scheduledSources.length} config sources selected, ${skippedSources.length} skipped`);
    if (scheduledSources.length > 0) {
      console.log(`     Scraping: ${scheduledSources.map(s => s.name).join(', ')}`);
    }
  } else {
    scheduledSources = config.sources.filter(s => {
      if (!s.scrapeDays) return true; // No schedule = scrape daily
      return s.scrapeDays.includes(dayOfWeek);
    });
    skippedSources = config.sources.filter(s => s.scrapeDays && !s.scrapeDays.includes(dayOfWeek));
    console.log(`  📅 ${dayNames[dayOfWeek]}: ${scheduledSources.length} sources scheduled, ${skippedSources.length} skipped`);
    if (skippedSources.length > 0) {
      console.log(`     Skipped today: ${skippedSources.map(s => s.name).join(', ')}`);
    }
  }

  // Ensure config sources exist in DB so their stats get tracked
  if (!isReadOnlyMode()) {
    const supabase = getSupabase();
    for (const s of config.sources) {
      await supabase
        .from('sources')
        .upsert({
          url: s.url,
          name: s.name,
          source_type: s.type,
          trust_tier: 'config',
          is_active: true,
        }, { onConflict: 'url', ignoreDuplicates: false });
    }
  }

  // Start with scheduled config sources
  const allSources = scheduledSources.map(s => ({
    ...s,
    trust_tier: 'config',
  }));
  const configUrls = new Set(config.sources.map(s => s.url));

  // DB sources: under USE_PLANNER, probation rotation is OFF — any DB
  // source must be explicitly listed in runPlan.extra_urls. Under the
  // legacy path, probation rotation still works.
  if (!usePlanner) {
    try {
      const dbSources = await getTrustedSources();
      for (const dbSource of dbSources) {
        if (!configUrls.has(dbSource.url)) {
          allSources.push({
            id: 'web-search',
            name: dbSource.name,
            url: dbSource.url,
            type: mapSourceType(dbSource.source_type),
            fromDb: true,
            trust_tier: dbSource.trust_tier || 'probation',
          });
        }
      }

      const probationSources = await getProbationSources();
      for (const dbSource of probationSources) {
        if (!configUrls.has(dbSource.url)) {
          allSources.push({
            id: 'web-search',
            name: dbSource.name,
            url: dbSource.url,
            type: mapSourceType(dbSource.source_type),
            fromDb: true,
            trust_tier: 'probation',
          });
        }
      }

      console.log(`  Config sources: ${config.sources.length}, Trusted DB: ${dbSources.length}, Probation: ${probationSources.length}`);
      console.log(`  Total unique sources: ${allSources.length}\n`);
    } catch (error) {
      console.error('Error fetching DB sources:', error.message);
    }
  } else {
    console.log(`  Config sources (planner-selected): ${allSources.length}`);
    console.log(`  Probation rotation: disabled under USE_PLANNER (use runPlan.extra_urls instead)\n`);
  }

  // Create the mid-cycle observer for planner-driven runs.
  // It watches scrape results and makes bounded adjustments.
  const observer = (usePlanner && runPlan)
    ? createMidCycleObserver(runPlan, {
        onAdjustment: (adj) => console.log(`   🔄 Inner-loop adjustment: ${adj.type} — ${adj.added_url || adj.source}`),
      })
    : null;

  console.log('📡 Scraping sources...');

  // Helper: run the right scraper for a source.
  // Platform-aware: routeToParser() checks the URL domain first and overrides
  // the configured type when a known platform matches (lu.ma → luma, meetup.com
  // → meetup). This fixes the class of failure where a discovered URL on a
  // known platform gets handed to the generic scraper because Claude labeled
  // it 'website' instead of 'luma'. Config sources with explicit types still
  // work: the router returns the same type they already had.
  async function scrapeSource(source) {
    const routedType = routeToParser(source.url) || source.type;
    if (routedType !== source.type) {
      console.log(`    🎯 Parser router: ${source.type || 'unknown'} → ${routedType} (URL domain matched)`);
    }
    switch (routedType) {
      case 'meetup':       return await scrapeMeetup(source);
      case 'luma':         return await scrapeLuma(source);
      case 'austinforum':  return await scrapeAustinForum(source);
      case 'aiaccelerator': return await scrapeAIAccelerator(source);
      case 'austinai':     return await scrapeAustinAI(source);
      case 'leadersinai':  return await scrapeLeadersInAI(source);
      case 'aicamp':       return await scrapeAICamp(source);
      case 'capitalfactory': return await scrapeCapitalFactory(source);
      case 'utaustin':     return await scrapeUTAustin(source);
      case 'scrape':
      case 'api':          return await scrapeGeneric(source);
      default:
        console.log(`    Unknown source type: ${routedType}`);
        return [];
    }
  }

  for (const source of allSources) {
    try {
      console.log(`  → ${source.name} (${source.type})`);

      let events = [];
      let scrapeStatus = 'success';
      let scrapeDiagnostics = null;
      try {
        const rawResult = await scrapeSource(source);
        const result = ScrapeResult.from(rawResult);
        events = result.events;
        scrapeStatus = result.status;
        scrapeDiagnostics = result.diagnostics;
      } catch (firstError) {
        const classified = classifyScrapeError(firstError, { source: source.name });

        if (classified.retryable) {
          console.warn(`    ⚠️  ${classified.type} error, retrying in 2s: ${classified.message}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          try {
            const retryRaw = await scrapeSource(source);
            const retryResult = ScrapeResult.from(retryRaw);
            events = retryResult.events;
            scrapeStatus = retryResult.status;
            scrapeDiagnostics = retryResult.diagnostics;
          } catch (retryError) {
            // Retry also failed — reclassify and throw to outer catch
            throw retryError;
          }
        } else {
          // Non-retryable (structural/permanent) — throw to outer catch
          throw firstError;
        }
      }

      console.log(`    Found ${events.length} events`);

      // Track per-source results for observability
      if (!runStats.sourceResults) runStats.sourceResults = [];
      runStats.sourceResults.push({
        name: source.name,
        url: source.url,
        events: events.length,
        scrapeStatus,
        scraperType: source.type || 'unknown',
        diagnostics: scrapeDiagnostics,
      });

      if (events.length === 0) {
        if (scrapeStatus === 'fetch_failed') {
          console.warn(`    ⚠️  ${source.name} fetch failed (HTTP ${scrapeDiagnostics?.httpStatus || 'unknown'})`);
          decisionLog.log({
            event: source.name,
            source: source.id || source.name,
            stage: 'scrape',
            outcome: 'error',
            reason: `Fetch failed: HTTP ${scrapeDiagnostics?.httpStatus || 'unknown'}`,
          });
        } else if (scrapeStatus === 'parse_uncertain') {
          console.warn(`    ⚠️  ${source.name} returned 0 events (parse_uncertain — HTML received but couldn't extract)`);
          decisionLog.log({
            event: source.name,
            source: source.id || source.name,
            stage: 'scrape',
            outcome: 'parse_failure',
            reason: 'HTML received but no events could be extracted ��� scraper may need updating',
          });
        } else {
          console.warn(`    ⚠️  ${source.name} returned 0 events — may be silently failing`);

          // Classify the silent failure using consecutive empty scrape count from DB
          let sourceData = null;
          try {
            const supabaseClient = getSupabase();
            const { data } = await supabaseClient
              .from('sources')
              .select('consecutive_empty_scrapes, name')
              .eq('url', source.url)
              .single();
            sourceData = data;
          } catch { /* ignore — classification will use defaults */ }

          const silentClassification = classifySilentFailure(
            { consecutive_empty_scrapes: sourceData?.consecutive_empty_scrapes || 0, name: source.name },
            0
          );
          console.log(`    📊 Silent failure classification: ${silentClassification.type} — ${silentClassification.message}`);
        }
      }

      // Content verification: confirm parser breakage for config sources with suspicious diagnostics
      if (events.length === 0
          && !source.fromDb  // config source
          && scrapeDiagnostics?.httpStatus === 200
          && scrapeDiagnostics?.pageSize > 5000
          && scrapeDiagnostics?.contentSignals?.hasEventKeywords
          && scrapeDiagnostics?.pageTextSnippet) {
        // Check consecutive empty scrapes to avoid triggering on first empty run
        let consecutiveEmpties = 0;
        try {
          const supabaseClient = getSupabase();
          const { data } = await supabaseClient
            .from('sources')
            .select('consecutive_empty_scrapes, consecutive_parse_failures')
            .eq('url', source.url)
            .single();
          consecutiveEmpties = (data?.consecutive_empty_scrapes || 0) + (data?.consecutive_parse_failures || 0);
        } catch { /* ignore */ }

        if (consecutiveEmpties >= 1) {
          console.log(`    🔍 Content verification: page has event keywords + ${consecutiveEmpties} consecutive failures — checking with Haiku`);
          const verification = await verifyPageHasEvents(scrapeDiagnostics.pageTextSnippet, source.name, runStats);
          scrapeDiagnostics.contentVerification = verification;
          if (verification.hasEvents) {
            console.warn(`    🚨 CONFIRMED parser breakage: ${source.name} — page has events but scraper found 0`);
            decisionLog.log({
              event: source.name,
              source: source.id || source.name,
              stage: 'content_verification',
              outcome: 'parser_breakage_confirmed',
              reason: `Page has events but scraper extracted 0: ${verification.evidence}`,
            });
          } else {
            console.log(`    ✅ Content verification: ${source.name} — page does not appear to have events (${verification.evidence})`);
          }
        }
      }

      // Attach source metadata to each event for conditional validation
      events.forEach(e => {
        e._sourceUrl = source.url;
        e._sourceTier = source.trust_tier || (source.fromDb ? 'probation' : 'config');
      });

      allDiscoveredEvents.push(...events);
      runStats.sourcesScraped++;

      // Inner-loop: observer tracks results for mid-cycle adjustments
      if (observer) {
        observer.observe(source, { events, status: scrapeStatus });
      }

      // Update source stats in DB (pass diagnostics for intelligent demotion decisions)
      if (source.fromDb || source.url) {
        await updateSourceStats(source.url, events.length, scrapeStatus, scrapeDiagnostics).catch(() => {});
      }

    } catch (error) {
      const classified = classifyScrapeError(error, { source: source.name });
      console.error(`    Error [${classified.type}]: ${error.message}`);
      runStats.errors++;
      runStats.errorMessages.push({
        source: source.name,
        type: classified.type,
        message: classified.message,
        retryable: classified.retryable,
      });

      // Inner-loop: observer tracks errors too
      if (observer) {
        observer.observe(source, { events: [], status: 'error' }, error);
      }
    }
  }

  // 2a. Inner-loop adjustments: after the scrape loop completes, the
  // observer checks for triggers (parser errors, zero-from-expected,
  // high-yield) and generates bounded adjustments — extra URLs to probe
  // based on what happened during scraping. Max 5 adjustments per cycle.
  if (observer && observer.hasAdjustments()) {
    const adjustments = await observer.generateAdjustments();
    if (adjustments.length > 0) {
      console.log(`\n🔄 Inner-loop: ${adjustments.length} adjustment(s) from ${observer.triggerCount} trigger(s)`);
      for (const adj of adjustments) {
        try {
          const probe = await probeUrl(adj.url, adj.parser_hint || 'scrape', { name: adj.url });
          if (probe.events && probe.events.length > 0) {
            allDiscoveredEvents.push(...probe.events);
            console.log(`   🔄 ${adj.url} (${probe.scraperType}): ${probe.events.length} event(s) — ${adj.reason}`);
          } else {
            console.log(`   ⚪ ${adj.url}: 0 events — ${probe.error || probe.status}`);
          }
        } catch (error) {
          console.error(`   ⚠️  Adjustment probe failed: ${error.message}`);
        }
      }
    }
  }

  // 2b. Planner-requested extra URLs: inline probe any URLs the planner
  // added to runPlan.extra_urls. Under USE_PLANNER, this is the only way
  // DB-discovered or otherwise-specified URLs get scraped (probation
  // rotation is off). The probe uses the correct parser via routeToParser.
  if (usePlanner && runPlan?.extra_urls && runPlan.extra_urls.length > 0) {
    console.log(`\n🎯 Inline probing ${runPlan.extra_urls.length} planner-requested URL(s)...`);
    for (const entry of runPlan.extra_urls) {
      try {
        const probe = await probeUrl(entry.url, entry.parser_hint || 'scrape', { name: entry.url });
        if (probe.events && probe.events.length > 0) {
          allDiscoveredEvents.push(...probe.events);
          console.log(`   🎯 ${entry.url} (${probe.scraperType}): ${probe.events.length} event(s) — ${entry.reason || 'no reason given'}`);
        } else {
          console.log(`   ⚪ ${entry.url} (${probe.scraperType}): 0 events — ${probe.error || probe.status || 'no events'}`);
        }
      } catch (error) {
        console.error(`   ⚠️  Inline probe failed for ${entry.url}: ${error.message}`);
      }
    }
  }

  // 2b. Web search for additional events.
  // Under USE_PLANNER, use runPlan.event_queries (planner-chosen). Otherwise
  // fall back to getEventSearchQueries() which rotates by last_run.
  console.log('\n🔍 Searching web for additional events...');
  try {
    let eventQueries;
    if (usePlanner && runPlan?.event_queries && runPlan.event_queries.length > 0) {
      eventQueries = runPlan.event_queries.map(q => q.query_text);
      console.log(`  Using ${eventQueries.length} planner-selected queries`);
    } else {
      eventQueries = await getEventSearchQueries(2);
      console.log(`  Using ${eventQueries.length} schedule-selected queries`);
    }
    const { events: searchResults, serpapiCalls } = await searchEvents(eventQueries, runStats);
    console.log(`  Found ${searchResults.length} potential events from web search`);
    allDiscoveredEvents.push(...searchResults);
    runStats.serpapiCalls += serpapiCalls || 0;
  } catch (error) {
    console.error(`  Search error: ${error.message}`);
    runStats.errors++;
    runStats.errorMessages.push(`Web search: ${error.message}`);
  }

  runStats.eventsDiscovered = allDiscoveredEvents.length;
  console.log(`\n📊 Total events discovered: ${runStats.eventsDiscovered}`);

  // 3. Get existing events for deduplication
  console.log('\n🔄 Checking for duplicates...');
  const existingEvents = await getExistingEvents();
  const existingHashes = new Set(existingEvents.map(e => getEventHash(e)));

  // 4. Validate and process each event
  console.log('\n✅ Validating and classifying events...');

  // Track validation stats per source for promotion/demotion
  const sourceValidationStats = new Map(); // url -> { passed: 0, failed: 0 }

  for (const event of allDiscoveredEvents) {
    try {
      // Skip events without title or URL
      if (!event.title || !event.url) {
        continue;
      }

      // Skip events with invalid/placeholder titles
      const invalidTitlePatterns = [
        /^tbd$/i,
        /^tba$/i,
        /^coming soon$/i,
        /^to be announced$/i,
        /^to be determined$/i,
        /^untitled$/i,
        /^event$/i,
        /^new event$/i,
        /^test$/i,
      ];
      const titleTrimmed = event.title.trim();
      if (
        titleTrimmed.length < 5 ||
        invalidTitlePatterns.some(pattern => pattern.test(titleTrimmed))
      ) {
        console.log(`  ⚠️  Skipping event with invalid title: "${titleTrimmed}"`);
        decisionLog.log({ event: titleTrimmed, source: event.source, stage: 'pre_filter', outcome: 'skipped', reason: 'Invalid/placeholder title' });
        continue;
      }

      // Skip events with malformed titles (CSS, HTML, code, etc.)
      if (isMalformedTitle(titleTrimmed)) {
        console.log(`  ⚠️  Skipping event with malformed title (CSS/code detected): "${titleTrimmed.substring(0, 60)}..."`);
        decisionLog.log({ event: titleTrimmed, source: event.source, stage: 'pre_filter', outcome: 'skipped', reason: 'Malformed title (CSS/HTML/code)' });
        continue;
      }

      // Quick dedupe check by URL hash — but detect changed events (date moved, venue changed)
      const hash = getEventHash(event);
      if (existingHashes.has(hash)) {
        const existing = existingEvents.find(e => getEventHash(e) === hash);
        if (existing) {
          const changes = {};
          // Compare start_time (normalize to ISO date strings for comparison)
          if (event.start_time && existing.start_time) {
            const newStart = new Date(event.start_time).toISOString();
            const oldStart = new Date(existing.start_time).toISOString();
            if (newStart !== oldStart) changes.start_time = event.start_time;
          }
          if (event.end_time && existing.end_time) {
            const newEnd = new Date(event.end_time).toISOString();
            const oldEnd = new Date(existing.end_time).toISOString();
            if (newEnd !== oldEnd) changes.end_time = event.end_time;
          }
          // Compare venue/address (only update if scraper provided new data)
          if (event.venue_name && event.venue_name !== existing.venue_name) {
            changes.venue_name = event.venue_name;
          }
          if (event.address && event.address !== existing.address) {
            changes.address = event.address;
            changes.location = event.address;
          }

          if (Object.keys(changes).length > 0) {
            const changeDesc = Object.keys(changes).join(', ');
            console.log(`  🔄 Updating (${changeDesc}): ${event.title?.substring(0, 50)}...`);
            try {
              await updateEventFields(existing.id, changes);
              runStats.eventsUpdated++;
              decisionLog.log({ event: event.title, source: event.source, stage: 'dedup_hash', outcome: 'updated', reason: `Fields changed: ${changeDesc}` });
            } catch (err) {
              console.error(`    Failed to update: ${err.message}`);
            }
          } else {
            runStats.duplicatesSkipped++;
            decisionLog.log({ event: event.title, source: event.source, stage: 'dedup_hash', outcome: 'duplicate', reason: 'Exact hash match' });
          }
        } else {
          runStats.duplicatesSkipped++;
          decisionLog.log({ event: event.title, source: event.source, stage: 'dedup_hash', outcome: 'duplicate', reason: 'Exact hash match' });
        }
        continue;
      }

      // Fuzzy dedup check BEFORE validation to avoid wasting Claude API calls
      const duplicate = await findDuplicates(event, existingEvents, runStats);
      if (duplicate) {
        console.log(`  ⏭️  Duplicate of existing event: ${duplicate.reason}`);
        runStats.duplicatesSkipped++;
        decisionLog.log({ event: event.title, source: event.source, stage: 'dedup_fuzzy', outcome: 'duplicate', reason: duplicate.reason });
        continue;
      }

      // If no venue/address but has image, try to extract location from image
      if (!event.venue_name && !event.address && event.image_url) {
        console.log(`    📷 No venue data - analyzing event image...`);
        const imageLocation = await extractLocationFromImage(event.image_url);
        runStats.claudeApiCalls++;

        if (imageLocation && imageLocation.found) {
          // Add extracted location to event data
          if (imageLocation.venue) event.venue_name = imageLocation.venue;
          if (imageLocation.city) {
            const cityState = [imageLocation.city, imageLocation.state].filter(Boolean).join(', ');
            event.address = imageLocation.address || cityState;
          }
          console.log(`    📷 Found location in image: ${event.address || event.venue_name}`);
        }
      }

      // ALWAYS check Austin location first (doesn't use Claude API)
      const locationCheck = checkAustinLocation(event);

      // Skip Claude validation for config sources, BUT only if location is confirmed Austin
      const isTrustedSource = event._sourceTier === 'config';

      let validation;
      if (isTrustedSource && locationCheck.isAustin === true) {
        // Trusted source with confirmed Austin location - skip Claude validation
        validation = { isValid: true, confidence: 0.85, reason: 'Trusted source with verified Austin location' };
        console.log(`  ✅ Trusted source, verified Austin: ${event.title?.substring(0, 50)}...`);
        decisionLog.log({ event: event.title, source: event.source, stage: 'validation', outcome: 'accepted', reason: 'Trusted source, Austin confirmed' });
      } else if (isTrustedSource && locationCheck.isAustin === false) {
        // Trusted source but NOT in Austin - reject without Claude call
        validation = { isValid: false, confidence: 0.9, reason: locationCheck.reason };
        console.log(`  ❌ Trusted source but NOT Austin: ${event.title?.substring(0, 50)}... (${locationCheck.reason})`);
        decisionLog.log({ event: event.title, source: event.source, stage: 'location_check', outcome: 'rejected', reason: locationCheck.reason });
      } else if (isTrustedSource && locationCheck.isAustin === null) {
        // Trusted source but uncertain location - need Claude to verify
        console.log(`  🔍 Trusted source, uncertain location - validating: ${event.title?.substring(0, 50)}... (${locationCheck.reason})`);
        validation = await validateEvent(event, runStats);
        runStats.claudeApiCalls++;
      } else {
        // Probation source - always validate with Claude
        console.log(`  🔍 Validating (probation): ${event.title?.substring(0, 50)}...`);
        validation = await validateEvent(event, runStats);
        runStats.claudeApiCalls++;

        // Track validation results per source
        if (event._sourceUrl) {
          const stats = sourceValidationStats.get(event._sourceUrl) || { passed: 0, failed: 0 };
          if (validation.isValid && validation.confidence >= 0.6) {
            stats.passed++;
          } else {
            stats.failed++;
          }
          sourceValidationStats.set(event._sourceUrl, stats);
        }
      }

      if (!validation.isValid || validation.confidence < 0.6) {
        console.log(`    ❌ Invalid${event.url ? ` [${event.url}]` : ''}: ${validation.reason}`);
        decisionLog.log({ event: event.title, source: event.source, stage: 'validation', outcome: 'rejected', reason: validation.reason, details: { claudeCalled: !isTrustedSource || locationCheck.isAustin === null, confidence: validation.confidence } });
        continue;
      }

      runStats.eventsValidated++;

      // Skip events without start_time (required field)
      if (!event.start_time) {
        console.log(`    ⚠️  Skipping (no date): ${event.title?.substring(0, 40)}`);
        decisionLog.log({ event: event.title, source: event.source, stage: 'pre_filter', outcome: 'skipped', reason: 'No start_time' });
        continue;
      }

      // Classify the event
      const classification = await classifyEvent(event, runStats);
      runStats.claudeApiCalls++;

      // Prepare event for database
      // Use AI-generated summary if available, otherwise fall back to original description
      // Strip meaningless end_time: if end === start, the source didn't have
      // a real end time and the scraper duplicated the start. Storing null
      // is cleaner — the frontend shows "7:00 PM" not "7:00 PM - 7:00 PM".
      let endTime = event.end_time || null;
      if (endTime && event.start_time) {
        const endMs = new Date(endTime).getTime();
        const startMs = new Date(event.start_time).getTime();
        // Strip meaningless end_time: same as start, or before start (impossible)
        if (endMs === startMs || endMs < startMs) {
          endTime = null;
        }
      }

      const dbEvent = {
        title: event.title,
        description: classification.summary || event.description || null,
        start_time: event.start_time || null,
        end_time: endTime,
        location: event.address || null,
        venue_name: event.venue_name || null,
        address: event.address || null,
        url: event.url,
        source: event.source,
        source_event_id: event.source_event_id || null,
        audience_type: classification.audienceType,
        technical_level: classification.technicalLevel,
        is_free: event.is_free ?? classification.isFree ?? null,
        price: event.price || null,
        organizer: event.organizer || null,
        image_url: event.image_url || null,
        is_verified: validation.confidence > 0.8,
      };

      // Upsert to database. Postgres turns this into INSERT or UPDATE
      // depending on whether the (source, source_event_id) constraint matches,
      // and the JS client doesn't tell us which. Compare the row's created_at
      // against this run's start time (with a 5s buffer for clock drift) so
      // an upsert that touched a pre-existing row is counted as an update,
      // not a new insert.
      const result = await upsertEvent(dbEvent);
      const createdAtMs = result.created_at ? new Date(result.created_at).getTime() : null;
      const isFreshInsert = createdAtMs === null || createdAtMs >= runStats.startTime - 5000;
      if (isFreshInsert) {
        console.log(`    ✅ Added: ${result.title}`);
        runStats.eventsAdded++;
      } else {
        console.log(`    🔄 Refreshed: ${result.title}`);
        runStats.eventsUpdated++;
      }
      decisionLog.log({
        event: event.title,
        source: event.source,
        stage: 'upsert',
        outcome: 'accepted',
        details: { claudeCalled: true, persisted: isFreshInsert ? 'inserted' : 'updated' },
      });

      // Add to existing events for dedup checking
      existingEvents.push(result);
      existingHashes.add(hash);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`    ❌ Error processing event: ${error.message}`);
      runStats.errors++;
      runStats.errorMessages.push(`Process event: ${error.message}`);
    }
  }

  // 5. Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📈 FINAL SUMMARY');
  console.log('='.repeat(50));
  console.log('\n  Source Discovery:');
  console.log(`    Queries run:          ${runStats.queriesRun}`);
  console.log(`    New sources found:    ${runStats.newSourcesFound}`);
  console.log(`    New queries added:    ${runStats.newQueriesGenerated}`);
  console.log('\n  Feedback Analysis:');
  console.log(`    Events analyzed:      ${runStats.feedbackAnalyzed}`);
  console.log(`    Sources added:        ${runStats.feedbackSourcesAdded}`);
  console.log(`    Queries added:        ${runStats.feedbackQueriesAdded}`);
  console.log('\n  Event Scraping:');
  console.log(`    Sources scraped:      ${runStats.sourcesScraped}`);
  console.log(`    Events discovered:    ${runStats.eventsDiscovered}`);
  console.log(`    Events validated:     ${runStats.eventsValidated}`);
  console.log(`    Duplicates skipped:   ${runStats.duplicatesSkipped}`);
  console.log(`    Events added:         ${runStats.eventsAdded}`);
  console.log('\n  API Usage:');
  console.log(`    Claude API calls:     ${runStats.claudeApiCalls}`);
  console.log(`    SerpAPI calls:        ${runStats.serpapiCalls}`);
  console.log(`    Errors:               ${runStats.errors}`);
  console.log('='.repeat(50));

  // 5.5. Update source validation stats for promotion/demotion
  if (sourceValidationStats.size > 0) {
    console.log('\n📊 Updating source validation stats...');
    await updateSourceValidationStats(sourceValidationStats);
  }

  // 5.6. Attach decision summary to run stats
  const decisionSummary = decisionLog.getSummary();
  runStats.decisionSummary = decisionSummary;
  console.log(`\n📋 Decision log: ${decisionSummary.totalDecisions} decisions recorded`);

  // 6. Log run to database
  const agentRunResult = await logAgentRun(runStats);

  // 6.5. If the planner produced a plan, mark it completed and attach
  // execution summary so the monitor can grade against it.
  if (usePlanner && planRowId) {
    try {
      await completeRunPlan(
        planRowId,
        agentRunResult?.id || null,
        {
          sources_scraped: runStats.sourcesScraped,
          events_discovered: runStats.eventsDiscovered,
          events_validated: runStats.eventsValidated,
          events_added: runStats.eventsAdded,
          duplicates_skipped: runStats.duplicatesSkipped,
          inline_probe_events: runStats.inlineProbeEvents || 0,
          errors: runStats.errors,
          inner_loop: observer ? observer.getSummary() : null,
        },
        plannerCostTracker,
      );
    } catch (error) {
      console.error(`   ⚠️  Could not complete run plan: ${error.message}`);
    }
  }

  // 7. Run monitor evaluation (still end-of-cycle; planner is start-of-cycle)
  try {
    await runMonitor(agentRunResult?.id || null, { decisionSummary, runPlan, planRowId });
  } catch (error) {
    console.error('Monitor evaluation failed:', error.message);
  }

  return runStats;
}

// Run if called directly
discoverEvents()
  .then(stats => {
    console.log('\n✨ Discovery complete!');
    process.exit(stats.errors > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
