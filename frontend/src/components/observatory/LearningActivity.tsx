'use client';

import { formatDistanceToNow } from 'date-fns';
import { SearchQuery } from '@/types/observatory';

interface LearningActivityProps {
  topPerformers: SearchQuery[];
  explorationQueue: SearchQuery[];
  loading: boolean;
  section?: 'top-performers' | 'exploration' | 'both';
}

export default function LearningActivity({
  topPerformers,
  explorationQueue,
  loading,
  section = 'both'
}: LearningActivityProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 animate-pulse h-full">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  // Top Performers Section
  if (section === 'top-performers') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 h-full">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🏆</span>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top Performing Queries</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">The agent&apos;s most successful searches</p>

        {topPerformers.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No successful queries yet.</p>
        ) : (
          <div className="space-y-3">
            {topPerformers.map((query) => (
              <div key={query.id} className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 border border-emerald-100 dark:border-emerald-800">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  &ldquo;{query.query_text}&rdquo;
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                    Found {query.sources_found} source{query.sources_found !== 1 ? 's' : ''}
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <span className="text-gray-500 dark:text-gray-400">
                    Run {query.times_run} time{query.times_run !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Exploration Queue Section
  if (section === 'exploration') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 h-full">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🔬</span>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Exploration Queue</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">New agent-suggested strategies awaiting testing</p>

        {explorationQueue.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No queries in queue.</p>
        ) : (
          <div className="space-y-3">
            {explorationQueue.map((query) => (
              <div key={query.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  &ldquo;{query.query_text}&rdquo;
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium">
                    Queued
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <span>
                    {formatDistanceToNow(new Date(query.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Both sections (default - stacked vertically)
  return (
    <div className="space-y-6">
      {/* Top Performing Queries */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🏆</span>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top Performing Queries</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">The agent&apos;s most successful searches</p>

        {topPerformers.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No successful queries yet.</p>
        ) : (
          <div className="space-y-3">
            {topPerformers.map((query) => (
              <div key={query.id} className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 border border-emerald-100 dark:border-emerald-800">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  &ldquo;{query.query_text}&rdquo;
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                    Found {query.sources_found} source{query.sources_found !== 1 ? 's' : ''}
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <span className="text-gray-500 dark:text-gray-400">
                    Run {query.times_run} time{query.times_run !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Exploration Queue */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🔬</span>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Exploration Queue</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">New agent-suggested strategies awaiting testing</p>

        {explorationQueue.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No queries in queue.</p>
        ) : (
          <div className="space-y-3">
            {explorationQueue.map((query) => (
              <div key={query.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  &ldquo;{query.query_text}&rdquo;
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium">
                    Queued
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <span>
                    {formatDistanceToNow(new Date(query.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
