/**
 * TSCG Hard Benchmark Test Cases - Unit Tests
 * Validates structure, uniqueness, and correctness of HARD_TESTS.
 */

import { describe, it, expect } from 'vitest';
import { HARD_TESTS } from '../src/benchmark/hard-cases.js';
import { CORE_TESTS } from '../src/benchmark/test-cases.js';

describe('hard test cases', () => {
  it('has exactly 25 tests', () => {
    expect(HARD_TESTS).toHaveLength(25);
  });

  it('has correct category distribution', () => {
    const counts: Record<string, number> = {};
    for (const t of HARD_TESTS) {
      counts[t.category] = (counts[t.category] || 0) + 1;
    }
    expect(counts['MultiConstraint_Hard']).toBe(6);
    expect(counts['AmbiguousMath']).toBe(5);
    expect(counts['PrecisionExtraction']).toBe(5);
    expect(counts['FormatCritical']).toBe(5);
    expect(counts['LongDependency']).toBe(4);
  });

  it('has no duplicate IDs within HARD_TESTS', () => {
    const ids = HARD_TESTS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no ID collisions with CORE_TESTS', () => {
    const coreIds = new Set(CORE_TESTS.map((t) => t.id));
    for (const t of HARD_TESTS) {
      expect(coreIds.has(t.id)).toBe(false);
    }
  });

  it('all tests have required fields', () => {
    for (const t of HARD_TESTS) {
      expect(t.id).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.expected).toBeTruthy();
      expect(t.natural).toBeTruthy();
      expect(t.tscg).toBeTruthy();
      expect(typeof t.check).toBe('function');
    }
  });

  it('all checkers accept expected answers', () => {
    for (const t of HARD_TESTS) {
      const result = t.check(t.expected);
      if (!result) {
        // Provide useful diagnostic on failure
        console.warn(
          `Checker for ${t.id} (${t.name}) rejected expected value: "${t.expected}"`
        );
      }
      expect(result).toBe(true);
    }
  });

  it('TSCG prompts start with constraint bracket', () => {
    for (const t of HARD_TESTS) {
      expect(t.tscg).toMatch(/^\[(ANSWER|CLASSIFY):/);
    }
  });

  it('natural prompts are English sentences (length > 20)', () => {
    for (const t of HARD_TESTS) {
      expect(t.natural.length).toBeGreaterThan(20);
    }
  });

  it('IDs follow naming convention', () => {
    const expectedIds = [
      // MultiConstraint_Hard: mc-h1 through mc-h6
      'mc-h1', 'mc-h2', 'mc-h3', 'mc-h4', 'mc-h5', 'mc-h6',
      // AmbiguousMath: am1 through am5
      'am1', 'am2', 'am3', 'am4', 'am5',
      // PrecisionExtraction: pe1 through pe5
      'pe1', 'pe2', 'pe3', 'pe4', 'pe5',
      // FormatCritical: fc1 through fc5
      'fc1', 'fc2', 'fc3', 'fc4', 'fc5',
      // LongDependency: ld1 through ld4
      'ld1', 'ld2', 'ld3', 'ld4',
    ];
    const actualIds = HARD_TESTS.map((t) => t.id);
    expect(actualIds).toEqual(expectedIds);
  });
});
