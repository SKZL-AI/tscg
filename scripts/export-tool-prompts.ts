/**
 * Export 30 tool test cases as JSON for LLMLingua comparison.
 * Generates both natural and TSCG variants for each test.
 * Output: data/llmlingua-input.json
 */

import { TOOL_TESTS } from '../src/benchmark/tool-cases.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple token estimator (whitespace + punctuation split, ~1.3 tokens per word for BPE)
function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  return Math.round(words.length * 1.3);
}

const exported = TOOL_TESTS.map(test => ({
  id: test.id,
  category: test.category,
  name: test.name,
  expected_answer: test.expected,
  natural_prompt: test.natural,
  tscg_prompt: test.tscg,
  natural_tokens: estimateTokens(test.natural),
  tscg_tokens: estimateTokens(test.tscg),
}));

const outPath = path.resolve(__dirname, '..', 'data', 'llmlingua-input.json');
fs.writeFileSync(outPath, JSON.stringify(exported, null, 2), 'utf-8');

console.log(`Exported ${exported.length} tool test cases to ${outPath}`);
console.log(`Categories: ${[...new Set(exported.map(e => e.category))].join(', ')}`);
console.log(`Avg natural tokens: ${Math.round(exported.reduce((s, e) => s + e.natural_tokens, 0) / exported.length)}`);
console.log(`Avg TSCG tokens: ${Math.round(exported.reduce((s, e) => s + e.tscg_tokens, 0) / exported.length)}`);
