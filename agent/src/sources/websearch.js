import { getJson } from 'serpapi';
import { config } from '../config.js';

/**
 * Search for AI events in Austin using SerpAPI
 * @param {Object} runStats - Optional run stats object for tracking API calls
 * @returns {Object} Object with events array and serpapiCalls count
 */
export async function searchEvents(runStats = null) {
  if (!config.serpApiKey) {
    console.log('SerpAPI key not configured, skipping web search');
    return { events: [], serpapiCalls: 0 };
  }

  const events = [];
  let serpapiCalls = 0;

  for (const query of config.searchQueries) {
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

      // Process organic results
      if (results.organic_results) {
        for (const result of results.organic_results) {
          // Filter for event-like pages
          const isEventPage =
            result.link.includes('meetup.com/') ||
            result.link.includes('eventbrite.com/') ||
            result.link.includes('lu.ma/') ||
            result.link.includes('/event') ||
            result.link.includes('/events');

          if (isEventPage) {
            events.push({
              title: result.title,
              description: result.snippet,
              url: result.link,
              source: 'web-search',
              source_event_id: null,
              raw_data: result,
            });
          }
        }
      }

      // Process events from Google Events (if available)
      if (results.events_results) {
        for (const event of results.events_results) {
          events.push({
            title: event.title,
            description: event.description,
            url: event.link,
            source: 'web-search',
            source_event_id: null,
            start_time: event.date?.start_date,
            venue_name: event.venue?.name,
            address: event.address?.join(', '),
            raw_data: event,
          });
        }
      }

      // Rate limiting - wait between queries
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`Error searching for "${query}":`, error.message);
    }
  }

  // Dedupe by URL
  const seen = new Set();
  const dedupedEvents = events.filter(e => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });

  return { events: dedupedEvents, serpapiCalls };
}
