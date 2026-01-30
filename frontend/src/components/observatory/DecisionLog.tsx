'use client';

import { AgentRun } from '@/types/observatory';

interface DecisionLogProps {
  recentRuns: AgentRun[];
  loading: boolean;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function RunDecisionCard({ run }: { run: AgentRun }) {
  const acceptRate = run.events_validated > 0
    ? Math.round((run.events_added / run.events_validated) * 100)
    : 0;
  const rejectRate = 100 - acceptRate;

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatTimeAgo(run.started_at)}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          run.errors === 0
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
        }`}>
          {run.errors === 0 ? 'Success' : `${run.errors} errors`}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {run.events_discovered}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Discovered</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-green-600 dark:text-green-400">
            {run.events_added}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Accepted</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-gray-600 dark:text-gray-400">
            {run.duplicates_skipped}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Duplicates</div>
        </div>
      </div>

      {run.events_validated > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-600 dark:text-gray-400">Validation</span>
            <span className="text-gray-900 dark:text-white font-medium">
              {acceptRate}% accepted
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-green-500"
              style={{ width: `${acceptRate}%` }}
            />
            <div
              className="h-full bg-red-400"
              style={{ width: `${rejectRate}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function DecisionLog({ recentRuns, loading }: DecisionLogProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-full">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Aggregate stats across all runs
  const totals = recentRuns.reduce((acc, run) => ({
    discovered: acc.discovered + (run.events_discovered || 0),
    validated: acc.validated + (run.events_validated || 0),
    added: acc.added + (run.events_added || 0),
    duplicates: acc.duplicates + (run.duplicates_skipped || 0),
  }), { discovered: 0, validated: 0, added: 0, duplicates: 0 });

  const overallAcceptRate = totals.validated > 0
    ? Math.round((totals.added / totals.validated) * 100)
    : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Decision Log
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            How the agent filters events
          </p>
        </div>
        <div className="text-2xl">🧐</div>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-4 gap-2 mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900 dark:text-white">
            {totals.discovered}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Found</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-green-600 dark:text-green-400">
            {totals.added}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Added</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-gray-600 dark:text-gray-400">
            {totals.duplicates}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Dupes</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
            {overallAcceptRate}%
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Accept</div>
        </div>
      </div>

      {/* Recent runs */}
      <div className="flex-1 space-y-3 overflow-y-auto">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Recent Runs
        </h4>
        {recentRuns.slice(0, 5).map((run) => (
          <RunDecisionCard key={run.id} run={run} />
        ))}
      </div>

      {/* Future enhancement note */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center italic">
          Per-event decision reasoning coming soon
        </p>
      </div>
    </div>
  );
}
