-- Migration: Add priority scoring columns to search_queries
-- Run this in Supabase SQL Editor

-- Add new columns for priority-based query selection
ALTER TABLE search_queries
ADD COLUMN IF NOT EXISTS priority_score FLOAT DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;

-- Ensure created_at exists (should already, but just in case)
ALTER TABLE search_queries
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Initialize priority_score based on existing data
-- Queries that have found sources get priority 1.0
-- Queries that haven't found anything get decayed priority based on age
UPDATE search_queries
SET priority_score = CASE
  WHEN sources_found > 0 THEN 1.0
  ELSE GREATEST(0.01, POWER(0.9, EXTRACT(EPOCH FROM (NOW() - COALESCE(created_at, NOW()))) / 86400))
END;

-- Set last_success_at for queries that have found sources
-- Use last_run as a proxy since we don't have historical success data
UPDATE search_queries
SET last_success_at = last_run
WHERE sources_found > 0 AND last_run IS NOT NULL;

-- Create index on priority_score for efficient ordering
CREATE INDEX IF NOT EXISTS idx_search_queries_priority
ON search_queries (priority_score DESC)
WHERE is_active = true;

-- Create index on created_by for efficient filtering
CREATE INDEX IF NOT EXISTS idx_search_queries_created_by
ON search_queries (created_by);
