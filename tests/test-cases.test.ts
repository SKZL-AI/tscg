import { describe, it, expect } from 'vitest';
import { getAllTests, CORE_TESTS, LONG_CONTEXT_TESTS } from '../src/benchmark/test-cases.js';

describe('test cases', () => {
  it('has 19 core tests', () => {
    expect(CORE_TESTS).toHaveLength(19);
  });

  it('has 3 long-context tests', () => {
    expect(LONG_CONTEXT_TESTS).toHaveLength(3);
  });

  it('getAllTests returns core tests by default', () => {
    const tests = getAllTests(false);
    expect(tests).toHaveLength(19);
  });

  it('getAllTests with long context returns more tests', () => {
    const tests = getAllTests(true);
    expect(tests.length).toBeGreaterThan(20);
  });

  it('all core tests have required fields', () => {
    for (const test of CORE_TESTS) {
      expect(test.id).toBeTruthy();
      expect(test.category).toBeTruthy();
      expect(test.name).toBeTruthy();
      expect(test.expected).toBeTruthy();
      expect(test.natural).toBeTruthy();
      expect(test.tscg).toBeTruthy();
      expect(typeof test.check).toBe('function');
    }
  });

  it('all test IDs are unique', () => {
    const ids = getAllTests(true).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('check functions work for expected values', () => {
    // Test a few representative checks
    const capital = CORE_TESTS.find((t) => t.id === 'f1')!;
    expect(capital.check('Canberra')).toBe(true);
    expect(capital.check('The capital is Canberra')).toBe(true);
    expect(capital.check('Sydney')).toBe(false);

    const math = CORE_TESTS.find((t) => t.id === 'r1')!;
    expect(math.check('63')).toBe(true);
    expect(math.check('The answer is 63 apples')).toBe(true);
    expect(math.check('64')).toBe(false);

    const sentiment = CORE_TESTS.find((t) => t.id === 'c1')!;
    expect(sentiment.check('negative')).toBe(true);
    expect(sentiment.check('Negative')).toBe(true);
    expect(sentiment.check('positive')).toBe(false);
  });

  it('covers expected categories', () => {
    const categories = [...new Set(CORE_TESTS.map((t) => t.category))];
    expect(categories).toContain('Factual');
    expect(categories).toContain('Reasoning');
    expect(categories).toContain('Classification');
    expect(categories).toContain('Extraction');
    expect(categories).toContain('OptFirst');
    expect(categories).toContain('Complex');
    expect(categories).toContain('NearDup');
  });

  it('TSCG prompts start with constraint bracket', () => {
    for (const test of CORE_TESTS) {
      // TSCG prompts should start with [ANSWER:...] or [CLASSIFY:...]
      expect(test.tscg).toMatch(/^\[(ANSWER|CLASSIFY):/);
    }
  });

  it('TSCG prompts are shorter than NL prompts for most non-NearDup tests', () => {
    const nonNearDup = CORE_TESTS.filter((t) => t.category !== 'NearDup' && t.category !== 'Extraction');
    let shorterCount = 0;
    for (const test of nonNearDup) {
      if (test.tscg.length < test.natural.length) shorterCount++;
    }
    // At least half of TSCG prompts should be shorter than NL
    expect(shorterCount).toBeGreaterThan(nonNearDup.length / 2);
  });
});
