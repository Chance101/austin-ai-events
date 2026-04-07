import { config, validateConfig, isMultiTenantPlatform } from './config.js';
import { getClient } from './utils/claude.js';
import { getSupabase } from './utils/supabase.js';

const supabase = getSupabase();

/**
 * Gather all metrics from the database for evaluation
 * @param {Object} [pipelineData] - Data passed from the pipeline (decisionSummary, etc.)
 */
async function gatherMetrics(pipelineData = {}) {
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
    openActionItemsResult,
    recentReportsResult,
    pendingRepairsResult,
    lastRepairLogResult,
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

    // Open human action items (for resolution tracking)
    supabase
      .from('human_action_items')
      .select('id, title, description, severity, category, created_at, action_type, auto_fixable, repair_status')
      .eq('is_resolved', false)
      .order('created_at', { ascending: false }),

    // Previous monitor reports (last 5 for continuity)
    supabase
      .from('monitor_reports')
      .select('overall_grade, summary, findings, auto_actions, action_review, created_at')
      .order('created_at', { ascending: false })
      .limit(5),

    // Repairs awaiting verification (pushed but not yet verified by the monitor)
    supabase
      .from('repair_log')
      .select('id, action_item_id, commit_hash, branch, change_summary, test_result, pushed_at, created_at')
      .is('verification_result', null)
      .order('created_at', { ascending: false }),

    // Most recent repair_log entry (heartbeat check for outer loop)
    supabase
      .from('repair_log')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const recentRuns = recentRunsResult.data || [];
  const sources = sourcesResult.data || [];
  const upcomingEvents = upcomingEventsResult.data || [];
  const recentEvents = recentEventsResult.data || [];
  const queries = queriesResult.data || [];
  const totalEvents = allEventsCountResult.count || 0;
  const openActionItems = openActionItemsResult.data || [];
  const recentReports = recentReportsResult.data || [];
  const pendingRepairs = pendingRepairsResult.data || [];
  const lastRepairLogEntry = (lastRepairLogResult.data || [])[0] || null;

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

  // Calendar coverage: find days with no events in 30-day and 21-day windows
  const eventDays30 = new Set();
  const eventDays21 = new Set();
  const twentyOneDaysOut = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
  let upcomingCount21 = 0;
  for (const e of upcomingEvents) {
    const eventDate = new Date(e.start_time);
    const day = eventDate.toISOString().split('T')[0];
    eventDays30.add(day);
    if (eventDate <= twentyOneDaysOut) {
      eventDays21.add(day);
      upcomingCount21++;
    }
  }
  const emptyDays = [];
  const emptyDays21 = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dayStr = d.toISOString().split('T')[0];
    if (!eventDays30.has(dayStr)) emptyDays.push(dayStr);
    if (i < 21 && !eventDays21.has(dayStr)) emptyDays21.push(dayStr);
  }

  // Scraper health: % of active config sources that returned events in their last run
  const configSourceNames = new Set(['AITX', 'Austin AI Alliance', 'Capital Factory', 'AICamp', 'Austin LangChain', 'AI Automation & Marketing', 'UT Austin AI', 'Austin Forum']);
  let healthyScrapers = 0;
  let totalScrapers = 0;
  for (const [name, perf] of Object.entries(sourcePerformance)) {
    if (configSourceNames.has(name)) {
      totalScrapers++;
      // Healthy = produced events in at least one of their last runs
      if (perf.totalEvents > 0) healthyScrapers++;
    }
  }
  const scraperHealthRate = totalScrapers > 0 ? Math.round(healthyScrapers / totalScrapers * 100) : 0;

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

  // --- Layer 2: Previous action outcomes ---
  // Look up query performance for queries the monitor created in recent reports
  const previousActionOutcomes = await getActionOutcomes(recentReports, queries);

  // --- Outer loop heartbeat detection ---
  let outerLoopWarning = null;
  const outerLoopLastRun = lastRepairLogEntry ? lastRepairLogEntry.created_at : null;
  if (lastRepairLogEntry) {
    const hoursSinceLastRepair = (now - new Date(lastRepairLogEntry.created_at)) / (1000 * 60 * 60);
    const autoFixableItems = openActionItems.filter(i => i.auto_fixable === true);
    if (hoursSinceLastRepair > 48 && autoFixableItems.length > 0) {
      outerLoopWarning = `WARNING: The outer loop has not run in ${Math.round(hoursSinceLastRepair)} hours but there are ${autoFixableItems.length} auto-fixable action items pending. The scheduled Claude Code task may be down.`;
    }
  }

  return {
    timestamp: now.toISOString(),
    totalEvents,
    upcomingEventCount: upcomingEvents.length,
    upcomingEventCount21: upcomingCount21,
    recentEventsAdded: recentEvents.length,
    emptyDays,
    emptyDays21,
    contributingSources: Object.keys(sourceDistribution).length,
    sourceDistribution,
    sourcePerformance,
    trustTiers,
    avgMetrics,
    runsLast7Days: last7Runs.length,
    lastRun: recentRuns[0] || null,
    totalSources: sources.length,
    activeSources: sources.filter(s => s.trust_tier !== 'demoted').length,
    scraperHealthRate,
    healthyScrapers,
    totalScrapersTracked: totalScrapers,
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
    // Layer 2: Continuity data
    recentReports: recentReports.map(r => ({
      date: r.created_at,
      grade: r.overall_grade,
      summary: r.summary,
      findingCount: (r.findings || []).length,
      actionsTaken: (r.auto_actions || []).map(a => `${a.action}: ${a.detail} -> ${a.result}`),
    })),
    previousActionOutcomes,
    // Layer 1: Decision summary from this run
    decisionSummary: pipelineData.decisionSummary || null,
    openActionItems: openActionItems.map(i => ({
      id: i.id, title: i.title, severity: i.severity, category: i.category,
      created_at: i.created_at, action_type: i.action_type, auto_fixable: i.auto_fixable,
      repair_status: i.repair_status,
    })),
    pendingRepairs: pendingRepairs.map(r => ({
      id: r.id, action_item_id: r.action_item_id, commit_hash: r.commit_hash,
      branch: r.branch, change_summary: r.change_summary, test_result: r.test_result,
      pushed_at: r.pushed_at, created_at: r.created_at,
    })),
    outerLoopWarning,
    outerLoopLastRun,
  };
}

/**
 * Look up outcomes for queries the monitor created in recent reports.
 * This lets Opus see whether its past actions were effective.
 */
async function getActionOutcomes(recentReports, activeQueries) {
  const outcomes = [];
  const activeQueryTexts = new Map(activeQueries.map(q => [q.query_text, q]));

  for (const report of recentReports) {
    const actions = report.auto_actions || [];
    for (const action of actions) {
      if (action.action === 'create_query' || action.action === 'create_source_query') {
        const queryText = action.detail;
        const activeQuery = activeQueryTexts.get(queryText);

        if (activeQuery) {
          outcomes.push({
            action: `${action.action}: ${queryText}`,
            createdAt: report.created_at,
            status: 'active',
            timesRun: activeQuery.times_run || 0,
            sourcesFound: activeQuery.sources_found || 0,
            priority: activeQuery.priority_score,
          });
        } else if (action.result && action.result.startsWith('Failed')) {
          outcomes.push({
            action: `${action.action}: ${queryText}`,
            createdAt: report.created_at,
            status: 'failed_to_create',
            timesRun: null,
            sourcesFound: null,
            priority: null,
          });
        } else if (action.result && !action.result.startsWith('Skipped')) {
          outcomes.push({
            action: `${action.action}: ${queryText}`,
            createdAt: report.created_at,
            status: 'deactivated_or_recycled',
            timesRun: null,
            sourcesFound: null,
            priority: null,
          });
        }
      }
    }
  }

  return outcomes;
}

/**
 * Ask Claude to evaluate the system and suggest actions
 */
async function evaluateWithClaude(metrics) {
  const anthropic = getClient();

  const today = new Date().toISOString().split('T')[0];

  // Build the decision summary section
  let decisionSummarySection = '';
  if (metrics.decisionSummary) {
    decisionSummarySection = `
## This Run's Decision Log
${JSON.stringify(metrics.decisionSummary, null, 2)}
Per-source accept/reject/duplicate breakdowns, top rejection reasons, cost efficiency per source.

## Cost Efficiency (this run)
${JSON.stringify(metrics.decisionSummary.costEfficiency || {}, null, 2)}
Per-source: estimated Claude API cost vs events accepted.
`;
  }

  // Build the recent reports section
  let recentReportsSection = '';
  if (metrics.recentReports && metrics.recentReports.length > 0) {
    recentReportsSection = `
## Recent Reports (last ${metrics.recentReports.length} runs)
${JSON.stringify(metrics.recentReports, null, 2)}
Multi-run window: track grade trends, recurring findings, hypothesis outcomes. Use this to avoid repeating the same findings.
`;
  }

  // Build the action outcomes section
  let actionOutcomesSection = '';
  if (metrics.previousActionOutcomes && metrics.previousActionOutcomes.length > 0) {
    actionOutcomesSection = `
## Outcome of Previous Actions
${JSON.stringify(metrics.previousActionOutcomes, null, 2)}
Did the queries you created recently produce events? Were they recycled? Use this to learn what works.
`;
  }

  // Build system warnings section
  let systemWarnings = '';
  if (metrics.stalenessWarning) {
    systemWarnings += `\n## SYSTEM WARNING: Monitor Staleness\n${metrics.stalenessWarning}\n`;
  }
  if (metrics.outerLoopWarning) {
    systemWarnings += `\n## SYSTEM WARNING: Outer Loop Down\n${metrics.outerLoopWarning}\n`;
  }

  const prompt = `You are the strategic brain of an automated AI event calendar system (austinai.events). You run on Opus because this is the most important decision point in the system — your analysis drives what the system does next.

## System Architecture
- 10 hardcoded scrapers run on a weekly schedule, scraping Austin AI event sources (Lu.ma, Meetup, AICamp, etc.)
- Events are validated (is it real? AI-focused? in Austin?) using Haiku (fast model)
- Events are classified (audience, level) using Haiku
- Duplicates are detected via fuzzy matching + Haiku semantic comparison
- Web search (SerpAPI, 5 calls/day) finds new event sources and individual events
- Search queries in the database drive what gets searched — you control these queries
- Queries with priority below 0.05 are automatically recycled. No cap on active queries — recycling keeps the table clean.

## CRITICAL: Multi-Tenant Platform Awareness
Luma, Meetup, and Eventbrite are PLATFORMS that host many independent organizers. Each path is a completely separate source:
- luma.com/aitx and luma.com/ai-tinkerers are as different as two separate websites
- meetup.com/austin-python and meetup.com/austin-ml are separate communities
- Scraping one calendar on a platform does NOT cover any other calendar on that platform
NEVER assume a source is "already covered" because we scrape a different path on the same domain. When evaluating source coverage or deciding to skip/demote a source, match on the FULL URL path, not the domain.

## Your Role
You are the ONLY entity that creates new search queries. The system no longer auto-generates generic queries. Every query you create should be targeted and strategic, based on specific gaps you identify.

You also have MEMORY across runs. Use the recent reports and action outcomes below to track hypotheses, avoid repeating yourself, and learn from what worked.

## Today's Date: ${today}

## Current Metrics
${JSON.stringify({
    timestamp: metrics.timestamp,
    totalEvents: metrics.totalEvents,
    upcomingEventCount_30d: metrics.upcomingEventCount,
    upcomingEventCount_21d: metrics.upcomingEventCount21,
    recentEventsAdded: metrics.recentEventsAdded,
    emptyDays_30d: metrics.emptyDays,
    emptyDays_21d: metrics.emptyDays21,
    contributingSources: metrics.contributingSources,
    sourceDistribution: metrics.sourceDistribution,
    sourcePerformance: metrics.sourcePerformance,
    trustTiers: metrics.trustTiers,
    avgMetrics: metrics.avgMetrics,
    runsLast7Days: metrics.runsLast7Days,
    lastRun: metrics.lastRun,
    totalSources: metrics.totalSources,
    activeSources: metrics.activeSources,
    scraperHealthRate: metrics.scraperHealthRate,
    healthyScrapers: metrics.healthyScrapers,
    totalScrapersTracked: metrics.totalScrapersTracked,
    activeQueries: metrics.activeQueries,
    staleQueryCount: metrics.staleQueryCount,
    staleQueryNames: metrics.staleQueryNames,
    recentRunsSummary: metrics.recentRunsSummary,
    sourcesWithIssues: metrics.sourcesWithIssues,
  }, null, 2)}
${decisionSummarySection}${recentReportsSection}${actionOutcomesSection}${
    metrics.openActionItems && metrics.openActionItems.length > 0
      ? `\n## Open Human Action Items (unresolved escalations)\n${JSON.stringify(metrics.openActionItems, null, 2)}\nThese are issues you previously escalated. If the underlying issue has been fixed (based on this run's data), use resolve_action_item to close them.\n`
      : ''
  }
${
    metrics.pendingRepairs && metrics.pendingRepairs.length > 0
      ? `\n## Pending Repairs (awaiting your verification)\n${JSON.stringify(metrics.pendingRepairs, null, 2)}\nThese are code fixes pushed by the outer loop. For each, check if the symptom it targeted has resolved based on this run's data. Use verify_repair to mark each as 'verified' (fix worked) or 'failed' (symptom persists). If a repair failed, the outer loop will revert the commit on its next run.\n`
      : ''
  }${systemWarnings}## Your Task
Evaluate the system and respond with ONLY valid JSON (no markdown, no code fences):

{
  "overall_grade": "A|B|C|D|F",
  "summary": "1-2 sentence assessment focusing on what CHANGED since last evaluation, not repeating known issues",
  "findings": [
    {
      "category": "coverage|sources|pipeline|cost|reliability",
      "severity": "critical|warning|info|positive",
      "status": "new|recurring|resolved|escalated",
      "finding": "What you observed — be SPECIFIC, not generic",
      "recommendation": "Actionable next step (or null for positive findings)"
    }
  ],
  "action_review": [
    {
      "previous_action": "description of an action from a previous report",
      "outcome": "what happened as a result",
      "assessment": "effective|ineffective|pending — and what to do next"
    }
  ],
  "auto_actions": [
    {
      "type": "deactivate_query|create_query|create_source_query|boost_query|flag_source|add_source_context|escalate_to_human|resolve_action_item|skip_source|verify_repair",
      "detail": "Specific action description",
      "query_text": "for query actions, the exact search string",
      "source_url": "for source actions, the URL",
      "context": "for add_source_context, the validation guidance text",
      "reason": "Why this specific action, not a generic one",
      "action_item_id": "for resolve_action_item: the UUID from Open Human Action Items",
      "severity": "for escalate_to_human: critical|warning|info",
      "category": "for escalate_to_human: broken_scraper|new_platform|strategy|data_quality",
      "title": "for escalate_to_human: short title for the action item",
      "description": "for escalate_to_human: detailed description",
      "suggested_fix": "for escalate_to_human: what the human or outer loop should do",
      "action_type": "for escalate_to_human: code_change|config_change|investigation|strategic — what kind of fix is needed",
      "affected_files": "for escalate_to_human: array of file paths the fix likely involves, e.g. ['agent/src/sources/meetup.js']",
      "auto_fixable": "for escalate_to_human: boolean — true if this could be fixed by an automated code repair loop, false if it needs human judgment",
      "repair_id": "for verify_repair: UUID from Pending Repairs list",
      "verification_result": "for verify_repair: 'verified' (fix worked) or 'failed' (symptom persists)",
      "verification_notes": "for verify_repair: brief explanation of why you marked it verified or failed"
    }
  ]
}

## Grading Criteria (infrastructure health)
The grade measures AGENT EFFECTIVENESS — how well the system is doing its job of discovering and curating events.
It does NOT measure how many events the Austin AI community happens to have scheduled. Event count and empty days are outside the agent's control — a quiet month with all scrapers healthy is an A, not a C.
Grade on infrastructure health metrics (scraperHealthRate, error rate, contributing sources), NOT on event counts or empty days. Event counts are useful context for your findings and coverage mission, but they do not determine the grade.
- A: 80%+ scrapers healthy, <5% error rate, 4+ contributing sources, events added in last 7 days
- B: 60-79% scrapers healthy, <10% error rate, 3+ contributing sources
- C: 40-59% scrapers healthy, or >10% error rate, or <3 contributing sources
- D: <40% scrapers healthy, or multiple consecutive zero-add runs caused by broken scrapers
- F: System not running or fully broken

## Coverage Mission (separate from grade)
Your grade reflects infrastructure health, but you also have a standing mission: MAXIMIZE CALENDAR COVERAGE.
Even when the grade is A, actively look for ways to find more events:
- If contributing sources drop, create source discovery queries
- If a week has very few events, investigate whether events exist that we're not finding
- If a new platform or community appears in Austin, flag it for source discovery
Coverage observations belong in your findings as "info" severity — they inform your actions but do not affect the grade.
The key distinction: "our scrapers are broken" (grade issue) vs "the community is quiet this month" (coverage observation, not a grade issue).

## CRITICAL Guidelines for Findings
- Use the "status" field: "new" for first-time observations, "recurring" if seen in recent reports, "resolved" if a previously flagged issue is now fixed, "escalated" if recurring and worsening
- Do NOT repeat the same generic observations every day (e.g., "coverage is poor", "3 sources returning zero")
- If you've flagged an issue before and nothing changed, note it's RECURRING and escalate severity
- Focus on what's DIFFERENT from previous runs
- Be specific: name the sources, the dates, the numbers
- Identify ROOT CAUSES, not symptoms

## action_review
Review your previous actions (shown in "Outcome of Previous Actions" above). For each, assess whether it was effective and what to do next. This is how you learn.

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

- **add_source_context**: Write per-source guidance to tune validation behavior.
  Use when a source has a high rejection rate for a predictable, fixable reason.
  Example: source_url="https://meetup.com/austin-python", context="Events from Austin Python Meetup are always held in Austin, TX. Focus validation on AI/ML relevance, not location."
  This context gets injected into the Haiku validation prompt for events from that source.

- **escalate_to_human**: Create a persistent action item for issues you can't fix.
  Use for: broken scrapers needing code changes, new platform types, strategic decisions, data quality issues needing manual review.
  Include severity, category, title, description, and suggested_fix.

- **skip_source**: Permanently skip a DB-discovered source (probation/trusted) that is no longer producing value.
  Use for: sources with sustained 0% pass rate, wrong-city events, one-time conferences that have ended, dead groups.
  Sets trust_tier to 'demoted'. If the source becomes active again in the future, web search will rediscover it.
  Provide source_url. IMPORTANT: You may ONLY skip DB-discovered sources (probation/trusted tier).
  For config sources, use escalate_to_human instead — config sources were manually vetted and require human review.
  NEVER skip a source because "it's already covered by another source on the same platform." luma.com/org-a and luma.com/org-b are completely independent sources. Match on full URL path, not domain.

- **resolve_action_item**: Mark a previously escalated action item as resolved.
  Use when the underlying issue has been fixed (you can see this in the current run's data).
  Provide the action_item_id from the "Open Human Action Items" list above.

- **verify_repair**: Verify whether an outer loop repair worked or failed.
  Check the "Pending Repairs" section — for each repair, examine this run's data to see if the targeted symptom resolved.
  Provide repair_id, verification_result ('verified' or 'failed'), and verification_notes.
  If 'failed', the outer loop will revert the commit on its next run.

- Maximum 5 auto-actions per evaluation
- Before creating a query, check if a similar one exists in the active queries list
- Every query should target a SPECIFIC gap (date range, event type, platform, community)`;

  const response = await anthropic.messages.create({
    model: config.models.strategic,
    max_tokens: 4096,
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
async function executeAutoActions(actions, reportId) {
  const results = [];

  for (const action of (actions || []).slice(0, 5)) {
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
          const { error } = await supabase
            .from('search_queries')
            .insert({
              query_text: action.query_text,
              query_type: queryType,
              priority_score: isSourceQuery ? 1.0 : 0.7,
              is_active: true,
              created_by: 'agent',
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

        case 'add_source_context': {
          if (!action.source_url || !action.context) {
            results.push({
              action: 'add_source_context',
              detail: action.source_url || 'unknown',
              result: 'Skipped (missing source_url or context)',
            });
            break;
          }
          const { error } = await supabase
            .from('sources')
            .update({ validation_context: action.context })
            .eq('url', action.source_url);
          results.push({
            action: 'add_source_context',
            detail: action.source_url,
            result: error ? `Failed: ${error.message}` : `Context set: "${action.context.substring(0, 80)}..."`,
          });
          break;
        }

        case 'escalate_to_human': {
          if (!action.title || !action.description) {
            results.push({
              action: 'escalate_to_human',
              detail: action.title || 'unknown',
              result: 'Skipped (missing title or description)',
            });
            break;
          }
          const { error } = await supabase
            .from('human_action_items')
            .insert({
              severity: action.severity || 'info',
              category: action.category || 'general',
              title: action.title,
              description: action.description,
              suggested_fix: action.suggested_fix || null,
              monitor_report_id: reportId || null,
              action_type: action.action_type || 'investigation',
              affected_files: action.affected_files || null,
              auto_fixable: action.auto_fixable || false,
            });
          results.push({
            action: 'escalate_to_human',
            detail: action.title,
            result: error ? `Failed: ${error.message}` : `Created action item (${action.action_type || 'investigation'}, auto_fixable=${action.auto_fixable || false})`,
          });
          break;
        }

        case 'skip_source': {
          if (!action.source_url) {
            results.push({
              action: 'skip_source',
              detail: action.detail || 'unknown',
              result: 'Skipped (missing source_url)',
            });
            break;
          }
          // Guardrail 1: Only allow skipping non-config sources
          const { data: srcToSkip } = await supabase
            .from('sources')
            .select('trust_tier, name')
            .eq('url', action.source_url)
            .single();
          if (srcToSkip?.trust_tier === 'config') {
            results.push({
              action: 'skip_source',
              detail: srcToSkip.name || action.source_url,
              result: 'Blocked: config sources require escalate_to_human',
            });
            break;
          }
          // Guardrail 2: Don't skip sources that produced accepted events in last 28 days
          // For multi-tenant platforms (Luma, Meetup, Eventbrite), match on URL path prefix
          // not just domain — luma.com/aitx events should not block demoting luma.com/other-org
          const twentyEightDaysAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
          const urlForMatch = isMultiTenantPlatform(action.source_url)
            ? new URL(action.source_url).hostname.replace(/^www\./, '') + new URL(action.source_url).pathname.replace(/\/$/, '')
            : new URL(action.source_url).hostname;
          const { count: recentEventCount } = await supabase
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('source', 'web-search')
            .gte('created_at', twentyEightDaysAgo)
            .ilike('url', `%${urlForMatch}%`);
          if (recentEventCount > 0) {
            results.push({
              action: 'skip_source',
              detail: srcToSkip?.name || action.source_url,
              result: `Blocked: source produced ${recentEventCount} accepted event(s) in last 28 days`,
            });
            break;
          }
          const { error } = await supabase
            .from('sources')
            .update({
              trust_tier: 'demoted',
              is_trusted: false,
              demoted_at: new Date().toISOString(),
            })
            .eq('url', action.source_url);
          results.push({
            action: 'skip_source',
            detail: srcToSkip?.name || action.source_url,
            result: error ? `Failed: ${error.message}` : 'Source demoted — will no longer be scraped',
          });
          break;
        }

        case 'verify_repair': {
          if (!action.repair_id || !action.verification_result) {
            results.push({
              action: 'verify_repair',
              detail: action.repair_id || 'unknown',
              result: 'Skipped (missing repair_id or verification_result)',
            });
            break;
          }
          // Update repair_log with verification result
          const { error: repairError } = await supabase
            .from('repair_log')
            .update({
              verified_at: new Date().toISOString(),
              verification_result: action.verification_result,
            })
            .eq('id', action.repair_id);
          if (repairError) {
            results.push({
              action: 'verify_repair',
              detail: action.repair_id,
              result: `Failed: ${repairError.message}`,
            });
            break;
          }
          // Get the repair to find the linked action item
          const { data: repair } = await supabase
            .from('repair_log')
            .select('action_item_id, commit_hash')
            .eq('id', action.repair_id)
            .single();
          if (repair?.action_item_id) {
            if (action.verification_result === 'verified') {
              // Mark action item as resolved
              await supabase
                .from('human_action_items')
                .update({ repair_status: 'verified', is_resolved: true })
                .eq('id', repair.action_item_id);
            } else {
              // Mark action item repair as failed — outer loop will revert
              await supabase
                .from('human_action_items')
                .update({ repair_status: 'failed' })
                .eq('id', repair.action_item_id);
            }
          }
          results.push({
            action: 'verify_repair',
            detail: `${repair?.commit_hash?.substring(0, 7) || action.repair_id}: ${action.verification_result}`,
            result: `${action.verification_result} — ${action.verification_notes || 'no notes'}`,
          });
          break;
        }

        case 'resolve_action_item': {
          if (!action.action_item_id) {
            results.push({
              action: 'resolve_action_item',
              detail: action.detail || 'unknown',
              result: 'Skipped (missing action_item_id)',
            });
            break;
          }
          const { error } = await supabase
            .from('human_action_items')
            .update({ is_resolved: true, resolved_at: new Date().toISOString() })
            .eq('id', action.action_item_id)
            .eq('is_resolved', false);
          results.push({
            action: 'resolve_action_item',
            detail: action.detail || action.action_item_id,
            result: error ? `Failed: ${error.message}` : 'Resolved',
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
async function storeReport(evaluation, metrics, autoActionResults, agentRunId, decisionSummary) {
  const { data, error } = await supabase
    .from('monitor_reports')
    .insert({
      overall_grade: evaluation.overall_grade,
      summary: evaluation.summary,
      findings: evaluation.findings || [],
      auto_actions: autoActionResults || [],
      action_review: evaluation.action_review || [],
      decision_summary: decisionSummary || {},
      metrics,
      agent_run_id: agentRunId || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to store monitor report:', error.message);
    return null;
  }

  return data?.id || null;
}

/**
 * Run the monitor evaluation
 * @param {string|null} agentRunId - UUID of the agent run that triggered this (optional)
 * @param {Object} [pipelineData] - Data passed from the pipeline (decisionSummary, etc.)
 */
export async function runMonitor(agentRunId = null, pipelineData = {}) {
  console.log('\n' + '='.repeat(50));
  console.log('MONITOR: SYSTEM EVALUATION');
  console.log('='.repeat(50) + '\n');

  // Step 1: Gather metrics (now includes recent reports + action outcomes + decision summary)
  console.log('  Gathering metrics...');
  const metrics = await gatherMetrics(pipelineData);
  console.log(`  Calendar: ${metrics.upcomingEventCount21} events in 21d (${metrics.emptyDays21.length} empty), ${metrics.upcomingEventCount} in 30d (${metrics.emptyDays.length} empty)`);
  console.log(`  Sources: ${metrics.activeSources} active, ${metrics.sourcesWithIssues.length} with issues`);
  console.log(`  Last 7 days: ${metrics.runsLast7Days} runs, ${metrics.recentEventsAdded} events added`);
  if (metrics.recentReports.length > 0) {
    console.log(`  Memory: ${metrics.recentReports.length} recent reports, ${metrics.previousActionOutcomes.length} action outcomes tracked`);
  }
  if (metrics.decisionSummary) {
    console.log(`  Decision log: ${metrics.decisionSummary.totalDecisions} decisions from this run`);
  }
  if (metrics.pendingRepairs.length > 0) {
    console.log(`  Pending verification: ${metrics.pendingRepairs.length} repair(s) awaiting monitor verification`);
    for (const r of metrics.pendingRepairs) {
      console.log(`    - ${r.commit_hash.substring(0, 7)}: ${r.change_summary.substring(0, 80)} (test: ${r.test_result})`);
    }
  }

  // Step 1.5: Staleness detection
  if (metrics.recentReports.length >= 5) {
    const latestGrade = metrics.recentReports[0].grade;
    let consecutiveSameGrade = 0;
    for (const report of metrics.recentReports) {
      if (report.grade === latestGrade) {
        consecutiveSameGrade++;
      } else {
        break;
      }
    }
    if (consecutiveSameGrade >= 5) {
      // Check if summaries are substantially similar (first 100 chars match)
      const latestPrefix = (metrics.recentReports[0].summary || '').substring(0, 100);
      let similarSummaries = 0;
      for (const report of metrics.recentReports) {
        if ((report.summary || '').substring(0, 100) === latestPrefix) {
          similarSummaries++;
        } else {
          break;
        }
      }
      if (similarSummaries >= 5) {
        metrics.stalenessWarning = `WARNING: Grade has been ${latestGrade} for ${consecutiveSameGrade} consecutive reports with similar findings. The system may be stuck. Consider whether the grading criteria, monitor prompt, or action pipeline needs adjustment.`;
        console.log(`  ⚠️  Staleness detected: grade ${latestGrade} unchanged for ${consecutiveSameGrade} reports`);
      }
    }
  }

  // Step 1.6: Outer loop heartbeat logging
  if (metrics.outerLoopWarning) {
    console.log(`  ⚠️  Outer loop: ${metrics.outerLoopWarning}`);
  }

  // Step 2: Claude evaluation
  console.log('\n  Evaluating with Claude...');
  const evaluation = await evaluateWithClaude(metrics);
  console.log(`  Grade: ${evaluation.overall_grade}`);
  console.log(`  Summary: ${evaluation.summary}`);

  // Step 3: Store report first (to get reportId for escalation actions)
  console.log('\n  Storing report...');
  const reportId = await storeReport(evaluation, metrics, [], agentRunId, pipelineData.decisionSummary);

  // Step 4: Execute auto-actions (with reportId for escalation linking)
  let autoActionResults = [];
  if (evaluation.auto_actions && evaluation.auto_actions.length > 0) {
    console.log(`\n  Executing ${evaluation.auto_actions.length} auto-actions...`);
    autoActionResults = await executeAutoActions(evaluation.auto_actions, reportId);
    for (const result of autoActionResults) {
      console.log(`    ${result.action}: ${result.detail} -> ${result.result}`);
    }

    // Update the report with action results
    if (reportId) {
      await supabase
        .from('monitor_reports')
        .update({ auto_actions: autoActionResults })
        .eq('id', reportId);
    }
  } else {
    console.log('\n  No auto-actions needed.');
  }

  // Step 5: Print findings
  console.log('\n  Findings:');
  for (const f of evaluation.findings || []) {
    const icon = { critical: '!!!', warning: '!!', info: '--', positive: '++' }[f.severity] || '--';
    const status = f.status ? ` [${f.status.toUpperCase()}]` : '';
    console.log(`    [${icon}]${status} ${f.category}: ${f.finding}`);
    if (f.recommendation) {
      console.log(`         -> ${f.recommendation}`);
    }
  }

  // Step 5.5: Print action review if present
  if (evaluation.action_review && evaluation.action_review.length > 0) {
    console.log('\n  Action Review:');
    for (const r of evaluation.action_review) {
      console.log(`    ${r.previous_action}`);
      console.log(`      Outcome: ${r.outcome}`);
      console.log(`      Assessment: ${r.assessment}`);
    }
  }

  console.log('\n  Report saved.');

  // Step 6: Oscillation detection — freeze action items with 3+ failed repair attempts
  const { data: frozenCandidates } = await supabase
    .from('human_action_items')
    .select('id, title, attempt_count, repair_status')
    .eq('is_resolved', false)
    .gte('attempt_count', 3)
    .eq('repair_status', 'failed');

  if (frozenCandidates && frozenCandidates.length > 0) {
    console.log(`\n  Oscillation check: ${frozenCandidates.length} item(s) with 3+ failed repairs`);
    for (const item of frozenCandidates) {
      // Mark as rolled_back to prevent further attempts
      await supabase
        .from('human_action_items')
        .update({ repair_status: 'rolled_back' })
        .eq('id', item.id);
      console.log(`    Frozen: "${item.title}" (${item.attempt_count} attempts) — needs human intervention`);
    }
  }

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
