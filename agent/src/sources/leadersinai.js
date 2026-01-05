import * as cheerio from 'cheerio';

/**
 * Get the year for an upcoming February event
 * If we're past February, use next year; otherwise use current year
 */
function getUpcomingFebruaryYear() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed, so February = 1

  // If we're past February (month > 1), the next February event is next year
  return currentMonth > 1 ? currentYear + 1 : currentYear;
}

/**
 * Scrape event from Leaders in AI Summit Austin page
 */
export async function scrapeLeadersInAI(sourceConfig) {
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

    // Check for JSON-LD
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const data = JSON.parse($(script).html());
        if (data['@type'] === 'Event') {
          const startDate = new Date(data.startDate);
          const eventYear = startDate.getFullYear();
          if (startDate >= new Date()) {
            events.push({
              title: data.name,
              description: data.description,
              url: sourceConfig.url,
              source: sourceConfig.id,
              source_event_id: `leaders-in-ai-austin-${eventYear}`,
              start_time: data.startDate,
              end_time: data.endDate || null,
              venue_name: data.location?.name,
              address: data.location?.address?.streetAddress,
              is_free: false, // Executive summit, likely paid
              organizer: sourceConfig.name,
              image_url: data.image,
            });
          }
        }
      } catch (e) {
        // JSON parse error
      }
    });

    // If no JSON-LD, parse from page content
    if (events.length === 0) {
      // Look for date patterns in page text
      const pageText = $('body').text();

      // Try multiple date pattern formats
      // Pattern 1: February 17-18, 2026
      let dateMatch = pageText.match(/February\s+(\d+)\s*[-–]\s*(\d+),?\s*(\d{4})/i);

      // Pattern 2: Feb 17-18, 2026
      if (!dateMatch) {
        dateMatch = pageText.match(/Feb\.?\s+(\d+)\s*[-–]\s*(\d+),?\s*(\d{4})/i);
      }

      // Pattern 3: Look in meta tags or title
      if (!dateMatch) {
        const metaDesc = $('meta[name="description"]').attr('content') || '';
        const titleText = $('title').text() || '';
        const combined = metaDesc + ' ' + titleText;
        dateMatch = combined.match(/February\s+(\d+)\s*[-–]\s*(\d+),?\s*(\d{4})/i);
      }

      const venueMatch = pageText.match(/Omni\s+Austin\s+Hotel\s+Downtown/i);

      if (dateMatch) {
        // Use parsed year or fall back to upcoming February year
        const year = dateMatch[3] || getUpcomingFebruaryYear();
        const startDay = dateMatch[1];
        const endDay = dateMatch[2];

        const startDate = new Date(`February ${startDay}, ${year}`);
        const endDate = new Date(`February ${endDay}, ${year}`);

        if (startDate >= new Date()) {
          events.push({
            title: `Leaders In AI Summit Austin ${year}`,
            description: 'Two-day executive summit featuring panels on scaling AI from vision to value, human-centric transformation, data strategy, autonomous systems, and operationalizing enterprise AI. Includes pre-summit workshop on agentic AI systems and governance.',
            url: sourceConfig.url,
            source: sourceConfig.id,
            source_event_id: `leaders-in-ai-austin-${year}`,
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString(),
            venue_name: venueMatch ? 'Omni Austin Hotel Downtown' : 'Austin, TX',
            address: venueMatch ? 'Omni Austin Hotel Downtown, Austin, TX' : null,
            is_free: false,
            organizer: sourceConfig.name,
            image_url: null,
          });
        }
      }
      // Removed hardcoded fallback - rely on page scraping or JSON-LD only
    }

  } catch (error) {
    console.error(`    Error scraping Leaders in AI:`, error.message);
  }

  return events;
}
