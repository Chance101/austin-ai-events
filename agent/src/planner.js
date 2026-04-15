/**
 * Phase 1 — Monitor-as-planner.
 *
 * Runs at the START of each cycle. Produces a structured runPlan that
 * tells the pipeline what to scrape and what to search this run. The
 * pipeline reads the plan and executes it. The monitor (still at end
 * of cycle) grades against the plan: "did what was planned happen?"
 *
 * This is the paradigm shift from the 2026-04-08 five-agent analysis:
 * intelligence drives execution instead of auditing it after the fact.
 *
 * Feature flag: process.env.USE_PLANNER === '1'. When unset, the
 * pipeline uses the existing day-of-week schedule and this module is
 * never imported by the main path.
 *
 * Option C guardrails baked in:
 *   - Floor rule: every config source scraped ≥ 1 time per 7 days.
 *     Enforced STRUCTURALLY in applyFloorRule() below, not just prompt
 *     guidance, so the planner cannot starve a config source even if
 *     it wants to.
 *   - Cost cap: MAX_DAILY_ANTHROPIC_SPEND_USD from config.js is shown
 *     to the planner as "you have $X of budget remaining" and the
 *     planner's own Opus call is blocked if budget exhausted.
 *   - Monitor coupling: the planner writes a runPlan row to run_plans
 *     table; monitor.js reads it at end of run and grades against it.
 */

import { config, MAX_DAILY_ANTHROPIC_SPEND_USD } from './config.js';
import { gatherMetrics } from './monitor.js';
import { getClient } from './utils/claude.js';
import { getSupabase, isReadOnlyMode } from './utils/supabase.js';
import { createCostTracker } from './utils/costTracker.js';
import {
  writePredictions,
  getExpiredPendingExperiments,
  recordEvaluation,
  getRecentOutcomes,
  getConfidenceSummary,
} from './utils/experimentLog.js';

const DAYS_IN_MS = 24 * 60 * 60 * 1000;
const FLOOR_WINDOW_DAYS = 7;

/**
 * Architectural self-knowledge injected into the planner's prompt.
 * The planner can reason about what the system is CAPABLE OF, not just
 * what the metrics say. This is the #4 gap from the 5-agent analysis:
 * "The monitor lacks self-knowledge. It doesn't know what parsers exist,
 * how source routing works, or what its own system is capable of."
 */
const ARCHITECTURAL_CONTEXT = `
## System Capabilities (things you can reason about, not just observe)

### Parsers available
The pipeline has dedicated parsers for these platforms:
- **luma** (luma.js) — handles Luma event pages AND Luma city pages via JSON-LD and __NEXT_DATA__. Fixed 2026-04-15 to support city-wide pages like luma.com/austin.
- **meetup** (meetup.js) — Meetup group event pages via __NEXT_DATA__ Apollo state.
- **generic** (generic.js) — fallback Cheerio-based parser with JSON-LD and __NEXT_DATA__ fallback. Works for many simple WordPress/custom sites. NOT a Luma replacement.
- **austinforum, austinai, aicamp, capitalfactory, utaustin** — hand-built parsers for specific community sites.

### Parser routing (Phase 0, 2026-04-15)
A routeToParser(url) function checks URL domain and dispatches to the
right parser BEFORE scrapeType is honored. lu.ma/* and luma.com/* always
use the Luma parser regardless of how the source was evaluated. You never
need to worry about "will the wrong parser be used" for platform URLs.

### Inline probing (Phase 0, 2026-04-15)
When web search discovers a URL, it's probed IN THE SAME RUN via
probeUrl(). There is no more probation queue waiting on a rotation. If
you want a URL tested, it gets tested immediately.

### Source lifecycle
- Config sources (8 total): AITX, Austin AI Alliance, Capital Factory,
  AICamp, Austin LangChain, AI Automation & Marketing, UT Austin AI,
  Austin Forum. Human-vetted. ALWAYS available to you. You can include
  or exclude them per-run but a floor rule auto-adds any that haven't
  been scraped in ${FLOOR_WINDOW_DAYS} days — you cannot starve them.
- DB-discovered (probation tier): discovered via web search. Under the
  planner, probation rotation is DISABLED — you must explicitly include
  them by URL. Demoted sources are never scraped automatically.

### Dedup reconciler (Phase 4, 2026-04-15)
A post-hoc reconciler sweep exists (agent/src/utils/reconciler.js). It
runs manually for now (CLI) but will become an automatic post-ingestion
phase later. It never guesses canonical rows — Haiku must return
"unknown" on field conflicts. Don't use duplicate counts as a grade
input; the reconciler handles residue.

### Outer loop (Phase 5 updates 2026-04-15)
The autonomous outer loop runs on its own cron and reads action items
from human_action_items. Investigation-phase failures now increment
attempt_count and the 24h cooldown is enforced. Scope-gated items
transition to 'proposed' and are queue-exempt. You don't need to worry
about stuck queue-head items anymore — the selector filters them.

### External watchdog (Phase 3, 2026-04-15)
An external watchdog repo (austin-ai-events-watchdog) runs on its own
6h cron outside this codebase's modification scope. It reads the DB
and compares coverage against luma.com/austin directly. Output shows up
in the coverage_audits table. Use this as your ground truth for
"how are we actually doing" — the main system cannot fool it.
`.trim();

/**
 * Determine which config sources are due under the floor rule
 * (not scraped in the last FLOOR_WINDOW_DAYS days).
 *
 * Floor enforcement is structural — applied AFTER the planner proposes
 * its plan — so the planner cannot exclude a config source for more
 * than the window. If the planner leaves a config source out, the
 * floor rule auto-adds it with a [floor-enforced] reason tag.
 */
async function computeFloorSources() {
  const supabase = getSupabase();
  const now = new Date();
  const cutoff = new Date(now.getTime() - FLOOR_WINDOW_DAYS * DAYS_IN_MS);

  const { data, error } = await supabase
    .from('sources')
    .select('url, name, last_scraped, trust_tier')
    .eq('trust_tier', 'config');

  if (error) {
    console.warn(`   ⚠️  Could not compute floor sources: ${error.message}`);
    return [];
  }

  const due = [];
  for (const source of data || []) {
    const lastScraped = source.last_scraped ? new Date(source.last_scraped) : null;
    if (!lastScraped || lastScraped < cutoff) {
      due.push({
        url: source.url,
        name: source.name,
        reason: lastScraped
          ? `[floor-enforced] last scraped ${Math.round((now - lastScraped) / DAYS_IN_MS)} days ago`
          : '[floor-enforced] never scraped',
      });
    }
  }

  return due;
}

/**
 * Apply the floor rule to a plan. Merges any missing due config sources
 * into plan.config_sources. Returns the adjusted plan + a list of which
 * sources were added by the floor (for logging).
 */
function applyFloorRule(plan, floorDueSources, allConfigSources) {
  const planUrls = new Set((plan.config_sources || []).map(s => s.url));
  const added = [];

  for (const due of floorDueSources) {
    if (!planUrls.has(due.url)) {
      plan.config_sources = plan.config_sources || [];
      plan.config_sources.push({
        name: due.name,
        url: due.url,
        reason: due.reason,
      });
      planUrls.add(due.url);
      added.push(due);
    }
  }

  return { plan, floorAddedCount: added.length, floorAdded: added };
}

/**
 * Build the prompt shown to Opus for run planning.
 * Kept compact relative to the monitor's grading prompt — focused on
 * one decision: what should this run do.
 */
function buildPlannerPrompt(metrics, budgetRemaining, allConfigSources, trackRecord) {
  const today = new Date().toISOString().split('T')[0];

  // Compact metric view focused on planning needs
  const planningView = {
    today,
    upcoming_events_14d: metrics.upcomingEventCount21,
    upcoming_events_30d: metrics.upcomingEventCount,
    recent_events_added_7d: metrics.avgMetrics?.totalAdded7d || 0,
    scraper_health_rate: metrics.scraperHealthRate,
    contributing_sources: metrics.contributingSources,
    source_distribution: metrics.sourceDistribution,
    source_performance: metrics.sourcePerformance,
    empty_days_14d: metrics.emptyDays21,
    active_queries: metrics.activeQueries,
    last_run_summary: metrics.recentRunsSummary?.[0] || null,
    open_action_items: metrics.openActionItems?.length || 0,
  };

  const configSourceList = allConfigSources.map(s =>
    `  - ${s.name} (${s.url}) — schedule: days ${(s.scrapeDays || []).join(',')}`
  ).join('\n');

  // Track record section — shown to planner so it can learn from
  // its past predictions. If hit_rate is low, it should be more
  // conservative; if high, it can be more ambitious.
  let trackRecordSection = '';
  if (trackRecord && (trackRecord.summary?.evaluated_count || 0) > 0) {
    trackRecordSection = `
## Your Track Record (last 14 days of evaluated predictions)
- Evaluated: ${trackRecord.summary.evaluated_count}
- Hit rate: ${trackRecord.summary.hit_rate !== null ? Math.round(trackRecord.summary.hit_rate * 100) + '%' : 'n/a'}
- Avg confidence delta: ${trackRecord.summary.avg_confidence_delta ?? 'n/a'}

Recent outcomes:
${(trackRecord.recent || []).slice(0, 5).map(r => {
  const match = r.outcome_match === true ? '✓' : r.outcome_match === false ? '✗' : '?';
  return `- [${match}] "${r.hypothesis}" — predicted: ${r.prediction} / actual: ${r.actual_outcome || 'n/a'}`;
}).join('\n')}

Use this track record. Do NOT repeat actions that failed predictably.
`;
  }

  return `You are the strategic PLANNER for an autonomous AI events curation system (austinai.events).
You run at the START of each cycle on Opus because this decision point drives
everything the system does next.

${ARCHITECTURAL_CONTEXT}

## Your Task

Produce a runPlan — structured JSON that tells the pipeline what to scrape,
probe, and search this run. Your plan will be executed immediately. The
monitor will grade you at the end against YOUR OWN PREDICTIONS.

## Available Config Sources
${configSourceList}

You may include or exclude any of these. The pipeline auto-adds any that
haven't been scraped in ${FLOOR_WINDOW_DAYS} days regardless of your plan — this is a
hard floor you cannot override. Focus on where to spend additional effort.

## Today's Date: ${today}
## Budget Remaining Today: $${budgetRemaining.toFixed(3)} of $${MAX_DAILY_ANTHROPIC_SPEND_USD.toFixed(2)}

The budget cap is a READ-ONLY constraint you cannot modify. Plan accordingly.
Typical run costs $0.15-$0.25. If budget is tight (<$0.30), keep the plan
minimal — floor sources only, no extra probes.

## Current Metrics
${JSON.stringify(planningView, null, 2)}
${trackRecordSection}
## Output Format (JSON only, no markdown):
{
  "config_sources": [
    { "name": "AITX", "url": "https://luma.com/aitx", "reason": "high-yield, due for Wed scrape" }
  ],
  "extra_urls": [
    { "url": "https://luma.com/austin", "parser_hint": "luma", "reason": "watchdog says 0% coverage, 2 gaps" }
  ],
  "event_queries": [
    { "query_text": "...", "reason": "..." }
  ],
  "source_queries": [
    { "query_text": "...", "reason": "..." }
  ],
  "notes": "1-2 sentence rationale for the overall plan",
  "predictions": [
    {
      "hypothesis": "luma.com/austin will produce 2+ new AI events",
      "expected_outcome": "2-4 new events upserted, mostly validated",
      "how_to_verify": "events_added delta after this run"
    }
  ]
}

## Planning Guidelines
- Be strategic, not exhaustive. Pick 2-4 config sources that are actually
  due or high-yield, not all 8 every run.
- Every extra_url should have a reason grounded in data (watchdog finding,
  recent success, coverage gap).
- Queries should target specific gaps, not generic "Austin AI events".
- Predictions should be falsifiable — concrete numbers when possible.
- DO NOT skip a config source because "it's already covered by another
  source on the same platform." luma.com/aitx and luma.com/austin are
  independent. Multi-tenant platform awareness applies.
- Budget-aware: if remaining is <$0.20, omit extra_urls and keep plan tight.

Respond with ONLY valid JSON. No markdown fences.`;
}

/**
 * Run the planner — produce a runPlan and persist it to run_plans table.
 * Returns the plan (with floor rule applied) for the pipeline to consume.
 *
 * @returns {Promise<{plan: Object, planRowId: string, costTracker: Object}>}
 */
export async function runPlanner() {
  console.log('=' .repeat(50));
  console.log('PHASE 0.5: PLANNING (monitor-as-planner)');
  console.log('=' .repeat(50) + '\n');

  // 1. Cost check — refuse to start if budget exhausted
  const costTracker = await createCostTracker();
  console.log(`   💰 ${costTracker.summary()}`);

  if (costTracker.shouldRefuseStart()) {
    console.warn(`   🔒 Daily cost cap already reached ($${costTracker.todaysSpendAtStart.toFixed(3)} >= $${MAX_DAILY_ANTHROPIC_SPEND_USD.toFixed(2)})`);
    console.warn('   Skipping planner — using schedule-based fallback for this run.');
    return { plan: null, planRowId: null, costTracker, reason: 'cost_capped' };
  }

  // 2. Check if we can afford the planner's own Opus call
  if (!costTracker.canAfford('strategic')) {
    console.warn(`   ⚠️  Not enough budget for Opus planner call ($${costTracker.remainingBudget.toFixed(3)} remaining)`);
    console.warn('   Skipping planner — using schedule-based fallback.');
    return { plan: null, planRowId: null, costTracker, reason: 'budget_too_tight' };
  }

  // 3. Gather metrics (reuses monitor.js gatherMetrics)
  console.log('   📊 Gathering metrics...');
  const metrics = await gatherMetrics();

  // 3.5. Evaluate any expired pending experiments from prior runs. The
  // evaluation updates experiment_log rows so the planner's track record
  // (passed into the prompt below) reflects current state.
  try {
    await evaluateExpiredExperiments(metrics);
  } catch (error) {
    console.warn(`   ⚠️  Experiment evaluation failed: ${error.message}`);
  }

  // 3.6. Pull the planner's recent track record for context injection.
  const trackRecord = {
    summary: await getConfidenceSummary(14),
    recent: await getRecentOutcomes(10),
  };
  if (trackRecord.summary.evaluated_count > 0) {
    console.log(`   📊 Track record: ${trackRecord.summary.evaluated_count} evaluated, ${Math.round((trackRecord.summary.hit_rate || 0) * 100)}% hit rate`);
  }

  // 4. Compute floor-rule-due sources (structural guarantee)
  const floorDueSources = await computeFloorSources();
  if (floorDueSources.length > 0) {
    console.log(`   🛡️  Floor rule: ${floorDueSources.length} config source(s) due (${FLOOR_WINDOW_DAYS}-day window)`);
  }

  // 5. Ask Opus for a plan
  const anthropic = getClient();
  const prompt = buildPlannerPrompt(metrics, costTracker.remainingBudget, config.sources, trackRecord);

  let plan = null;
  try {
    console.log('   🧠 Asking Opus to plan...');
    const response = await anthropic.messages.create({
      model: config.models.strategic,
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });
    costTracker.recordCall('strategic');

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in planner response');
    }
    plan = JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error(`   ❌ Planner call failed: ${error.message}`);
    return { plan: null, planRowId: null, costTracker, reason: 'planner_call_failed' };
  }

  // 6. Apply floor rule (structural, not prompt-dependent)
  const { plan: floorAdjusted, floorAddedCount, floorAdded } = applyFloorRule(plan, floorDueSources, config.sources);
  if (floorAddedCount > 0) {
    console.log(`   🛡️  Floor rule added ${floorAddedCount} source(s) to plan: ${floorAdded.map(s => s.name).join(', ')}`);
  }

  // 7. Log the plan summary
  const summary = {
    config_sources: (floorAdjusted.config_sources || []).length,
    extra_urls: (floorAdjusted.extra_urls || []).length,
    event_queries: (floorAdjusted.event_queries || []).length,
    source_queries: (floorAdjusted.source_queries || []).length,
    predictions: (floorAdjusted.predictions || []).length,
  };
  console.log(`   📋 Plan: ${summary.config_sources} config + ${summary.extra_urls} extra URLs + ${summary.event_queries} event queries + ${summary.source_queries} source queries`);
  if (floorAdjusted.notes) console.log(`   📝 Notes: ${floorAdjusted.notes}`);
  if (floorAdjusted.predictions && floorAdjusted.predictions.length > 0) {
    console.log(`   🎯 Predictions:`);
    for (const p of floorAdjusted.predictions.slice(0, 3)) {
      console.log(`      - ${p.hypothesis}`);
    }
  }

  // 8. Persist plan to run_plans table
  let planRowId = null;
  if (!isReadOnlyMode()) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('run_plans')
      .insert({
        plan: floorAdjusted,
        estimated_cost_usd: costTracker.runSpend,
        status: 'pending',
      })
      .select('id')
      .single();
    if (error) {
      console.warn(`   ⚠️  Could not persist plan: ${error.message}`);
    } else {
      planRowId = data?.id;
    }
  }

  // 9. Write predictions to the experiment_log so they can be evaluated
  // in a future run. This is the "memory" that turns planning decisions
  // into falsifiable hypotheses the planner learns from.
  if (planRowId && floorAdjusted.predictions && floorAdjusted.predictions.length > 0) {
    const written = await writePredictions(planRowId, floorAdjusted.predictions, {
      evaluationWindowRuns: 1,
    });
    if (written.length > 0) {
      console.log(`   🧪 Wrote ${written.length} prediction(s) to experiment_log (eval after next run)`);
    }
  }

  console.log('');
  return { plan: floorAdjusted, planRowId, costTracker, reason: 'success' };
}

/**
 * Evaluate experiments whose windows have elapsed. For each, compare
 * the prediction to the actual outcome (reconstructed from the run_plan's
 * execution_summary and the current metrics snapshot) and record the
 * result back to experiment_log. Scores feed into the next planner's
 * track record context.
 *
 * This is a lightweight evaluator — it uses pattern matching on the
 * structured expected_outcome + the current execution summary. A future
 * version could send ambiguous cases to Haiku for semantic judgment,
 * but for MVP deterministic rules are fine.
 */
async function evaluateExpiredExperiments(metrics) {
  const pending = await getExpiredPendingExperiments();
  if (!pending || pending.length === 0) return;

  console.log(`   🧪 Evaluating ${pending.length} expired experiment(s)...`);

  for (const exp of pending) {
    try {
      const runPlan = exp.run_plans;
      const executionSummary = runPlan?.execution_summary || {};

      // Simple deterministic eval: did the linked run actually add events?
      // If the hypothesis mentions "new events" and the execution added
      // any, mark it a hit. Otherwise compare the structured expected_outcome.
      let outcomeMatch = null;
      let actualOutcome = null;
      let confidenceDelta = 0;
      let notes = '';

      const eventsAdded = executionSummary.events_added ?? 0;
      const eventsValidated = executionSummary.events_validated ?? 0;
      const inlineProbe = executionSummary.inline_probe_events ?? 0;

      actualOutcome = `run added ${eventsAdded} events (${eventsValidated} validated, ${inlineProbe} via inline probe)`;

      // Heuristic: if the hypothesis mentions a specific count and the
      // run's actual count is within 50% of that, call it a hit.
      const predictionStr = (exp.prediction || '').toLowerCase();
      const countMatch = predictionStr.match(/(\d+)[^\d]*events?/);
      if (countMatch) {
        const predictedCount = parseInt(countMatch[1], 10);
        const tolerance = Math.max(1, Math.round(predictedCount * 0.5));
        const diff = Math.abs(eventsAdded - predictedCount);
        outcomeMatch = diff <= tolerance;
        confidenceDelta = outcomeMatch ? 0.1 : -0.1;
        notes = `predicted ≈${predictedCount}, actual ${eventsAdded} (±${tolerance} tolerance)`;
      } else if (predictionStr.includes('new event') || predictionStr.includes('add')) {
        // Qualitative prediction — treat any positive add as a hit
        outcomeMatch = eventsAdded > 0;
        confidenceDelta = outcomeMatch ? 0.05 : -0.05;
        notes = `qualitative prediction, actual ${eventsAdded} added`;
      } else {
        // Too ambiguous to score deterministically — mark evaluated with
        // no confidence shift rather than leaving it pending forever
        outcomeMatch = null;
        confidenceDelta = 0;
        notes = 'deterministic eval inconclusive — manual review needed';
      }

      await recordEvaluation(exp.id, {
        outcome_match: outcomeMatch,
        actual_outcome: actualOutcome,
        confidence_delta: confidenceDelta,
        evaluation_run_id: runPlan?.agent_run_id || null,
        evaluation_notes: notes,
      });

      const badge = outcomeMatch === true ? '✓' : outcomeMatch === false ? '✗' : '?';
      console.log(`      [${badge}] ${exp.hypothesis?.substring(0, 60)} — ${notes}`);
    } catch (error) {
      console.warn(`      ⚠️  Error evaluating experiment ${exp.id}: ${error.message}`);
    }
  }
}

/**
 * After the pipeline finishes, update the run_plans row with execution
 * results so the monitor can grade against the plan.
 */
export async function completeRunPlan(planRowId, agentRunId, executionSummary, costTracker) {
  if (!planRowId || isReadOnlyMode()) return;
  const supabase = getSupabase();
  const { error } = await supabase
    .from('run_plans')
    .update({
      agent_run_id: agentRunId,
      execution_summary: executionSummary,
      actual_cost_usd: costTracker?.runSpend || null,
      status: 'completed',
      executed_at: new Date().toISOString(),
    })
    .eq('id', planRowId);
  if (error) {
    console.warn(`   ⚠️  Could not update run plan: ${error.message}`);
  }
}
