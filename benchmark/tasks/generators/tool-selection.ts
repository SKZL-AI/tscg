/**
 * TAB Benchmark — Single-Tool Selection Task Generator
 *
 * Generates single_tool tasks where the model must select exactly ONE
 * correct tool from the available set. Tasks are distributed across
 * difficulty levels:
 *   - easy (3):   Obvious tool choice, simple phrasing
 *   - medium (3): 2-3 plausible tools, requires disambiguation
 *   - hard (2):   Subtle distinctions, indirect phrasing
 *
 * Total: 8 single_tool tasks per schema collection
 */

import type { ToolSchema } from '../../schemas/types.js';
import type { BenchmarkTask, Difficulty, Scenario } from '../types.js';

// ============================================================
// Query Templates by Difficulty
// ============================================================

/**
 * Templates for generating realistic queries.
 * {tool_verb} and {param_hint} are replaced with tool-specific content.
 */
const EASY_TEMPLATES = [
  'Please {tool_verb}. {param_hint}.',
  'I need you to {tool_verb}. {param_hint}.',
  '{tool_verb} for me. {param_hint}.',
];

const MEDIUM_TEMPLATES = [
  'I was wondering if you could help me {tool_verb}. I have the following details: {param_hint}.',
  'Could you {tool_verb}? Here is the relevant information: {param_hint}.',
  '{param_hint} — based on this, please {tool_verb}.',
];

const HARD_TEMPLATES = [
  'Given {param_hint}, what would be the best approach? I think we need to {tool_verb}.',
  'My colleague asked me about {param_hint}. I believe we should {tool_verb} to get the answer.',
];

// ============================================================
// Seeded Random Number Generator
// ============================================================

class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0x100000000;
  }

  /** Returns an integer in [0, max) */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Pick a random element from an array */
  pick<T>(arr: T[]): T {
    return arr[this.nextInt(arr.length)];
  }

  /** Shuffle array in place (Fisher-Yates) */
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
// Helper: Generate natural-language verb from tool description
// ============================================================

/**
 * Third-person → imperative verb mapping for tool descriptions.
 * Covers the most common verbs seen in tool description opening words.
 */
const VERB_MAP: Record<string, string> = {
  gets: 'get', fetches: 'fetch', retrieves: 'retrieve',
  searches: 'search', finds: 'find', lists: 'list',
  creates: 'create', updates: 'update', deletes: 'delete',
  sends: 'send', reads: 'read', writes: 'write',
  executes: 'execute', runs: 'run', checks: 'check',
  performs: 'perform', kills: 'kill', replaces: 'replace',
  launches: 'launch', saves: 'save', validates: 'validate',
  modifies: 'modify', edits: 'edit', opens: 'open',
  closes: 'close', starts: 'start', stops: 'stop',
};

function extractVerb(tool: ToolSchema): string {
  const desc = tool.description;

  // Extract the first sentence (up to first period+space, or end of string)
  const sentenceMatch = desc.match(/^(.+?)(?:\.\s|$)/);
  const firstSentence = sentenceMatch?.[1] ?? desc;

  // Split into words
  const words = firstSentence.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return `use the ${tool.name} tool`;

  // Convert leading verb to imperative form
  const firstWord = words[0].toLowerCase();
  const imperative = VERB_MAP[firstWord];
  if (imperative) {
    words[0] = imperative;
  } else {
    words[0] = firstWord;
  }

  // Limit to a reasonable length (~8 words) — truncate at word boundary
  const maxWords = 8;
  const phrase = words.slice(0, maxWords).join(' ').toLowerCase();

  // If description doesn't start with a verb, use explicit tool name
  if (!imperative && !firstWord.match(/^(a|an|the|use|get|set|find|read|write|run|check)\b/)) {
    return `use the ${tool.name} tool`;
  }

  return phrase;
}

/**
 * Generate a parameter hint string from the tool's required parameters.
 */
function generateParamHint(tool: ToolSchema, rng: SeededRNG): string {
  const requiredParams = tool.parameters.filter((p) => p.required);
  if (requiredParams.length === 0) {
    // Use first available param
    if (tool.parameters.length === 0) return 'the necessary information';
    const p = tool.parameters[0];
    return generateSampleValue(p, rng);
  }

  return requiredParams
    .map((p) => generateSampleValue(p, rng))
    .join(', ');
}

/**
 * Generate a realistic sample value description for a parameter.
 */
/**
 * Context-aware sample values based on parameter name semantics.
 * Models like GPT-4o validate parameter values (e.g., URLs must look like URLs).
 */
const SEMANTIC_VALUES: Record<string, string[]> = {
  url: ['https://example.com/page', 'https://docs.github.com/api', 'https://httpbin.org/get'],
  file_path: ['/home/user/project/main.ts', '/tmp/output.log', 'src/config.json'],
  path: ['/home/user/project', '/var/log', 'src/components'],
  pattern: ['**/*.ts', 'src/**/*.tsx', '*.json'],
  query: ['latest TypeScript features', 'how to fix memory leaks', 'API rate limiting best practices'],
  command: ['git status', 'npm test', 'ls -la /tmp'],
  prompt: ['summarize the main content', 'extract the title and date', 'list all code examples'],
  content: ['Hello World', 'Updated configuration file', '# New Section\\nContent here'],
  notebook_path: ['/home/user/analysis.ipynb', 'notebooks/experiment.ipynb'],
  new_source: ['print("hello")', 'import numpy as np', 'x = [1, 2, 3]'],
  shell_id: ['shell-abc123', 'shell-001', 'bg-task-42'],
  description: ['List files in project', 'Run unit tests', 'Build the Docker image'],
};

function generateSampleValue(param: ToolSchemaParameter, rng: SeededRNG): string {
  if (param.enum && param.enum.length > 0) {
    return `${param.name} is "${rng.pick(param.enum)}"`;
  }

  // Check for semantic match on parameter name
  const nameLower = param.name.toLowerCase();
  const semanticMatch = SEMANTIC_VALUES[nameLower];
  if (semanticMatch) {
    return `${param.name} is "${rng.pick(semanticMatch)}"`;
  }

  const samplesByType: Record<string, string[]> = {
    string: [
      `the ${param.name} is "example_value"`,
      `${param.name}: "sample_data"`,
      `my ${param.name} is "test_input"`,
    ],
    number: [
      `the ${param.name} is 42`,
      `${param.name} should be 100`,
      `set ${param.name} to 7.5`,
    ],
    integer: [
      `the ${param.name} is 10`,
      `${param.name} should be 25`,
      `use ${param.name} of 3`,
    ],
    boolean: [
      `${param.name} should be true`,
      `set ${param.name} to false`,
      `enable ${param.name}`,
    ],
    array: [
      `${param.name} includes ["item1", "item2"]`,
      `the ${param.name} list is ["a", "b", "c"]`,
    ],
    object: [
      `the ${param.name} details are provided`,
      `${param.name} contains the relevant data`,
    ],
  };

  const samples = samplesByType[param.type] || samplesByType['string'];
  return rng.pick(samples);
}

// Need to import this type since we use it in generateSampleValue
import type { ToolSchemaParameter } from '../../schemas/types.js';

// ============================================================
// Main Generator
// ============================================================

/**
 * Generate single_tool selection tasks for a given set of tool schemas.
 *
 * Each task presents a natural-language query that maps to exactly ONE
 * tool from the available set. The ground_truth includes the correct
 * tool_name and expected parameters.
 *
 * @param tools     - Available tool schemas for this collection
 * @param scenario  - TAB scenario identifier (A-E)
 * @param source    - Source identifier for the collection
 * @param count     - Number of tasks to generate (default: 8)
 * @param seed      - Random seed for reproducibility (default: 42)
 * @returns Array of BenchmarkTask objects
 */
export function generateToolSelectionTasks(
  tools: ToolSchema[],
  scenario: Scenario = 'A',
  source: string = 'generated',
  count: number = 8,
  seed: number = 42,
): BenchmarkTask[] {
  if (tools.length === 0) return [];

  const rng = new SeededRNG(seed);
  const tasks: BenchmarkTask[] = [];
  const toolNames = tools.map((t) => t.name);

  // Difficulty distribution: 3 easy, 3 medium, 2 hard
  const difficulties: Difficulty[] = [
    'easy', 'easy', 'easy',
    'medium', 'medium', 'medium',
    'hard', 'hard',
  ];

  // Select target tools (cycle through if fewer tools than tasks)
  const shuffledTools = rng.shuffle(tools);

  for (let i = 0; i < count; i++) {
    const difficulty = difficulties[i % difficulties.length];
    const targetTool = shuffledTools[i % shuffledTools.length];
    const verb = extractVerb(targetTool);

    // Build ground truth FIRST with semantic values, then embed in query.
    // This ensures query content exactly matches expected parameters.
    const expectedParams: Record<string, unknown> = {};
    for (const param of targetTool.parameters.filter((p) => p.required)) {
      if (param.enum && param.enum.length > 0) {
        expectedParams[param.name] = rng.pick(param.enum);
      } else {
        expectedParams[param.name] = generateSemanticPlaceholder(param, rng);
      }
    }

    // Build param hint from the ground truth values
    const paramHint = Object.entries(expectedParams)
      .map(([key, val]) => {
        if (typeof val === 'string') return `${key} is "${val}"`;
        if (typeof val === 'boolean') return `${key} is ${val}`;
        if (typeof val === 'number') return `${key} is ${val}`;
        if (Array.isArray(val)) return `${key} is ${JSON.stringify(val)}`;
        return `${key} is ${JSON.stringify(val)}`;
      })
      .join(', ') || 'the necessary information';

    // Select template based on difficulty
    let query: string;
    switch (difficulty) {
      case 'easy':
        query = rng.pick(EASY_TEMPLATES)
          .replace('{tool_verb}', verb)
          .replace('{param_hint}', paramHint);
        break;
      case 'medium':
        query = rng.pick(MEDIUM_TEMPLATES)
          .replace('{tool_verb}', verb)
          .replace('{param_hint}', paramHint);
        break;
      case 'hard':
        query = rng.pick(HARD_TEMPLATES)
          .replace('{tool_verb}', verb)
          .replace('{param_hint}', paramHint);
        break;
    }

    const taskId = `tab-${scenario}-ts-${String(i + 1).padStart(3, '0')}`;

    tasks.push({
      task_id: taskId,
      scenario,
      category: 'single_tool',
      difficulty,
      source,
      query,
      tools: toolNames,
      ground_truth: {
        tool_name: targetTool.name,
        parameters: expectedParams,
      },
      metadata: {
        num_tools: tools.length,
      },
    });
  }

  return tasks;
}

/**
 * Generate a semantically-appropriate placeholder value for ground truth.
 * Must produce values that match what generateSampleValue puts in the query.
 *
 * IMPORTANT: The RNG state must be synchronized with generateSampleValue
 * calls so ground truth matches query content. Since both use the same
 * rng instance in the same order, values are deterministically aligned.
 */
function generateSemanticPlaceholder(param: ToolSchemaParameter, rng: SeededRNG): unknown {
  // Check for semantic match (same as generateSampleValue)
  const nameLower = param.name.toLowerCase();
  const semanticMatch = SEMANTIC_VALUES[nameLower];
  if (semanticMatch) {
    return rng.pick(semanticMatch);
  }

  switch (param.type) {
    case 'string':
      return 'example_value';
    case 'number':
      return 42;
    case 'integer':
      return 10;
    case 'boolean':
      return true;
    case 'array':
      return ['item1', 'item2'];
    case 'object':
      return {};
    default:
      return 'example_value';
  }
}
