/**
 * ScrapeResult — Wraps scraper output to distinguish
 * "genuinely empty" from "couldn't parse."
 *
 * Scrapers that return bare arrays are wrapped via ScrapeResult.from()
 * for backward compatibility.
 */
export class ScrapeResult {
  constructor(events, { status = 'success', htmlReceived = true } = {}) {
    this.events = events;
    this.status = status;         // 'success' | 'parse_uncertain'
    this.htmlReceived = htmlReceived;
  }

  /** Normal result — events extracted (or genuinely none exist) */
  static success(events) {
    return new ScrapeResult(events, { status: 'success', htmlReceived: true });
  }

  /** Got HTML but couldn't extract any events — parser may need updating */
  static parseUncertain(events = []) {
    return new ScrapeResult(events, { status: 'parse_uncertain', htmlReceived: true });
  }

  /** HTTP error or timeout — never received HTML */
  static fetchFailed() {
    return new ScrapeResult([], { status: 'success', htmlReceived: false });
  }

  /** Backward compat: wraps bare arrays as success */
  static from(result) {
    if (result instanceof ScrapeResult) return result;
    if (Array.isArray(result)) return ScrapeResult.success(result);
    return ScrapeResult.success(result?.events || []);
  }
}
