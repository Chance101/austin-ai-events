'use client';

import { useState } from 'react';
import { evolutionLog, EvolutionEntry } from '@/data/evolutionLog';

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

function EntryCard({ entry }: { entry: EvolutionEntry }) {
  const config = categoryConfig[entry.category];

  return (
    <div className="relative pl-8 pb-8 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700 last:hidden" />

      {/* Timeline dot */}
      <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center text-sm">
        {config.icon}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
            {config.label}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatDate(entry.date)}
          </span>
        </div>
        <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
          {entry.title}
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {entry.description}
        </p>
      </div>
    </div>
  );
}

export default function EvolutionLog() {
  const [showAll, setShowAll] = useState(false);
  const displayedEntries = showAll ? evolutionLog : evolutionLog.slice(0, 5);
  const hasMore = evolutionLog.length > 5;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Evolution Log
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            How the agent has learned and improved over time
          </p>
        </div>
        <div className="text-2xl">📈</div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className={`${showAll ? 'max-h-[600px] overflow-y-auto' : ''}`}>
          {displayedEntries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      </div>

      {hasMore && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
          >
            {showAll ? `Show less` : `Show all ${evolutionLog.length} entries`}
          </button>
        </div>
      )}

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
        </p>
      </div>
    </div>
  );
}
