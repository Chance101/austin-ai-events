-- Phase 1: Monitor-as-planner
--
-- When USE_PLANNER=1, the planner runs at the START of each cycle and
-- produces a structured run_plan that tells the pipeline what to do.
-- The pipeline reads this plan, executes it, and the monitor (still at
-- end of cycle) grades against the plan — "did what was planned happen"
-- instead of "did everything hardcoded happen."
--
-- The plan is persisted here so the monitor can join runs to their plans,
-- track predictions vs outcomes, and let the user inspect planner history.

CREATE TABLE IF NOT EXISTS run_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Link to the agent_run that executed this plan (set after the run)
  agent_run_id UUID REFERENCES agent_runs(id),

  -- The plan itself — structured JSON produced by the planner
  -- Schema (enforced at write time by planner.js):
  -- {
  --   config_sources: [{name, url, reason}],    -- which config sources to scrape this run
  --   extra_urls: [{url, parser_hint, reason}], -- additional URLs to probe inline
  --   event_queries: [{query_text, reason}],    -- event-search queries to run
  --   source_queries: [{query_text, reason}],   -- source-discovery queries to run
  --   notes: string,                            -- planner's rationale
  --   predictions: [                            -- falsifiable hypotheses about this run
  --     {hypothesis, expected_outcome, how_to_verify}
  --   ]
  -- }
  plan JSONB NOT NULL,

  -- Summary of what happened when the plan was executed (written after the run)
  execution_summary JSONB,

  -- Cost tracking
  estimated_cost_usd NUMERIC,
  actual_cost_usd NUMERIC,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending',
  executed_at TIMESTAMPTZ,

  -- Links and notes
  notes TEXT
);

ALTER TABLE run_plans
  ADD CONSTRAINT chk_run_plan_status
  CHECK (status IN ('pending', 'executing', 'completed', 'cost_capped', 'failed', 'superseded'));

CREATE INDEX IF NOT EXISTS idx_run_plans_recent
  ON run_plans (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_run_plans_by_run
  ON run_plans (agent_run_id)
  WHERE agent_run_id IS NOT NULL;

-- RLS
ALTER TABLE run_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Run plans publicly readable"
  ON run_plans FOR SELECT USING (true);

CREATE POLICY "Service role can manage run plans"
  ON run_plans FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON run_plans TO anon;
GRANT ALL ON run_plans TO service_role;
