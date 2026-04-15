/**
 * Shared scraper registry — single source of truth for type → function mapping.
 *
 * Used by:
 *   - agent/src/utils/inlineProbe.js (runtime: same-run probing of discovered URLs)
 *   - agent/src/utils/testScraper.js (CLI + outer-loop verification)
 *
 * The main pipeline's scrapeSource() in agent/src/index.js uses a switch
 * statement directly for clarity, but routes via routeToParser() first.
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

export const SCRAPERS = {
  meetup: scrapeMeetup,
  luma: scrapeLuma,
  generic: scrapeGeneric,
  scrape: scrapeGeneric,
  api: scrapeGeneric,
  austinforum: scrapeAustinForum,
  aiaccelerator: scrapeAIAccelerator,
  austinai: scrapeAustinAI,
  leadersinai: scrapeLeadersInAI,
  aicamp: scrapeAICamp,
  capitalfactory: scrapeCapitalFactory,
  utaustin: scrapeUTAustin,
};
