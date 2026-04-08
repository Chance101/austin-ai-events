/**
 * Scrape Diagnostics — Shared helpers for scraper observability.
 *
 * Every scraper can use these to report what it saw (HTTP status,
 * page size, content signals, parse results) so the monitor and
 * demotion logic can distinguish "parser broken" from "source empty."
 */

/**
 * Zero-cost content signals from raw HTML.
 * Pure string matching — no API calls.
 */
export function computeContentSignals(html) {
  const text = html.toLowerCase();
  return {
    hasJsonLd: text.includes('application/ld+json'),
    hasNextData: text.includes('__next_data__'),
    hasEventKeywords: /\b(register|rsvp|attend|event|meetup|join us|upcoming)\b/.test(text),
    hasDatePatterns: /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i.test(text)
      || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text),
  };
}

/**
 * Build the diagnostics object from a fetch response + HTML body.
 * Call this right after fetch() in any scraper.
 */
export function createFetchDiagnostics(response, html) {
  return {
    httpStatus: response?.status ?? null,
    pageSize: html?.length ?? null,
    contentSignals: html ? computeContentSignals(html) : null,
  };
}

/**
 * Create an empty diagnostics scaffold.
 * Scrapers populate fields as they progress through parsing.
 */
export function createDiagnostics() {
  return {
    httpStatus: null,
    pageSize: null,
    parseAttempts: [],
    parseStrategy: null,
    candidateElements: null,
    eventsPreFilter: null,
    errors: [],
    contentSignals: null,
    pageTextSnippet: null,   // first ~3000 chars of text, only populated when events=0
  };
}

/**
 * Extract a text snippet from HTML for content verification.
 * Strips tags, collapses whitespace, caps at maxLen chars.
 */
export function extractTextSnippet(html, maxLen = 3000) {
  if (!html) return null;
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.substring(0, maxLen);
}
