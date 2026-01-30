'use client';

import { Source } from '@/types/observatory';

interface SourceHealthProps {
  sources: Source[];
  loading: boolean;
}

const tierConfig = {
  config: {
    label: 'Config',
    color: 'bg-blue-500',
    textColor: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    description: 'Hardcoded, always trusted',
    icon: '⚙️',
  },
  trusted: {
    label: 'Trusted',
    color: 'bg-green-500',
    textColor: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    description: 'Earned trust, skips validation',
    icon: '✅',
  },
  probation: {
    label: 'Probation',
    color: 'bg-yellow-500',
    textColor: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    description: 'New sources, being evaluated',
    icon: '⏳',
  },
  demoted: {
    label: 'Demoted',
    color: 'bg-red-500',
    textColor: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    description: 'Poor performance, not scraped',
    icon: '⛔',
  },
};

function TierBar({ tier, count, total }: { tier: string; count: number; total: number }) {
  const config = tierConfig[tier as keyof typeof tierConfig];
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </div>
      <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${config.color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="w-12 text-right text-sm font-semibold text-gray-900 dark:text-white">
        {count}
      </div>
    </div>
  );
}

function SourceCard({ source, type }: { source: Source; type: 'promoted' | 'demoted' | 'struggling' }) {
  const tier = tierConfig[source.trust_tier];
  const passRate = source.validation_pass_count + source.validation_fail_count > 0
    ? Math.round((source.validation_pass_count / (source.validation_pass_count + source.validation_fail_count)) * 100)
    : null;

  // Extract domain from URL for display
  let displayName = source.name;
  if (!displayName) {
    try {
      const url = new URL(source.url);
      displayName = url.hostname.replace('www.', '');
    } catch {
      displayName = source.url;
    }
  }

  return (
    <div className={`p-3 rounded-lg ${tier.bgColor} border border-gray-200 dark:border-gray-700`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span>{tier.icon}</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {displayName}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            {passRate !== null && (
              <span className={passRate >= 80 ? 'text-green-600 dark:text-green-400' : passRate < 30 ? 'text-red-600 dark:text-red-400' : ''}>
                {passRate}% pass rate
              </span>
            )}
            {source.consecutive_empty_scrapes > 0 && (
              <span className="text-orange-600 dark:text-orange-400">
                {source.consecutive_empty_scrapes} empty scrapes
              </span>
            )}
            {type === 'promoted' && source.promoted_at && (
              <span className="text-green-600 dark:text-green-400">
                ↑ Promoted {new Date(source.promoted_at).toLocaleDateString()}
              </span>
            )}
            {type === 'demoted' && source.demoted_at && (
              <span className="text-red-600 dark:text-red-400">
                ↓ Demoted {new Date(source.demoted_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SourceHealth({ sources, loading }: SourceHealthProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-full">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-6 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Count sources by tier
  const tierCounts = sources.reduce((acc, source) => {
    const tier = source.trust_tier || 'probation';
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const total = sources.length;

  // Find recently promoted sources (promoted_at in last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const recentlyPromoted = sources
    .filter(s => s.promoted_at && new Date(s.promoted_at) > weekAgo)
    .sort((a, b) => new Date(b.promoted_at!).getTime() - new Date(a.promoted_at!).getTime())
    .slice(0, 3);

  // Find recently demoted sources
  const recentlyDemoted = sources
    .filter(s => s.demoted_at && new Date(s.demoted_at) > weekAgo)
    .sort((a, b) => new Date(b.demoted_at!).getTime() - new Date(a.demoted_at!).getTime())
    .slice(0, 3);

  // Find struggling sources (high fail rate or consecutive empty scrapes)
  const struggling = sources
    .filter(s => {
      const total = s.validation_pass_count + s.validation_fail_count;
      const passRate = total > 0 ? s.validation_pass_count / total : 1;
      return (total >= 5 && passRate < 0.5) || s.consecutive_empty_scrapes >= 3;
    })
    .slice(0, 3);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Source Health
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Trust distribution across {total} sources
          </p>
        </div>
        <div className="text-2xl">🏥</div>
      </div>

      {/* Trust tier distribution */}
      <div className="space-y-2 mb-6">
        {['config', 'trusted', 'probation', 'demoted'].map((tier) => (
          <TierBar
            key={tier}
            tier={tier}
            count={tierCounts[tier] || 0}
            total={total}
          />
        ))}
      </div>

      {/* Recent changes and struggling sources */}
      <div className="flex-1 space-y-4 overflow-hidden">
        {recentlyPromoted.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <span className="text-green-500">↑</span> Recently Promoted
            </h4>
            <div className="space-y-2">
              {recentlyPromoted.map((source) => (
                <SourceCard key={source.id} source={source} type="promoted" />
              ))}
            </div>
          </div>
        )}

        {recentlyDemoted.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <span className="text-red-500">↓</span> Recently Demoted
            </h4>
            <div className="space-y-2">
              {recentlyDemoted.map((source) => (
                <SourceCard key={source.id} source={source} type="demoted" />
              ))}
            </div>
          </div>
        )}

        {struggling.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <span className="text-orange-500">⚠️</span> Struggling Sources
            </h4>
            <div className="space-y-2">
              {struggling.map((source) => (
                <SourceCard key={source.id} source={source} type="struggling" />
              ))}
            </div>
          </div>
        )}

        {recentlyPromoted.length === 0 && recentlyDemoted.length === 0 && struggling.length === 0 && (
          <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
            No recent tier changes or issues
          </div>
        )}
      </div>
    </div>
  );
}
