import Fuse from 'fuse.js';
import { parseISO, differenceInHours } from 'date-fns';
import { checkDuplicate } from './claude.js';

/**
 * Find potential duplicates using fuzzy matching + AI reasoning
 */
export async function findDuplicates(newEvent, existingEvents) {
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
      const existingDate = parseISO(match.item.start_time);
      const newDate = parseISO(newEvent.start_time);
      const hoursDiff = Math.abs(differenceInHours(existingDate, newDate));
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
