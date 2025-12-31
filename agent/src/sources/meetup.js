import * as cheerio from 'cheerio';

/**
 * Scrape events from a Meetup group's events page
 */
export async function scrapeMeetup(sourceConfig) {
  const events = [];

  try {
    const response = await fetch(sourceConfig.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AustinAIEventsBot/1.0)',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${sourceConfig.url}: ${response.status}`);
      return events;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Meetup's event cards - structure may vary
    $('[data-event-id], .eventCard, [id^="event-card"]').each((_, element) => {
      try {
        const $el = $(element);

        // Try to extract event data from various possible structures
        const title = $el.find('h2, h3, [data-event-label]').first().text().trim() ||
                      $el.find('a').first().text().trim();

        const link = $el.find('a[href*="/events/"]').first().attr('href') ||
                     $el.find('a').first().attr('href');

        const dateText = $el.find('time').attr('datetime') ||
                         $el.find('[data-event-time]').text().trim();

        const venue = $el.find('[data-event-venue], .venueDisplay').text().trim();

        if (title && link) {
          const fullUrl = link.startsWith('http') ? link : `https://www.meetup.com${link}`;

          events.push({
            title,
            url: fullUrl,
            source: sourceConfig.id,
            source_event_id: link.match(/events\/(\d+)/)?.[1] || null,
            venue_name: venue || null,
            raw_date: dateText,
            organizer: sourceConfig.name,
          });
        }
      } catch (e) {
        console.error('Error parsing Meetup event:', e.message);
      }
    });

    // Fallback: look for JSON-LD structured data
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const data = JSON.parse($(script).html());
        const eventData = Array.isArray(data) ? data : [data];

        eventData.forEach(item => {
          if (item['@type'] === 'Event' && item.name) {
            events.push({
              title: item.name,
              description: item.description,
              url: item.url,
              source: sourceConfig.id,
              source_event_id: item.url?.match(/events\/(\d+)/)?.[1] || null,
              start_time: item.startDate,
              end_time: item.endDate,
              venue_name: item.location?.name,
              address: item.location?.address?.streetAddress,
              organizer: sourceConfig.name,
            });
          }
        });
      } catch (e) {
        // JSON parse error, skip
      }
    });

  } catch (error) {
    console.error(`Error scraping Meetup ${sourceConfig.id}:`, error.message);
  }

  // Dedupe by URL
  const seen = new Set();
  return events.filter(e => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}
