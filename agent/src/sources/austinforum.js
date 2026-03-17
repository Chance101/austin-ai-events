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

    // Find Eventbrite links from the main listing page
    const eventbriteLinks = new Set();
    $('a[href*="eventbrite.com/e/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const url = href.split('?')[0];
        eventbriteLinks.add(url);
      }
    });

    // Also check individual event detail pages for Eventbrite links
    // (some events only have the register link on the detail page)
    const detailPages = new Set();
    $('a[href*="/events/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      // Match paths like /events/april-7-2026 (month-day-year pattern)
      if (href.match(/\/events\/[a-z]+-\d{1,2}-\d{4}$/)) {
        detailPages.add(href.startsWith('http') ? href : `https://www.austinforum.org${href}`);
      }
    });

    for (const detailUrl of detailPages) {
      try {
        const detailResp = await fetch(detailUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        });
        if (!detailResp.ok) continue;
        const detailHtml = await detailResp.text();
        const $detail = cheerio.load(detailHtml);
        $detail('a[href*="eventbrite.com/e/"]').each((_, el) => {
          const href = $detail(el).attr('href');
          if (href) eventbriteLinks.add(href.split('?')[0]);
        });
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) {
        // Detail page fetch failed, skip
      }
    }

    console.log(`    [diag] Found ${eventbriteLinks.size} Eventbrite links (${detailPages.size} detail pages checked), ${$('a').length} total links`);

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
            if (data['@type']?.endsWith('Event')) {
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
                address: isInPerson ? [location.address?.streetAddress, location.address?.addressLocality, location.address?.addressRegion].filter(Boolean).join(', ') || null : null,
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
