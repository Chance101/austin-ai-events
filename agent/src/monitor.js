import { config, validateConfig } from './config.js';
import { getClient } from './utils/claude.js';
import { getSupabase } from './utils/supabase.js';

const supabase = getSupabase();

/**
 * Gather all metrics from the database for evaluation
 */
async function gatherMetrics() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all data in parallel
  const [
    recentRunsResult,
    sourcesResult,
    upcomingEventsResult,
    recentEventsResult,
    queriesResult,
    allEventsCountResult,
  ] = await Promise.all([
    // Last 30 agent runs
    supabase
      .from('agent_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(30),

    // All sources
    supabase
      .from('sources')
      .select('*')
      .order('created_at', { ascending: false }),

    // Upcoming events (on the calendar right now)
    supabase
      .from('events')
      .select('id, title, start_time, source, created_at')
      .gte('start_time', now.toISOString())
      .lte('start_time', new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('start_time', { ascending: true }),

    // Events added in last 7 days
    supabase
      .from('events')
      .select('id, title, start_time, source, created_at')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false }),

    // Active search queries
    supabase
      .from('search_queries')
      .select('*')
      .eq('is_active', true)
      .order('priority_score', { ascending: false }),

    // Total event count
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true }),
  ]);

  const recentRuns = recentRunsResult.data || [];
  const sources = sourcesResult.data || [];
  const upcomingEvents = upcomingEventsResult.data || [];
  const recentEvents = recentEventsResult.data || [];
  const queries = queriesResult.data || [];
  const totalEvents = allEventsCountResult.count || 0;

  // Compute derived metrics
  const last7Runs = recentRuns.filter(r =>
    new Date(r.started_at) >= new Date(sevenDaysAgo)
  );

  // Source performance from recent runs
  const sourcePerformance = {};
  for (const run of recentRuns.slice(0, 14)) {
    const results = run.source_results || [];
    for (const sr of results) {
      if (!sourcePerformance[sr.name]) {
        sourcePerformance[sr.name] = { totalEvents: 0, runs: 0, zeroRuns: 0 };
      }
      sourcePerformance[sr.name].totalEvents += sr.events || 0;
      sourcePerformance[sr.name].runs++;
      if ((sr.events || 0) === 0) sourcePerformance[sr.name].zeroRuns++;
    }
  }

  // Calendar coverage: find days in next 30 days with no events
  const eventDays = new Set();
  for (const e of upcomingEvents) {
    const day = new Date(e.start_time).toISOString().split('T')[0];
    eventDays.add(day);
  }
  const emptyDays = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dayStr = d.toISOString().split('T')[0];
    if (!eventDays.has(dayStr)) emptyDays.push(dayStr);
  }

  // Source distribution of upcoming events
  const sourceDistribution = {};
  for (const e of upcomingEvents) {
    sourceDistribution[e.source] = (sourceDistribution[e.source] || 0) + 1;
  }

  // Average metrics from recent runs
  const avgMetrics = last7Runs.length > 0 ? {
    avgDiscovered: Math.round(last7Runs.reduce((s, r) => s + (r.events_discovered || 0), 0) / last7Runs.length),
    avgValidated: Math.round(last7Runs.reduce((s, r) => s + (r.events_validated || 0), 0) / last7Runs.length),
    avgAdded: Math.round(last7Runs.reduce((s, r) => s + (r.events_added || 0), 0) / last7Runs.length * 10) / 10,
    avgDuplicates: Math.round(last7Runs.reduce((s, r) => s + (r.duplicates_skipped || 0), 0) / last7Runs.length),
    avgErrors: Math.round(last7Runs.reduce((s, r) => s + (r.errors || 0), 0) / last7Runs.length * 10) / 10,
    avgClaudeCalls: Math.round(last7Runs.reduce((s, r) => s + (r.claude_api_calls || 0), 0) / last7Runs.length),
    avgDurationSecs: Math.round(last7Runs.reduce((s, r) => s + (r.run_duration_seconds || 0), 0) / last7Runs.length),
    totalAdded7d: last7Runs.reduce((s, r) => s + (r.events_added || 0), 0),
    totalErrors7d: last7Runs.reduce((s, r) => s + (r.errors || 0), 0),
  } : null;

  // Trust tier breakdown
  const trustTiers = { config: 0, trusted: 0, probation: 0, demoted: 0 };
  for (const s of sources) {
    const tier = s.trust_tier || 'probation';
    trustTiers[tier] = (trustTiers[tier] || 0) + 1;
  }

  // Stale queries (low priority, many runs, no recent success)
  const staleQueries = queries.filter(q =>
    q.priority_score < 0.2 && q.times_used >= 3
  );

  return {
    timestamp: now.toISOString(),
    totalEvents,
    upcomingEventCount: upcomingEvents.length,
    recentEventsAdded: recentEvents.length,
    emptyDays,
    sourceDistribution,
    sourcePerformance,
    trustTiers,
    avgMetrics,
    runsLast7Days: last7Runs.length,
    lastRun: recentRuns[0] || null,
    totalSources: sources.length,
    activeSources: sources.filter(s => s.trust_tier !== 'demoted').length,
    activeQueries: queries.length,
    staleQueryCount: staleQueries.length,
    staleQueryNames: staleQueries.slice(0, 5).map(q => q.query_text),
    // Include raw data for Claude's analysis
    recentRunsSummary: recentRuns.slice(0, 10).map(r => ({
      date: r.started_at,
      discovered: r.events_discovered,
      validated: r.events_validated,
      added: r.events_added,
      duplicates: r.duplicates_skipped,
      errors: r.errors,
      errorMessages: (r.error_messages || []).slice(0, 3),
      claudeCalls: r.claude_api_calls,
      durationSecs: r.run_duration_seconds,
    })),
    sourcesWithIssues: sources
      .filter(s => s.consecutive_empty_scrapes >= 2 || (s.validation_fail_count > s.validation_pass_count && s.validation_fail_count >= 3))
      .map(s => ({
        name: s.name,
        url: s.url,
        tier: s.trust_tier,
        emptyStreak: s.consecutive_empty_scrapes,
        passRate: s.validation_pass_count + s.validation_fail_count > 0
          ? Math.round(s.validation_pass_count / (s.validation_pass_count + s.validation_fail_count) * 100)
          : null,
      })),
  };
}

/**
 * Ask Claude to evaluate the system and suggest actions
 */
async function evaluateWithClaude(metrics) {
  const anthropic = getClient();

  const today = new Date().toISOString().split('T')[0];
  const prompt = `You are the strategic brain of an automated AI event calendar system (austinai.events). You run on Opus because this is the most important decision point in the system — your analysis drives what the system does next.

## System Architecture
- 10 hardcoded scrapers run daily, scraping Austin AI event sources (Lu.ma, Meetup, AICamp, etc.)
- Events are validated (is it real? AI-focused? in Austin?) using Haiku (fast model)
- Events are classified (audience, level) using Haiku
- Duplicates are detected via fuzzy matching + Haiku semantic comparison
- Web search (SerpAPI, 5 calls/day) finds new event sources and individual events
- Search queries in the database drive what gets searched — you control these queries
- The query table has a 50-query cap. Underperforming queries are now aggressively recycled.

## Your Role
You are the ONLY entity that creates new search queries. The system no longer auto-generates generic queries. Every query you create should be targeted and strategic, based on specific gaps you identify.

## Today's Date: ${today}

## Current Metrics
${JSON.stringify(metrics, null, 2)}

## Your Task
Evaluate the system and respond with ONLY valid JSON (no markdown, no code fences):

{
  "overall_grade": "A|B|C|D|F",
  "summary": "1-2 sentence assessment focusing on what CHANGED since last evaluation, not repeating known issues",
  "findings": [
    {
      "category": "coverage|sources|pipeline|cost|reliability",
      "severity": "critical|warning|info|positive",
      "finding": "What you observed — be SPECIFIC, not generic",
      "recommendation": "Actionable next step (or null for positive findings)"
    }
  ],
  "auto_actions": [
    {
      "type": "deactivate_query|create_query|create_source_query|boost_query|flag_source",
      "detail": "Specific action description",
      "query_text": "for query actions, the exact search string",
      "source_url": "for source actions, the URL",
      "reason": "Why this specific action, not a generic one"
    }
  ]
}

## Grading Criteria
- A: 20+ upcoming events, <10 empty days, diverse sources, <5% error rate
- B: 15-20 upcoming events, <15 empty days, sources mostly healthy
- C: 10-15 upcoming events, 15-20 empty days, some source issues
- D: <10 upcoming events, 20+ empty days, multiple broken sources
- F: System producing no value

## CRITICAL Guidelines for Findings
- Do NOT repeat the same generic observations every day (e.g., "coverage is poor", "3 sources returning zero")
- If you've flagged an issue before and nothing changed, note it's RECURRING and escalate severity
- Focus on what's DIFFERENT from previous runs
- Be specific: name the sources, the dates, the numbers
- Identify ROOT CAUSES, not symptoms

## Guidelines for auto_actions (STRATEGIC)
You are the sole query strategist. Every query you create must be purposeful:

- **create_query** (event_search): Find specific events for specific date gaps
  BAD: "Austin AI events 2026" (too generic, will return noise)
  GOOD: "Austin AI meetup March 2026 site:lu.ma OR site:meetup.com" (targeted, specific timeframe)
  GOOD: "Capital Factory AI events March" (specific venue + topic + timeframe)

- **create_source_query** (source_discovery): Find NEW listing pages we should scrape
  BAD: "Austin artificial intelligence events" (generic, already tried)
  GOOD: "Austin AI community calendar site:lu.ma" (specific platform)
  GOOD: "Austin machine learning group events site:meetup.com" (specific platform + topic)

- **deactivate_query**: Remove queries that aren't earning their keep
- **boost_query**: Revive a query that found something before but priority decayed
- **flag_source**: Flag a broken source with SPECIFIC diagnosis of what's wrong

- Maximum 3 auto-actions per evaluation
- Before creating a query, check if a similar one exists in the active queries list
- Every query should target a SPECIFIC gap (date range, event type, platform, community)`;

  const response = await anthropic.messages.create({
    model: config.models.strategic,
    max_tokens: 2048,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();

  try {
    return JSON.parse(text);
  } catch {
    // Try extracting JSON from potential markdown wrapping
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error(`Failed to parse Claude evaluation response: ${text.substring(0, 200)}`);
  }
}

/**
 * Execute safe auto-actions
 */
async function executeAutoActions(actions) {
  const results = [];

  for (const action of (actions || []).slice(0, 3)) {
    try {
      switch (action.type) {
        case 'deactivate_query': {
          if (!action.query_text) break;
          const { error } = await supabase
            .from('search_queries')
            .update({ is_active: false })
            .eq('query_text', action.query_text)
            .eq('is_active', true);
          results.push({
            action: 'deactivate_query',
            detail: action.query_text,
            result: error ? `Failed: ${error.message}` : 'Done',
          });
          break;
        }

        case 'create_source_query':
        case 'create_query': {
          if (!action.query_text) break;
          const isSourceQuery = action.type === 'create_source_query';
          const queryType = isSourceQuery ? 'source_discovery' : 'event_search';
          // Check if query already exists
          const { data: existing } = await supabase
            .from('search_queries')
            .select('id')
            .eq('query_text', action.query_text)
            .limit(1);
          if (existing && existing.length > 0) {
            results.push({
              action: action.type,
              detail: action.query_text,
              result: 'Skipped (already exists)',
            });
            break;
          }
          // Recycle underperforming queries before checking the cap
          const { data: staleQueries } = await supabase
            .from('search_queries')
            .select('id, query_text, times_run, sources_found, priority_score')
            .eq('is_active', true);
          const recyclable = (staleQueries || []).filter(q =>
            (q.times_run >= 2 && q.sources_found === 0 && q.priority_score < 0.3) ||
            (q.times_run >= 5 && q.priority_score < 0.15)
          );
          if (recyclable.length > 0) {
            for (const q of recyclable) {
              await supabase.from('search_queries').update({ is_active: false }).eq('id', q.id);
            }
            console.log(`    Recycled ${recyclable.length} underperforming queries to make room`);
          }
          // Check active query count
          const { count } = await supabase
            .from('search_queries')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true);
          if (count >= 50) {
            results.push({
              action: action.type,
              detail: action.query_text,
              result: 'Skipped (at 50 query cap)',
            });
            break;
          }
          const { error } = await supabase
            .from('search_queries')
            .insert({
              query_text: action.query_text,
              query_type: queryType,
              priority_score: isSourceQuery ? 1.0 : 0.7,
              is_active: true,
            });
          results.push({
            action: action.type,
            detail: action.query_text,
            result: error ? `Failed: ${error.message}` : `Created (${queryType})`,
          });
          break;
        }

        case 'boost_query': {
          if (!action.query_text) break;
          const { error } = await supabase
            .from('search_queries')
            .update({ priority_score: 0.8 })
            .eq('query_text', action.query_text)
            .eq('is_active', true);
          results.push({
            action: 'boost_query',
            detail: action.query_text,
            result: error ? `Failed: ${error.message}` : 'Boosted to 0.8',
          });
          break;
        }

        case 'flag_source': {
          // Just log it — don't actually change anything
          results.push({
            action: 'flag_source',
            detail: action.source_url || action.detail,
            result: `Flagged: ${action.reason}`,
          });
          break;
        }

        default:
          results.push({
            action: action.type,
            detail: action.detail,
            result: 'Skipped (unknown action type)',
          });
      }
    } catch (err) {
      results.push({
        action: action.type,
        detail: action.detail || 'unknown',
        result: `Error: ${err.message}`,
      });
    }
  }

  return results;
}

/**
 * Store the report in the database
 */
async function storeReport(evaluation, metrics, autoActionResults, agentRunId) {
  const { error } = await supabase
    .from('monitor_reports')
    .insert({
      overall_grade: evaluation.overall_grade,
      summary: evaluation.summary,
      findings: evaluation.findings || [],
      auto_actions: autoActionResults || [],
      metrics,
      agent_run_id: agentRunId || null,
    });

  if (error) {
    console.error('Failed to store monitor report:', error.message);
  }
}

/**
 * Run the monitor evaluation
 * @param {string|null} agentRunId - UUID of the agent run that triggered this (optional)
 */
export async function runMonitor(agentRunId = null) {
  console.log('\n' + '='.repeat(50));
  console.log('MONITOR: SYSTEM EVALUATION');
  console.log('='.repeat(50) + '\n');

  // Step 1: Gather metrics
  console.log('  Gathering metrics...');
  const metrics = await gatherMetrics();
  console.log(`  Calendar: ${metrics.upcomingEventCount} upcoming events, ${metrics.emptyDays.length} empty days in next 30`);
  console.log(`  Sources: ${metrics.activeSources} active, ${metrics.sourcesWithIssues.length} with issues`);
  console.log(`  Last 7 days: ${metrics.runsLast7Days} runs, ${metrics.recentEventsAdded} events added`);

  // Step 2: Claude evaluation
  console.log('\n  Evaluating with Claude...');
  const evaluation = await evaluateWithClaude(metrics);
  console.log(`  Grade: ${evaluation.overall_grade}`);
  console.log(`  Summary: ${evaluation.summary}`);

  // Step 3: Execute auto-actions
  let autoActionResults = [];
  if (evaluation.auto_actions && evaluation.auto_actions.length > 0) {
    console.log(`\n  Executing ${evaluation.auto_actions.length} auto-actions...`);
    autoActionResults = await executeAutoActions(evaluation.auto_actions);
    for (const result of autoActionResults) {
      console.log(`    ${result.action}: ${result.detail} -> ${result.result}`);
    }
  } else {
    console.log('\n  No auto-actions needed.');
  }

  // Step 4: Print findings
  console.log('\n  Findings:');
  for (const f of evaluation.findings || []) {
    const icon = { critical: '!!!', warning: '!!', info: '--', positive: '++' }[f.severity] || '--';
    console.log(`    [${icon}] ${f.category}: ${f.finding}`);
    if (f.recommendation) {
      console.log(`         -> ${f.recommendation}`);
    }
  }

  // Step 5: Store report
  console.log('\n  Storing report...');
  await storeReport(evaluation, metrics, autoActionResults, agentRunId);
  console.log('  Report saved.');

  console.log('\n' + '='.repeat(50));

  return { evaluation, metrics, autoActionResults };
}

// Run standalone if called directly
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('/monitor.js') ||
  process.argv[1].endsWith('\\monitor.js')
);

if (isDirectRun) {
  validateConfig();
  runMonitor()
    .then(({ evaluation }) => {
      console.log(`\nMonitor complete. Grade: ${evaluation.overall_grade}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Monitor failed:', error);
      process.exit(1);
    });
}
