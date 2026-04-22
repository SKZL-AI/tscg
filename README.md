# TSCG -- Tool-Schema Compression Grammar

[![npm @tscg/core](https://img.shields.io/npm/v/@tscg/core?label=%40tscg%2Fcore)](https://www.npmjs.com/package/@tscg/core)
[![npm @tscg/mcp-proxy](https://img.shields.io/npm/v/@tscg/mcp-proxy?label=%40tscg%2Fmcp-proxy)](https://www.npmjs.com/package/@tscg/mcp-proxy)
[![npm @tscg/tool-optimizer](https://img.shields.io/npm/v/@tscg/tool-optimizer?label=%40tscg%2Ftool-optimizer)](https://www.npmjs.com/package/@tscg/tool-optimizer)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-108%20passing-brightgreen)]()
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-green)]()

**Deterministic tool-schema compiler that reduces LLM tool-definition overhead by 50--72% while *improving* accuracy.**

1,200 LOC TypeScript. Zero dependencies. Sub-millisecond. 23KB ESM bundle.

## Latest Findings (April 2026)

### 720-Call E2E Benchmark on Claude Models

**Claude Opus 4.7** -- matches-or-beats baseline with 57-63% token savings:

| Tool Count | Baseline | TSCG Balanced | Δ Accuracy | Savings |
|------------|----------|---------------|------------|---------|
| 16 | 70.0% | **77.5%** | **+7.5pp** | 56.9% |
| 43 | 77.5% | **80.0%** | **+2.5pp** | 63.0% |
| 50 | 72.5% | **80.0%** | **+7.5pp** | 62.8% |

**Claude Sonnet 4** -- consistent 57-63% compression with robust accuracy:

| Tool Count | Baseline | TSCG Balanced | Δ Accuracy | Savings |
|------------|----------|---------------|------------|---------|
| 16 | 77.5% | 80.0% | +2.5pp | 56.9% |
| 43 | 85.0% | 80.0% | -5.0pp | 63.0% |
| 50 | 77.5% | 77.5% | ±0.0pp | 62.8% |

### 480-Call MCP Proxy Benchmark (v1.4.1)

**480-call extended proxy benchmark** (n=40 per cell, 2 seeds, 2 models x 3 tool counts):

| Model | Tools | Baseline | TSCG Proxy | Δ Accuracy | Token Savings |
|-------|-------|----------|------------|------------|---------------|
| **Opus 4.7** | 16 | 70.0% | **75.0%** | **+5.0pp** | 53.1% |
| **Opus 4.7** | 43 | 75.0% | 75.0% | ±0.0pp | 55.8% |
| **Opus 4.7** | 50 | 77.5% | 77.5% | ±0.0pp | 55.5% |
| Sonnet 4 | 16 | 80.0% | 77.5% | -2.5pp | 53.1% |
| Sonnet 4 | 43 | 85.0% | 82.5% | -2.5pp | 55.8% |
| Sonnet 4 | 50 | 77.5% | 77.5% | ±0.0pp | 55.5% |

Opus 4.7 matches-or-beats baseline in all conditions; Sonnet 4 within expected CI (max -2.5pp). Both achieve 53-56% token savings.

**Tool-Optimizer E2E validation** (`@tscg/tool-optimizer` `withTSCG()` wrapper, 30 calls, Sonnet 4 @ 16 tools): withTSCG **86.7%** vs baseline 80.0% (**+6.7pp**), 36.6% character savings.

### Three Frontier-Model Operator Archetypes

TSCG compression response is model-specific. Three distinct archetypes observed:

- **Opus 4.7 -- Operator-HUNGRY** -- every operator contributes; balanced (all-8) is optimal
- **Sonnet 4 -- Operator-ROBUST** -- config-agnostic; 6 of 7 configs near-identical accuracy
- **GPT-5.2 -- Operator-SENSITIVE** -- CFL helps, CFO hurts; custom config optimal

### External Validation -- 4 Independent Benchmarks

TSCG's internal benchmark (TAB -- Tool-Agentic Bench, ~19,000 calls) is **independently corroborated** by four external benchmarks, including industry-standard evaluation suites:

| Benchmark | Type | Result | Significance |
|-----------|------|--------|--------------|
| **BFCL** ([Berkeley Function Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html)) | Industry standard | **108--181% ARR** across 3 frontier models | Sonnet 4: 85.7%→93.2% (+7.5pp), GPT-4o: 31.7%→57.4% (+25.7pp), GPT-5.2: 61.9%→89.4% (+27.5pp) |
| **ToolBench** (Qin et al.) | Academic benchmark | **+5.0pp** (75.0%→80.0%) | Real-world tool catalog, 20 tools |
| **API-Bank** (Li et al.) | Academic benchmark | -5.0pp (80.0%→75.0%) | Honest negative result -- not all benchmarks improve |
| **Real MCP Server** (@modelcontextprotocol/server-filesystem) | Production endpoint | **100% syntactic validity** | 30 tasks on live MCP server, server-acceptance 90--97% |

**TAB → Real MCP Transfer (0.1pp):** The internal TAB benchmark is not merely a self-constructed evaluation -- it demonstrably **predicts real-world MCP behavior within 0.1 accuracy points**. Sonnet 4 on 43-tool MCP: synthetic TAB delta = -1.6pp vs real MCP delta = -1.7pp. This tight transfer validates TAB as a reliable proxy for production MCP deployments.

Mean across the 3 external catalog benchmarks: **+2.5pp** (80.2%→82.7%).

See [paper](./TSCG-paper.pdf) for full methodology and per-benchmark analysis.

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

From **~19,000 API calls** across **12 models** (4B--32B + 3 frontier APIs), 5 scenarios:

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
| Unit tests | 108 passing (core 47 + proxy 61) |
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

All three `@tscg/*` packages use umbrella versioning -- same version number, released together.

```bash
npm install @tscg/core                # Core compression engine
npm install @tscg/mcp-proxy           # Transparent MCP middleware
npm install @tscg/tool-optimizer      # LangChain / Vercel AI SDK integrations
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
  profile: 'balanced',      // Profile: 'conservative' | 'balanced' | 'aggressive' | 'auto'
});
```

### Description-Only Mode (v1.4.0)

Compress only `.description` fields while preserving the full JSON Schema structure -- compatible with native tool-calling APIs (OpenAI, Anthropic, Google):

```typescript
import { compressDescriptions } from '@tscg/core';

const result = compressDescriptions(tools, { model: 'claude-sonnet' });
console.log(result.tools);              // Tools with compressed descriptions
console.log(result.metrics.descriptions.savingsPercent); // ~25-40% description savings
```

### Auto Profile (v1.4.0)

The `auto` profile selects compression principles based on catalog size. At >=30 tools, CFL/CFO are automatically disabled (they become harmful at scale per our 100-tool benchmark findings):

```typescript
compress(tools, { model: 'claude-sonnet', profile: 'auto' });
```

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`@tscg/core`](packages/core/) | Core compression engine (8 operators) | `npm i @tscg/core` |
| [`@tscg/mcp-proxy`](packages/mcp-proxy/) | MCP stdio proxy -- transparent TSCG compression for any MCP server | `npm i @tscg/mcp-proxy` |
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

## MCP Proxy

`@tscg/mcp-proxy` sits between Claude Code (or any MCP client) and your MCP tool servers, transparently compressing tool schemas:

```bash
# Opus 4.7 -- 57-63% savings, +2.5 to +7.5pp accuracy
npx @tscg/mcp-proxy --target=claude-opus-4-7 --server=<your-mcp-command>

# Sonnet 4 -- 57-63% savings, robust accuracy
npx @tscg/mcp-proxy --target=claude-sonnet-4 --server=<your-mcp-command>
```

Setting `--target` automatically enables the full compression pipeline validated by our 720-call benchmark. No other flags required.

**Legacy mode** (backward compatible with v1.0.x):
```bash
npx @tscg/mcp-proxy --server=<your-mcp-command>
```

## Integrations

**LangChain:**
```typescript
import { withTSCG } from '@tscg/tool-optimizer/langchain';
const optimizedAgent = withTSCG(agent);
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
packages/
  core/             # @tscg/core — compression engine (8 operators, 47 tests)
  mcp-proxy/        # @tscg/mcp-proxy — stdio proxy for MCP servers (61 tests)
  tool-optimizer/   # @tscg/tool-optimizer — LangChain, Vercel AI SDK integrations
paper/              # LaTeX source (arXiv version)
cli/                # Unified CLI (compress, benchmark, analyze, info)
benchmark/          # TAB benchmark harness, analysis code, raw data
integrations/       # Framework integration examples
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

**TSCG: Deterministic Tool-Schema Compilation for Agentic LLM Deployments**

Furkan Sakizli. 2026.

[TSCG-paper.pdf](./TSCG-paper.pdf) -- arXiv preprint (full version, 12 models, ~19,000 API calls, 4-class taxonomy)

LaTeX source is available in [`paper/`](paper/).

## Citation

```bibtex
@article{sakizli2026tscg,
  title={TSCG: Deterministic Tool-Schema Compilation for Agentic LLM Deployments},
  author={Sakizli, Furkan},
  year={2026},
  note={arXiv preprint}
}
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## License

[MIT](LICENSE)
