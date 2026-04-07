import * as cheerio from 'cheerio';
import { decodeHtmlEntities } from '../utils/html.js';
import { extractEventsFromNextData } from '../utils/nextdata.js';
import { ScrapeResult } from '../utils/scrapeResult.js';

/**
 * Generic scraper for websites with event listings
 * Attempts to find events using common patterns
 */
export async function scrapeGeneric(sourceConfig) {
  const events = [];

  try {
    const response = await fetch(sourceConfig.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${sourceConfig.url}: ${response.status}`);
      return ScrapeResult.fetchFailed();
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Try JSON-LD structured data first (most reliable)
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const data = JSON.parse($(script).html());
        const items = Array.isArray(data) ? data : [data];

        items.forEach(item => {
          // Collect Event objects — may be top-level or nested in ItemList > ListItem
          const eventObjects = [];
          if (item['@type']?.endsWith('Event')) {
            eventObjects.push(item);
          } else if (item['@type'] === 'ItemList' && Array.isArray(item.itemListElement)) {
            for (const li of item.itemListElement) {
              const nested = li.item || li;
              if (nested['@type']?.endsWith('Event')) {
                eventObjects.push(nested);
              }
            }
          }

          for (const evt of eventObjects) {
            events.push({
              title: decodeHtmlEntities(evt.name),
              description: decodeHtmlEntities(evt.description),
              url: evt.url || sourceConfig.url,
              source: sourceConfig.id,
              source_event_id: evt.identifier || null,
              start_time: evt.startDate,
              end_time: evt.endDate,
              venue_name: evt.location?.name,
              address: typeof evt.location?.address === 'string'
                ? evt.location.address
                : evt.location?.address?.streetAddress,
              image_url: evt.image,
              organizer: evt.organizer?.name || sourceConfig.name,
              is_free: evt.isAccessibleForFree,
            });
          }
        });
      } catch (e) {
        // JSON parse error
      }
    });

    // If no JSON-LD, try __NEXT_DATA__ extraction
    if (events.length === 0) {
      const nextDataEvents = extractEventsFromNextData($, {
        sourceId: sourceConfig.id,
        sourceName: sourceConfig.name,
        sourceUrl: sourceConfig.url,
      });
      events.push(...nextDataEvents);
    }

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
  const deduped = upcoming.filter(e => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });

  // If HTML was received but no events extracted, signal parse uncertainty
  if (deduped.length === 0) {
    return ScrapeResult.parseUncertain();
  }
  return ScrapeResult.success(deduped);
}
