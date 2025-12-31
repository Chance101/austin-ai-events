'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Event, EventFilters as Filters } from '@/types/event';
import EventCard from './EventCard';
import EventFilters from './EventFilters';

export default function EventList() {
  const [events, setEvents] = useState<Event[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents();
  }, [filters]);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);

    if (!supabase) {
      setError('Database connection not configured.');
      setLoading(false);
      return;
    }

    try {
      let query = supabase
        .from('events')
        .select('*')
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });

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
            </p>
            <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
