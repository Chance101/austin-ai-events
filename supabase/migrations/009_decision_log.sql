-- Store per-run decision summary on agent_runs
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS decision_summary JSONB DEFAULT '{}'::jsonb;
