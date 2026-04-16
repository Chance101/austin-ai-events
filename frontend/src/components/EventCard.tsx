'use client';

import { formatInTimeZone } from 'date-fns-tz';
import { Event } from '@/types/event';

const AUSTIN_TIMEZONE = 'America/Chicago';

interface EventCardProps {
  event: Event;
  onClick: () => void;
}

const audienceLabels: Record<string, string> = {
  developers: 'Developers',
  business: 'Business',
  researchers: 'Researchers',
  general: 'General',
  students: 'Students',
};

const levelColors: Record<string, string> = {
  beginner: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  intermediate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  advanced: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'all-levels': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

/**
 * Clean description text by removing markdown and creating a summary
 */
function cleanDescription(text: string | null): string | null {
  if (!text) return null;

  // Remove markdown bold/italic markers
  let cleaned = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** -> bold
    .replace(/\*([^*]+)\*/g, '$1')       // *italic* -> italic
    .replace(/__([^_]+)__/g, '$1')       // __bold__ -> bold
    .replace(/_([^_]+)_/g, '$1')         // _italic_ -> italic
    .replace(/#{1,6}\s*/g, '')           // Remove headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [link](url) -> link
    .replace(/```[\s\S]*?```/g, '')      // Remove code blocks
    .replace(/`([^`]+)`/g, '$1')         // `code` -> code
    .replace(/\\n/g, ' ')                // \n -> space
    .replace(/\n/g, ' ')                 // newlines -> space
    .replace(/\s+/g, ' ')                // multiple spaces -> single
    .trim();

  // Take first 200 chars for a clean summary
  if (cleaned.length > 200) {
    cleaned = cleaned.substring(0, 200).replace(/\s+\S*$/, '') + '...';
  }

  return cleaned;
}

/**
 * Get the best available location string
 */
function getLocation(event: Event): string | null {
  return event.venue_name || event.location || event.address || null;
}

export default function EventCard({ event, onClick }: EventCardProps) {
  const startDate = new Date(event.start_time);
  const location = getLocation(event);
  const description = cleanDescription(event.description);

  return (
    <button
      onClick={onClick}
      className="block w-full text-left bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-shrink-0 text-center bg-gray-50 dark:bg-gray-700 rounded-lg p-3 min-w-[70px]">
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase">
              {formatInTimeZone(startDate, AUSTIN_TIMEZONE, 'MMM')}
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatInTimeZone(startDate, AUSTIN_TIMEZONE, 'd')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {formatInTimeZone(startDate, AUSTIN_TIMEZONE, 'EEE')}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">
              {event.title}
            </h3>

            <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {formatInTimeZone(startDate, AUSTIN_TIMEZONE, 'h:mm a')}
              {event.end_time && ` - ${formatInTimeZone(new Date(event.end_time), AUSTIN_TIMEZONE, 'h:mm a')}`}
            </div>

            {location && (
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 flex items-start gap-1">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{location}</span>
              </div>
            )}

            {event.organizer && (
              <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                by {event.organizer}
              </div>
            )}
          </div>
        </div>

        {description && (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
            {description}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`px-2 py-1 text-xs font-medium rounded capitalize ${levelColors[event.technical_level] || levelColors['all-levels']}`}>
            {event.technical_level.replace('-', ' ')}
          </span>

          {event.audience_type.slice(0, 2).map((audience) => (
            <span
              key={audience}
              className="px-2 py-1 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
            >
              {audienceLabels[audience] || audience}
            </span>
          ))}

          {event.is_free === true && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
              Free
            </span>
          )}
          {event.is_free === false && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
              Paid
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
