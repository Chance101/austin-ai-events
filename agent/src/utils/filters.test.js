import { describe, it } from 'node:test';
import assert from 'node:assert';
import { checkAustinLocation, isMalformedTitle } from './filters.js';

// =============================================================================
// checkAustinLocation
// =============================================================================

describe('checkAustinLocation', () => {

  // --- Returns { isAustin: true } for Austin-area events ---

  describe('returns isAustin: true for Austin indicators', () => {
    it('matches "Austin" in venue name', () => {
      const result = checkAustinLocation({ venue_name: 'Austin Convention Center' });
      assert.strictEqual(result.isAustin, true);
    });

    it('matches "ATX" in title', () => {
      const result = checkAustinLocation({ title: 'ATX AI Meetup' });
      assert.strictEqual(result.isAustin, true);
    });

    it('matches "Capital Factory" in venue', () => {
      const result = checkAustinLocation({ venue_name: 'Capital Factory' });
      assert.strictEqual(result.isAustin, true);
    });

    it('matches "UT Austin" in location', () => {
      const result = checkAustinLocation({ location: 'UT Austin campus' });
      assert.strictEqual(result.isAustin, true);
    });

    it('matches zip codes starting with 787', () => {
      const result = checkAustinLocation({ address: '123 Main St, 78701' });
      assert.strictEqual(result.isAustin, true);
    });

    it('matches "TX 78" format zip code prefix', () => {
      const result = checkAustinLocation({ address: 'Something, TX 78752' });
      assert.strictEqual(result.isAustin, true);
    });

    it('matches Austin suburb "Round Rock"', () => {
      const result = checkAustinLocation({ address: 'Round Rock, TX' });
      assert.strictEqual(result.isAustin, true);
    });

    it('matches Austin suburb "Cedar Park"', () => {
      const result = checkAustinLocation({ address: 'Cedar Park, TX' });
      assert.strictEqual(result.isAustin, true);
    });

    it('matches Austin landmark "Zilker"', () => {
      const result = checkAustinLocation({ venue_name: 'Zilker Park' });
      assert.strictEqual(result.isAustin, true);
    });

    it('matches "SXSW"', () => {
      const result = checkAustinLocation({ title: 'SXSW Interactive Panel' });
      assert.strictEqual(result.isAustin, true);
    });

    it('matches "University of Texas"', () => {
      const result = checkAustinLocation({ venue_name: 'University of Texas at Austin' });
      assert.strictEqual(result.isAustin, true);
    });

    it('matches case-insensitively', () => {
      const result = checkAustinLocation({ venue_name: 'CAPITAL FACTORY' });
      assert.strictEqual(result.isAustin, true);
    });

    it('matches "South Congress"', () => {
      const result = checkAustinLocation({ address: 'South Congress Ave' });
      assert.strictEqual(result.isAustin, true);
    });

    it('matches "Travis County"', () => {
      const result = checkAustinLocation({ location: 'Travis County Expo Center' });
      assert.strictEqual(result.isAustin, true);
    });
  });

  // --- Returns { isAustin: false } for non-Austin locations ---

  describe('returns isAustin: false for non-Austin cities', () => {
    it('rejects "San Francisco"', () => {
      const result = checkAustinLocation({ location: 'San Francisco, CA' });
      assert.strictEqual(result.isAustin, false);
      assert.ok(result.reason.includes('san francisco'));
    });

    it('rejects "virtual"', () => {
      const result = checkAustinLocation({ location: 'Virtual Event' });
      assert.strictEqual(result.isAustin, false);
    });

    it('rejects "online only"', () => {
      const result = checkAustinLocation({ location: 'Online Only' });
      assert.strictEqual(result.isAustin, false);
    });

    it('rejects "Houston"', () => {
      const result = checkAustinLocation({ venue_name: 'Houston Convention Center' });
      assert.strictEqual(result.isAustin, false);
    });

    it('rejects "Dallas"', () => {
      const result = checkAustinLocation({ address: 'Dallas, TX' });
      assert.strictEqual(result.isAustin, false);
    });

    it('rejects "New York"', () => {
      const result = checkAustinLocation({ location: 'New York, NY' });
      assert.strictEqual(result.isAustin, false);
    });

    it('rejects "webinar"', () => {
      const result = checkAustinLocation({ location: 'Webinar' });
      assert.strictEqual(result.isAustin, false);
    });

    it('rejects "remote"', () => {
      const result = checkAustinLocation({ location: 'Remote' });
      assert.strictEqual(result.isAustin, false);
    });

    it('rejects "zoom only"', () => {
      const result = checkAustinLocation({ location: 'Zoom Only' });
      assert.strictEqual(result.isAustin, false);
    });

    it('rejects "London"', () => {
      const result = checkAustinLocation({ address: 'London, UK' });
      assert.strictEqual(result.isAustin, false);
    });

    it('rejects "El Paso"', () => {
      const result = checkAustinLocation({ address: 'El Paso, TX' });
      assert.strictEqual(result.isAustin, false);
    });
  });

  // --- Returns { isAustin: null } for ambiguous or missing location ---

  describe('returns isAustin: null for ambiguous/missing location', () => {
    it('returns null when no location fields at all', () => {
      const result = checkAustinLocation({});
      assert.strictEqual(result.isAustin, null);
      assert.ok(result.reason.includes('No location data'));
    });

    it('returns null when all location fields are empty/undefined', () => {
      const result = checkAustinLocation({
        venue_name: undefined,
        address: undefined,
        location: undefined,
        title: undefined,
      });
      assert.strictEqual(result.isAustin, null);
    });

    it('returns null (not false) for location data with no Austin indicators', () => {
      const result = checkAustinLocation({
        venue_name: 'Community Center',
        address: '123 Elm Street',
      });
      assert.strictEqual(result.isAustin, null);
      assert.ok(result.reason.includes('no Austin indicators'));
    });

    it('returns null for a generic venue with no city', () => {
      const result = checkAustinLocation({
        venue_name: 'The Grand Ballroom',
      });
      assert.strictEqual(result.isAustin, null);
    });

    it('returns null for only a short title with no location hints', () => {
      const result = checkAustinLocation({
        title: 'AI Summit 2026',
      });
      assert.strictEqual(result.isAustin, null);
    });
  });

  // --- Edge cases ---

  describe('edge cases', () => {
    it('non-Austin city takes precedence when both appear', () => {
      // If an event somehow mentions both "Austin" and "San Francisco",
      // non-Austin check runs first, so it should return false
      const result = checkAustinLocation({
        title: 'Austin AI Meetup',
        location: 'San Francisco, CA',
      });
      assert.strictEqual(result.isAustin, false);
    });

    it('handles null fields gracefully', () => {
      const result = checkAustinLocation({
        venue_name: null,
        address: null,
        location: null,
        title: null,
      });
      assert.strictEqual(result.isAustin, null);
    });
  });
});

// =============================================================================
// isMalformedTitle
// =============================================================================

describe('isMalformedTitle', () => {

  describe('returns true for CSS content', () => {
    it('detects CSS class definition', () => {
      assert.strictEqual(isMalformedTitle('.class-name { color: red; }'), true);
    });

    it('detects CSS position property', () => {
      assert.strictEqual(isMalformedTitle('position: relative; top: 0;'), true);
    });

    it('detects CSS display property', () => {
      assert.strictEqual(isMalformedTitle('display: block; margin: 0;'), true);
    });

    it('detects CSS ID selector', () => {
      assert.strictEqual(isMalformedTitle('#my-element { width: 100%; }'), true);
    });

    it('detects CSS pseudo-selector', () => {
      assert.strictEqual(isMalformedTitle('button &:hover { opacity: 0.8 }'), true);
    });

    it('detects CSS media query', () => {
      assert.strictEqual(isMalformedTitle('@media screen and (max-width: 768px)'), true);
    });

    it('detects CSS import', () => {
      assert.strictEqual(isMalformedTitle('@import url("styles.css")'), true);
    });
  });

  describe('returns true for HTML content', () => {
    it('detects HTML div tag', () => {
      assert.strictEqual(isMalformedTitle('<div class="event">'), true);
    });

    it('detects HTML span tag', () => {
      assert.strictEqual(isMalformedTitle('<span>Event Title</span>'), true);
    });

    it('detects HTML heading', () => {
      assert.strictEqual(isMalformedTitle('<h1>Event</h1>'), true);
    });
  });

  describe('returns true for JavaScript content', () => {
    it('detects function keyword', () => {
      assert.strictEqual(isMalformedTitle('function( event ) { return true; }'), true);
    });

    it('detects const declaration', () => {
      assert.strictEqual(isMalformedTitle('const eventHandler = () => {}'), true);
    });

    it('detects var declaration', () => {
      assert.strictEqual(isMalformedTitle('var myEvent = "test"'), true);
    });

    it('detects multiple braces', () => {
      assert.strictEqual(isMalformedTitle('{{something}}'), true);
    });
  });

  describe('returns true for mostly non-alphanumeric strings', () => {
    it('rejects strings that are mostly symbols', () => {
      assert.strictEqual(isMalformedTitle('---***---!!!---'), true);
    });

    it('rejects heavily punctuated strings', () => {
      assert.strictEqual(isMalformedTitle('$$$...###...@@@'), true);
    });
  });

  describe('returns true for null/undefined', () => {
    it('rejects null', () => {
      assert.strictEqual(isMalformedTitle(null), true);
    });

    it('rejects undefined', () => {
      assert.strictEqual(isMalformedTitle(undefined), true);
    });

    it('rejects empty string', () => {
      // Empty string has 0 alphanumeric chars, which is < 0.3 * 0
      // Actually 0 < 0 * 0.3 is 0 < 0, which is false. But empty string:
      // alphanumeric = '', title.length = 0, 0 < 0 * 0.3 = 0, false.
      // However, empty string is likely not a malformed title in the
      // traditional sense — it's handled by the caller's length check.
      // Let's just verify the behavior is consistent.
      assert.strictEqual(isMalformedTitle(''), true);
    });
  });

  describe('returns false for normal event titles', () => {
    it('accepts "Austin AI Meetup - March 2026"', () => {
      assert.strictEqual(isMalformedTitle('Austin AI Meetup - March 2026'), false);
    });

    it('accepts "LangChain Workshop at Capital Factory"', () => {
      assert.strictEqual(isMalformedTitle('LangChain Workshop at Capital Factory'), false);
    });

    it('accepts "SXSW 2026: The Future of AI"', () => {
      assert.strictEqual(isMalformedTitle('SXSW 2026: The Future of AI'), false);
    });

    it('accepts "Generative AI in Healthcare Panel Discussion"', () => {
      assert.strictEqual(isMalformedTitle('Generative AI in Healthcare Panel Discussion'), false);
    });

    it('accepts "Build Your First RAG App (Beginner Friendly)"', () => {
      assert.strictEqual(isMalformedTitle('Build Your First RAG App (Beginner Friendly)'), false);
    });

    it('accepts title with numbers and colons', () => {
      assert.strictEqual(isMalformedTitle('AI & ML Summit 2026: Day 1'), false);
    });
  });
});
