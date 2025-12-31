import * as cheerio from 'cheerio';
import { config, validateConfig } from './config.js';
import { getSupabase } from './utils/supabase.js';
import { getClient } from './utils/claude.js';

/**
 * Fetch and extract content from an event URL
 */
async function fetchEventContent(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AustinAIEventsBot/1.0)',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Try JSON-LD structured data first
    let description = null;
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const data = JSON.parse($(script).html());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Event' && item.description) {
            description = item.description;
            break;
          }
        }
      } catch (e) {
        // JSON parse error
      }
    });

    if (description) {
      return description;
    }

    // Try meta description
    const metaDesc = $('meta[name="description"]').attr('content') ||
                     $('meta[property="og:description"]').attr('content');
    if (metaDesc && metaDesc.length > 50) {
      return metaDesc;
    }

    // Try common content selectors
    const contentSelectors = [
      '[class*="description"]',
      '[class*="content"]',
      '[class*="about"]',
      '[class*="details"]',
      'article',
      '.event-info',
      'main p',
    ];

    for (const selector of contentSelectors) {
      const text = $(selector).text().trim();
      if (text && text.length > 100) {
        // Take first 2000 chars to avoid sending too much to Claude
        return text.substring(0, 2000);
      }
    }

    // Fallback: get all paragraph text
    const paragraphs = $('p').map((_, el) => $(el).text().trim()).get().join(' ');
    if (paragraphs.length > 100) {
      return paragraphs.substring(0, 2000);
    }

    return null;
  } catch (error) {
    console.error(`  Error fetching ${url}: ${error.message}`);
    return null;
  }
}

/**
 * Generate a summary using Claude
 */
async function generateSummary(event, freshDescription) {
  const anthropic = getClient();

  const prompt = `Create a clean, informative summary for this AI/ML event.

Event Title: ${event.title}
Event Description/Content:
${freshDescription || event.description || 'No description available'}

Organizer: ${event.organizer || 'Unknown'}

Write a 1-2 sentence summary that:
- Describes what attendees will learn or experience
- Focuses on the topic/content, not logistics
- Has no markdown, URLs, or promotional language
- Is clear and informative for someone scanning event listings

Respond with ONLY the summary text, no JSON or extra formatting.`;

  const message = await anthropic.messages.create({
    model: config.claudeModel,
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

/**
 * Update event description in database
 */
async function updateEventDescription(eventId, newDescription) {
  const db = getSupabase();

  const { error } = await db
    .from('events')
    .update({
      description: newDescription,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId);

  if (error) {
    throw error;
  }
}

/**
 * Main function to re-summarize all events
 */
async function resummarizeEvents() {
  console.log('🔄 Starting event re-summarization...\n');

  validateConfig();

  const db = getSupabase();

  // Fetch all upcoming events
  const { data: events, error } = await db
    .from('events')
    .select('*')
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error fetching events:', error);
    process.exit(1);
  }

  console.log(`Found ${events.length} upcoming events to process.\n`);

  const stats = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  for (const event of events) {
    try {
      console.log(`📝 Processing: ${event.title.substring(0, 50)}...`);

      // Fetch fresh content from the event URL
      console.log(`   Fetching: ${event.url}`);
      const freshDescription = await fetchEventContent(event.url);

      if (!freshDescription && !event.description) {
        console.log('   ⏭️  Skipped: No content available');
        stats.skipped++;
        continue;
      }

      // Generate new summary with Claude
      console.log('   Generating summary...');
      const newSummary = await generateSummary(event, freshDescription);

      if (!newSummary || newSummary.length < 20) {
        console.log('   ⏭️  Skipped: Could not generate summary');
        stats.skipped++;
        continue;
      }

      // Update the database
      await updateEventDescription(event.id, newSummary);
      console.log(`   ✅ Updated: "${newSummary.substring(0, 60)}..."`);
      stats.updated++;

      stats.processed++;

      // Rate limiting - avoid hammering APIs
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      stats.errors++;
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`  Events processed: ${stats.processed}`);
  console.log(`  Descriptions updated: ${stats.updated}`);
  console.log(`  Skipped: ${stats.skipped}`);
  console.log(`  Errors: ${stats.errors}`);
  console.log('='.repeat(50));

  return stats;
}

// Run
resummarizeEvents()
  .then(stats => {
    console.log('\n✨ Re-summarization complete!');
    process.exit(stats.errors > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
