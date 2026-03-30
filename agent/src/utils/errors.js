/**
 * Error classification for scraper failures.
 * Routes errors to the right handler:
 *   transient  → retry (inner loop)
 *   structural → needs code fix (outer loop / human)
 *   permanent  → source is dead (monitor should demote)
 */

/**
 * Classify a scraper error for routing to the right handler.
 * @param {Error} error - The thrown error
 * @param {object} context - Optional context (e.g. { source: 'meetup' })
 * @returns {{ type: 'transient'|'structural'|'permanent', message: string, retryable: boolean }}
 */
export function classifyScrapeError(error, context = {}) {
  const message = error.message || String(error);
  const code = error.code || '';
  const status = error.status || error.statusCode || error.response?.status || null;

  // --- HTTP status code classification ---
  if (status) {
    // 429 Too Many Requests, 5xx Server Errors → transient
    if (status === 429 || (status >= 500 && status <= 599)) {
      return {
        type: 'transient',
        message: `HTTP ${status}: ${message}`,
        retryable: true,
      };
    }
    // 404 Not Found, 410 Gone → permanent
    if (status === 404 || status === 410) {
      return {
        type: 'permanent',
        message: `HTTP ${status}: ${message}`,
        retryable: false,
      };
    }
    // 401/403 Authentication/Authorization → permanent
    if (status === 401 || status === 403) {
      return {
        type: 'permanent',
        message: `HTTP ${status} (auth required): ${message}`,
        retryable: false,
      };
    }
  }

  // --- Node.js system error codes ---
  const transientCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE', 'EAI_AGAIN'];
  if (transientCodes.includes(code)) {
    return {
      type: 'transient',
      message: `${code}: ${message}`,
      retryable: true,
    };
  }

  // ENOTFOUND = DNS resolution failure. On a single occurrence this could be
  // a transient DNS blip, so we classify as transient (the retry will catch it).
  // If it keeps failing, consecutive_empty_scrapes will eventually demote it.
  if (code === 'ENOTFOUND') {
    return {
      type: 'transient',
      message: `DNS resolution failed: ${message}`,
      retryable: true,
    };
  }

  // --- Message-based heuristics ---
  const lowerMsg = message.toLowerCase();

  // Timeout patterns
  if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out') || lowerMsg.includes('aborted')) {
    return {
      type: 'transient',
      message: `Timeout: ${message}`,
      retryable: true,
    };
  }

  // Rate limiting language
  if (lowerMsg.includes('rate limit') || lowerMsg.includes('too many requests') || lowerMsg.includes('throttle')) {
    return {
      type: 'transient',
      message: `Rate limited: ${message}`,
      retryable: true,
    };
  }

  // Structural: parsing failures suggest the page changed
  if (
    lowerMsg.includes('unexpected token') ||
    lowerMsg.includes('json parse') ||
    lowerMsg.includes('cannot read propert') ||
    lowerMsg.includes('is not a function') ||
    lowerMsg.includes('undefined is not') ||
    lowerMsg.includes('null is not') ||
    lowerMsg.includes('no events found') ||
    lowerMsg.includes('expected element') ||
    lowerMsg.includes('selector') ||
    lowerMsg.includes('queryselector')
  ) {
    return {
      type: 'structural',
      message: `Parse/structure error: ${message}`,
      retryable: false,
    };
  }

  // Default: unknown errors are treated as transient (safe to retry once)
  return {
    type: 'transient',
    message: `Unknown error: ${message}`,
    retryable: true,
  };
}

/**
 * Classify a "silent failure" — scraper returned 0 events without throwing.
 * Uses consecutive_empty_scrapes from the source to decide severity.
 * @param {{ consecutive_empty_scrapes?: number, name?: string }} source
 * @param {number} eventsFound
 * @returns {{ type: 'transient'|'structural'|'permanent', message: string }}
 */
export function classifySilentFailure(source, eventsFound) {
  if (eventsFound > 0) {
    return { type: 'transient', message: 'Not a failure — events were found' };
  }

  const consecutive = (source.consecutive_empty_scrapes || 0) + 1; // +1 for current run

  if (consecutive <= 1) {
    return {
      type: 'transient',
      message: `First empty scrape for ${source.name || 'source'} — may just have no upcoming events`,
    };
  }

  if (consecutive <= 3) {
    return {
      type: 'structural',
      message: `${consecutive} consecutive empty scrapes for ${source.name || 'source'} — likely page structure changed`,
    };
  }

  // 4+ consecutive empty scrapes
  return {
    type: 'permanent',
    message: `${consecutive} consecutive empty scrapes for ${source.name || 'source'} — source may be dead`,
  };
}
