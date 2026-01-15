import * as cheerio from 'cheerio';
import { decodeHtmlEntities } from '../utils/html.js';

/**
 * Generic scraper for websites with event listings
 * Attempts to find events using common patterns
 */
export async function scrapeGeneric(sourceConfig) {
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

    // Try JSON-LD structured data first (most reliable)
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const data = JSON.parse($(script).html());
        const items = Array.isArray(data) ? data : [data];

        items.forEach(item => {
          if (item['@type'] === 'Event') {
            events.push({
              title: decodeHtmlEntities(item.name),
              description: decodeHtmlEntities(item.description),
              url: item.url || sourceConfig.url,
              source: sourceConfig.id,
              source_event_id: item.identifier || null,
              start_time: item.startDate,
              end_time: item.endDate,
              venue_name: item.location?.name,
              address: typeof item.location?.address === 'string'
                ? item.location.address
                : item.location?.address?.streetAddress,
              image_url: item.image,
              organizer: item.organizer?.name || sourceConfig.name,
              is_free: item.isAccessibleForFree,
            });
          }
        });
      } catch (e) {
        // JSON parse error
      }
    });

    // If no structured data, try common patterns
    if (events.length === 0) {
      // Look for event cards with common class patterns
      const selectors = [
        '.event-card',
        '.event-item',
        '[class*="event"]',
        'article[class*="event"]',
        '.card[data-event]',
      ];

      for (const selector of selectors) {
        $(selector).each((_, element) => {
          const $el = $(element);

          const title = $el.find('h2, h3, h4, [class*="title"]').first().text().trim();
          const link = $el.find('a').first().attr('href');
          const dateText = $el.find('time, [class*="date"]').first().text().trim() ||
                          $el.find('time').attr('datetime');
          const venue = $el.find('[class*="location"], [class*="venue"]').text().trim();

          if (title && link) {
            const fullUrl = link.startsWith('http')
              ? link
              : new URL(link, sourceConfig.url).href;

            events.push({
              title,
              url: fullUrl,
              source: sourceConfig.id,
              source_event_id: null,
              venue_name: venue || null,
              raw_date: dateText,
              organizer: sourceConfig.name,
            });
          }
        });

        if (events.length > 0) break;
      }
    }

  } catch (error) {
    console.error(`Error scraping ${sourceConfig.id}:`, error.message);
  }

  // Dedupe by URL
  const seen = new Set();
  return events.filter(e => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}
