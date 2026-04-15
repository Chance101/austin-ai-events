/**
 * Dedup reconciler — post-hoc sweep that finds duplicate rows already in
 * the events table and proposes merges. Ingestion-time dedup catches most
 * cases but misses pairs where: (a) a bug produced wrong data, (b) the
 * pair's shape defeated the ingestion-time heuristics, (c) both rows were
 * inserted concurrently before either could see the other.
 *
 * Design principles (from user feedback — feedback_dont_guess_canonical):
 *
 * 1. Never hard-delete. Losers are soft-deleted via deleted_at +
 *    merged_into_id so the merge trail is recoverable.
 * 2. Never guess which row is canonical. Candidate groups are sent to
 *    Haiku with ALL field values from each row. Haiku decides (a) if
 *    they're duplicates, and (b) which row's data is canonical, or
 *    returns "unknown" if it can't tell confidently.
 * 3. Dry-run by default. The CLI emits a report of proposed merges for
 *    user review; --execute is required to actually soft-delete rows.
 * 4. Conservative thresholds. Only merge when Haiku returns is_duplicate
 *    with confidence >= 0.85 AND canonical_id is set (not "unknown").
 *
 * The reconciler runs against upcoming events (30 days default) to
 * respect API budget. Run manually:
 *
 *   node agent/src/utils/reconciler.js              # dry run, print proposals
 *   node agent/src/utils/reconciler.js --execute    # actually soft-delete
 *   node agent/src/utils/reconciler.js --days 60    # custom window
 */

import { parseISO, differenceInHours, isSameDay } from 'date-fns';
import Fuse from 'fuse.js';
import { getSupabase, isReadOnlyMode } from './supabase.js';
import { getClient } from './claude.js';
import { config } from '../config.js';
import { venuesOverlap } from './dedup.js';

const UPCOMING_DAYS_DEFAULT = 30;
const MERGE_CONFIDENCE_THRESHOLD = 0.85;
const MAX_GROUPS_PER_RUN = 50; // cap API cost

/**
 * Fetch all upcoming, non-deleted events within the window.
 */
async function fetchLiveUpcomingEvents(days = UPCOMING_DAYS_DEFAULT) {
  const supabase = getSupabase();
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('events')
    .select('id, title, description, start_time, end_time, venue_name, address, location, url, source, source_event_id, organizer, created_at')
    .is('deleted_at', null)
    .gte('start_time', now.toISOString())
    .lte('start_time', end.toISOString())
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error fetching upcoming events:', error);
    return [];
  }
  return data || [];
}

/**
 * Group events into candidate duplicate pairs/clusters using cheap heuristics.
 * Two events are in the same candidate group if any of these hold:
 *   - fuzzy title match (Fuse score < 0.45) AND within 48 hours
 *   - time within 3 hours AND venue fingerprint overlap
 *   - time within 1 hour AND at least one side has no venue data
 */
function groupCandidates(events) {
  const groups = [];
  const seen = new Set();

  // Build Fuse index once for fuzzy title matching
  const fuse = new Fuse(events, {
    keys: ['title'],
    threshold: 0.45,
    includeScore: true,
  });

  for (let i = 0; i < events.length; i++) {
    if (seen.has(events[i].id)) continue;
    const a = events[i];
    const group = [a];
    seen.add(a.id);

    // Fuzzy-title candidates
    const titleMatches = fuse.search(a.title || '');
    for (const match of titleMatches) {
      const b = match.item;
      if (b.id === a.id) continue;
      if (seen.has(b.id)) continue;
      if (!a.start_time || !b.start_time) continue;

      const hoursDiff = Math.abs(differenceInHours(parseISO(a.start_time), parseISO(b.start_time)));
      if (hoursDiff <= 48) {
        group.push(b);
        seen.add(b.id);
      }
    }

    // Time-window candidates via linear scan (events are already sorted by start_time)
    for (let j = i + 1; j < events.length; j++) {
      const b = events[j];
      if (seen.has(b.id)) continue;
      if (!a.start_time || !b.start_time) continue;

      const hoursDiff = Math.abs(differenceInHours(parseISO(a.start_time), parseISO(b.start_time)));
      if (hoursDiff > 24) break; // events sorted by time, can short-circuit

      const venueMatch = venuesOverlap(
        a.venue_name || a.location, a.address,
        b.venue_name || b.location, b.address
      );

      const neitherHasVenue = !(a.venue_name || a.address || a.location) && !(b.venue_name || b.address || b.location);

      if ((hoursDiff <= 3 && venueMatch) || (hoursDiff <= 1 && neitherHasVenue)) {
        group.push(b);
        seen.add(b.id);
      }
    }

    if (group.length >= 2) {
      groups.push(group);
    }
  }

  return groups;
}

/**
 * Ask Haiku whether a candidate group is a duplicate cluster, and if so,
 * which row's data is canonical. Returns a structured merge plan.
 */
async function proposeMergeForGroup(group, runStats = null) {
  const anthropic = getClient();

  const rowDescriptions = group.map((e, idx) => `
Row ${idx + 1} (id: ${e.id}):
  title: ${e.title}
  source: ${e.source}
  start_time: ${e.start_time}
  end_time: ${e.end_time || 'null'}
  venue_name: ${e.venue_name || 'null'}
  address: ${e.address || 'null'}
  url: ${e.url}
  organizer: ${e.organizer || 'null'}
  created_at: ${e.created_at}
`).join('\n');

  const prompt = `You are reconciling potential duplicate event rows in a calendar database.
Multiple rows may represent the same real-world event if they describe the same
gathering at the same time (within hours), even if titles/venues/sources differ.

Examine these ${group.length} candidate rows carefully:
${rowDescriptions}

Decide:
1. Are these rows duplicates of the same real-world event? (is_duplicate)
2. If yes, which row has the CORRECT canonical data? (canonical_row_id)
   - Consider: direct source URLs are not automatically better.
   - Consider: if times conflict significantly (>2 hours) this may be a
     scraper timezone bug OR two different events sharing a name.
   - Return "unknown" if you cannot confidently determine canonical from the data alone.
3. For each non-canonical row, should it be soft-deleted and merged into canonical?

CRITICAL: Return canonical_row_id="unknown" if ANY field conflict makes it
impossible to tell which row is correct without fetching the source. Wrong
merges lose correct data. The user prefers "I don't know" over wrong guesses.

Respond with ONLY valid JSON:
{
  "is_duplicate": boolean,
  "confidence": number,         // 0.0-1.0
  "canonical_row_id": string,   // UUID from the list, or "unknown"
  "losers": [string],           // UUIDs of rows to merge into canonical (empty if canonical_row_id is "unknown")
  "reason": string              // brief explanation
}`;

  try {
    const response = await anthropic.messages.create({
      model: config.models.fast, // Haiku — this is high-volume dedup, not strategic reasoning
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
    if (runStats) runStats.claudeApiCalls = (runStats.claudeApiCalls || 0) + 1;

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed;
  } catch (error) {
    console.error(`  Error proposing merge: ${error.message}`);
    return null;
  }
}

/**
 * Soft-delete losers by setting deleted_at + merged_into_id.
 * Optionally merges field values from losers into the canonical row
 * (only fields where canonical is null and loser has a value).
 */
async function executeMerge(canonicalId, loserIds, group) {
  if (isReadOnlyMode()) {
    console.log(`  🔒 READONLY_MODE: skipping merge for canonical ${canonicalId}`);
    return { merged: 0 };
  }

  const supabase = getSupabase();
  const canonical = group.find(e => e.id === canonicalId);
  if (!canonical) return { merged: 0, error: 'canonical not found in group' };

  // Fields to backfill from losers if canonical is missing them
  const backfillFields = ['venue_name', 'address', 'location', 'end_time', 'organizer', 'description'];
  const backfill = {};
  for (const field of backfillFields) {
    if (canonical[field]) continue;
    for (const id of loserIds) {
      const loser = group.find(e => e.id === id);
      if (loser && loser[field]) {
        backfill[field] = loser[field];
        break;
      }
    }
  }

  // Update canonical with backfilled fields (if any)
  if (Object.keys(backfill).length > 0) {
    const { error: backfillError } = await supabase
      .from('events')
      .update({ ...backfill, updated_at: new Date().toISOString() })
      .eq('id', canonicalId);
    if (backfillError) {
      console.error(`  Error backfilling canonical: ${backfillError.message}`);
      return { merged: 0, error: backfillError.message };
    }
  }

  // Soft-delete losers
  const now = new Date().toISOString();
  let merged = 0;
  for (const id of loserIds) {
    const { error } = await supabase
      .from('events')
      .update({ deleted_at: now, merged_into_id: canonicalId, updated_at: now })
      .eq('id', id);
    if (error) {
      console.error(`  Error soft-deleting ${id}: ${error.message}`);
    } else {
      merged++;
    }
  }

  return { merged, backfill };
}

/**
 * Run the reconciler. Returns a report of proposed/executed merges.
 *
 * @param {Object} opts
 * @param {number} [opts.days=30] - Window of upcoming events to consider
 * @param {boolean} [opts.execute=false] - If true, actually soft-delete losers
 * @param {number} [opts.maxGroups] - Cap the number of candidate groups sent to Haiku
 */
export async function runReconciler(opts = {}) {
  const {
    days = UPCOMING_DAYS_DEFAULT,
    execute = false,
    maxGroups = MAX_GROUPS_PER_RUN,
  } = opts;

  console.log('\n🔗 Dedup reconciler starting');
  console.log(`   Window: ${days} days, execute: ${execute}\n`);

  const events = await fetchLiveUpcomingEvents(days);
  console.log(`   Fetched ${events.length} live upcoming events`);

  const groups = groupCandidates(events);
  console.log(`   Found ${groups.length} candidate duplicate groups`);

  if (groups.length === 0) {
    console.log('\n✅ No candidate duplicate groups found — calendar is clean.\n');
    return { groups: 0, proposals: [], executed: 0, skipped: 0 };
  }

  const limitedGroups = groups.slice(0, maxGroups);
  if (limitedGroups.length < groups.length) {
    console.log(`   Capping at ${maxGroups} groups this run (${groups.length - maxGroups} remaining for next run)`);
  }

  const report = {
    groups: groups.length,
    proposals: [],
    executed: 0,
    skipped: 0,
    api_calls: 0,
  };

  const runStats = { claudeApiCalls: 0 };

  for (let i = 0; i < limitedGroups.length; i++) {
    const group = limitedGroups[i];
    console.log(`\n[${i + 1}/${limitedGroups.length}] Group of ${group.length}:`);
    for (const e of group) {
      console.log(`   - ${e.source}: ${e.title?.substring(0, 60)} @ ${e.start_time}`);
    }

    const proposal = await proposeMergeForGroup(group, runStats);
    if (!proposal) {
      console.log('   ⚠️  Failed to get proposal from Haiku');
      report.skipped++;
      continue;
    }

    const proposalSummary = {
      group_size: group.length,
      ids: group.map(e => e.id),
      is_duplicate: proposal.is_duplicate,
      confidence: proposal.confidence,
      canonical_row_id: proposal.canonical_row_id,
      losers: proposal.losers,
      reason: proposal.reason,
    };
    report.proposals.push(proposalSummary);

    if (!proposal.is_duplicate) {
      console.log(`   ✅ Not a duplicate: ${proposal.reason}`);
      report.skipped++;
      continue;
    }

    if (proposal.confidence < MERGE_CONFIDENCE_THRESHOLD) {
      console.log(`   ⚠️  Low confidence (${proposal.confidence.toFixed(2)} < ${MERGE_CONFIDENCE_THRESHOLD}): ${proposal.reason}`);
      report.skipped++;
      continue;
    }

    if (proposal.canonical_row_id === 'unknown' || !proposal.canonical_row_id) {
      console.log(`   ⚠️  Canonical unknown — needs human review: ${proposal.reason}`);
      report.skipped++;
      continue;
    }

    console.log(`   🔀 Propose merge: canonical=${proposal.canonical_row_id}, losers=[${(proposal.losers || []).join(', ')}]`);
    console.log(`      Reason: ${proposal.reason}`);

    if (execute) {
      const result = await executeMerge(proposal.canonical_row_id, proposal.losers || [], group);
      if (result.error) {
        console.log(`      ❌ Merge failed: ${result.error}`);
        report.skipped++;
      } else {
        console.log(`      ✅ Merged ${result.merged} loser(s) into canonical${result.backfill && Object.keys(result.backfill).length ? ` (backfilled: ${Object.keys(result.backfill).join(', ')})` : ''}`);
        report.executed += result.merged;
      }
    } else {
      console.log(`      [DRY-RUN] — pass --execute to apply`);
    }
  }

  report.api_calls = runStats.claudeApiCalls;

  console.log('\n' + '─'.repeat(50));
  console.log('🔗 Reconciler Report');
  console.log('─'.repeat(50));
  console.log(`   Candidate groups:     ${report.groups}`);
  console.log(`   Proposals generated:  ${report.proposals.length}`);
  console.log(`   Executed merges:      ${report.executed}`);
  console.log(`   Skipped:              ${report.skipped}`);
  console.log(`   Haiku API calls:      ${report.api_calls}`);
  console.log('─'.repeat(50) + '\n');

  return report;
}

// CLI entry point: node src/utils/reconciler.js [--execute] [--days N]
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('/reconciler.js') ||
  process.argv[1].endsWith('\\reconciler.js')
);

if (isDirectRun) {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1], 10) : UPCOMING_DAYS_DEFAULT;

  runReconciler({ days, execute })
    .then(report => {
      console.log('✨ Reconciler complete.');
      if (!execute && report.proposals.some(p => p.is_duplicate && p.canonical_row_id !== 'unknown')) {
        console.log('💡 To apply these merges, re-run with --execute');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Reconciler failed:', error);
      process.exit(1);
    });
}
