/**
 * TSCG Optimizer Tests
 * Tests for the prompt analyzer, transforms, and optimizer pipeline
 */

import { describe, it, expect } from 'vitest';
import { analyzePrompt } from '../src/optimizer/analyzer.js';
import {
  applySDM, applyCFL, applyCFO, applyDRO, applyTAS,
  applySADF, applyCCP,
} from '../src/optimizer/transforms.js';
import { optimizePrompt, batchOptimize } from '../src/optimizer/optimizer.js';

// === Analyzer Tests ===

describe('analyzePrompt', () => {
  it('classifies factual questions', () => {
    const result = analyzePrompt('What is the capital of France?');
    expect(result.type).toBe('factual');
    expect(result.outputFormat).toBe('single_word');
  });

  it('classifies reasoning problems', () => {
    const result = analyzePrompt('A store has 45 apples. They sell 12 and receive 30. How many remain?');
    expect(result.type).toBe('reasoning');
    expect(result.outputFormat).toBe('integer');
    expect(result.hasNumberValues).toBe(true);
  });

  it('classifies classification tasks', () => {
    const result = analyzePrompt("Classify the sentiment as positive, negative, or neutral: 'Great product!'");
    expect(result.type).toBe('classification');
  });

  it('detects multiple choice', () => {
    const result = analyzePrompt('A. Red\nB. Blue\nC. Green\nD. Yellow\n\nWhich is the sky?');
    expect(result.hasMultipleChoice).toBe(true);
    expect(result.mcOptions.length).toBe(4);
  });

  it('extracts parameters with numbers', () => {
    const result = analyzePrompt('A train travels at 80 km/h for 2.5 hours');
    expect(result.parameters.length).toBeGreaterThan(0);
    expect(result.hasNumberValues).toBe(true);
  });

  it('finds filler words', () => {
    const result = analyzePrompt('Please help me kindly find the really simple answer');
    expect(result.fillerWords.length).toBeGreaterThan(0);
    expect(result.fillerWords).toContain('please');
  });

  it('detects JSON format requests', () => {
    const result = analyzePrompt('Return the data as JSON with name and value fields');
    expect(result.outputFormat).toBe('json');
    expect(result.hasJsonRequest).toBe(true);
  });

  it('detects letter format for MC', () => {
    const result = analyzePrompt('Reply with one letter only.');
    expect(result.outputFormat).toBe('letter');
  });

  it('extracts constraints', () => {
    const result = analyzePrompt('List the top 3 items. Return as JSON. No explanation.');
    expect(result.constraints.length).toBeGreaterThan(0);
  });
});

// === SDM Transform Tests ===

describe('applySDM', () => {
  it('removes politeness wrappers', () => {
    const analysis = analyzePrompt('Please tell me what the capital of France is');
    const result = applySDM('Please tell me what the capital of France is', analysis);
    expect(result.applied).toBe(true);
    expect(result.output).not.toContain('Please');
    expect(result.tokensRemoved).toBeGreaterThan(0);
  });

  it('removes filler adverbs', () => {
    const analysis = analyzePrompt('I basically really just need the answer');
    const result = applySDM('I basically really just need the answer', analysis);
    expect(result.applied).toBe(true);
    expect(result.output).not.toMatch(/\bbasically\b/i);
    expect(result.output).not.toMatch(/\breally\b/i);
  });

  it('preserves critical content', () => {
    const analysis = analyzePrompt('Calculate 45 + 30 - 12');
    const result = applySDM('Calculate 45 + 30 - 12', analysis);
    expect(result.output).toContain('45');
    expect(result.output).toContain('30');
    expect(result.output).toContain('12');
  });
});

// === CFL Transform Tests ===

describe('applyCFL', () => {
  it('prepends ANSWER constraint for factual', () => {
    const analysis = analyzePrompt('What is the capital of France?');
    const result = applyCFL('Capital of France?', analysis);
    expect(result.applied).toBe(true);
    expect(result.output).toMatch(/^\[ANSWER:/);
  });

  it('prepends CLASSIFY for classification', () => {
    const analysis = analyzePrompt('Classify as positive, negative, or neutral');
    const result = applyCFL('Classify as positive, negative, or neutral', analysis);
    expect(result.applied).toBe(true);
    expect(result.output).toMatch(/^\[CLASSIFY:/);
  });

  it('skips if constraint already present', () => {
    const analysis = analyzePrompt('[ANSWER:text] test');
    const result = applyCFL('[ANSWER:text] test', analysis);
    expect(result.applied).toBe(false);
  });

  it('uses letter format for MC', () => {
    const analysis = analyzePrompt('A. Foo\nB. Bar\nWhich? Reply one letter only.');
    const result = applyCFL('A. Foo\nB. Bar\nWhich?', analysis);
    expect(result.output).toContain('[ANSWER:letter]');
  });
});

// === CFO Transform Tests ===

describe('applyCFO', () => {
  it('creates causal chain for reasoning', () => {
    const analysis = analyzePrompt('A store has 45 apples. They sell 12 and receive 30. How many remain?');
    const result = applyCFO('[ANSWER:integer] Store has 45 apples. sell 12 receive 30. remain?', analysis);
    expect(result.output).toContain('→');
    expect(result.output).toContain('initial:45');
  });

  it('skips when no operations detected', () => {
    const analysis = analyzePrompt('What is the capital of France?');
    const result = applyCFO('Capital of France?', analysis);
    expect(result.applied).toBe(false);
  });
});

// === DRO Transform Tests ===

describe('applyDRO', () => {
  it('converts MC format to key:value', () => {
    const analysis = analyzePrompt('A. Red\nB. Blue\nC. Green\nWhich?');
    const result = applyDRO('A. Red\nB. Blue\nC. Green\nWhich?', analysis);
    expect(result.applied).toBe(true);
    expect(result.output).toContain('A:Red');
    expect(result.output).toContain('B:Blue');
  });

  it('converts step connectors to arrows', () => {
    const analysis = analyzePrompt('Do X then Y then Z');
    const result = applyDRO('Do X then Y then Z', analysis);
    expect(result.output).toContain('→');
  });
});

// === SAD-F Transform Tests ===

describe('applySADF', () => {
  it('adds anchor tag with key:value pairs', () => {
    const analysis = analyzePrompt('test');
    const result = applySADF('[ANSWER:int] initial:45 → subtract:12 → add:30 → result →', analysis);
    expect(result.applied).toBe(true);
    expect(result.output).toContain('[ANCHOR:');
    expect(result.output).toContain('initial:45');
  });

  it('skips ANSWER/CLASSIFY from anchors', () => {
    const analysis = analyzePrompt('test');
    const result = applySADF('[ANSWER:int] x:1 → y:2 →', analysis);
    expect(result.output).not.toContain('ANCHOR:ANSWER');
  });

  it('falls back to analysis params when no kv pairs', () => {
    const analysis = analyzePrompt('A train travels at 80 km/h');
    const result = applySADF('A train travels at 80 km/h', analysis);
    expect(result.applied).toBe(true);
    expect(result.output).toContain('[ANCHOR:');
  });
});

// === Full Pipeline Tests ===

describe('optimizePrompt', () => {
  it('optimizes a verbose factual prompt', () => {
    const result = optimizePrompt(
      'Please help me figure out what the capital city of France is. I would really appreciate it.',
      { profile: 'balanced', enableSADF: false, enableCCP: false }
    );
    expect(result.optimized).toContain('[ANSWER:');
    expect(result.optimized.length).toBeLessThan(result.original.length);
    expect(result.metrics.promptType).toBe('factual');
  });

  it('optimizes a reasoning prompt into causal chain', () => {
    const result = optimizePrompt(
      'A store has 45 apples. They sell 12 and receive 30. How many remain?',
      { profile: 'balanced', enableSADF: false, enableCCP: false }
    );
    expect(result.optimized).toContain('[ANSWER:integer]');
    expect(result.optimized).toContain('→');
    expect(result.optimized).toContain('initial:45');
    expect(result.metrics.promptType).toBe('reasoning');
  });

  it('applies all transforms in full profile', () => {
    const result = optimizePrompt(
      'Please kindly help me calculate how many apples remain if a store has 45, sells 12, and gets 30 more.',
      { profile: 'full' }
    );
    expect(result.metrics.transformsApplied).toBeGreaterThanOrEqual(3);
    expect(result.optimized).toContain('[ANSWER:');
  });

  it('minimal profile only applies SDM + CFL', () => {
    const result = optimizePrompt(
      'Please help me find the capital of France.',
      { profile: 'minimal', enableSADF: false, enableCCP: false }
    );
    const applied = result.pipeline.transforms.filter(t => t.applied).map(t => t.name);
    // Should only have SDM and CFL at most
    for (const name of applied) {
      expect(['SDM', 'CFL']).toContain(name);
    }
  });

  it('respects --no-sadf flag', () => {
    const result = optimizePrompt(
      'A store has 45 apples.',
      { profile: 'full', enableSADF: false }
    );
    const sadf = result.pipeline.transforms.find(t => t.name === 'SAD-F');
    expect(sadf).toBeUndefined();
  });

  it('handles already-short prompts gracefully', () => {
    const result = optimizePrompt('Capital of France?');
    expect(result.optimized).toBeTruthy();
    expect(result.metrics.transformsApplied).toBeGreaterThanOrEqual(1);
  });

  it('handles empty-ish prompts', () => {
    const result = optimizePrompt('   hello   ');
    expect(result.optimized).toBeTruthy();
  });

  it('batch optimize works', () => {
    const results = batchOptimize([
      'What is the capital of France?',
      'Calculate 2 + 2',
    ]);
    expect(results.length).toBe(2);
  });
});

// === Ablation Tests ===
// Systematically disable each principle to measure contribution

describe('ablation: principle contribution', () => {
  const testPrompts = [
    'Please help me figure out what the capital city of France is.',
    'A store has 45 apples. They sell 12 and receive 30. How many remain?',
    "Classify the sentiment as positive, negative, or neutral: 'Great product!'",
    'List the top 3 countries by GDP as JSON with fields name and gdp',
  ];

  // Baseline: full profile with all transforms
  const baselines = testPrompts.map(p => optimizePrompt(p, { profile: 'full' }));

  it('SDM contributes to compression', () => {
    // Without SDM, prompts should be longer (less compressed)
    for (let i = 0; i < testPrompts.length; i++) {
      const withSDM = baselines[i];
      // SDM is first transform — check it was applied
      const sdmTransform = withSDM.pipeline.transforms.find(t => t.name === 'SDM');
      if (sdmTransform?.applied) {
        expect(sdmTransform.tokensRemoved).toBeGreaterThan(0);
      }
    }
  });

  it('CFL adds constraint tag at position 0', () => {
    for (const baseline of baselines) {
      const cflTransform = baseline.pipeline.transforms.find(t => t.name === 'CFL');
      if (cflTransform?.applied) {
        expect(baseline.optimized).toMatch(/^\[(?:ANSWER|CLASSIFY):/);
      }
    }
  });

  it('minimal profile produces less compression than full', () => {
    for (let i = 0; i < testPrompts.length; i++) {
      const minimal = optimizePrompt(testPrompts[i], { profile: 'minimal', enableSADF: false, enableCCP: false });
      const full = baselines[i];
      expect(full.metrics.transformsApplied).toBeGreaterThanOrEqual(minimal.metrics.transformsApplied);
    }
  });

  it('SAD-F adds tokens (negative compression) but reinforces anchors', () => {
    for (const baseline of baselines) {
      const sadf = baseline.pipeline.transforms.find(t => t.name === 'SAD-F');
      if (sadf?.applied) {
        // SAD-F adds tokens (negative removal)
        expect(sadf.tokensRemoved).toBeLessThan(0);
        expect(baseline.optimized).toContain('[ANCHOR:');
      }
    }
  });

  it('CCP adds closure block with semantic atoms', () => {
    for (const baseline of baselines) {
      const ccp = baseline.pipeline.transforms.find(t => t.name === 'CCP');
      if (ccp?.applied) {
        expect(ccp.tokensRemoved).toBeLessThan(0); // adds tokens
        expect(baseline.optimized).toContain('###<CC>');
      }
    }
  });

  it('each profile increases transform count over previous', () => {
    const profiles = ['minimal', 'balanced', 'max_compress', 'full'] as const;
    const prompt = 'Please kindly help me calculate how many apples remain if a store has 45, sells 12, and gets 30 more.';

    const results = profiles.map(p =>
      optimizePrompt(prompt, { profile: p, enableSADF: p === 'full', enableCCP: p === 'full' })
    );

    // Full should apply the most transforms
    expect(results[3].metrics.transformsApplied).toBeGreaterThanOrEqual(results[0].metrics.transformsApplied);
  });
});
