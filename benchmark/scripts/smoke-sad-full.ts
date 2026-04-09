/**
 * Smoke test: SAD with full Claude Code 16-tool catalog (Scenario A).
 */
import { compressCollection } from '../compression/pipeline.js';
import { collectClaudeCodeTools } from '../schemas/collectors/index.js';

const col = collectClaudeCodeTools();
const result = compressCollection(col);

console.log('=== TSCG (balanced) ===');
console.log('Tokens:', result.conditions.tscg.tokens, '(' + result.savings.tscg.percent + '% savings)');
console.log('');

console.log('=== TSCG+SAD (aggressive) ===');
console.log('Tokens:', result.conditions.tscg_sad.tokens, '(' + result.savings.tscg_sad.percent + '% savings)');
console.log('');

console.log('=== COMPARISON ===');
console.log('Same output?', result.conditions.tscg.text === result.conditions.tscg_sad.text);
console.log('Has ANCHOR tag?', result.conditions.tscg_sad.text.includes('[ANCHOR:'));
console.log('TSCG chars:', result.conditions.tscg.text.length);
console.log('SAD chars:', result.conditions.tscg_sad.text.length);
console.log('Delta tokens:', result.conditions.tscg_sad.tokens - result.conditions.tscg.tokens);

// Show the ANCHOR tag
const lines = result.conditions.tscg_sad.text.split('\n');
const anchorLine = lines.find((l: string) => l.includes('[ANCHOR:'));
if (anchorLine) {
  console.log('\nANCHOR tag:', anchorLine);
}

console.log('\nPrinciples tscg:', result.appliedPrinciples.tscg.join(', '));
console.log('Principles tscg_sad:', result.appliedPrinciples.tscg_sad.join(', '));
