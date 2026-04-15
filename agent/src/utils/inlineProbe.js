/**
 * Inline probing — test a discovered URL in the same run it's found.
 *
 * The old flow was: web search finds a URL → insert to DB as probation →
 * wait for probation queue rotation (10 slots, 25+ sources backlog) →
 * maybe scrape with wrong parser → demote. Result: a proven productive
 * URL like luma.com/austin sits untested for weeks before being demoted.
 *
 * New flow: the moment a source URL is discovered, route it to the right
 * platform parser (via parserRouter) and run the scraper inline. Events
 * from the probe flow directly into the same run's dedup → validate →
 * upsert pipeline. No queue delay. No wrong parser. Same-run feedback.
 */

import { routeToParser } from './parserRouter.js';
import { SCRAPERS } from './scrapers.js';
import { ScrapeResult } from './scrapeResult.js';

/**
 * Probe a URL inline: route to the correct parser, run the scraper,
 * return events + diagnostics. Used at discovery time so newly-found
 * sources get tested in the same run they're discovered.
 *
 * @param {string} url - Source URL to probe
 * @param {string} [suggestedType='scrape'] - Fallback type if URL domain doesn't match a known platform (from Claude evaluator)
 * @param {Object} [opts] - Options
 * @param {string} [opts.name] - Human-readable name for logging
 * @param {string} [opts.sourceId='web-search'] - source enum value to tag events with
 * @returns {Promise<{events: Array, scraperType: string, status: string, diagnostics: Object|null, error: string|null}>}
 */
export async function probeUrl(url, suggestedType = 'scrape', opts = {}) {
  const { name = null, sourceId = 'web-search' } = opts;

  const scraperType = routeToParser(url) || suggestedType || 'scrape';
  const scrapeFn = SCRAPERS[scraperType] || SCRAPERS.scrape;

  if (!scrapeFn) {
    return {
      events: [],
      scraperType,
      status: 'error',
      diagnostics: null,
      error: `No scraper found for type: ${scraperType}`,
    };
  }

  const sourceConfig = {
    id: sourceId,
    name: name || url,
    url,
    type: scraperType,
  };

  try {
    const rawResult = await scrapeFn(sourceConfig);
    const result = ScrapeResult.from(rawResult);

    // Tag events with source metadata so they flow through validation/dedup
    const events = (result.events || []).map(e => ({
      ...e,
      source: e.source || sourceId,
      _sourceUrl: url,
      _sourceTier: 'probation', // Newly discovered — always validate
    }));

    return {
      events,
      scraperType,
      status: result.status,
      diagnostics: result.diagnostics,
      error: null,
    };
  } catch (error) {
    return {
      events: [],
      scraperType,
      status: 'error',
      diagnostics: null,
      error: error.message,
    };
  }
}
