'use client';

import { format } from 'date-fns';
import { Event } from '@/types/event';

interface EventCardProps {
  event: Event;
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

export default function EventCard({ event }: EventCardProps) {
  const startDate = new Date(event.start_time);

  return (
    <a
      href={event.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200 overflow-hidden"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-shrink-0 text-center bg-gray-50 rounded-lg p-3 min-w-[70px]">
            <div className="text-sm font-medium text-gray-500 uppercase">
              {format(startDate, 'MMM')}
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {format(startDate, 'd')}
            </div>
            <div className="text-xs text-gray-500">
              {format(startDate, 'EEE')}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {event.title}
            </h3>

            <div className="mt-1 text-sm text-gray-600">
              {format(startDate, 'h:mm a')}
              {event.end_time && ` - ${format(new Date(event.end_time), 'h:mm a')}`}
            </div>

            {event.venue_name && (
              <div className="mt-1 text-sm text-gray-500 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {event.venue_name}
              </div>
            )}

            {event.organizer && (
              <div className="mt-1 text-sm text-gray-500">
                by {event.organizer}
              </div>
            )}
          </div>
        </div>

        {event.description && (
          <p className="mt-3 text-sm text-gray-600 line-clamp-2">
            {event.description}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`px-2 py-1 text-xs font-medium rounded ${levelColors[event.technical_level] || levelColors['all-levels']}`}>
            {event.technical_level.replace('-', ' ')}
          </span>

          {event.audience_type.slice(0, 2).map((audience) => (
            <span
              key={audience}
              className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700"
            >
              {audienceLabels[audience] || audience}
            </span>
          ))}

          {event.is_free && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-emerald-100 text-emerald-800">
              Free
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
