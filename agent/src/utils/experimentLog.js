/**
 * Experiment log — persistent record of falsifiable predictions.
 *
 * Every strategic action the planner takes is logged here with a
 * hypothesis and an evaluation window. On subsequent runs, experiments
 * whose windows have elapsed get evaluated against actual outcomes
 * and their confidence deltas fold back into the planner's context.
 *
 * This turns "the planner made a decision" into "the planner learned
 * whether its decision was right" — the core compounding-intelligence
 * feedback loop from the user's agentic AI philosophy.
 */

import { getSupabase, isReadOnlyMode } from './supabase.js';

const DEFAULT_EVAL_WINDOW_RUNS = 1;
const EVAL_WINDOW_HOURS_PER_RUN = 24; // one agent run per day

/**
 * Write predictions from a runPlan into the experiment_log.
 * Called by the planner after it produces its plan.
 *
 * @param {string} runPlanId - UUID of the run_plans row
 * @param {Array<{hypothesis, expected_outcome, how_to_verify}>} predictions
 * @param {Object} [opts]
 * @param {number} [opts.evaluationWindowRuns=1] - how many runs before evaluation
 * @returns {Promise<Array<{id}>>} inserted experiment ids
 */
export async function writePredictions(runPlanId, predictions, opts = {}) {
  if (isReadOnlyMode()) return [];
  if (!runPlanId || !Array.isArray(predictions) || predictions.length === 0) return [];

  const { evaluationWindowRuns = DEFAULT_EVAL_WINDOW_RUNS } = opts;
  const supabase = getSupabase();

  const now = new Date();
  const evaluateAfter = new Date(now.getTime() + evaluationWindowRuns * EVAL_WINDOW_HOURS_PER_RUN * 60 * 60 * 1000);

  const rows = predictions.map(p => ({
    agent: 'planner',
    run_plan_id: runPlanId,
    hypothesis: p.hypothesis || 'unspecified',
    action_taken: p.action_taken || null,
    prediction: typeof p.expected_outcome === 'string'
      ? p.expected_outcome
      : JSON.stringify(p.expected_outcome || p.prediction || 'n/a'),
    expected_outcome: typeof p.expected_outcome === 'object'
      ? p.expected_outcome
      : { description: p.expected_outcome, verify: p.how_to_verify },
    evaluation_window_runs: evaluationWindowRuns,
    evaluate_after: evaluateAfter.toISOString(),
    status: 'pending',
  }));

  const { data, error } = await supabase
    .from('experiment_log')
    .insert(rows)
    .select('id');

  if (error) {
    console.warn(`   ⚠️  Could not write experiments: ${error.message}`);
    return [];
  }

  return data || [];
}

/**
 * Fetch pending experiments whose evaluation window has elapsed.
 * Returns experiments joined with their source run_plan so the
 * evaluator has full context about what was predicted.
 */
export async function getExpiredPendingExperiments(nowOverride = null) {
  const supabase = getSupabase();
  const now = (nowOverride || new Date()).toISOString();

  const { data, error } = await supabase
    .from('experiment_log')
    .select(`
      id, agent, run_plan_id, hypothesis, action_taken, prediction,
      expected_outcome, evaluation_window_runs, created_at, evaluate_after,
      run_plans ( id, plan, execution_summary, agent_run_id )
    `)
    .eq('status', 'pending')
    .lte('evaluate_after', now)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    console.warn(`   ⚠️  Could not fetch pending experiments: ${error.message}`);
    return [];
  }
  return data || [];
}

/**
 * Write the evaluation result back to an experiment row.
 */
export async function recordEvaluation(experimentId, {
  outcome_match,
  actual_outcome,
  confidence_delta,
  evaluation_run_id,
  evaluation_notes,
}) {
  if (isReadOnlyMode()) return;
  const supabase = getSupabase();
  const { error } = await supabase
    .from('experiment_log')
    .update({
      status: 'evaluated',
      evaluated_at: new Date().toISOString(),
      evaluation_run_id: evaluation_run_id || null,
      actual_outcome: actual_outcome || null,
      outcome_match: outcome_match ?? null,
      confidence_delta: confidence_delta ?? null,
      evaluation_notes: evaluation_notes || null,
    })
    .eq('id', experimentId);
  if (error) {
    console.warn(`   ⚠️  Could not record experiment evaluation: ${error.message}`);
  }
}

/**
 * Fetch recent evaluated experiments so the planner can see its track
 * record. Returns the last N evaluated experiments ordered newest first.
 */
export async function getRecentOutcomes(limit = 10) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('experiment_log')
    .select('id, hypothesis, action_taken, prediction, actual_outcome, outcome_match, confidence_delta, evaluated_at, evaluation_notes')
    .eq('status', 'evaluated')
    .order('evaluated_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

/**
 * Aggregate confidence score across evaluated experiments. Lets the
 * planner see "my predictions are right X% of the time" without having
 * to reason from individual records.
 */
export async function getConfidenceSummary(lookbackDays = 14) {
  const supabase = getSupabase();
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('experiment_log')
    .select('outcome_match, confidence_delta')
    .eq('status', 'evaluated')
    .gte('evaluated_at', cutoff);
  if (error || !data || data.length === 0) {
    return { evaluated_count: 0, hit_rate: null, avg_confidence_delta: null };
  }
  const hits = data.filter(r => r.outcome_match === true).length;
  const totalDelta = data.reduce((s, r) => s + (r.confidence_delta || 0), 0);
  return {
    evaluated_count: data.length,
    hit_rate: Math.round((hits / data.length) * 100) / 100,
    avg_confidence_delta: Math.round((totalDelta / data.length) * 1000) / 1000,
  };
}
