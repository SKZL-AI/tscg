/**
 * TAB Benchmark — Multi-Tool Task Generator
 *
 * Generates multi_tool tasks that require 2-3 sequential tool calls.
 * These test the model's ability to decompose a complex request into
 * an ordered sequence of tool invocations.
 *
 * Distribution per collection:
 *   - medium (2): 2-tool sequences with clear dependencies
 *   - hard (2):   3-tool sequences with subtle ordering requirements
 *
 * Total: 4 multi_tool tasks per schema collection
 */

import type { ToolSchema, ToolSchemaParameter } from '../../schemas/types.js';
import type {
  BenchmarkTask,
  Difficulty,
  Scenario,
  ToolCallSequence,
} from '../types.js';

// ============================================================
// Seeded RNG (shared pattern)
// ============================================================

class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0x100000000;
  }

  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  pick<T>(arr: T[]): T {
    return arr[this.nextInt(arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

// ============================================================
// Multi-Tool Query Templates
// ============================================================

const TWO_TOOL_TEMPLATES = [
  'First {verb1}, then use that result to {verb2}.',
  'I need you to {verb1} and after that {verb2}.',
  'Please {verb1}. Once you have the result, {verb2}.',
  'Could you {verb1}? Then based on what you find, {verb2}.',
];

const THREE_TOOL_TEMPLATES = [
  'Start by {verb1}, then {verb2}, and finally {verb3}.',
  'I need a three-step process: first {verb1}, then {verb2}, and lastly {verb3}.',
  'Please {verb1}, use the output to {verb2}, and then {verb3} with all the collected information.',
];

// ============================================================
// Helper Functions
// ============================================================

/**
 * Extract a concise action phrase from a tool for multi-tool query building.
 * For multi-tool tasks, we use explicit tool names to minimize ambiguity
 * since the model must identify the correct sequence of tools.
 */
function extractActionPhrase(tool: ToolSchema): string {
  return `use ${tool.name}`;
}

/**
 * Select a sequence of tools that could plausibly be used together.
 * Prefers tools from different "domains" (based on name heuristics).
 */
function selectToolSequence(
  tools: ToolSchema[],
  length: number,
  rng: SeededRNG,
): ToolSchema[] {
  if (tools.length < length) {
    // If not enough tools, allow repeats
    const sequence: ToolSchema[] = [];
    for (let i = 0; i < length; i++) {
      sequence.push(rng.pick(tools));
    }
    return sequence;
  }

  const shuffled = rng.shuffle(tools);
  return shuffled.slice(0, length);
}

/**
 * Format parameter values as natural-language hints for the query.
 * E.g. { pid: 112, pattern: "*.ts" } → 'pid=112, pattern="*.ts"'
 */
function formatParamHints(params: Record<string, unknown>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return '';

  return entries.map(([key, val]) => {
    if (typeof val === 'string') return `${key}="${val}"`;
    if (typeof val === 'boolean') return `${key}=${val}`;
    if (typeof val === 'number') return `${key}=${val}`;
    if (Array.isArray(val)) return `${key}=${JSON.stringify(val)}`;
    return `${key}=${JSON.stringify(val)}`;
  }).join(', ');
}

/**
 * Generate expected parameters for a tool in a sequence.
 */
function generateSequenceParams(
  tool: ToolSchema,
  rng: SeededRNG,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  for (const param of tool.parameters.filter((p) => p.required)) {
    params[param.name] = generateValueForParam(param, rng);
  }

  return params;
}

/**
 * Generate a plausible value for a parameter.
 */
function generateValueForParam(
  param: ToolSchemaParameter,
  rng: SeededRNG,
): unknown {
  if (param.enum && param.enum.length > 0) {
    return rng.pick(param.enum);
  }

  switch (param.type) {
    case 'string':
      return 'example_value';
    case 'number':
      return 42 + rng.nextInt(100);
    case 'integer':
      return 1 + rng.nextInt(50);
    case 'boolean':
      return rng.next() > 0.5;
    case 'array':
      return ['item1', 'item2'];
    case 'object':
      return {};
    default:
      return 'example_value';
  }
}

// ============================================================
// Main Generator
// ============================================================

/**
 * Generate multi_tool tasks requiring 2-3 sequential tool calls.
 *
 * Each task presents a complex user request that requires the model
 * to identify and correctly order multiple tool calls. The ground_truth
 * contains the expected sequence with parameters.
 *
 * @param tools     - Available tool schemas for this collection
 * @param scenario  - TAB scenario identifier
 * @param source    - Source identifier for the collection
 * @param count     - Number of tasks to generate (default: 4)
 * @param seed      - Random seed for reproducibility (default: 42)
 * @returns Array of BenchmarkTask objects with multi_tool category
 */
export function generateMultiToolTasks(
  tools: ToolSchema[],
  scenario: Scenario = 'A',
  source: string = 'generated',
  count: number = 4,
  seed: number = 42,
): BenchmarkTask[] {
  if (tools.length < 2) return [];

  const rng = new SeededRNG(seed + 1000); // Offset seed to avoid collision with tool-selection
  const tasks: BenchmarkTask[] = [];
  const toolNames = tools.map((t) => t.name);

  // Difficulty distribution: 2 medium (2-tool), 2 hard (3-tool)
  const configs: Array<{ difficulty: Difficulty; seqLength: number }> = [
    { difficulty: 'medium', seqLength: 2 },
    { difficulty: 'medium', seqLength: 2 },
    { difficulty: 'hard', seqLength: Math.min(3, tools.length) },
    { difficulty: 'hard', seqLength: Math.min(3, tools.length) },
  ];

  for (let i = 0; i < count; i++) {
    const config = configs[i % configs.length];
    const sequence = selectToolSequence(tools, config.seqLength, rng);

    // Build ground truth sequence FIRST so we can embed values in the query
    const groundTruthSequence: ToolCallSequence[] = sequence.map((tool) => ({
      tool_name: tool.name,
      parameters: generateSequenceParams(tool, rng),
    }));

    // Build query from sequence with embedded parameter hints
    const verbs = sequence.map((t, idx) => {
      const phrase = extractActionPhrase(t);
      const params = groundTruthSequence[idx].parameters;
      const hints = formatParamHints(params);
      return hints ? `${phrase} (${hints})` : phrase;
    });
    let query: string;

    if (config.seqLength === 2) {
      const template = rng.pick(TWO_TOOL_TEMPLATES);
      query = template
        .replace('{verb1}', verbs[0])
        .replace('{verb2}', verbs[1]);
    } else {
      const template = rng.pick(THREE_TOOL_TEMPLATES);
      query = template
        .replace('{verb1}', verbs[0])
        .replace('{verb2}', verbs[1])
        .replace('{verb3}', verbs[2] || verbs[1]);
    }

    const taskId = `tab-${scenario}-mt-${String(i + 1).padStart(3, '0')}`;

    tasks.push({
      task_id: taskId,
      scenario,
      category: 'multi_tool',
      difficulty: config.difficulty,
      source,
      query,
      tools: toolNames,
      ground_truth: {
        sequence: groundTruthSequence,
      },
      metadata: {
        num_tools: tools.length,
      },
    });
  }

  return tasks;
}
