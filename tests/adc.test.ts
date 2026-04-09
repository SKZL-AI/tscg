/**
 * ADC (Adaptive Density Control) Tests
 * Validates the 3-tier filler removal: REMOVE_ALWAYS, REMOVE_IF_REDUNDANT, KEEP_AS_AMPLIFIER
 */

import { describe, it, expect } from 'vitest';
import {
  applyADC,
  ADC_REMOVE_ALWAYS,
  ADC_REMOVE_IF_REDUNDANT,
  ADC_KEEP_AS_AMPLIFIER,
} from '../src/optimizer/transforms.js';

// === Tier 1: REMOVE_ALWAYS ===

describe('ADC REMOVE_ALWAYS', () => {
  it('removes "please" from the prompt', () => {
    const result = applyADC('Please summarize the document');
    expect(result).toBe('Summarize the document');
  });

  it('removes "kindly" from the prompt', () => {
    const result = applyADC('Kindly provide the answer');
    expect(result).toBe('Provide the answer');
  });

  it('removes "could you" from the prompt', () => {
    const result = applyADC('Could you explain this concept');
    expect(result).toBe('Explain this concept');
  });

  it('removes "I would like" from the prompt', () => {
    const result = applyADC('I would like a summary of the report');
    expect(result).toBe('A summary of the report');
  });

  it('removes "I want you to" from the prompt', () => {
    const result = applyADC('I want you to list the top 5 items');
    expect(result).toBe('List the top 5 items');
  });

  it('removes "Can you" from the prompt', () => {
    const result = applyADC('Can you translate this sentence');
    expect(result).toBe('Translate this sentence');
  });

  it('removes multiple REMOVE_ALWAYS words in one prompt', () => {
    const result = applyADC('Please could you kindly help me');
    expect(result).not.toMatch(/\bplease\b/i);
    expect(result).not.toMatch(/\bkindly\b/i);
    expect(result).not.toMatch(/\bcould you\b/i);
  });

  it('exports the ADC_REMOVE_ALWAYS constant with all expected entries', () => {
    expect(ADC_REMOVE_ALWAYS).toContain('please');
    expect(ADC_REMOVE_ALWAYS).toContain('kindly');
    expect(ADC_REMOVE_ALWAYS).toContain('could you');
    expect(ADC_REMOVE_ALWAYS).toContain('I would like');
    expect(ADC_REMOVE_ALWAYS).toContain('I want you to');
    expect(ADC_REMOVE_ALWAYS).toContain('Can you');
    expect(ADC_REMOVE_ALWAYS.length).toBe(6);
  });
});

// === Tier 3: KEEP_AS_AMPLIFIER ===

describe('ADC KEEP_AS_AMPLIFIER', () => {
  it('preserves "exactly" in the output', () => {
    const result = applyADC('Return exactly 3 items');
    expect(result).toContain('exactly');
  });

  it('preserves "must" in the output', () => {
    const result = applyADC('The output must be JSON');
    expect(result).toContain('must');
  });

  it('preserves "never" in the output', () => {
    const result = applyADC('Never include personal data');
    expect(result.toLowerCase()).toContain('never');
  });

  it('preserves "critical" in the output', () => {
    const result = applyADC('This is critical for the system');
    expect(result).toContain('critical');
  });

  it('preserves "required" in the output', () => {
    const result = applyADC('A valid email is required');
    expect(result).toContain('required');
  });

  it('preserves "strictly" in the output', () => {
    const result = applyADC('Follow the format strictly');
    expect(result).toContain('strictly');
  });

  it('preserves "only" in the output', () => {
    const result = applyADC('Return only the first paragraph');
    expect(result).toContain('only');
  });

  it('preserves amplifiers even when REMOVE_ALWAYS words are also present', () => {
    const result = applyADC('Please return exactly 3 items and never skip any');
    expect(result).not.toMatch(/\bplease\b/i);
    expect(result).toContain('exactly');
    expect(result).toContain('never');
  });

  it('exports the ADC_KEEP_AS_AMPLIFIER constant with all expected entries', () => {
    expect(ADC_KEEP_AS_AMPLIFIER).toContain('exactly');
    expect(ADC_KEEP_AS_AMPLIFIER).toContain('must');
    expect(ADC_KEEP_AS_AMPLIFIER).toContain('never');
    expect(ADC_KEEP_AS_AMPLIFIER).toContain('critical');
    expect(ADC_KEEP_AS_AMPLIFIER).toContain('required');
    expect(ADC_KEEP_AS_AMPLIFIER).toContain('strictly');
    expect(ADC_KEEP_AS_AMPLIFIER).toContain('only');
    expect(ADC_KEEP_AS_AMPLIFIER.length).toBe(7);
  });
});

// === Tier 2: REMOVE_IF_REDUNDANT ===

describe('ADC REMOVE_IF_REDUNDANT', () => {
  it('removes "very" before an adjective', () => {
    const result = applyADC('This is a very important task');
    expect(result).not.toMatch(/\bvery\b/i);
    expect(result).toContain('important');
  });

  it('removes "really" before an adjective', () => {
    const result = applyADC('This is really difficult to solve');
    expect(result).not.toMatch(/\breally\b/i);
    expect(result).toContain('difficult');
  });

  it('removes "quite" before an adjective', () => {
    const result = applyADC('The answer is quite simple');
    expect(result).not.toMatch(/\bquite\b/i);
    expect(result).toContain('simple');
  });

  it('keeps "just" before a verb (meaningful usage)', () => {
    const result = applyADC('Just run the tests');
    expect(result).toMatch(/\bjust run\b/i);
  });

  it('keeps "actually" before a verb (meaningful usage)', () => {
    const result = applyADC('Actually do the thing');
    expect(result).toMatch(/\bactually do\b/i);
  });

  it('removes "very" before "quickly" (adverb)', () => {
    const result = applyADC('Respond very quickly');
    expect(result).not.toMatch(/\bvery\b/i);
    expect(result).toContain('quickly');
  });

  it('exports the ADC_REMOVE_IF_REDUNDANT constant with all expected entries', () => {
    expect(ADC_REMOVE_IF_REDUNDANT).toContain('very');
    expect(ADC_REMOVE_IF_REDUNDANT).toContain('really');
    expect(ADC_REMOVE_IF_REDUNDANT).toContain('quite');
    expect(ADC_REMOVE_IF_REDUNDANT).toContain('actually');
    expect(ADC_REMOVE_IF_REDUNDANT).toContain('just');
    expect(ADC_REMOVE_IF_REDUNDANT.length).toBe(5);
  });
});

// === Edge Cases ===

describe('ADC edge cases', () => {
  it('returns empty string for empty input', () => {
    const result = applyADC('');
    expect(result).toBe('');
  });

  it('passes through strings with no filler words unchanged', () => {
    const input = 'List the top 5 programming languages by popularity';
    const result = applyADC(input);
    expect(result).toBe(input);
  });

  it('passes through a purely technical prompt unchanged', () => {
    const input = 'SELECT id, name FROM users WHERE active = true';
    const result = applyADC(input);
    expect(result).toBe(input);
  });

  it('handles a prompt with all three tiers combined', () => {
    const result = applyADC(
      'Please provide a very detailed and strictly formatted report that must include critical metrics'
    );
    // Tier 1: "please" removed
    expect(result).not.toMatch(/\bplease\b/i);
    // Tier 2: "very" before "detailed" (adjective) removed
    expect(result).not.toMatch(/\bvery\b/i);
    // Tier 3: "strictly", "must", "critical" preserved
    expect(result).toContain('strictly');
    expect(result).toContain('must');
    expect(result).toContain('critical');
  });

  it('capitalizes first letter after filler removal', () => {
    const result = applyADC('please summarize');
    expect(result[0]).toBe('S');
  });
});
