import { describe, it } from 'node:test';
import assert from 'node:assert';
import { tryRepairJsonLd, extractEventsFromRawJsonLd } from './generic.js';

describe('tryRepairJsonLd', () => {
  it('returns null for null/undefined input', () => {
    assert.strictEqual(tryRepairJsonLd(null), null);
    assert.strictEqual(tryRepairJsonLd(undefined), null);
    assert.strictEqual(tryRepairJsonLd(''), null);
  });

  it('parses valid JSON without modification', () => {
    const json = '{"@type": "Event", "name": "Test Event"}';
    const result = tryRepairJsonLd(json);
    assert.deepStrictEqual(result, { '@type': 'Event', name: 'Test Event' });
  });

  it('fixes literal newlines inside string values', () => {
    const json = '{"@type": "Event", "name": "Test\nEvent"}';
    const result = tryRepairJsonLd(json);
    assert.deepStrictEqual(result, { '@type': 'Event', name: 'Test\nEvent' });
  });

  it('fixes literal tabs inside string values', () => {
    const json = '{"name": "Test\tEvent"}';
    const result = tryRepairJsonLd(json);
    assert.deepStrictEqual(result, { name: 'Test\tEvent' });
  });

  it('fixes literal carriage returns inside string values', () => {
    const json = '{"name": "Test\r\nEvent"}';
    const result = tryRepairJsonLd(json);
    assert.deepStrictEqual(result, { name: 'Test\r\nEvent' });
  });

  it('removes other control characters inside strings', () => {
    const json = '{"name": "Test\x01\x02Event"}';
    const result = tryRepairJsonLd(json);
    assert.deepStrictEqual(result, { name: 'TestEvent' });
  });

  it('removes trailing commas before closing brace', () => {
    const json = '{"name": "Test", "type": "Event",}';
    const result = tryRepairJsonLd(json);
    assert.deepStrictEqual(result, { name: 'Test', type: 'Event' });
  });

  it('removes trailing commas before closing bracket', () => {
    const json = '["a", "b",]';
    const result = tryRepairJsonLd(json);
    assert.deepStrictEqual(result, ['a', 'b']);
  });

  it('fixes invalid escape sequences', () => {
    const json = '{"name": "C:\\Users\\data"}';
    const result = tryRepairJsonLd(json);
    assert.ok(result);
    // \U is invalid escape → doubled to \\U, \d is invalid → doubled to \\d
    assert.strictEqual(result.name, 'C:\\Users\\data');
  });

  it('preserves valid escape sequences', () => {
    const json = '{"name": "Test\\"Event"}';
    const result = tryRepairJsonLd(json);
    assert.deepStrictEqual(result, { name: 'Test"Event' });
  });

  it('handles complex JSON-LD with nested Event', () => {
    const json = `{
      "@type": "ItemList",
      "itemListElement": [{
        "@type": "ListItem",
        "item": {
          "@type": "Event",
          "name": "AI\nConference",
          "startDate": "2026-05-01"
        }
      }]
    }`;
    const result = tryRepairJsonLd(json);
    assert.ok(result);
    assert.strictEqual(result.itemListElement[0].item.name, 'AI\nConference');
  });

  it('returns null for hopelessly malformed JSON', () => {
    const json = '{{{not json at all';
    const result = tryRepairJsonLd(json);
    assert.strictEqual(result, null);
  });

  it('preserves whitespace between tokens', () => {
    const json = '{\n  "name": "Test"\n}';
    const result = tryRepairJsonLd(json);
    assert.deepStrictEqual(result, { name: 'Test' });
  });
});

describe('extractEventsFromRawJsonLd', () => {
  const sourceConfig = { id: 'test-source', name: 'Test Source', url: 'https://example.com' };

  it('returns empty array when no Event types found', () => {
    const json = '{"@type": "WebPage", "name": "Test"}';
    const result = extractEventsFromRawJsonLd(json, sourceConfig);
    assert.deepStrictEqual(result, []);
  });

  it('extracts event from well-formed JSON-LD text', () => {
    const json = '{"@type": "Event", "name": "AI Conference", "startDate": "2026-05-01T10:00:00", "url": "https://example.com/event"}';
    const result = extractEventsFromRawJsonLd(json, sourceConfig);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].title, 'AI Conference');
    assert.strictEqual(result[0].start_time, '2026-05-01T10:00:00');
    assert.strictEqual(result[0].url, 'https://example.com/event');
    assert.strictEqual(result[0].source, 'test-source');
    assert.strictEqual(result[0].organizer, 'Test Source');
  });

  it('extracts event from malformed JSON-LD text', () => {
    const json = `{"@type": "Event", "name": "AI Loves Data", "description": "A great event with "quotes" inside", "startDate": "2027-02-17", "url": "https://datascience.salon/austin"}`;
    const result = extractEventsFromRawJsonLd(json, sourceConfig);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].title, 'AI Loves Data');
    assert.strictEqual(result[0].start_time, '2027-02-17');
  });

  it('extracts multiple events', () => {
    const json = `[
      {"@type": "Event", "name": "Event 1", "startDate": "2026-05-01"},
      {"@type": "Event", "name": "Event 2", "startDate": "2026-06-01"}
    ]`;
    const result = extractEventsFromRawJsonLd(json, sourceConfig);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].title, 'Event 1');
    assert.strictEqual(result[1].title, 'Event 2');
  });

  it('skips events without name or startDate', () => {
    const json = '{"@type": "Event", "name": "No Date Event"}';
    const result = extractEventsFromRawJsonLd(json, sourceConfig);
    assert.strictEqual(result.length, 0);
  });

  it('uses source URL when event has no URL', () => {
    const json = '{"@type": "Event", "name": "Test", "startDate": "2026-05-01"}';
    const result = extractEventsFromRawJsonLd(json, sourceConfig);
    assert.strictEqual(result[0].url, 'https://example.com');
  });

  it('extracts location name from nearby context', () => {
    const json = '{"@type": "Event", "name": "Test", "startDate": "2026-05-01", "location": {"@type": "Place", "name": "Austin Convention Center"}}';
    const result = extractEventsFromRawJsonLd(json, sourceConfig);
    assert.strictEqual(result[0].venue_name, 'Austin Convention Center');
  });

  it('handles BusinessEvent and other Event subtypes', () => {
    const json = '{"@type": "BusinessEvent", "name": "Biz Conf", "startDate": "2026-05-01"}';
    const result = extractEventsFromRawJsonLd(json, sourceConfig);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].title, 'Biz Conf');
  });
});
