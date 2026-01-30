import { config } from '../config.js';
import { getClient } from '../utils/claude.js';
import { getSupabase } from '../utils/supabase.js';

const supabase = getSupabase();

/**
 * Extract domain from URL for source matching
 */
function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Normalize URL for comparison
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '') + parsed.pathname.replace(/\/$/, '');
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Check if a source URL is already known in the sources table
 */
async function checkSourceKnown(eventUrl) {
  const domain = extractDomain(eventUrl);
  if (!domain) return { known: false, source: null };

  // Check for exact URL match or domain match
  const { data: sources } = await supabase
    .from('sources')
    .select('*')
    .or(`url.ilike.%${domain}%`);

  if (sources && sources.length > 0) {
    return { known: true, source: sources[0] };
  }

  return { known: false, source: null };
}

/**
 * Check if the event was found but rejected during validation
 */
async function checkIfEventWasFound(url, title) {
  // Check by URL similarity
  const normalizedUrl = normalizeUrl(url);

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .or(`url.ilike.%${normalizedUrl}%,title.ilike.%${title.substring(0, 30)}%`);

  if (events && events.length > 0) {
    return { found: true, event: events[0] };
  }

  return { found: false, event: null };
}

/**
 * Get current sources and queries for context
 */
async function getAgentContext() {
  const { data: sources } = await supabase
    .from('sources')
    .select('url, name')
    .eq('is_trusted', true);

  const { data: queries } = await supabase
    .from('search_queries')
    .select('query_text')
    .eq('is_active', true);

  return {
    sources: (sources || []).map(s => s.url),
    sourceNames: (sources || []).map(s => s.name),
    queries: (queries || []).map(q => q.query_text),
  };
}

/**
 * Use Claude to analyze why an event was missed and suggest corrections
 */
async function analyzeWithClaude(missedEvent, context, wasFoundInfo) {
  const anthropic = getClient();
  const today = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  const prompt = `I missed this event that a user submitted as feedback.

Today's date is: ${today}

Title: ${missedEvent.title}
URL: ${missedEvent.url}

My current trusted sources:
${context.sources.length > 0 ? context.sources.map(s => `- ${s}`).join('\n') : '- None configured'}

My current active search queries:
${context.queries.length > 0 ? context.queries.map(q => `- "${q}"`).join('\n') : '- None configured'}

${wasFoundInfo.found ? `Note: I DID find this event but may have rejected it during validation. Existing event in DB: ${JSON.stringify(wasFoundInfo.event, null, 2)}` : 'I did not find this event at all.'}

Analyze why I missed this event and what I should do to catch similar events in the future.

Important: Events in ${currentYear} or ${nextYear} are valid. Do not assume these are "far future" - check against today's date (${today}).

Respond with ONLY valid JSON:
{
  "source_domain": "the domain of the event URL (e.g., lu.ma, meetup.com)",
  "source_known": boolean,
  "suggested_source": "full URL to add as a source if not known, or null",
  "suggested_source_name": "short name for the source",
  "suggested_source_type": "meetup|luma|eventbrite|website|university|other",
  "suggested_query": "search query that would find this event, or null if source addition is sufficient",
  "likely_rejection_reason": "if I found but rejected, explain why validation might have failed, otherwise null",
  "recommended_actions": ["action 1", "action 2"],
  "confidence": 0.0-1.0
}`;

  try {
    const response = await anthropic.messages.create({
      model: config.claudeModel,
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error(`    Claude analysis error: ${error.message}`);
  }

  return null;
}

/**
 * Add a new source to the database
 * Sources from feedback start in probation tier to earn trust
 */
async function addSource(url, name, sourceType, reasoning) {
  const { error } = await supabase
    .from('sources')
    .insert({
      name: name,
      url: url,
      source_type: sourceType || 'other',
      is_trusted: false,  // Start untrusted
      trust_tier: 'probation',  // Start in probation tier
      trust_score: 0.8,
      discovery_reasoning: `Added from feedback analysis: ${reasoning}`,
    });

  if (error) {
    if (error.code === '23505') {
      // Duplicate, ignore
      return false;
    }
    console.error(`    Error adding source: ${error.message}`);
    return false;
  }

  return true;
}

/**
 * Add a new search query to the database
 */
async function addQuery(queryText) {
  // Check if query already exists
  const { data: existing } = await supabase
    .from('search_queries')
    .select('id')
    .eq('query_text', queryText)
    .single();

  if (existing) {
    return false;
  }

  const { error } = await supabase
    .from('search_queries')
    .insert({
      query_text: queryText,
      created_by: 'feedback',
      priority_score: 1.0,
    });

  if (error) {
    console.error(`    Error adding query: ${error.message}`);
    return false;
  }

  return true;
}

/**
 * Update the feedback record with analysis results
 */
async function updateFeedbackRecord(id, analysis, sourceKnown, wasFound, actionsTaken) {
  const { error } = await supabase
    .from('feedback_missed_events')
    .update({
      source_known: sourceKnown,
      was_found: wasFound.found,
      was_rejected: wasFound.found,
      rejection_reason: analysis?.likely_rejection_reason || null,
      suggested_source: analysis?.suggested_source || null,
      suggested_query: analysis?.suggested_query || null,
      actions_taken: actionsTaken,
      analysis_complete: true,
      analyzed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error(`    Error updating feedback record: ${error.message}`);
    return false;
  }

  return true;
}

/**
 * Main function to analyze all unprocessed feedback
 */
export async function analyzeUnprocessedFeedback(runStats = null) {
  console.log('📝 Analyzing feedback on missed events...\n');

  const stats = {
    analyzed: 0,
    sourcesAdded: 0,
    queriesAdded: 0,
    alreadyKnown: 0,
    claudeApiCalls: 0,
  };

  // Fetch unprocessed feedback
  const { data: feedback, error } = await supabase
    .from('feedback_missed_events')
    .select('*')
    .eq('analysis_complete', false);

  if (error) {
    console.error(`  Error fetching feedback: ${error.message}`);
    return stats;
  }

  if (!feedback || feedback.length === 0) {
    console.log('  No unprocessed feedback found.\n');
    return stats;
  }

  console.log(`  Found ${feedback.length} missed event(s) to analyze.\n`);

  // Get current agent context
  const context = await getAgentContext();

  // Process each missed event
  for (const item of feedback) {
    console.log(`  🔍 Analyzing: "${item.title}"`);
    console.log(`     URL: ${item.url}`);

    const actionsTaken = [];

    // Step 1: Check if source is known
    const sourceCheck = await checkSourceKnown(item.url);
    const sourceKnown = sourceCheck.known;

    if (sourceKnown) {
      console.log(`     ✓ Source already known: ${sourceCheck.source.name}`);
      stats.alreadyKnown++;
    }

    // Step 2: Check if event was found but rejected
    const wasFound = await checkIfEventWasFound(item.url, item.title);
    if (wasFound.found) {
      console.log(`     ⚠ Event was found in DB (may have been rejected)`);
    }

    // Step 3: Use Claude to analyze and suggest corrections
    const analysis = await analyzeWithClaude(item, context, wasFound);
    stats.claudeApiCalls++;

    if (analysis) {
      console.log(`     Analysis confidence: ${(analysis.confidence * 100).toFixed(0)}%`);

      // Step 4: Add source if suggested and not known
      if (!sourceKnown && analysis.suggested_source) {
        const sourceAdded = await addSource(
          analysis.suggested_source,
          analysis.suggested_source_name || extractDomain(analysis.suggested_source),
          analysis.suggested_source_type,
          `Missed event: ${item.title}`
        );
        if (sourceAdded) {
          actionsTaken.push(`Added source: ${analysis.suggested_source}`);
          stats.sourcesAdded++;
          console.log(`     ✅ Added source: ${analysis.suggested_source}`);
        }
      }

      // Step 5: Add search query if suggested
      if (analysis.suggested_query) {
        const queryAdded = await addQuery(analysis.suggested_query);
        if (queryAdded) {
          actionsTaken.push(`Added query: "${analysis.suggested_query}"`);
          stats.queriesAdded++;
          console.log(`     ✅ Added query: "${analysis.suggested_query}"`);
        }
      }

      // Log rejection reason if found but rejected
      if (wasFound.found && analysis.likely_rejection_reason) {
        console.log(`     📋 Likely rejection reason: ${analysis.likely_rejection_reason}`);
      }
    }

    // Step 6: Update feedback record
    await updateFeedbackRecord(item.id, analysis, sourceKnown, wasFound, actionsTaken);
    stats.analyzed++;

    console.log(`     Actions taken: ${actionsTaken.length > 0 ? actionsTaken.join(', ') : 'None'}\n`);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Track Claude API calls in run stats if provided
  if (runStats) {
    runStats.claudeApiCalls = (runStats.claudeApiCalls || 0) + stats.claudeApiCalls;
  }

  // Print summary
  console.log('  ' + '─'.repeat(40));
  console.log('  📝 Feedback Analysis Summary');
  console.log('  ' + '─'.repeat(40));
  console.log(`    Analyzed:          ${stats.analyzed} missed events`);
  console.log(`    Sources added:     ${stats.sourcesAdded}`);
  console.log(`    Queries added:     ${stats.queriesAdded}`);
  console.log(`    Already known:     ${stats.alreadyKnown}`);
  console.log('  ' + '─'.repeat(40) + '\n');

  return stats;
}
