import * as cheerio from 'cheerio';
import { decodeHtmlEntities } from '../utils/html.js';
import { ScrapeResult } from '../utils/scrapeResult.js';

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
      return ScrapeResult.fetchFailed();
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
              title: decodeHtmlEntities(event.name),
              description: decodeHtmlEntities(event.description) || null,
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

    // Fallback: Parse Next.js pageProps data (used on city/discover pages like luma.com/austin)
    if (events.length === 0) {
      $('script').each((_, script) => {
        try {
          const text = $(script).html();
          if (!text || !text.includes('initialData')) return;

          // Find __NEXT_DATA__ JSON
          const nextDataMatch = text.match(/\{.*"initialData".*\}/s);
          if (!nextDataMatch) return;

          const nextData = JSON.parse(nextDataMatch[0]);
          const eventsList = nextData?.props?.pageProps?.initialData?.events
            || nextData?.pageProps?.initialData?.events;

          if (!Array.isArray(eventsList)) return;

          for (const entry of eventsList) {
            const evt = entry.event || entry;
            if (!evt.name || !evt.start_at) continue;

            // Only include upcoming events
            const startDate = new Date(evt.start_at);
            if (startDate < new Date()) continue;

            // Extract location
            const geo = evt.geo_address_info;
            let venueName = geo?.address || null;
            let address = geo?.full_address || geo?.short_address || null;

            // Determine if free
            let isFree = entry.ticket_info?.is_free ?? null;

            // Build event URL
            const eventUrl = evt.url ? `https://lu.ma/${evt.url}` : null;

            // Extract organizer from hosts
            let organizer = sourceConfig.name;
            if (entry.hosts && entry.hosts.length > 0) {
              organizer = entry.hosts[0].name || sourceConfig.name;
            }

            events.push({
              title: decodeHtmlEntities(evt.name),
              description: null, // City pages don't include full descriptions
              url: eventUrl,
              source: sourceConfig.id,
              source_event_id: evt.url || evt.api_id || null,
              start_time: evt.start_at,
              end_time: evt.end_at || null,
              venue_name: venueName,
              address: address,
              is_free: isFree,
              organizer: organizer,
              image_url: evt.cover_url || null,
            });
          }
        } catch (e) {
          // Parse error, skip
        }
      });
    }

  } catch (error) {
    console.error(`    Error scraping Lu.ma ${sourceConfig.id}:`, error.message);
  }

  if (events.length === 0) {
    return ScrapeResult.parseUncertain();
  }
  return ScrapeResult.success(events);
}
