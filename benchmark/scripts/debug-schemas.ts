#!/usr/bin/env node
import { collectClaudeCodeTools } from '../schemas/collectors/index.js';
import { compressCollection } from '../compression/pipeline.js';

const col = collectClaudeCodeTools();
const result = compressCollection(col);

console.log('=== NATURAL schema (first 600 chars) ===');
console.log(result.conditions.natural.text.substring(0, 600));
console.log('\n=== TSCG schema (first 600 chars) ===');
console.log(result.conditions.tscg.text.substring(0, 600));
console.log('\n=== TSCG_SAD schema (first 600 chars) ===');
console.log(result.conditions.tscg_sad.text.substring(0, 600));
console.log('\n=== Token counts ===');
console.log('natural:', result.conditions.natural.tokens);
console.log('tscg:', result.conditions.tscg.tokens);
console.log('tscg_sad:', result.conditions.tscg_sad.tokens);
console.log('savings tscg:', result.savings.tscg.percent + '%');
console.log('savings tscg_sad:', result.savings.tscg_sad.percent + '%');
