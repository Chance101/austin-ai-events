import * as cheerio from 'cheerio';
import { fromZonedTime } from 'date-fns-tz';
import { decodeHtmlEntities } from '../utils/html.js';
import { ScrapeResult } from '../utils/scrapeResult.js';
import { createDiagnostics, createFetchDiagnostics, extractTextSnippet } from '../utils/scrapeDiagnostics.js';

const AUSTIN_TIMEZONE = 'America/Chicago';
const CF_EVENTS_URL = 'https://info.capitalfactory.com/ic-events';
const LUMA_AUSTIN_URL = 'https://luma.com/austin';

// Month abbreviation/name to 0-indexed number
const MONTH_MAP = {
  'jan': 0, 'january': 0, 'feb': 1, 'february': 1, 'mar': 2, 'march': 2,
  'apr': 3, 'april': 3, 'may': 4, 'jun': 5, 'june': 5,
  'jul': 6, 'july': 6, 'aug': 7, 'august': 7, 'sep': 8, 'september': 8,
  'oct': 9, 'october': 9, 'nov': 10, 'november': 10, 'dec': 11, 'december': 11,
};

/**
 * Scrape events from Capital Factory using two approaches:
 * 1. Their own HubSpot events page (flagship events)
 * 2. Lu.ma Austin discover page (community events hosted at Capital Factory)
 */
export async function scrapeCapitalFactory(sourceConfig) {
  const events = [];
  const diag = createDiagnostics();

  // Run both scrapers in parallel
  const [cfResult, lumaResult] = await Promise.all([
    scrapeCFEventsPage(sourceConfig),
    scrapeLumaAtCapitalFactory(sourceConfig),
  ]);

  events.push(...cfResult.events, ...lumaResult.events);

  // Composite diagnostics from both sub-scrapers
  diag.httpStatus = cfResult.diag.httpStatus; // primary source
  diag.pageSize = (cfResult.diag.pageSize || 0) + (lumaResult.diag.pageSize || 0);
  diag.parseAttempts = [...cfResult.diag.parseAttempts, ...lumaResult.diag.parseAttempts];
  diag.parseStrategy = cfResult.events.length > 0 ? cfResult.diag.parseStrategy : lumaResult.diag.parseStrategy;
  diag.candidateElements = (cfResult.diag.candidateElements || 0) + (lumaResult.diag.candidateElements || 0);
  diag.errors = [...cfResult.diag.errors, ...lumaResult.diag.errors];
  diag.contentSignals = cfResult.diag.contentSignals || lumaResult.diag.contentSignals;

  console.log(`    [diag] CF own: ${cfResult.events.length}, Lu.ma at CF: ${lumaResult.events.length}`);

  diag.eventsPreFilter = events.length;

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
  const deduped = upcoming.filter(e => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });

  if (deduped.length === 0) {
    // Combine text snippets if available
    diag.pageTextSnippet = cfResult.diag.pageTextSnippet || lumaResult.diag.pageTextSnippet;
    return ScrapeResult.parseUncertain(diag);
  }
  return ScrapeResult.success(deduped, diag);
}

/**
 * Scrape Capital Factory's own HubSpot events page
 * Server-rendered text-based listing at info.capitalfactory.com/ic-events
 */
async function scrapeCFEventsPage(sourceConfig) {
  const events = [];
  const diag = createDiagnostics();

  try {
    const response = await fetch(CF_EVENTS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    diag.httpStatus = response.status;

    if (!response.ok) {
      console.error(`    Failed to fetch ${CF_EVENTS_URL}: ${response.status}`);
      diag.errors.push({ stage: 'fetch', message: `HTTP ${response.status}` });
      return { events, diag };
    }

    const html = await response.text();
    diag.pageSize = html.length;
    Object.assign(diag, createFetchDiagnostics(response, html));
    diag.parseAttempts.push('text-parsing');

    const $ = cheerio.load(html);

    // The page has sections by city (AUSTIN, HOUSTON)
    // We only want Austin events
    // Events are text-based: "2/5 - First Look, 3-5pm" or "3/12-16 - CFHouse during SXSW"
    // Some have links (<a> tags)

    // Get the page body text and split by sections
    const bodyText = $('body').text();

    // Find AUSTIN section — everything between "AUSTIN" header and "HOUSTON" header (or end)
    const austinMatch = bodyText.match(/AUSTIN\s*\n([\s\S]*?)(?:HOUSTON|$)/i);
    if (!austinMatch) {
      console.log(`    [diag] Could not find AUSTIN section on CF events page`);
      diag.pageTextSnippet = extractTextSnippet(html);
      return { events, diag };
    }

    const austinSection = austinMatch[1];
    const currentYear = new Date().getFullYear();

    // Parse event lines — format: "M/D" or "M/D-D" followed by event info
    // Examples: "2/5: First Look, 3-5pm"  "3/12-16: CFHouse during SXSW"  "5/14: Health Supernova"
    const eventLines = austinSection.split('\n').filter(line => line.trim());
    diag.candidateElements = eventLines.filter(l => l.match(/\d{1,2}\/\d{1,2}/)).length;

    for (const line of eventLines) {
      // Match date pattern at start: M/D or M/D-D
      const dateMatch = line.match(/(\d{1,2})\/(\d{1,2})(?:-(\d{1,2}))?\s*[-:]\s*(.+)/);
      if (!dateMatch) continue;

      const month = parseInt(dateMatch[1]) - 1; // 0-indexed
      const startDay = parseInt(dateMatch[2]);
      const endDay = dateMatch[3] ? parseInt(dateMatch[3]) : null;
      const rest = dateMatch[4].trim();

      // Extract title and time from rest
      // Format: "First Look, 3-5pm" or "CFHouse during SXSW" or "Holiday Social, 2-3:30pm & First Look, 3-5pm"
      const timeMatch = rest.match(/,?\s*(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)\s*([ap]m)?/i);
      let title = rest;
      let startHour = 9; // default
      let endHour = null;

      if (timeMatch) {
        // Remove time from title
        title = rest.substring(0, rest.indexOf(timeMatch[0])).replace(/,\s*$/, '').trim();
        if (!title) title = rest;

        // Parse start time
        const startParts = timeMatch[1].split(':');
        startHour = parseInt(startParts[0]);
        const ampm = timeMatch[3]?.toLowerCase() || 'pm';
        if (ampm === 'pm' && startHour !== 12) startHour += 12;
        if (ampm === 'am' && startHour === 12) startHour = 0;

        // Parse end time
        const endParts = timeMatch[2].split(':');
        endHour = parseInt(endParts[0]);
        if (ampm === 'pm' && endHour !== 12) endHour += 12;
        if (ampm === 'am' && endHour === 12) endHour = 0;
      }

      if (!title || title.length < 3) continue;

      // Build dates in Austin timezone
      const startDateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}T${String(startHour).padStart(2, '0')}:00:00`;
      const startTime = fromZonedTime(startDateStr, AUSTIN_TIMEZONE).toISOString();

      let endTime = null;
      if (endDay) {
        const endDateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}T${String(endHour || 17).padStart(2, '0')}:00:00`;
        endTime = fromZonedTime(endDateStr, AUSTIN_TIMEZONE).toISOString();
      } else if (endHour) {
        const endDateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}T${String(endHour).padStart(2, '0')}:00:00`;
        endTime = fromZonedTime(endDateStr, AUSTIN_TIMEZONE).toISOString();
      }

      // Find the best matching link for this event title
      let eventUrl = sourceConfig.url;
      const titleLower = title.toLowerCase();
      let bestScore = 0;
      $('a').each((_, el) => {
        const linkText = ($(el).text() || '').trim().toLowerCase();
        const href = $(el).attr('href');
        if (!href || linkText.length < 4) return;
        const words = linkText.split(/\s+/).filter(w => w.length >= 3);
        if (words.length === 0) return;
        const matchCount = words.filter(w => titleLower.includes(w)).length;
        const score = matchCount / words.length;
        if (score > bestScore && matchCount >= 1) {
          bestScore = score;
          eventUrl = href.startsWith('http') ? href : `https://info.capitalfactory.com${href}`;
        }
      });

      events.push({
        title: `Capital Factory: ${decodeHtmlEntities(title)}`,
        description: null,
        url: eventUrl,
        source: sourceConfig.id,
        source_event_id: `cf-${month + 1}-${startDay}-${title.toLowerCase().replace(/\s+/g, '-').substring(0, 30)}`,
        start_time: startTime,
        end_time: endTime,
        venue_name: 'Capital Factory',
        address: '701 Brazos St, Austin, TX 78701',
        is_free: null,
        organizer: 'Capital Factory',
        image_url: null,
      });
    }

    if (events.length > 0) {
      diag.parseStrategy = 'text-parsing';
    } else {
      diag.pageTextSnippet = extractTextSnippet(html);
    }

  } catch (error) {
    console.error(`    Error scraping CF events page:`, error.message);
    diag.errors.push({ stage: 'parse', message: error.message });
  }

  return { events, diag };
}

/**
 * Scrape Lu.ma Austin discover page and filter for events at Capital Factory
 * Uses __NEXT_DATA__ JSON embedded in the page
 */
async function scrapeLumaAtCapitalFactory(sourceConfig) {
  const events = [];
  const diag = createDiagnostics();

  try {
    const response = await fetch(LUMA_AUSTIN_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    diag.httpStatus = response.status;

    if (!response.ok) {
      console.error(`    Failed to fetch ${LUMA_AUSTIN_URL}: ${response.status}`);
      diag.errors.push({ stage: 'fetch', message: `HTTP ${response.status}` });
      return { events, diag };
    }

    const html = await response.text();
    diag.pageSize = html.length;
    Object.assign(diag, createFetchDiagnostics(response, html));
    diag.parseAttempts.push('nextdata-luma-cf');

    const $ = cheerio.load(html);

    // Extract __NEXT_DATA__ JSON
    const nextDataScript = $('script#__NEXT_DATA__').html();
    if (!nextDataScript) {
      console.log(`    [diag] No __NEXT_DATA__ on Lu.ma Austin page`);
      diag.pageTextSnippet = extractTextSnippet(html);
      return { events, diag };
    }

    const nextData = JSON.parse(nextDataScript);
    const pageProps = nextData?.props?.pageProps || {};

    // Try multiple known paths (Luma changes their structure periodically)
    let lumaEvents = pageProps?.initialData?.events ||
                     pageProps?.initialData?.data?.events ||
                     pageProps?.data?.events ||
                     pageProps?.events ||
                     pageProps?.initialData?.data?.featured_items ||
                     pageProps?.initialData?.featured_items || [];

    // Deep search fallback: find arrays with event-like objects
    if (!lumaEvents.length) {
      const found = findLumaEventsDeep(pageProps, 0, 4);
      if (found) {
        console.log(`    [diag] CF deep search found ${found.length} Luma event items`);
        lumaEvents = found;
      }
    }

    diag.candidateElements = lumaEvents.length;

    if (!lumaEvents.length) {
      console.log(`    [diag] No events in Lu.ma Austin __NEXT_DATA__. pageProps keys: ${Object.keys(pageProps).join(', ')}`);
      diag.pageTextSnippet = extractTextSnippet(html);
      return { events, diag };
    }

    console.log(`    [diag] Lu.ma Austin has ${lumaEvents.length} total events, filtering for Capital Factory`);

    for (const item of lumaEvents) {
      // Each item has: event, geo_address_info, cover_url, ticket_info, calendar, guest_count
      const event = item.event || item;
      const geo = item.geo_address_info || {};
      const ticketInfo = item.ticket_info || {};
      const calendar = item.calendar || {};

      // Filter: only events at Capital Factory
      const venueName = geo.address || geo.place_name || '';
      const fullAddress = geo.full_address || '';
      const combined = `${venueName} ${fullAddress}`.toLowerCase();

      const isAtCapitalFactory = combined.includes('capital factory') ||
                                  combined.includes('701 brazos');
      if (!isAtCapitalFactory) continue;

      const title = event.name;
      const startAt = event.start_at;
      const endAt = event.end_at;
      const urlSlug = event.url;

      if (!title || !urlSlug) continue;

      const eventUrl = `https://lu.ma/${urlSlug}`;

      events.push({
        title: decodeHtmlEntities(title),
        description: event.description ? decodeHtmlEntities(event.description).substring(0, 500) : null,
        url: eventUrl,
        source: sourceConfig.id,
        source_event_id: urlSlug,
        start_time: startAt,
        end_time: endAt || null,
        venue_name: venueName || 'Capital Factory',
        address: fullAddress || '701 Brazos St, Austin, TX 78701',
        is_free: ticketInfo.is_free ?? null,
        organizer: calendar.name || 'Capital Factory',
        image_url: item.cover_url || null,
      });
    }

    if (events.length > 0) {
      diag.parseStrategy = 'nextdata-luma-cf';
    } else {
      diag.pageTextSnippet = extractTextSnippet(html);
    }

  } catch (error) {
    console.error(`    Error scraping Lu.ma for Capital Factory events:`, error.message);
    diag.errors.push({ stage: 'parse', message: error.message });
  }

  return { events, diag };
}

/**
 * Recursively search for arrays of Luma event-like objects
 */
function findLumaEventsDeep(obj, depth, maxDepth) {
  if (!obj || depth > maxDepth || typeof obj !== 'object') return null;

  if (Array.isArray(obj)) {
    if (obj.length > 0) {
      const first = obj[0];
      if (first && typeof first === 'object') {
        if ((first.event?.name && first.event?.start_at) ||
            (first.name && first.start_at)) {
          return obj;
        }
      }
    }
    return null;
  }

  for (const value of Object.values(obj)) {
    if (!value || typeof value !== 'object') continue;
    const found = findLumaEventsDeep(value, depth + 1, maxDepth);
    if (found) return found;
  }

  return null;
}
