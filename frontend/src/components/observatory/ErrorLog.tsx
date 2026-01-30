'use client';

import { AgentRun } from '@/types/observatory';

interface ErrorLogProps {
  recentRuns: AgentRun[];
  loading: boolean;
}

interface ErrorMessage {
  source?: string;
  error?: string;
  message?: string;
  timestamp?: string;
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

function ErrorCard({ error, runTime }: { error: ErrorMessage; runTime: string }) {
  const errorText = error.error || error.message || 'Unknown error';
  const source = error.source || 'Unknown source';

  // Categorize error type for styling
  let icon = '❌';
  let bgColor = 'bg-red-50 dark:bg-red-900/20';
  let borderColor = 'border-red-200 dark:border-red-800';

  if (errorText.toLowerCase().includes('timeout')) {
    icon = '⏱️';
    bgColor = 'bg-orange-50 dark:bg-orange-900/20';
    borderColor = 'border-orange-200 dark:border-orange-800';
  } else if (errorText.toLowerCase().includes('rate limit')) {
    icon = '🚦';
    bgColor = 'bg-yellow-50 dark:bg-yellow-900/20';
    borderColor = 'border-yellow-200 dark:border-yellow-800';
  } else if (errorText.toLowerCase().includes('ssl') || errorText.toLowerCase().includes('certificate')) {
    icon = '🔒';
    bgColor = 'bg-purple-50 dark:bg-purple-900/20';
    borderColor = 'border-purple-200 dark:border-purple-800';
  } else if (errorText.toLowerCase().includes('network') || errorText.toLowerCase().includes('connection')) {
    icon = '🌐';
    bgColor = 'bg-blue-50 dark:bg-blue-900/20';
    borderColor = 'border-blue-200 dark:border-blue-800';
  }

  return (
    <div className={`p-3 rounded-lg ${bgColor} border ${borderColor}`}>
      <div className="flex items-start gap-2">
        <span className="text-lg">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {source}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
              {formatTimeAgo(runTime)}
            </span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 break-words">
            {errorText.length > 100 ? errorText.substring(0, 100) + '...' : errorText}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ErrorLog({ recentRuns, loading }: ErrorLogProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-full">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Collect all errors from recent runs
  const allErrors: { error: ErrorMessage; runTime: string }[] = [];
  recentRuns.forEach(run => {
    if (run.error_messages && Array.isArray(run.error_messages)) {
      run.error_messages.forEach((err) => {
        // Handle both string and object error formats
        const error: ErrorMessage = typeof err === 'string'
          ? { message: err }
          : err;
        allErrors.push({ error, runTime: run.started_at });
      });
    }
  });

  // Calculate stats
  const totalRuns = recentRuns.length;
  const runsWithErrors = recentRuns.filter(r => r.errors > 0).length;
  const errorFreeRate = totalRuns > 0
    ? Math.round(((totalRuns - runsWithErrors) / totalRuns) * 100)
    : 100;

  // Get runs from last 7 days
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const last7DaysRuns = recentRuns.filter(r => new Date(r.started_at) > weekAgo);
  const last7DaysErrors = last7DaysRuns.reduce((sum, r) => sum + (r.errors || 0), 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Error Log
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Issues and failures
          </p>
        </div>
        <div className="text-2xl">🔧</div>
      </div>

      {/* Health summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded text-center">
          <div className={`text-xl font-bold ${
            errorFreeRate >= 90
              ? 'text-green-600 dark:text-green-400'
              : errorFreeRate >= 70
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-red-600 dark:text-red-400'
          }`}>
            {errorFreeRate}%
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Success Rate</div>
        </div>
        <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded text-center">
          <div className="text-xl font-bold text-gray-900 dark:text-white">
            {last7DaysErrors}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Errors (7d)</div>
        </div>
        <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded text-center">
          <div className="text-xl font-bold text-gray-900 dark:text-white">
            {allErrors.length}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Total Logged</div>
        </div>
      </div>

      {/* Error list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {allErrors.length > 0 ? (
          <>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Recent Issues
            </h4>
            {allErrors.slice(0, 10).map((item, index) => (
              <ErrorCard key={index} error={item.error} runTime={item.runTime} />
            ))}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center py-8">
              <div className="text-4xl mb-2">✨</div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No errors logged recently
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                The agent is running smoothly
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Errors are automatically logged during each agent run
        </p>
      </div>
    </div>
  );
}
