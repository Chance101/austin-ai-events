import * as cheerio from 'cheerio';
import { decodeHtmlEntities } from '../utils/html.js';

/**
 * Scrape events from Austin AI Alliance
 * Uses WordPress Tribe Events Calendar
 */
export async function scrapeAustinAI(sourceConfig) {
  const events = [];

  try {
    // First, get the list of event URLs from the events page
    const listResponse = await fetch(sourceConfig.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!listResponse.ok) {
      console.error(`    Failed to fetch ${sourceConfig.url}: ${listResponse.status}`);
      return events;
    }

    const listHtml = await listResponse.text();
    const $list = cheerio.load(listHtml);

    // Extract event URLs from JSON-LD ItemList
    const eventUrls = [];
    $list('script[type="application/ld+json"]').each((_, script) => {
      try {
        const data = JSON.parse($list(script).html());
        const graph = data['@graph'] || [data];
        for (const item of graph) {
          if (item['@type'] === 'CollectionPage' && item.mainEntity?.itemListElement) {
            for (const listItem of item.mainEntity.itemListElement) {
              if (listItem.url) {
                eventUrls.push(listItem.url);
              }
            }
          }
        }
      } catch (e) {
        // JSON parse error
      }
    });

    // Fetch each event page
    for (const eventUrl of eventUrls) {
      try {
        const eventResponse = await fetch(eventUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        if (!eventResponse.ok) continue;

        const eventHtml = await eventResponse.text();
        const $ = cheerio.load(eventHtml);

        // First try JSON-LD structured data (most reliable)
        let jsonLdEvent = null;
        $('script[type="application/ld+json"]').each((_, script) => {
          try {
            const data = JSON.parse($(script).html());
            const items = Array.isArray(data) ? data : data['@graph'] || [data];
            for (const item of items) {
              if (item['@type'] === 'Event') {
                jsonLdEvent = item;
                break;
              }
            }
          } catch (e) {
            // JSON parse error
          }
        });

        // Extract event details - prefer JSON-LD, fall back to Tribe Events classes
        const title = jsonLdEvent?.name || $('.tribe-events-single-event-title').text().trim();
        const cost = $('.tribe-events-cost').text().trim();
        const venue = jsonLdEvent?.location?.name ||
                      $('.tribe-venue').text().trim() ||
                      $('.tribe-events-venue-details .tribe-venue-name').text().trim();
        const address = (typeof jsonLdEvent?.location?.address === 'string'
                        ? jsonLdEvent.location.address
                        : jsonLdEvent?.location?.address?.streetAddress) ||
                        $('.tribe-address').text().trim();
        const description = jsonLdEvent?.description ||
                            $('.tribe-events-single-event-description').text().trim().substring(0, 500);

        // Parse date/time - prefer JSON-LD
        let startTime = null;
        let endTime = null;

        if (jsonLdEvent?.startDate) {
          startTime = new Date(jsonLdEvent.startDate).toISOString();
        }
        if (jsonLdEvent?.endDate) {
          endTime = new Date(jsonLdEvent.endDate).toISOString();
        }

        // Fall back to Tribe Events classes if no JSON-LD
        if (!startTime) {
          const dateStart = $('.tribe-events-start-date').attr('title') ||
                            $('.tribe-events-abbr.tribe-events-start-date').attr('title');
          const timeText = $('.tribe-event-date-start').text() + ' ' + $('.tribe-event-time').text();

          if (dateStart) {
            const timeMatch = timeText.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
            if (timeMatch) {
              const dateTime = new Date(`${dateStart} ${timeMatch[1]}`);
              if (!isNaN(dateTime.getTime())) {
                startTime = dateTime.toISOString();
              }
            } else {
              startTime = new Date(dateStart).toISOString();
            }
          }

          // Try to extract end time from Tribe Events
          const dateEnd = $('.tribe-events-end-date').attr('title') ||
                          $('.tribe-events-abbr.tribe-events-end-date').attr('title');
          if (dateEnd) {
            // Look for end time in the time text (format: "6:00 pm - 8:00 pm")
            const endTimeMatch = timeText.match(/-\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
            if (endTimeMatch) {
              const endDateTime = new Date(`${dateEnd} ${endTimeMatch[1]}`);
              if (!isNaN(endDateTime.getTime())) {
                endTime = endDateTime.toISOString();
              }
            } else {
              endTime = new Date(dateEnd).toISOString();
            }
          } else if (dateStart) {
            // Try parsing end time from same date
            const endTimeMatch = timeText.match(/-\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
            if (endTimeMatch) {
              const endDateTime = new Date(`${dateStart} ${endTimeMatch[1]}`);
              if (!isNaN(endDateTime.getTime())) {
                endTime = endDateTime.toISOString();
              }
            }
          }
        }

        // Skip past events
        if (startTime && new Date(startTime) < new Date()) {
          continue;
        }

        // Skip non-Austin events (Houston, Dallas, etc.)
        const lowerTitle = title.toLowerCase();
        const lowerVenue = venue.toLowerCase();
        if (lowerTitle.includes('houston') || lowerTitle.includes('dallas') ||
            lowerTitle.includes('san antonio') || lowerVenue.includes('houston')) {
          continue;
        }

        if (title && startTime) {
          events.push({
            title: decodeHtmlEntities(title),
            description: decodeHtmlEntities(description) || null,
            url: eventUrl,
            source: sourceConfig.id,
            source_event_id: eventUrl.split('/').filter(Boolean).pop() || null,
            start_time: startTime,
            end_time: endTime,
            venue_name: venue || null,
            address: address || null,
            is_free: cost.toLowerCase().includes('free'),
            organizer: sourceConfig.name,
            image_url: jsonLdEvent?.image || null,
          });
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (e) {
        console.error(`    Error fetching ${eventUrl}:`, e.message);
      }
    }

  } catch (error) {
    console.error(`    Error scraping Austin AI Alliance:`, error.message);
  }

  return events;
}
