-- Clean up events with CSS garbage in location fields
-- The AI Accelerator scraper was extracting <style> tag content into venue_name/location/address

-- NULL out venue_name where it contains CSS patterns
UPDATE events
SET venue_name = NULL
WHERE venue_name LIKE '%.style-%'
   OR venue_name LIKE '%position:%'
   OR venue_name LIKE '%display:%'
   OR venue_name LIKE '%font-size:%';

-- NULL out location where it contains CSS patterns
UPDATE events
SET location = NULL
WHERE location LIKE '%.style-%'
   OR location LIKE '%position:%'
   OR location LIKE '%display:%'
   OR location LIKE '%font-size:%';

-- NULL out address where it contains CSS patterns
UPDATE events
SET address = NULL
WHERE address LIKE '%.style-%'
   OR address LIKE '%position:%'
   OR address LIKE '%display:%'
   OR address LIKE '%font-size:%';
