#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync('D:/0_TSCG/benchmark/results/frontier/a/checkpoint.json', 'utf8'));

// GPT-4o results by condition
const gpt4o = d.filter((e: any) => e.model === 'gpt-4o');
console.log('GPT-4o results:', gpt4o.length);

const byCondition: Record<string, { count: number; sum: number }> = {};
for (const e of gpt4o) {
  const k = e.condition;
  if (!byCondition[k]) byCondition[k] = { count: 0, sum: 0 };
  byCondition[k].count++;
  byCondition[k].sum += e.scores.overall;
}
for (const [k, v] of Object.entries(byCondition)) {
  console.log(`  ${k}: avg = ${(v.sum / v.count).toFixed(3)}, n = ${v.count}`);
}

// Show a sample raw_output for ts-001 tscg_sad
console.log('\n--- GPT-4o tscg_sad ts-001 raw_output ---');
const sadResult = gpt4o.find((e: any) => e.condition === 'tscg_sad' && e.task_id.includes('-ts-001'));
if (sadResult) {
  console.log(sadResult.response?.raw_output?.substring(0, 400));
} else {
  console.log('(not found yet)');
}

// Show a sample for natural ts-001
console.log('\n--- GPT-4o natural ts-001 raw_output ---');
const natResult = gpt4o.find((e: any) => e.condition === 'natural' && e.task_id.includes('-ts-001'));
if (natResult) {
  console.log(natResult.response?.raw_output?.substring(0, 400));
}

// Show tscg ts-001
console.log('\n--- GPT-4o tscg ts-001 raw_output ---');
const tscgResult = gpt4o.find((e: any) => e.condition === 'tscg' && e.task_id.includes('-ts-001'));
if (tscgResult) {
  console.log(tscgResult.response?.raw_output?.substring(0, 400));
}
