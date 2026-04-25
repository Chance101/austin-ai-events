import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { sanitizeClassification, VALID_AUDIENCE_TYPES, VALID_TECHNICAL_LEVELS } from './claude.js';

// Silence console.warn during tests — we exercise paths that intentionally warn.
mock.method(console, 'warn', () => {});

describe('sanitizeClassification', () => {

  describe('audienceType whitelist', () => {
    it('keeps valid values unchanged', () => {
      const out = sanitizeClassification({
        audienceType: ['developers', 'students'],
        technicalLevel: 'intermediate',
      });
      assert.deepStrictEqual(out.audienceType, ['developers', 'students']);
    });

    it('drops invalid values and keeps valid ones', () => {
      const out = sanitizeClassification({
        audienceType: ['developers', 'entrepreneurs', 'business'],
        technicalLevel: 'all-levels',
      });
      assert.deepStrictEqual(out.audienceType, ['developers', 'business']);
    });

    it('falls back to ["general"] when all values are invalid', () => {
      const out = sanitizeClassification({
        audienceType: ['entrepreneurs', 'founders', 'executives'],
        technicalLevel: 'all-levels',
      });
      assert.deepStrictEqual(out.audienceType, ['general']);
    });

    it('falls back to ["general"] when audienceType is missing', () => {
      const out = sanitizeClassification({ technicalLevel: 'all-levels' });
      assert.deepStrictEqual(out.audienceType, ['general']);
    });

    it('falls back to ["general"] when audienceType is not an array', () => {
      const out = sanitizeClassification({
        audienceType: 'developers',
        technicalLevel: 'all-levels',
      });
      assert.deepStrictEqual(out.audienceType, ['general']);
    });
  });

  describe('technicalLevel whitelist', () => {
    it('keeps valid values unchanged', () => {
      for (const level of VALID_TECHNICAL_LEVELS) {
        const out = sanitizeClassification({ audienceType: ['general'], technicalLevel: level });
        assert.strictEqual(out.technicalLevel, level);
      }
    });

    it('coerces invalid values to "all-levels"', () => {
      const out = sanitizeClassification({
        audienceType: ['general'],
        technicalLevel: 'expert',
      });
      assert.strictEqual(out.technicalLevel, 'all-levels');
    });

    it('coerces missing values to "all-levels"', () => {
      const out = sanitizeClassification({ audienceType: ['general'] });
      assert.strictEqual(out.technicalLevel, 'all-levels');
    });
  });

  describe('isFree normalization', () => {
    it('preserves true', () => {
      const out = sanitizeClassification({ audienceType: ['general'], technicalLevel: 'all-levels', isFree: true });
      assert.strictEqual(out.isFree, true);
    });

    it('preserves false', () => {
      const out = sanitizeClassification({ audienceType: ['general'], technicalLevel: 'all-levels', isFree: false });
      assert.strictEqual(out.isFree, false);
    });

    it('coerces non-boolean to null', () => {
      const out = sanitizeClassification({ audienceType: ['general'], technicalLevel: 'all-levels', isFree: 'unknown' });
      assert.strictEqual(out.isFree, null);
    });

    it('preserves null', () => {
      const out = sanitizeClassification({ audienceType: ['general'], technicalLevel: 'all-levels', isFree: null });
      assert.strictEqual(out.isFree, null);
    });
  });

  describe('summary and reasoning', () => {
    it('preserves string summary', () => {
      const out = sanitizeClassification({
        audienceType: ['general'],
        technicalLevel: 'all-levels',
        summary: 'A talk about LLMs.',
      });
      assert.strictEqual(out.summary, 'A talk about LLMs.');
    });

    it('coerces non-string summary to null', () => {
      const out = sanitizeClassification({
        audienceType: ['general'],
        technicalLevel: 'all-levels',
        summary: { foo: 'bar' },
      });
      assert.strictEqual(out.summary, null);
    });
  });

  describe('null/undefined input', () => {
    it('handles null input safely', () => {
      const out = sanitizeClassification(null);
      assert.deepStrictEqual(out.audienceType, ['general']);
      assert.strictEqual(out.technicalLevel, 'all-levels');
      assert.strictEqual(out.isFree, null);
    });

    it('handles undefined input safely', () => {
      const out = sanitizeClassification(undefined);
      assert.deepStrictEqual(out.audienceType, ['general']);
      assert.strictEqual(out.technicalLevel, 'all-levels');
    });
  });

  describe('regression: the entrepreneurs incident', () => {
    it('handles the exact failure mode from action item 257340c2', () => {
      const out = sanitizeClassification({
        audienceType: ['entrepreneurs'],
        technicalLevel: 'all-levels',
        isFree: null,
        summary: 'A pitch event for founders.',
      });
      // Must produce a value safely insertable into the audience_type[] enum column.
      for (const v of out.audienceType) {
        assert.ok(VALID_AUDIENCE_TYPES.includes(v), `${v} is not a valid audience_type enum value`);
      }
    });
  });
});
