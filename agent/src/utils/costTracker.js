/**
 * Cost tracker — enforces MAX_DAILY_ANTHROPIC_SPEND_USD across a run.
 *
 * Design:
 *   - Check today's cumulative spend at START of each run (refuse to start
 *     if already over).
 *   - Check the running in-process tally BEFORE each Opus/Sonnet call
 *     (skip the call if it would exceed the cap).
 *   - Haiku calls always allowed — they're $0.001 each, tracking them
 *     is fine but capping them would block core pipeline work.
 *
 * The cap is a floor guarantee that the planner/monitor cannot override.
 * The value lives in config.js marked READ-ONLY.
 */

import { MAX_DAILY_ANTHROPIC_SPEND_USD, ESTIMATED_COST_PER_CALL } from '../config.js';
import { getSupabase } from './supabase.js';

/**
 * Fetch today's cumulative Claude API cost from agent_runs (UTC day).
 * Assumes actual_cost_usd is logged per run; falls back to estimating
 * from claude_api_calls (assumes average Haiku+Opus mix) when absent.
 */
export async function getTodaysCumulativeSpend() {
  const supabase = getSupabase();
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

  const { data, error } = await supabase
    .from('agent_runs')
    .select('claude_api_calls, run_type, started_at')
    .gte('started_at', startOfDay.toISOString());

  if (error) {
    console.warn(`   ⚠️  Could not fetch today's spend: ${error.message}`);
    return 0;
  }

  let total = 0;
  for (const run of data || []) {
    // Estimate: assume 1 Opus + ~5% Sonnet + rest Haiku
    const calls = run.claude_api_calls || 0;
    if (calls === 0) continue;
    const opusCalls = 1;
    const sonnetCalls = Math.round(calls * 0.05);
    const haikuCalls = Math.max(0, calls - opusCalls - sonnetCalls);
    total += opusCalls * ESTIMATED_COST_PER_CALL.strategic
           + sonnetCalls * ESTIMATED_COST_PER_CALL.standard
           + haikuCalls * ESTIMATED_COST_PER_CALL.fast;
  }
  return total;
}

/**
 * In-process cost tracker for a single run. Tracks cumulative cost as
 * calls are made and provides a check function that returns false if
 * the next call would exceed the cap.
 *
 * Usage:
 *   const tracker = await createCostTracker();
 *   if (!tracker.canAfford('strategic')) {
 *     console.log('Skipping Opus call — would exceed daily cap');
 *   } else {
 *     // make the call
 *     tracker.recordCall('strategic');
 *   }
 */
export async function createCostTracker(initialSpend = null) {
  const todaysSpendAtStart = initialSpend !== null
    ? initialSpend
    : await getTodaysCumulativeSpend();
  let runSpend = 0;
  const callLog = { fast: 0, standard: 0, strategic: 0 };

  return {
    todaysSpendAtStart,
    get runSpend() { return runSpend; },
    get cumulativeSpend() { return todaysSpendAtStart + runSpend; },
    get callLog() { return { ...callLog }; },
    get cap() { return MAX_DAILY_ANTHROPIC_SPEND_USD; },
    get remainingBudget() { return Math.max(0, MAX_DAILY_ANTHROPIC_SPEND_USD - (todaysSpendAtStart + runSpend)); },

    /**
     * Check if we can afford another call of the given tier.
     * Haiku is always allowed (trivial cost, core pipeline work).
     */
    canAfford(tier = 'fast') {
      if (tier === 'fast') return true;
      const estCost = ESTIMATED_COST_PER_CALL[tier] || 0.01;
      return (todaysSpendAtStart + runSpend + estCost) <= MAX_DAILY_ANTHROPIC_SPEND_USD;
    },

    /**
     * Record that a call was made, updating the running total.
     */
    recordCall(tier = 'fast') {
      const cost = ESTIMATED_COST_PER_CALL[tier] || 0.01;
      runSpend += cost;
      callLog[tier] = (callLog[tier] || 0) + 1;
    },

    /**
     * Returns true if the run should refuse to start because today's
     * cumulative spend is already at or above the cap.
     */
    shouldRefuseStart() {
      return todaysSpendAtStart >= MAX_DAILY_ANTHROPIC_SPEND_USD;
    },

    /**
     * Emit a human-readable status line for logs.
     */
    summary() {
      return `cost: $${(todaysSpendAtStart + runSpend).toFixed(3)} / $${MAX_DAILY_ANTHROPIC_SPEND_USD.toFixed(2)} (run: $${runSpend.toFixed(3)}, prior today: $${todaysSpendAtStart.toFixed(3)}; calls fast/std/str: ${callLog.fast}/${callLog.standard}/${callLog.strategic})`;
    },
  };
}
