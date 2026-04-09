#!/usr/bin/env node
/**
 * Debug: Show generated task queries to verify they're actionable.
 */
import { collectClaudeCodeTools } from '../schemas/collectors/index.js';
import { generateTasksForCollection } from '../tasks/generators/index.js';

const col = collectClaudeCodeTools();
const tasks = generateTasksForCollection(col);

console.log('=== Generated Task Queries (Claude Code tools) ===\n');
for (const t of tasks) {
  const type = t.task_id.includes('-ts-') ? 'TS' :
               t.task_id.includes('-mt-') ? 'MT' :
               t.task_id.includes('-pe-') ? 'PE' :
               t.task_id.includes('-nt-') ? 'NT' : '??';
  console.log(`[${type}] ${t.task_id}: ${t.query}`);
  if (t.ground_truth.tool_name) {
    console.log(`    → expected: ${t.ground_truth.tool_name}(${JSON.stringify(t.ground_truth.parameters)})`);
  }
  if (t.ground_truth.sequence) {
    console.log(`    → sequence: ${t.ground_truth.sequence.map((s: any) => s.tool_name).join(' → ')}`);
  }
  if (t.ground_truth.action === 'no_tool_call') {
    console.log(`    → expected: no_tool_call`);
  }
}
