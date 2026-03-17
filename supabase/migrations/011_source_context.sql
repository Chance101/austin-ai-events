-- Per-source validation context written by the monitor to tune Haiku validation prompts
ALTER TABLE sources ADD COLUMN IF NOT EXISTS validation_context TEXT DEFAULT NULL;
