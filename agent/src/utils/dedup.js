import Fuse from 'fuse.js';
import { parseISO, differenceInHours, isSameDay } from 'date-fns';
import { checkDuplicate } from './claude.js';

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
 * Find potential duplicates using fuzzy matching + AI reasoning
 */
export async function findDuplicates(newEvent, existingEvents) {
  // Quick check: exact title + same day + same venue = definite duplicate
  const newTitle = normalizeTitle(newEvent.title || '');
  const newVenue = normalizeVenue(newEvent.venue_name);
  const newDate = newEvent.start_time ? parseISO(newEvent.start_time) : null;

  for (const existing of existingEvents) {
    const existingTitle = normalizeTitle(existing.title || '');
    const existingVenue = normalizeVenue(existing.venue_name);
    const existingDate = existing.start_time ? parseISO(existing.start_time) : null;

    // If titles match exactly (normalized) and same day, it's a duplicate
    if (newTitle === existingTitle && newDate && existingDate && isSameDay(newDate, existingDate)) {
      return {
        existingEvent: existing,
        confidence: 0.95,
        reason: `Exact title match "${newEvent.title}" on same day`,
      };
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
      const result = await checkDuplicate(newEvent, match.item);
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
