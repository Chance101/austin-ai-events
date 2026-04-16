/**
 * Addition A — Dedicated reflection loop.
 *
 * Runs biweekly (or on-demand) as a separate pass from the daily planner.
 * Reads the last 30 days of experiment outcomes, monitor reports, and run
 * plans, then asks Opus to synthesize patterns into persistent learned
 * priors. The planner loads the most recent reflection on every run.
 *
 * This is the meta-learning layer the 5-agent analysis identified as the
 * difference between "logs everything" and "learns from experience." The
 * experiment log records individual predictions; the reflections table
 * records PATTERNS across predictions.
 *
 * Run manually: cd agent && node src/reflection.js
 * Run via cron: .github/workflows/reflection.yml (biweekly)
 */

import { config, MAX_DAILY_ANTHROPIC_SPEND_USD } from './config.js';
import { getClient } from './utils/claude.js';
import { getSupabase, isReadOnlyMode } from './utils/supabase.js';
import { createCostTracker } from './utils/costTracker.js';
import { validateConfig } from './config.js';

const LOOKBACK_DAYS = 30;

/**
 * Gather the raw data the reflection needs to analyze.
 */
async function gatherReflectionData() {
  const supabase = getSupabase();
  const now = new Date();
  const windowStart = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [
    experimentsResult,
    reportsResult,
    plansResult,
    runsResult,
    coverageResult,
  ] = await Promise.all([
    // All evaluated experiments in the window
    supabase
      .from('experiment_log')
      .select('hypothesis, prediction, actual_outcome, outcome_match, confidence_delta, evaluation_notes, created_at, evaluated_at')
      .eq('status', 'evaluated')
      .gte('created_at', windowStart.toISOString())
      .order('created_at', { ascending: false }),

    // Monitor reports
    supabase
      .from('monitor_reports')
      .select('overall_grade, summary, findings, auto_actions, action_review, created_at')
      .gte('created_at', windowStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(15),

    // Run plans with execution summaries
    supabase
      .from('run_plans')
      .select('plan, execution_summary, estimated_cost_usd, actual_cost_usd, created_at')
      .eq('status', 'completed')
      .gte('created_at', windowStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(15),

    // Agent runs (high-level stats)
    supabase
      .from('agent_runs')
      .select('started_at, events_discovered, events_added, events_validated, duplicates_skipped, errors, claude_api_calls, run_duration_seconds')
      .gte('started_at', windowStart.toISOString())
      .order('started_at', { ascending: false })
      .limit(30),

    // Coverage audits from the external watchdog
    supabase
      .from('coverage_audits')
      .select('events_in_db, events_on_luma, coverage_percentage, gap_event_titles, liveness_status, created_at')
      .gte('created_at', windowStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  return {
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
    experiments: experimentsResult.data || [],
    reports: reportsResult.data || [],
    plans: plansResult.data || [],
    runs: runsResult.data || [],
    coverageAudits: coverageResult.data || [],
  };
}

/**
 * Build the Opus prompt for reflection synthesis.
 */
function buildReflectionPrompt(data) {
  // Experiment outcomes summary
  const experimentSection = data.experiments.length > 0
    ? `## Experiment Outcomes (${data.experiments.length} evaluated in last ${LOOKBACK_DAYS} days)
${data.experiments.map(e => {
  const match = e.outcome_match === true ? '✓' : e.outcome_match === false ? '✗' : '?';
  return `[${match}] "${e.hypothesis}" — predicted: ${e.prediction} / actual: ${e.actual_outcome || 'n/a'} / delta: ${e.confidence_delta ?? 'n/a'}`;
}).join('\n')}
`
    : '## Experiment Outcomes\nNo evaluated experiments in window. The experiment log was just created; patterns will emerge after a few planner runs.\n';

  // Run stats trend
  const runSection = data.runs.length > 0
    ? `## Run History (${data.runs.length} runs in last ${LOOKBACK_DAYS} days)
${data.runs.map(r => `${r.started_at}: discovered=${r.events_discovered}, added=${r.events_added}, dupes=${r.duplicates_skipped}, errors=${r.errors}, calls=${r.claude_api_calls}, ${r.run_duration_seconds}s`).join('\n')}
`
    : '## Run History\nNo runs in window.\n';

  // Monitor grades and recurring findings
  const monitorSection = data.reports.length > 0
    ? `## Monitor Reports (${data.reports.length} in window)
${data.reports.map(r => `${r.created_at}: Grade ${r.overall_grade} — ${r.summary}`).join('\n')}
`
    : '## Monitor Reports\nNo reports in window.\n';

  // Coverage trend from watchdog
  const coverageSection = data.coverageAudits.length > 0
    ? `## External Coverage Audits (from watchdog)
${data.coverageAudits.map(c => `${c.created_at}: ${c.events_in_db} in DB, ${c.events_on_luma || '?'} on Luma, coverage ${c.coverage_percentage ?? '?'}%, status: ${c.liveness_status}`).join('\n')}
`
    : '## External Coverage Audits\nNo coverage audits yet. The watchdog may not have run or the table may be empty.\n';

  return `You are conducting a REFLECTION on the autonomous AI events curation system (austinai.events).

You are NOT planning a run. You are stepping back and analyzing ${LOOKBACK_DAYS} days of system behavior to extract patterns, identify what's working and what's not, and produce strategic guidance that will be loaded into the planner's context on every future run.

Your reflection will be read by the planner (also Opus) at the start of every cycle. Write for that audience: specific, actionable, grounded in data. Not generic observations — patterns with evidence.

${experimentSection}
${runSection}
${monitorSection}
${coverageSection}

## Your Task

Analyze the data above and produce a structured reflection. Focus on:

1. **Patterns**: What recurring themes do you see across runs? Which sources consistently produce value? Which strategies are failing? Are there coverage gaps that persist despite efforts?

2. **Recommendations**: Based on the patterns, what should the planner do differently? Be specific — name sources, query types, time windows.

3. **Strategy updates**: Free-text guidance that the planner should follow going forward. This is injected directly into the planner's prompt context. Write it as if giving instructions to a colleague.

Respond with ONLY valid JSON:
{
  "patterns": [
    {
      "category": "sources|coverage|cost|dedup|validation|discovery",
      "observation": "specific pattern with data references",
      "confidence": 0.0-1.0,
      "evidence": "what data supports this"
    }
  ],
  "recommendations": [
    {
      "action": "specific action the planner should take",
      "rationale": "why, grounded in the patterns above",
      "priority": "high|medium|low"
    }
  ],
  "strategy_updates": "Free-text guidance for the planner. 2-5 sentences. Be specific and actionable.",
  "summary": "1-2 sentence summary of the key insight from this reflection"
}`;
}

/**
 * Run the reflection pass. Gathers data, asks Opus, writes to DB.
 */
export async function runReflection() {
  console.log('=' .repeat(50));
  console.log('REFLECTION: Meta-learning synthesis');
  console.log('=' .repeat(50) + '\n');

  // Cost check
  const costTracker = await createCostTracker();
  console.log(`   💰 ${costTracker.summary()}`);

  if (!costTracker.canAfford('strategic')) {
    console.warn('   ⚠️  Not enough budget for Opus reflection call. Skipping.');
    return null;
  }

  // Gather data
  console.log('   📊 Gathering reflection data...');
  const data = await gatherReflectionData();
  console.log(`   Experiments: ${data.experiments.length}, Reports: ${data.reports.length}, Runs: ${data.runs.length}, Plans: ${data.plans.length}`);

  if (data.experiments.length === 0 && data.runs.length === 0) {
    console.log('   ⚪ No data to reflect on yet. Skipping reflection.');
    return null;
  }

  // Ask Opus
  console.log('   🧠 Asking Opus to reflect...');
  const anthropic = getClient();
  const prompt = buildReflectionPrompt(data);

  let reflection;
  try {
    const response = await anthropic.messages.create({
      model: config.models.strategic,
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });
    costTracker.recordCall('strategic');

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in reflection response');
    reflection = JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error(`   ❌ Reflection call failed: ${error.message}`);
    return null;
  }

  // Log results
  console.log(`\n   📝 Reflection summary: ${reflection.summary}`);
  console.log(`   Patterns: ${(reflection.patterns || []).length}`);
  console.log(`   Recommendations: ${(reflection.recommendations || []).length}`);
  if (reflection.strategy_updates) {
    console.log(`   Strategy: ${reflection.strategy_updates.substring(0, 200)}...`);
  }

  // Write to DB
  if (!isReadOnlyMode()) {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('reflections')
      .insert({
        window_start: data.windowStart,
        window_end: data.windowEnd,
        experiments_analyzed: data.experiments.length,
        runs_analyzed: data.runs.length,
        patterns: reflection.patterns || [],
        recommendations: reflection.recommendations || [],
        strategy_updates: reflection.strategy_updates || null,
        estimated_cost_usd: costTracker.runSpend,
        summary: reflection.summary,
      });
    if (error) {
      console.warn(`   ⚠️  Could not write reflection: ${error.message}`);
    } else {
      console.log('   ✅ Reflection saved to DB.');
    }
  }

  console.log(`\n   💰 ${costTracker.summary()}`);
  return reflection;
}

/**
 * Fetch the most recent reflection for the planner's context.
 * Returns null if no reflections exist yet.
 */
export async function getLatestReflection() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('reflections')
    .select('summary, strategy_updates, patterns, recommendations, created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0];
}

// CLI entry point: node src/reflection.js
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('/reflection.js') ||
  process.argv[1].endsWith('\\reflection.js')
);

if (isDirectRun) {
  validateConfig();
  runReflection()
    .then(result => {
      if (result) {
        console.log('\n✨ Reflection complete.');
      } else {
        console.log('\n⚪ No reflection produced (insufficient data or budget).');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Reflection failed:', error);
      process.exit(1);
    });
}
