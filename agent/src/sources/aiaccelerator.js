import * as cheerio from 'cheerio';

/**
 * Scrape events from AI Accelerator Institute Austin page
 */
export async function scrapeAIAccelerator(sourceConfig) {
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

    // Find event tiles/cards
    $('[class*="eventCalendarTile"], [class*="eventDetails"]').closest('a, [class*="event"]').each((_, element) => {
      try {
        const $el = $(element);

        // Find the link
        let eventUrl = $el.attr('href') || $el.find('a').first().attr('href');
        if (eventUrl && !eventUrl.startsWith('http')) {
          eventUrl = new URL(eventUrl, sourceConfig.url).href;
        }

        // Extract event details
        const title = $el.find('[class*="eventTitle"]').text().trim();
        const dateText = $el.find('[class*="eventDate"]').text().trim();
        const location = $el.find('[class*="eventLocation"], [class*="eventCity"]').text().trim();

        if (title && eventUrl) {
          // Parse date (format varies: "Feb 25" or "February 25, 2025")
          let startTime = null;
          if (dateText) {
            // Try to parse the date
            const dateMatch = dateText.match(/(\w+)\s+(\d+),?\s*(\d{4})?/);
            if (dateMatch) {
              const month = dateMatch[1];
              const day = dateMatch[2];
              const year = dateMatch[3] || new Date().getFullYear();
              const parsed = new Date(`${month} ${day}, ${year}`);
              if (!isNaN(parsed.getTime())) {
                startTime = parsed.toISOString();
              }
            }
          }

          // Only include future events
          if (startTime && new Date(startTime) < new Date()) {
            return;
          }

          events.push({
            title,
            description: null, // Would need to fetch individual event page
            url: eventUrl,
            source: sourceConfig.id,
            source_event_id: eventUrl.split('/').pop() || null,
            start_time: startTime,
            end_time: null,
            venue_name: location || 'Austin',
            address: null,
            is_free: null,
            organizer: sourceConfig.name,
            image_url: $el.find('img').attr('src') || null,
          });
        }
      } catch (e) {
        // Parse error for this element
      }
    });

    // Also check for JSON-LD
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const data = JSON.parse($(script).html());
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          if (item['@type'] === 'Event') {
            const startDate = new Date(item.startDate);
            if (startDate < new Date()) continue;

            events.push({
              title: item.name,
              description: item.description,
              url: item.url || sourceConfig.url,
              source: sourceConfig.id,
              source_event_id: item.identifier || null,
              start_time: item.startDate,
              end_time: item.endDate || null,
              venue_name: item.location?.name || 'Austin',
              address: item.location?.address?.streetAddress,
              is_free: item.isAccessibleForFree || item.offers?.[0]?.price === 0,
              organizer: sourceConfig.name,
              image_url: item.image,
            });
          }
        }
      } catch (e) {
        // JSON parse error
      }
    });

  } catch (error) {
    console.error(`    Error scraping AI Accelerator:`, error.message);
  }

  // Dedupe by URL
  const seen = new Set();
  return events.filter(e => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}
