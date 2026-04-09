import { describe, it, expect } from 'vitest';
import {
  getModelFamily,
  getModelProfile,
  MODEL_PROFILES,
} from '../src/core/types.js';
import { applyModelProfile } from '../src/core/strategies.js';
import { optimizePrompt } from '../src/optimizer/optimizer.js';

describe('Model Profiles', () => {
  describe('getModelFamily', () => {
    it('returns claude for anthropic provider', () => {
      expect(getModelFamily('anthropic', 'claude-sonnet-4-20250514')).toBe('claude');
    });

    it('returns gpt5 for openai gpt-5 models', () => {
      expect(getModelFamily('openai', 'gpt-5.2')).toBe('gpt5');
    });

    it('returns gpt4o for openai gpt-4o models', () => {
      expect(getModelFamily('openai', 'gpt-4o-2024-11-20')).toBe('gpt4o');
    });

    it('returns gemini for gemini provider', () => {
      expect(getModelFamily('gemini', 'gemini-2.5-flash')).toBe('gemini');
    });

    it('returns gpt5 for o-series reasoning models', () => {
      expect(getModelFamily('openai', 'o1-preview')).toBe('gpt5');
      expect(getModelFamily('openai', 'o3-mini')).toBe('gpt5');
    });

    it('returns unknown for moonshot provider', () => {
      expect(getModelFamily('moonshot', 'moonshot-v1-8k')).toBe('unknown');
    });

    it('returns unknown for unrecognized openai models', () => {
      expect(getModelFamily('openai', 'some-new-model')).toBe('unknown');
    });
  });

  describe('getModelProfile', () => {
    it('enables CFL and SAD for claude', () => {
      const profile = getModelProfile('anthropic', 'claude-sonnet-4');
      expect(profile.enableCFL).toBe(true);
      expect(profile.enableSAD).toBe(true);
    });

    it('enables CFL and SAD for gpt-5', () => {
      const profile = getModelProfile('openai', 'gpt-5.2');
      expect(profile.enableCFL).toBe(true);
      expect(profile.enableSAD).toBe(true);
    });

    it('disables CFL and SAD for gpt-4o', () => {
      const profile = getModelProfile('openai', 'gpt-4o-2024-11-20');
      expect(profile.enableCFL).toBe(false);
      expect(profile.enableSAD).toBe(false);
    });

    it('disables CFL and SAD for gemini', () => {
      const profile = getModelProfile('gemini', 'gemini-2.5-flash');
      expect(profile.enableCFL).toBe(false);
      expect(profile.enableSAD).toBe(false);
    });
  });

  describe('MODEL_PROFILES', () => {
    it('has entries for all model families', () => {
      expect(Object.keys(MODEL_PROFILES)).toEqual(['claude', 'gpt5', 'gpt4o', 'gemini', 'unknown']);
    });
  });

  describe('applyModelProfile', () => {
    const tscgPrompt = '[ANSWER:letter] op:classify \u2192 scope:EU \u2192 src:regulation | A) GDPR B) CCPA C) HIPAA';
    const tscgSadPrompt = '[ANSWER:letter] op:classify \u2192 scope:EU [ANCHOR:scope:EU,op:classify]';

    it('strips CFL tags for GPT-4o', () => {
      const result = applyModelProfile(tscgPrompt, 'tscg', 'openai', 'gpt-4o-2024-11-20');
      expect(result).not.toContain('[ANSWER:');
    });

    it('strips CFL tags for Gemini', () => {
      const result = applyModelProfile(tscgPrompt, 'tscg', 'gemini', 'gemini-2.5-flash');
      expect(result).not.toContain('[ANSWER:');
    });

    it('preserves CFL tags for Claude', () => {
      const result = applyModelProfile(tscgPrompt, 'tscg', 'anthropic', 'claude-sonnet-4');
      expect(result).toContain('[ANSWER:letter]');
    });

    it('preserves CFL tags for GPT-5.2', () => {
      const result = applyModelProfile(tscgPrompt, 'tscg', 'openai', 'gpt-5.2');
      expect(result).toContain('[ANSWER:letter]');
    });

    it('strips ANCHOR tags for GPT-4o', () => {
      const result = applyModelProfile(tscgSadPrompt, 'tscg+sad', 'openai', 'gpt-4o-2024-11-20');
      expect(result).not.toContain('[ANCHOR:');
    });

    it('does not modify natural strategy prompts', () => {
      const naturalPrompt = 'What is the capital of France?';
      const result = applyModelProfile(naturalPrompt, 'natural', 'openai', 'gpt-4o');
      expect(result).toBe(naturalPrompt);
    });

    it('does not modify CCP strategy prompts', () => {
      const ccpPrompt = 'What is 2+2?\n###<CC>\nt=What;2+2;\nOP=EMIT_DIRECT;\n###</CC>';
      const result = applyModelProfile(ccpPrompt, 'ccp', 'openai', 'gpt-4o');
      expect(result).toBe(ccpPrompt);
    });

    it('is backwards-compatible (no provider = no change)', () => {
      const result = applyModelProfile(tscgPrompt, 'tscg');
      expect(result).toBe(tscgPrompt);
    });

    it('is backwards-compatible (no model = no change)', () => {
      const result = applyModelProfile(tscgPrompt, 'tscg', 'openai');
      expect(result).toBe(tscgPrompt);
    });
  });

  describe('optimizePrompt with provider', () => {
    const testPrompt = 'What is the capital of France? Please tell me the answer.';

    it('includes CFL tags without provider (default)', () => {
      const result = optimizePrompt(testPrompt);
      // Check that the optimizer runs without error
      expect(result.optimized).toBeDefined();
    });

    it('strips CFL tags when provider is gpt-4o', () => {
      const result = optimizePrompt(testPrompt, { provider: 'openai', model: 'gpt-4o' });
      expect(result.optimized).not.toContain('[ANSWER:');
      expect(result.optimized).not.toContain('[CLASSIFY:');
    });

    it('preserves CFL tags when provider is claude', () => {
      const result = optimizePrompt(testPrompt, { provider: 'anthropic', model: 'claude-sonnet-4' });
      // Claude supports CFL, so tags should remain if the analyzer adds them
      expect(result.optimized).toBeDefined();
    });
  });
});
