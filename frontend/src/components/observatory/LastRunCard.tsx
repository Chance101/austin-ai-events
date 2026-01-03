'use client';

import { formatDistanceToNow } from 'date-fns';
import { AgentRun } from '@/types/observatory';

interface LastRunCardProps {
  run: AgentRun | null;
  loading: boolean;
}

export default function LastRunCard({ run, loading }: LastRunCardProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900">Last Run</h3>
        <p className="text-gray-500 mt-2">No runs recorded yet.</p>
      </div>
    );
  }

  const hasErrors = run.errors > 0;
  const durationMinutes = run.run_duration_seconds
    ? Math.round(run.run_duration_seconds / 60)
    : null;

  return (
    <div className={`bg-white rounded-lg shadow-md border ${hasErrors ? 'border-amber-300' : 'border-gray-200'} p-6`}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Last Run</h3>
          <p className="text-sm text-gray-500 mt-1">
            {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          hasErrors
            ? 'bg-amber-100 text-amber-800'
            : 'bg-green-100 text-green-800'
        }`}>
          {hasErrors ? `${run.errors} error${run.errors > 1 ? 's' : ''}` : 'Success'}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-2xl font-bold text-gray-900">{run.events_discovered}</p>
          <p className="text-sm text-gray-500">Events found</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-blue-600">{run.events_added}</p>
          <p className="text-sm text-gray-500">Events added</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{run.sources_scraped}</p>
          <p className="text-sm text-gray-500">Sources checked</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">
            {durationMinutes !== null ? `${durationMinutes}m` : '-'}
          </p>
          <p className="text-sm text-gray-500">Duration</p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Queries run:</span>
          <span className="ml-1 font-medium">{run.queries_run}</span>
        </div>
        <div>
          <span className="text-gray-500">New sources:</span>
          <span className="ml-1 font-medium">{run.new_sources_found}</span>
        </div>
        <div>
          <span className="text-gray-500">Claude calls:</span>
          <span className="ml-1 font-medium">{run.claude_api_calls}</span>
        </div>
        <div>
          <span className="text-gray-500">Duplicates:</span>
          <span className="ml-1 font-medium">{run.duplicates_skipped}</span>
        </div>
      </div>

      {hasErrors && run.error_messages.length > 0 && (
        <div className="mt-4 p-3 bg-amber-50 rounded-lg">
          <p className="text-sm font-medium text-amber-800">Errors:</p>
          <ul className="mt-1 text-sm text-amber-700 list-disc list-inside">
            {run.error_messages.slice(0, 3).map((msg, i) => (
              <li key={i} className="truncate">{msg}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
