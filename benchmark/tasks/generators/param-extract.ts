/**
 * TAB Benchmark — Parameter Extraction Task Generator
 *
 * Generates parameter_extraction tasks where the correct tool is obvious
 * but the parameters are complex to extract from natural language.
 * Tests the model's ability to handle:
 *   - Enum value extraction
 *   - Nested/structured values
 *   - Optional parameter detection
 *   - Multiple parameter values in a single utterance
 *
 * Distribution per collection:
 *   - medium (2): Clear params with enums or multiple required fields
 *   - hard (2):   Complex params with optional fields and implicit values
 *
 * Total: 4 parameter_extraction tasks per schema collection
 */

import type { ToolSchema, ToolSchemaParameter } from '../../schemas/types.js';
import type { BenchmarkTask, Difficulty, Scenario } from '../types.js';

// ============================================================
// Seeded RNG
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
// Query Templates for Parameter Extraction
// ============================================================

/**
 * Medium templates: parameters are explicitly stated in the query.
 */
const MEDIUM_TEMPLATES = [
  'Use {tool_name} with {param_list}.',
  'I want to {tool_verb}. Here are the details: {param_list}.',
  'Please {tool_verb} using {param_list}.',
  'Run {tool_name}: {param_list}.',
];

/**
 * Hard templates: parameters are embedded in natural language,
 * some optional params are hinted at indirectly.
 */
const HARD_TEMPLATES = [
  '{param_narrative}. Please {tool_verb}.',
  '{param_narrative}. I think {tool_name} would be the right approach.',
  'Here is my situation: {param_narrative}. Please help me {tool_verb}.',
  'So basically, {param_narrative} and I need you to {tool_verb} for me.',
];

// ============================================================
// Helper Functions
// ============================================================

/**
 * Score a tool by parameter complexity (more params + enums = higher).
 */
function parameterComplexity(tool: ToolSchema): number {
  let score = 0;
  for (const param of tool.parameters) {
    score += 1; // base
    if (param.enum && param.enum.length > 0) score += 2; // enums add complexity
    if (!param.required) score += 1; // optional params add extraction difficulty
    if (param.type === 'object' || param.type === 'array') score += 3;
  }
  return score;
}

/**
 * Select tools that have the most complex parameter structures.
 * These are the best candidates for parameter extraction tasks.
 */
function selectComplexTools(
  tools: ToolSchema[],
  count: number,
  rng: SeededRNG,
): ToolSchema[] {
  // Sort by complexity, pick top candidates, then shuffle
  const scored = tools
    .map((t) => ({ tool: t, complexity: parameterComplexity(t) }))
    .sort((a, b) => b.complexity - a.complexity);

  // Take top 2x candidates and randomly pick from them
  const candidates = scored.slice(0, Math.min(count * 2, scored.length));
  const shuffled = rng.shuffle(candidates);
  return shuffled.slice(0, count).map((c) => c.tool);
}

/**
 * Third-person → imperative verb mapping.
 */
const VERB_MAP: Record<string, string> = {
  gets: 'get', fetches: 'fetch', retrieves: 'retrieve',
  searches: 'search', finds: 'find', lists: 'list',
  creates: 'create', updates: 'update', deletes: 'delete',
  sends: 'send', reads: 'read', writes: 'write',
  executes: 'execute', runs: 'run', checks: 'check',
  performs: 'perform', kills: 'kill', replaces: 'replace',
  launches: 'launch', saves: 'save', edits: 'edit',
};

/**
 * Extract a concise imperative verb phrase from tool description.
 * Falls back to "use {tool_name}" when the description doesn't start
 * with a recognized verb.
 */
function extractVerb(tool: ToolSchema): string {
  const desc = tool.description;
  const words = desc.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return `use ${tool.name}`;

  const firstWord = words[0].toLowerCase();
  const imperative = VERB_MAP[firstWord];

  if (imperative) {
    words[0] = imperative;
    return words.slice(0, 8).join(' ').toLowerCase();
  }

  // If no recognized verb, use explicit tool name
  return `use ${tool.name}`;
}

/**
 * Generate a realistic value for a parameter, suitable for ground truth.
 */
function generateRealisticValue(
  param: ToolSchemaParameter,
  rng: SeededRNG,
): unknown {
  if (param.enum && param.enum.length > 0) {
    return rng.pick(param.enum);
  }

  switch (param.type) {
    case 'string': {
      const names = ['Berlin', 'config.json', 'user@example.com', 'production', 'main', 'quarterly-report'];
      return rng.pick(names);
    }
    case 'number':
      return Math.round((10 + rng.next() * 990) * 100) / 100;
    case 'integer':
      return 1 + rng.nextInt(100);
    case 'boolean':
      return rng.next() > 0.5;
    case 'array':
      return ['value1', 'value2', 'value3'].slice(0, 1 + rng.nextInt(3));
    case 'object':
      return { key: 'value' };
    default:
      return 'sample_value';
  }
}

/**
 * Generate an explicit parameter list string (for medium difficulty).
 * E.g., "location is 'Berlin', unit is 'celsius', include_forecast is true"
 */
function generateExplicitParamList(
  params: Array<{ param: ToolSchemaParameter; value: unknown }>,
): string {
  return params
    .map(({ param, value }) => {
      if (typeof value === 'string') return `${param.name} is "${value}"`;
      if (typeof value === 'boolean') return `${param.name} is ${value}`;
      if (typeof value === 'number') return `${param.name} is ${value}`;
      if (Array.isArray(value)) return `${param.name} is [${value.map((v) => `"${v}"`).join(', ')}]`;
      return `${param.name} is ${JSON.stringify(value)}`;
    })
    .join(', ');
}

/**
 * Generate a natural narrative embedding parameters (for hard difficulty).
 * E.g., "I'm looking at Berlin weather and want it in celsius with the forecast"
 */
function generateParamNarrative(
  params: Array<{ param: ToolSchemaParameter; value: unknown }>,
  rng: SeededRNG,
): string {
  const parts: string[] = [];

  for (const { param, value } of params) {
    const phrasing = [
      `the ${param.name} should be ${JSON.stringify(value)}`,
      `I want ${param.name} set to ${JSON.stringify(value)}`,
      `for ${param.name} use ${JSON.stringify(value)}`,
      `${param.name} = ${JSON.stringify(value)}`,
    ];
    parts.push(rng.pick(phrasing));
  }

  return parts.join(', and ');
}

// ============================================================
// Main Generator
// ============================================================

/**
 * Generate parameter_extraction tasks where the tool is obvious
 * but parameters are complex to extract.
 *
 * @param tools     - Available tool schemas
 * @param scenario  - TAB scenario identifier
 * @param source    - Source identifier
 * @param count     - Number of tasks (default: 4)
 * @param seed      - Random seed (default: 42)
 * @returns Array of BenchmarkTask objects with parameter_extraction category
 */
export function generateParamExtractionTasks(
  tools: ToolSchema[],
  scenario: Scenario = 'A',
  source: string = 'generated',
  count: number = 4,
  seed: number = 42,
): BenchmarkTask[] {
  if (tools.length === 0) return [];

  const rng = new SeededRNG(seed + 2000); // Offset to avoid seed collisions
  const tasks: BenchmarkTask[] = [];
  const toolNames = tools.map((t) => t.name);

  // Select tools with complex parameters
  const selectedTools = selectComplexTools(tools, count, rng);

  // Difficulty distribution: 2 medium, 2 hard
  const difficulties: Difficulty[] = ['medium', 'medium', 'hard', 'hard'];

  for (let i = 0; i < count; i++) {
    const difficulty = difficulties[i % difficulties.length];
    const tool = selectedTools[i % selectedTools.length];
    const verb = extractVerb(tool);

    // Determine which parameters to include in the query
    const requiredParams = tool.parameters.filter((p) => p.required);
    const optionalParams = tool.parameters.filter((p) => !p.required);

    // For medium: use only required params
    // For hard: include some optional params too
    let selectedParams: ToolSchemaParameter[];
    if (difficulty === 'medium') {
      selectedParams = requiredParams.length > 0
        ? requiredParams
        : tool.parameters.slice(0, Math.min(2, tool.parameters.length));
    } else {
      selectedParams = [
        ...requiredParams,
        ...optionalParams.slice(0, Math.min(2, optionalParams.length)),
      ];
    }

    // Generate values for each parameter
    const paramValues = selectedParams.map((param) => ({
      param,
      value: generateRealisticValue(param, rng),
    }));

    // Build query
    let query: string;
    if (difficulty === 'medium') {
      const template = rng.pick(MEDIUM_TEMPLATES);
      const paramList = generateExplicitParamList(paramValues);
      query = template
        .replace('{tool_name}', tool.name)
        .replace('{tool_verb}', verb)
        .replace('{param_list}', paramList);
    } else {
      const template = rng.pick(HARD_TEMPLATES);
      const narrative = generateParamNarrative(paramValues, rng);
      query = template
        .replace('{tool_name}', tool.name)
        .replace('{tool_verb}', verb)
        .replace('{param_narrative}', narrative);
    }

    // Build ground truth parameters
    const expectedParams: Record<string, unknown> = {};
    for (const { param, value } of paramValues) {
      expectedParams[param.name] = value;
    }

    const taskId = `tab-${scenario}-pe-${String(i + 1).padStart(3, '0')}`;

    tasks.push({
      task_id: taskId,
      scenario,
      category: 'parameter_extraction',
      difficulty,
      source,
      query,
      tools: toolNames,
      ground_truth: {
        tool_name: tool.name,
        parameters: expectedParams,
      },
      metadata: {
        num_tools: tools.length,
      },
    });
  }

  return tasks;
}
