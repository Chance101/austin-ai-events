import * as cheerio from 'cheerio';
import { fromZonedTime } from 'date-fns-tz';
import { decodeHtmlEntities } from '../utils/html.js';
import { ScrapeResult } from '../utils/scrapeResult.js';
import { createDiagnostics, createFetchDiagnostics, extractTextSnippet } from '../utils/scrapeDiagnostics.js';

const AUSTIN_TIMEZONE = 'America/Chicago';

/**
 * Parse a loose human-format date like "May 06, 2026 05:30 PM" as Austin
 * local time and return an ISO UTC string.
 *
 * Using new Date(str) + toISOString() silently uses the machine's local
 * timezone, which is UTC on GitHub Actions — that mis-tags Austin 5:30 PM
 * as UTC 17:30 instead of UTC 22:30. fromZonedTime() handles CST/CDT
 * correctly based on the date so DST is automatic.
 */
function parseAustinDate(monthStr, day, year, timeStr) {
  const monthNames = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const month = monthNames[monthStr.toLowerCase().substring(0, 3)];
  if (month === undefined) return null;

  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!timeMatch) return null;
  let hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2], 10);
  const ampm = timeMatch[3].toUpperCase();
  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  const isoStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  try {
    return fromZonedTime(isoStr, AUSTIN_TIMEZONE).toISOString();
  } catch {
    return null;
  }
}

/**
 * Scrape Austin AI events from AICamp
 * Uses the city-filtered page (server-rendered) which only shows Austin events
 */
export async function scrapeAICamp(sourceConfig) {
  const events = [];
  const diag = createDiagnostics();
  let rawHtml = null;

  try {
    const response = await fetch(sourceConfig.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    diag.httpStatus = response.status;

    if (!response.ok) {
      console.error(`    Failed to fetch ${sourceConfig.url}: ${response.status}`);
      diag.errors.push({ stage: 'fetch', message: `HTTP ${response.status}` });
      return ScrapeResult.fetchFailed(diag);
    }

    const html = await response.text();
    rawHtml = html;
    diag.pageSize = html.length;
    Object.assign(diag, createFetchDiagnostics(response, html));
    diag.parseAttempts.push('css-selectors');
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
        // dateMatch[4] captures the source's timezone abbreviation (CDT/CST)
        // but we ignore it — AICamp's Austin-filtered listing is always Central,
        // and fromZonedTime() handles DST automatically based on the date.

        // Determine the year from the event ID if possible (format: W2026050615)
        // Otherwise use current year — the detail page fetch will get the precise date
        const currentYear = new Date().getFullYear();
        let year = currentYear;
        if (eventId && /^W(\d{4})/.test(eventId)) {
          year = parseInt(eventId.substring(1, 5), 10);
        }

        startTime = parseAustinDate(monthStr, day, year, time);
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

    diag.candidateElements = eventCards.length;
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
    diag.errors.push({ stage: 'fetch', message: error.message });
  }

  // Filter to future events only
  const now = new Date();
  const upcoming = events.filter(e => {
    if (e.start_time) {
      const eventDate = new Date(e.start_time);
      if (!isNaN(eventDate) && eventDate < now) return false;
    }
    return true;
  });

  diag.eventsPreFilter = events.length;
  diag.parseStrategy = upcoming.length > 0 ? 'css-selectors' : null;

  if (upcoming.length === 0 && rawHtml) {
    diag.pageTextSnippet = extractTextSnippet(rawHtml);
    return ScrapeResult.parseUncertain(diag);
  }
  return ScrapeResult.success(upcoming, diag);
}

/**
 * Fetch and parse an individual AICamp event detail page.
 *
 * AICamp detail pages do NOT publish JSON-LD and use <h4> (not <h1>/<h2>)
 * for the event title. The prior implementation selected h1/h2 for title,
 * returned null when that came back empty, and caused the caller to fall
 * back to listing-only data — dropping venue, description, end_time, and
 * the correct start time on every AICamp event.
 *
 * Robust extraction ground truth observed on the live page:
 *   - <meta property="og:title"> reliably has the full title
 *   - Main content container: <div class="col-lg-8 left-contents">
 *   - Description paragraphs: first substantive <p> tags inside the container,
 *     skipping metadata sections (Venue, Speaker, Agenda, Prerequisite, etc.)
 *   - Venue block: <p><b>Venue:</b><br>Capital Factory, 701 Brazos St, ...</p>
 *   - Google Calendar link embeds precise UTC times in dates=YYYYMMDDTHHMMSSZ format
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

    // Try JSON-LD first (covers AICamp pages that happen to have it)
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

    // Title: og:title → h4 in .left-contents → any h4 → h1/h2 fallback
    const title = $('meta[property="og:title"]').attr('content')?.trim()
      || $('.left-contents h4').first().text().trim()
      || $('h4').first().text().trim()
      || $('h1, h2').first().text().trim();

    // Description: gather the first few substantive paragraphs inside the main
    // content container, skipping metadata sections. We use the .left-contents
    // container when present to avoid grabbing unrelated page content.
    let description = null;
    const container = $('.left-contents').first();
    const paraSource = container.length > 0 ? container.find('p') : $('p');
    const metadataPrefixes = /^(Venue|Speaker|Agenda|Prerequisite|Who should attend|Local and Global|Twitter|RSVP)/i;
    const descParas = [];
    paraSource.each((_, el) => {
      const text = $(el).text().trim();
      if (text.length < 30) return;
      if (metadataPrefixes.test(text)) return;
      descParas.push(text);
    });
    if (descParas.length > 0) {
      description = descParas.slice(0, 3).join('\n\n').substring(0, 1500);
    } else {
      // Last-resort fallback: og:description IF it's event-specific, not
      // the site-wide generic (AICamp's site-wide description starts with
      // "Join over half million developers...").
      const ogDesc = $('meta[property="og:description"]').attr('content');
      if (ogDesc && !/half million developers/i.test(ogDesc)) {
        description = ogDesc;
      }
    }

    // Start/end times: prefer the Google Calendar link's precise UTC values.
    let startTime = null;
    let endTime = null;
    const calMatch = html.match(/dates=(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
    if (calMatch) {
      startTime = `${calMatch[1]}-${calMatch[2]}-${calMatch[3]}T${calMatch[4]}:${calMatch[5]}:${calMatch[6]}Z`;
      endTime = `${calMatch[7]}-${calMatch[8]}-${calMatch[9]}T${calMatch[10]}:${calMatch[11]}:${calMatch[12]}Z`;
    }
    // If no Google Calendar link, do NOT text-parse with currentYear as
    // the assumed year — that falsely promotes old events (e.g., 2023) to
    // the current year. Return start_time=null and let the caller's merge
    // use card.startTime, which correctly derives the year from the event
    // ID (W2023041915 → year 2023).

    // Venue + address: target the explicit "Venue:" paragraph.
    // Structure: <p><b>Venue:</b><br>Capital Factory, 701 Brazos St, Austin, TX 78701<br>Room name:...</p>
    // cheerio .text() collapses this to: "Venue:\nCapital Factory, 701 Brazos St, Austin, TX 78701\nRoom name:..."
    let venueName = null;
    let address = null;
    paraSource.each((_, el) => {
      if (venueName) return;
      const text = $(el).text().trim();
      if (!/^Venue:/i.test(text)) return;
      const withoutHeader = text.replace(/^Venue:\s*/i, '');
      const lines = withoutHeader.split('\n').map(l => l.trim()).filter(Boolean);
      const addressLine = lines[0];
      if (!addressLine) return;
      const parts = addressLine.split(',').map(s => s.trim());
      venueName = parts[0] || null;
      address = parts.length > 1 ? parts.slice(1).join(', ') : null;
    });

    // Fallback to body-text regex if the explicit Venue block wasn't found.
    if (!venueName) {
      const pageText = $('body').text();
      const venueMatch = pageText.match(/(?:venue|location|address)[:\s]+([^,\n]+(?:,\s*[^,\n]+){0,3})/i);
      if (venueMatch) {
        const parts = venueMatch[1].trim().split(',').map(s => s.trim());
        venueName = parts[0] || null;
        address = parts.length > 1 ? parts.slice(1).join(', ') : null;
      }
    }

    if (title) {
      return {
        title: decodeHtmlEntities(title),
        description: description ? decodeHtmlEntities(description) : null,
        url,
        source: sourceConfig.id,
        start_time: startTime,
        end_time: endTime,
        venue_name: venueName,
        address: address || 'Austin, TX',
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
