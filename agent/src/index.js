import { config, validateConfig } from './config.js';
import { scrapeMeetup } from './sources/meetup.js';
import { scrapeLuma } from './sources/luma.js';
import { scrapeGeneric } from './sources/generic.js';
import { searchEvents } from './sources/websearch.js';
import { scrapeAustinForum } from './sources/austinforum.js';
import { scrapeAIAccelerator } from './sources/aiaccelerator.js';
import { scrapeAustinAI } from './sources/austinai.js';
import { scrapeLeadersInAI } from './sources/leadersinai.js';
import { validateEvent, classifyEvent, extractLocationFromImage } from './utils/claude.js';
import { findDuplicates, getEventHash } from './utils/dedup.js';
import { upsertEvent, getExistingEvents, logAgentRun } from './utils/supabase.js';
import { discoverSources, getTrustedSources, getProbationSources, updateSourceStats, updateSourceValidationStats } from './discovery/sourceDiscovery.js';
import { analyzeUnprocessedFeedback } from './feedback/analyzeFeedback.js';

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
    feedbackAnalyzed: 0,
    feedbackSourcesAdded: 0,
    feedbackQueriesAdded: 0,
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

/**
 * Quick sanity check for Austin location - runs for ALL events regardless of trust tier
 * This is a fast string-based check that doesn't require Claude API calls
 * Returns: { isAustin: boolean, reason: string }
 */
function checkAustinLocation(event) {
  const venueOrAddress = [event.venue_name, event.address, event.location]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Known non-Austin cities that events might be from
  const nonAustinCities = [
    'san antonio', 'houston', 'dallas', 'fort worth', 'san marcos',
    'new braunfels', 'san francisco', 'los angeles', 'new york',
    'chicago', 'seattle', 'denver', 'boston', 'atlanta', 'miami',
    'phoenix', 'portland', 'washington dc', 'philadelphia', 'london',
    'virtual', 'online only', 'webinar', 'remote', 'zoom only',
    'killeen', 'waco', 'college station', 'corpus christi', 'el paso',
    'lubbock', 'amarillo', 'brownsville', 'laredo', 'mcallen',
  ];

  // Check for explicit non-Austin locations
  for (const city of nonAustinCities) {
    if (venueOrAddress.includes(city)) {
      return { isAustin: false, reason: `Location appears to be in ${city}, not Austin` };
    }
  }

  // Austin area indicators
  const austinIndicators = [
    'austin', 'tx 78', '787', 'travis county', 'williamson county',
    'hays county', 'round rock', 'cedar park', 'pflugerville',
    'leander', 'georgetown', 'dripping springs', 'lakeway', 'bee cave',
    'capital factory', 'domain', 'downtown austin', 'south congress',
    'east austin', 'soco', '6th street', 'rainey street', 'ut austin',
    'university of texas', 'acc ', 'st. edwards', 'concordia',
  ];

  // If venue/address is provided, check for Austin indicators
  if (venueOrAddress.length > 3) {
    for (const indicator of austinIndicators) {
      if (venueOrAddress.includes(indicator)) {
        return { isAustin: true, reason: 'Location matches Austin area' };
      }
    }
    // Has location data but no Austin match - suspicious
    return { isAustin: false, reason: 'Location provided but no Austin indicators found' };
  }

  // No location data at all - will need Claude validation
  return { isAustin: null, reason: 'No location data to verify' };
}

/**
 * Check if a title looks malformed (CSS, HTML, or garbage)
 * Returns true if title appears invalid
 */
function isMalformedTitle(title) {
  if (!title) return true;

  const malformedPatterns = [
    /^\s*\.\w+[-\w]*\s*\{/,           // CSS class definitions: .class-name {
    /position\s*:\s*relative/i,        // CSS property
    /display\s*:\s*block/i,            // CSS property
    /^\s*<\w+/,                        // HTML tags
    /^\s*\[\w+\]/,                     // Attribute selectors
    /^\s*#[\w-]+\s*\{/,                // CSS ID selectors
    /&:hover/,                         // CSS pseudo-selectors
    /^\s*@media/i,                     // CSS media queries
    /^\s*@import/i,                    // CSS imports
    /^\s*function\s*\(/,               // JavaScript
    /^\s*const\s+\w+/,                 // JavaScript
    /^\s*var\s+\w+/,                   // JavaScript
    /[{}]{2,}/,                        // Multiple braces
  ];

  for (const pattern of malformedPatterns) {
    if (pattern.test(title)) {
      return true;
    }
  }

  // Title is mostly non-alphanumeric
  const alphanumeric = title.replace(/[^a-zA-Z0-9]/g, '');
  if (alphanumeric.length < title.length * 0.3) {
    return true;
  }

  return false;
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

  // 1.5. Analyze feedback on missed events
  console.log('=' .repeat(50));
  console.log('PHASE 1.5: FEEDBACK ANALYSIS');
  console.log('=' .repeat(50) + '\n');

  try {
    const feedbackStats = await analyzeUnprocessedFeedback(runStats);
    runStats.feedbackAnalyzed = feedbackStats.analyzed;
    runStats.feedbackSourcesAdded = feedbackStats.sourcesAdded;
    runStats.feedbackQueriesAdded = feedbackStats.queriesAdded;
  } catch (error) {
    console.error('Feedback analysis error:', error.message);
    runStats.errors++;
    runStats.errorMessages.push(`Feedback analysis: ${error.message}`);
  }

  // 2. Get all sources to scrape (config + trusted DB sources)
  console.log('=' .repeat(50));
  console.log('PHASE 2: EVENT SCRAPING');
  console.log('=' .repeat(50) + '\n');

  console.log('📡 Gathering sources...');

  // Start with config sources (mark them as 'config' tier)
  const allSources = config.sources.map(s => ({
    ...s,
    trust_tier: 'config',  // Config sources are always trusted
  }));
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
          trust_tier: dbSource.trust_tier || 'trusted',
        });
      }
    }

    // Also add probation sources (limited to 10 per run)
    const probationSources = await getProbationSources();
    for (const dbSource of probationSources) {
      if (!configUrls.has(dbSource.url)) {
        allSources.push({
          id: 'web-search',
          name: dbSource.name,
          url: dbSource.url,
          type: mapSourceType(dbSource.source_type),
          fromDb: true,
          trust_tier: 'probation',
        });
      }
    }

    console.log(`  Config sources: ${config.sources.length}, Trusted DB: ${dbSources.length}, Probation: ${probationSources.length}`);
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

      // Attach source metadata to each event for conditional validation
      events.forEach(e => {
        e._sourceUrl = source.url;
        e._sourceTier = source.trust_tier || (source.fromDb ? 'probation' : 'config');
      });

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

  // Track validation stats per source for promotion/demotion
  const sourceValidationStats = new Map(); // url -> { passed: 0, failed: 0 }

  for (const event of allDiscoveredEvents) {
    try {
      // Skip events without title or URL
      if (!event.title || !event.url) {
        continue;
      }

      // Skip events with invalid/placeholder titles
      const invalidTitlePatterns = [
        /^tbd$/i,
        /^tba$/i,
        /^coming soon$/i,
        /^to be announced$/i,
        /^to be determined$/i,
        /^untitled$/i,
        /^event$/i,
        /^new event$/i,
        /^test$/i,
      ];
      const titleTrimmed = event.title.trim();
      if (
        titleTrimmed.length < 5 ||
        invalidTitlePatterns.some(pattern => pattern.test(titleTrimmed))
      ) {
        console.log(`  ⚠️  Skipping event with invalid title: "${titleTrimmed}"`);
        continue;
      }

      // Skip events with malformed titles (CSS, HTML, code, etc.)
      if (isMalformedTitle(titleTrimmed)) {
        console.log(`  ⚠️  Skipping event with malformed title (CSS/code detected): "${titleTrimmed.substring(0, 60)}..."`);
        continue;
      }

      // Quick dedupe check by URL hash
      const hash = getEventHash(event);
      if (existingHashes.has(hash)) {
        console.log(`  ⏭️  Skipping (URL match): ${event.title?.substring(0, 50)}...`);
        runStats.duplicatesSkipped++;
        continue;
      }

      // If no venue/address but has image, try to extract location from image
      if (!event.venue_name && !event.address && event.image_url) {
        console.log(`    📷 No venue data - analyzing event image...`);
        const imageLocation = await extractLocationFromImage(event.image_url);
        runStats.claudeApiCalls++;

        if (imageLocation && imageLocation.found) {
          // Add extracted location to event data
          if (imageLocation.venue) event.venue_name = imageLocation.venue;
          if (imageLocation.city) {
            const cityState = [imageLocation.city, imageLocation.state].filter(Boolean).join(', ');
            event.address = imageLocation.address || cityState;
          }
          console.log(`    📷 Found location in image: ${event.address || event.venue_name}`);
        }
      }

      // ALWAYS check Austin location first (doesn't use Claude API)
      const locationCheck = checkAustinLocation(event);

      // Skip Claude validation for trusted/config sources, BUT only if location is confirmed Austin
      const isTrustedSource = event._sourceTier === 'config' || event._sourceTier === 'trusted';

      let validation;
      if (isTrustedSource && locationCheck.isAustin === true) {
        // Trusted source with confirmed Austin location - skip Claude validation
        validation = { isValid: true, confidence: 0.85, reason: 'Trusted source with verified Austin location' };
        console.log(`  ✅ Trusted source, verified Austin: ${event.title?.substring(0, 50)}...`);
      } else if (isTrustedSource && locationCheck.isAustin === false) {
        // Trusted source but NOT in Austin - reject without Claude call
        validation = { isValid: false, confidence: 0.9, reason: locationCheck.reason };
        console.log(`  ❌ Trusted source but NOT Austin: ${event.title?.substring(0, 50)}... (${locationCheck.reason})`);
      } else if (isTrustedSource && locationCheck.isAustin === null) {
        // Trusted source but no location data - need Claude to verify
        console.log(`  🔍 Trusted source, no location - validating: ${event.title?.substring(0, 50)}...`);
        validation = await validateEvent(event, runStats);
        runStats.claudeApiCalls++;
      } else {
        // Probation source - always validate with Claude
        console.log(`  🔍 Validating (probation): ${event.title?.substring(0, 50)}...`);
        validation = await validateEvent(event, runStats);
        runStats.claudeApiCalls++;

        // Track validation results per source
        if (event._sourceUrl) {
          const stats = sourceValidationStats.get(event._sourceUrl) || { passed: 0, failed: 0 };
          if (validation.isValid && validation.confidence >= 0.6) {
            stats.passed++;
          } else {
            stats.failed++;
          }
          sourceValidationStats.set(event._sourceUrl, stats);
        }
      }

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
  console.log('\n  Feedback Analysis:');
  console.log(`    Events analyzed:      ${runStats.feedbackAnalyzed}`);
  console.log(`    Sources added:        ${runStats.feedbackSourcesAdded}`);
  console.log(`    Queries added:        ${runStats.feedbackQueriesAdded}`);
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

  // 5.5. Update source validation stats for promotion/demotion
  if (sourceValidationStats.size > 0) {
    console.log('\n📊 Updating source validation stats...');
    await updateSourceValidationStats(sourceValidationStats);
  }

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
