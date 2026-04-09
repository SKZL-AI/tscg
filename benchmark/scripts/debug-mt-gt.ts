#!/usr/bin/env node
import { collectClaudeCodeTools } from '../schemas/collectors/index.js';
import { generateTasksForCollection } from '../tasks/generators/index.js';

const col = collectClaudeCodeTools();
const tasks = generateTasksForCollection(col);
const mts = tasks.filter(t => t.task_id.includes('-mt-'));
for (const t of mts) {
  console.log(t.task_id, ':');
  console.log('  query:', t.query);
  console.log('  sequence:', t.ground_truth.sequence?.map(s => `${s.tool_name}(${Object.keys(s.parameters).join(',')})`).join(' -> '));
  if (t.ground_truth.sequence) {
    for (const s of t.ground_truth.sequence) {
      console.log(`    ${s.tool_name}:`, JSON.stringify(s.parameters));
    }
  }
  console.log();
}
