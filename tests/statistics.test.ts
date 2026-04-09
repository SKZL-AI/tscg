import { describe, it, expect } from 'vitest';
import { wilsonCI, mcnemarExact, cohensH, fmtPct, fmtCI } from '../src/core/statistics.js';

describe('wilsonCI', () => {
  it('returns [0,0] for n=0', () => {
    expect(wilsonCI(0, 0)).toEqual([0, 0]);
  });

  it('returns correct CI for 50% accuracy', () => {
    const [lo, hi] = wilsonCI(10, 20);
    expect(lo).toBeGreaterThan(0.27);
    expect(lo).toBeLessThan(0.30);
    expect(hi).toBeGreaterThan(0.70);
    expect(hi).toBeLessThan(0.73);
  });

  it('returns correct CI for 100% accuracy', () => {
    const [lo, hi] = wilsonCI(20, 20);
    expect(lo).toBeGreaterThan(0.80);
    expect(hi).toBeCloseTo(1, 10);
  });

  it('returns correct CI for 0% accuracy', () => {
    const [lo, hi] = wilsonCI(0, 20);
    expect(lo).toBe(0);
    expect(hi).toBeLessThan(0.20);
  });
});

describe('mcnemarExact', () => {
  it('returns 1.0 for n=0', () => {
    expect(mcnemarExact(0, 0)).toBe(1.0);
  });

  it('returns 1.0 for equal b and c', () => {
    expect(mcnemarExact(5, 5)).toBeCloseTo(1.0, 1);
  });

  it('returns low p-value for large difference', () => {
    const p = mcnemarExact(10, 0);
    expect(p).toBeLessThan(0.01);
  });

  it('returns non-significant for small difference', () => {
    const p = mcnemarExact(3, 2);
    expect(p).toBeGreaterThan(0.05);
  });
});

describe('cohensH', () => {
  it('returns 0 for equal proportions', () => {
    expect(cohensH(0.5, 0.5)).toBeCloseTo(0, 5);
  });

  it('returns positive for p1 > p2', () => {
    expect(cohensH(0.8, 0.5)).toBeGreaterThan(0);
  });

  it('returns negative for p1 < p2', () => {
    expect(cohensH(0.3, 0.7)).toBeLessThan(0);
  });
});

describe('formatting', () => {
  it('fmtPct formats correctly', () => {
    expect(fmtPct(0.857)).toBe('85.7%');
    expect(fmtPct(1)).toBe('100.0%');
    expect(fmtPct(0)).toBe('0.0%');
  });

  it('fmtCI formats correctly', () => {
    expect(fmtCI([0.5, 0.8])).toBe('[50.0-80.0]');
  });
});
