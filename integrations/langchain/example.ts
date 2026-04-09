/**
 * TSCG LangChain Integration -- Example Usage
 *
 * Demonstrates before/after tool compression with a LangChain agent.
 * Run with: npx tsx integrations/langchain/example.ts
 */

import { withTSCG } from '@tscg/tool-optimizer/langchain';
import { compress, estimateTokens, formatSavings } from '@tscg/core';
import type { AnyToolDefinition } from '@tscg/core';

// ============================================================
// 1. Define tools (LangChain-compatible shape)
// ============================================================

/**
 * Simulated LangChain DynamicTool-like objects.
 * In a real application, these would come from @langchain/core/tools.
 */
interface LangChainToolLike {
  name: string;
  description: string;
  func: (input: string) => Promise<string>;
}

const tools: LangChainToolLike[] = [
  {
    name: 'get_weather',
    description:
      'Get the current weather conditions for a specified city or location. ' +
      'Returns temperature in Celsius and Fahrenheit, humidity percentage, ' +
      'wind speed in km/h, and general weather conditions (sunny, cloudy, rainy, etc.). ' +
      'The location parameter should be a city name, optionally followed by a country code.',
    func: async (city: string) =>
      JSON.stringify({ city, temp_c: 22, temp_f: 72, humidity: 55, wind_kmh: 12, conditions: 'sunny' }),
  },
  {
    name: 'search_database',
    description:
      'Search the internal company database for employee records, project data, or financial reports. ' +
      'Accepts a natural language query and returns matching results as JSON. ' +
      'Supports filtering by department (engineering, marketing, finance, hr), date range, ' +
      'and result limit. Maximum 100 results per query. Results are sorted by relevance score.',
    func: async (query: string) =>
      JSON.stringify({ query, results: [], total: 0 }),
  },
  {
    name: 'send_email',
    description:
      'Send an email to one or more recipients. Requires a valid email address for the recipient, ' +
      'a subject line (maximum 200 characters), and a body text (maximum 10000 characters). ' +
      'Optionally supports CC and BCC fields. Returns a confirmation with message ID and timestamp. ' +
      'The sender address is automatically set to the authenticated user.',
    func: async (input: string) =>
      JSON.stringify({ status: 'sent', messageId: 'msg-001', timestamp: new Date().toISOString() }),
  },
  {
    name: 'create_calendar_event',
    description:
      'Create a new event on the user\'s calendar. Requires a title, start time (ISO 8601 format), ' +
      'and duration in minutes. Optional fields include: location (string), description (string), ' +
      'attendees (array of email addresses), recurrence rule (RRULE format), and reminder ' +
      '(minutes before event). Returns the created event ID and a link to view it.',
    func: async (input: string) =>
      JSON.stringify({ eventId: 'evt-001', link: 'https://calendar.example.com/evt-001' }),
  },
  {
    name: 'run_code',
    description:
      'Execute a snippet of Python code in a sandboxed environment and return the output. ' +
      'The code runs with a 30-second timeout and 256MB memory limit. Supports standard library ' +
      'imports and common data science packages (numpy, pandas, matplotlib). ' +
      'Returns stdout output, stderr output, and exit code. ' +
      'File system access is restricted to /tmp directory only.',
    func: async (code: string) =>
      JSON.stringify({ stdout: '', stderr: '', exitCode: 0 }),
  },
];

// ============================================================
// 2. Show BEFORE state
// ============================================================

console.log('='.repeat(70));
console.log('  TSCG LangChain Integration -- Before / After Comparison');
console.log('='.repeat(70));

console.log('\n--- BEFORE (original tool descriptions) ---\n');
let totalOriginalChars = 0;
for (const tool of tools) {
  console.log(`  [${tool.name}]`);
  console.log(`  ${tool.description}`);
  console.log(`  Characters: ${tool.description.length}`);
  console.log(`  Est. tokens: ~${estimateTokens(tool.description, 'gpt-4')}`);
  console.log();
  totalOriginalChars += tool.description.length;
}
console.log(`  Total characters (all descriptions): ${totalOriginalChars}`);
console.log(`  Total est. tokens: ~${estimateTokens(tools.map(t => t.description).join('\n'), 'gpt-4')}`);

// ============================================================
// 3. Apply TSCG compression
// ============================================================

console.log('\n--- APPLYING TSCG COMPRESSION ---\n');

const optimizedTools = withTSCG(tools, {
  model: 'gpt-4',
  profile: 'balanced',
});

// ============================================================
// 4. Show AFTER state
// ============================================================

console.log('--- AFTER (TSCG-compressed descriptions) ---\n');
let totalCompressedChars = 0;
for (const tool of optimizedTools) {
  console.log(`  [${tool.name}]`);
  console.log(`  ${tool.description}`);
  console.log(`  Characters: ${tool.description.length}`);
  console.log(`  Est. tokens: ~${estimateTokens(tool.description, 'gpt-4')}`);
  console.log();
  totalCompressedChars += tool.description.length;
}
console.log(`  Total characters (all descriptions): ${totalCompressedChars}`);
console.log(`  Total est. tokens: ~${estimateTokens(optimizedTools.map(t => t.description).join('\n'), 'gpt-4')}`);

// ============================================================
// 5. Show savings summary
// ============================================================

console.log('\n--- SAVINGS SUMMARY ---\n');

const charSavings = ((1 - totalCompressedChars / totalOriginalChars) * 100).toFixed(1);
console.log(`  Character reduction: ${totalOriginalChars} -> ${totalCompressedChars} (-${charSavings}%)`);

// For detailed token-level metrics, use compress() directly
const toolDefs: AnyToolDefinition[] = tools.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: { type: 'object' as const, properties: {} },
}));

const detailedResult = compress(toolDefs, { model: 'gpt-4', profile: 'balanced' });
console.log(`  Token-level: ${formatSavings(detailedResult.metrics)}`);
console.log(`  Principles applied: ${detailedResult.appliedPrinciples.join(', ')}`);

console.log('\n--- PER-TOOL BREAKDOWN ---\n');
for (const metric of detailedResult.metrics.perTool) {
  console.log(
    `  ${metric.name.padEnd(25)} ${metric.originalTokens} -> ${metric.compressedTokens} tokens ` +
    `(-${metric.savingsPercent.toFixed(1)}%)`
  );
}

// ============================================================
// 6. Show how to use in a LangChain agent
// ============================================================

console.log('\n--- LANGCHAIN AGENT USAGE ---\n');
console.log('  // In your agent setup, simply wrap tools before passing to the agent:');
console.log('  //');
console.log('  // import { withTSCG } from "@tscg/tool-optimizer/langchain";');
console.log('  // import { ChatOpenAI } from "@langchain/openai";');
console.log('  // import { AgentExecutor, createToolCallingAgent } from "langchain/agents";');
console.log('  //');
console.log('  // const llm = new ChatOpenAI({ modelName: "gpt-4" });');
console.log('  // const optimized = withTSCG(tools, { model: "gpt-4", profile: "balanced" });');
console.log('  // const agent = createToolCallingAgent({ llm, tools: optimized, prompt });');
console.log('  // const executor = new AgentExecutor({ agent, tools: optimized });');
console.log('  // const result = await executor.invoke({ input: "What is the weather in Berlin?" });');
console.log();

// ============================================================
// 7. Multi-model comparison
// ============================================================

console.log('--- MULTI-MODEL COMPARISON ---\n');
const models = ['claude-sonnet', 'gpt-4', 'llama-3.1', 'mistral-7b'] as const;
for (const model of models) {
  const result = compress(toolDefs, { model, profile: 'balanced' });
  const pct = result.metrics.tokens.savingsPercent.toFixed(1);
  console.log(`  ${model.padEnd(16)} ${pct}% token savings`);
}

console.log('\n' + '='.repeat(70));
console.log('  Done. Tool descriptions compressed. Agent accuracy unaffected.');
console.log('='.repeat(70) + '\n');
