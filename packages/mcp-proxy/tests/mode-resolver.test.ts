/**
 * @tscg/mcp-proxy — Mode Resolution Tests
 *
 * Tests resolveEffectiveMode() — the CRITICAL Anthropic-pitch default behavior.
 * target-set WITHOUT mode MUST auto-enable mode='full'.
 */

import { describe, it, expect } from 'vitest';
import { resolveEffectiveMode } from '../src/mode-resolver.js';

describe('resolveEffectiveMode', () => {
  it('target set without mode -> auto-upgrade to full', () => {
    const m = resolveEffectiveMode({ target: 'claude-opus-4-7' });
    expect(m).toBe('full');
  });

  it('no target, no mode -> legacy description-only', () => {
    const m = resolveEffectiveMode({});
    expect(m).toBe('description-only');
  });

  it('target=auto without mode -> description-only (auto target is legacy)', () => {
    const m = resolveEffectiveMode({ target: 'auto' });
    expect(m).toBe('description-only');
  });

  it('explicit mode always wins over target inference', () => {
    const m = resolveEffectiveMode({
      target: 'claude-opus-4-7',
      mode: 'description-only',
    });
    expect(m).toBe('description-only');
  });

  it('legacy full-text mode is normalized to full', () => {
    const m = resolveEffectiveMode({ mode: 'full-text' });
    expect(m).toBe('full');
  });
});
