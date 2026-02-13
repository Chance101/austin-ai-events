import * as cheerio from 'cheerio';
import { decodeHtmlEntities } from '../utils/html.js';

/**
 * Scrape events from Austin Forum on Technology & Society
 * Events are listed with Eventbrite links
 */
export async function scrapeAustinForum(sourceConfig) {
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

    // Find Eventbrite links and extract event info
    const eventbriteLinks = new Set();
    $('a[href*="eventbrite.com/e/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        // Normalize URL (remove query params for dedup)
        const url = href.split('?')[0];
        eventbriteLinks.add(url);
      }
    });

    console.log(`    [diag] Found ${eventbriteLinks.size} Eventbrite links on page, ${$('a').length} total links`);

    // For each unique Eventbrite link, try to fetch event details
    for (const eventUrl of eventbriteLinks) {
      try {
        const eventResponse = await fetch(eventUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        if (!eventResponse.ok) continue;

        const eventHtml = await eventResponse.text();
        const $event = cheerio.load(eventHtml);

        // Extract JSON-LD from Eventbrite page
        $event('script[type="application/ld+json"]').each((_, script) => {
          try {
            const data = JSON.parse($event(script).html());
            if (data['@type'] === 'Event') {
              // Only include future events
              const startDate = new Date(data.startDate);
              if (startDate < new Date()) return;

              // Check if it's in Austin (some Austin Forum events are online-only)
              const location = data.location;
              const isInPerson = location?.['@type'] === 'Place';
              const city = location?.address?.addressLocality || '';
              const isAustin = city.toLowerCase().includes('austin');

              events.push({
                title: decodeHtmlEntities(data.name),
                description: decodeHtmlEntities(data.description),
                url: eventUrl,
                source: sourceConfig.id,
                source_event_id: eventUrl.match(/tickets-(\d+)/)?.[1] || null,
                start_time: data.startDate,
                end_time: data.endDate || null,
                venue_name: isInPerson ? location.name : 'Online',
                address: isInPerson ? location.address?.streetAddress : null,
                is_free: data.offers?.[0]?.price === 0 || data.isAccessibleForFree,
                organizer: sourceConfig.name,
                image_url: data.image,
                is_online: !isInPerson,
                is_austin: isAustin || !isInPerson, // Online events count as Austin
              });
            }
          } catch (e) {
            // JSON parse error
          }
        });

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (e) {
        console.error(`    Error fetching ${eventUrl}:`, e.message);
      }
    }

  } catch (error) {
    console.error(`    Error scraping Austin Forum:`, error.message);
  }

  return events;
}
