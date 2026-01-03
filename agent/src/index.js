import { config, validateConfig } from './config.js';
import { scrapeMeetup } from './sources/meetup.js';
import { scrapeLuma } from './sources/luma.js';
import { scrapeGeneric } from './sources/generic.js';
import { searchEvents } from './sources/websearch.js';
import { scrapeAustinForum } from './sources/austinforum.js';
import { scrapeAIAccelerator } from './sources/aiaccelerator.js';
import { scrapeAustinAI } from './sources/austinai.js';
import { scrapeLeadersInAI } from './sources/leadersinai.js';
import { validateEvent, classifyEvent } from './utils/claude.js';
import { findDuplicates, getEventHash } from './utils/dedup.js';
import { upsertEvent, getExistingEvents, logAgentRun } from './utils/supabase.js';
import { discoverSources, getTrustedSources, updateSourceStats } from './discovery/sourceDiscovery.js';

/**
 * Create initial run stats object for tracking throughout the pipeline
 */
function createRunStats() {
  return {
    runType: process.env.RUN_TYPE || 'scheduled',
    startTime: Date.now(),
    queriesRun: 0,
    newSourcesFound: 0,
    newQueriesGenerated: 0,
    sourcesScraped: 0,
    eventsDiscovered: 0,
    eventsValidated: 0,
    eventsAdded: 0,
    eventsUpdated: 0,
    duplicatesSkipped: 0,
    errors: 0,
    errorMessages: [],
    claudeApiCalls: 0,
    serpapiCalls: 0,
  };
}

/**
 * Map database source_type to scraper type
 */
function mapSourceType(dbType) {
  const typeMap = {
    'meetup': 'meetup',
    'luma': 'luma',
    'eventbrite': 'scrape',
    'website': 'scrape',
    'university': 'scrape',
    'other': 'scrape',
  };
  return typeMap[dbType] || 'scrape';
}

async function discoverEvents() {
  console.log('🚀 Starting Austin AI Events discovery...\n');

  // Initialize run stats for tracking throughout the pipeline
  const runStats = createRunStats();

  // Validate configuration
  validateConfig();

  const allDiscoveredEvents = [];

  // 0. Run source discovery first (find new sources via search)
  console.log('=' .repeat(50));
  console.log('PHASE 1: SOURCE DISCOVERY');
  console.log('=' .repeat(50) + '\n');

  try {
    const discoveryStats = await discoverSources(runStats);
    runStats.queriesRun = discoveryStats.queriesRun;
    runStats.newSourcesFound = discoveryStats.sourcesDiscovered;
    runStats.newQueriesGenerated = discoveryStats.newQueriesAdded;
    runStats.serpapiCalls += discoveryStats.serpapiCalls || 0;
    runStats.claudeApiCalls += discoveryStats.claudeApiCalls || 0;
  } catch (error) {
    console.error('Source discovery error:', error.message);
    runStats.errors++;
    runStats.errorMessages.push(`Source discovery: ${error.message}`);
  }

  // 1. Get all sources to scrape (config + trusted DB sources)
  console.log('=' .repeat(50));
  console.log('PHASE 2: EVENT SCRAPING');
  console.log('=' .repeat(50) + '\n');

  console.log('📡 Gathering sources...');

  // Start with config sources
  const allSources = [...config.sources];
  const configUrls = new Set(config.sources.map(s => s.url));

  // Add trusted DB sources not in config
  try {
    const dbSources = await getTrustedSources();
    for (const dbSource of dbSources) {
      if (!configUrls.has(dbSource.url)) {
        // Map DB source to scraper config format
        // Use 'web-search' as the source enum for dynamically discovered sources
        allSources.push({
          id: 'web-search',  // Use valid enum value, not UUID
          name: dbSource.name,
          url: dbSource.url,
          type: mapSourceType(dbSource.source_type),
          fromDb: true,
        });
      }
    }
    console.log(`  Config sources: ${config.sources.length}, DB sources: ${dbSources.length}`);
    console.log(`  Total unique sources: ${allSources.length}\n`);
  } catch (error) {
    console.error('Error fetching DB sources:', error.message);
  }

  console.log('📡 Scraping sources...');

  for (const source of allSources) {
    try {
      console.log(`  → ${source.name} (${source.type})`);

      let events = [];
      switch (source.type) {
        case 'meetup':
          events = await scrapeMeetup(source);
          break;
        case 'luma':
          events = await scrapeLuma(source);
          break;
        case 'austinforum':
          events = await scrapeAustinForum(source);
          break;
        case 'aiaccelerator':
          events = await scrapeAIAccelerator(source);
          break;
        case 'austinai':
          events = await scrapeAustinAI(source);
          break;
        case 'leadersinai':
          events = await scrapeLeadersInAI(source);
          break;
        case 'scrape':
        case 'api':
          events = await scrapeGeneric(source);
          break;
        default:
          console.log(`    Unknown source type: ${source.type}`);
      }

      console.log(`    Found ${events.length} events`);
      allDiscoveredEvents.push(...events);
      runStats.sourcesScraped++;

      // Update source stats in DB
      if (source.fromDb || source.url) {
        await updateSourceStats(source.url, events.length).catch(() => {});
      }

    } catch (error) {
      console.error(`    Error: ${error.message}`);
      runStats.errors++;
      runStats.errorMessages.push(`Scrape ${source.name}: ${error.message}`);
    }
  }

  // 2. Web search for additional events
  console.log('\n🔍 Searching web for additional events...');
  try {
    const { events: searchResults, serpapiCalls } = await searchEvents(runStats);
    console.log(`  Found ${searchResults.length} potential events from web search`);
    allDiscoveredEvents.push(...searchResults);
    runStats.serpapiCalls += serpapiCalls || 0;
  } catch (error) {
    console.error(`  Search error: ${error.message}`);
    runStats.errors++;
    runStats.errorMessages.push(`Web search: ${error.message}`);
  }

  runStats.eventsDiscovered = allDiscoveredEvents.length;
  console.log(`\n📊 Total events discovered: ${runStats.eventsDiscovered}`);

  // 3. Get existing events for deduplication
  console.log('\n🔄 Checking for duplicates...');
  const existingEvents = await getExistingEvents();
  const existingHashes = new Set(existingEvents.map(e => getEventHash(e)));

  // 4. Validate and process each event
  console.log('\n✅ Validating and classifying events...');

  for (const event of allDiscoveredEvents) {
    try {
      // Skip events without title or URL
      if (!event.title || !event.url) {
        continue;
      }

      // Quick dedupe check by URL hash
      const hash = getEventHash(event);
      if (existingHashes.has(hash)) {
        console.log(`  ⏭️  Skipping (URL match): ${event.title?.substring(0, 50)}...`);
        runStats.duplicatesSkipped++;
        continue;
      }

      // Validate with Claude
      console.log(`  🔍 Validating: ${event.title?.substring(0, 50)}...`);
      const validation = await validateEvent(event, runStats);
      runStats.claudeApiCalls++;

      if (!validation.isValid || validation.confidence < 0.6) {
        console.log(`    ❌ Invalid: ${validation.reason}`);
        continue;
      }

      runStats.eventsValidated++;

      // Check for fuzzy duplicates
      const duplicate = await findDuplicates(event, existingEvents, runStats);
      if (duplicate) {
        console.log(`    ⏭️  Duplicate of existing event: ${duplicate.reason}`);
        runStats.duplicatesSkipped++;
        continue;
      }

      // Skip events without start_time (required field)
      if (!event.start_time) {
        console.log(`    ⚠️  Skipping (no date): ${event.title?.substring(0, 40)}`);
        continue;
      }

      // Classify the event
      const classification = await classifyEvent(event, runStats);
      runStats.claudeApiCalls++;

      // Prepare event for database
      // Use AI-generated summary if available, otherwise fall back to original description
      const dbEvent = {
        title: event.title,
        description: classification.summary || event.description || null,
        start_time: event.start_time || null,
        end_time: event.end_time || null,
        location: event.address || null,
        venue_name: event.venue_name || null,
        address: event.address || null,
        url: event.url,
        source: event.source,
        source_event_id: event.source_event_id || null,
        audience_type: classification.audienceType,
        technical_level: classification.technicalLevel,
        is_free: classification.isFree ?? event.is_free ?? null,
        price: event.price || null,
        organizer: event.organizer || null,
        image_url: event.image_url || null,
        is_verified: validation.confidence > 0.8,
      };

      // Upsert to database
      const result = await upsertEvent(dbEvent);
      console.log(`    ✅ Added: ${result.title}`);
      runStats.eventsAdded++;

      // Add to existing events for dedup checking
      existingEvents.push(result);
      existingHashes.add(hash);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`    ❌ Error processing event: ${error.message}`);
      runStats.errors++;
      runStats.errorMessages.push(`Process event: ${error.message}`);
    }
  }

  // 5. Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📈 FINAL SUMMARY');
  console.log('='.repeat(50));
  console.log('\n  Source Discovery:');
  console.log(`    Queries run:          ${runStats.queriesRun}`);
  console.log(`    New sources found:    ${runStats.newSourcesFound}`);
  console.log(`    New queries added:    ${runStats.newQueriesGenerated}`);
  console.log('\n  Event Scraping:');
  console.log(`    Sources scraped:      ${runStats.sourcesScraped}`);
  console.log(`    Events discovered:    ${runStats.eventsDiscovered}`);
  console.log(`    Events validated:     ${runStats.eventsValidated}`);
  console.log(`    Duplicates skipped:   ${runStats.duplicatesSkipped}`);
  console.log(`    Events added:         ${runStats.eventsAdded}`);
  console.log('\n  API Usage:');
  console.log(`    Claude API calls:     ${runStats.claudeApiCalls}`);
  console.log(`    SerpAPI calls:        ${runStats.serpapiCalls}`);
  console.log(`    Errors:               ${runStats.errors}`);
  console.log('='.repeat(50));

  // 6. Log run to database
  await logAgentRun(runStats);

  return runStats;
}

// Run if called directly
discoverEvents()
  .then(stats => {
    console.log('\n✨ Discovery complete!');
    process.exit(stats.errors > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
