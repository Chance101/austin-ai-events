import * as cheerio from 'cheerio';
import { fromZonedTime } from 'date-fns-tz';
import { decodeHtmlEntities } from '../utils/html.js';

const AUSTIN_TIMEZONE = 'America/Chicago';

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

/**
 * Scrape AI events from UT Austin (ai.utexas.edu/events)
 * Server-rendered Drupal page with event listings
 */
export async function scrapeUTAustin(sourceConfig) {
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

    // Try JSON-LD first (most reliable)
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const data = JSON.parse($(script).html());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Event') {
            events.push({
              title: decodeHtmlEntities(item.name),
              description: decodeHtmlEntities(item.description),
              url: item.url || sourceConfig.url,
              source: sourceConfig.id,
              source_event_id: extractSourceEventId(item.url),
              start_time: item.startDate,
              end_time: item.endDate || null,
              venue_name: item.location?.name || null,
              address: typeof item.location?.address === 'string'
                ? item.location.address
                : item.location?.address?.streetAddress || null,
              is_free: true, // University events are typically free
              organizer: 'UT Austin AI',
              image_url: item.image || null,
            });
          }
        }
      } catch (e) {
        // JSON parse error
      }
    });

    if (events.length > 0) {
      console.log(`    Found ${events.length} events via JSON-LD`);
    }

    // Fallback: parse the HTML structure using .event-info containers
    if (events.length === 0) {
      $('.event-info').each((_, el) => {
        try {
          const $info = $(el);
          const title = decodeHtmlEntities($info.find('h3.event-title').text().trim());
          const href = $info.find('.event-link a').attr('href');

          if (!title || !href) return;

          const fullUrl = href.startsWith('http')
            ? href
            : `https://ai.utexas.edu${href}`;

          // Extract start/end time from <time> tags
          // NOTE: UT Austin CMS stores local Austin time but tags it as +00:00 (UTC).
          // We strip the offset and treat the value as Austin local time.
          const times = [];
          $info.find('time.datetime').each((_, t) => {
            const dt = $(t).attr('datetime');
            if (dt) {
              // Strip timezone offset, treat as Austin local time
              const localStr = dt.replace(/[+-]\d{2}:\d{2}$/, '').replace(/Z$/, '');
              times.push(fromZonedTime(localStr, AUSTIN_TIMEZONE).toISOString());
            }
          });
          // First time tag is the date, second is start time, third is end time
          const startTime = times[1] || times[0] || null;
          const endTime = times[2] || null;

          // Extract location from .event-details text after the time tags
          const detailsText = $info.find('.event-details').text();
          const locationMatch = detailsText.split('|').pop()?.trim();
          const location = locationMatch && !locationMatch.match(/\d{4}/) && !locationMatch.match(/\d{1,2}:\d{2}/)
            ? locationMatch
            : null;

          // Speaker info
          const speaker = $info.find('.event-speaker-name').text().trim();
          const speakerInfo = $info.find('.event-speaker-info').text().trim();
          const description = speaker ? `Speaker: ${speaker}${speakerInfo ? ` — ${speakerInfo}` : ''}` : null;

          events.push({
            title,
            description,
            url: fullUrl,
            source: sourceConfig.id,
            source_event_id: extractSourceEventId(fullUrl),
            start_time: startTime,
            end_time: endTime,
            venue_name: location || null,
            address: 'University of Texas at Austin, Austin, TX',
            is_free: true,
            organizer: 'UT Austin AI',
            image_url: $info.find('img').attr('src') ? `https://ai.utexas.edu${$info.find('img').attr('src')}` : null,
          });
        } catch (e) {
          // Parse error for this element
        }
      });
    }

  } catch (error) {
    console.error(`    Error scraping UT Austin AI:`, error.message);
  }

  // Filter to future events only
  const now = new Date();
  const upcoming = events.filter(e => {
    if (e.start_time) {
      const eventDate = new Date(e.start_time);
      if (!isNaN(eventDate) && eventDate < now) return false;
    }
    return true;
  });

  // Dedupe by URL
  const seen = new Set();
  return upcoming.filter(e => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}

/**
 * Parse date, time, and location from text like:
 * "March 6, 2026 | 3:30 -4:30pm | RLP 1.104"
 * "June 1-5, 2026 | Pickle Research Campus"
 */
function parseDateTimeLocation(text) {
  let startTime = null;
  let endTime = null;
  let location = null;

  // Match: "Month Day, Year | Time | Location" or "Month Day, Year | Location"
  const parts = text.split('|').map(p => p.trim());

  // Find the date part
  for (const part of parts) {
    const dateMatch = part.match(/(\w+)\s+(\d{1,2})(?:-\d{1,2})?,?\s*(\d{4})/);
    if (dateMatch) {
      const monthName = dateMatch[1].toLowerCase();
      const day = parseInt(dateMatch[2]);
      const year = parseInt(dateMatch[3]);
      const month = MONTH_MAP[monthName];

      if (month !== undefined && day && year) {
        // Look for time in subsequent parts
        let hour = 9; // default
        let minute = 0;
        let endHour = null;
        let endMinute = null;

        for (const timePart of parts) {
          // Match: "3:30 -4:30pm" or "11:00am-12:00pm" or "1:00-1:30pm"
          const timeMatch = timePart.match(/(\d{1,2}):(\d{2})\s*([ap]m)?\s*[-–]\s*(\d{1,2}):(\d{2})\s*([ap]m)/i);
          if (timeMatch) {
            hour = parseInt(timeMatch[1]);
            minute = parseInt(timeMatch[2]);
            const startAmPm = timeMatch[3]?.toLowerCase() || timeMatch[6].toLowerCase();
            endHour = parseInt(timeMatch[4]);
            endMinute = parseInt(timeMatch[5]);
            const endAmPm = timeMatch[6].toLowerCase();

            // Convert to 24-hour
            if (startAmPm === 'pm' && hour !== 12) hour += 12;
            if (startAmPm === 'am' && hour === 12) hour = 0;
            if (endAmPm === 'pm' && endHour !== 12) endHour += 12;
            if (endAmPm === 'am' && endHour === 12) endHour = 0;
            break;
          }

          // Single time: "3:30pm"
          const singleTimeMatch = timePart.match(/(\d{1,2}):(\d{2})\s*([ap]m)/i);
          if (singleTimeMatch) {
            hour = parseInt(singleTimeMatch[1]);
            minute = parseInt(singleTimeMatch[2]);
            const ampm = singleTimeMatch[3].toLowerCase();
            if (ampm === 'pm' && hour !== 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;
            break;
          }
        }

        // Create date in Austin timezone
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
        startTime = fromZonedTime(dateStr, AUSTIN_TIMEZONE).toISOString();

        if (endHour !== null) {
          const endDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`;
          endTime = fromZonedTime(endDateStr, AUSTIN_TIMEZONE).toISOString();
        }
      }
      break;
    }
  }

  // Last part (after date and time) is often the location
  // e.g., "RLP 1.104" or "GDC 6.302 / Zoom" or "Pickle Research Campus"
  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1];
    // Skip if it looks like a date or time
    if (!lastPart.match(/\d{4}/) && !lastPart.match(/\d{1,2}:\d{2}/)) {
      location = lastPart;
    }
  }

  return { startTime, endTime, location };
}

/**
 * Extract a stable source_event_id from URL path
 */
function extractSourceEventId(url) {
  if (!url) return null;
  // UT Austin URLs: /events/2026-03-06/slug-name
  const match = url.match(/\/events\/(.+)/);
  return match ? match[1].replace(/\/$/, '') : null;
}
