-- Addition A: Dedicated reflection loop
--
-- Biweekly Opus pass that synthesizes patterns from the experiment log,
-- run history, and monitor reports into persistent learned priors.
-- The planner reads the most recent reflection on every run, so insights
-- accumulate across cycles instead of being re-derived each time.
--
-- This is the meta-learning layer: the experiment_log records individual
-- predictions; the reflections table records PATTERNS across predictions.

CREATE TABLE IF NOT EXISTS reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- What the reflection covers
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  experiments_analyzed INTEGER DEFAULT 0,
  runs_analyzed INTEGER DEFAULT 0,

  -- The reflection itself
  patterns JSONB NOT NULL,        -- [{category, observation, confidence, evidence}]
  recommendations JSONB,          -- [{action, rationale, priority}]
  strategy_updates TEXT,          -- free-text guidance the planner should follow

  -- Cost tracking
  estimated_cost_usd NUMERIC,

  -- Summary for quick reference
  summary TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reflections_recent
  ON reflections (created_at DESC);

-- RLS
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reflections publicly readable"
  ON reflections FOR SELECT USING (true);

CREATE POLICY "Service role can manage reflections"
  ON reflections FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON reflections TO anon;
GRANT ALL ON reflections TO service_role;
