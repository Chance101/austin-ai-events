/**
 * testScraper — Run a single scraper against a live URL and report results.
 *
 * Used by the outer loop to verify fixes before committing.
 * Can also be run directly: node agent/src/utils/testScraper.js <scraperType> <url>
 *
 * Example:
 *   node agent/src/utils/testScraper.js generic https://aitinkerers.org/events
 *   node agent/src/utils/testScraper.js luma https://lu.ma/aitx
 *   node agent/src/utils/testScraper.js meetup https://www.meetup.com/austin-langchain-ai-group/events/
 */

import { scrapeMeetup } from '../sources/meetup.js';
import { scrapeLuma } from '../sources/luma.js';
import { scrapeGeneric } from '../sources/generic.js';
import { scrapeAustinForum } from '../sources/austinforum.js';
import { scrapeAIAccelerator } from '../sources/aiaccelerator.js';
import { scrapeAustinAI } from '../sources/austinai.js';
import { scrapeLeadersInAI } from '../sources/leadersinai.js';
import { scrapeAICamp } from '../sources/aicamp.js';
import { scrapeCapitalFactory } from '../sources/capitalfactory.js';
import { scrapeUTAustin } from '../sources/utaustin.js';
import { ScrapeResult } from './scrapeResult.js';

const scrapers = {
  meetup: scrapeMeetup,
  luma: scrapeLuma,
  generic: scrapeGeneric,
  scrape: scrapeGeneric,
  austinforum: scrapeAustinForum,
  aiaccelerator: scrapeAIAccelerator,
  austinai: scrapeAustinAI,
  leadersinai: scrapeLeadersInAI,
  aicamp: scrapeAICamp,
  capitalfactory: scrapeCapitalFactory,
  utaustin: scrapeUTAustin,
};

/**
 * Run a single scraper and return structured results with diagnostics.
 * @param {string} scraperType - Key from scrapers map (e.g., 'generic', 'luma')
 * @param {string} url - Source URL to scrape
 * @param {string} [name] - Optional source name (defaults to scraperType)
 * @returns {{ events: number, status: string, diagnostics: Object|null, sample: Array }}
 */
export async function testScraper(scraperType, url, name) {
  const scrapeFn = scrapers[scraperType];
  if (!scrapeFn) {
    return {
      error: `Unknown scraper type: ${scraperType}. Available: ${Object.keys(scrapers).join(', ')}`,
    };
  }

  const sourceConfig = {
    id: 'test',
    name: name || scraperType,
    url,
    type: scraperType,
  };

  const rawResult = await scrapeFn(sourceConfig);
  const result = ScrapeResult.from(rawResult);

  return {
    events: result.events.length,
    status: result.status,
    diagnostics: result.diagnostics ? {
      httpStatus: result.diagnostics.httpStatus,
      pageSize: result.diagnostics.pageSize,
      parseStrategy: result.diagnostics.parseStrategy,
      parseAttempts: result.diagnostics.parseAttempts,
      candidateElements: result.diagnostics.candidateElements,
      eventsPreFilter: result.diagnostics.eventsPreFilter,
      contentSignals: result.diagnostics.contentSignals,
      errors: result.diagnostics.errors,
    } : null,
    sample: result.events.slice(0, 2).map(e => ({
      title: e.title,
      start_time: e.start_time,
      url: e.url,
    })),
  };
}

// CLI usage: node agent/src/utils/testScraper.js <type> <url>
const [,, cliType, cliUrl] = process.argv;
if (cliType && cliUrl) {
  testScraper(cliType, cliUrl)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => console.error(e.message));
}
