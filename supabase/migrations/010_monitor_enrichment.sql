-- Enrich monitor_reports with action review and decision summary
ALTER TABLE monitor_reports
  ADD COLUMN IF NOT EXISTS action_review JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS decision_summary JSONB DEFAULT '{}'::jsonb;
