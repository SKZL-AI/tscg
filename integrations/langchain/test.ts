/**
 * TSCG LangChain Integration -- Tests
 *
 * Basic tests for the withTSCG() wrapper function.
 * Run with: npx tsx integrations/langchain/test.ts
 *
 * These tests verify:
 * 1. Output array length matches input
 * 2. Tool names are preserved
 * 3. Descriptions are modified (compressed)
 * 4. Non-description properties are preserved
 * 5. Empty array input handled gracefully
 * 6. Single tool input works
 * 7. Options (model, profile) are respected
 * 8. Compressed descriptions are shorter than originals
 */

import { withTSCG } from '@tscg/tool-optimizer/langchain';
import type { ToolLike } from '@tscg/tool-optimizer/langchain';

// ============================================================
// Test Infrastructure
// ============================================================

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  FAIL: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    failures.push(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    console.log(`  FAIL: ${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

// ============================================================
// Test Data
// ============================================================

function createTestTools(): ToolLike[] {
  return [
    {
      name: 'get_weather',
      description:
        'Get the current weather conditions for a specified city or location. ' +
        'Returns temperature in Celsius and Fahrenheit, humidity percentage, ' +
        'wind speed in km/h, and general weather conditions.',
    },
    {
      name: 'search_database',
      description:
        'Search the internal company database for employee records, project data, ' +
        'or financial reports. Accepts a natural language query and returns matching ' +
        'results as JSON. Supports filtering by department, date range, and result limit.',
    },
    {
      name: 'send_email',
      description:
        'Send an email to one or more recipients. Requires a valid email address ' +
        'for the recipient, a subject line (maximum 200 characters), and a body text ' +
        '(maximum 10000 characters). Returns a confirmation with message ID and timestamp.',
    },
  ];
}

// ============================================================
// Tests
// ============================================================

console.log('\n  TSCG LangChain Integration Tests');
console.log('  ' + '='.repeat(50) + '\n');

// --- Test 1: Output array length matches input ---
console.log('  Test 1: Output array length matches input');
{
  const tools = createTestTools();
  const result = withTSCG(tools);
  assertEqual(result.length, tools.length, 'Array length preserved');
}

// --- Test 2: Tool names are preserved ---
console.log('\n  Test 2: Tool names are preserved');
{
  const tools = createTestTools();
  const result = withTSCG(tools);
  for (let i = 0; i < tools.length; i++) {
    assertEqual(result[i].name, tools[i].name, `Tool name preserved: ${tools[i].name}`);
  }
}

// --- Test 3: Descriptions are modified ---
console.log('\n  Test 3: Descriptions are modified (compressed)');
{
  const tools = createTestTools();
  const result = withTSCG(tools, { profile: 'aggressive' });
  let anyModified = false;
  for (let i = 0; i < tools.length; i++) {
    if (result[i].description !== tools[i].description) {
      anyModified = true;
    }
  }
  assert(anyModified, 'At least one description was compressed');
}

// --- Test 4: Non-description properties are preserved ---
console.log('\n  Test 4: Non-description properties are preserved');
{
  interface ExtendedTool extends ToolLike {
    customField: string;
    metadata: { version: number };
  }

  const tools: ExtendedTool[] = [
    {
      name: 'test_tool',
      description: 'A test tool that does something useful with provided data.',
      customField: 'custom-value',
      metadata: { version: 42 },
    },
  ];

  const result = withTSCG(tools) as ExtendedTool[];
  assertEqual(result[0].customField, 'custom-value', 'Custom field preserved');
  assertEqual(
    (result[0].metadata as { version: number }).version,
    42,
    'Metadata object preserved'
  );
  assertEqual(result[0].name, 'test_tool', 'Name preserved');
}

// --- Test 5: Empty array input ---
console.log('\n  Test 5: Empty array input handled gracefully');
{
  const result = withTSCG([]);
  assertEqual(result.length, 0, 'Empty input returns empty output');
}

// --- Test 6: Single tool input ---
console.log('\n  Test 6: Single tool input works');
{
  const tools: ToolLike[] = [
    {
      name: 'single_tool',
      description:
        'This is a single tool that performs a complex operation including ' +
        'data validation, transformation, and storage in the database.',
    },
  ];

  const result = withTSCG(tools, { model: 'claude-sonnet' });
  assertEqual(result.length, 1, 'Single tool: array length is 1');
  assertEqual(result[0].name, 'single_tool', 'Single tool: name preserved');
  assert(typeof result[0].description === 'string', 'Single tool: description is string');
  assert(result[0].description.length > 0, 'Single tool: description is non-empty');
}

// --- Test 7: Options are respected ---
console.log('\n  Test 7: Different models produce results');
{
  const tools = createTestTools();

  const resultGPT = withTSCG(tools, { model: 'gpt-4', profile: 'balanced' });
  const resultClaude = withTSCG(tools, { model: 'claude-sonnet', profile: 'balanced' });

  assert(resultGPT.length === tools.length, 'GPT-4 model: correct output length');
  assert(resultClaude.length === tools.length, 'Claude Sonnet model: correct output length');

  // Both should produce valid outputs
  for (const tool of resultGPT) {
    assert(typeof tool.description === 'string' && tool.description.length > 0,
      `GPT-4 result for ${tool.name}: description is non-empty string`);
  }
  for (const tool of resultClaude) {
    assert(typeof tool.description === 'string' && tool.description.length > 0,
      `Claude result for ${tool.name}: description is non-empty string`);
  }
}

// --- Test 8: Compressed descriptions are shorter ---
console.log('\n  Test 8: Compressed descriptions are shorter than originals');
{
  const tools = createTestTools();
  const result = withTSCG(tools, { profile: 'aggressive' });

  let totalOriginal = 0;
  let totalCompressed = 0;
  for (let i = 0; i < tools.length; i++) {
    totalOriginal += tools[i].description.length;
    totalCompressed += result[i].description.length;
  }

  assert(
    totalCompressed <= totalOriginal,
    `Total chars reduced: ${totalOriginal} -> ${totalCompressed} (-${((1 - totalCompressed / totalOriginal) * 100).toFixed(1)}%)`
  );
}

// --- Test 9: Original tools are not mutated ---
console.log('\n  Test 9: Original tools are not mutated');
{
  const tools = createTestTools();
  const originalDescs = tools.map(t => t.description);

  withTSCG(tools, { profile: 'aggressive' });

  for (let i = 0; i < tools.length; i++) {
    assertEqual(tools[i].description, originalDescs[i],
      `Original tool ${tools[i].name} not mutated`);
  }
}

// --- Test 10: Profile options affect compression ---
console.log('\n  Test 10: Profile options affect compression level');
{
  const tools = createTestTools();
  const conservative = withTSCG(tools, { profile: 'conservative' });
  const aggressive = withTSCG(tools, { profile: 'aggressive' });

  const conservativeLen = conservative.reduce((sum, t) => sum + t.description.length, 0);
  const aggressiveLen = aggressive.reduce((sum, t) => sum + t.description.length, 0);

  // Aggressive should produce shorter or equal output compared to conservative
  assert(
    aggressiveLen <= conservativeLen,
    `Aggressive (${aggressiveLen} chars) <= Conservative (${conservativeLen} chars)`
  );
}

// ============================================================
// Summary
// ============================================================

console.log('\n  ' + '='.repeat(50));
console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

if (failures.length > 0) {
  console.log('\n  Failures:');
  for (const f of failures) {
    console.log(`    - ${f}`);
  }
}

console.log();
process.exit(failed > 0 ? 1 : 0);
