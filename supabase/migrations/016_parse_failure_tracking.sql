-- Track consecutive parse failures separately from empty scrapes.
-- Parse failures = HTML received but scraper couldn't extract events (scraper problem).
-- Empty scrapes = source genuinely has no events (source problem).
ALTER TABLE sources ADD COLUMN IF NOT EXISTS consecutive_parse_failures INTEGER DEFAULT 0;
