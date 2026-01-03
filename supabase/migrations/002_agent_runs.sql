-- Migration: Create agent_runs table for run logging
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Run metadata
  run_type TEXT DEFAULT 'scheduled',  -- 'scheduled', 'manual', 'test'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  run_duration_seconds INTEGER,

  -- Source discovery stats
  queries_run INTEGER DEFAULT 0,
  new_sources_found INTEGER DEFAULT 0,
  new_queries_generated INTEGER DEFAULT 0,

  -- Event scraping stats
  sources_scraped INTEGER DEFAULT 0,
  events_discovered INTEGER DEFAULT 0,
  events_validated INTEGER DEFAULT 0,
  events_added INTEGER DEFAULT 0,
  events_updated INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,

  -- Error tracking
  errors INTEGER DEFAULT 0,
  error_messages JSONB DEFAULT '[]'::jsonb,

  -- API usage tracking
  claude_api_calls INTEGER DEFAULT 0,
  serpapi_calls INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying recent runs
CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at
ON agent_runs (started_at DESC);

-- Index for filtering by run type
CREATE INDEX IF NOT EXISTS idx_agent_runs_type
ON agent_runs (run_type);

-- RLS policies
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

-- Public can read run logs
CREATE POLICY "Agent runs are publicly readable"
  ON agent_runs
  FOR SELECT
  USING (true);

-- Only service role can insert/update
CREATE POLICY "Service role can manage agent runs"
  ON agent_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Grant access
GRANT SELECT ON agent_runs TO anon;
GRANT ALL ON agent_runs TO service_role;
