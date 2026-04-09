/**
 * Smoke test: Verify SAD produces different output for balanced vs aggressive profiles.
 */
import { compress } from '../../packages/core/src/compress.js';

const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'WebFetch',
      description: 'Fetches content from a specified URL and processes it using an AI model.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch content from' },
          prompt: { type: 'string', description: 'The prompt to run on the fetched content' },
        },
        required: ['url', 'prompt'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'ReadFile',
      description: 'Reads a file from the local filesystem. Returns the content of the file.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'The absolute path to the file to read' },
          offset: { type: 'number', description: 'The line number to start reading from' },
          limit: { type: 'number', description: 'The number of lines to read' },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'Bash',
      description: 'Executes a given bash command in a persistent shell session with optional timeout.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The command to execute' },
          timeout: { type: 'number', description: 'Optional timeout in milliseconds' },
        },
        required: ['command'],
      },
    },
  },
];

// Test balanced profile (should NOT have ANCHOR)
const balanced = compress(tools, { profile: 'balanced', model: 'claude-sonnet' });
console.log('=== BALANCED (tscg) ===');
console.log(balanced.compressed);
console.log('Tokens:', balanced.metrics.tokens.compressed);
console.log('Savings:', balanced.metrics.tokens.savingsPercent + '%');
console.log('Principles:', balanced.appliedPrinciples.join(', '));
console.log('');

// Test aggressive profile (should have ANCHOR)
const aggressive = compress(tools, { profile: 'aggressive', model: 'claude-sonnet' });
console.log('=== AGGRESSIVE (tscg_sad) ===');
console.log(aggressive.compressed);
console.log('Tokens:', aggressive.metrics.tokens.compressed);
console.log('Savings:', aggressive.metrics.tokens.savingsPercent + '%');
console.log('Principles:', aggressive.appliedPrinciples.join(', '));
console.log('');

// Verify they're different
console.log('=== COMPARISON ===');
console.log('Same output?', balanced.compressed === aggressive.compressed);
console.log('Balanced length:', balanced.compressed.length);
console.log('Aggressive length:', aggressive.compressed.length);
console.log('Has ANCHOR tag?', aggressive.compressed.includes('[ANCHOR:'));
