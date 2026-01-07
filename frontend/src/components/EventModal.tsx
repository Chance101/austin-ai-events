'use client';

import { useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { Event } from '@/types/event';

const AUSTIN_TIMEZONE = 'America/Chicago';

interface EventModalProps {
  event: Event;
  onClose: () => void;
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

function getLocation(event: Event): string | null {
  return event.venue_name || event.location || event.address || null;
}

function getFullAddress(event: Event): string | null {
  const parts = [event.venue_name, event.address, event.location].filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(', ') : null;
}

export default function EventModal({ event, onClose }: EventModalProps) {
  const startDate = new Date(event.start_time);
  const location = getLocation(event);
  const fullAddress = getFullAddress(event);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 text-center bg-blue-50 rounded-lg p-3 min-w-[70px]">
              <div className="text-sm font-medium text-blue-600 uppercase">
                {formatInTimeZone(startDate, AUSTIN_TIMEZONE, 'MMM')}
              </div>
              <div className="text-2xl font-bold text-blue-700">
                {formatInTimeZone(startDate, AUSTIN_TIMEZONE, 'd')}
              </div>
              <div className="text-xs text-blue-500">
                {formatInTimeZone(startDate, AUSTIN_TIMEZONE, 'EEE')}
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {event.title}
              </h2>
              {event.organizer && (
                <p className="text-sm text-gray-500 mt-1">
                  by {event.organizer}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {/* Date & Time */}
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium text-gray-900">
                {formatInTimeZone(startDate, AUSTIN_TIMEZONE, 'EEEE, MMMM d, yyyy')}
              </p>
              <p className="text-gray-600">
                {formatInTimeZone(startDate, AUSTIN_TIMEZONE, 'h:mm a')}
                {event.end_time && ` - ${formatInTimeZone(new Date(event.end_time), AUSTIN_TIMEZONE, 'h:mm a')}`}
              </p>
            </div>
          </div>

          {/* Location */}
          {fullAddress && (
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-gray-700">{fullAddress}</p>
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            <span className={`px-3 py-1 text-sm font-medium rounded-full capitalize ${levelColors[event.technical_level] || levelColors['all-levels']}`}>
              {event.technical_level.replace('-', ' ')}
            </span>

            {event.audience_type.map((audience) => (
              <span
                key={audience}
                className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-700"
              >
                {audienceLabels[audience] || audience}
              </span>
            ))}

            {event.is_free === true && (
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-emerald-100 text-emerald-800">
                Free
              </span>
            )}
            {event.is_free === false && (
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-amber-100 text-amber-800">
                {event.price || 'Paid'}
              </span>
            )}
          </div>

          {/* Description */}
          {event.description && (
            <div className="pt-2">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">
                About This Event
              </h3>
              <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                {event.description}
              </div>
            </div>
          )}
        </div>

        {/* Footer with CTA */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            View Event Page
            <svg className="inline-block w-4 h-4 ml-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
