-- Persistent action items the monitor escalates for human attention
CREATE TABLE IF NOT EXISTS human_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  severity TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  suggested_fix TEXT,
  monitor_report_id UUID REFERENCES monitor_reports(id),
  is_resolved BOOLEAN DEFAULT false
);

CREATE INDEX idx_human_action_items_unresolved
  ON human_action_items (is_resolved, created_at DESC)
  WHERE is_resolved = false;

-- RLS
ALTER TABLE human_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Human action items are publicly readable"
  ON human_action_items
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage human action items"
  ON human_action_items
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON human_action_items TO anon;
GRANT ALL ON human_action_items TO service_role;
