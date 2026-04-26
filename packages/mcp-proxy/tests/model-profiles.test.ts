/**
 * @tscg/mcp-proxy — Model Profile Resolution Tests
 *
 * Tests resolveModelProfile() — exact matches, loose aliases, unknown fallback.
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveModelProfile, MODEL_PROFILES } from '../src/model-profiles.js';

describe('resolveModelProfile', () => {
  it('target=claude-opus-4-7 -> archetype=hungry, all 8 operators active', () => {
    const p = resolveModelProfile('claude-opus-4-7');
    expect(p.archetype).toBe('hungry');
    expect(p.profile).toBe('balanced');
    expect(p.operators.cfo).toBe(true);
    expect(p.operators.cfl).toBe(true);
    expect(p.operators.ccp).toBe(true);
    expect(p.operators.sdm).toBe(true);
    expect(p.operators.tas).toBe(true);
    expect(p.operators.dro).toBe(true);
    expect(p.operators.cas).toBe(true);
    expect(p.operators.sad).toBe(true);
  });

  it('target=claude-sonnet-4 -> archetype=robust, all 8 operators active', () => {
    const p = resolveModelProfile('claude-sonnet-4');
    expect(p.archetype).toBe('robust');
    expect(p.profile).toBe('balanced');
    expect(p.operators.cfo).toBe(true);
  });

  it('target=gpt-5.2 -> archetype=sensitive, CFO disabled', () => {
    const p = resolveModelProfile('gpt-5.2');
    expect(p.archetype).toBe('sensitive');
    expect(p.operators.cfo).toBe(false);
    expect(p.operators.cfl).toBe(true);
    expect(p.operators.sdm).toBe(true);
  });

  it('target=gpt-5.4 -> archetype=robust, SDM disabled, CFO enabled', () => {
    const p = resolveModelProfile('gpt-5.4');
    expect(p.archetype).toBe('robust');
    expect(p.profile).toBe('balanced');
    expect(p.operators.sdm).toBe(false);
    expect(p.operators.cfo).toBe(true);
    expect(p.operators.tas).toBe(true);
    expect(p.operators.dro).toBe(true);
  });

  it('target=gpt-5.5 -> archetype=sensitive, SDM-only conservative', () => {
    const p = resolveModelProfile('gpt-5.5');
    expect(p.archetype).toBe('sensitive');
    expect(p.profile).toBe('conservative');
    expect(p.operators.sdm).toBe(true);
    expect(p.operators.dro).toBe(false);
    expect(p.operators.cfl).toBe(false);
    expect(p.operators.cfo).toBe(false);
    expect(p.operators.tas).toBe(false);
  });

  it('target=gpt-55 (loose alias) -> resolves to gpt-5.5 profile', () => {
    const p = resolveModelProfile('gpt-55');
    expect(p.archetype).toBe('sensitive');
    expect(p.profile).toBe('conservative');
  });

  it('target=gpt-54 (loose alias) -> resolves to gpt-5.4 profile', () => {
    const p = resolveModelProfile('gpt-54');
    expect(p.archetype).toBe('robust');
    expect(p.profile).toBe('balanced');
  });

  it('target=opus (loose alias) -> resolves to claude-opus-4-7 profile', () => {
    const p = resolveModelProfile('opus');
    expect(p.archetype).toBe('hungry');
    expect(p.target).toBe('claude-opus');
  });

  it('target=unknown -> safe-fallback with stderr warning', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const p = resolveModelProfile('some-unknown-model');
    expect(p.archetype).toBe('safe-fallback');
    expect(p.profile).toBe('conservative');
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown target'),
    );
    stderrSpy.mockRestore();
  });

  it('cacheReader overrides static profile when it returns a result', () => {
    const customProfile = {
      target: 'custom-model',
      profile: 'balanced' as const,
      operators: {
        sdm: false, tas: true, dro: true, cfl: true,
        cfo: true, cas: true, sad: true, ccp: true,
      },
      archetype: 'robust' as const,
      rationale: 'Adaptive profile from openclaw sweep',
      expectedSavings: '55-60% tokens',
    };
    const reader = (modelId: string) =>
      modelId === 'custom-model' ? customProfile : null;

    const p = resolveModelProfile('custom-model', reader);
    expect(p.archetype).toBe('robust');
    expect(p.rationale).toContain('Adaptive profile');
    expect(p.operators.sdm).toBe(false);
    expect(p.operators.cfo).toBe(true);
  });

  it('cacheReader returning null falls through to static profiles', () => {
    const reader = () => null;
    const p = resolveModelProfile('claude-opus-4-7', reader);
    expect(p.archetype).toBe('hungry'); // static profile
  });

  it('cacheReader is not called for auto target', () => {
    const reader = vi.fn().mockReturnValue(null);
    resolveModelProfile('auto', reader);
    expect(reader).not.toHaveBeenCalled();
  });
});
