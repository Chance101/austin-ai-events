'use client';

interface SystemHealthProps {
  totalRuns: number;
  successfulRuns: number;
  averageEventsPerRun: number;
  totalEventsAdded: number;
  loading: boolean;
}

export default function SystemHealth({
  totalRuns,
  successfulRuns,
  averageEventsPerRun,
  totalEventsAdded,
  loading,
}: SystemHealthProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const successRate = totalRuns > 0 ? ((successfulRuns / totalRuns) * 100).toFixed(1) : '0';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 h-full flex flex-col">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Health</h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalRuns}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Total runs</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{successRate}%</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Success rate</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{averageEventsPerRun.toFixed(1)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Avg events/run</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/30 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{totalEventsAdded}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Total added</p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Success rate</span>
          <span className="font-medium dark:text-gray-200">{successfulRuns}/{totalRuns} runs</span>
        </div>
        <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all"
            style={{ width: `${successRate}%` }}
          ></div>
        </div>
      </div>

      <div className="flex-1"></div>

      <p className="mt-4 text-xs text-gray-400 text-center">
        Tracking since January 3, 2026
      </p>
    </div>
  );
}
