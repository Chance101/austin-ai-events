-- Add 'meetup' as an event_source enum value for future config additions
ALTER TYPE event_source ADD VALUE IF NOT EXISTS 'meetup';

-- Add query_type column to search_queries for distinguishing source-discovery vs event-search queries
ALTER TABLE search_queries ADD COLUMN IF NOT EXISTS query_type TEXT DEFAULT 'source_discovery';

-- Set existing queries to source_discovery (they were all used for source discovery historically)
UPDATE search_queries SET query_type = 'source_discovery' WHERE query_type IS NULL;

-- Create index for efficient query_type filtering
CREATE INDEX IF NOT EXISTS idx_search_queries_type ON search_queries (query_type, is_active, priority_score DESC);
