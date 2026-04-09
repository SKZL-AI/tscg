/**
 * Phase 4 Transform Tests
 * Tests for TPD (Tokenizer-Profiled Delimiters), ICoT (Implicit Chain-of-Thought Priming),
 * and improved CAS multi-factor fragility scoring.
 */

import { describe, it, expect } from 'vitest';
import { applyTPD, applyICoT } from '../src/optimizer/transforms.js';
import { computeMultiFactorFragility } from '../src/optimizer/analyzer.js';

// === TPD — Tokenizer-Profiled Delimiters ===

describe('TPD applyTPD', () => {
  describe('claude profile (default)', () => {
    it('replaces " -> " with the arrow delimiter', () => {
      const result = applyTPD('input -> output', 'claude');
      expect(result).toBe('input\u2192output');
    });

    it('replaces " => " with the arrow delimiter', () => {
      const result = applyTPD('input => output', 'claude');
      expect(result).toBe('input\u2192output');
    });

    it('replaces " | " with pipe delimiter', () => {
      const result = applyTPD('option1 | option2', 'claude');
      expect(result).toBe('option1|option2');
    });

    it('replaces " : " with dot delimiter', () => {
      const result = applyTPD('key : value', 'claude');
      expect(result).toBe('key\u00B7value');
    });

    it('handles multiple replacements in one string', () => {
      const result = applyTPD('A -> B | C => D', 'claude');
      expect(result).toContain('\u2192');
      expect(result).toContain('|');
      expect(result).not.toContain(' -> ');
      expect(result).not.toContain(' => ');
    });

    it('uses claude profile by default when no profile specified', () => {
      const result = applyTPD('input -> output');
      expect(result).toBe('input\u2192output');
    });
  });

  describe('gpt4o profile', () => {
    it('replaces " -> " with arrow delimiter', () => {
      const result = applyTPD('input -> output', 'gpt4o');
      expect(result).toContain('\u2192');
    });

    it('replaces " | " with pipe delimiter', () => {
      const result = applyTPD('A | B', 'gpt4o');
      expect(result).toBe('A|B');
    });
  });

  describe('llama3 profile', () => {
    it('replaces " -> " with arrow delimiter', () => {
      const result = applyTPD('input -> output', 'llama3');
      expect(result).toContain('\u2192');
    });

    it('replaces " | " with pipe delimiter', () => {
      const result = applyTPD('A | B', 'llama3');
      expect(result).toBe('A|B');
    });
  });

  describe('universal profile', () => {
    it('replaces " -> " with ASCII hyphen', () => {
      const result = applyTPD('input -> output', 'universal');
      expect(result).toBe('input-output');
    });

    it('replaces " => " with ASCII hyphen', () => {
      const result = applyTPD('input => output', 'universal');
      expect(result).toBe('input-output');
    });

    it('replaces " | " with pipe', () => {
      const result = applyTPD('A | B', 'universal');
      expect(result).toBe('A|B');
    });

    it('replaces " : " with colon', () => {
      const result = applyTPD('key : value', 'universal');
      expect(result).toBe('key:value');
    });

    it('uses only ASCII characters', () => {
      const result = applyTPD('A -> B | C : D => E', 'universal');
      // Should contain no non-ASCII characters
      expect(result).toMatch(/^[\x00-\x7F]+$/);
    });
  });

  describe('edge cases', () => {
    it('returns empty string unchanged', () => {
      expect(applyTPD('')).toBe('');
    });

    it('returns text without delimiters unchanged', () => {
      const input = 'Hello world';
      expect(applyTPD(input)).toBe(input);
    });

    it('does not break bracket expressions like [ANSWER:text]', () => {
      const input = '[ANSWER:text] some prompt';
      const result = applyTPD(input);
      expect(result).toContain('[ANSWER:text]');
    });
  });
});

// === ICoT — Implicit Chain-of-Thought Priming ===

describe('ICoT applyICoT', () => {
  describe('reasoning prompts', () => {
    it('appends primer for reasoning promptType', () => {
      const result = applyICoT('Calculate 5 + 3', 'reasoning');
      expect(result).toBe('Calculate 5 + 3 \u2192 steps:');
    });

    it('appends primer for math promptType', () => {
      const result = applyICoT('What is 12 * 4', 'math');
      expect(result).toBe('What is 12 * 4 \u2192 steps:');
    });

    it('appends primer for mixed type containing reasoning', () => {
      const result = applyICoT('Solve this', 'complex_reasoning');
      expect(result).toBe('Solve this \u2192 steps:');
    });

    it('is case-insensitive for promptType', () => {
      const result = applyICoT('Calculate 5 + 3', 'REASONING');
      expect(result).toBe('Calculate 5 + 3 \u2192 steps:');
    });
  });

  describe('non-reasoning prompts', () => {
    it('leaves factual prompts unchanged', () => {
      const input = 'What is the capital of France';
      expect(applyICoT(input, 'factual')).toBe(input);
    });

    it('leaves classification prompts unchanged', () => {
      const input = 'Classify this as positive or negative';
      expect(applyICoT(input, 'classification')).toBe(input);
    });

    it('leaves generation prompts unchanged', () => {
      const input = 'Write a poem about the sea';
      expect(applyICoT(input, 'generation')).toBe(input);
    });

    it('leaves instruction prompts unchanged', () => {
      const input = 'List the top 5 languages';
      expect(applyICoT(input, 'instruction')).toBe(input);
    });
  });

  describe('existing CoT cues', () => {
    it('does not append primer if text contains "step"', () => {
      const input = 'Solve this step by step: 5 + 3';
      const result = applyICoT(input, 'reasoning');
      expect(result).toBe(input);
    });

    it('does not append primer if text contains "think"', () => {
      const input = 'Think about this: what is 5 + 3';
      const result = applyICoT(input, 'reasoning');
      expect(result).toBe(input);
    });

    it('does not append primer if text contains "chain"', () => {
      const input = 'Use chain of thought for 5 + 3';
      const result = applyICoT(input, 'reasoning');
      expect(result).toBe(input);
    });

    it('does not append primer if text contains double arrow', () => {
      const input = 'Calculate 5 + 3 \u2192\u2192';
      const result = applyICoT(input, 'reasoning');
      expect(result).toBe(input);
    });
  });
});

// === Multi-Factor Fragility Scoring ===

describe('computeMultiFactorFragility', () => {
  describe('uniqueness factor', () => {
    it('scores higher for unique params', () => {
      const unique = computeMultiFactorFragility('42', ['42', '100', '200'], ['calculate']);
      const repeated = computeMultiFactorFragility('42', ['42', '42', '200'], ['calculate']);
      expect(unique).toBeGreaterThan(repeated);
    });

    it('gives 1.0 uniqueness when param appears once', () => {
      // Unique number "42" with query relevance, type=number(1.0), length<=3(0.8)
      // uniqueness=1.0*0.3 + relevance*0.3 + type*0.2 + length*0.2
      const score = computeMultiFactorFragility('42', ['42', '100'], ['42']);
      // uniqueness=1.0, relevance=1.0, type=1.0, length=0.8
      // = 0.3 + 0.3 + 0.2 + 0.16 = 0.96
      expect(score).toBeCloseTo(0.96, 2);
    });

    it('gives 0.3 uniqueness when param is repeated', () => {
      const score = computeMultiFactorFragility('42', ['42', '42'], ['42']);
      // uniqueness=0.3, relevance=1.0, type=1.0, length=0.8
      // = 0.09 + 0.3 + 0.2 + 0.16 = 0.75
      expect(score).toBeCloseTo(0.75, 2);
    });
  });

  describe('query relevance factor', () => {
    it('scores higher when param appears in query tokens', () => {
      const relevant = computeMultiFactorFragility('Paris', ['Paris'], ['Paris']);
      const irrelevant = computeMultiFactorFragility('Paris', ['Paris'], ['London']);
      expect(relevant).toBeGreaterThan(irrelevant);
    });

    it('gives 1.0 relevance when param matches a query token', () => {
      const score = computeMultiFactorFragility('Paris', ['Paris'], ['Paris']);
      // uniqueness=1.0, relevance=1.0, type=0.8(proper noun), length=0.5(5 chars)
      // = 0.3 + 0.3 + 0.16 + 0.1 = 0.86
      expect(score).toBeCloseTo(0.86, 2);
    });

    it('gives 0.0 relevance when param not in query tokens', () => {
      const score = computeMultiFactorFragility('Paris', ['Paris'], ['London']);
      // uniqueness=1.0, relevance=0.0, type=0.8, length=0.5
      // = 0.3 + 0.0 + 0.16 + 0.1 = 0.56
      expect(score).toBeCloseTo(0.56, 2);
    });
  });

  describe('type penalty factor', () => {
    it('gives 1.0 for numbers', () => {
      const number = computeMultiFactorFragility('42', ['42'], []);
      const word = computeMultiFactorFragility('hello', ['hello'], []);
      expect(number).toBeGreaterThan(word);
    });

    it('gives 0.8 for proper nouns (capitalized)', () => {
      const proper = computeMultiFactorFragility('Paris', ['Paris'], []);
      const common = computeMultiFactorFragility('hello', ['hello'], []);
      expect(proper).toBeGreaterThan(common);
    });

    it('gives 0.5 for quoted strings', () => {
      const quoted = computeMultiFactorFragility('"hello world"', ['"hello world"'], []);
      const common = computeMultiFactorFragility('hello', ['hello'], []);
      expect(quoted).toBeGreaterThan(common);
    });

    it('gives 0.3 for common words', () => {
      const score = computeMultiFactorFragility('hello', ['hello'], []);
      // uniqueness=1.0, relevance=0.0, type=0.3, length=0.5
      // = 0.3 + 0.0 + 0.06 + 0.1 = 0.46
      expect(score).toBeCloseTo(0.46, 2);
    });
  });

  describe('length penalty factor', () => {
    it('gives 1.0 for single character params', () => {
      const short = computeMultiFactorFragility('X', ['X'], []);
      const long = computeMultiFactorFragility('extraordinary', ['extraordinary'], []);
      expect(short).toBeGreaterThan(long);
    });

    it('gives 0.3 for params longer than 10 chars', () => {
      const score = computeMultiFactorFragility('longparamvalue', ['longparamvalue'], []);
      // uniqueness=1.0, relevance=0.0, type=0.3, length=0.3
      // = 0.3 + 0.0 + 0.06 + 0.06 = 0.42
      expect(score).toBeCloseTo(0.42, 2);
    });

    it('gives 0.8 for 2-3 char params', () => {
      const score = computeMultiFactorFragility('ab', ['ab'], []);
      // uniqueness=1.0, relevance=0.0, type=0.3, length=0.8
      // = 0.3 + 0.0 + 0.06 + 0.16 = 0.52
      expect(score).toBeCloseTo(0.52, 2);
    });
  });

  describe('combined scoring', () => {
    it('scores range is between 0 and 1', () => {
      const score = computeMultiFactorFragility('test', ['test'], ['test']);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('maximum score for unique, relevant, short number', () => {
      // Single digit number, unique, in query
      const score = computeMultiFactorFragility('5', ['5'], ['5']);
      // uniqueness=1.0, relevance=1.0, type=1.0(number), length=1.0(1 char)
      // = 0.3 + 0.3 + 0.2 + 0.2 = 1.0
      expect(score).toBeCloseTo(1.0, 2);
    });

    it('minimum score for repeated, irrelevant, long common word', () => {
      const score = computeMultiFactorFragility(
        'commonlongword',
        ['commonlongword', 'commonlongword'],
        ['unrelated'],
      );
      // uniqueness=0.3, relevance=0.0, type=0.3, length=0.3
      // = 0.09 + 0.0 + 0.06 + 0.06 = 0.21
      expect(score).toBeCloseTo(0.21, 2);
    });
  });
});
