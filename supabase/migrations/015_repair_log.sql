-- Repair log: tracks every fix attempt made by the outer loop
-- Each row represents one commit/push cycle targeting an action item

CREATE TABLE repair_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_item_id UUID REFERENCES human_action_items(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  commit_hash TEXT NOT NULL,
  branch TEXT,                          -- branch the commit was pushed to
  files_changed TEXT[] NOT NULL,
  change_summary TEXT NOT NULL,         -- what the outer loop did and why
  test_result TEXT NOT NULL,            -- outcome of running tests after the fix
  pushed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,             -- when the monitor confirmed the fix worked
  verification_result TEXT             -- monitor's assessment of the fix
);

-- Ensure only valid test_result values
ALTER TABLE repair_log
  ADD CONSTRAINT chk_test_result
  CHECK (test_result IN ('passed', 'failed', 'skipped'));

-- Ensure only valid verification_result values (nullable — null means not yet verified)
ALTER TABLE repair_log
  ADD CONSTRAINT chk_verification_result
  CHECK (verification_result IN ('verified', 'failed', 'inconclusive'));

-- Index for joining repairs to their action items
CREATE INDEX idx_repair_log_action_item
  ON repair_log (action_item_id);

-- Index for the monitor's verification query: find unverified repairs
CREATE INDEX idx_repair_log_verification
  ON repair_log (verification_result);

-- RLS: same pattern as human_action_items
ALTER TABLE repair_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Repair log is publicly readable"
  ON repair_log
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage repair log"
  ON repair_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON repair_log TO anon;
GRANT ALL ON repair_log TO service_role;
