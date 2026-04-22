# @tscg/core

Deterministic prompt compiler for tool-schema compression. Reduces LLM tool-definition overhead by **71.7%** with zero accuracy loss.

Zero runtime dependencies. <1ms compression time. 14.9KB ESM bundle.

## Latest Benchmarks -- April 2026

720-call E2E validation on Claude Sonnet 4 and Claude Opus 4.7 across 16, 43, and 50 MCP tools. Balanced profile with all 7 operators active (SDM, TAS, DRO, CFL, CFO, CAS, CCP).

### Claude Opus 4.7 -- Accuracy Improvement + 55-59% Token Reduction

| Tool Count | Baseline | TSCG Balanced | Delta Accuracy | Char Savings |
|------------|----------|---------------|----------------|--------------|
| 16 tools   | 70.0%    | **77.5%**     | **+7.5pp**     | 55.7%        |
| 43 tools   | 77.5%    | **80.0%**     | **+2.5pp**     | 58.7%        |
| 50 tools   | 72.5%    | **80.0%**     | **+7.5pp**     | 58.2%        |

### Claude Sonnet 4 -- Consistent 55-59% Savings

| Tool Count | Baseline | TSCG Balanced | Delta Accuracy | Char Savings |
|------------|----------|---------------|----------------|--------------|
| 16 tools   | 77.5%    | 80.0%         | +2.5pp         | 55.7%        |
| 43 tools   | 85.0%    | 80.0%         | -5.0pp         | 58.7%        |
| 50 tools   | 77.5%    | 77.5%         | +/-0.0pp       | 58.2%        |

Benchmark config: n=40 per cell (20 tasks x 2 seeds), deterministic tokenizer-aware compression, <2ms per call. Total: 720 calls, $17.69.

### Three Frontier-Model Operator Archetypes

TSCG compression response is model-specific. Three distinct archetypes observed:

- **Claude Opus 4.7 -- Operator-HUNGRY:** Every operator contributes positively. CCP alone +20pp. CFL+CFO synergistic +17.5pp (super-additive). All 8 operators optimal. Conservative (SDM-only) *hurts* accuracy by -2.5 to -15pp.
- **Claude Sonnet 4 -- Operator-ROBUST:** Config-agnostic. 6 of 7 configs produce identical accuracy. Balanced safe default.
- **GPT-5.2 -- Operator-SENSITIVE:** CFL helps +2.5pp, CFO hurts -5pp, all-8 worst case (-10pp). Best config: balanced with CFO disabled.

See [paper](https://github.com/SKZL-AI/tscg) for methodology and per-operator isolation experiments.

## Installation

```bash
npm install @tscg/core
```

```bash
pnpm add @tscg/core
```

```bash
yarn add @tscg/core
```

**Requirements:** Node.js >= 18.0.0

## Quick Start

```typescript
import { compress } from '@tscg/core';

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City name or coordinates' },
          units: { type: 'string', enum: ['celsius', 'fahrenheit'], description: 'Temperature units' },
        },
        required: ['location'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Send an email to a specified recipient with a subject and body',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Email body content' },
          cc: { type: 'string', description: 'CC recipient email address' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
];

const result = compress(tools, { model: 'claude-sonnet', profile: 'balanced' });

console.log(result.compressed);
// get_weather(location:str!, units?:str[celsius|fahrenheit]) -> weather data
// send_email(to:str!, subject:str!, body:str!, cc?:str) -> send result

console.log(result.metrics.tokens.savingsPercent); // ~71%
console.log(result.metrics.compressionTimeMs);     // <1ms
```

## API Reference

### `compress(tools, options?)`

The primary entry point. Compresses an array of tool definitions.

```typescript
import { compress } from '@tscg/core';

const result = compress(tools, {
  model: 'claude-sonnet',
  profile: 'balanced',
});
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `tools` | `AnyToolDefinition[]` | Array of tool definitions (OpenAI or Anthropic format) |
| `options` | `CompilerOptions` | Optional compression configuration |

**Returns:** `CompressedResult`

### `compressToolSchema(tool, options?)`

Convenience wrapper for compressing a single tool.

```typescript
import { compressToolSchema } from '@tscg/core';

const result = compressToolSchema(weatherTool, { model: 'gpt-5' });
```

### `compressBatch(tools, models)`

Compress the same tool catalog for multiple models at once.

```typescript
import { compressBatch } from '@tscg/core';

const results = compressBatch(tools, ['claude-sonnet', 'gpt-5', 'mistral-7b']);

for (const [model, result] of results) {
  console.log(`${model}: ${result.metrics.tokens.savingsPercent}% savings`);
}
```

### `TSCGCompiler`

The compiler class for reuse across multiple compression calls.

```typescript
import { TSCGCompiler } from '@tscg/core';

const compiler = new TSCGCompiler({
  model: 'claude-sonnet',
  profile: 'aggressive',
  principles: { sad: true },
});

const result1 = compiler.compile(tool1);
const result2 = compiler.compileMany([tool1, tool2, tool3]);
const config = compiler.getMetrics();
```

**Methods:**

| Method | Description |
|--------|-------------|
| `compile(tool)` | Compress a single tool definition |
| `compileMany(tools)` | Compress a catalog of tools (leverages cross-tool redundancies) |
| `getMetrics()` | Get current compiler configuration (model, profile, principles) |

### `getTokenizerProfile(model)`

Get the tokenizer profile for a specific model target.

```typescript
import { getTokenizerProfile } from '@tscg/core';

const profile = getTokenizerProfile('claude-sonnet');
console.log(profile.charsPerToken);    // 4.0
console.log(profile.charsPerTokenCode); // 2.8
```

### `listProfiles()`

List all available tokenizer profiles.

```typescript
import { listProfiles } from '@tscg/core';

for (const profile of listProfiles()) {
  console.log(`${profile.model}: ${profile.charsPerToken} chars/token`);
}
```

### Utility Functions

```typescript
import { estimateTokens, formatSavings } from '@tscg/core';

const tokens = estimateTokens('some text', 'claude-sonnet');
const display = formatSavings(1000, 287); // "71.3% savings (1000 -> 287 tokens)"
```

## Compiler Options

```typescript
interface CompilerOptions {
  /** Target model for tokenizer-specific optimization */
  model?: ModelTarget;

  /** Compression aggressiveness: 'conservative' | 'balanced' | 'aggressive' */
  profile?: string;

  /** Toggle individual TSCG principles */
  principles?: {
    ata?: boolean;  // Abbreviated Type Annotations (str, int, bool)
    cfl?: boolean;  // Constraint-First Layout
    rke?: boolean;  // Redundant Key Elimination
    sad?: boolean;  // Selective Anchor Duplication (Claude-only)
    tas?: boolean;  // Tokenizer Alignment Scoring
    dtr?: boolean;  // Description Text Reduction
    sco?: boolean;  // Structural Compression Operators
    csp?: boolean;  // Context-Sensitive Pruning
  };

  /** Output format: 'json' | 'yaml-like' | 'compact' */
  outputFormat?: string;

  /** Preserve tool names unchanged (default: true) */
  preserveToolNames?: boolean;
}
```

### Profiles

| Profile | Principles Enabled | Use Case |
|---------|-------------------|----------|
| `conservative` | ATA, RKE, DTR | Maximum compatibility, moderate savings (~40%) |
| `balanced` | All except SAD | Best accuracy/savings tradeoff (~71%) |
| `aggressive` | All including SAD | Maximum compression, Claude-only for SAD (~75%) |

### Principles Behavior

The `principles` option is **additive** over profile defaults. User-specified principles add to (rather than override) the active operators of the selected profile. This delivers more compression than strict operator specification would.

```typescript
// Additive: CAS=true merges with balanced defaults → 6 operators active
compress(tools, { principles: { cas: true } });
// Result: SDM + TAS + DRO + CFO + CAS + CCP (~57% token savings)
```

If you need exact operator control (e.g., for research benchmarks measuring per-operator contribution), pass all 8 operator keys explicitly:

```typescript
// Exact: all 8 keys specified → no merging, exact configuration applied
compress(tools, {
  principles: {
    sdm: true, tas: true, dro: true, cfl: false,
    cfo: false, cas: false, sad: false, ccp: false,
  },
});
// Result: only SDM + TAS + DRO active
```

When all 8 keys are specified, the exact configuration is applied with no merging.

### Supported Models

| Model Target | Family |
|-------------|--------|
| `claude-sonnet`, `claude-opus`, `claude-haiku` | Anthropic Claude |
| `gpt-4`, `gpt-5`, `gpt-4o-mini` | OpenAI GPT |
| `llama-3.1`, `llama-3.2` | Meta Llama |
| `mistral-7b`, `mistral-large` | Mistral |
| `gemma-3` | Google Gemma |
| `phi-4` | Microsoft Phi |
| `qwen-3` | Alibaba Qwen |
| `deepseek-v3` | DeepSeek |
| `auto` | Auto-detect (conservative defaults) |

## Tool Definition Formats

TSCG accepts both OpenAI and Anthropic tool formats:

**OpenAI format:**
```typescript
const tool = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get weather for a location',
    parameters: {
      type: 'object',
      properties: { location: { type: 'string' } },
      required: ['location'],
    },
  },
};
```

**Anthropic format:**
```typescript
const tool = {
  name: 'get_weather',
  description: 'Get weather for a location',
  input_schema: {
    type: 'object',
    properties: { location: { type: 'string' } },
    required: ['location'],
  },
};
```

## Compressed Result

```typescript
interface CompressedResult {
  /** Compressed tool definitions as a string */
  compressed: string;

  /** Compression metrics */
  metrics: {
    tokens: {
      original: number;
      compressed: number;
      savings: number;
      savingsPercent: number;
    };
    characters: { original: number; compressed: number };
    perTool: Array<{
      name: string;
      originalTokens: number;
      compressedTokens: number;
      savingsPercent: number;
    }>;
    compressionTimeMs: number;
  };

  /** Which TSCG principles were applied */
  appliedPrinciples: string[];
}
```

## Advanced: Individual Transforms

For advanced users, TSCG exports individual transform functions from the engine:

```typescript
import {
  applyToolSDM,   // Schema Description Minimization
  applyToolDRO,   // Description Redundancy Optimization
  applyToolCAS,   // Context-Aware Sorting
  applyToolTAS,   // Tokenizer Alignment Scoring
  optimizeToolDefinitions,  // Full pipeline
} from '@tscg/core';
```

## Benchmark Results

Tested across 6 scenarios in the TAB (Tool-Aware Benchmark):

| Scenario | Token Savings | Accuracy |
|----------|:------------:|:--------:|
| Frontier Models (Claude 4, GPT-5.2, Gemini 2.5) | 71.7% | 100% |
| Small Models (7B-8B, 50 tools) | 71.2% | Significant improvement |
| Claude Code Simulation (77 tools) | 71.7% | 100% |
| GSM8K Reasoning + 50 tools | 71.5% | Improved reasoning |
| MCP Aggregation (50 tools, 5 servers) | 72.1% | 100% |
| BFCL Accuracy Retention | 71.7% | 99.5% ARR |

## How It Works

TSCG applies 8 compression principles grounded in transformer architecture:

1. **ATA** -- Abbreviated Type Annotations: `string` -> `str`, `integer` -> `int`
2. **DTR** -- Description Text Reduction: Remove redundant words from descriptions
3. **RKE** -- Redundant Key Elimination: Remove JSON keys the model can infer
4. **SCO** -- Structural Compression Operators: Flatten nested schemas
5. **CFL** -- Constraint-First Layout: Place constraints where causal attention processes them
6. **TAS** -- Tokenizer Alignment Scoring: Optimize for BPE token boundaries
7. **CSP** -- Context-Sensitive Pruning: Remove derivable information
8. **SAD** -- Selective Anchor Duplication: Reinforce critical parameters (Claude-only)

## Related Packages

- [`@tscg/mcp-proxy`](https://www.npmjs.com/package/@tscg/mcp-proxy) -- Transparent MCP middleware with per-model target optimization
- [`@tscg/tool-optimizer`](https://www.npmjs.com/package/@tscg/tool-optimizer) -- High-level integrations for LangChain, MCP, and Vercel AI SDK

All three `@tscg/*` packages use umbrella versioning (same version, released together).

## License

MIT
