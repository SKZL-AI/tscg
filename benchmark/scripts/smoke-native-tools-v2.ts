#!/usr/bin/env node
/**
 * Smoke test v2: Direct API call with native tools to verify GPT-4o tool calling.
 * Bypasses the runner entirely to isolate the issue.
 */

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error('OPENAI_API_KEY not set');
  process.exit(1);
}

async function main() {
  // Minimal tool definition
  const tools = [
    {
      type: 'function' as const,
      function: {
        name: 'WebFetch',
        description: 'Fetches content from a URL and returns it as text.',
        parameters: {
          type: 'object' as const,
          properties: {
            url: { type: 'string', description: 'The URL to fetch' },
            prompt: { type: 'string', description: 'What to extract from the page' },
          },
          required: ['url', 'prompt'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'Bash',
        description: 'Executes a bash command.',
        parameters: {
          type: 'object' as const,
          properties: {
            command: { type: 'string', description: 'The command to execute' },
          },
          required: ['command'],
        },
      },
    },
  ];

  // Test queries: one capability-question, one action-request
  const queries = [
    'Can you fetches content from a url and returns it as text?',  // Original (bad)
    'Please fetch the content from https://example.com and summarize it.',  // Action request
    'Fetch content from https://example.com for me. Extract the main heading.',  // Direct command
  ];

  for (const query of queries) {
    console.log(`\n--- Query: "${query}" ---`);

    // Test 1: WITH native tools
    const body1 = {
      model: 'gpt-4o-2024-08-06',
      messages: [
        { role: 'system', content: 'You are a helpful assistant with access to tools. Use the appropriate tool when the user request requires one. If no tool is needed, respond normally without using a tool.' },
        { role: 'user', content: query },
      ],
      tools,
      temperature: 0,
      max_tokens: 256,
    };

    const resp1 = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify(body1),
    });

    const data1 = await resp1.json() as any;
    const choice1 = data1.choices?.[0];
    const hasToolCalls = choice1?.message?.tool_calls?.length > 0;
    const finishReason = choice1?.finish_reason;
    const content = choice1?.message?.content ?? '(null)';

    console.log(`  WITH native tools:`);
    console.log(`    finish_reason: ${finishReason}`);
    console.log(`    has_tool_calls: ${hasToolCalls}`);
    if (hasToolCalls) {
      for (const tc of choice1.message.tool_calls) {
        console.log(`    tool_call: ${tc.function.name}(${tc.function.arguments})`);
      }
    } else {
      console.log(`    content: ${content.substring(0, 200)}`);
    }

    // Delay to avoid rate limits
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
