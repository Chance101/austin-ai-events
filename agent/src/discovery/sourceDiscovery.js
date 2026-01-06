import { config } from '../config.js';
import { getClient } from '../utils/claude.js';
import { getSupabase } from '../utils/supabase.js';

// Get supabase client
const supabase = getSupabase();

/**
 * Recalculate priority scores for all active queries using time decay.
 * Priority decays by 10% per day since last success (or creation if never successful).
 * Minimum priority is 0.01 to ensure queries never fully disappear.
 */
export async function recalculatePriorityScores() {
  const { data: queries, error } = await supabase
    .from('search_queries')
    .select('id, last_success_at, created_at')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching queries for priority update:', error.message);
    return;
  }

  if (!queries || queries.length === 0) return;

  const now = Date.now();
  const updates = [];

  for (const query of queries) {
    const referenceDate = query.last_success_at
      ? new Date(query.last_success_at)
      : new Date(query.created_at || now);

    const daysSinceSuccess = (now - referenceDate.getTime()) / (1000 * 60 * 60 * 24);

    // Decay formula: starts at 1.0, decays by 10% per day, minimum 0.01
    const priority = Math.max(0.01, Math.pow(0.9, daysSinceSuccess));

    updates.push({ id: query.id, priority_score: priority });
  }

  // Batch update priorities
  for (const update of updates) {
    await supabase
      .from('search_queries')
      .update({ priority_score: update.priority_score })
      .eq('id', update.id);
  }

  console.log(`    Updated priority scores for ${updates.length} queries`);
}

/**
 * Fetch queries using exploration budget strategy:
 * - 3 queries: highest priority_score (exploitation)
 * - 1 query: lowest priority_score among active (exploration)
 * - 1 query: most recent unrun agent-generated query OR second-lowest priority (experimentation)
 */
export async function getActiveQueries(limit = 5) {
  // First, recalculate all priority scores
  await recalculatePriorityScores();

  const selectedQueries = [];
  const selectedIds = new Set();

  // 1. Get top 3 highest priority queries (exploitation)
  const { data: highPriority, error: highError } = await supabase
    .from('search_queries')
    .select('*')
    .eq('is_active', true)
    .order('priority_score', { ascending: false })
    .limit(3);

  if (highError) {
    console.error('Error fetching high priority queries:', highError.message);
    return [];
  }

  for (const q of (highPriority || [])) {
    selectedQueries.push(q);
    selectedIds.add(q.id);
  }

  // 2. Get lowest priority query (exploration)
  const { data: lowPriority, error: lowError } = await supabase
    .from('search_queries')
    .select('*')
    .eq('is_active', true)
    .order('priority_score', { ascending: true })
    .limit(2);

  if (!lowError && lowPriority) {
    // Find lowest that isn't already selected
    for (const q of lowPriority) {
      if (!selectedIds.has(q.id)) {
        selectedQueries.push(q);
        selectedIds.add(q.id);
        break;
      }
    }
  }

  // 3. Get experimental query: unrun agent-generated OR second-lowest priority
  // First try: most recent agent-generated query that hasn't been run
  const { data: unrunAgent, error: unrunError } = await supabase
    .from('search_queries')
    .select('*')
    .eq('is_active', true)
    .eq('created_by', 'agent')
    .eq('times_run', 0)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!unrunError && unrunAgent && unrunAgent.length > 0 && !selectedIds.has(unrunAgent[0].id)) {
    selectedQueries.push(unrunAgent[0]);
    selectedIds.add(unrunAgent[0].id);
  } else {
    // Fallback: second-lowest priority
    if (lowPriority && lowPriority.length > 1 && !selectedIds.has(lowPriority[1].id)) {
      selectedQueries.push(lowPriority[1]);
      selectedIds.add(lowPriority[1].id);
    }
  }

  console.log(`    Selected ${selectedQueries.length} queries using exploration budget`);

  return selectedQueries;
}

/**
 * Get all known source URLs
 */
export async function getKnownSourceUrls() {
  const { data, error } = await supabase
    .from('sources')
    .select('url');

  if (error) {
    console.error('Error fetching sources:', error.message);
    return new Set();
  }

  return new Set((data || []).map(s => normalizeUrl(s.url)));
}

/**
 * Normalize URL for comparison
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    // Remove trailing slashes, www prefix, and query params for comparison
    return parsed.hostname.replace(/^www\./, '') + parsed.pathname.replace(/\/$/, '');
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Search for potential event sources using SerpAPI
 */
async function searchForSources(query) {
  if (!config.serpApiKey) {
    console.log('    SerpAPI key not configured, skipping search');
    return [];
  }

  const searchUrl = new URL('https://serpapi.com/search.json');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('api_key', config.serpApiKey);
  searchUrl.searchParams.set('num', '20');
  searchUrl.searchParams.set('gl', 'us');

  try {
    const response = await fetch(searchUrl.toString());
    if (!response.ok) {
      console.error(`    SerpAPI error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const results = data.organic_results || [];

    // Extract URLs from search results
    return results.map(r => ({
      url: r.link,
      title: r.title,
      snippet: r.snippet || '',
    }));
  } catch (error) {
    console.error(`    Search error: ${error.message}`);
    return [];
  }
}

/**
 * Use Claude to evaluate if a URL is a valid event source
 */
async function evaluateSource(urlInfo) {
  const anthropic = getClient();

  const prompt = `You are evaluating whether a website is a good source for Austin, TX AI/ML events.

URL: ${urlInfo.url}
Title: ${urlInfo.title}
Snippet: ${urlInfo.snippet}

CRITICAL: Only accept URLs that are event LISTING pages (showing multiple upcoming events).
REJECT individual event pages that show only one specific event.

Examples of GOOD listing pages:
- https://meetup.com/austin-ai-group/events/ (shows multiple events)
- https://austin-ai.org/events/ (calendar/listing page)
- https://lu.ma/austin-tech (calendar showing multiple events)

Examples of BAD single event pages (REJECT these):
- https://austin-ai.org/event/specific-event-name/
- https://meetup.com/group/events/123456789
- https://lu.ma/single-event-id

Evaluate this potential event source and respond with ONLY valid JSON:
{
  "is_event_source": boolean,      // Is this a LISTING page showing multiple events (not a single event)?
  "is_austin_focused": boolean,    // Is this specific to Austin, TX area?
  "is_ai_related": boolean,        // Is this focused on AI/ML/data science/tech?
  "hosts_recurring_events": boolean, // Does it host regular/recurring events?
  "trust_score": 0.0-1.0,          // Overall trustworthiness (1.0 = highly trusted like meetup.com)
  "reasoning": "brief explanation",
  "source_type": "meetup|luma|eventbrite|website|university|other",
  "suggested_name": "Short name for this source"
}

Scoring guidelines:
- 0.9-1.0: Known event platforms (Meetup, Lu.ma, Eventbrite) with Austin AI content
- 0.7-0.9: Established organizations/universities with event calendars
- 0.5-0.7: Company/community websites that occasionally host events
- 0.3-0.5: Blogs or news sites that mention events
- 0.0-0.3: Not an event source OR is a single event page (not a listing)

Return ONLY the JSON object, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: config.claudeModel,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.trim();
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error(`    Claude evaluation error: ${error.message}`);
    return null;
  }
}

/**
 * Add a new source to the database
 */
async function addSource(urlInfo, evaluation) {
  const { error } = await supabase
    .from('sources')
    .insert({
      name: evaluation.suggested_name || urlInfo.title,
      url: urlInfo.url,
      source_type: evaluation.source_type || 'other',
      is_trusted: evaluation.trust_score >= 0.7,
      trust_score: evaluation.trust_score,
      discovery_reasoning: evaluation.reasoning,
    });

  if (error) {
    if (error.code === '23505') {
      // Duplicate URL, ignore
      return false;
    }
    console.error(`    Error adding source: ${error.message}`);
    return false;
  }

  return true;
}

/**
 * Update query statistics after a run.
 * On success (sourcesFound > 0): reset priority_score to 1.0 and set last_success_at
 */
async function updateQueryStats(queryId, sourcesFound) {
  const now = new Date().toISOString();

  // Get current values for incrementing
  const { data: current } = await supabase
    .from('search_queries')
    .select('times_run, sources_found')
    .eq('id', queryId)
    .single();

  if (!current) {
    console.error(`    Could not find query ${queryId} to update stats`);
    return;
  }

  // Build update object
  const updateData = {
    times_run: (current.times_run || 0) + 1,
    sources_found: (current.sources_found || 0) + sourcesFound,
    last_run: now,
  };

  // On success: reset priority and update last_success_at
  if (sourcesFound > 0) {
    updateData.priority_score = 1.0;
    updateData.last_success_at = now;
  }

  const { error } = await supabase
    .from('search_queries')
    .update(updateData)
    .eq('id', queryId);

  if (error) {
    console.error(`    Error updating query stats: ${error.message}`);
  }
}

/**
 * Deactivate underperforming queries with strict criteria.
 * Only deactivate if ALL conditions are met:
 * - created_by = 'agent' (NEVER deactivate seed queries)
 * - times_run >= 10
 * - sources_found = 0
 * - priority_score < 0.01
 */
async function deactivateFailedQueries() {
  // Only consider agent-created queries with 10+ runs
  const { data: queries } = await supabase
    .from('search_queries')
    .select('id, query_text, times_run, sources_found, priority_score, created_by')
    .eq('is_active', true)
    .eq('created_by', 'agent')  // Never deactivate seed queries
    .gte('times_run', 10)
    .eq('sources_found', 0);

  if (!queries) return 0;

  let deactivated = 0;
  for (const query of queries) {
    // Final check: only deactivate if priority has fully decayed
    if (query.priority_score < 0.01) {
      await supabase
        .from('search_queries')
        .update({ is_active: false })
        .eq('id', query.id);
      console.log(`    Deactivated underperforming query: "${query.query_text}" (${query.times_run} runs, priority: ${query.priority_score.toFixed(4)})`);
      deactivated++;
    }
  }

  return deactivated;
}

/**
 * Use Claude to suggest new search queries based on discovered sources
 */
async function suggestNewQueries(discoveredSources, existingQueries) {
  const anthropic = getClient();

  const prompt = `You are helping discover Austin AI/ML events.

Sources recently discovered:
${discoveredSources.length > 0 ? discoveredSources.map(s => `- ${s.name}: ${s.url}`).join('\n') : '- None this run'}

Existing search queries already tried:
${existingQueries.map(q => `- "${q}"`).join('\n')}

Based on patterns in successful sources and gaps in coverage, suggest 3 NEW search queries that might find Austin AI events we're missing.

Focus on:
- Specific AI technologies (RAG, agents, LLMs, computer vision, etc.)
- Different event types (workshops, hackathons, conferences, networking)
- Related communities (data engineering, MLOps, AI ethics)
- Local venues known for tech events

Return ONLY a JSON array of 3 strings, no other text:
["query 1", "query 2", "query 3"]`;

  try {
    const response = await anthropic.messages.create({
      model: config.claudeModel,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error(`    Query suggestion error: ${error.message}`);
    return [];
  }
}

/**
 * Add new queries to the database
 */
async function addNewQueries(queries) {
  let added = 0;
  for (const queryText of queries) {
    const { error } = await supabase
      .from('search_queries')
      .insert({
        query_text: queryText,
        created_by: 'agent',
      });

    if (!error) {
      console.log(`    Added new query: "${queryText}"`);
      added++;
    }
  }
  return added;
}

/**
 * Main source discovery function
 * @param {Object} runStats - Optional run stats object to track API calls
 */
export async function discoverSources(runStats = null) {
  console.log('🔍 Starting source discovery...\n');

  const stats = {
    queriesRun: 0,
    urlsEvaluated: 0,
    sourcesDiscovered: 0,
    trustedSourcesAdded: 0,
    queriesDeactivated: 0,
    newQueriesAdded: 0,
    claudeApiCalls: 0,
    serpapiCalls: 0,
  };

  // Get active queries and known sources
  const queries = await getActiveQueries(5);
  const knownUrls = await getKnownSourceUrls();
  const discoveredSources = [];

  console.log(`  Found ${queries.length} active queries, ${knownUrls.size} known sources\n`);

  // Process each query
  for (const query of queries) {
    console.log(`  📡 Searching: "${query.query_text}"`);
    stats.queriesRun++;

    const searchResults = await searchForSources(query.query_text);
    stats.serpapiCalls++;  // Track SerpAPI call
    console.log(`    Found ${searchResults.length} search results`);

    let sourcesFoundThisQuery = 0;

    // Filter and evaluate new URLs
    for (const result of searchResults) {
      const normalizedUrl = normalizeUrl(result.url);

      // Skip known sources
      if (knownUrls.has(normalizedUrl)) {
        continue;
      }

      // Skip common non-event sites
      if (shouldSkipUrl(result.url)) {
        continue;
      }

      // Skip single event URLs - we want listing pages, not individual events
      if (isSingleEventUrl(result.url)) {
        console.log(`    ⏭️  Skipping single event URL: ${result.url.substring(0, 60)}...`);
        continue;
      }

      stats.urlsEvaluated++;
      console.log(`    🔎 Evaluating: ${result.url.substring(0, 60)}...`);

      const evaluation = await evaluateSource(result);
      stats.claudeApiCalls++;  // Track Claude API call
      if (!evaluation) continue;

      // Only add if it meets our criteria
      if (evaluation.is_event_source &&
          evaluation.is_austin_focused &&
          evaluation.is_ai_related &&
          evaluation.trust_score >= 0.5) {

        const added = await addSource(result, evaluation);
        if (added) {
          stats.sourcesDiscovered++;
          knownUrls.add(normalizedUrl);
          discoveredSources.push({
            name: evaluation.suggested_name || result.title,
            url: result.url,
            trust_score: evaluation.trust_score,
          });

          if (evaluation.trust_score >= 0.7) {
            stats.trustedSourcesAdded++;
            console.log(`    ✅ Added trusted source: ${evaluation.suggested_name} (${evaluation.trust_score})`);
          } else {
            console.log(`    📝 Added source (needs review): ${evaluation.suggested_name} (${evaluation.trust_score})`);
          }

          sourcesFoundThisQuery++;
        }
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Update query stats
    await updateQueryStats(query.id, sourcesFoundThisQuery);
  }

  // Deactivate underperforming queries
  console.log('\n  🧹 Checking for underperforming queries...');
  stats.queriesDeactivated = await deactivateFailedQueries();

  // Learning loop: suggest new queries
  console.log('\n  🧠 Learning loop: generating new queries...');
  const existingQueryTexts = queries.map(q => q.query_text);
  const { data: allQueries } = await supabase
    .from('search_queries')
    .select('query_text');

  const allQueryTexts = (allQueries || []).map(q => q.query_text);
  const suggestedQueries = await suggestNewQueries(discoveredSources, allQueryTexts);
  stats.claudeApiCalls++;  // Track Claude API call for query suggestion

  if (suggestedQueries.length > 0) {
    stats.newQueriesAdded = await addNewQueries(suggestedQueries);
  }

  // Print summary
  console.log('\n  ' + '─'.repeat(40));
  console.log('  📊 Source Discovery Summary');
  console.log('  ' + '─'.repeat(40));
  console.log(`    Queries run:           ${stats.queriesRun}`);
  console.log(`    URLs evaluated:        ${stats.urlsEvaluated}`);
  console.log(`    Sources discovered:    ${stats.sourcesDiscovered}`);
  console.log(`    Trusted sources added: ${stats.trustedSourcesAdded}`);
  console.log(`    Queries deactivated:   ${stats.queriesDeactivated}`);
  console.log(`    New queries added:     ${stats.newQueriesAdded}`);
  console.log('  ' + '─'.repeat(40) + '\n');

  return stats;
}

/**
 * Check if URL is a single event page (not a listing page)
 * We want listing pages that show multiple events, not individual event pages
 */
function isSingleEventUrl(url) {
  const patterns = [
    /\/event\/[^\/]+\/?$/,              // /event/something
    /\/events\/[^\/]+\/?$/,             // /events/something (single event with slug)
    /eventbrite\.com\/e\//,             // Eventbrite single event
    /meetup\.com\/[^\/]+\/events\/\d+/, // Meetup single event
    /lu\.ma\/[a-zA-Z0-9-]+$/,           // Lu.ma single event (but not /lu.ma/calendar/...)
    /\/event-details\//,                // Common single event pattern
    /\/event\?id=/,                     // Query param event ID
  ];
  return patterns.some(p => p.test(url));
}

/**
 * Check if URL should be skipped (common non-event sites)
 */
function shouldSkipUrl(url) {
  const skipPatterns = [
    'linkedin.com',
    'facebook.com',
    'twitter.com',
    'x.com',
    'youtube.com',
    'reddit.com',
    'medium.com',
    'substack.com',
    'wikipedia.org',
    'amazon.com',
    'github.com',
    'stackoverflow.com',
    'glassdoor.com',
    'indeed.com',
    'crunchbase.com',
    'yelp.com',
    'tripadvisor.com',
    'news.google.com',
    'podcasts.apple.com',
    'spotify.com',
  ];

  const lowerUrl = url.toLowerCase();
  return skipPatterns.some(pattern => lowerUrl.includes(pattern));
}

/**
 * Get all trusted sources from the database
 */
export async function getTrustedSources() {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('is_trusted', true)
    .order('trust_score', { ascending: false });

  if (error) {
    console.error('Error fetching trusted sources:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Update source statistics after scraping
 */
export async function updateSourceStats(sourceUrl, eventsFound) {
  const { error } = await supabase
    .from('sources')
    .update({
      last_scraped: new Date().toISOString(),
      events_found_count: eventsFound,
    })
    .eq('url', sourceUrl);

  if (error) {
    console.error(`Error updating source stats: ${error.message}`);
  }
}
