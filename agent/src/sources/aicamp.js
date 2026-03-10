import * as cheerio from 'cheerio';
import { decodeHtmlEntities } from '../utils/html.js';

/**
 * Scrape Austin AI events from AICamp
 * Uses the city-filtered page (server-rendered) which only shows Austin events
 */
export async function scrapeAICamp(sourceConfig) {
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

    // Find all event links (pattern: /event/eventdetails/XXXXX)
    // The city-filtered page is server-rendered, so all links are in the HTML
    const eventLinks = [];
    $('a[href*="/event/eventdetails/"]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      const text = $el.text().trim();

      if (!href || !text) return;

      const fullUrl = href.startsWith('http')
        ? href
        : `https://www.aicamp.ai${href}`;

      const eventId = href.split('/').pop();

      // Skip if we already have this event (image links and title links share the same href)
      if (eventLinks.some(e => e.eventId === eventId)) return;

      // Only keep links that have meaningful text (skip image-only links)
      if (text.length < 5) return;

      // Try to extract date from card text
      // Format: "Mar 04, 05:30 PM CST" or "Apr 01, 05:30 PM CDT"
      const dateMatch = text.match(/(\w{3})\s+(\d{1,2}),?\s+(\d{1,2}:\d{2}\s*[AP]M)\s*(\w{3,4})?/i);

      let startTime = null;
      if (dateMatch) {
        const monthStr = dateMatch[1];
        const day = dateMatch[2];
        const time = dateMatch[3];
        const year = new Date().getFullYear();
        const dateStr = `${monthStr} ${day}, ${year} ${time}`;
        const parsed = new Date(dateStr);
        if (!isNaN(parsed)) {
          startTime = parsed.toISOString();
        }
      }

      // Extract title from text — take the first substantial line
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
      const title = lines[0] ? decodeHtmlEntities(lines[0]) : '';

      if (title && fullUrl) {
        eventLinks.push({
          url: fullUrl,
          eventId,
          title,
          startTime,
        });
      }
    });

    // Dedupe by URL before fetching details
    const seen = new Set();
    const uniqueLinks = eventLinks.filter(e => {
      if (seen.has(e.url)) return false;
      seen.add(e.url);
      return true;
    });

    console.log(`    Found ${uniqueLinks.length} Austin events on AICamp listing`);

    // Fetch detail pages for richer data (with rate limiting)
    for (const link of uniqueLinks) {
      try {
        await new Promise(resolve => setTimeout(resolve, 300));

        const detail = await fetchEventDetail(link.url, sourceConfig);
        if (detail) {
          // Merge listing data with detail data (detail takes priority)
          events.push({
            ...detail,
            start_time: detail.start_time || link.startTime,
            source_event_id: link.eventId,
          });
        } else {
          // Fallback to listing data only
          events.push({
            title: link.title,
            description: null,
            url: link.url,
            source: sourceConfig.id,
            source_event_id: link.eventId,
            start_time: link.startTime,
            end_time: null,
            venue_name: null,
            address: 'Austin, TX',
            is_free: true,
            organizer: 'AICamp',
            image_url: null,
          });
        }
      } catch (e) {
        console.error(`    Error fetching AICamp detail ${link.url}: ${e.message}`);
        // Still add with listing data
        events.push({
          title: link.title,
          description: null,
          url: link.url,
          source: sourceConfig.id,
          source_event_id: link.eventId,
          start_time: link.startTime,
          end_time: null,
          venue_name: null,
          address: 'Austin, TX',
          is_free: true,
          organizer: 'AICamp',
          image_url: null,
        });
      }
    }

  } catch (error) {
    console.error(`    Error scraping AICamp:`, error.message);
  }

  // Filter to future events only
  const now = new Date();
  return events.filter(e => {
    if (e.start_time) {
      const eventDate = new Date(e.start_time);
      if (!isNaN(eventDate) && eventDate < now) return false;
    }
    return true;
  });
}

/**
 * Fetch and parse an individual AICamp event detail page
 */
async function fetchEventDetail(url, sourceConfig) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    // Try JSON-LD first
    let event = null;
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const data = JSON.parse($(script).html());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Event') {
            event = {
              title: decodeHtmlEntities(item.name),
              description: decodeHtmlEntities(item.description),
              url: item.url || url,
              source: sourceConfig.id,
              start_time: item.startDate,
              end_time: item.endDate || null,
              venue_name: item.location?.name || null,
              address: typeof item.location?.address === 'string'
                ? item.location.address
                : [item.location?.address?.streetAddress, item.location?.address?.addressLocality, item.location?.address?.addressRegion].filter(Boolean).join(', ') || null,
              is_free: item.isAccessibleForFree ?? true,
              organizer: item.organizer?.name || 'AICamp',
              image_url: item.image || null,
            };
          }
        }
      } catch (e) {
        // JSON parse error
      }
    });

    if (event) return event;

    // Fallback: parse from page content
    const title = $('h1, h2').first().text().trim();
    const description = $('meta[name="description"]').attr('content') ||
                       $('[class*="description"], [class*="detail"]').first().text().trim().substring(0, 500);

    // Look for venue/location text
    const pageText = $('body').text();
    const venueMatch = pageText.match(/(?:venue|location|address)[:\s]+([^,\n]+(?:,\s*[^,\n]+){0,3})/i);
    const venue = venueMatch ? venueMatch[1].trim() : null;

    // Look for date
    const dateMatch = pageText.match(/(\w+\s+\d{1,2},?\s+\d{4}\s+(?:at\s+)?\d{1,2}:\d{2}\s*[AP]M)/i);
    let startTime = null;
    if (dateMatch) {
      const parsed = new Date(dateMatch[1].replace(' at ', ' '));
      if (!isNaN(parsed)) startTime = parsed.toISOString();
    }

    if (title) {
      return {
        title: decodeHtmlEntities(title),
        description: description ? decodeHtmlEntities(description) : null,
        url,
        source: sourceConfig.id,
        start_time: startTime,
        end_time: null,
        venue_name: venue,
        address: 'Austin, TX',
        is_free: true,
        organizer: 'AICamp',
        image_url: $('meta[property="og:image"]').attr('content') || null,
      };
    }

    return null;
  } catch (e) {
    return null;
  }
}
