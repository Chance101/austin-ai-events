-- Austin AI Events Database Schema
-- Run this in Supabase SQL Editor to set up the database

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types for event classification
CREATE TYPE audience_type AS ENUM (
  'developers',
  'business',
  'researchers',
  'general',
  'students'
);

CREATE TYPE technical_level AS ENUM (
  'beginner',
  'intermediate',
  'advanced',
  'all-levels'
);

CREATE TYPE event_source AS ENUM (
  'aicamp',
  'aitx',
  'hackai',
  'austin-langchain',
  'ai-automation',
  'capital-factory',
  'ut-austin',
  'austin-forum',
  'ai-accelerator',
  'austin-ai',
  'leaders-in-ai',
  'web-search',
  'manual'
);

-- Main events table
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Basic event info
  title TEXT NOT NULL,
  description TEXT,

  -- Date/time
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,

  -- Location
  location TEXT,
  venue_name TEXT,
  address TEXT,

  -- Source tracking
  url TEXT NOT NULL,
  source event_source NOT NULL,
  source_event_id TEXT,

  -- Classification (set by AI)
  audience_type audience_type[] DEFAULT ARRAY['general']::audience_type[],
  technical_level technical_level DEFAULT 'all-levels',

  -- Pricing
  is_free BOOLEAN,
  price TEXT,

  -- Additional metadata
  organizer TEXT,
  image_url TEXT,

  -- Verification status
  is_verified BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint for deduplication
  CONSTRAINT unique_source_event UNIQUE (source, source_event_id)
);

-- Create indexes for common queries
CREATE INDEX idx_events_start_time ON events (start_time);
CREATE INDEX idx_events_source ON events (source);
CREATE INDEX idx_events_audience ON events USING GIN (audience_type);
CREATE INDEX idx_events_technical_level ON events (technical_level);
CREATE INDEX idx_events_is_free ON events (is_free);
CREATE INDEX idx_events_is_verified ON events (is_verified);

-- Full text search index on title and description
CREATE INDEX idx_events_search ON events
  USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read events (public calendar)
CREATE POLICY "Events are publicly readable"
  ON events
  FOR SELECT
  USING (true);

-- Policy: Only service role can insert/update/delete
CREATE POLICY "Service role can manage events"
  ON events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create a view for upcoming events (convenience)
-- security_invoker ensures the view respects the caller's RLS policies
CREATE VIEW upcoming_events WITH (security_invoker = on) AS
SELECT *
FROM events
WHERE start_time >= NOW()
ORDER BY start_time ASC;

-- Grant access to the anon role for public reads
GRANT SELECT ON events TO anon;
GRANT SELECT ON upcoming_events TO anon;

-- Grant full access to service role (for the agent)
GRANT ALL ON events TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Sample data for testing (optional - comment out in production)
/*
INSERT INTO events (title, description, start_time, end_time, venue_name, address, url, source, source_event_id, audience_type, technical_level, is_free, organizer, is_verified)
VALUES
  (
    'Austin AI Meetup: Introduction to LLMs',
    'Join us for an introduction to Large Language Models. Perfect for beginners!',
    NOW() + INTERVAL '7 days',
    NOW() + INTERVAL '7 days' + INTERVAL '2 hours',
    'Capital Factory',
    '701 Brazos St, Austin, TX 78701',
    'https://example.com/event/1',
    'manual',
    'test-event-1',
    ARRAY['developers', 'general']::audience_type[],
    'beginner',
    true,
    'Austin AI Community',
    true
  ),
  (
    'Advanced RAG Workshop',
    'Deep dive into Retrieval Augmented Generation techniques for production applications.',
    NOW() + INTERVAL '14 days',
    NOW() + INTERVAL '14 days' + INTERVAL '3 hours',
    'WeWork Congress',
    '600 Congress Ave, Austin, TX 78701',
    'https://example.com/event/2',
    'manual',
    'test-event-2',
    ARRAY['developers']::audience_type[],
    'advanced',
    false,
    'Austin LangChain',
    true
  );
*/

-- Helpful queries for maintenance

-- Find events missing end times
-- SELECT id, title, start_time FROM events WHERE end_time IS NULL;

-- Find duplicate events by similar titles
-- SELECT title, COUNT(*) FROM events GROUP BY title HAVING COUNT(*) > 1;

-- Events by source
-- SELECT source, COUNT(*) FROM events GROUP BY source ORDER BY COUNT(*) DESC;

-- Upcoming events count by week
-- SELECT DATE_TRUNC('week', start_time) as week, COUNT(*)
-- FROM events
-- WHERE start_time >= NOW()
-- GROUP BY week
-- ORDER BY week;
