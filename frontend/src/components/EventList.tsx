'use client';

import { useState, useEffect } from 'react';
import { addDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { Event, EventFilters as Filters } from '@/types/event';
import EventCard from './EventCard';
import EventFilters from './EventFilters';
import EventModal from './EventModal';

export default function EventList() {
  const [events, setEvents] = useState<Event[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  useEffect(() => {
    fetchEvents();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, showAll]);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);

    if (!supabase) {
      setError('Database connection not configured.');
      setLoading(false);
      return;
    }

    try {
      const now = new Date();
      const thirtyDaysFromNow = addDays(now, 30);

      let query = supabase
        .from('events')
        .select('*')
        .gte('start_time', now.toISOString())
        .order('start_time', { ascending: true });

      // Only filter to 30 days if not showing all
      if (!showAll) {
        query = query.lte('start_time', thirtyDaysFromNow.toISOString());
      }

      if (filters.audience && filters.audience.length > 0) {
        query = query.overlaps('audience_type', filters.audience);
      }

      if (filters.technicalLevel && filters.technicalLevel.length > 0) {
        query = query.in('technical_level', filters.technicalLevel);
      }

      if (filters.isFree) {
        query = query.eq('is_free', true);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        throw queryError;
      }

      setEvents(data || []);
    } catch (err) {
      console.error('Error fetching events:', err);
      setError('Failed to load events. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <aside className="lg:w-64 flex-shrink-0">
        <EventFilters filters={filters} onFilterChange={setFilters} />
      </aside>

      <main className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        ) : events.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-gray-600">No upcoming events found.</p>
            <p className="text-sm text-gray-500 mt-2">
              Try adjusting your filters or check back later.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {events.length} upcoming event{events.length !== 1 ? 's' : ''}
              {!showAll && ' in the next 30 days'}
            </p>
            <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onClick={() => setSelectedEvent(event)}
                />
              ))}
            </div>
            {!showAll && (
              <div className="text-center pt-4">
                <button
                  onClick={() => setShowAll(true)}
                  className="px-6 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  Show all upcoming events
                </button>
              </div>
            )}
            {showAll && (
              <div className="text-center pt-4">
                <button
                  onClick={() => setShowAll(false)}
                  className="px-6 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Show next 30 days only
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
