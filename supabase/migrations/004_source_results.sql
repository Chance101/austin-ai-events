-- Migration: Add source_results JSONB column to agent_runs
-- Stores per-source event counts for each run, enabling observability
-- into which scrapers are producing events vs silently failing

ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS source_results JSONB DEFAULT '[]'::jsonb;
