# TSCG -- Tool-Schema Compression Grammar

[![npm version](https://img.shields.io/npm/v/@tscg/core)](https://www.npmjs.com/package/@tscg/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-493%20passing-brightgreen)]()
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-green)]()

**Deterministic tool-schema compiler that reduces LLM tool-definition overhead by ~72%.**

1,200 LOC TypeScript. Zero dependencies. Sub-millisecond. 27.7KB bundle.

## The Problem

Every time an LLM agent framework makes an API call, it sends full JSON Schema definitions for every registered tool. Claude Code injects ~50,000 tokens of tool definitions per subprocess. At production scale (100k calls/day), the schema overhead alone costs >$30,000/month.

Worse: small models (4B-14B) cannot parse JSON-format tool schemas reliably at scale -- achieving 0-49% accuracy with >15 tools. This locks agentic capabilities behind expensive frontier APIs.

## What TSCG Does

TSCG applies 8 formally-defined transforms grounded in how causal transformers process tokens:

| Principle | Full Name | What It Does |
|-----------|-----------|-------------|
| **TAS** | Tokenizer-Aligned Syntax | Optimizes for BPE boundaries |
| **CFL** | Constraint-First Layout | Exploits the attention sink at position 0 |
| **CFO** | Causal-Flow Ordering | Orders operations into causal chains |
| **SDM** | Semantic Density Maximization | Removes 104+ filler patterns |
| **DRO** | Delimiter-Role Optimization | Converts verbose phrases to compact delimiters |
| **CCP** | Closure-Context Preservation | Appends closure block for recency bias |
| **CAS** | Causal Access Scoring | Scores and reorders by parameter fragility |
| **SAD-F** | Selective Anchor Duplication | Budget-constrained anchor duplication |

## Key Results

From ~13,000 API calls across 12 models (4B-32B + 3 frontier APIs):

| Finding | Detail |
|---------|--------|
| Token savings | 50-72% on tool schemas |
| Small model recovery | 0-49% to 65-90% accuracy (JSON-API enablement) |
| Frontier compression | +5-11pp genuine compression (Claude, GPT-4o, GPT-5.2) |
| BFCL validation | 108% Accuracy Retention Rate |
| Predictive model | R²=0.88 predicts TSCG benefit from single baseline measurement |
| Speed | <1ms compression, ~40,000x faster than LLMLingua-2 |

## Quick Start

```bash
npm install @tscg/core
```

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
          units: { type: 'string', enum: ['celsius', 'fahrenheit'] },
        },
        required: ['location'],
      },
    },
  },
];

const result = compress(tools, { model: 'claude-sonnet' });
// ~72% fewer tokens, same or better accuracy
console.log(result.compressed);
console.log(`Saved ${result.savings}% tokens`);
```

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`@tscg/core`](packages/core/) | Core compression engine | `npm i @tscg/core` |
| [`@tscg/tool-optimizer`](packages/tool-optimizer/) | LangChain, MCP, Vercel AI SDK integrations | `npm i @tscg/tool-optimizer` |

## CLI

```bash
# Compress tool schemas
npx tsx cli/tscg.ts compress --input tools.json --model claude-sonnet --profile balanced

# Run benchmarks
npx tsx cli/tscg.ts benchmark --model claude-sonnet

# Show compression info
npx tsx cli/tscg.ts info
```

## Integrations

**LangChain:**
```typescript
import { withTSCG } from '@tscg/tool-optimizer/langchain';
const optimizedAgent = withTSCG(agent);
```

**MCP Proxy:**
```typescript
import { createTSCGMCPProxy } from '@tscg/tool-optimizer/mcp';
const proxy = createTSCGMCPProxy(mcpServer);
```

**Vercel AI SDK:**
```typescript
import { tscgMiddleware } from '@tscg/tool-optimizer/vercel';
```

## Project Structure

```
src/
  optimizer/        # Core transforms (10 transforms, 946 LOC)
  compiler/         # NL-to-TSCG compilation
  core/             # Types, multi-model providers, rate-limiter
  benchmark/        # Test case generators and runner
cli/                # Unified CLI (compress, benchmark, analyze, info)
packages/
  core/             # @tscg/core npm package
  tool-optimizer/   # @tscg/tool-optimizer npm package
paper/              # Academic paper (ACL LaTeX format)
benchmark/          # TAB benchmark data and analysis
extension/          # Chrome Extension (Manifest V3)
integrations/       # Framework integration examples
launch/             # Community launch materials
docs/               # Technical documentation
```

## Development

```bash
git clone https://github.com/SKZL-AI/tscg.git
cd tscg
npm install
npm run build
npm test          # 493 tests
npm run typecheck # Type checking
```

## Paper

**TSCG: Token-Context Semantic Grammar for Causal Prompt Optimization in Large Language Models**

Furkan Sakizli. 2026.

The paper introduces TSCG's formal framework, the TAB (TSCG-Agentic-Bench) benchmark, and the four-class behavioral taxonomy for deployment guidance.

## Citation

```bibtex
@article{sakizli2026tscg,
  title={TSCG: Token-Context Semantic Grammar for Causal Prompt Optimization in Large Language Models},
  author={Sakizli, Furkan},
  year={2026},
  note={Preprint}
}
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## License

[MIT](LICENSE)
