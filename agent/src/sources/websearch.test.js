import { describe, it } from 'node:test';
import assert from 'node:assert';

/**
 * These tests verify the URL filtering logic used in websearch.js
 * to distinguish individual event pages from listing/index pages.
 *
 * We extract the filtering logic from searchEvents() and test it directly,
 * since the full function requires SerpAPI calls.
 */

// Replicate the exact isEventPage logic from websearch.js searchEvents()
function isEventPage(link) {
  return !!(
    link.includes('meetup.com/') ||
    link.includes('eventbrite.com/e/') ||
    link.includes('lu.ma/') ||
    link.match(/\/events?\/[^/?]/) // /event/slug or /events/slug, not bare /events/
  );
}

describe('websearch URL filtering (isEventPage)', () => {

  describe('eventbrite.com URLs', () => {
    it('matches eventbrite.com/e/slug (individual event)', () => {
      assert.strictEqual(
        isEventPage('https://www.eventbrite.com/e/austin-ai-meetup-tickets-123456'),
        true,
      );
    });

    it('does NOT match bare eventbrite.com/d/ (listing/directory page)', () => {
      assert.strictEqual(
        isEventPage('https://www.eventbrite.com/d/tx--austin/ai-events/'),
        false,
      );
    });

    it('does NOT match eventbrite.com homepage', () => {
      assert.strictEqual(
        isEventPage('https://www.eventbrite.com/'),
        false,
      );
    });
  });

  describe('meetup.com URLs', () => {
    it('matches meetup.com/group/events/ (group event listing)', () => {
      assert.strictEqual(
        isEventPage('https://www.meetup.com/austin-ai-group/events/'),
        true,
      );
    });

    it('matches meetup.com/group/events/slug (specific event)', () => {
      assert.strictEqual(
        isEventPage('https://www.meetup.com/austin-ai-group/events/12345678/'),
        true,
      );
    });

    it('matches bare meetup.com/ domain (because includes check)', () => {
      // Note: the filter uses link.includes('meetup.com/') which matches
      // any meetup.com URL with a path. This is intentional — meetup URLs
      // almost always lead to event-related content.
      assert.strictEqual(
        isEventPage('https://www.meetup.com/austin-ai-group/'),
        true,
      );
    });
  });

  describe('lu.ma URLs', () => {
    it('matches lu.ma/event-slug', () => {
      assert.strictEqual(
        isEventPage('https://lu.ma/austin-ai-march'),
        true,
      );
    });

    it('matches lu.ma/org-page', () => {
      // lu.ma/ matches any lu.ma URL, which is correct since
      // lu.ma primarily hosts individual events
      assert.strictEqual(
        isEventPage('https://lu.ma/aitx'),
        true,
      );
    });
  });

  describe('/event/ and /events/ pattern matching', () => {
    it('matches /event/slug pattern', () => {
      assert.strictEqual(
        isEventPage('https://example.com/event/austin-ai-summit-2026'),
        true,
      );
    });

    it('matches /events/slug pattern', () => {
      assert.strictEqual(
        isEventPage('https://example.com/events/austin-ai-summit-2026'),
        true,
      );
    });

    it('does NOT match bare /events/ with nothing after', () => {
      // /events/ alone ends with /, the regex requires [^/?] after /events/
      // link.match(/\/events?\/[^/?]/) on "/events/" -> the char after last / is end-of-string
      assert.strictEqual(
        isEventPage('https://example.com/events/'),
        false,
      );
    });

    it('does NOT match bare /events with no trailing slash or slug', () => {
      assert.strictEqual(
        isEventPage('https://example.com/events'),
        false,
      );
    });

    it('does NOT match /events?query=param (query string, no slug)', () => {
      // The regex [^/?] excludes ? so /events?foo won't match
      assert.strictEqual(
        isEventPage('https://example.com/events?page=2'),
        false,
      );
    });

    it('matches /events/123 (numeric slug)', () => {
      assert.strictEqual(
        isEventPage('https://example.com/events/123'),
        true,
      );
    });
  });

  describe('non-event URLs', () => {
    it('does NOT match generic blog posts', () => {
      assert.strictEqual(
        isEventPage('https://techcrunch.com/2026/03/ai-in-austin/'),
        false,
      );
    });

    it('does NOT match social media pages', () => {
      assert.strictEqual(
        isEventPage('https://twitter.com/austinai'),
        false,
      );
    });

    it('does NOT match bare domain', () => {
      assert.strictEqual(
        isEventPage('https://example.com/'),
        false,
      );
    });

    it('does NOT match generic directory pages', () => {
      assert.strictEqual(
        isEventPage('https://example.com/directory/ai-companies'),
        false,
      );
    });
  });
});
