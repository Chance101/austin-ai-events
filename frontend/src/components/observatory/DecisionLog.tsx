'use client';

import { AgentRun, DecisionSummary } from '@/types/observatory';

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

const outcomeColors: Record<string, string> = {
  accepted: 'text-green-600 dark:text-green-400',
  rejected: 'text-red-600 dark:text-red-400',
  duplicated: 'text-gray-500 dark:text-gray-400',
  updated: 'text-blue-600 dark:text-blue-400',
  skipped: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-700 dark:text-red-300',
};

const stageLabels: Record<string, string> = {
  pre_filter: 'Pre-filter',
  dedup_hash: 'Hash dedup',
  dedup_fuzzy: 'Fuzzy dedup',
  dedup_claude: 'Claude dedup',
  location_check: 'Location',
  validation: 'Validation',
  classification: 'Classify',
  upsert: 'Saved',
};

function SourceBreakdown({ summary }: { summary: DecisionSummary }) {
  const sources = Object.entries(summary.bySource)
    .sort((a, b) => {
      const totalA = a[1].accepted + a[1].rejected + a[1].duplicated + a[1].skipped;
      const totalB = b[1].accepted + b[1].rejected + b[1].duplicated + b[1].skipped;
      return totalB - totalA;
    });

  return (
    <div className="space-y-2">
      {sources.map(([source, stats]) => {
        const total = stats.accepted + stats.rejected + stats.duplicated + stats.updated + stats.skipped + stats.error;
        const acceptPct = total > 0 ? Math.round((stats.accepted / total) * 100) : 0;
        const dupPct = total > 0 ? Math.round((stats.duplicated / total) * 100) : 0;
        const rejectPct = total > 0 ? Math.round(((stats.rejected + stats.skipped) / total) * 100) : 0;

        return (
          <div key={source} className="p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-900 dark:text-white truncate">
                {source}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-2">
                {total} events
              </span>
            </div>

            {/* Stacked bar */}
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
              {stats.accepted > 0 && (
                <div className="h-full bg-green-500" style={{ width: `${acceptPct}%` }} title={`${stats.accepted} accepted`} />
              )}
              {stats.duplicated > 0 && (
                <div className="h-full bg-gray-400 dark:bg-gray-500" style={{ width: `${dupPct}%` }} title={`${stats.duplicated} duplicates`} />
              )}
              {(stats.rejected + stats.skipped) > 0 && (
                <div className="h-full bg-red-400" style={{ width: `${rejectPct}%` }} title={`${stats.rejected + stats.skipped} rejected/skipped`} />
              )}
            </div>

            {/* Compact stats row */}
            <div className="flex gap-3 mt-1 text-xs">
              {stats.accepted > 0 && <span className={outcomeColors.accepted}>{stats.accepted} added</span>}
              {stats.duplicated > 0 && <span className={outcomeColors.duplicated}>{stats.duplicated} dupes</span>}
              {stats.rejected > 0 && <span className={outcomeColors.rejected}>{stats.rejected} rejected</span>}
              {stats.skipped > 0 && <span className={outcomeColors.skipped}>{stats.skipped} skipped</span>}
              {stats.updated > 0 && <span className={outcomeColors.updated}>{stats.updated} updated</span>}
            </div>

            {/* Top rejection reasons for this source */}
            {Object.keys(stats.reasons).length > 0 && (
              <div className="mt-1 space-y-0.5">
                {Object.entries(stats.reasons).slice(0, 2).map(([reason, count]) => (
                  <div key={reason} className="text-xs text-gray-500 dark:text-gray-400 truncate pl-2 border-l-2 border-red-300 dark:border-red-700">
                    {count}x {reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StageBreakdown({ summary }: { summary: DecisionSummary }) {
  const stages = Object.entries(summary.byStage)
    .sort((a, b) => b[1] - a[1]);
  const maxCount = stages.length > 0 ? stages[0][1] : 1;

  return (
    <div className="space-y-1.5">
      {stages.map(([stage, count]) => (
        <div key={stage} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 dark:text-gray-400 w-20 shrink-0 truncate">
            {stageLabels[stage] || stage}
          </span>
          <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-400 dark:bg-indigo-500 rounded-full"
              style={{ width: `${(count / maxCount) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-900 dark:text-white w-6 text-right">
            {count}
          </span>
        </div>
      ))}
    </div>
  );
}

function TopRejections({ summary }: { summary: DecisionSummary }) {
  if (!summary.topRejectionReasons || summary.topRejectionReasons.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      {summary.topRejectionReasons.slice(0, 5).map((r, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <span className="font-semibold text-red-600 dark:text-red-400 shrink-0 w-5 text-right">
            {r.count}x
          </span>
          <span className="text-gray-700 dark:text-gray-300 flex-1">
            {r.reason}
          </span>
          <span className="text-gray-400 dark:text-gray-500 shrink-0 text-right">
            {r.sources.slice(0, 2).join(', ')}
          </span>
        </div>
      ))}
    </div>
  );
}

function RunDecisionCard({ run }: { run: AgentRun }) {
  const summary = run.decision_summary;
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
        <div className="flex items-center gap-2">
          {summary && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {summary.totalDecisions} decisions
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            run.errors === 0
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {run.errors === 0 ? 'Success' : `${run.errors} errors`}
          </span>
        </div>
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

  // Find the latest run with a decision summary
  const latestWithSummary = recentRuns.find(r => r.decision_summary && r.decision_summary.totalDecisions > 0);
  const summary = latestWithSummary?.decision_summary;

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

      {/* Decision summary from latest run */}
      {summary ? (
        <div className="flex-1 space-y-4 overflow-y-auto">
          {/* Per-source breakdown */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Per-Source Breakdown (latest run)
            </h4>
            <SourceBreakdown summary={summary} />
          </div>

          {/* Top rejection reasons */}
          {summary.topRejectionReasons && summary.topRejectionReasons.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Top Rejection Reasons
              </h4>
              <TopRejections summary={summary} />
            </div>
          )}

          {/* Pipeline stage breakdown */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Pipeline Stages
            </h4>
            <StageBreakdown summary={summary} />
          </div>
        </div>
      ) : (
        /* Fallback: recent runs list when no decision summary available */
        <div className="flex-1 space-y-3 overflow-y-auto">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Recent Runs
          </h4>
          {recentRuns.slice(0, 5).map((run) => (
            <RunDecisionCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
