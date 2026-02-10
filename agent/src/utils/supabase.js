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
    // Include past 30 days so recently-passed events are still caught by dedup
    .gte('start_time', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

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

/**
 * Log agent run statistics to the database
 */
export async function logAgentRun(stats) {
  const db = getSupabase();
  const now = new Date().toISOString();
  const runDuration = Math.round((Date.now() - stats.startTime) / 1000);

  const { error } = await db
    .from('agent_runs')
    .insert({
      run_type: stats.runType,
      started_at: new Date(stats.startTime).toISOString(),
      completed_at: now,
      run_duration_seconds: runDuration,
      queries_run: stats.queriesRun,
      new_sources_found: stats.newSourcesFound,
      new_queries_generated: stats.newQueriesGenerated,
      sources_scraped: stats.sourcesScraped,
      events_discovered: stats.eventsDiscovered,
      events_validated: stats.eventsValidated,
      events_added: stats.eventsAdded,
      events_updated: stats.eventsUpdated,
      duplicates_skipped: stats.duplicatesSkipped,
      errors: stats.errors,
      error_messages: stats.errorMessages,
      claude_api_calls: stats.claudeApiCalls,
      serpapi_calls: stats.serpapiCalls,
    });

  if (error) {
    console.error('Failed to log agent run:', error.message);
  } else {
    console.log(`\n✅ Run logged to agent_runs table (${runDuration}s)`);
  }
}
