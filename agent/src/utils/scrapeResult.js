/**
 * ScrapeResult — Wraps scraper output with diagnostic context.
 *
 * Every scraper returns a ScrapeResult carrying both the extracted events
 * AND diagnostics about what happened during scraping (HTTP status, page
 * size, parse strategy, content signals). This lets the monitor and
 * demotion logic distinguish "parser broken" from "source genuinely empty."
 *
 * Scrapers that return bare arrays are wrapped via ScrapeResult.from()
 * for backward compatibility (diagnostics will be null).
 */
export class ScrapeResult {
  constructor(events, { status = 'success', htmlReceived = true, diagnostics = null } = {}) {
    this.events = events;
    this.status = status;         // 'success' | 'parse_uncertain' | 'fetch_failed'
    this.htmlReceived = htmlReceived;
    this.diagnostics = diagnostics;
  }

  /** Normal result — events extracted (or genuinely none exist) */
  static success(events, diagnostics = null) {
    return new ScrapeResult(events, { status: 'success', htmlReceived: true, diagnostics });
  }

  /** Got HTML but couldn't extract any events — parser may need updating */
  static parseUncertain(diagnostics = null) {
    return new ScrapeResult([], { status: 'parse_uncertain', htmlReceived: true, diagnostics });
  }

  /** HTTP error or timeout — never received usable HTML */
  static fetchFailed(diagnostics = null) {
    return new ScrapeResult([], { status: 'fetch_failed', htmlReceived: false, diagnostics });
  }

  /** Backward compat: wraps bare arrays as success (no diagnostics) */
  static from(result) {
    if (result instanceof ScrapeResult) return result;
    if (Array.isArray(result)) return ScrapeResult.success(result);
    return ScrapeResult.success(result?.events || []);
  }
}
