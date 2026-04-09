# TSCG LangChain Integration

Use TSCG (Token-Saving Context Grammar) to compress tool descriptions in your
LangChain agents. This reduces token overhead by ~71% without degrading tool
selection accuracy.

## Installation

```bash
# Install the TSCG tool-optimizer package (includes LangChain wrapper)
npm install @tscg/tool-optimizer @tscg/core
```

No LangChain peer dependency is required -- the wrapper works with any object
that exposes `name` and `description` properties.

## Quick Start

```typescript
import { withTSCG } from '@tscg/tool-optimizer/langchain';
import { DynamicTool } from '@langchain/core/tools';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';

// 1. Define your tools as usual
const tools = [
  new DynamicTool({
    name: 'get_weather',
    description: 'Get current weather conditions for a given city including temperature, humidity, wind speed, and general conditions.',
    func: async (city: string) => JSON.stringify({ city, temp: 22, unit: 'C' }),
  }),
  new DynamicTool({
    name: 'search_web',
    description: 'Search the web for current information about a topic. Returns a list of relevant results with titles, snippets, and URLs.',
    func: async (query: string) => JSON.stringify({ results: [] }),
  }),
];

// 2. Compress with TSCG before passing to agent
const optimizedTools = withTSCG(tools, {
  model: 'gpt-4',         // Target model for tokenizer alignment
  profile: 'balanced',    // conservative | balanced | aggressive
});

// 3. Build your agent with the optimized tools
const llm = new ChatOpenAI({ modelName: 'gpt-4' });
// ... proceed with agent setup using optimizedTools
```

## How It Works

`withTSCG()` takes your tool array and returns a new array where each tool's
`description` field has been compressed using TSCG principles:

| Principle | What It Does |
|-----------|-------------|
| DTR (Description Text Reduction) | Removes filler words and redundant phrases |
| SCO (Structural Compression Operators) | Replaces verbose patterns with compact operators |
| CFL (Constraint-First Layout) | Moves constraints to the front of descriptions |
| TAS (Tokenizer Alignment Scoring) | Uses BPE-optimal delimiters for the target model |

The compressed descriptions are semantically equivalent -- LLMs understand them
just as well (99.5%+ accuracy retention), but they use far fewer tokens.

## API

### `withTSCG<T extends ToolLike>(tools: T[], options?: CompilerOptions): T[]`

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tools` | `T[]` | required | Array of tool objects with `name` and `description` |
| `options.model` | `ModelTarget` | `'auto'` | Target model for tokenizer optimization |
| `options.profile` | `string` | `'balanced'` | Compression aggressiveness |
| `options.principles` | `object` | all enabled | Toggle individual TSCG principles |
| `options.preserveToolNames` | `boolean` | `true` | Keep tool names unchanged |

**Returns:** New array of tools with compressed descriptions. All other
properties (parameters, callbacks, etc.) are preserved unchanged.

### Supported Models

`model` accepts any `ModelTarget` value:

- `claude-sonnet`, `claude-opus`, `claude-haiku`
- `gpt-4`, `gpt-5`, `gpt-4o-mini`
- `llama-3.1`, `llama-3.2`
- `mistral-7b`, `mistral-large`
- `gemma-3`, `phi-4`, `qwen-3`, `deepseek-v3`
- `auto` (conservative defaults)

### Compression Profiles

| Profile | Token Savings | Best For |
|---------|--------------|----------|
| `conservative` | ~50% | Production with maximum safety |
| `balanced` | ~65% | General-purpose (recommended) |
| `aggressive` | ~75% | Cost optimization, large catalogs |

## Framework Compatibility

The wrapper works with any tool object that has `name` and `description`:

- **LangChain JS** (`@langchain/core/tools`): `DynamicTool`, `StructuredTool`
- **LangChain Python** (via JS bridge): Any tool serialized to JSON
- **Plain objects**: `{ name: string, description: string, ... }`
- **Custom frameworks**: Anything matching the `ToolLike` interface

## Advanced Usage

### Selective Principle Control

```typescript
const optimized = withTSCG(tools, {
  model: 'claude-sonnet',
  principles: {
    dtr: true,   // Description Text Reduction
    sco: true,   // Structural Compression Operators
    cfl: false,  // Skip Constraint-First Layout
    tas: true,   // Tokenizer Alignment Scoring
  },
});
```

### Inspecting Compression Metrics

For detailed metrics, use `@tscg/core` directly:

```typescript
import { compress } from '@tscg/core';

const result = compress(toolDefinitions, { model: 'gpt-4' });
console.log(result.metrics.tokens.savingsPercent); // e.g., 71.2
console.log(result.appliedPrinciples);              // ['DTR', 'SCO', 'CFL', 'TAS']
```

### Multi-Model Optimization

```typescript
import { compressBatch } from '@tscg/core';

const results = compressBatch(toolDefs, ['claude-sonnet', 'gpt-4', 'llama-3.1']);
for (const [model, result] of results) {
  console.log(`${model}: ${result.metrics.tokens.savingsPercent.toFixed(1)}% savings`);
}
```

## Performance

- Compression is deterministic and runs in <1ms for typical tool catalogs
- Zero runtime dependencies beyond `@tscg/core`
- No API calls -- all compression is local
- Thread-safe and stateless

## Related Integrations

- **Vercel AI SDK**: `@tscg/tool-optimizer/vercel` -- Middleware pattern
- **MCP Servers**: `@tscg/tool-optimizer/mcp` -- Transparent proxy

## License

See the root [LICENSE](../../LICENSE) file for details.
