import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

let supabase = null;

export function getSupabase() {
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }
  return supabase;
}

export async function upsertEvent(event) {
  const db = getSupabase();

  const { data, error } = await db
    .from('events')
    .upsert(event, {
      onConflict: 'source,source_event_id',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Error upserting event:', error);
    throw error;
  }

  return data;
}

export async function getExistingEvents() {
  const db = getSupabase();

  const { data, error } = await db
    .from('events')
    .select('id, title, start_time, source, source_event_id, url')
    .gte('start_time', new Date().toISOString());

  if (error) {
    console.error('Error fetching existing events:', error);
    throw error;
  }

  return data || [];
}

export async function markEventAsVerified(eventId) {
  const db = getSupabase();

  const { error } = await db
    .from('events')
    .update({ is_verified: true, updated_at: new Date().toISOString() })
    .eq('id', eventId);

  if (error) {
    console.error('Error marking event as verified:', error);
    throw error;
  }
}
