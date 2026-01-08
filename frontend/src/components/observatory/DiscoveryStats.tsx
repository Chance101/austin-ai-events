'use client';

import { formatDistanceToNow } from 'date-fns';
import { Source } from '@/types/observatory';

interface DiscoveryStatsProps {
  totalSources: number;
  recentSources: Source[];
  sourcesThisWeek: number;
  loading: boolean;
}

function getTrustBadge(score: number | null) {
  if (score === null) return { color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400', label: 'Unknown' };
  if (score >= 0.8) return { color: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200', label: 'High' };
  if (score >= 0.6) return { color: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200', label: 'Medium' };
  return { color: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200', label: 'Low' };
}

export default function DiscoveryStats({
  totalSources,
  recentSources,
  sourcesThisWeek,
  loading,
}: DiscoveryStatsProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 h-full flex flex-col">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Discovery Stats</h3>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalSources}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Trusted sources</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{sourcesThisWeek}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Found this week</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Recently Discovered</h4>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Confidence</span>
      </div>

      {recentSources.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No sources discovered yet.</p>
      ) : (
        <div className="space-y-3">
          {recentSources.map((source) => {
            const badge = getTrustBadge(source.trust_score);
            return (
              <div key={source.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 line-clamp-1"
                  >
                    {source.name}
                  </a>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDistanceToNow(new Date(source.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  {source.trust_score !== null && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {(source.trust_score * 100).toFixed(0)}%
                    </span>
                  )}
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
