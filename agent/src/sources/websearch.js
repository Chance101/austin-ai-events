import { getJson } from 'serpapi';
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { decodeHtmlEntities } from '../utils/html.js';

/**
 * Fetch an event page and extract full details including end_time
 * @param {string} url - Event page URL
 * @returns {Object|null} Enriched event data or null if extraction fails
 */
async function fetchEventDetails(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    // Try JSON-LD structured data (most reliable)
    let eventData = null;
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const data = JSON.parse($(script).html());
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (item['@type']?.endsWith('Event')) {
            eventData = {
              title: decodeHtmlEntities(item.name),
              description: decodeHtmlEntities(item.description),
              start_time: item.startDate,
              end_time: item.endDate || null,
              venue_name: item.location?.name,
              address: typeof item.location?.address === 'string'
                ? item.location.address
                : [item.location?.address?.streetAddress, item.location?.address?.addressLocality, item.location?.address?.addressRegion].filter(Boolean).join(', ') || null,
              image_url: item.image,
              organizer: item.organizer?.name,
              is_free: item.isAccessibleForFree,
            };
            break;
          }
        }
      } catch (e) {
        // JSON parse error, continue
      }
    });

    // Meetup fallback: if JSON-LD is missing venue, try Apollo state
    if (url.includes('meetup.com') && eventData && !eventData.venue_name) {
      try {
        const nextDataScript = $('script#__NEXT_DATA__').html();
        if (nextDataScript) {
          const nextData = JSON.parse(nextDataScript);
          const apolloState = nextData?.props?.pageProps?.__APOLLO_STATE__;
          if (apolloState) {
            // Find venue entries
            const venues = {};
            for (const [key, value] of Object.entries(apolloState)) {
              if (key.startsWith('Venue:') && value) venues[key] = value;
            }
            // Find the event and its venue ref
            for (const [key, value] of Object.entries(apolloState)) {
              if (key.startsWith('Event:') && value?.venue?.__ref && venues[value.venue.__ref]) {
                const venue = venues[value.venue.__ref];
                eventData.venue_name = venue.name;
                eventData.address = [venue.address, venue.city, venue.state].filter(Boolean).join(', ') || null;
                break;
              }
            }
          }
        }
      } catch (e) {
        // Apollo state extraction failed, continue with what we have
      }
    }

    return eventData;
  } catch (error) {
    // Timeout or fetch error
    return null;
  }
}

/**
 * Search for AI events in Austin using SerpAPI
 * @param {string[]} queries - Search queries to run
 * @param {Object} runStats - Optional run stats object for tracking API calls
 * @returns {Object} Object with events array and serpapiCalls count
 */
export async function searchEvents(queries = [], runStats = null) {
  if (!config.serpApiKey) {
    console.log('SerpAPI key not configured, skipping web search');
    return { events: [], serpapiCalls: 0 };
  }

  if (queries.length === 0) {
    console.log('No search queries provided, skipping web search');
    return { events: [], serpapiCalls: 0 };
  }

  const events = [];
  let serpapiCalls = 0;

  for (const query of queries) {
    try {
      const results = await getJson({
        api_key: config.serpApiKey,
        engine: 'google',
        q: query,
        location: 'Austin, Texas, United States',
        google_domain: 'google.com',
        gl: 'us',
        hl: 'en',
        num: 10,
      });
      serpapiCalls++;  // Track SerpAPI call

      // Collect URLs to fetch
      const urlsToFetch = [];

      // Process organic results
      if (results.organic_results) {
        for (const result of results.organic_results) {
          const link = result.link;
          // Filter for event-like pages (individual events, not listing/index pages)
          const isEventPage =
            link.includes('meetup.com/') ||
            link.includes('eventbrite.com/e/') ||
            link.includes('lu.ma/') ||
            link.match(/\/events?\/[^/?]/) // /event/slug or /events/slug, not bare /events/
          ;

          if (isEventPage) {
            urlsToFetch.push({
              url: link,
              fallback: {
                title: result.title,
                description: result.snippet,
              },
            });
          }
        }
      }

      // Process events from Google Events (if available)
      if (results.events_results) {
        for (const event of results.events_results) {
          urlsToFetch.push({
            url: event.link,
            fallback: {
              title: event.title,
              description: event.description,
              start_time: event.date?.start_date,
              venue_name: event.venue?.name,
              address: event.address?.join(', '),
            },
          });
        }
      }

      // Fetch each event page to get complete details including end_time
      for (const item of urlsToFetch) {
        const details = await fetchEventDetails(item.url);

        if (details && details.start_time) {
          // Use fetched details (includes end_time)
          events.push({
            ...details,
            url: item.url,
            source: 'web-search',
            source_event_id: null,
          });
        } else if (item.fallback.title && item.fallback.title.trim().length >= 10 && item.fallback.start_time) {
          // Fall back to search result data only if it has a real title and date
          events.push({
            ...item.fallback,
            url: item.url,
            source: 'web-search',
            source_event_id: null,
          });
        } else {
          // Skip — search snippet lacks enough data to be a useful event candidate
        }

        // Rate limit between page fetches
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Rate limiting - wait between queries
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`Error searching for "${query}":`, error.message);
    }
  }

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
  const dedupedEvents = upcoming.filter(e => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });

  return { events: dedupedEvents, serpapiCalls };
}
