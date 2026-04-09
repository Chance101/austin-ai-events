import * as cheerio from 'cheerio';
import { decodeHtmlEntities } from '../utils/html.js';
import { ScrapeResult } from '../utils/scrapeResult.js';
import { createDiagnostics, createFetchDiagnostics, extractTextSnippet } from '../utils/scrapeDiagnostics.js';

/**
 * Scrape events from a Lu.ma calendar page
 * Multi-strategy parser: JSON-LD → __NEXT_DATA__ → Luma API → HTML links
 */
export async function scrapeLuma(sourceConfig) {
  const events = [];
  const diag = createDiagnostics();
  let rawHtml = null;

  try {
    const response = await fetch(sourceConfig.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    diag.httpStatus = response.status;

    if (!response.ok) {
      console.error(`    Failed to fetch ${sourceConfig.url}: ${response.status}`);
      diag.errors.push({ stage: 'fetch', message: `HTTP ${response.status}` });
      return ScrapeResult.fetchFailed(diag);
    }

    const html = await response.text();
    rawHtml = html;
    diag.pageSize = html.length;
    const $ = cheerio.load(html);
    Object.assign(diag, createFetchDiagnostics(response, html));

    // Strategy 1: JSON-LD structured data (broadened)
    diag.parseAttempts.push('json-ld');
    const jsonLdEvents = extractFromJsonLd($, sourceConfig, diag);
    if (jsonLdEvents.length > 0) {
      diag.parseStrategy = 'json-ld';
      events.push(...jsonLdEvents);
    }

    // Strategy 2: __NEXT_DATA__ extraction (proper selector + deep search)
    if (events.length === 0) {
      diag.parseAttempts.push('nextdata-luma');
      const nextDataEvents = extractFromNextData($, sourceConfig, diag);
      if (nextDataEvents.length > 0) {
        diag.parseStrategy = 'nextdata-luma';
        events.push(...nextDataEvents);
      }
    }

    // Strategy 3: Regex-based __NEXT_DATA__ search (legacy fallback)
    if (events.length === 0) {
      diag.parseAttempts.push('nextdata-regex');
      const regexEvents = extractFromNextDataRegex($, sourceConfig, diag);
      if (regexEvents.length > 0) {
        diag.parseStrategy = 'nextdata-regex';
        events.push(...regexEvents);
      }
    }

    // Strategy 4: Luma internal API (no auth for public calendars)
    if (events.length === 0) {
      diag.parseAttempts.push('luma-api');
      const calendarApiId = extractCalendarApiId($, html);
      const slug = extractSlug(sourceConfig.url);
      const apiEvents = await fetchFromLumaApi(calendarApiId, slug, sourceConfig, diag);
      if (apiEvents.length > 0) {
        diag.parseStrategy = 'luma-api';
        events.push(...apiEvents);
      }
    }

    // Strategy 5: HTML link extraction (last resort)
    if (events.length === 0) {
      diag.parseAttempts.push('html-links');
      const htmlEvents = extractFromHtml($, sourceConfig);
      if (htmlEvents.length > 0) {
        diag.parseStrategy = 'html-links';
        events.push(...htmlEvents);
      }
    }

  } catch (error) {
    console.error(`    Error scraping Lu.ma ${sourceConfig.id}:`, error.message);
    diag.errors.push({ stage: 'fetch', message: error.message });
  }

  diag.eventsPreFilter = events.length;

  // Store text snippet when no events found (for content verification)
  if (events.length === 0 && rawHtml) {
    diag.pageTextSnippet = extractTextSnippet(rawHtml);
    // Log extra diagnostics for debugging
    logDiagnostics(cheerio.load(rawHtml), rawHtml, sourceConfig);
  }

  if (events.length === 0) {
    return ScrapeResult.parseUncertain(diag);
  }
  return ScrapeResult.success(events, diag);
}

/**
 * Strategy 1: Extract events from JSON-LD structured data
 * Handles Organization+events, ItemList, and direct Event types
 */
function extractFromJsonLd($, sourceConfig, diag) {
  const events = [];
  const jsonLdScripts = $('script[type="application/ld+json"]');
  let candidateCount = 0;

  jsonLdScripts.each((_, script) => {
    try {
      const data = JSON.parse($(script).html());
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        // Pattern 1: Organization with events array (legacy Luma format)
        if (item['@type'] === 'Organization' && Array.isArray(item.events)) {
          candidateCount += item.events.length;
          for (const event of item.events) {
            const parsed = parseJsonLdEvent(event, sourceConfig);
            if (parsed) events.push(parsed);
          }
        }

        // Pattern 2: ItemList with ListItem > Event (common schema.org pattern)
        if (item['@type'] === 'ItemList' && Array.isArray(item.itemListElement)) {
          candidateCount += item.itemListElement.length;
          for (const listItem of item.itemListElement) {
            const eventObj = listItem.item || listItem;
            const parsed = parseJsonLdEvent(eventObj, sourceConfig);
            if (parsed) events.push(parsed);
          }
        }

        // Pattern 3: Direct Event object
        if (item['@type'] === 'Event' || item['@type']?.endsWith?.('Event')) {
          candidateCount++;
          const parsed = parseJsonLdEvent(item, sourceConfig);
          if (parsed) events.push(parsed);
        }

        // Pattern 4: Array of Events
        if (Array.isArray(item)) {
          for (const subItem of item) {
            if (subItem['@type'] === 'Event' || subItem['@type']?.endsWith?.('Event')) {
              candidateCount++;
              const parsed = parseJsonLdEvent(subItem, sourceConfig);
              if (parsed) events.push(parsed);
            }
          }
        }
      }
    } catch (e) {
      diag.errors.push({ stage: 'parse', message: `JSON-LD parse error: ${e.message}` });
    }
  });

  diag.candidateElements = candidateCount;
  return filterUpcoming(events);
}

/**
 * Parse a single JSON-LD Event object into our event format
 */
function parseJsonLdEvent(event, sourceConfig) {
  if (!event || !event.name) return null;
  if (event['@type'] !== 'Event' && !event['@type']?.endsWith?.('Event')) return null;

  const eventUrl = event['@id'] || event.url || null;
  let venueName = null;
  let address = null;

  if (event.location) {
    venueName = event.location.name;
    if (event.location.address) {
      const addr = event.location.address;
      if (typeof addr === 'string') {
        address = addr;
      } else {
        const parts = [addr.streetAddress, addr.addressLocality, addr.addressRegion].filter(Boolean);
        address = parts.length > 0 ? parts.join(', ') : null;
      }
    }
  }

  let isFree = null;
  if (event.offers) {
    const offers = Array.isArray(event.offers) ? event.offers : [event.offers];
    if (offers.length > 0) {
      isFree = offers[0].price === 0 || offers[0].price === '0';
    }
  }
  if (event.isAccessibleForFree != null) {
    isFree = event.isAccessibleForFree;
  }

  let organizer = sourceConfig.name;
  if (event.organizer) {
    const org = Array.isArray(event.organizer) ? event.organizer[0] : event.organizer;
    organizer = org?.name || sourceConfig.name;
  }

  const imageUrl = Array.isArray(event.image) ? event.image[0] : event.image;

  return {
    title: decodeHtmlEntities(event.name),
    description: decodeHtmlEntities(event.description) || null,
    url: eventUrl,
    source: sourceConfig.id,
    source_event_id: eventUrl?.split('/').pop() || null,
    start_time: event.startDate,
    end_time: event.endDate || null,
    venue_name: venueName,
    address: address,
    is_free: isFree,
    organizer: organizer,
    image_url: imageUrl || null,
  };
}

/**
 * Strategy 2: Extract events from __NEXT_DATA__ using proper #__NEXT_DATA__ selector
 * Tries multiple known paths then deep recursive search
 */
function extractFromNextData($, sourceConfig, diag) {
  const nextDataScript = $('script#__NEXT_DATA__').html();
  if (!nextDataScript) {
    console.log(`    [diag] No __NEXT_DATA__ script tag found`);
    return [];
  }

  let nextData;
  try {
    nextData = JSON.parse(nextDataScript);
  } catch (e) {
    diag.errors.push({ stage: 'parse', message: `__NEXT_DATA__ parse error: ${e.message}` });
    return [];
  }

  const pageProps = nextData?.props?.pageProps || {};
  const pagePropsKeys = Object.keys(pageProps);
  console.log(`    [diag] __NEXT_DATA__ pageProps keys: ${pagePropsKeys.join(', ')}`);

  // Try known paths in order of likelihood
  const knownPaths = [
    { val: pageProps?.initialData?.events, name: 'initialData.events' },
    { val: pageProps?.initialData?.data?.events, name: 'initialData.data.events' },
    { val: pageProps?.data?.events, name: 'data.events' },
    { val: pageProps?.events, name: 'events' },
    { val: pageProps?.initialData?.data?.featured_items, name: 'initialData.data.featured_items' },
    { val: pageProps?.initialData?.featured_items, name: 'initialData.featured_items' },
    { val: pageProps?.calendarData?.events, name: 'calendarData.events' },
    { val: pageProps?.calendar?.events, name: 'calendar.events' },
  ];

  for (const { val, name } of knownPaths) {
    if (Array.isArray(val) && val.length > 0) {
      console.log(`    [diag] Found ${val.length} items at pageProps.${name}`);
      const events = parseLumaEventArray(val, sourceConfig);
      if (events.length > 0) return filterUpcoming(events);
    }
  }

  // Deep recursive search: find any array of objects with event-like fields
  const found = findEventArrays(pageProps, 0, 5);
  if (found.length > 0) {
    found.sort((a, b) => b.array.length - a.array.length);
    console.log(`    [diag] Deep search found ${found.length} candidate arrays, largest: ${found[0].array.length} items at path: ${found[0].path}`);
    for (const { array, path } of found) {
      const events = parseLumaEventArray(array, sourceConfig);
      if (events.length > 0) {
        console.log(`    [diag] Deep search extracted ${events.length} events from path: ${path}`);
        return filterUpcoming(events);
      }
    }
  }

  // Log deeper structure for debugging
  for (const key of pagePropsKeys.slice(0, 10)) {
    const val = pageProps[key];
    if (val && typeof val === 'object') {
      const type = Array.isArray(val) ? `array(${val.length})` : `{${Object.keys(val).slice(0, 8).join(', ')}}`;
      console.log(`    [diag] pageProps.${key}: ${type}`);
    }
  }

  return [];
}

/**
 * Strategy 3: Regex-based __NEXT_DATA__ search (legacy fallback)
 * Searches all script tags for initialData patterns
 */
function extractFromNextDataRegex($, sourceConfig, diag) {
  const events = [];

  $('script').each((_, script) => {
    if (events.length > 0) return; // already found
    try {
      const text = $(script).html();
      if (!text || !text.includes('initialData')) return;

      const nextDataMatch = text.match(/\{.*"initialData".*\}/s);
      if (!nextDataMatch) return;

      const nextData = JSON.parse(nextDataMatch[0]);
      const eventsList = nextData?.props?.pageProps?.initialData?.events
        || nextData?.pageProps?.initialData?.events
        || nextData?.initialData?.events;

      if (!Array.isArray(eventsList)) return;

      for (const entry of eventsList) {
        const evt = entry.event || entry;
        if (!evt.name || !evt.start_at) continue;

        const startDate = new Date(evt.start_at);
        if (startDate < new Date()) continue;

        const geo = entry.geo_address_info || evt.geo_address_info || {};
        const eventUrl = evt.url ? `https://lu.ma/${evt.url}` : null;

        let organizer = sourceConfig.name;
        if (entry.hosts && entry.hosts.length > 0) {
          organizer = entry.hosts[0].name || sourceConfig.name;
        }
        if (entry.calendar?.name) {
          organizer = entry.calendar.name;
        }

        events.push({
          title: decodeHtmlEntities(evt.name),
          description: evt.description ? decodeHtmlEntities(evt.description).substring(0, 500) : null,
          url: eventUrl,
          source: sourceConfig.id,
          source_event_id: evt.url || evt.api_id || null,
          start_time: evt.start_at,
          end_time: evt.end_at || null,
          venue_name: geo.address || geo.place_name || null,
          address: geo.full_address || geo.short_address || null,
          is_free: entry.ticket_info?.is_free ?? null,
          organizer: organizer,
          image_url: evt.cover_url || entry.cover_url || null,
        });
      }
    } catch (e) {
      diag.errors.push({ stage: 'parse', message: `Regex Next.js parse error: ${e.message}` });
    }
  });

  return events;
}

/**
 * Recursively search an object for arrays that look like event data
 */
function findEventArrays(obj, depth, maxDepth) {
  const results = [];
  if (!obj || depth > maxDepth) return results;
  if (typeof obj !== 'object') return results;

  if (Array.isArray(obj)) {
    if (obj.length > 0 && isLumaEventArray(obj)) {
      results.push({ array: obj, path: `[${obj.length}]` });
    }
    return results;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (!value || typeof value !== 'object') continue;

    if (Array.isArray(value)) {
      if (value.length > 0 && isLumaEventArray(value)) {
        results.push({ array: value, path: key });
      }
    } else {
      const nested = findEventArrays(value, depth + 1, maxDepth);
      for (const n of nested) {
        results.push({ array: n.array, path: `${key}.${n.path}` });
      }
    }
  }

  return results;
}

/**
 * Check if an array looks like Luma event data
 */
function isLumaEventArray(arr) {
  if (arr.length === 0) return false;
  const first = arr[0];
  if (!first || typeof first !== 'object') return false;

  // Luma wrapper format: { event: { name, start_at }, geo_address_info, ... }
  if (first.event?.name && first.event?.start_at) return true;
  // Direct event format: { name, start_at }
  if (first.name && first.start_at) return true;
  // Schema.org-like format: { name, startDate }
  if (first.name && first.startDate) return true;

  return false;
}

/**
 * Parse an array of Luma-format event objects from __NEXT_DATA__
 */
function parseLumaEventArray(items, sourceConfig) {
  const events = [];

  for (const item of items) {
    const event = item.event || item;
    const geo = item.geo_address_info || event.geo_address_info || {};
    const ticketInfo = item.ticket_info || {};
    const calendar = item.calendar || {};

    const title = event.name;
    const startAt = event.start_at || event.startDate;
    const endAt = event.end_at || event.endDate;
    const urlSlug = event.url || event.slug;

    if (!title || !urlSlug) continue;

    const eventUrl = urlSlug.startsWith('http') ? urlSlug : `https://lu.ma/${urlSlug}`;
    const venueName = geo.address || geo.place_name || event.venue_name || null;
    const fullAddress = geo.full_address || geo.short_address || event.address || null;

    let organizer = sourceConfig.name;
    if (calendar.name) organizer = calendar.name;
    if (item.hosts && item.hosts.length > 0) organizer = item.hosts[0].name || organizer;

    events.push({
      title: decodeHtmlEntities(title),
      description: event.description ? decodeHtmlEntities(event.description).substring(0, 500) : null,
      url: eventUrl,
      source: sourceConfig.id,
      source_event_id: urlSlug,
      start_time: startAt,
      end_time: endAt || null,
      venue_name: venueName,
      address: fullAddress,
      is_free: ticketInfo.is_free ?? null,
      organizer: organizer,
      image_url: item.cover_url || event.cover_url || null,
    });
  }

  return events;
}

/**
 * Extract calendar API ID from page content
 */
function extractCalendarApiId($, html) {
  // Try __NEXT_DATA__
  const nextDataScript = $('script#__NEXT_DATA__').html();
  if (nextDataScript) {
    try {
      const data = JSON.parse(nextDataScript);
      const pp = data?.props?.pageProps || {};
      const calId = pp?.initialData?.calendar?.api_id ||
                    pp?.calendar?.api_id ||
                    pp?.data?.calendar?.api_id ||
                    pp?.calendarApiId;
      if (calId) {
        console.log(`    [diag] Found calendar_api_id in __NEXT_DATA__: ${calId}`);
        return calId;
      }
    } catch (e) { /* ignore */ }
  }

  // Try inline scripts
  const apiIdMatch = html.match(/calendar_api_id['":\s]+(['"])(cal-[a-zA-Z0-9]+)\1/);
  if (apiIdMatch) {
    console.log(`    [diag] Found calendar_api_id in inline script: ${apiIdMatch[2]}`);
    return apiIdMatch[2];
  }

  return null;
}

/**
 * Extract slug from Luma URL
 */
function extractSlug(url) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, '').split('/')[0];
  } catch (e) {
    return null;
  }
}

/**
 * Strategy 4: Fetch events from Luma's internal API
 */
async function fetchFromLumaApi(calendarApiId, slug, sourceConfig, diag) {
  const events = [];

  const attempts = [];
  if (calendarApiId) {
    attempts.push(`https://api.lu.ma/calendar/get-items?calendar_api_id=${calendarApiId}&period=future&pagination_limit=50`);
  }
  if (slug) {
    attempts.push(`https://api.lu.ma/url?url=${slug}`);
  }

  for (const apiUrl of attempts) {
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': sourceConfig.url,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.log(`    [diag] Luma API ${new URL(apiUrl).pathname}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      console.log(`    [diag] Luma API response keys: ${Object.keys(data).join(', ')}`);

      // Handle get-items response
      const items = data.entries || data.items || data.events;
      if (Array.isArray(items) && items.length > 0) {
        const parsed = parseLumaEventArray(items, sourceConfig);
        if (parsed.length > 0) return filterUpcoming(parsed);
      }

      // Handle url resolver — may return calendar info
      if (data.data?.calendar?.api_id && !calendarApiId) {
        const resolvedId = data.data.calendar.api_id;
        console.log(`    [diag] Resolved slug to calendar_api_id: ${resolvedId}`);
        return fetchFromLumaApi(resolvedId, null, sourceConfig, diag);
      }
    } catch (e) {
      console.log(`    [diag] Luma API error: ${e.message}`);
    }
  }

  return events;
}

/**
 * Strategy 5: Extract event links from HTML
 */
function extractFromHtml($, sourceConfig) {
  const events = [];
  const seen = new Set();
  const sourceSlug = extractSlug(sourceConfig.url);

  const selectors = [
    'a.event-link',
    'a.content-link',
    'a[href*="lu.ma/"]',
    'a[href*="luma.com/"]',
  ];

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      let eventUrl;
      try {
        eventUrl = href.startsWith('http') ? href : new URL(href, sourceConfig.url).href;
      } catch (e) { return; }

      const path = new URL(eventUrl).pathname.replace(/^\//, '');
      if (!path || path.includes('/') || path.length < 3) return;
      if (['about', 'contact', 'pricing', 'login', 'signup', 'explore', 'discover'].includes(path)) return;
      if (path === sourceSlug) return;

      if (seen.has(eventUrl)) return;
      seen.add(eventUrl);

      const title = $(el).text().trim() ||
                    $(el).find('h2, h3, h4, [class*="title"]').first().text().trim();

      if (title && title.length > 3 && title.length < 200) {
        events.push({
          title: decodeHtmlEntities(title),
          description: null,
          url: eventUrl,
          source: sourceConfig.id,
          source_event_id: path,
          start_time: null,
          end_time: null,
          venue_name: null,
          address: null,
          is_free: null,
          organizer: sourceConfig.name,
          image_url: null,
        });
      }
    });

    if (events.length > 0) break;
  }

  return events;
}

/**
 * Log diagnostic info when all strategies fail
 */
function logDiagnostics($, html, sourceConfig) {
  console.log(`    [diag] ALL STRATEGIES FAILED for ${sourceConfig.url}`);

  // JSON-LD details
  $('script[type="application/ld+json"]').each((i, script) => {
    try {
      const data = JSON.parse($(script).html());
      const type = data['@type'] || (Array.isArray(data) ? 'Array' : typeof data);
      console.log(`    [diag] JSON-LD #${i}: @type=${type}, keys=${Object.keys(data).join(', ')}`);
    } catch (e) {
      console.log(`    [diag] JSON-LD #${i}: parse error`);
    }
  });

  // RSC payload detection (Next.js App Router)
  const rscScripts = $('script').filter((_, el) => {
    const text = $(el).html() || '';
    return text.includes('self.__next_f.push');
  });
  if (rscScripts.length > 0) {
    console.log(`    [diag] Found ${rscScripts.length} RSC payload scripts (App Router detected)`);
  }

  // Count event-like links
  const lumaLinks = $('a[href]').filter((_, el) => {
    const href = $(el).attr('href') || '';
    return href.includes('lu.ma/') || href.includes('luma.com/');
  });
  console.log(`    [diag] Lu.ma/luma.com links on page: ${lumaLinks.length}`);
}

/**
 * Filter to only upcoming events
 */
function filterUpcoming(events) {
  const now = new Date();
  return events.filter(e => {
    if (e.start_time) {
      const eventDate = new Date(e.start_time);
      if (!isNaN(eventDate) && eventDate < now) return false;
    }
    return true;
  });
}
