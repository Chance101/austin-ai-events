import * as cheerio from 'cheerio';
import { decodeHtmlEntities } from '../utils/html.js';

/**
 * Scrape events from a Meetup group's events page
 * Extracts data from Apollo GraphQL state embedded in __NEXT_DATA__
 */
export async function scrapeMeetup(sourceConfig) {
  const events = [];

  try {
    const response = await fetch(sourceConfig.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      console.error(`    Failed to fetch ${sourceConfig.url}: ${response.status}`);
      return events;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract __NEXT_DATA__ JSON
    const nextDataScript = $('script#__NEXT_DATA__').html();
    if (!nextDataScript) {
      console.error('    Could not find __NEXT_DATA__ script');
      return events;
    }

    const nextData = JSON.parse(nextDataScript);
    const apolloState = nextData?.props?.pageProps?.__APOLLO_STATE__;

    if (!apolloState) {
      console.error('    Could not find Apollo state in page data');
      return events;
    }

    // Extract the group name from Apollo state
    let groupName = sourceConfig.name; // fallback to config name
    for (const [key, value] of Object.entries(apolloState)) {
      if (key.startsWith('Group:') && value?.name) {
        groupName = value.name;
        break;
      }
    }

    // Extract venues for reference
    const venues = {};
    for (const [key, value] of Object.entries(apolloState)) {
      if (key.startsWith('Venue:') && value) {
        venues[key] = value;
      }
    }

    // Extract events
    for (const [key, value] of Object.entries(apolloState)) {
      if (key.startsWith('Event:') && value && value.dateTime) {
        // Only include upcoming events
        const eventDate = new Date(value.dateTime);
        if (eventDate < new Date()) {
          continue;
        }

        // Get venue info
        let venueName = null;
        let venueAddress = null;
        if (value.venue?.__ref && venues[value.venue.__ref]) {
          const venue = venues[value.venue.__ref];
          venueName = venue.name;
          venueAddress = [venue.address, venue.city, venue.state].filter(Boolean).join(', ');
        }

        // Determine if free (no feeSettings = free)
        const isFree = !value.feeSettings;

        events.push({
          title: decodeHtmlEntities(value.title),
          description: decodeHtmlEntities(value.description || value.aeoDescription) || null,
          url: value.eventUrl,
          source: sourceConfig.id,
          source_event_id: value.id,
          start_time: value.dateTime,
          end_time: value.endTime || null,
          venue_name: venueName,
          address: venueAddress,
          is_free: isFree,
          organizer: groupName,
          image_url: value.featuredEventPhoto?.highRes || null,
        });
      }
    }

  } catch (error) {
    console.error(`    Error scraping Meetup ${sourceConfig.id}:`, error.message);
  }

  return events;
}
