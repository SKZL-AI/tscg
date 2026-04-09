import { describe, it, expect } from 'vitest';
import { applySADF, applyCCP } from '../src/compiler/compiler.js';

describe('applySADF', () => {
  it('adds ANCHOR tag to TSCG prompt', () => {
    const tscg = '[ANSWER:integer] initial:45 \u2192 subtract:12 \u2192 add:30 \u2192 result \u2192';
    const result = applySADF(tscg);
    expect(result).toContain('[ANCHOR:');
    expect(result).toContain('[ANSWER:integer]');
  });

  it('includes constraint spec in anchors', () => {
    const tscg = '[ANSWER:single_word] country:Australia \u2192 capital_city \u2192';
    const result = applySADF(tscg);
    expect(result).toContain('[ANSWER:single_word]');
    expect(result).toContain('ANCHOR:');
  });

  it('respects topK parameter', () => {
    const tscg = '[ANSWER:integer] a:1 b:22 c:333 d:4444 e:55555 \u2192 result \u2192';
    const result = applySADF(tscg, 2);
    // Should have spec + 2 most fragile (longest) params
    const anchorContent = result.match(/\[ANCHOR:([^\]]+)\]/)?.[1] || '';
    const anchors = anchorContent.split(',');
    // At most spec + topK
    expect(anchors.length).toBeLessThanOrEqual(3);
  });
});

describe('applyCCP', () => {
  it('adds closure block to NL prompt', () => {
    const nl = 'What is the capital of France?';
    const result = applyCCP(nl);
    expect(result).toContain(nl);
    expect(result).toContain('###<CC>');
    expect(result).toContain('###</CC>');
    expect(result).toContain('OP=EMIT_DIRECT');
  });

  it('supports json format', () => {
    const nl = 'List the top 3 countries by GDP';
    const result = applyCCP(nl, 'json');
    expect(result).toContain('OP=EMIT_JSON');
  });

  it('extracts key words from prompt', () => {
    const nl = 'What is the largest planet in our solar system?';
    const result = applyCCP(nl);
    // Should extract words > 3 chars
    expect(result).toContain('t=');
    expect(result).toContain('largest');
  });
});
