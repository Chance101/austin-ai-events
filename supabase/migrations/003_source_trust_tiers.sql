-- Migration: Source Trust Tiers and Query Management
-- Description: Add trust tiers for intelligent source management and query deactivation

-- Add trust tier column to sources table
-- 'config' = hardcoded sources, always trusted
-- 'trusted' = earned trust, skip validation
-- 'probation' = new sources, validate strictly
-- 'demoted' = poor performance, don't scrape
ALTER TABLE sources ADD COLUMN IF NOT EXISTS trust_tier TEXT DEFAULT 'probation';

-- Add validation tracking columns
ALTER TABLE sources ADD COLUMN IF NOT EXISTS validation_pass_count INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS validation_fail_count INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS consecutive_empty_scrapes INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS demoted_at TIMESTAMPTZ;

-- Add is_active to search_queries if it doesn't exist (for query management)
ALTER TABLE search_queries ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index for faster active query lookups
CREATE INDEX IF NOT EXISTS idx_search_queries_active ON search_queries (is_active, priority_score DESC);

-- Create index for trust tier lookups
CREATE INDEX IF NOT EXISTS idx_sources_trust_tier ON sources (trust_tier);
