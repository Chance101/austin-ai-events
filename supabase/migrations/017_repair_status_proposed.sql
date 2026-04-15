-- Phase 5: Outer loop plumbing fixes
--
-- The current outer loop deadlocks in two ways:
--   1. Scope-gate skips leave repair_status='pending' so the same item is
--      re-picked every run, blocking every item behind it.
--   2. attempt_count only increments on test/commit failure; any failure
--      earlier in the protocol (investigation, URL fetch, AUP rejection)
--      never increments, so the freeze mechanism never fires.
--
-- This migration adds:
--   - A new 'proposed' state for action items that the outer loop has
--     investigated but cannot act on autonomously (Restricted/Never tier).
--     These become a human-review queue, filtered out of outer loop selection.
--   - last_terminal_failure_at timestamp so the selection query can skip
--     items that have been attempted in the last N hours, preventing
--     same-run retry loops on structurally stuck items.
--   - proposed_at timestamp for human-review queue ordering.

-- Drop the old constraint and re-add with 'proposed' included
ALTER TABLE human_action_items
  DROP CONSTRAINT IF EXISTS chk_repair_status;

ALTER TABLE human_action_items
  ADD CONSTRAINT chk_repair_status
  CHECK (repair_status IN ('pending', 'proposed', 'attempted', 'verified', 'failed', 'rolled_back'));

-- Track when the outer loop last reached a terminal outcome on this item
-- (success OR failure OR skip). The selection query filters out items
-- touched in the last 24h to prevent same-day retry loops.
ALTER TABLE human_action_items
  ADD COLUMN IF NOT EXISTS last_terminal_failure_at TIMESTAMPTZ;

-- Track when the item was moved to the human-review queue (proposed state)
ALTER TABLE human_action_items
  ADD COLUMN IF NOT EXISTS proposed_at TIMESTAMPTZ;

-- Initialize last_terminal_failure_at for existing items from last_attempt_at
-- so the 24h cooldown is honored for items already in the queue
UPDATE human_action_items
  SET last_terminal_failure_at = last_attempt_at
  WHERE last_terminal_failure_at IS NULL
    AND last_attempt_at IS NOT NULL;

-- Index for the outer loop selection query: unresolved + pending + not recently attempted
CREATE INDEX IF NOT EXISTS idx_human_action_items_selectable
  ON human_action_items (is_resolved, repair_status, last_terminal_failure_at)
  WHERE is_resolved = false;
