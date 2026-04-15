/**
 * Parser router — maps URLs to platform-specific scrapers by domain.
 *
 * Dynamically-discovered URLs (from web search, feedback, etc.) may be labeled
 * as 'website' or 'other' by the Claude evaluator but still live on platforms
 * we have dedicated parsers for. Routing by URL domain ensures a lu.ma URL
 * is handed to the Luma parser regardless of what the evaluator guessed.
 *
 * Returns a scraper type key matching the dispatch tables in
 * agent/src/index.js (scrapeSource) and agent/src/utils/testScraper.js
 * (scrapers map). Returns null when the URL is not on a known platform,
 * leaving the caller to fall back to the configured type.
 */

/**
 * Platform domain patterns → scraper type. Order matters only for readability;
 * each hostname only matches one entry. Eventbrite intentionally absent —
 * we don't have a dedicated Eventbrite parser yet; the generic scraper
 * handles Eventbrite listing pages via JSON-LD fallback.
 */
const PLATFORM_PARSERS = [
  { pattern: /^lu\.ma$/, scraper: 'luma' },
  { pattern: /^luma\.com$/, scraper: 'luma' },
  { pattern: /^meetup\.com$/, scraper: 'meetup' },
];

/**
 * Return the scraper type for a given URL based on its hostname, or null
 * if no platform-specific parser matches.
 *
 * @param {string} url
 * @returns {string|null}
 */
export function routeToParser(url) {
  if (!url || typeof url !== 'string') return null;
  let hostname;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
  for (const { pattern, scraper } of PLATFORM_PARSERS) {
    if (pattern.test(hostname)) return scraper;
  }
  return null;
}

/**
 * List of known platform domains (for tests, docs, and upstream checks).
 */
export function getKnownPlatforms() {
  return PLATFORM_PARSERS.map(p => ({ pattern: p.pattern.source, scraper: p.scraper }));
}
