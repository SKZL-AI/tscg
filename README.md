# TSCG — Deterministic Tool-Schema Compilation

[![npm @tscg/core](https://img.shields.io/npm/v/@tscg/core?label=%40tscg%2Fcore)](https://www.npmjs.com/package/@tscg/core)
[![npm @tscg/mcp-proxy](https://img.shields.io/npm/v/@tscg/mcp-proxy?label=%40tscg%2Fmcp-proxy)](https://www.npmjs.com/package/@tscg/mcp-proxy)
[![npm @tscg/tool-optimizer](https://img.shields.io/npm/v/@tscg/tool-optimizer?label=%40tscg%2Ftool-optimizer)](https://www.npmjs.com/package/@tscg/tool-optimizer)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**TSCG (Token-Context Semantic Grammar) compiles JSON tool schemas into compact structured text for LLM agents.** Deterministic TypeScript transforms require no model calls or fine-tuning. Accuracy effects depend on the model, profile, baseline, and context budget.

## Published papers

1. Furkan Sakizli. **TSCG: Deterministic Tool-Schema Compilation for Agentic LLM Deployments**. [arXiv:2605.04107v1](https://arxiv.org/html/2605.04107v1), submitted 4 May 2026. [PDF](https://arxiv.org/pdf/2605.04107v1).
2. Furkan Sakizli. **Tool-Schema Compression Enables Agentic RAG Under Constrained Context Budgets**. [arXiv:2605.26165v1](https://arxiv.org/html/2605.26165v1), submitted 24 May 2026. [PDF](https://arxiv.org/pdf/2605.26165v1).

All current benchmark claims below are tied to those published versions. See [measurement provenance, complete tables, and corrections](docs/PUBLISHED-RESULTS.md). TAB is the author's benchmark; the BFCL experiment is external-schema validation, not an official leaderboard score or independent replication.

## Paper 1: TAB frontier results

Tables 1 and 8 distinguish native function calling, uncompressed JSON in text, and TSCG in text. TAB overall accuracy is `0.6 × tool-selection accuracy + 0.4 × parameter F1`.

| Model | TAB scenario | Native FC | JSON as text | TSCG text | Delta vs native FC | Token savings vs native FC |
|-------|--------------|-----------|--------------|-----------|--------------------|----------------------------|
| Claude Sonnet 4 | A: 16 tools | 74.0% | 51.1% | 85.2% | +11.2 pp | 50.1% |
| Claude Sonnet 4 | B: 43 tools | 90.0% | 70.0% | 95.0% | +5.0 pp | 50.1% |
| GPT-4o | A: 16 tools | 55.5% | 45.7% | 56.5% | +1.0 pp | 6.2% |
| GPT-4o | B: 43 tools | 70.0% | 55.0% | 79.7% | +9.7 pp | 6.2% |
| GPT-5.2 | A: 16 tools | 51.9% | 78.3% | 81.6% | +29.7 pp | 11.4% |
| GPT-5.2 | B: 43 tools | 82.4% | 98.2% | 91.6% | +9.2 pp | 11.4% |

Scenario A uses 20 tasks × 3 runs; B uses 100 tasks × 3 runs. These are **TAB results**, not BFCL scores. GPT-5.2 in B improves over native FC but regresses against JSON-as-text. The paper reports approximately 19,000 calls; its model-count convention and limitations are documented in [the evidence guide](docs/PUBLISHED-RESULTS.md).

## Paper 1: BFCL external validation

The detailed published BFCL table (**Table 4**, Sonnet 4, 20 tasks × 3 runs) reports:

| Condition | Accuracy | Tool selection | Parameter F1 | Token savings |
|-----------|----------|----------------|--------------|---------------|
| Natural | 85.7% | 86.7% | 84.2% | — |
| TSCG | 93.2% | 95.0% | 91.7% | 46.8% |
| TSCG+SAD | 89.0% | 90.0% | 87.5% | 46.0% |

TSCG: **+7.5 pp accuracy**, **46.8% token savings**. ARR is a ratio (about 108.8% from the rounded table values; summarized as 108% in the paper), not accuracy above 100%. The old GPT BFCL rows are withdrawn: they are not supported by the detailed published table. The abstract's broader ARR claim and this table are inconsistent; see [the explicit source note](docs/PUBLISHED-RESULTS.md#paper-1-bfcl-external-validation).

## Paper 1: Phi-4 and small-model tool-use enablement

**Phi-4 14B has no native tool calling in the tested Ollama deployment.** TSCG enables tool use through a text interface: compile the schemas, include the resulting text in the prompt, parse the model's generated tool name and arguments, then validate and execute the call in the host application. Native tool-calling support is not required for this path. `compress()` alone does not execute tools or add a native API interface to the model.

An unsupported native-FC path should be reported as **unsupported / N/A**, rather than interpreted as a measured reasoning score of zero. The published **0.0% → 84.4% (20 tools)** and **0.0% → 90.3% (50 tools)** results are **TAB Scenario D**, not Phi-4 BFCL leaderboard scores. Table 13 labels its baseline `json-text`; those published zeros must also not be silently relabelled as native-FC measurements or attributed solely to missing native support. The paper's E4 control identifies format translation as the dominant enablement mechanism (+92.0 pp format effect, -7.0 pp additional compression effect for Phi-4, Table 14).

| Model | Tools | Published JSON baseline | TSCG | Source |
|-------|-------|-------------------------|------|--------|
| Phi-4 14B | 20 | 0.0% | 84.4% | Table 13, TAB D |
| Phi-4 14B | 50 | 0.0% | 90.3% | Table 13, TAB D |
| Mistral 7B | 20 | 35.0% | 80.1% | Table 13, TAB D |
| Gemma 3 4B | 20 | 49.9% | 67.0% | Table 13, TAB D |

The paper separates format enablement from additional compression: gains against a failing JSON baseline do not imply gains against an already working text baseline. Conservative and balanced profiles can differ materially; [full small-model results](findings/small-model-enablement-v1.4.2.md) include regressions.

## Paper 2: agentic RAG enablement

The second study evaluates **14 models, 6,566 API calls, 28 tools**, and 8K/16K/32K budgets, using conservative compression (**44–50% schema-token savings**).

| Experiment | JSON | TSCG | Result | Paper 2 source |
|------------|------|------|--------|----------------|
| NovaTech-28, 8K, eight-model mean EM | 2.6% | 23.1% | +20.5 pp | Table 1 |
| Phi-4, NovaTech-28, 8K EM | 2% | 33% | +31 pp | Tables 1 and 5 |
| Phi-4, HotpotQA, 8K EM | 0% | 48% | +48 pp; 50 questions | Table 3 |
| 16K retrieval budget | 2,832 tokens / 9 chunks | 8,457 tokens / 26 chunks | More context; no general accuracy gain | Table 2; Section 4.2 |
| Sonnet 4, 200K, 500 tools EM | 0% | 90% | +90 pp | Table 4 |

At 8K, the uncompressed schemas overflow the budget; TSCG restores room for retrieval. At 32K, four of five tested models are within ±1 pp; Qwen2.5-Coder 32B is the +12 pp exception. The approximately 494-tool JSON overflow threshold and operation beyond 800 tools apply to Sonnet 4 at 200K with the tested catalog. RAG answer EM is a different metric from TAB tool-use accuracy.

## Operators and deployment

| Operator | Published name |
|----------|----------------|
| TAS | Tokenizer-Aligned Syntax |
| CFL | Constraint-First Layout |
| CFO | Causal-Forward Ordering |
| SDM | Semantic Density Maximization |
| DRO | Delimiter-Role Optimization |
| CCP | Causal Closure Principle |
| CAS | Causal Access Score |
| SAD-F | Selective Anchor Duplication with Fragility |

Paper 1 Table 15 finds different operator responses for Opus 4.7, Sonnet 4, and GPT-5.2; Table 3 shows why local-model profiles also need validation. Conservative is a starting point, not a zero-regression guarantee. The formal compression bound applies under Theorem 3.1's assumptions, not to every request or profile.

Full text-mode compilation can support models without native tool calling when the application supplies prompting, output parsing, validation, and execution. Description-only compression preserves native JSON schemas and relies on the model/provider's existing native tool support.

## Quick Start

The core, proxy, and tool-optimizer `@tscg/*` packages use umbrella versioning -- same version number, released together.

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
  model: 'claude-sonnet',   // Target model: 'claude-sonnet' | 'gpt-4' | 'gpt-5' | ...
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
# Opus 4.7 target profile
npx @tscg/mcp-proxy --target=claude-opus-4-7 --server=<your-mcp-command>

# Sonnet 4 target profile
npx @tscg/mcp-proxy --target=claude-sonnet-4 --server=<your-mcp-command>
```

Setting `--target` selects a model profile. The paper experiments have specific versions, profiles, and baselines; a proxy invocation does not guarantee the same accuracy or token savings. See [published results](docs/PUBLISHED-RESULTS.md).

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


## Project structure

```text
packages/
  core/             # Compiler and description-only compression
  mcp-proxy/        # MCP stdio proxy
  tool-optimizer/   # LangChain, MCP, Vercel AI SDK integrations
  openclaw/         # OpenClaw integration and profile tuning
cli/                # CLI entry point
benchmark/          # TAB harness, task generators, and experiment scripts
docs/               # Published result provenance and historical design notes
findings/           # Paper-backed research summaries
```

This checkout does not contain `paper/`, `paper2-rag-benchmark/`, or tracked per-call result checkpoints. Use the published arXiv versions for the manuscripts; repository PDFs are snapshots.

## Development

```bash
git clone https://github.com/SKZL-AI/tscg.git
cd tscg
npm install
npm run build
npm test
npm run typecheck
```

## Citation

```bibtex
@article{sakizli2026tscg,
  title={TSCG: Deterministic Tool-Schema Compilation for Agentic LLM Deployments},
  author={Sakizli, Furkan},
  year={2026},
  eprint={2605.04107},
  archivePrefix={arXiv},
  primaryClass={cs.SE},
  doi={10.48550/arXiv.2605.04107},
  url={https://arxiv.org/abs/2605.04107}
}

@article{sakizli2026tscgrag,
  title={Tool-Schema Compression Enables Agentic RAG Under Constrained Context Budgets},
  author={Sakizli, Furkan},
  year={2026},
  eprint={2605.26165},
  archivePrefix={arXiv},
  primaryClass={cs.SE},
  doi={10.48550/arXiv.2605.26165},
  url={https://arxiv.org/abs/2605.26165}
}
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
