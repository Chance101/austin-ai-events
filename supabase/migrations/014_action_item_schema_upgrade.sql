-- Upgrade human_action_items for outer-loop repair tracking
-- Adds fields for the autonomous repair system to classify, attempt, and track fixes

-- Classification fields (populated by the monitor at escalation time)
ALTER TABLE human_action_items
  ADD COLUMN action_type TEXT DEFAULT 'investigation',
  ADD COLUMN affected_files TEXT[],
  ADD COLUMN auto_fixable BOOLEAN DEFAULT false;

-- Repair tracking fields (populated by the outer loop during fix attempts)
ALTER TABLE human_action_items
  ADD COLUMN attempt_count INTEGER DEFAULT 0,
  ADD COLUMN last_attempt_at TIMESTAMPTZ,
  ADD COLUMN repair_commit TEXT,
  ADD COLUMN repair_status TEXT DEFAULT 'pending';

-- Ensure only valid action_type values
ALTER TABLE human_action_items
  ADD CONSTRAINT chk_action_type
  CHECK (action_type IN ('code_change', 'config_change', 'investigation', 'strategic'));

-- Ensure only valid repair_status values
ALTER TABLE human_action_items
  ADD CONSTRAINT chk_repair_status
  CHECK (repair_status IN ('pending', 'attempted', 'verified', 'failed', 'rolled_back'));

-- Index for the outer loop's primary query pattern:
-- finding unresolved items that are pending repair
CREATE INDEX idx_human_action_items_repair_queue
  ON human_action_items (is_resolved, repair_status);
