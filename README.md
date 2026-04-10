# TSCG -- Tool-Schema Compression Grammar

[![npm version](https://img.shields.io/npm/v/@tscg/core)](https://www.npmjs.com/package/@tscg/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-459%20passing-brightgreen)]()
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-green)]()

**Deterministic tool-schema compiler that reduces LLM tool-definition overhead by 50--72% while *improving* accuracy.**

1,200 LOC TypeScript. Zero dependencies. Sub-millisecond. 34.7KB bundle (11.7KB gzipped).

## The Problem

Every LLM agent framework sends full JSON Schema definitions for every registered tool on every API call. Claude Code injects ~50,000 tokens of tool definitions per subprocess. At production scale (100K calls/day), the schema overhead alone costs **>$30,000/month**.

Worse: small models (4B--14B) cannot parse JSON-format tool schemas reliably at scale -- achieving **0--49% accuracy** with >15 tools. This locks agentic capabilities behind expensive frontier APIs.

## Key Results

### Pareto Dominance: Better Accuracy AND Fewer Tokens

BFCL ([Berkeley Function Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html)) validation -- the industry standard for tool-calling evaluation:

| Model | Without TSCG | With TSCG | Improvement | Token Savings |
|-------|-------------|-----------|-------------|---------------|
| Claude Sonnet 4 | 85.7% | 93.2% | +7.5pp | 46.8% |
| **GPT-4o** | **31.7%** | **57.4%** | **+25.7pp (181% ARR)** | 2.6% |
| GPT-5.2 | 61.9% | 89.4% | +27.5pp (144% ARR) | 8.3% |

Every model *improves*. TSCG achieves **108--181% Accuracy Retention Rate** -- it doesn't just retain accuracy, it increases it.

### Small Model Enablement

| Model | JSON Baseline (20 tools) | With TSCG | Recovery |
|-------|------------------------|-----------|----------|
| Phi-4 14B | 0% | 84.4% | **+84.4pp** |
| Mistral 7B | 35% | 80.1% | **+45.1pp** |
| Gemma 3 4B | 49.9% | 67.0% | +17.1pp |

Seven small models (4B--14B) that achieve 0--49% accuracy on JSON tools recover to **65--90%** with TSCG. The root cause: JSON format, not model capacity (R^2 = 0.88 against JSON baselines, collapses to 0.03 against text -- **97% of variance is format sensitivity**).

### Full Benchmark Summary

From **~13,000 API calls** across **12 models** (4B--32B + 3 frontier APIs), 5 scenarios:

| Finding | Detail |
|---------|--------|
| Token savings | 50--72% on tool schemas |
| BFCL validation | 108--181% Accuracy Retention Rate |
| Formal guarantee | >=51% savings on any well-formed schema (Theorem 3.1) |
| Predictive model | R^2 = 0.88 predicts TSCG benefit from single baseline measurement |
| Speed | 50 tools in 2.4ms (Node.js v24, commodity hardware) |
| Cost at scale | >$30,000/month savings at 100K calls/day |

### Verified Performance (Fresh Install)

Independent reproduction on `@tscg/core` from npm:

| Metric | Measured |
|--------|----------|
| 5 realistic tools (Claude target) | 59.5% token savings |
| 50 tools | 66.6% savings in 2.4ms |
| Compression time (5 tools) | 0.9ms |
| Unit tests | 459/459 passing |
| Bundle | 34.7KB (11.7KB gzipped) |
| Dependencies | 0 |

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
console.log(result.compressed);
console.log(`Saved ${result.metrics.tokens.savingsPercent}% tokens`);
// => "get_weather(location:str units?:str[celsius|fahrenheit])|Get current weather"
// => "Saved 62.3% tokens"
```

### Result Object

```typescript
const result = compress(tools, { model: 'claude-sonnet', profile: 'balanced' });

result.compressed                        // string — compressed tool definitions
result.metrics.tokens.original           // number — original token count
result.metrics.tokens.compressed         // number — compressed token count
result.metrics.tokens.savingsPercent     // number — e.g. 62.3
result.metrics.compressionTimeMs         // number — e.g. 0.9
result.appliedPrinciples                 // string[] — e.g. ['SDM', 'CAS', 'DRO', 'TAS']
result.metrics.perTool                   // { name, originalTokens, compressedTokens, savingsPercent }[]
```

### Options

```typescript
compress(tools, {
  model: 'claude-sonnet',   // Target model: 'claude-sonnet' | 'gpt-4o' | 'gpt-4' | ...
  profile: 'balanced',      // Profile: 'conservative' | 'balanced' | 'aggressive'
});
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

## TSCG vs Other Approaches

| Property | TSCG | LLMLingua-2 | DSPy / SAMMO |
|----------|------|-------------|-------------|
| Accuracy effect | **Improves** (108--181% ARR) | Degrades (-5 to -20%) | Degrades |
| Speed | **2.4ms / 50 tools** | ~42s (GPU) | Minutes |
| Dependencies | **None** | GPU + ML framework | API calls |
| Deterministic | **Yes** | No | No |
| Formal guarantees | **>=51% savings** | None | None |
| Bundle size | **34.7KB** | Requires PyTorch | Full stack |
| Works offline | **Yes** | GPU required | API required |

## Who Benefits

- **Claude Code / Cursor / Windsurf users**: ~35K fewer tokens per subprocess
- **Local LLM users (Ollama)**: 7B models become functional tool-use agents with 50+ tools
- **Production API deployments**: >$30,000/month savings at 100K calls/day
- **Multi-agent orchestration**: Savings multiply per sub-agent in the chain
- **Edge / Mobile / Privacy**: EU AI Act compliant local deployment becomes viable

## Project Structure

```
src/
  optimizer/        # Core transforms (8 principles, ~950 LOC)
  compiler/         # NL-to-TSCG compilation
  core/             # Types, multi-model providers, rate-limiter
  benchmark/        # Test case generators and runner
cli/                # Unified CLI (compress, benchmark, analyze, info)
packages/
  core/             # @tscg/core npm package
  tool-optimizer/   # @tscg/tool-optimizer npm package
benchmark/          # TAB benchmark harness and analysis code
integrations/       # Framework integration examples
tests/              # 459 tests across 14 test files
docs/               # Technical documentation
```

## Development

```bash
git clone https://github.com/SKZL-AI/tscg.git
cd tscg
npm install
npm run build
npm test          # 459 tests
npm run typecheck # Type checking
```

## Paper

**TSCG: Token-Context Semantic Grammar for Causal Prompt Optimization in Large Language Models**

Furkan Sakizli. 2026.

See [`TSCG-paper.pdf`](TSCG-paper.pdf) in this repository. The paper introduces TSCG's formal framework, the TAB (TSCG-Agentic-Bench) benchmark with ~13,000 API calls across 12 models, and the four-class behavioral taxonomy for deployment guidance.

## Citation

```bibtex
@article{sakizli2026tscg,
  title={TSCG: Token-Context Semantic Grammar for Causal Prompt Optimization
         in Large Language Models},
  author={Sakizli, Furkan},
  year={2026},
  note={Preprint}
}
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## License

[MIT](LICENSE)
