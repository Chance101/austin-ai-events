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
import { upsertEvent, getExistingEvents } from './utils/supabase.js';
import { discoverSources, getTrustedSources, updateSourceStats } from './discovery/sourceDiscovery.js';

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

  // Validate configuration
  validateConfig();

  const allDiscoveredEvents = [];
  const stats = {
    sourcesScraped: 0,
    eventsDiscovered: 0,
    eventsValidated: 0,
    duplicatesSkipped: 0,
    missingDates: 0,
    eventsAdded: 0,
    eventsUpdated: 0,
    errors: 0,
    // Discovery stats
    newSourcesDiscovered: 0,
    queriesRun: 0,
    newQueriesAdded: 0,
  };

  // 0. Run source discovery first (find new sources via search)
  console.log('=' .repeat(50));
  console.log('PHASE 1: SOURCE DISCOVERY');
  console.log('=' .repeat(50) + '\n');

  try {
    const discoveryStats = await discoverSources();
    stats.newSourcesDiscovered = discoveryStats.sourcesDiscovered;
    stats.queriesRun = discoveryStats.queriesRun;
    stats.newQueriesAdded = discoveryStats.newQueriesAdded;
  } catch (error) {
    console.error('Source discovery error:', error.message);
    stats.errors++;
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
      stats.sourcesScraped++;

      // Update source stats in DB
      if (source.fromDb || source.url) {
        await updateSourceStats(source.url, events.length).catch(() => {});
      }

    } catch (error) {
      console.error(`    Error: ${error.message}`);
      stats.errors++;
    }
  }

  // 2. Web search for additional events
  console.log('\n🔍 Searching web for additional events...');
  try {
    const searchResults = await searchEvents();
    console.log(`  Found ${searchResults.length} potential events from web search`);
    allDiscoveredEvents.push(...searchResults);
  } catch (error) {
    console.error(`  Search error: ${error.message}`);
    stats.errors++;
  }

  stats.eventsDiscovered = allDiscoveredEvents.length;
  console.log(`\n📊 Total events discovered: ${stats.eventsDiscovered}`);

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
        stats.duplicatesSkipped++;
        continue;
      }

      // Validate with Claude
      console.log(`  🔍 Validating: ${event.title?.substring(0, 50)}...`);
      const validation = await validateEvent(event);

      if (!validation.isValid || validation.confidence < 0.6) {
        console.log(`    ❌ Invalid: ${validation.reason}`);
        continue;
      }

      stats.eventsValidated++;

      // Check for fuzzy duplicates
      const duplicate = await findDuplicates(event, existingEvents);
      if (duplicate) {
        console.log(`    ⏭️  Duplicate of existing event: ${duplicate.reason}`);
        stats.duplicatesSkipped++;
        continue;
      }

      // Skip events without start_time (required field)
      if (!event.start_time) {
        console.log(`    ⚠️  Skipping (no date): ${event.title?.substring(0, 40)}`);
        stats.missingDates++;
        continue;
      }

      // Classify the event
      const classification = await classifyEvent(event);

      // Prepare event for database
      const dbEvent = {
        title: event.title,
        description: event.description || null,
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
      stats.eventsAdded++;

      // Add to existing events for dedup checking
      existingEvents.push(result);
      existingHashes.add(hash);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`    ❌ Error processing event: ${error.message}`);
      stats.errors++;
    }
  }

  // 5. Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📈 FINAL SUMMARY');
  console.log('='.repeat(50));
  console.log('\n  Source Discovery:');
  console.log(`    Queries run:          ${stats.queriesRun}`);
  console.log(`    New sources found:    ${stats.newSourcesDiscovered}`);
  console.log(`    New queries added:    ${stats.newQueriesAdded}`);
  console.log('\n  Event Scraping:');
  console.log(`    Sources scraped:      ${stats.sourcesScraped}`);
  console.log(`    Events discovered:    ${stats.eventsDiscovered}`);
  console.log(`    Events validated:     ${stats.eventsValidated}`);
  console.log(`    Missing dates:        ${stats.missingDates}`);
  console.log(`    Duplicates skipped:   ${stats.duplicatesSkipped}`);
  console.log(`    Events added:         ${stats.eventsAdded}`);
  console.log(`    Errors:               ${stats.errors}`);
  console.log('='.repeat(50));

  return stats;
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
