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
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 animate-pulse h-full">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  // Top Performers Section
  if (section === 'top-performers') {
    return (
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 h-full">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🏆</span>
          <h3 className="text-lg font-semibold text-gray-900">Top Performing Queries</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">The agent&apos;s most successful searches</p>

        {topPerformers.length === 0 ? (
          <p className="text-gray-500 text-sm">No successful queries yet.</p>
        ) : (
          <div className="space-y-3">
            {topPerformers.map((query) => (
              <div key={query.id} className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                <p className="text-sm font-medium text-gray-900">
                  &ldquo;{query.query_text}&rdquo;
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-emerald-700 font-medium">
                    Found {query.sources_found} source{query.sources_found !== 1 ? 's' : ''}
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-500">
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
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 h-full">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🔬</span>
          <h3 className="text-lg font-semibold text-gray-900">Exploration Queue</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">New strategies awaiting testing</p>

        {explorationQueue.length === 0 ? (
          <p className="text-gray-500 text-sm">No queries in queue.</p>
        ) : (
          <div className="space-y-3">
            {explorationQueue.map((query) => (
              <div key={query.id} className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-900">
                  &ldquo;{query.query_text}&rdquo;
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                    Queued
                  </span>
                  <span className="text-gray-300">|</span>
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
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🏆</span>
          <h3 className="text-lg font-semibold text-gray-900">Top Performing Queries</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">The agent&apos;s most successful searches</p>

        {topPerformers.length === 0 ? (
          <p className="text-gray-500 text-sm">No successful queries yet.</p>
        ) : (
          <div className="space-y-3">
            {topPerformers.map((query) => (
              <div key={query.id} className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                <p className="text-sm font-medium text-gray-900">
                  &ldquo;{query.query_text}&rdquo;
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-emerald-700 font-medium">
                    Found {query.sources_found} source{query.sources_found !== 1 ? 's' : ''}
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-500">
                    Run {query.times_run} time{query.times_run !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Exploration Queue */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🔬</span>
          <h3 className="text-lg font-semibold text-gray-900">Exploration Queue</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">New strategies awaiting testing</p>

        {explorationQueue.length === 0 ? (
          <p className="text-gray-500 text-sm">No queries in queue.</p>
        ) : (
          <div className="space-y-3">
            {explorationQueue.map((query) => (
              <div key={query.id} className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-900">
                  &ldquo;{query.query_text}&rdquo;
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                    Queued
                  </span>
                  <span className="text-gray-300">|</span>
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
