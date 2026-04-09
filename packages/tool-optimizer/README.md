# @tscg/tool-optimizer

High-level tool-schema optimizer for LLM agent frameworks. Drop-in integration for **LangChain**, **MCP** (Model Context Protocol), and **Vercel AI SDK**.

Built on top of [`@tscg/core`](https://www.npmjs.com/package/@tscg/core) -- the deterministic prompt compiler that reduces tool-definition overhead by 71.7%.

## Installation

```bash
npm install @tscg/tool-optimizer @tscg/core
```

```bash
pnpm add @tscg/tool-optimizer @tscg/core
```

**Peer dependency:** `@tscg/core ^1.0.0` is required and must be installed alongside this package.

**Requirements:** Node.js >= 18.0.0

## LangChain Integration

The `withTSCG()` wrapper compresses tool descriptions for any LangChain-compatible tool array.

```typescript
import { withTSCG } from '@tscg/tool-optimizer';
// or: import { withTSCG } from '@tscg/tool-optimizer/langchain';

import { ChatAnthropic } from '@langchain/anthropic';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import { Calculator } from '@langchain/community/tools/calculator';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

// Define your tools
const tools = [
  new TavilySearchResults({ maxResults: 3 }),
  new Calculator(),
  // ... more tools
];

// Compress tool descriptions with TSCG
const optimizedTools = withTSCG(tools, {
  model: 'claude-sonnet',
  profile: 'balanced',
});

// Use with any LangChain agent
const agent = createReactAgent({
  llm: new ChatAnthropic({ model: 'claude-sonnet-4-20250514' }),
  tools: optimizedTools,
});

const result = await agent.invoke({
  messages: [{ role: 'user', content: 'What is the weather in Berlin?' }],
});
```

### `withTSCG(tools, options?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `tools` | `ToolLike[]` | Array of objects with `name` and `description` properties |
| `options` | `CompilerOptions` | TSCG compiler options (model, profile, principles) |

**Returns:** A new array of tools with compressed descriptions. Original tools are not mutated.

## MCP Integration

The `createTSCGMCPProxy` function creates a proxy that intercepts MCP `tools/list` responses and compresses tool schemas transparently.

```typescript
import { createTSCGMCPProxy } from '@tscg/tool-optimizer/mcp';

// Create a TSCG-enabled MCP proxy
const proxy = createTSCGMCPProxy({
  serverCommand: 'npx',
  serverArgs: ['-y', '@modelcontextprotocol/server-github'],
  model: 'claude-sonnet',
});

// Compress a tools/list response from any MCP server
const toolsListResponse = await mcpClient.listTools();
const compressed = proxy.compressToolsList(toolsListResponse);

// compressed.tools now have TSCG-optimized descriptions
```

### `createTSCGMCPProxy(config)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.serverCommand` | `string` | Command to launch the MCP server |
| `config.serverArgs` | `string[]` | Arguments for the server command |
| `config.model` | `ModelTarget` | Target model for optimization |
| `config.compilerOptions` | `CompilerOptions` | Additional compiler options |

**Returns:** `MCPProxyHandle` with `compressToolsList(response)` method.

### Multi-Server MCP Example

```typescript
import { createTSCGMCPProxy } from '@tscg/tool-optimizer/mcp';

// Compress tools from multiple MCP servers
const servers = [
  { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
  { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
  { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'] },
];

for (const server of servers) {
  const proxy = createTSCGMCPProxy({
    serverCommand: server.command,
    serverArgs: server.args,
    model: 'claude-sonnet',
  });

  const tools = await getToolsFromServer(server);
  const compressed = proxy.compressToolsList(tools);
  console.log(`Compressed ${compressed.tools.length} tools from ${server.args[1]}`);
}
```

## Vercel AI SDK Integration

The `tscgMiddleware` function provides middleware-style tool compression for the Vercel AI SDK.

```typescript
import { tscgMiddleware } from '@tscg/tool-optimizer/vercel';
import { generateText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// Define tools in Vercel AI SDK format
const myTools = {
  getWeather: tool({
    description: 'Get the current weather for a specified location with temperature and conditions',
    parameters: z.object({
      location: z.string().describe('City name or coordinates'),
      units: z.enum(['celsius', 'fahrenheit']).optional(),
    }),
    execute: async ({ location, units }) => {
      return { temperature: 22, conditions: 'sunny', location };
    },
  }),
  searchWeb: tool({
    description: 'Search the web for information and return relevant results',
    parameters: z.object({
      query: z.string().describe('Search query'),
      limit: z.number().optional().describe('Max results'),
    }),
    execute: async ({ query, limit }) => {
      return { results: [] };
    },
  }),
};

// Apply TSCG compression
const middleware = tscgMiddleware({ model: 'claude-sonnet', profile: 'balanced' });
const optimizedTools = middleware.transformTools(myTools);

// Use with Vercel AI SDK
const result = await generateText({
  model: anthropic('claude-sonnet-4-20250514'),
  tools: optimizedTools,
  prompt: 'What is the weather in Tokyo?',
});
```

### `tscgMiddleware(options?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | `CompilerOptions` | TSCG compiler options |

**Returns:** Object with `transformTools(tools)` method that accepts and returns Vercel AI SDK tool maps.

## Compiler Options

All integration functions accept the same `CompilerOptions` from `@tscg/core`:

```typescript
{
  model: 'claude-sonnet',    // Target model for tokenizer optimization
  profile: 'balanced',       // 'conservative' | 'balanced' | 'aggressive'
  principles: {              // Toggle individual TSCG principles
    ata: true,               // Abbreviated Type Annotations
    dtr: true,               // Description Text Reduction
    rke: true,               // Redundant Key Elimination
    sco: true,               // Structural Compression Operators
    cfl: true,               // Constraint-First Layout
    tas: true,               // Tokenizer Alignment Scoring
    csp: true,               // Context-Sensitive Pruning
    sad: false,              // Selective Anchor Duplication (Claude-only)
  },
  preserveToolNames: true,   // Keep tool names unchanged
}
```

## Exports

This package provides targeted entry points for tree-shaking:

```typescript
// Main entry (all integrations)
import { withTSCG, createTSCGMCPProxy, tscgMiddleware } from '@tscg/tool-optimizer';

// Framework-specific entry points (smaller bundles)
import { withTSCG } from '@tscg/tool-optimizer/langchain';
import { createTSCGMCPProxy } from '@tscg/tool-optimizer/mcp';
import { tscgMiddleware } from '@tscg/tool-optimizer/vercel';
```

## Related Packages

- [`@tscg/core`](https://www.npmjs.com/package/@tscg/core) -- The core compression engine (required peer dependency)

## License

MIT
