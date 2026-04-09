#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const cp = JSON.parse(readFileSync('D:/0_TSCG/benchmark/results/frontier/a/checkpoint.json', 'utf-8'));
console.log(`Total entries: ${cp.length}`);

const models = new Set(cp.map((e: any) => e.model));
console.log(`Models: ${[...models].join(', ')}`);

const conditions = new Set(cp.map((e: any) => e.condition));
console.log(`Conditions: ${[...conditions].join(', ')}`);

// Count per model
for (const model of models) {
  const entries = cp.filter((e: any) => e.model === model);
  const avgOverall = entries.reduce((sum: number, e: any) => sum + e.scores.overall, 0) / entries.length;
  console.log(`  ${model}: ${entries.length} entries, avg overall=${avgOverall.toFixed(3)}`);

  for (const cond of conditions) {
    const condEntries = entries.filter((e: any) => e.condition === cond);
    if (condEntries.length === 0) continue;
    const condAvg = condEntries.reduce((sum: number, e: any) => sum + e.scores.overall, 0) / condEntries.length;
    console.log(`    ${cond}: ${condEntries.length} entries, avg=${condAvg.toFixed(3)}`);
  }
}
