import * as cheerio from 'cheerio';
import { decodeHtmlEntities } from '../utils/html.js';
import { extractEventsFromNextData } from '../utils/nextdata.js';
import { ScrapeResult } from '../utils/scrapeResult.js';
import { createDiagnostics, createFetchDiagnostics, extractTextSnippet } from '../utils/scrapeDiagnostics.js';

/**
 * Attempt to repair malformed JSON-LD and parse it.
 * Handles control characters in strings, trailing commas, invalid escapes.
 */
export function tryRepairJsonLd(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') return null;

  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];

    if (escaped) {
      if (!/["\\\/bfnrtu]/.test(ch)) {
        result += '\\';
      }
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      result += ch;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
      if (ch.charCodeAt(0) < 0x20) { continue; }
    }

    result += ch;
  }

  result = result.replace(/,(\s*[}\]])/g, '$1');

  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

/**
 * Regex-based fallback extraction of event data from raw JSON-LD text.
 * Used when JSON is too malformed for repair.
 */
export function extractEventsFromRawJsonLd(jsonStr, sourceConfig) {
  const events = [];
  const eventTypeRegex = /"@type"\s*:\s*"[^"]*Event[^"]*"/g;
  let match;

  while ((match = eventTypeRegex.exec(jsonStr)) !== null) {
    const pos = match.index;
    const context = jsonStr.substring(pos, Math.min(jsonStr.length, pos + 2000));

    const name = context.match(/"name"\s*:\s*"([^"]+)"/)?.[1];
    const startDate = context.match(/"startDate"\s*:\s*"([^"]+)"/)?.[1];
    const endDate = context.match(/"endDate"\s*:\s*"([^"]+)"/)?.[1];
    const url = context.match(/"url"\s*:\s*"([^"]+)"/)?.[1];
    const locationName = context.match(/"location"[\s\S]{0,300}"name"\s*:\s*"([^"]+)"/)?.[1];
    const image = context.match(/"image"\s*:\s*"([^"]+)"/)?.[1];

    if (name && startDate) {
      events.push({
        title: decodeHtmlEntities(name),
        start_time: startDate,
        end_time: endDate || null,
        url: url || sourceConfig.url,
        source: sourceConfig.id,
        source_event_id: null,
        venue_name: locationName || null,
        image_url: image || null,
        organizer: sourceConfig.name,
      });
    }
  }

  return events;
}

/**
 * Generic scraper for websites with event listings
 * Attempts to find events using common patterns
 */
export async function scrapeGeneric(sourceConfig) {
  const events = [];
  const diag = createDiagnostics();
  let rawHtml = null;

  try {
    const response = await fetch(sourceConfig.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    diag.httpStatus = response.status;

    if (!response.ok) {
      console.error(`Failed to fetch ${sourceConfig.url}: ${response.status}`);
      diag.errors.push({ stage: 'fetch', message: `HTTP ${response.status}` });
      return ScrapeResult.fetchFailed(diag);
    }

    const html = await response.text();
    rawHtml = html;
    diag.pageSize = html.length;
    const $ = cheerio.load(html);
    Object.assign(diag, createFetchDiagnostics(response, html));

    // Try JSON-LD structured data first (most reliable)
    diag.parseAttempts.push('json-ld');
    let jsonLdCandidates = 0;
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const jsonText = $(script).html();
        let data;
        try {
          data = JSON.parse(jsonText);
        } catch (parseErr) {
          data = tryRepairJsonLd(jsonText);
          if (!data) {
            const regexEvents = extractEventsFromRawJsonLd(jsonText, sourceConfig);
            if (regexEvents.length > 0) {
              events.push(...regexEvents);
              jsonLdCandidates += regexEvents.length;
              diag.errors.push({ stage: 'parse', message: `JSON-LD malformed, extracted ${regexEvents.length} via regex (${parseErr.message})` });
            } else {
              diag.errors.push({ stage: 'parse', message: `JSON-LD parse error: ${parseErr.message}` });
            }
            return;
          }
          diag.errors.push({ stage: 'parse', message: `JSON-LD repaired (${parseErr.message})` });
        }
        const items = Array.isArray(data) ? data : [data];

        items.forEach(item => {
          // Collect Event objects — may be top-level or nested in ItemList > ListItem
          const eventObjects = [];
          if (item['@type']?.endsWith('Event')) {
            eventObjects.push(item);
          } else if (item['@type'] === 'ItemList' && Array.isArray(item.itemListElement)) {
            for (const li of item.itemListElement) {
              const nested = li.item || li;
              if (nested['@type']?.endsWith('Event')) {
                eventObjects.push(nested);
              }
            }
          }

          jsonLdCandidates += eventObjects.length;
          for (const evt of eventObjects) {
            events.push({
              title: decodeHtmlEntities(evt.name),
              description: decodeHtmlEntities(evt.description),
              url: evt.url || sourceConfig.url,
              source: sourceConfig.id,
              source_event_id: evt.identifier || null,
              start_time: evt.startDate,
              end_time: evt.endDate,
              venue_name: evt.location?.name,
              address: typeof evt.location?.address === 'string'
                ? evt.location.address
                : evt.location?.address?.streetAddress,
              image_url: evt.image,
              organizer: evt.organizer?.name || sourceConfig.name,
              is_free: evt.isAccessibleForFree,
            });
          }
        });
      } catch (e) {
        diag.errors.push({ stage: 'parse', message: `JSON-LD parse error: ${e.message}` });
      }
    });
    if (events.length > 0) diag.parseStrategy = 'json-ld';
    diag.candidateElements = jsonLdCandidates;

    // If no JSON-LD, try __NEXT_DATA__ extraction
    if (events.length === 0) {
      diag.parseAttempts.push('nextdata');
      const nextDataEvents = extractEventsFromNextData($, {
        sourceId: sourceConfig.id,
        sourceName: sourceConfig.name,
        sourceUrl: sourceConfig.url,
      });
      events.push(...nextDataEvents);
      if (events.length > 0) diag.parseStrategy = 'nextdata';
    }

    // If no structured data, try common patterns
    if (events.length === 0) {
      diag.parseAttempts.push('css-selectors');
      // Look for event cards with common class patterns
      const selectors = [
        '.event-card',
        '.event-item',
        '[class*="event"]',
        'article[class*="event"]',
        '.card[data-event]',
        '.tribe-events-list-event',
        '.mec-event-article',
        '[itemtype*="Event"]',
      ];

      let cssMatches = 0;
      for (const selector of selectors) {
        $(selector).each((_, element) => {
          cssMatches++;
          const $el = $(element);

          const title = $el.find('h2, h3, h4, [class*="title"]').first().text().trim();
          const link = $el.find('a').first().attr('href');
          const dateText = $el.find('time, [class*="date"]').first().text().trim() ||
                          $el.find('time').attr('datetime');
          const venue = $el.find('[class*="location"], [class*="venue"]').text().trim();

          if (title && link) {
            const fullUrl = link.startsWith('http')
              ? link
              : new URL(link, sourceConfig.url).href;

            events.push({
              title,
              url: fullUrl,
              source: sourceConfig.id,
              source_event_id: null,
              venue_name: venue || null,
              raw_date: dateText,
              organizer: sourceConfig.name,
            });
          }
        });

        if (events.length > 0) break;
      }
      if (events.length > 0) diag.parseStrategy = 'css-selectors';
      if (cssMatches > 0) diag.candidateElements = (diag.candidateElements || 0) + cssMatches;
    }

  } catch (error) {
    console.error(`Error scraping ${sourceConfig.id}:`, error.message);
    diag.errors.push({ stage: 'fetch', message: error.message });
  }

  diag.eventsPreFilter = events.length;

  // Filter out past events (only when start_time is parseable)
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

  // Store text snippet when no events found (for content verification)
  if (deduped.length === 0 && rawHtml) {
    diag.pageTextSnippet = extractTextSnippet(rawHtml);
  }

  // If HTML was received but no events extracted, signal parse uncertainty
  if (deduped.length === 0) {
    return ScrapeResult.parseUncertain(diag);
  }
  return ScrapeResult.success(deduped, diag);
}
