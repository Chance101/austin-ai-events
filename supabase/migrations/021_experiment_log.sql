-- Phase 2: Experiment log with hypothesis tracking
--
-- Every strategic decision the planner makes is logged here as a
-- falsifiable hypothesis with a prediction and an evaluation window.
-- At the start of each subsequent run, experiments whose window has
-- elapsed are graded (outcome vs. prediction) and their confidence
-- delta gets folded into the planner's context on future runs.
--
-- This is the memory that turns the system from "logs everything" into
-- "learns from experience" — the core user goal of compounding
-- intelligence via feedback loops.

CREATE TABLE IF NOT EXISTS experiment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Who made this prediction (planner, reconciler, scout later, etc.)
  agent TEXT NOT NULL DEFAULT 'planner',

  -- Link back to the run_plan or agent_run that produced this prediction
  run_plan_id UUID REFERENCES run_plans(id),

  -- What is being claimed
  hypothesis TEXT NOT NULL,
  action_taken TEXT,              -- e.g., "added luma.com/austin to plan"
  prediction TEXT NOT NULL,       -- what was expected to happen
  expected_outcome JSONB,         -- structured prediction (optional: { metric, operator, value })

  -- Timing
  evaluation_window_runs INTEGER DEFAULT 1,   -- how many runs to wait
  evaluate_after TIMESTAMPTZ,                 -- earliest eval timestamp

  -- Outcome (written during evaluation pass)
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | evaluated | stale | cancelled
  evaluated_at TIMESTAMPTZ,
  evaluation_run_id UUID REFERENCES agent_runs(id),
  actual_outcome TEXT,
  outcome_match BOOLEAN,                       -- prediction held? true/false
  confidence_delta NUMERIC,                    -- -1 to +1 — how much this shifts future trust
  evaluation_notes TEXT
);

ALTER TABLE experiment_log
  ADD CONSTRAINT chk_experiment_status
  CHECK (status IN ('pending', 'evaluated', 'stale', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_experiment_log_pending
  ON experiment_log (status, evaluate_after)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_experiment_log_run_plan
  ON experiment_log (run_plan_id)
  WHERE run_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_experiment_log_recent
  ON experiment_log (created_at DESC);

-- RLS
ALTER TABLE experiment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Experiment log publicly readable"
  ON experiment_log FOR SELECT USING (true);

CREATE POLICY "Service role can manage experiment log"
  ON experiment_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON experiment_log TO anon;
GRANT ALL ON experiment_log TO service_role;
