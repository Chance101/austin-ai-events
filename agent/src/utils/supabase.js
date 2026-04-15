import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

let supabase = null;

export function getSupabase() {
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }
  return supabase;
}

/**
 * Kill switch — when READONLY_MODE=1, all pipeline database writes are
 * suppressed and logged. The agent still runs, scrapes, validates, and
 * classifies, but nothing is written to Supabase. Used for observation,
 * debugging, and "what would the system do" experiments without touching
 * production data. Survives every code path because it's checked at each
 * write call site.
 */
export function isReadOnlyMode() {
  return process.env.READONLY_MODE === '1';
}

function logReadOnlySkip(operation, payload) {
  let preview = '';
  try {
    preview = typeof payload === 'object' && payload !== null
      ? JSON.stringify(payload).substring(0, 200)
      : String(payload).substring(0, 200);
  } catch {
    preview = '[unserializable]';
  }
  console.warn(`  🔒 READONLY_MODE: ${operation} skipped — ${preview}`);
}

export async function upsertEvent(event) {
  if (isReadOnlyMode()) {
    logReadOnlySkip('upsertEvent', { title: event.title, url: event.url });
    return { ...event, id: 'readonly-mock', _readonly: true };
  }

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
    .select('id, title, start_time, end_time, source, source_event_id, url, venue_name, address, organizer')
    // Include past 30 days so recently-passed events are still caught by dedup
    .gte('start_time', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    // Exclude soft-deleted rows — the reconciler merges dupes via deleted_at,
    // and resurrecting them via dedup collision would undo the merge.
    .is('deleted_at', null);

  if (error) {
    console.error('Error fetching existing events:', error);
    throw error;
  }

  return data || [];
}

/**
 * Update key fields on an existing event (date moved, venue changed, etc.)
 */
export async function updateEventFields(eventId, fields) {
  if (isReadOnlyMode()) {
    logReadOnlySkip('updateEventFields', { eventId, fields });
    return;
  }

  const db = getSupabase();

  const { error } = await db
    .from('events')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', eventId);

  if (error) {
    console.error('Error updating event fields:', error);
    throw error;
  }
}

export async function markEventAsVerified(eventId) {
  if (isReadOnlyMode()) {
    logReadOnlySkip('markEventAsVerified', { eventId });
    return;
  }

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
  if (isReadOnlyMode()) {
    logReadOnlySkip('logAgentRun', { runType: stats.runType, eventsAdded: stats.eventsAdded });
    return null;
  }

  const db = getSupabase();
  const now = new Date().toISOString();
  const runDuration = Math.round((Date.now() - stats.startTime) / 1000);

  const { data, error } = await db
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
      source_results: stats.sourceResults || [],
      decision_summary: stats.decisionSummary || {},
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to log agent run:', error.message);
    return null;
  }

  console.log(`\n✅ Run logged to agent_runs table (${runDuration}s)`);
  return data;
}
