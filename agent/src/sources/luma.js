import * as cheerio from 'cheerio';

/**
 * Scrape events from a Lu.ma calendar page
 * Extracts data from JSON-LD structured data
 */
export async function scrapeLuma(sourceConfig) {
  const events = [];

  try {
    const response = await fetch(sourceConfig.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error(`    Failed to fetch ${sourceConfig.url}: ${response.status}`);
      return events;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Find JSON-LD script tags
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const data = JSON.parse($(script).html());

        // Check if this is an Organization with events
        if (data['@type'] === 'Organization' && Array.isArray(data.events)) {
          for (const event of data.events) {
            if (event['@type'] !== 'Event') continue;

            // Only include upcoming events
            const startDate = new Date(event.startDate);
            if (startDate < new Date()) continue;

            // Extract location info
            let venueName = null;
            let address = null;
            let city = null;

            if (event.location) {
              venueName = event.location.name;
              if (event.location.address) {
                const addr = event.location.address;
                address = addr.streetAddress;
                city = addr.addressLocality;
              }
            }

            // Determine if free
            let isFree = null;
            if (event.offers && event.offers.length > 0) {
              isFree = event.offers[0].price === 0;
            }

            // Get event URL from @id
            const eventUrl = event['@id'] || null;

            // Extract organizer name
            let organizer = sourceConfig.name;
            if (event.organizer && event.organizer.length > 0) {
              organizer = event.organizer[0].name || sourceConfig.name;
            }

            // Get image
            const imageUrl = Array.isArray(event.image) ? event.image[0] : event.image;

            events.push({
              title: event.name,
              description: event.description || null,
              url: eventUrl,
              source: sourceConfig.id,
              source_event_id: eventUrl?.split('/').pop() || null,
              start_time: event.startDate,
              end_time: event.endDate || null,
              venue_name: venueName,
              address: address ? `${address}, ${city}` : city,
              is_free: isFree,
              organizer: organizer,
              image_url: imageUrl || null,
            });
          }
        }
      } catch (e) {
        // JSON parse error, skip this script tag
      }
    });

  } catch (error) {
    console.error(`    Error scraping Lu.ma ${sourceConfig.id}:`, error.message);
  }

  return events;
}
