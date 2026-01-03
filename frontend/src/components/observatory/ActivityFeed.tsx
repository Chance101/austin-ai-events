'use client';

import { formatDistanceToNow } from 'date-fns';
import { Event } from '@/types/event';

interface ActivityFeedProps {
  events: Event[];
  loading: boolean;
}

const audienceLabels: Record<string, string> = {
  developers: 'Developers',
  business: 'Business',
  researchers: 'Researchers',
  general: 'General',
  students: 'Students',
};

const levelColors: Record<string, string> = {
  beginner: 'bg-green-100 text-green-800',
  intermediate: 'bg-yellow-100 text-yellow-800',
  advanced: 'bg-red-100 text-red-800',
  'all-levels': 'bg-blue-100 text-blue-800',
};

const sourceLabels: Record<string, string> = {
  'aicamp': 'AICamp',
  'aitx': 'AITX',
  'hackai': 'HackAI',
  'austin-langchain': 'Austin LangChain',
  'ai-automation': 'AI Automation',
  'capital-factory': 'Capital Factory',
  'ut-austin': 'UT Austin',
  'austin-forum': 'Austin Forum',
  'ai-accelerator': 'AI Accelerator',
  'austin-ai': 'Austin AI',
  'leaders-in-ai': 'Leaders in AI',
  'web-search': 'Web Search',
  'manual': 'Manual',
};

export default function ActivityFeed({ events, loading }: ActivityFeedProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
      <p className="text-sm text-gray-500 mb-4">Latest events added by the agent</p>

      {events.length === 0 ? (
        <p className="text-gray-500 text-sm">No recent events added.</p>
      ) : (
        <div className="space-y-4 max-h-[500px] overflow-y-auto">
          {events.map((event) => (
            <div key={event.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
              <a
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-gray-900 hover:text-blue-600 line-clamp-1"
              >
                {event.title}
              </a>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-gray-500">
                  from {sourceLabels[event.source] || event.source}
                </span>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">
                  {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${levelColors[event.technical_level] || levelColors['all-levels']}`}>
                  {event.technical_level.replace('-', ' ')}
                </span>
                {event.audience_type.slice(0, 2).map((audience) => (
                  <span
                    key={audience}
                    className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-700"
                  >
                    {audienceLabels[audience] || audience}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
