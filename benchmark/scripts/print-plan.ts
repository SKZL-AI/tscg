#!/usr/bin/env node
/**
 * Print canonical tables from experiment-plan.json
 *
 * Generates human-readable summary tables from the Single Source of Truth
 * experiment configuration. Use this output in documentation and wave reports
 * to prevent doc drift.
 *
 * Usage:
 *   npx tsx benchmark/scripts/print-plan.ts
 *   npx tsx benchmark/scripts/print-plan.ts --format markdown
 *   npx tsx benchmark/scripts/print-plan.ts --format latex
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const planPath = resolve(import.meta.dirname, '..', 'config', 'experiment-plan.json');
const plan = JSON.parse(readFileSync(planPath, 'utf-8'));

const format = process.argv.includes('--format')
  ? process.argv[process.argv.indexOf('--format') + 1]
  : 'markdown';

// ============================================================
// Scenario Summary Table
// ============================================================

function printScenarioTable(): void {
  const scenarios = plan.scenarios;
  const rows: string[][] = [];

  for (const [key, config] of Object.entries(scenarios) as [string, any][]) {
    rows.push([
      key,
      config.name,
      String(config.tools),
      String(config.tasks_per_collection ?? config.tasks ?? '—'),
      String(config.runs),
      config.conditions.join(', '),
      (config.models ?? []).join(', '),
      String(config.estimated_calls),
      `$${config.estimated_cost_usd}`,
    ]);
  }

  // GSM8K
  const g = plan.gsm8k;
  rows.push([
    'GSM8K',
    g.name,
    `loads: ${g.loads.join(',')}`,
    String(g.questions),
    String(g.runs),
    g.conditions.join(', '),
    g.models.join(', '),
    String(g.estimated_calls),
    `$${g.estimated_cost_usd}`,
  ]);

  // BFCL
  const b = plan.bfcl;
  rows.push([
    'BFCL',
    b.name,
    String(b.tools),
    String(b.tasks),
    String(b.runs),
    b.conditions.join(', '),
    b.models.join(', '),
    String(b.estimated_calls),
    `$${b.estimated_cost_usd}`,
  ]);

  if (format === 'markdown') {
    console.log('## TAB Experiment Plan v' + plan.version);
    console.log('');
    console.log('| Scenario | Name | Tools | Tasks | Runs | Conditions | Models | Calls | Cost |');
    console.log('|----------|------|-------|-------|------|------------|--------|-------|------|');
    for (const row of rows) {
      console.log('| ' + row.join(' | ') + ' |');
    }
  } else if (format === 'latex') {
    console.log('% Auto-generated from experiment-plan.json v' + plan.version);
    console.log('\\begin{tabular}{lllrrllrr}');
    console.log('\\toprule');
    console.log('Scenario & Name & Tools & Tasks & Runs & Conditions & Models & Calls & Cost \\\\');
    console.log('\\midrule');
    for (const row of rows) {
      console.log(row.join(' & ') + ' \\\\');
    }
    console.log('\\bottomrule');
    console.log('\\end{tabular}');
  }

  // Totals
  console.log('');
  console.log(`**Total API Calls:** ${plan.budget.total_api_calls}`);
  console.log(`**Total Local Calls:** ${plan.budget.total_local_calls}`);
  console.log(`**Total Calls:** ${plan.budget.total_calls}`);
  console.log(`**Estimated Cost:** $${plan.budget.estimated_cost_range_usd[0]}-$${plan.budget.estimated_cost_range_usd[1]}`);
}

// ============================================================
// Model Roster
// ============================================================

function printModelRoster(): void {
  console.log('');
  console.log('## Model Roster');
  console.log('');
  console.log('### Frontier');
  for (const m of plan.models.frontier) {
    console.log(`- **${m.name}** (${m.provider}): \`${m.model_id}\``);
  }
  console.log('');
  console.log('### Small Models (Ollama)');
  for (const m of plan.models.small) {
    console.log(`- **${m.name}** (${m.params}): \`${m.model_id}\``);
  }
  console.log('');
  console.log('### Excluded');
  console.log(`- ${plan.models.excluded.thinking_models.join(', ')}`);
  console.log(`- Reason: ${plan.models.excluded.reason}`);
}

// ============================================================
// Seed Policy
// ============================================================

function printSeedPolicy(): void {
  console.log('');
  console.log('## Seed Policy');
  console.log(`- Primary: ${plan.seed_policy.primary}`);
  console.log(`- Validation: ${plan.seed_policy.validation.join(', ')}`);
}

// ============================================================
// Main
// ============================================================

printScenarioTable();
printModelRoster();
printSeedPolicy();
