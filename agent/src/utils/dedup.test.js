import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getEventHash, getEventIdKey, getVenueFingerprints, venuesOverlap } from './dedup.js';

// Note: findDuplicates imports checkDuplicate from claude.js which requires
// the Anthropic API. We test getEventHash directly (no external deps) and
// test findDuplicates only for code paths that don't invoke Claude:
// - Exact title match (within 12 hours) -> returns duplicate without Claude
// - Exact title + same venue (within 48 hours) -> returns duplicate without Claude
// - No matches at all -> returns null without Claude (when dates are far apart)
//
// To test these paths we use dynamic import with the experimental module mock flag.
// Since we can't guarantee that flag is set, we test the Claude-free function
// (getEventHash) thoroughly and use a conditional approach for findDuplicates.

describe('getEventIdKey', () => {
  it('builds a key from source + source_event_id', () => {
    const event = { source: 'capital-factory', source_event_id: 'cf-5-14-health-supernova' };
    assert.strictEqual(getEventIdKey(event), 'capital-factory|cf-5-14-health-supernova');
  });

  it('returns null when source_event_id is missing', () => {
    const event = { source: 'web-search', source_event_id: null };
    assert.strictEqual(getEventIdKey(event), null);
  });

  it('returns null when source_event_id is undefined', () => {
    const event = { source: 'web-search' };
    assert.strictEqual(getEventIdKey(event), null);
  });

  it('returns null when source_event_id is empty string', () => {
    const event = { source: 'web-search', source_event_id: '' };
    assert.strictEqual(getEventIdKey(event), null);
  });

  it('returns null when source is missing', () => {
    const event = { source_event_id: 'abc123' };
    assert.strictEqual(getEventIdKey(event), null);
  });

  it('namespaces by source — same id from different sources produces different keys', () => {
    const a = { source: 'aitx', source_event_id: 'meetup-jan-26' };
    const b = { source: 'austin-ai', source_event_id: 'meetup-jan-26' };
    assert.notStrictEqual(getEventIdKey(a), getEventIdKey(b));
  });

  it('regression: catches the Capital Factory URL-drift case from 2026-04-25', () => {
    // Same event, different URLs picked across scrapes (the outer-loop's
    // 5bd2d8e Capital Factory URL fix changed which link the scraper picks)
    const oldRow = {
      source: 'capital-factory',
      source_event_id: 'cf-5-14-health-supernova,-connect-at-t',
      url: 'https://www.healthsupernova.com/',
    };
    const reScraped = {
      source: 'capital-factory',
      source_event_id: 'cf-5-14-health-supernova,-connect-at-t',
      url: 'https://info.capitalfactory.com/health-supernova',
    };
    // URL hashes diverge — URL-hash dedup misses
    assert.notStrictEqual(getEventHash(oldRow), getEventHash(reScraped));
    // ID keys match — ID-key dedup catches it
    assert.strictEqual(getEventIdKey(oldRow), getEventIdKey(reScraped));
  });
});

describe('getEventHash', () => {
  it('produces consistent hash for the same URL', () => {
    const event = { url: 'https://meetup.com/austin-ai/events/12345' };
    const hash1 = getEventHash(event);
    const hash2 = getEventHash(event);
    assert.strictEqual(hash1, hash2);
  });

  it('produces different hashes for different URLs', () => {
    const event1 = { url: 'https://meetup.com/austin-ai/events/12345' };
    const event2 = { url: 'https://meetup.com/austin-ai/events/67890' };
    assert.notStrictEqual(getEventHash(event1), getEventHash(event2));
  });

  it('normalizes trailing slashes', () => {
    const withSlash = { url: 'https://meetup.com/austin-ai/events/12345/' };
    const withoutSlash = { url: 'https://meetup.com/austin-ai/events/12345' };
    assert.strictEqual(getEventHash(withSlash), getEventHash(withoutSlash));
  });

  it('strips query parameters', () => {
    const withParams = { url: 'https://eventbrite.com/e/my-event?utm_source=google' };
    const withoutParams = { url: 'https://eventbrite.com/e/my-event' };
    assert.strictEqual(getEventHash(withParams), getEventHash(withoutParams));
  });

  it('normalizes to lowercase', () => {
    const upper = { url: 'https://Meetup.com/Austin-AI/Events/12345' };
    const lower = { url: 'https://meetup.com/austin-ai/events/12345' };
    assert.strictEqual(getEventHash(upper), getEventHash(lower));
  });

  it('returns a string', () => {
    const event = { url: 'https://example.com/event/1' };
    assert.strictEqual(typeof getEventHash(event), 'string');
  });

  it('strips multiple query parameters', () => {
    const withParams = { url: 'https://example.com/event/1?a=1&b=2&c=3' };
    const withoutParams = { url: 'https://example.com/event/1' };
    assert.strictEqual(getEventHash(withParams), getEventHash(withoutParams));
  });

  it('handles URLs with fragments by keeping them (only strips query params)', () => {
    // The implementation splits on '?' and takes [0], so fragments are kept
    // unless they come after a '?'. This test documents current behavior.
    const withFragment = { url: 'https://example.com/event/1#section' };
    const hash = getEventHash(withFragment);
    assert.ok(hash.includes('#section'), 'Fragment should be preserved (current behavior)');
  });

  it('produces different hashes for different domains', () => {
    const event1 = { url: 'https://meetup.com/event/123' };
    const event2 = { url: 'https://eventbrite.com/event/123' };
    assert.notStrictEqual(getEventHash(event1), getEventHash(event2));
  });
});

describe('getVenueFingerprints', () => {
  it('extracts fingerprints from venue name', () => {
    const fps = getVenueFingerprints('Antler VC', null);
    assert.ok(fps.length > 0);
    assert.ok(fps.some(fp => fp.includes('antlervc')));
  });

  it('extracts fingerprints from address', () => {
    const fps = getVenueFingerprints(null, '800 Brazos St, Austin, TX');
    assert.ok(fps.length > 0);
    assert.ok(fps.some(fp => fp.includes('800brazos')));
  });

  it('combines venue name and address', () => {
    const fps = getVenueFingerprints('Antler VC', '800 Brazos St');
    assert.ok(fps.some(fp => fp.includes('antlervc') && fp.includes('800brazos')));
  });

  it('returns empty array for null inputs', () => {
    const fps = getVenueFingerprints(null, null);
    assert.strictEqual(fps.length, 0);
  });

  it('filters out short strings (< 6 chars)', () => {
    const fps = getVenueFingerprints('Hi', null);
    assert.strictEqual(fps.length, 0);
  });
});

describe('venuesOverlap', () => {
  it('detects overlap when venue name appears in other address', () => {
    assert.ok(venuesOverlap('Antler VC', null, null, 'Antler VC, 800 Brazos St, Austin'));
  });

  it('detects overlap for same venue different formatting', () => {
    assert.ok(venuesOverlap('Capital Factory', null, 'Capital Factory Main Space', null));
  });

  it('detects overlap via shared address', () => {
    assert.ok(venuesOverlap(null, '9225 Bee Cave Road', null, '9225 Bee Cave Road Building A, Suite 350'));
  });

  it('returns false for different venues', () => {
    assert.ok(!venuesOverlap('Capital Factory', '701 Brazos St', 'Antler VC', '800 Brazos St'));
  });

  it('returns false when one side has no venue data', () => {
    assert.ok(!venuesOverlap('Capital Factory', '701 Brazos St', null, null));
  });

  it('returns false for both sides null', () => {
    assert.ok(!venuesOverlap(null, null, null, null));
  });
});

// Test findDuplicates using code paths that don't call Claude API
// These paths are: exact title within 12 hours, exact title+venue within 48 hours,
// and no match at all (when events are months apart so Fuse.js matches don't
// pass the 24-hour time filter, avoiding the Claude checkDuplicate call).
describe('findDuplicates (non-Claude paths)', async () => {
  // Dynamic import — findDuplicates imports claude.js at module level,
  // but the exact-match and no-match code paths don't call checkDuplicate.
  // If the import fails (e.g., missing Anthropic SDK), we skip these tests.
  let findDuplicates;
  try {
    const mod = await import('./dedup.js');
    findDuplicates = mod.findDuplicates;
  } catch (e) {
    // If import fails, tests will be skipped below
  }

  it('detects exact title match within 12 hours as duplicate', async (t) => {
    if (!findDuplicates) return t.skip('dedup.js import failed');

    const newEvent = {
      title: 'Austin AI Meetup',
      url: 'https://example.com/event-new',
      start_time: '2026-04-15T18:00:00Z',
      source: 'web-search',
    };

    const existingEvents = [
      {
        title: 'Austin AI Meetup',
        url: 'https://example.com/event-old',
        start_time: '2026-04-15T20:00:00Z', // 2 hours later
        source: 'meetup',
      },
    ];

    const result = await findDuplicates(newEvent, existingEvents);
    assert.ok(result !== null, 'Should detect as duplicate');
    assert.ok(result.confidence >= 0.9);
    assert.ok(result.reason.includes('Exact title match'));
  });

  it('detects exact title + same venue within 48hrs as duplicate', async (t) => {
    if (!findDuplicates) return t.skip('dedup.js import failed');

    const newEvent = {
      title: 'Austin AI Meetup',
      url: 'https://example.com/event-new',
      start_time: '2026-04-15T18:00:00Z',
      venue_name: 'Capital Factory',
      source: 'web-search',
    };

    const existingEvents = [
      {
        title: 'Austin AI Meetup',
        url: 'https://example.com/event-old',
        start_time: '2026-04-16T18:00:00Z', // 24 hours later
        venue_name: 'Capital Factory',
        source: 'meetup',
      },
    ];

    const result = await findDuplicates(newEvent, existingEvents);
    assert.ok(result !== null, 'Should detect as duplicate');
    assert.ok(result.confidence >= 0.9);
  });

  it('returns null when no existing events match at all', async (t) => {
    if (!findDuplicates) return t.skip('dedup.js import failed');

    const newEvent = {
      title: 'Unique AI Workshop Spring 2026',
      url: 'https://example.com/unique-event',
      start_time: '2026-04-15T18:00:00Z',
      source: 'web-search',
    };

    // Existing event has a completely different title and is months away,
    // so neither exact-match nor Fuse.js time-window paths trigger Claude.
    const existingEvents = [
      {
        title: 'Blockchain Conference Fall 2025',
        url: 'https://example.com/other-event',
        start_time: '2025-10-20T18:00:00Z',
        source: 'meetup',
      },
    ];

    const result = await findDuplicates(newEvent, existingEvents);
    assert.strictEqual(result, null);
  });

  it('returns null for empty existing events list', async (t) => {
    if (!findDuplicates) return t.skip('dedup.js import failed');

    const newEvent = {
      title: 'Austin AI Meetup',
      url: 'https://example.com/event',
      start_time: '2026-04-15T18:00:00Z',
      source: 'web-search',
    };

    const result = await findDuplicates(newEvent, []);
    assert.strictEqual(result, null);
  });

  it('normalizes titles for comparison (case and special chars)', async (t) => {
    if (!findDuplicates) return t.skip('dedup.js import failed');

    const newEvent = {
      title: 'Austin AI Meetup!',
      url: 'https://example.com/event-new',
      start_time: '2026-04-15T18:00:00Z',
      source: 'web-search',
    };

    const existingEvents = [
      {
        title: 'austin ai meetup',
        url: 'https://example.com/event-old',
        start_time: '2026-04-15T18:00:00Z',
        source: 'meetup',
      },
    ];

    const result = await findDuplicates(newEvent, existingEvents);
    assert.ok(result !== null, 'Should detect normalized title match as duplicate');
  });

  it('does NOT flag cross-source events at same venue but 5+ hours apart', async (t) => {
    if (!findDuplicates) return t.skip('dedup.js import failed');

    const newEvent = {
      title: 'Morning Workshop on AI Ethics',
      url: 'https://example.com/morning',
      start_time: '2026-04-15T14:00:00Z', // 9 AM CDT
      venue_name: 'Capital Factory',
      source: 'web-search',
    };

    const existingEvents = [
      {
        title: 'Evening AI Networking Mixer',
        url: 'https://example.com/evening',
        start_time: '2026-04-15T23:00:00Z', // 6 PM CDT — 9 hours later
        venue_name: 'Capital Factory',
        source: 'meetup',
      },
    ];

    // 9 hours apart — outside the 3-hour cross-source window.
    // Titles are different so no exact match. Different sources so no same-source check.
    // Fuse.js won't match these titles. Should return null.
    const result = await findDuplicates(newEvent, existingEvents);
    assert.strictEqual(result, null);
  });

  it('does NOT flag cross-source events at different venues same time', async (t) => {
    if (!findDuplicates) return t.skip('dedup.js import failed');

    const newEvent = {
      title: 'AI Startup Demo Night',
      url: 'https://example.com/demo',
      start_time: '2026-04-15T23:30:00Z',
      venue_name: 'Capital Factory',
      address: '701 Brazos St',
      source: 'web-search',
    };

    const existingEvents = [
      {
        title: 'Machine Learning Study Group',
        url: 'https://example.com/study',
        start_time: '2026-04-15T23:30:00Z', // exact same time
        venue_name: 'UT Austin',
        address: '2317 Speedway',
        source: 'meetup',
      },
    ];

    // Same time but different venues — should not flag.
    // Titles are different so no exact/fuzzy match either.
    const result = await findDuplicates(newEvent, existingEvents);
    assert.strictEqual(result, null);
  });

  it('does NOT flag events with same title but dates far apart', async (t) => {
    if (!findDuplicates) return t.skip('dedup.js import failed');

    const newEvent = {
      title: 'Monthly AI Meetup',
      url: 'https://example.com/event-april',
      start_time: '2026-04-15T18:00:00Z',
      source: 'luma', // different source than existing, so no same-source-same-day check
    };

    const existingEvents = [
      {
        title: 'Monthly AI Meetup',
        url: 'https://example.com/event-jan',
        start_time: '2026-01-15T18:00:00Z', // 3 months earlier — outside 12hr AND 24hr windows
        source: 'meetup', // different source
      },
    ];

    // Exact title check: >12 hours apart. Same venue check: no venue.
    // Same source+day: different sources. Fuse.js: >24 hours apart.
    // So no Claude call and returns null.
    const result = await findDuplicates(newEvent, existingEvents);
    assert.strictEqual(result, null);
  });
});
