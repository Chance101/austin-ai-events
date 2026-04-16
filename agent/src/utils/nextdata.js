import { decodeHtmlEntities } from './html.js';

/**
 * Extract events from Next.js __NEXT_DATA__ script tags.
 * Handles Luma city pages, Meetup Apollo state, and generic Next.js patterns.
 *
 * @param {Object} $ - Cheerio instance loaded with page HTML
 * @param {Object} opts - Source metadata
 * @param {string} [opts.sourceId] - Source ID for the event record
 * @param {string} [opts.sourceName] - Source name for organizer fallback
 * @param {string} [opts.sourceUrl] - Source URL for context
 * @returns {Array} Normalized event objects
 */
export function extractEventsFromNextData($, { sourceId, sourceName, sourceUrl } = {}) {
  let nextData = null;

  // Try <script id="__NEXT_DATA__"> first
  const nextDataScript = $('script#__NEXT_DATA__').html();
  if (nextDataScript) {
    try {
      nextData = JSON.parse(nextDataScript);
    } catch { /* parse error */ }
  }

  // Fallback: scan all scripts for pageProps/initialData
  if (!nextData) {
    $('script').each((_, script) => {
      if (nextData) return; // already found
      const text = $(script).html();
      if (!text || text.length < 100) return;
      if (!text.includes('pageProps') && !text.includes('initialData')) return;
      try {
        const match = text.match(/\{.*"pageProps".*\}/s);
        if (match) nextData = JSON.parse(match[0]);
      } catch { /* parse error */ }
    });
  }

  if (!nextData) return [];

  const pageProps = nextData?.props?.pageProps || nextData?.pageProps;
  if (!pageProps) return [];

  // --- Known platform patterns (fast path) ---

  // Luma city/calendar pages: pageProps.initialData.events[]
  const lumaEvents = pageProps?.initialData?.events
    || pageProps?.initialData?.data?.events;
  if (Array.isArray(lumaEvents) && lumaEvents.length > 0) {
    return parseLumaEvents(lumaEvents, { sourceId, sourceName, sourceUrl });
  }

  // Luma individual event pages: initialData.data.event (singular) +
  // initialData.data.calendar (the presenting org) + initialData.data.hosts
  // Structure: { data: { event: {...}, calendar: {name: "Hack AI"}, hosts: [...] } }
  const lumaData = pageProps?.initialData?.data;
  if (lumaData?.event && lumaData.event.start_at) {
    const calendarName = lumaData.calendar?.name || null;
    const entry = {
      event: lumaData.event,
      hosts: lumaData.hosts || [],
      calendar: lumaData.calendar || null,
      ticket_info: lumaData.ticket_info || null,
    };
    return parseLumaEvents([entry], {
      sourceId,
      sourceName: calendarName || sourceName,
      sourceUrl,
    });
  }

  // Meetup Apollo state: pageProps.__APOLLO_STATE__
  const apolloState = pageProps?.__APOLLO_STATE__;
  if (apolloState) {
    return parseMeetupApollo(apolloState, { sourceId, sourceName, sourceUrl });
  }

  // Generic: pageProps.event (single) or pageProps.events (array)
  if (pageProps.event && (pageProps.event.name || pageProps.event.title)) {
    const normalized = normalizeEvent(pageProps.event, { sourceId, sourceName, sourceUrl });
    return normalized ? [normalized] : [];
  }
  if (Array.isArray(pageProps.events) && pageProps.events.length > 0) {
    return pageProps.events
      .map(e => normalizeEvent(e, { sourceId, sourceName, sourceUrl }))
      .filter(Boolean);
  }

  // --- Generic deep walk (slow path) ---
  const found = [];
  walkForEvents(pageProps, found, 0, 8, new Set());
  return found.map(e => normalizeEvent(e, { sourceId, sourceName, sourceUrl })).filter(Boolean);
}

/**
 * Parse Luma city page event entries
 */
function parseLumaEvents(entries, { sourceId, sourceName, sourceUrl }) {
  const now = new Date();
  const events = [];

  for (const entry of entries) {
    const evt = entry.event || entry;
    if (!evt.name || !evt.start_at) continue;

    const startDate = new Date(evt.start_at);
    if (startDate < now) continue;

    const geo = evt.geo_address_info;
    const eventUrl = evt.url ? `https://lu.ma/${evt.url}` : null;

    // Prefer the calendar/presenter name (the organization, e.g., "Hack AI")
    // over hosts[0] (individual people, e.g., "Reid McCrabb"). On Luma,
    // "Presented by" is the org; "Hosted By" lists individual co-hosts.
    let organizer = sourceName || null;
    if (entry.calendar?.name) {
      organizer = entry.calendar.name;
    } else if (entry.hosts && entry.hosts.length > 0) {
      organizer = entry.hosts[0].name || organizer;
    }

    events.push({
      title: decodeHtmlEntities(evt.name),
      description: null,
      url: eventUrl,
      source: sourceId || 'web-search',
      source_event_id: evt.url || evt.api_id || null,
      start_time: evt.start_at,
      end_time: evt.end_at || null,
      venue_name: geo?.address || null,
      address: geo?.full_address || geo?.short_address || null,
      is_free: entry.ticket_info?.is_free ?? null,
      organizer,
      image_url: evt.cover_url || null,
    });
  }

  return events;
}

/**
 * Parse Meetup Apollo state for events
 */
function parseMeetupApollo(apolloState, { sourceId, sourceName, sourceUrl }) {
  const now = new Date();
  const venues = {};
  const events = [];

  // Collect venues
  for (const [key, value] of Object.entries(apolloState)) {
    if (key.startsWith('Venue:') && value) venues[key] = value;
  }

  // Collect events
  for (const [key, value] of Object.entries(apolloState)) {
    if (!key.startsWith('Event:') || !value) continue;
    if (!value.title || !value.dateTime) continue;

    const startDate = new Date(value.dateTime);
    if (startDate < now) continue;

    let venueName = null;
    let address = null;
    if (value.venue?.__ref && venues[value.venue.__ref]) {
      const v = venues[value.venue.__ref];
      venueName = v.name;
      address = [v.address, v.city, v.state].filter(Boolean).join(', ') || null;
    }

    events.push({
      title: decodeHtmlEntities(value.title),
      description: decodeHtmlEntities(value.description) || null,
      url: value.eventUrl ? `https://www.meetup.com${value.eventUrl}` : sourceUrl,
      source: sourceId || 'web-search',
      source_event_id: value.id || null,
      start_time: value.dateTime,
      end_time: value.endTime || null,
      venue_name: venueName,
      address,
      is_free: value.feeType === 'NO_FEE' ? true : null,
      organizer: sourceName || null,
      image_url: value.imageUrl || null,
    });
  }

  return events;
}

/**
 * Normalize a generic event object with varying field names
 */
function normalizeEvent(obj, { sourceId, sourceName, sourceUrl }) {
  const title = obj.name || obj.title;
  const startTime = obj.startDate || obj.start_at || obj.dateTime || obj.start_time || obj.date;

  if (!title || typeof title !== 'string' || title.length < 5) return null;
  if (!startTime) return null;

  // Skip past events
  const startDate = new Date(startTime);
  if (isNaN(startDate) || startDate < new Date()) return null;

  // Extract location
  let venueName = null;
  let address = null;
  if (obj.location) {
    if (typeof obj.location === 'string') {
      venueName = obj.location;
    } else {
      venueName = obj.location.name || obj.location.address;
      address = obj.location.address?.streetAddress
        || (typeof obj.location.address === 'string' ? obj.location.address : null);
    }
  }
  if (obj.geo_address_info) {
    venueName = venueName || obj.geo_address_info.address;
    address = address || obj.geo_address_info.full_address;
  }
  if (obj.venue) {
    venueName = venueName || (typeof obj.venue === 'string' ? obj.venue : obj.venue.name);
  }

  // Build URL
  let eventUrl = obj.url || obj.eventUrl || obj['@id'] || sourceUrl;
  if (eventUrl && !eventUrl.startsWith('http')) {
    eventUrl = sourceUrl ? new URL(eventUrl, sourceUrl).href : null;
  }

  return {
    title: decodeHtmlEntities(title),
    description: decodeHtmlEntities(obj.description) || null,
    url: eventUrl,
    source: sourceId || 'web-search',
    source_event_id: obj.id || obj.api_id || obj.identifier || null,
    start_time: startTime,
    end_time: obj.endDate || obj.end_at || obj.endTime || obj.end_time || null,
    venue_name: venueName,
    address,
    is_free: obj.isAccessibleForFree ?? obj.is_free ?? null,
    organizer: obj.organizer?.name || sourceName || null,
    image_url: obj.image || obj.imageUrl || obj.cover_url || null,
  };
}

/**
 * Recursively walk an object tree looking for event-like objects.
 * Depth-limited to avoid performance issues with large payloads.
 */
function walkForEvents(obj, results, depth, maxDepth, visited) {
  if (depth > maxDepth || !obj || typeof obj !== 'object') return;
  if (visited.has(obj)) return;
  visited.add(obj);

  // Check if this object looks like an event
  const hasName = typeof (obj.name || obj.title) === 'string' && (obj.name || obj.title).length >= 5;
  const hasDate = !!(obj.startDate || obj.start_at || obj.dateTime || obj.start_time);
  if (hasName && hasDate) {
    results.push(obj);
    return; // Don't walk children of found events
  }

  // Walk arrays and objects
  if (Array.isArray(obj)) {
    for (const item of obj) {
      walkForEvents(item, results, depth + 1, maxDepth, visited);
    }
  } else {
    for (const value of Object.values(obj)) {
      walkForEvents(value, results, depth + 1, maxDepth, visited);
    }
  }
}
