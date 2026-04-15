-- Phase 4: Dedup reconciler support
--
-- Two additions to enable post-hoc reconciliation of duplicate rows:
--
-- 1. Soft-delete fields on events. The reconciler never hard-deletes data
--    (per user feedback: "don't guess canonical row — the cost of a wrong
--    delete is lost correct data"). It marks losers with deleted_at and
--    merged_into_id so the merge trail is preserved and recoverable.
--    All live queries filter WHERE deleted_at IS NULL.
--
-- 2. dedup_trace table. One row per ingestion-time dedup decision with
--    the candidates considered, best match, decision, and reason. Makes
--    root-cause investigation of "why didn't dedup catch this" possible
--    instead of re-running with instrumentation.

-- Soft-delete columns on events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES events(id);

-- Index for fast "live events only" queries
CREATE INDEX IF NOT EXISTS idx_events_live
  ON events (start_time)
  WHERE deleted_at IS NULL;

-- Per-ingestion dedup trace table
CREATE TABLE IF NOT EXISTS dedup_trace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  run_id UUID REFERENCES agent_runs(id),

  -- The incoming event being dedup-checked
  event_title TEXT NOT NULL,
  event_url TEXT,
  event_source TEXT,
  event_start_time TIMESTAMPTZ,

  -- What the dedup layer found
  candidates_considered JSONB,     -- [{id, title, source, match_score, reason}, ...]
  best_match_id UUID REFERENCES events(id),
  best_match_score NUMERIC,

  -- Outcome
  stage TEXT NOT NULL,             -- hash, exact, same_source, cross_source, fuzzy, reconciler
  outcome TEXT NOT NULL,           -- accepted, duplicate, updated, merged, skipped
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_dedup_trace_run
  ON dedup_trace (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dedup_trace_best_match
  ON dedup_trace (best_match_id)
  WHERE best_match_id IS NOT NULL;

-- RLS (same pattern as other tables)
ALTER TABLE dedup_trace ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dedup trace is publicly readable"
  ON dedup_trace FOR SELECT USING (true);

CREATE POLICY "Service role can manage dedup trace"
  ON dedup_trace FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON dedup_trace TO anon;
GRANT ALL ON dedup_trace TO service_role;
