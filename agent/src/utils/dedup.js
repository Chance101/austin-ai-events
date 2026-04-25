import Fuse from 'fuse.js';
import { parseISO, differenceInHours, isSameDay } from 'date-fns';
import { checkDuplicate } from './claude.js';

/**
 * A start_time of exactly 00:00:00 UTC is almost certainly a placeholder
 * (the source had a date but no time, and the parser filled in midnight).
 * A real midnight Austin event would be 05:00 or 06:00 UTC, not 00:00 UTC.
 * When comparing events, treat placeholder midnights as "unknown time" so
 * strict hour-based matching doesn't miss pairs where one side lacks time.
 */
function isPlaceholderMidnightUTC(date) {
  if (!date) return false;
  return date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;
}

/**
 * Normalize title for comparison
 */
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove special chars
    .trim();
}

/**
 * Normalize venue name for comparison
 */
function normalizeVenue(venue) {
  if (!venue) return '';
  return venue
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Extract venue fingerprints for loose cross-source matching.
 * Returns an array of alphanumeric substrings (6+ chars) that can identify a venue.
 * E.g., "Antler VC, 800 Brazos St, Austin" → ['antlervc', '800brazosst', 'antlervc800brazosstaustintx']
 */
export function getVenueFingerprints(venueName, address) {
  const fingerprints = [];
  const parts = [venueName, address].filter(Boolean);

  for (const part of parts) {
    const normalized = part.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.length >= 6) {
      fingerprints.push(normalized);
    }
  }

  // Also add combined fingerprint for partial matches
  const combined = parts.join(' ').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (combined.length >= 6) {
    fingerprints.push(combined);
  }

  return fingerprints;
}

/**
 * Check if two events might be at the same venue based on fingerprint overlap.
 * Returns true if any fingerprint from one venue is a substring of any fingerprint from the other.
 */
export function venuesOverlap(v1Name, v1Addr, v2Name, v2Addr) {
  const fp1 = getVenueFingerprints(v1Name, v1Addr);
  const fp2 = getVenueFingerprints(v2Name, v2Addr);

  if (fp1.length === 0 || fp2.length === 0) return false;

  for (const a of fp1) {
    for (const b of fp2) {
      if (a.includes(b) || b.includes(a)) return true;
    }
  }

  return false;
}

/**
 * Find potential duplicates using fuzzy matching + AI reasoning
 * @param {Object} newEvent - The new event to check
 * @param {Array} existingEvents - Array of existing events to compare against
 * @param {Object} runStats - Optional run stats object for tracking API calls
 */
export async function findDuplicates(newEvent, existingEvents, runStats = null) {
  // Quick check: exact title + same day + same venue = definite duplicate
  const newTitle = normalizeTitle(newEvent.title || '');
  const newVenue = normalizeVenue(newEvent.venue_name);
  const newDate = newEvent.start_time ? parseISO(newEvent.start_time) : null;

  for (const existing of existingEvents) {
    const existingTitle = normalizeTitle(existing.title || '');
    const existingVenue = normalizeVenue(existing.venue_name);
    const existingDate = existing.start_time ? parseISO(existing.start_time) : null;

    // If titles match exactly (normalized) and within 12 hours, it's a duplicate
    // (12hr window handles timezone edge cases where same local day = different UTC days)
    if (newTitle === existingTitle && newDate && existingDate) {
      const hoursDiff = Math.abs(differenceInHours(newDate, existingDate));
      if (hoursDiff <= 12) {
        return {
          existingEvent: existing,
          confidence: 0.95,
          reason: `Exact title match "${newEvent.title}" within 12 hours`,
        };
      }
    }

    // If titles match and same venue (even if slightly different days due to timezone), it's a duplicate
    if (newTitle === existingTitle && newVenue && newVenue === existingVenue) {
      const hoursDiff = newDate && existingDate ? Math.abs(differenceInHours(newDate, existingDate)) : 999;
      if (hoursDiff <= 48) {
        return {
          existingEvent: existing,
          confidence: 0.95,
          reason: `Same title "${newEvent.title}" and venue "${newEvent.venue_name}" within 48 hours`,
        };
      }
    }
  }

  // Check for repackaged events: same source + same day = likely same conference
  // with different track names (e.g., "Sales Summit Austin" / "Customer Success Summit Austin")
  if (newEvent.source && newDate) {
    const sameSourceSameDay = existingEvents.filter(existing => {
      if (!existing.source || !existing.start_time) return false;
      if (existing.source !== newEvent.source) return false;
      const existingDate = parseISO(existing.start_time);
      return isSameDay(newDate, existingDate);
    });

    for (const candidate of sameSourceSameDay.slice(0, 3)) {
      try {
        const result = await checkDuplicate(newEvent, candidate, runStats);
        if (runStats) runStats.claudeApiCalls++;
        if (result.isDuplicate && result.confidence > 0.7) {
          return {
            existingEvent: candidate,
            confidence: result.confidence,
            reason: `Same source, same day: ${result.reason}`,
          };
        }
      } catch (error) {
        console.error('Error checking same-source duplicate:', error);
      }
    }
  }

  // Cross-source time+venue check: catches same event with completely different titles
  // across different sources (e.g., "Texas AI House" vs "March Roundtable Breakfast")
  if (newEvent.source && newDate) {
    const newIsPlaceholder = isPlaceholderMidnightUTC(newDate);
    const crossSourceCandidates = existingEvents.filter(existing => {
      if (!existing.start_time) return false;
      // Must be from a different source
      if (existing.source === newEvent.source) return false;
      const existingDate = parseISO(existing.start_time);
      const existingIsPlaceholder = isPlaceholderMidnightUTC(existingDate);

      // When either side is a placeholder midnight (date-only with no real
      // time), fall back to same-day matching — strict hour diff would miss
      // pairs where one source lacks time data.
      if (newIsPlaceholder || existingIsPlaceholder) {
        return isSameDay(newDate, existingDate);
      }

      const hoursDiff = Math.abs(differenceInHours(newDate, existingDate));
      return hoursDiff <= 3;
    });

    // Check candidates with venue/organizer overlap first
    const venueMatches = crossSourceCandidates.filter(existing => {
      return venuesOverlap(
        newEvent.venue_name || newEvent.location, newEvent.address,
        existing.venue_name || existing.location, existing.address
      );
    });

    for (const candidate of venueMatches.slice(0, 3)) {
      try {
        const result = await checkDuplicate(newEvent, candidate, runStats);
        if (runStats) runStats.claudeApiCalls++;
        if (result.isDuplicate && result.confidence > 0.7) {
          return {
            existingEvent: candidate,
            confidence: result.confidence,
            reason: `Cross-source time+venue match: ${result.reason}`,
          };
        }
      } catch (error) {
        console.error('Error checking cross-source duplicate:', error);
      }
    }

    // If no venue data on either side but times are very close (within 1 hour),
    // still check — one source may lack venue info
    if (venueMatches.length === 0) {
      const closeTimeCandidates = crossSourceCandidates.filter(existing => {
        const existingDate = parseISO(existing.start_time);
        const hoursDiff = Math.abs(differenceInHours(newDate, existingDate));
        const newHasVenue = newEvent.venue_name || newEvent.address || newEvent.location;
        const existingHasVenue = existing.venue_name || existing.address || existing.location;
        return hoursDiff <= 1 && (!newHasVenue || !existingHasVenue);
      });

      for (const candidate of closeTimeCandidates.slice(0, 3)) {
        try {
          const result = await checkDuplicate(newEvent, candidate, runStats);
          if (runStats) runStats.claudeApiCalls++;
          if (result.isDuplicate && result.confidence > 0.7) {
            return {
              existingEvent: candidate,
              confidence: result.confidence,
              reason: `Cross-source close-time match: ${result.reason}`,
            };
          }
        } catch (error) {
          console.error('Error checking cross-source duplicate:', error);
        }
      }
    }
  }

  // First pass: fuzzy title matching
  const fuse = new Fuse(existingEvents, {
    keys: ['title'],
    threshold: 0.4, // 0 = exact, 1 = match anything
    includeScore: true,
  });

  const titleMatches = fuse.search(newEvent.title);

  // Filter to events within 24 hours of each other
  const potentialDupes = titleMatches
    .filter(match => {
      if (!match.item.start_time || !newEvent.start_time) return false;
      const existingDate = parseISO(match.item.start_time);
      const newEventDate = parseISO(newEvent.start_time);
      const hoursDiff = Math.abs(differenceInHours(existingDate, newEventDate));
      return hoursDiff <= 24;
    })
    .slice(0, 3); // Only check top 3 candidates

  if (potentialDupes.length === 0) {
    return null;
  }

  // Second pass: AI-powered duplicate detection
  for (const match of potentialDupes) {
    try {
      const result = await checkDuplicate(newEvent, match.item, runStats);
      if (runStats) runStats.claudeApiCalls++;  // Track Claude API call
      if (result.isDuplicate && result.confidence > 0.7) {
        return {
          existingEvent: match.item,
          confidence: result.confidence,
          reason: result.reason,
        };
      }
    } catch (error) {
      console.error('Error checking duplicate:', error);
    }
  }

  return null;
}

/**
 * Simple hash for quick duplicate detection based on URL
 */
export function getEventHash(event) {
  // Normalize URL by removing trailing slashes and query params
  const normalizedUrl = event.url
    .replace(/\/$/, '')
    .split('?')[0]
    .toLowerCase();

  return normalizedUrl;
}

/**
 * Stable dedup key from (source, source_event_id) — mirrors the DB unique
 * constraint. Catches duplicates when URL drifts between scrapes (e.g., a
 * scraper change picks a different external link for the same event) but
 * the source-assigned ID is unchanged. Returns null when source_event_id
 * is missing — those rows fall through to URL/title-based dedup.
 */
export function getEventIdKey(event) {
  if (!event.source || !event.source_event_id) return null;
  return `${event.source}|${event.source_event_id}`;
}
