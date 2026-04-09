/**
 * Remove tscg_sad entries from checkpoint to allow re-run with fixed SAD.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cpPath = resolve('benchmark/results/frontier/a/checkpoint.json');
const cp = JSON.parse(readFileSync(cpPath, 'utf-8'));
const filtered = cp.filter((r: { condition: string }) => r.condition !== 'tscg_sad');

console.log('Original entries:', cp.length);
console.log('After removing tscg_sad:', filtered.length);
console.log('Removed:', cp.length - filtered.length);

writeFileSync(cpPath, JSON.stringify(filtered, null, 2));
console.log('Checkpoint cleaned.');
