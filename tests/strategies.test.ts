import { describe, it, expect } from 'vitest';
import { STRATEGIES, getStrategy, getStrategyNames } from '../src/core/strategies.js';
import { CORE_TESTS } from '../src/benchmark/test-cases.js';

describe('strategies', () => {
  it('has 6 strategies', () => {
    expect(STRATEGIES).toHaveLength(6);
  });

  it('getStrategyNames returns all names', () => {
    const names = getStrategyNames();
    expect(names).toContain('natural');
    expect(names).toContain('repetition');
    expect(names).toContain('tscg');
    expect(names).toContain('tscg+sad');
    expect(names).toContain('tscg+rep');
    expect(names).toContain('ccp');
  });

  it('getStrategy returns correct strategy', () => {
    const nat = getStrategy('natural');
    expect(nat).toBeDefined();
    expect(nat!.name).toBe('natural');
  });

  it('getStrategy returns undefined for unknown', () => {
    expect(getStrategy('unknown')).toBeUndefined();
  });

  const sampleTest = CORE_TESTS[0]; // f1: Capital

  it('natural strategy returns NL prompt', () => {
    const nat = getStrategy('natural')!;
    expect(nat.transform(sampleTest)).toBe(sampleTest.natural);
  });

  it('repetition strategy doubles the prompt', () => {
    const rep = getStrategy('repetition')!;
    const result = rep.transform(sampleTest);
    expect(result).toContain(sampleTest.natural);
    expect(result.indexOf(sampleTest.natural)).not.toBe(result.lastIndexOf(sampleTest.natural));
  });

  it('tscg strategy returns TSCG prompt', () => {
    const tscg = getStrategy('tscg')!;
    expect(tscg.transform(sampleTest)).toBe(sampleTest.tscg);
  });

  it('tscg+sad strategy adds ANCHOR', () => {
    const sad = getStrategy('tscg+sad')!;
    const result = sad.transform(sampleTest);
    expect(result).toContain('[ANCHOR:');
    expect(result).toContain(sampleTest.tscg);
  });

  it('tscg+rep strategy doubles TSCG prompt', () => {
    const rep = getStrategy('tscg+rep')!;
    const result = rep.transform(sampleTest);
    expect(result).toContain(sampleTest.tscg);
    const parts = result.split(sampleTest.tscg);
    expect(parts.length).toBe(3); // before, between, after
  });

  it('ccp strategy adds closure block', () => {
    const ccp = getStrategy('ccp')!;
    const result = ccp.transform(sampleTest);
    expect(result).toContain(sampleTest.natural);
    expect(result).toContain('###<CC>');
    expect(result).toContain('###</CC>');
    expect(result).toContain('OP=EMIT_DIRECT');
  });

  it('all strategies produce non-empty output', () => {
    for (const strategy of STRATEGIES) {
      for (const test of CORE_TESTS) {
        const result = strategy.transform(test);
        expect(result.length).toBeGreaterThan(0);
      }
    }
  });
});
