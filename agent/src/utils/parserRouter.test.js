import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeToParser, getKnownPlatforms } from './parserRouter.js';

test('routeToParser — lu.ma URLs route to luma parser', () => {
  assert.equal(routeToParser('https://lu.ma/austin'), 'luma');
  assert.equal(routeToParser('https://lu.ma/aitx'), 'luma');
  assert.equal(routeToParser('https://lu.ma/some-event-slug'), 'luma');
  assert.equal(routeToParser('https://lu.ma/ai-tinkerers'), 'luma');
});

test('routeToParser — luma.com URLs route to luma parser', () => {
  assert.equal(routeToParser('https://luma.com/austin'), 'luma');
  assert.equal(routeToParser('https://www.luma.com/austin'), 'luma');
  assert.equal(routeToParser('https://luma.com/some-calendar'), 'luma');
});

test('routeToParser — meetup.com URLs route to meetup parser', () => {
  assert.equal(routeToParser('https://www.meetup.com/austin-ai-group'), 'meetup');
  assert.equal(routeToParser('https://meetup.com/austin-langchain-ai-group/events/'), 'meetup');
  assert.equal(routeToParser('https://www.meetup.com/marketing-automation-ai/events/'), 'meetup');
});

test('routeToParser — non-platform URLs return null', () => {
  assert.equal(routeToParser('https://austin-ai.org/events'), null);
  assert.equal(routeToParser('https://info.capitalfactory.com/ic-events'), null);
  assert.equal(routeToParser('https://www.austinforum.org/events'), null);
  assert.equal(routeToParser('https://ai.utexas.edu/events'), null);
  assert.equal(routeToParser('https://example.com'), null);
});

test('routeToParser — Eventbrite URLs return null (no dedicated parser)', () => {
  assert.equal(routeToParser('https://www.eventbrite.com/e/some-event-12345'), null);
  assert.equal(routeToParser('https://eventbrite.com/o/austin-organizer'), null);
});

test('routeToParser — subdomain handling', () => {
  assert.equal(routeToParser('https://sub.lu.ma/austin'), null,
    'strict hostname match — subdomains of lu.ma are not the canonical platform');
  assert.equal(routeToParser('https://events.meetup.com/group'), null,
    'only canonical meetup.com hostname routes to meetup parser');
});

test('routeToParser — case insensitive hostname', () => {
  assert.equal(routeToParser('https://LU.MA/austin'), 'luma');
  assert.equal(routeToParser('https://Meetup.com/austin-ai'), 'meetup');
});

test('routeToParser — handles invalid input gracefully', () => {
  assert.equal(routeToParser(''), null);
  assert.equal(routeToParser(null), null);
  assert.equal(routeToParser(undefined), null);
  assert.equal(routeToParser('not a url'), null);
  assert.equal(routeToParser(42), null);
});

test('getKnownPlatforms — returns the platform registry', () => {
  const platforms = getKnownPlatforms();
  assert.ok(Array.isArray(platforms));
  assert.ok(platforms.length >= 3);
  assert.ok(platforms.some(p => p.scraper === 'luma'));
  assert.ok(platforms.some(p => p.scraper === 'meetup'));
});
