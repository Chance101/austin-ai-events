-- Monitor reports table for storing agent self-evaluation results
CREATE TABLE IF NOT EXISTS monitor_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Overall grade (A/B/C/D/F)
  overall_grade TEXT NOT NULL,

  -- Summary of the evaluation (1-2 sentences)
  summary TEXT NOT NULL,

  -- Detailed findings as structured JSON
  -- Array of { category, severity, finding, recommendation }
  -- severity: 'critical' | 'warning' | 'info' | 'positive'
  findings JSONB NOT NULL DEFAULT '[]',

  -- Actions the monitor auto-took
  -- Array of { action, detail, result }
  auto_actions JSONB NOT NULL DEFAULT '[]',

  -- Raw metrics snapshot used for the evaluation
  metrics JSONB NOT NULL DEFAULT '{}',

  -- Which agent_run triggered this report (nullable for manual runs)
  agent_run_id UUID REFERENCES agent_runs(id)
);

-- Index for fetching latest report
CREATE INDEX idx_monitor_reports_created_at ON monitor_reports (created_at DESC);

-- RLS
ALTER TABLE monitor_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Monitor reports are publicly readable"
  ON monitor_reports
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage monitor reports"
  ON monitor_reports
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON monitor_reports TO anon;
GRANT ALL ON monitor_reports TO service_role;
