-- Phase 3: External watchdog repo
--
-- The watchdog lives in a separate repository (austin-ai-events-watchdog)
-- outside this project's modification scope. It runs on its own cron
-- and writes liveness/coverage findings here via service role key.
--
-- This table is read-only to the main system's code (the watchdog is
-- the sole writer in normal operation). Keeping the table in this repo
-- is fine — the WATCHDOG CODE lives elsewhere, which is what matters
-- for the isolation guarantee.

CREATE TABLE IF NOT EXISTS coverage_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Liveness snapshot (what our DB looked like at audit time)
  events_in_db INTEGER NOT NULL,
  liveness_status TEXT,  -- 'healthy' | 'degraded' | 'empty' | 'error'

  -- Coverage vs external source (luma.com/austin for v1)
  events_on_luma INTEGER,
  coverage_percentage NUMERIC,
  gap_event_titles TEXT[],

  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_coverage_audits_recent
  ON coverage_audits (created_at DESC);

-- RLS
ALTER TABLE coverage_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coverage audits publicly readable"
  ON coverage_audits FOR SELECT USING (true);

CREATE POLICY "Service role can manage coverage audits"
  ON coverage_audits FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON coverage_audits TO anon;
GRANT ALL ON coverage_audits TO service_role;
