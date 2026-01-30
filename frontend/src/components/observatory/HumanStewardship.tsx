'use client';

import { useState } from 'react';
import { stewardshipLog, StewardshipEntry } from '@/data/evolutionLog';

const categoryConfig = {
  learning: {
    label: 'Learning',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    icon: '🧠',
  },
  optimization: {
    label: 'Optimization',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    icon: '⚡',
  },
  capability: {
    label: 'New Capability',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    icon: '✨',
  },
  foundation: {
    label: 'Foundation',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    icon: '🏗️',
  },
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function EntryCard({ entry, isExpanded, onToggle }: {
  entry: StewardshipEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const config = categoryConfig[entry.category];

  return (
    <div className="relative pl-8 pb-6 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

      {/* Timeline dot */}
      <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center text-sm z-10">
        {config.icon}
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header - always visible */}
        <button
          onClick={onToggle}
          className="w-full p-4 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
              {config.label}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatDate(entry.date)}
            </span>
            <span className="ml-auto text-gray-400 dark:text-gray-500">
              {isExpanded ? '▼' : '▶'}
            </span>
          </div>
          <h4 className="font-semibold text-gray-900 dark:text-white">
            {entry.title}
          </h4>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
            {/* Problem */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-red-500">❌</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Problem Identified
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 pl-6">
                {entry.problem}
              </p>
            </div>

            {/* Action */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-blue-500">🛠️</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Action Taken
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 pl-6">
                {entry.action}
              </p>
            </div>

            {/* Result */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-green-500">✅</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Result
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 pl-6">
                {entry.result}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HumanStewardship() {
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(stewardshipLog[0]?.id || null);

  const displayedEntries = showAll ? stewardshipLog : stewardshipLog.slice(0, 5);
  const hasMore = stewardshipLog.length > 5;

  const handleToggle = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Count by category
  const categoryCounts = stewardshipLog.reduce((acc, entry) => {
    acc[entry.category] = (acc[entry.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Human Stewardship
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            How humans guide the agent&apos;s growth using Claude Code
          </p>
        </div>
        <div className="text-2xl">🤝</div>
      </div>

      {/* Category summary */}
      <div className="flex flex-wrap gap-2 mb-6">
        {Object.entries(categoryConfig).map(([key, config]) => (
          <span
            key={key}
            className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}
          >
            {config.icon} {categoryCounts[key] || 0} {config.label}
          </span>
        ))}
      </div>

      {/* Timeline */}
      <div className={`${showAll ? 'max-h-[600px] overflow-y-auto pr-2' : ''}`}>
        {displayedEntries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            isExpanded={expandedId === entry.id}
            onToggle={() => handleToggle(entry.id)}
          />
        ))}
      </div>

      {/* Show more button */}
      {hasMore && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
          >
            {showAll ? 'Show recent only' : `Show all ${stewardshipLog.length} entries`}
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          This agent is developed iteratively with{' '}
          <a
            href="https://claude.ai/code"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Claude Code
          </a>
          . The collaboration is part of the project&apos;s identity.
        </p>
      </div>
    </div>
  );
}
