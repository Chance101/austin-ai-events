import * as cheerio from 'cheerio';

/**
 * Scrape events from a Lu.ma calendar page
 */
export async function scrapeLuma(sourceConfig) {
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

    // Lu.ma embeds event data in script tags
    $('script').each((_, script) => {
      const content = $(script).html();
      if (content && content.includes('__NEXT_DATA__')) {
        try {
          const match = content.match(/__NEXT_DATA__\s*=\s*({[\s\S]*?});/);
          if (match) {
            const data = JSON.parse(match[1]);
            const pageProps = data?.props?.pageProps;

            // Extract events from various possible locations in the data
            const eventList = pageProps?.events ||
                              pageProps?.initialEvents ||
                              pageProps?.calendar?.events ||
                              [];

            eventList.forEach(event => {
              if (event.name || event.title) {
                events.push({
                  title: event.name || event.title,
                  description: event.description,
                  url: `https://lu.ma/${event.url || event.slug}`,
                  source: sourceConfig.id,
                  source_event_id: event.api_id || event.id,
                  start_time: event.start_at || event.startTime,
                  end_time: event.end_at || event.endTime,
                  venue_name: event.geo_address_info?.place_name || event.location,
                  address: event.geo_address_info?.full_address,
                  image_url: event.cover_url || event.coverUrl,
                  organizer: sourceConfig.name,
                  is_free: event.ticket_info?.is_free ?? null,
                });
              }
            });
          }
        } catch (e) {
          // JSON parse error
        }
      }
    });

    // Fallback: parse visible event cards
    if (events.length === 0) {
      $('a[href*="/event/"]').each((_, element) => {
        const $el = $(element);
        const href = $el.attr('href');
        const title = $el.find('h3, h2, [class*="title"]').text().trim() ||
                      $el.text().trim().split('\n')[0];

        if (title && href) {
          const fullUrl = href.startsWith('http') ? href : `https://lu.ma${href}`;
          events.push({
            title,
            url: fullUrl,
            source: sourceConfig.id,
            source_event_id: href.split('/').pop(),
            organizer: sourceConfig.name,
          });
        }
      });
    }

  } catch (error) {
    console.error(`Error scraping Lu.ma ${sourceConfig.id}:`, error.message);
  }

  return events;
}
