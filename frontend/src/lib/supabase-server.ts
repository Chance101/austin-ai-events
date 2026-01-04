import { createClient } from '@supabase/supabase-js';
import { addDays } from 'date-fns';
import { Event } from '@/types/event';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Fetch events server-side for ISR/SSG
 * Returns events for the next 30 days by default
 */
export async function fetchEventsServer(): Promise<Event[]> {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase environment variables not set');
    return [];
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const now = new Date();
  const thirtyDaysFromNow = addDays(now, 30);

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gte('start_time', now.toISOString())
    .lte('start_time', thirtyDaysFromNow.toISOString())
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error fetching events:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetch all upcoming events (no 30-day limit)
 */
export async function fetchAllEventsServer(): Promise<Event[]> {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase environment variables not set');
    return [];
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const now = new Date();

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gte('start_time', now.toISOString())
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error fetching events:', error);
    return [];
  }

  return data || [];
}
