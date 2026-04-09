/**
 * TAB Benchmark — No-Tool Task Generator
 *
 * Generates no_tool tasks where no tool call should be made.
 * The model must recognize that the user's request does NOT match
 * any available tool and respond with natural language instead.
 *
 * Task categories:
 *   - General knowledge questions (answerable without tools)
 *   - Math/reasoning problems (no tool needed)
 *   - Opinion/subjective questions (tools cannot help)
 *   - Meta-questions about the tools themselves
 *
 * Distribution per collection:
 *   - easy (2):   Obviously unrelated to any available tool
 *   - medium (2): Superficially similar to tool domains but not matching
 *
 * Total: 4 no_tool tasks per schema collection
 */

import type { ToolSchema } from '../../schemas/types.js';
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
// No-Tool Query Banks
// ============================================================

/**
 * Easy no-tool queries: clearly unrelated to any tool domain.
 * These test basic rejection capability.
 */
const GENERAL_KNOWLEDGE_QUERIES = [
  'What is the capital of France?',
  'Who wrote Romeo and Juliet?',
  'What is the speed of light in a vacuum?',
  'How many continents are there on Earth?',
  'What year did World War II end?',
  'What is the chemical formula for water?',
  'Who painted the Mona Lisa?',
  'What is the largest planet in our solar system?',
  'What language is spoken in Brazil?',
  'What is the boiling point of water in Celsius?',
];

const MATH_REASONING_QUERIES = [
  'What is 15% of 240?',
  'If a train travels 60 mph for 2.5 hours, how far does it go?',
  'What is the square root of 144?',
  'A rectangle has length 8cm and width 5cm. What is its area?',
  'If you have 3 dozen eggs and use 7, how many remain?',
  'What is 2 to the power of 10?',
  'A shirt costs $40 and is 25% off. What is the sale price?',
  'How many seconds are in one hour?',
];

const OPINION_QUERIES = [
  'What do you think is the best programming language to learn first?',
  'Is it better to work from home or in an office?',
  'What is your opinion on artificial intelligence in education?',
  'Do you think electric cars will completely replace gas cars?',
  'What makes a good software engineer?',
  'Is TypeScript better than JavaScript?',
  'What is the meaning of life?',
  'Should I learn Python or Rust as my next language?',
];

/**
 * Medium no-tool queries: superficially related to common tool domains
 * but not actually matching any specific tool. These test the model's
 * ability to resist calling a "close but wrong" tool.
 */
const DOMAIN_ADJACENT_TEMPLATES = [
  'Can you explain how {domain} works in general?',
  'What are the best practices for {domain}?',
  'I want to learn more about {domain}. Where should I start?',
  'What is the history of {domain}?',
  'Compare the pros and cons of different {domain} approaches.',
  'Why is {domain} important in modern software development?',
  'What are common mistakes people make with {domain}?',
  'How has {domain} evolved over the last decade?',
];

/**
 * Meta-questions about the tools themselves.
 */
const META_QUERIES = [
  'How many tools do you have available?',
  'Which of your tools is the most useful?',
  'Can you list all the tools you have access to?',
  'What limitations do your tools have?',
  'Are there any tools you wish you had but do not?',
  'How do you decide which tool to use?',
];

// ============================================================
// Helper Functions
// ============================================================

/**
 * Extract a domain keyword from tool descriptions for generating
 * domain-adjacent queries.
 */
function extractDomainKeywords(tools: ToolSchema[]): string[] {
  const keywords = new Set<string>();
  const domainWords = [
    'file', 'search', 'email', 'weather', 'stock', 'database',
    'api', 'code', 'web', 'chat', 'image', 'audio', 'video',
    'calendar', 'payment', 'notification', 'user', 'auth',
    'storage', 'analytics', 'deployment', 'monitoring',
  ];

  for (const tool of tools) {
    const desc = tool.description.toLowerCase();
    for (const word of domainWords) {
      if (desc.includes(word) || tool.name.toLowerCase().includes(word)) {
        keywords.add(word);
      }
    }
  }

  // Always include some generic domains
  keywords.add('software architecture');
  keywords.add('version control');
  keywords.add('code review');

  return [...keywords];
}

// ============================================================
// Main Generator
// ============================================================

/**
 * Generate no_tool tasks that should NOT trigger any tool call.
 *
 * The model must recognize that no available tool matches the user's
 * request and respond with natural language only.
 *
 * @param tools     - Available tool schemas (used to generate domain-adjacent queries)
 * @param scenario  - TAB scenario identifier
 * @param source    - Source identifier
 * @param count     - Number of tasks (default: 4)
 * @param seed      - Random seed (default: 42)
 * @returns Array of BenchmarkTask objects with no_tool category
 */
export function generateNoToolTasks(
  tools: ToolSchema[],
  scenario: Scenario = 'A',
  source: string = 'generated',
  count: number = 4,
  seed: number = 42,
): BenchmarkTask[] {
  const rng = new SeededRNG(seed + 3000); // Offset to avoid seed collisions
  const tasks: BenchmarkTask[] = [];
  const toolNames = tools.map((t) => t.name);
  const domainKeywords = extractDomainKeywords(tools);

  // Difficulty distribution: 2 easy, 2 medium
  const difficulties: Difficulty[] = ['easy', 'easy', 'medium', 'medium'];

  // Build query pool
  const easyPool = rng.shuffle([
    ...GENERAL_KNOWLEDGE_QUERIES,
    ...MATH_REASONING_QUERIES,
    ...OPINION_QUERIES,
    ...META_QUERIES,
  ]);

  const mediumPool: string[] = [];
  for (const template of DOMAIN_ADJACENT_TEMPLATES) {
    for (const keyword of domainKeywords) {
      mediumPool.push(template.replace('{domain}', keyword));
    }
  }
  const shuffledMedium = rng.shuffle(mediumPool);

  let easyIdx = 0;
  let mediumIdx = 0;

  for (let i = 0; i < count; i++) {
    const difficulty = difficulties[i % difficulties.length];

    let query: string;
    if (difficulty === 'easy') {
      query = easyPool[easyIdx % easyPool.length];
      easyIdx++;
    } else {
      query = shuffledMedium[mediumIdx % shuffledMedium.length];
      mediumIdx++;
    }

    const taskId = `tab-${scenario}-nt-${String(i + 1).padStart(3, '0')}`;

    tasks.push({
      task_id: taskId,
      scenario,
      category: 'no_tool',
      difficulty,
      source,
      query,
      tools: toolNames,
      ground_truth: {
        action: 'no_tool_call',
      },
      metadata: {
        num_tools: tools.length,
      },
    });
  }

  return tasks;
}
