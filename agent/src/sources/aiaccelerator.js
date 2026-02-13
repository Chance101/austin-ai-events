import * as cheerio from 'cheerio';
import { fromZonedTime } from 'date-fns-tz';
import { decodeHtmlEntities } from '../utils/html.js';

const AUSTIN_TIMEZONE = 'America/Chicago';

/**
 * Check if text looks like CSS, HTML, or code (not a valid event title)
 */
function isGarbageText(text) {
  if (!text || text.length < 3) return true;

  const garbagePatterns = [
    /^\s*\.\w+[-\w]*\s*\{/,           // CSS class: .class-name {
    /^\s*#[\w-]+\s*\{/,                // CSS ID: #id {
    /position\s*:\s*\w+/i,             // CSS property
    /display\s*:\s*\w+/i,              // CSS property
    /margin\s*:\s*\d+/i,               // CSS property
    /padding\s*:\s*\d+/i,              // CSS property
    /font-\w+\s*:/i,                   // CSS font properties
    /background\s*:/i,                 // CSS background
    /^\s*<\w+/,                        // HTML tags
    /^\s*\{\s*"/,                      // JSON objects
    /[{}]{2,}/,                        // Multiple braces
    /^\s*@media/i,                     // CSS media queries
    /^\s*@import/i,                    // CSS imports
    /&:hover/,                         // CSS pseudo-selectors
  ];

  for (const pattern of garbagePatterns) {
    if (pattern.test(text)) return true;
  }

  // If mostly non-alphanumeric, it's garbage
  const alphanumeric = text.replace(/[^a-zA-Z0-9\s]/g, '');
  if (alphanumeric.length < text.length * 0.4) return true;

  return false;
}

// Month name to 0-indexed number mapping
const MONTH_MAP = {
  'january': 0, 'jan': 0,
  'february': 1, 'feb': 1,
  'march': 2, 'mar': 2,
  'april': 3, 'apr': 3,
  'may': 4,
  'june': 5, 'jun': 5,
  'july': 6, 'jul': 6,
  'august': 7, 'aug': 7,
  'september': 8, 'sep': 8, 'sept': 8,
  'october': 9, 'oct': 9,
  'november': 10, 'nov': 10,
  'december': 11, 'dec': 11,
};

// Non-Austin cities to filter out at scraper level
const NON_AUSTIN_CITIES = [
  'san antonio', 'houston', 'dallas', 'fort worth', 'san marcos',
  'san francisco', 'los angeles', 'new york', 'chicago', 'seattle',
  'denver', 'boston', 'atlanta', 'miami', 'phoenix', 'portland',
  'washington dc', 'philadelphia', 'london', 'toronto', 'singapore',
  'dubai', 'paris', 'berlin', 'sydney', 'mumbai', 'bangalore',
];

/**
 * Check if an event location indicates Austin area
 * Returns true (Austin), false (non-Austin), or null (uncertain)
 */
function isAustinEvent(title, location, address) {
  const combined = [title, location, address].filter(Boolean).join(' ').toLowerCase();

  // Check for non-Austin cities first
  for (const city of NON_AUSTIN_CITIES) {
    if (combined.includes(city)) {
      return false;
    }
  }

  // Check for Austin indicators
  const austinIndicators = ['austin', 'atx', 'tx 78', '787', 'sxsw'];
  for (const indicator of austinIndicators) {
    if (combined.includes(indicator)) {
      return true;
    }
  }

  // Uncertain — no match either way
  return null;
}

/**
 * Normalize a URL and extract a stable source_event_id from its path
 */
function extractSourceEventId(url) {
  if (!url) return null;
  const cleaned = url.replace(/\/$/, '').split('?')[0];
  return cleaned.split('/').filter(Boolean).pop() || null;
}

/**
 * Create a UTC date from Austin local time
 */
function createAustinDate(year, month, day, hour = 9) {
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00`;
  return fromZonedTime(dateStr, AUSTIN_TIMEZONE);
}

/**
 * Scrape events from AI Accelerator Institute Austin page
 */
export async function scrapeAIAccelerator(sourceConfig) {
  const events = [];

  try {
    const response = await fetch(sourceConfig.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      console.error(`    Failed to fetch ${sourceConfig.url}: ${response.status}`);
      return events;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Find event tiles/cards
    $('[class*="eventCalendarTile"], [class*="eventDetails"]').closest('a, [class*="event"]').each((_, element) => {
      try {
        const $el = $(element);

        // Find the link
        let eventUrl = $el.attr('href') || $el.find('a').first().attr('href');
        if (eventUrl && !eventUrl.startsWith('http')) {
          eventUrl = new URL(eventUrl, sourceConfig.url).href;
        }

        // Extract event details - get direct text content, not nested elements
        const $titleEl = $el.find('[class*="eventTitle"]').first();
        // Use .contents() to get only direct text, avoiding nested style/script tags
        let title = '';
        $titleEl.contents().each((_, node) => {
          if (node.type === 'text') {
            title += $(node).text();
          }
        });
        title = decodeHtmlEntities(title.trim());

        // If no direct text found, try the full text but validate it
        if (!title) {
          title = decodeHtmlEntities($titleEl.text().trim());
        }

        const dateText = $el.find('[class*="eventDate"]').text().trim();
        // Extract location using direct text nodes only (avoid nested <style> tags)
        const $locationEl = $el.find('[class*="eventLocation"], [class*="eventCity"]').first();
        let location = '';
        $locationEl.contents().each((_, node) => {
          if (node.type === 'text') {
            location += $(node).text();
          }
        });
        location = location.trim();
        // Discard location if it looks like CSS/code (defense-in-depth)
        if (isGarbageText(location)) {
          location = '';
        }

        // Skip garbage titles (CSS, HTML, code)
        if (isGarbageText(title)) {
          return; // continue to next element
        }

        if (title && eventUrl) {
          // Parse date (format varies: "Feb 25" or "February 25, 2025")
          let startTime = null;
          if (dateText) {
            // Try to parse the date
            const dateMatch = dateText.match(/(\w+)\s+(\d+),?\s*(\d{4})?/);
            if (dateMatch) {
              const monthName = dateMatch[1].toLowerCase();
              const day = parseInt(dateMatch[2]);
              const year = parseInt(dateMatch[3]) || new Date().getFullYear();
              const month = MONTH_MAP[monthName];

              if (month !== undefined && day && year) {
                // Create date in Austin timezone (conferences typically start at 9 AM)
                const austinDate = createAustinDate(year, month, day, 9);
                startTime = austinDate.toISOString();
              }
            }
          }

          // Only include future events
          if (startTime && new Date(startTime) < new Date()) {
            return;
          }

          // Filter to Austin events only — skip events from other cities
          const austinCheck = isAustinEvent(title, location, null);
          if (austinCheck === false) {
            return; // Definitely not Austin
          }

          events.push({
            title,
            description: null, // Would need to fetch individual event page
            url: eventUrl,
            source: sourceConfig.id,
            source_event_id: extractSourceEventId(eventUrl),
            start_time: startTime,
            end_time: null,
            venue_name: location || null,
            address: null,
            is_free: null,
            organizer: sourceConfig.name,
            image_url: $el.find('img').attr('src') || null,
          });
        }
      } catch (e) {
        // Parse error for this element
      }
    });

    // Also check for JSON-LD
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const data = JSON.parse($(script).html());
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (item['@type'] === 'Event') {
            const startDate = new Date(item.startDate);
            if (startDate < new Date()) continue;

            const jsonTitle = decodeHtmlEntities(item.name);
            if (isGarbageText(jsonTitle)) continue;

            // Extract location details from JSON-LD
            const venueName = item.location?.name || null;
            const streetAddress = item.location?.address?.streetAddress;
            const city = item.location?.address?.addressLocality;
            const address = [streetAddress, city].filter(Boolean).join(', ') || null;

            // Filter to Austin events only
            const austinCheck = isAustinEvent(jsonTitle, venueName, address || city);
            if (austinCheck === false) continue;

            events.push({
              title: jsonTitle,
              description: decodeHtmlEntities(item.description),
              url: item.url || sourceConfig.url,
              source: sourceConfig.id,
              source_event_id: item.identifier || extractSourceEventId(item.url),
              start_time: item.startDate,
              end_time: item.endDate || null,
              venue_name: venueName,
              address,
              is_free: item.isAccessibleForFree || item.offers?.[0]?.price === 0,
              organizer: sourceConfig.name,
              image_url: item.image,
            });
          }
        }
      } catch (e) {
        // JSON parse error
      }
    });

  } catch (error) {
    console.error(`    Error scraping AI Accelerator:`, error.message);
  }

  // Dedupe by URL
  const seen = new Set();
  return events.filter(e => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}
