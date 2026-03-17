'use client';

import { useState } from 'react';
import { HumanActionItem } from '@/types/observatory';
import { formatDistanceToNow } from 'date-fns';

interface HumanActionItemsProps {
  items: HumanActionItem[];
  loading: boolean;
}

const severityConfig: Record<string, { icon: string; bg: string; border: string; text: string }> = {
  critical: { icon: '!!!', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', text: 'text-red-800 dark:text-red-200' },
  warning: { icon: '!', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-800 dark:text-amber-200' },
  info: { icon: 'i', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-800 dark:text-blue-200' },
};

const categoryLabels: Record<string, string> = {
  broken_scraper: 'Broken Scraper',
  new_platform: 'New Platform',
  strategy: 'Strategy',
  data_quality: 'Data Quality',
  general: 'General',
};

function ActionItemCard({ item }: { item: HumanActionItem }) {
  const config = severityConfig[item.severity] || severityConfig.info;
  const isResolved = item.is_resolved;

  return (
    <div className={`p-4 rounded-lg ${isResolved ? 'bg-gray-50 dark:bg-gray-800/30 opacity-75' : config.bg} border ${isResolved ? 'border-gray-200 dark:border-gray-700' : config.border}`}>
      <div className="flex items-start gap-3">
        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 mt-0.5 ${
          isResolved
            ? 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : `${config.text} ${config.bg} border ${config.border}`
        }`}>
          {isResolved ? '✓' : config.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-sm font-semibold ${isResolved ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>
              {item.title}
            </span>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${isResolved ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' : `${config.bg} ${config.text}`}`}>
              {categoryLabels[item.category] || item.category}
            </span>
            {isResolved && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                Resolved
              </span>
            )}
          </div>
          <p className={`text-sm mb-2 ${isResolved ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
            {item.description}
          </p>
          {!isResolved && item.suggested_fix && (
            <div className="text-xs text-gray-600 dark:text-gray-400 p-2 bg-white/50 dark:bg-gray-800/50 rounded border border-gray-200 dark:border-gray-700">
              <span className="font-medium">Suggested fix: </span>
              {item.suggested_fix}
            </div>
          )}
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {isResolved
              ? `Resolved ${item.resolved_at ? formatDistanceToNow(new Date(item.resolved_at), { addSuffix: true }) : ''}`
              : `Escalated ${formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}`
            }
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HumanActionItems({ items, loading }: HumanActionItemsProps) {
  const [showResolved, setShowResolved] = useState(false);

  const unresolvedItems = items.filter(item => !item.is_resolved);
  const resolvedItems = items.filter(item => item.is_resolved);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  if (unresolvedItems.length === 0 && resolvedItems.length === 0) {
    return null;
  }

  // Sort unresolved by severity (critical first), then by date (newest first)
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const sortedUnresolved = [...unresolvedItems].sort((a, b) => {
    const sevDiff = (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2);
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Sort resolved by resolved_at (newest first)
  const sortedResolved = [...resolvedItems].sort((a, b) =>
    new Date(b.resolved_at || b.created_at).getTime() - new Date(a.resolved_at || a.created_at).getTime()
  );

  const criticalCount = sortedUnresolved.filter(i => i.severity === 'critical').length;
  const hasUnresolved = sortedUnresolved.length > 0;

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 ${
      hasUnresolved
        ? criticalCount > 0
          ? 'border-red-300 dark:border-red-700'
          : 'border-amber-300 dark:border-amber-700'
        : 'border-gray-200 dark:border-gray-700'
    } p-6`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            Needs Attention
            {hasUnresolved && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                criticalCount > 0
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              }`}>
                {unresolvedItems.length} item{unresolvedItems.length > 1 ? 's' : ''}
              </span>
            )}
            {!hasUnresolved && resolvedItems.length > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                All clear
              </span>
            )}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {hasUnresolved
              ? 'Issues the agent escalated for human review'
              : 'All escalated issues have been resolved by the agent'
            }
          </p>
        </div>
        <div className="text-2xl">
          {hasUnresolved ? (criticalCount > 0 ? '🚨' : '👋') : '✅'}
        </div>
      </div>

      {/* Unresolved items */}
      {sortedUnresolved.length > 0 && (
        <div className="space-y-3">
          {sortedUnresolved.map((item) => (
            <ActionItemCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Resolved items — collapsed by default, not auto-loaded */}
      {sortedResolved.length > 0 && (
        <div className={`${hasUnresolved ? 'mt-4 pt-4 border-t border-gray-200 dark:border-gray-700' : ''}`}>
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <span className="text-xs">{showResolved ? '▼' : '▶'}</span>
            <span>{sortedResolved.length} resolved item{sortedResolved.length > 1 ? 's' : ''}</span>
          </button>
          {showResolved && (
            <div className="mt-3 space-y-2">
              {sortedResolved.map((item) => (
                <ActionItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
