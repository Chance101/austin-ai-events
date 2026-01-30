-- Data Cleanup Script for Source Trust Tiers
-- Run this AFTER the 003_source_trust_tiers.sql migration
-- This script sets initial trust tiers for existing data

-- 1. Demote broad Meetup search URLs (these are garbage sources)
UPDATE sources
SET
  is_trusted = false,
  trust_tier = 'demoted',
  demoted_at = NOW()
WHERE url LIKE '%meetup.com/find/%';

-- 2. Mark config sources as 'config' tier (always trusted)
UPDATE sources
SET trust_tier = 'config'
WHERE url IN (
  'https://lu.ma/aitx',
  'https://www.meetup.com/hack-ai/events/',
  'https://www.meetup.com/austin-langchain-ai-group/events/',
  'https://www.meetup.com/marketing-automation-ai/events/',
  'https://www.austinforum.org/events',
  'https://world.aiacceleratorinstitute.com/location/austin/',
  'https://austin-ai.org/events/',
  'https://www.leadersinaisummit.com/austin'
);

-- 3. Set existing trusted sources (not in config) to probation
-- They'll need to re-earn trust through validation
UPDATE sources
SET trust_tier = 'probation'
WHERE is_trusted = true
  AND (trust_tier IS NULL OR trust_tier = 'trusted')
  AND url NOT IN (
    'https://lu.ma/aitx',
    'https://www.meetup.com/hack-ai/events/',
    'https://www.meetup.com/austin-langchain-ai-group/events/',
    'https://www.meetup.com/marketing-automation-ai/events/',
    'https://www.austinforum.org/events',
    'https://world.aiacceleratorinstitute.com/location/austin/',
    'https://austin-ai.org/events/',
    'https://www.leadersinaisummit.com/austin'
  );

-- 4. Set any remaining sources without a tier to probation
UPDATE sources
SET trust_tier = 'probation'
WHERE trust_tier IS NULL;

-- 5. Initialize validation counters for all sources
UPDATE sources
SET
  validation_pass_count = COALESCE(validation_pass_count, 0),
  validation_fail_count = COALESCE(validation_fail_count, 0),
  consecutive_empty_scrapes = COALESCE(consecutive_empty_scrapes, 0);

-- 6. Verify results
SELECT trust_tier, COUNT(*) as count
FROM sources
GROUP BY trust_tier
ORDER BY trust_tier;
