import { config } from '../config.js';
import { getClient } from '../utils/claude.js';
import { getSupabase } from '../utils/supabase.js';

// Get supabase client
const supabase = getSupabase();

/**
 * Fetch top active search queries ordered by success rate, then least-run
 */
export async function getActiveQueries(limit = 5) {
  const { data, error } = await supabase
    .from('search_queries')
    .select('*')
    .eq('is_active', true)
    .order('sources_found', { ascending: false })
    .order('times_run', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching queries:', error.message);
    return [];
  }

  return data || [];
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

Evaluate this potential event source and respond with ONLY valid JSON:
{
  "is_event_source": boolean,      // Does this site list events (not just articles/news)?
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
- 0.0-0.3: Not an event source

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
 * Update query statistics
 */
async function updateQueryStats(queryId, sourcesFound) {
  const { error } = await supabase
    .from('search_queries')
    .update({
      times_run: supabase.rpc('increment', { x: 1 }),
      sources_found: supabase.rpc('increment', { x: sourcesFound }),
      last_run: new Date().toISOString(),
    })
    .eq('id', queryId);

  // Fallback if RPC doesn't work
  if (error) {
    const { data: current } = await supabase
      .from('search_queries')
      .select('times_run, sources_found')
      .eq('id', queryId)
      .single();

    if (current) {
      await supabase
        .from('search_queries')
        .update({
          times_run: (current.times_run || 0) + 1,
          sources_found: (current.sources_found || 0) + sourcesFound,
          last_run: new Date().toISOString(),
        })
        .eq('id', queryId);
    }
  }
}

/**
 * Deactivate underperforming queries
 */
async function deactivateFailedQueries() {
  const { data: queries } = await supabase
    .from('search_queries')
    .select('id, query_text, times_run, sources_found')
    .eq('is_active', true)
    .gte('times_run', 5);

  if (!queries) return 0;

  let deactivated = 0;
  for (const query of queries) {
    if (query.sources_found === 0) {
      await supabase
        .from('search_queries')
        .update({ is_active: false })
        .eq('id', query.id);
      console.log(`    Deactivated underperforming query: "${query.query_text}"`);
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
 */
export async function discoverSources() {
  console.log('🔍 Starting source discovery...\n');

  const stats = {
    queriesRun: 0,
    urlsEvaluated: 0,
    sourcesDiscovered: 0,
    trustedSourcesAdded: 0,
    queriesDeactivated: 0,
    newQueriesAdded: 0,
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

      stats.urlsEvaluated++;
      console.log(`    🔎 Evaluating: ${result.url.substring(0, 60)}...`);

      const evaluation = await evaluateSource(result);
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
