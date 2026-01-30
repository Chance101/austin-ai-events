'use client';

import { AgentRun } from '@/types/observatory';

interface CostTrackingProps {
  recentRuns: AgentRun[];
  loading: boolean;
}

// Estimated costs per API call
const CLAUDE_COST_PER_CALL = 0.015; // ~$0.015 per validation (estimate)
// SerpAPI is on free tier, so no cost tracking needed

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function CostTracking({ recentRuns, loading }: CostTrackingProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-full">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  // Calculate totals from recent runs
  const last7Days = recentRuns.filter(run => {
    const runDate = new Date(run.started_at);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return runDate > weekAgo;
  });

  const last30Days = recentRuns.filter(run => {
    const runDate = new Date(run.started_at);
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    return runDate > monthAgo;
  });

  const totals7Day = last7Days.reduce((acc, run) => ({
    claudeCalls: acc.claudeCalls + (run.claude_api_calls || 0),
    serpCalls: acc.serpCalls + (run.serpapi_calls || 0),
    eventsAdded: acc.eventsAdded + (run.events_added || 0),
  }), { claudeCalls: 0, serpCalls: 0, eventsAdded: 0 });

  const totals30Day = last30Days.reduce((acc, run) => ({
    claudeCalls: acc.claudeCalls + (run.claude_api_calls || 0),
    serpCalls: acc.serpCalls + (run.serpapi_calls || 0),
    eventsAdded: acc.eventsAdded + (run.events_added || 0),
  }), { claudeCalls: 0, serpCalls: 0, eventsAdded: 0 });

  const cost7Day = totals7Day.claudeCalls * CLAUDE_COST_PER_CALL;
  const cost30Day = totals30Day.claudeCalls * CLAUDE_COST_PER_CALL;

  const costPerEvent7Day = totals7Day.eventsAdded > 0
    ? cost7Day / totals7Day.eventsAdded
    : 0;

  const avgDailyCost = cost30Day / 30;

  // Find the last run for "most recent" stats
  const lastRun = recentRuns[0];
  const lastRunCost = lastRun ? lastRun.claude_api_calls * CLAUDE_COST_PER_CALL : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Cost & Efficiency
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            API usage and cost estimates
          </p>
        </div>
        <div className="text-2xl">💰</div>
      </div>

      {/* Main cost display */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="text-2xl font-bold text-green-700 dark:text-green-400">
            {formatCurrency(cost7Day)}
          </div>
          <div className="text-sm text-green-600 dark:text-green-500">
            Last 7 days
          </div>
        </div>
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
            {formatCurrency(avgDailyCost)}
          </div>
          <div className="text-sm text-blue-600 dark:text-blue-500">
            Avg per day
          </div>
        </div>
      </div>

      {/* Detailed stats */}
      <div className="flex-1 space-y-4">
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Last 7 Days
          </h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {totals7Day.claudeCalls}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Claude Calls</div>
            </div>
            <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {totals7Day.eventsAdded}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Events Added</div>
            </div>
            <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatCurrency(costPerEvent7Day)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Per Event</div>
            </div>
          </div>
        </div>

        {/* Last run breakdown */}
        {lastRun && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Most Recent Run
            </h4>
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Claude API calls
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {lastRun.claude_api_calls || 0}
                </span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  SerpAPI calls
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {lastRun.serpapi_calls || 0}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-600">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Estimated cost
                </span>
                <span className="font-semibold text-green-600 dark:text-green-400">
                  {formatCurrency(lastRunCost)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Costs estimated at ~$0.015/validation. Trust tiers reduce costs by skipping validation for trusted sources.
        </p>
      </div>
    </div>
  );
}
