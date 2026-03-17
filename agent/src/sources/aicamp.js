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

    // Parse event cards — each is a .single-popular-carusel div
    // Structure:
    //   .thumb-wrap > .thumb > a[href] (link + image)
    //   .thumb-wrap > .meta > h4 (short date like "May 06")
    //   .details > a > h4 (title)
    //   .details text contains: "May 06, 05:30 PM CDT" after calendar icon span
    //   .details > div with lnr-earth (city)
    //   .details > div with lnr-store (organizer)
    //   .details > div with lnr-user (speaker)
    const eventCards = [];
    const seen = new Set();

    $('.single-popular-carusel').each((_, card) => {
      const $card = $(card);

      // Extract URL and event ID from the link
      const $link = $card.find('a[href*="/event/eventdetails/"]').first();
      const href = $link.attr('href');
      if (!href) return;

      const fullUrl = href.startsWith('http')
        ? href
        : `https://www.aicamp.ai${href}`;
      const eventId = href.split('/').pop();

      // Dedupe by event ID
      if (seen.has(eventId)) return;
      seen.add(eventId);

      // Extract title from h4 inside the details link
      const title = $card.find('.details a h4').text().trim();
      if (!title || title.length < 5) return;

      // Extract date+time from .details text
      // The format is: "May 06, 05:30 PM CDT" as a text node in .details
      const detailsText = $card.find('.details').text();
      const dateMatch = detailsText.match(/(\w{3})\s+(\d{1,2}),?\s+(\d{1,2}:\d{2}\s*[AP]M)\s*(\w{3,4})?/i);

      let startTime = null;
      if (dateMatch) {
        const monthStr = dateMatch[1];
        const day = dateMatch[2];
        const time = dateMatch[3].trim();
        const tz = dateMatch[4] || 'CST';

        // Determine the year from the event ID if possible (format: W2026050615)
        // Otherwise use current year — the detail page fetch will get the precise date
        const currentYear = new Date().getFullYear();
        let year = currentYear;
        if (eventId && /^W(\d{4})/.test(eventId)) {
          year = parseInt(eventId.substring(1, 5), 10);
        }

        const dateStr = `${monthStr} ${day}, ${year} ${time}`;
        const parsed = new Date(dateStr);
        if (!isNaN(parsed)) {
          startTime = parsed.toISOString();
        }
      }

      // Extract organizer from "By ..." text
      const orgMatch = detailsText.match(/By\s+(.+?)(?:\n|$)/);
      const organizer = orgMatch ? orgMatch[1].trim() : 'AICamp';

      // Extract speaker
      const speakerMatch = detailsText.match(/Speaker:\s*(.+?)(?:\n|$)/);
      const speaker = speakerMatch ? speakerMatch[1].trim() : null;

      // Extract image
      const imageUrl = $card.find('.thumb img').attr('src') || null;

      eventCards.push({
        url: fullUrl,
        eventId,
        title: decodeHtmlEntities(title),
        startTime,
        organizer,
        speaker,
        imageUrl,
      });
    });

    console.log(`    Found ${eventCards.length} Austin events on AICamp listing`);

    // Build events, fetching detail pages for richer data (with rate limiting)
    for (const card of eventCards) {
      try {
        await new Promise(resolve => setTimeout(resolve, 300));

        const detail = await fetchEventDetail(card.url, sourceConfig);
        if (detail) {
          // Merge listing data with detail data (detail takes priority for most fields)
          events.push({
            ...detail,
            start_time: detail.start_time || card.startTime,
            source_event_id: card.eventId,
            organizer: detail.organizer || card.organizer,
            image_url: detail.image_url || card.imageUrl,
          });
        } else {
          // Fallback to listing data only
          events.push({
            title: card.title,
            description: card.speaker ? `Speaker: ${card.speaker}` : null,
            url: card.url,
            source: sourceConfig.id,
            source_event_id: card.eventId,
            start_time: card.startTime,
            end_time: null,
            venue_name: null,
            address: 'Austin, TX',
            is_free: true,
            organizer: card.organizer,
            image_url: card.imageUrl,
          });
        }
      } catch (e) {
        console.error(`    Error fetching AICamp detail ${card.url}: ${e.message}`);
        // Still add with listing data
        events.push({
          title: card.title,
          description: null,
          url: card.url,
          source: sourceConfig.id,
          source_event_id: card.eventId,
          start_time: card.startTime,
          end_time: null,
          venue_name: null,
          address: 'Austin, TX',
          is_free: true,
          organizer: card.organizer,
          image_url: card.imageUrl,
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

    // Look for date+time in the detail page
    // Format: "May 06, 05:30 PM CDT" near the clock icon
    const pageText = $('body').text();

    let startTime = null;
    let endTime = null;

    // Try to extract from Google Calendar link which has precise UTC times
    // Pattern: dates=20260506T223000Z/20260507T013000Z
    const calMatch = html.match(/dates=(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
    if (calMatch) {
      startTime = `${calMatch[1]}-${calMatch[2]}-${calMatch[3]}T${calMatch[4]}:${calMatch[5]}:${calMatch[6]}Z`;
      endTime = `${calMatch[7]}-${calMatch[8]}-${calMatch[9]}T${calMatch[10]}:${calMatch[11]}:${calMatch[12]}Z`;
    }

    if (!startTime) {
      // Fallback: parse text date
      const dateMatch = pageText.match(/(\w{3,9})\s+(\d{1,2}),?\s+(\d{1,2}:\d{2}\s*[AP]M)\s*(\w{3,4})/i);
      if (dateMatch) {
        const year = new Date().getFullYear();
        const dateStr = `${dateMatch[1]} ${dateMatch[2]}, ${year} ${dateMatch[3].trim()}`;
        const parsed = new Date(dateStr);
        if (!isNaN(parsed)) startTime = parsed.toISOString();
      }
    }

    // Look for venue/location text
    const venueMatch = pageText.match(/(?:venue|location|address)[:\s]+([^,\n]+(?:,\s*[^,\n]+){0,3})/i);
    const venue = venueMatch ? venueMatch[1].trim() : null;

    if (title) {
      return {
        title: decodeHtmlEntities(title),
        description: description ? decodeHtmlEntities(description) : null,
        url,
        source: sourceConfig.id,
        start_time: startTime,
        end_time: endTime,
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
