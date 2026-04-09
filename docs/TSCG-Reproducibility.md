# TSCG Reproducibility Guide

**Document Version:** 1.0
**Date:** 2026-02-26
**Author:** SAI Sakizli / TSCG Research

---

## 1. System Requirements

### 1.1 Required Software

| Software | Minimum Version | Recommended | Purpose |
|----------|-----------------|-------------|---------|
| **Node.js** | 18.0.0 | 22.x LTS | Runtime for CLI, benchmarks, and build |
| **npm** | 9.x | 10.x | Package management |
| **TypeScript** | 5.9.0 | 5.9.3+ | Type checking and compilation |

### 1.2 Optional Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Git** | Any | Source control |
| **VS Code** | Any | Development (with TypeScript support) |

### 1.3 Hardware Requirements

- **Local optimization (no API):** Any machine that runs Node.js. No GPU required. Runs in < 1ms per prompt.
- **Benchmark suite:** Requires internet access to Anthropic API. Each run takes 3-6 minutes depending on model.
- **Browser bundle:** Any modern browser with ES2022 support.

### 1.4 API Requirements (Benchmark/Compile Only)

| Service | Requirement |
|---------|-------------|
| **Anthropic API** | Active API key with Claude model access |
| **Models tested** | claude-sonnet-4-20250514, claude-haiku-4-5-20251001 |
| **Estimated cost per benchmark run** | ~$0.05-0.15 (114 short API calls) |

---

## 2. Installation Steps

### 2.1 Clone and Install

```bash
git clone <repository-url> tscg
cd tscg
npm install
```

### 2.2 Verify Installation

```bash
# Type check (no output = success)
npx tsc --noEmit

# Run tests
npm test

# Check CLI
npx tsx src/cli/index.ts help
```

### 2.3 Build for Production

```bash
# Build TypeScript to dist/
npm run build

# Build browser bundle
npm run build:browser

# Build all (TypeScript + browser)
npm run build:all
```

After building, the following artifacts are produced:

```
dist/
  index.js          # Main ES module entry point
  index.d.ts        # TypeScript declarations
  cli/index.js      # CLI entry point
  optimizer/         # Optimizer module
  compiler/          # Compiler module
  benchmark/         # Benchmark runner
  core/              # Core types, API, strategies
  tscg.browser.js   # Standalone browser bundle (esbuild)
```

---

## 3. How to Run Benchmarks

### 3.1 Prerequisites

Set the Anthropic API key:

```bash
# Linux/macOS
export ANTHROPIC_API_KEY="sk-ant-..."

# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="sk-ant-..."

# Windows (cmd)
set ANTHROPIC_API_KEY=sk-ant-...
```

### 3.2 Run Full Benchmark

```bash
npm run benchmark
```

This runs all 19 core tests across all 6 strategies (114 API calls). Output is written to:
- Console: Live progress and summary table
- JSON file: `tscg-results/tscg-<model>-<timestamp>.json`

### 3.3 Run with Options

```bash
# Use a different model
TSCG_MODEL=claude-haiku-4-5-20251001 npm run benchmark

# Run only the 25 hard benchmark tests
npx tsx src/cli/index.ts benchmark --hard

# Run all tests combined (core 19 + hard 25 = 44 tests)
npx tsx src/cli/index.ts benchmark --all

# Run only tests in a specific category
npx tsx src/cli/index.ts benchmark --category=AmbiguousMath

# Include long-context tests
npx tsx src/cli/index.ts benchmark --long

# Run specific strategies only
npx tsx src/cli/index.ts benchmark --strategies=natural,tscg,tscg+sad

# Quiet mode (suppress per-test output)
npx tsx src/cli/index.ts benchmark --quiet
```

### 3.4 Benchmark Strategies

The benchmark tests 6 strategies:

| Strategy | Description |
|----------|-------------|
| `natural` | Original natural language prompt (baseline) |
| `repetition` | Prompt repeated twice (Leviathan method) |
| `tscg` | TSCG-optimized prompt (SDM + CFL + DRO + TAS + MC-COMPACT) |
| `tscg+sad` | TSCG + Selective Anchor Duplication (SAD-F) |
| `tscg+rep` | TSCG prompt repeated twice |
| `ccp` | Natural language + Causal Closure block appended |

### 3.5 Benchmark Test Categories

**Core Tests (19):**

| Category | Tests | Description |
|----------|-------|-------------|
| Factual | 4 | Simple knowledge recall (capital, atomic number, planet, element) |
| Reasoning | 4 | Math word problems, sequences, syllogisms, geometry |
| Classification | 2 | Sentiment analysis, food categorization |
| Extraction | 1 | Name extraction from a list (position 13) |
| OptFirst | 3 | Multiple choice where TSCG constraint-first should help |
| Complex | 2 | Multi-step calculations (distance, discount) |
| NearDup | 3 | Near-duplicate string matching in long texts |

**Hard Tests (25):**

| Category | Tests | Description |
|----------|-------|-------------|
| MultiConstraint_Hard | 6 | Triple/quad constraint filtering, exclusion, format+logic |
| AmbiguousMath | 5 | Percent-on-percent, reverse percentage, weighted averages |
| PrecisionExtraction | 5 | Dense number extraction, similar name disambiguation |
| FormatCritical | 5 | ISO codes, exact JSON format, CSV, exact word count |
| LongDependency | 4 | Start-end dependencies, conditional chains, reference resolution |

---

## 4. How to Use the Optimizer

### 4.1 CLI Usage

```bash
# Basic optimization (local, no API needed)
npx tsx src/cli/index.ts optimize "Please help me find the capital city of France"

# With specific profile
npx tsx src/cli/index.ts optimize --profile=full "What is the atomic number of gold?"

# Quiet mode (output only the optimized prompt)
npx tsx src/cli/index.ts optimize --quiet "Calculate the area of a rectangle with length 24 and width 8"

# Verbose mode (show transform pipeline)
npx tsx src/cli/index.ts optimize --verbose "A store has 45 apples. They sell 12 and receive 30."

# JSON output
npx tsx src/cli/index.ts optimize --json "Classify this as positive or negative: terrible product"

# Markdown output
npx tsx src/cli/index.ts optimize --markdown "What is the largest planet?"

# Compare all profiles side-by-side
npx tsx src/cli/index.ts optimize --compare "List the top 3 countries by population"

# Write output to file
npx tsx src/cli/index.ts optimize --json --out=result.json "Your prompt here"

# Read prompt from file
npx tsx src/cli/index.ts optimize --file prompt.txt

# Pipe mode
echo "What is 2+2?" | npx tsx src/cli/index.ts optimize --quiet

# Interactive REPL mode
npx tsx src/cli/index.ts optimize --interactive
```

### 4.2 Optimizer Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--profile=NAME` | Optimization profile | balanced |
| `--hybrid` | Use Claude API for NL-to-TSCG compilation + local transforms | off |
| `--compare` | Run all profiles and compare | off |
| `--json` | Output as JSON | off |
| `--markdown` | Output as Markdown | off |
| `--out=PATH` | Write output to file | stdout |
| `--file PATH` | Read input from file | stdin/args |
| `--no-sadf` | Disable SAD-F (anchor duplication) | enabled |
| `--no-ccp` | Disable CCP (causal closure) | enabled |
| `--sad-k=N` | SAD-F anchor count | 4 |
| `--verbose` | Show detailed transform pipeline | off |
| `--quiet` | Only output the optimized prompt | off |
| `--interactive` / `-i` | Enter REPL mode | off |

### 4.3 Optimization Profiles

| Profile | Transforms Enabled | Best For |
|---------|-------------------|----------|
| `minimal` | SDM, CFL | Lightest touch, minimal change |
| `balanced` | SDM, DRO, CFL, CFO, TAS, MC-COMPACT, CTX-WRAP | General use (default) |
| `max_compress` | SDM, DRO, CFL, CFO, TAS, MC-COMPACT, CTX-WRAP | Maximum token reduction |
| `max_accuracy` | SDM, CFL, DRO, TAS, MC-COMPACT, CTX-WRAP, CCP, SAD-F | Maximum accuracy (adds CCP + SAD-F) |
| `full` | All 10 transforms | Every transform enabled |

### 4.4 Programmatic API

```typescript
import { optimizePrompt } from 'tscg';

const result = optimizePrompt("Please help me find the capital of France", {
  profile: 'balanced',
  enableSADF: true,
  enableCCP: false,
  sadTopK: 4,
  verbose: false,
});

console.log(result.optimized);
// Output: "[ANSWER:single_word] Capital of France"

console.log(result.metrics);
// { originalChars: 43, optimizedChars: 35, compressionRatio: 0.81, ... }
```

### 4.5 Batch Optimization

```typescript
import { batchOptimize } from 'tscg';

const prompts = [
  "What is the capital of Germany?",
  "Please calculate 25 times 4",
  "Classify this review as positive or negative: great product",
];

const results = batchOptimize(prompts, { profile: 'balanced' });

results.forEach(r => {
  console.log(`${r.original} -> ${r.optimized}`);
  console.log(`  Savings: ${r.metrics.tokensSaved} tokens`);
});
```

---

## 5. How to Use the Browser Bundle

### 5.1 Build the Browser Bundle

```bash
npm run build:browser
```

This produces `dist/tscg.browser.js` via esbuild.

### 5.2 Usage in HTML

```html
<script type="module">
  import { optimizePrompt, analyzePrompt } from './dist/tscg.browser.js';

  const result = optimizePrompt("Please help me find the capital of France");
  console.log(result.optimized);  // "[ANSWER:single_word] Capital of France"

  const analysis = analyzePrompt("Calculate 25 * 4");
  console.log(analysis.type);    // "reasoning"
  console.log(analysis.outputFormat); // "integer"
</script>
```

### 5.3 Usage in a Browser Extension

The browser bundle can be imported in Chrome/Firefox extension content scripts or popup scripts. No external network calls are made by the optimizer -- it runs entirely in the browser's JavaScript engine.

---

## 6. How to Run Tests

### 6.1 Unit Tests

```bash
# Run all tests once
npm test

# Watch mode (re-run on file changes)
npm run test:watch
```

Tests use Vitest (v4.0.18+) and cover:
- Analyzer: prompt classification, parameter extraction, format detection
- Transforms: individual transform correctness
- Optimizer: pipeline integration, profile selection
- Statistics: Wilson CI, McNemar test calculations

### 6.2 Type Checking

```bash
npm run typecheck
```

This runs `tsc --noEmit` to verify all type annotations are correct without producing output files.

---

## 7. Environment Variables

| Variable | Required For | Default | Description |
|----------|-------------|---------|-------------|
| `ANTHROPIC_API_KEY` | benchmark, compile, hybrid optimize | none | Anthropic API key (sk-ant-...) |
| `TSCG_MODEL` | benchmark, compile | claude-sonnet-4-20250514 | Model ID for API calls |

**Note:** The local optimizer (`tscg optimize` without `--hybrid`) requires NO environment variables. It runs entirely offline.

---

## 8. Expected Results and How to Verify

### 8.1 Optimizer Output Verification

The optimizer is deterministic. For any given input, verify the output matches:

```bash
# This should always produce the same output
npx tsx src/cli/index.ts optimize --quiet "What is the capital of Australia?"
# Expected: "[ANSWER:single_word] Capital of Australia"

npx tsx src/cli/index.ts optimize --quiet "Please kindly help me figure out the capital city of Australia"
# Expected: "[ANSWER:single_word] Capital city of Australia"

npx tsx src/cli/index.ts optimize --quiet --profile=full "A store has 45 apples. They sell 12 and then receive 30 more. How many apples remain?"
# Expected: TSCG-optimized prompt with constraint, operations, closure block, and anchors
```

### 8.2 Benchmark Verification

Benchmark results will vary across runs due to LLM non-determinism. Expected ranges based on our data:

**Core Tests (19 tests, 11 runs):**

| Strategy | Expected Accuracy Range | Expected Token Ratio |
|----------|------------------------|---------------------|
| natural | 94-100% | 1.000 (baseline) |
| repetition | 94-100% | ~1.78 |
| tscg | 89-100% | ~0.94 |
| tscg+sad | 89-100% | ~1.06-1.28 |
| tscg+rep | 89-100% | ~1.66 |
| ccp | 94-100% | ~1.49 |

**Hard Tests (25 tests, initial run):**

| Strategy | Observed Accuracy | Token Ratio |
|----------|------------------|-------------|
| natural | 96.0% | 1.000 (baseline) |
| tscg | 92.0% | 0.92 (7.6% saved) |
| tscg+sad | 92.0% | 1.20 (20.4% overhead) |

### 8.3 Token Savings Verification

TSCG base strategy should consistently show 5-7% token savings versus natural:

```bash
npx tsx src/cli/index.ts optimize --json "Your test prompt here" | jq '.metrics.compressionRatio'
# Expected: value < 1.0 (lower = more compression)
```

---

## 9. Known Sources of Non-Determinism

### 9.1 LLM API Responses

The primary source of variance in benchmark results is LLM non-determinism. Even with identical prompts, different API calls may return different responses. This affects:
- Accuracy scores (correct/incorrect)
- Output token counts
- Latency measurements

**Mitigation:** Run benchmarks multiple times and report mean/standard deviation.

### 9.2 API Token Counting

Token counts reported by the API may vary slightly between runs for the same prompt due to:
- Model version changes (even within the same model ID)
- Tokenizer implementation details
- System prompt token overhead

**Mitigation:** Compare token ratios rather than absolute token counts.

### 9.3 What IS Deterministic

The following are fully deterministic and will produce identical output across runs:
- `optimizePrompt()` function (given same input + options)
- `analyzePrompt()` function
- All 10 transforms in `transforms.ts`
- The browser bundle
- JSON/Markdown report generation

---

## 10. How to Build from Source

### 10.1 Development Setup

```bash
# Clone repository
git clone <repository-url>
cd tscg

# Install dependencies
npm install

# Verify setup
npx tsc --noEmit          # Type check
npm test                   # Unit tests
npx tsx src/cli/index.ts help  # CLI
```

### 10.2 Build Targets

```bash
# TypeScript compilation (produces dist/)
npm run build
# Produces: dist/**/*.js, dist/**/*.d.ts, dist/**/*.js.map

# Browser bundle (produces dist/tscg.browser.js)
npm run build:browser
# Produces: dist/tscg.browser.js (single file, tree-shaken)

# Both targets
npm run build:all
```

### 10.3 Project Structure

```
tscg/
  src/
    index.ts              # Public API exports
    browser.ts            # Browser-specific exports
    cli/
      index.ts            # CLI entry point (tscg command)
    core/
      types.ts            # Core type definitions
      api.ts              # Anthropic API client
      strategies.ts       # Strategy definitions (natural, tscg, etc.)
      statistics.ts       # Wilson CI, McNemar test, Cohen's h
    optimizer/
      analyzer.ts         # Prompt analysis (classification, parameters, etc.)
      transforms.ts       # 10 deterministic transforms
      optimizer.ts        # Pipeline orchestrator
      report.ts           # Output formatting (text, JSON, Markdown)
    compiler/
      compiler.ts         # API-based NL-to-TSCG compiler
    benchmark/
      runner.ts           # Benchmark execution engine
      test-cases.ts       # 19+ test case definitions
  dist/                   # Build output
  tscg-results/           # Benchmark result JSON files
  TSCG/                   # Research documents
  docs/                   # Documentation (this file)
  package.json
  tsconfig.json
  esbuild.browser.mjs     # Browser bundle build script
```

### 10.4 TypeScript Configuration

Key `tsconfig.json` settings:
- **target:** ES2022
- **module:** NodeNext
- **moduleResolution:** NodeNext
- **strict:** true
- **outDir:** dist
- **rootDir:** src
- **declaration:** true (generates .d.ts files)
- **sourceMap:** true (generates .js.map files)

### 10.5 Runtime Dependencies

TSCG has **zero runtime dependencies**. All dependencies are devDependencies:

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.9.3 | TypeScript compiler |
| tsx | ^4.21.0 | TypeScript execution for development |
| vitest | ^4.0.18 | Test runner |
| esbuild | ^0.25.12 | Browser bundle builder |
| @types/node | ^25.3.0 | Node.js type definitions |

---


---

## 11. v1.1.0 Update: Multi-Model Benchmarks and New CLI Options

**Date:** 2026-02-27

### 11.1 Multi-Model Provider Support

v1.1.0 introduces a provider abstraction layer supporting multiple LLM providers. The benchmark and compiler modules can now target any supported provider.

#### Supported Providers

| Provider | Models | Status |
|----------|--------|--------|
| **Anthropic** | claude-sonnet-4-20250514, claude-haiku-4-5-20251001 | Fully tested |
| **OpenAI** | gpt-4o-2024-11-20, gpt-5.2 | Tested (combined, RAG, tools) |
| **Gemini** | gemini-2.5-flash, gemini-2.5-pro (limited -- see note) | Tested (combined, RAG, tools) |

**Note on Gemini 2.5 Pro:** This is a thinking model that routes output to a separate thinking-token field. The standard `generateContent` API returns empty text responses (0 output tokens). Gemini 2.5 Pro requires thinking-mode API handling not currently supported. Use `gemini-2.5-flash` for Gemini benchmarks.

**Note on GPT-5.2:** This model requires the `max_completion_tokens` parameter instead of `max_tokens`. The provider abstraction layer handles this automatically for GPT-5+ model IDs.

### 11.2 New Environment Variables

| Variable | Required For | Default | Description |
|----------|-------------|---------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic provider | none | Anthropic API key (sk-ant-...) |
| `OPENAI_API_KEY` | OpenAI provider | none | OpenAI API key (sk-...) |
| `GEMINI_API_KEY` | Gemini provider | none | Google AI API key |
| `TSCG_PROVIDER` | benchmark, compile | anthropic | Provider name (anthropic, openai, gemini) |
| `TSCG_MODEL` | benchmark, compile | claude-sonnet-4-20250514 | Model ID |

**Note:** Only one provider API key is required at a time. Set the key for the provider you want to use.

### 11.3 New CLI Flags

```bash
# Provider selection
npx tsx src/cli/index.ts benchmark --provider=openai --model=gpt-4o-2024-11-20

# GPT-5.2 (requires max_completion_tokens -- handled automatically)
npx tsx src/cli/index.ts benchmark --provider=openai --model=gpt-5.2

# Gemini 2.5 Flash
npx tsx src/cli/index.ts benchmark --provider=gemini --model=gemini-2.5-flash

# Provider shorthand (uses default model for each provider)
npx tsx src/cli/index.ts benchmark --provider=openai

# Via environment variables
TSCG_PROVIDER=openai TSCG_MODEL=gpt-5.2 npm run benchmark
```

| Flag | Description | Default |
|------|-------------|---------|
| `--provider=NAME` | LLM provider (anthropic, openai, gemini) | anthropic |
| `--model=ID` | Model identifier | Provider-specific default |

### 11.3.1 Provider-Specific CFL Behavior (v1.2.0)

When running benchmarks with `--provider`, the system automatically applies model-aware CFL profiles:

| Provider | CFL Active | Effect |
|----------|-----------|--------|
| `anthropic` | Yes | Full TSCG optimization including [ANSWER:type] |
| `openai` (GPT-5.x) | Yes | Full TSCG optimization including [ANSWER:type] |
| `openai` (GPT-4o) | **No** | [ANSWER:type] and [ANCHOR:...] tags stripped |
| `gemini` | **No** | [ANSWER:type] and [ANCHOR:...] tags stripped |

This means benchmark results for GPT-4o and Gemini reflect TSCG without CFL annotations, which eliminates the echo-back problem observed in v1.1.0 cross-model benchmarks. To reproduce v1.1.0 results (with CFL echo-back), the model profile system can be bypassed by not passing provider/model to the optimizer.

### 11.4 Running Multi-Model Benchmarks

#### Step 1: Set API Keys

```bash
# Linux/macOS
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GEMINI_API_KEY="AIza..."

# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="sk-ant-..."
$env:OPENAI_API_KEY="sk-..."
$env:GEMINI_API_KEY="AIza..."

# Windows (cmd)
set ANTHROPIC_API_KEY=sk-ant-...
set OPENAI_API_KEY=sk-...
set GEMINI_API_KEY=AIza...
```

#### Step 2: Run Benchmarks Per Provider

```bash
# Anthropic (default)
npx tsx src/cli/index.ts benchmark --all

# OpenAI GPT-4o
npx tsx src/cli/index.ts benchmark --all --provider=openai --model=gpt-4o-2024-11-20

# OpenAI GPT-5.2
npx tsx src/cli/index.ts benchmark --all --provider=openai --model=gpt-5.2

# Gemini 2.5 Flash
npx tsx src/cli/index.ts benchmark --all --provider=gemini --model=gemini-2.5-flash
```

#### Step 3: Compare Results

Results are written to `tscg-results/` with provider and model in the filename:
- `tscg-claude-sonnet-4-20250514-2026-02-27T*.json`
- `tscg-gpt-4o-2024-11-20-2026-02-27T*.json`
- `tscg-gpt-5.2-2026-02-27T*.json`
- `tscg-gemini-2.5-flash-2026-02-27T*.json`

### 11.5 Rate Limiter

v1.1.0 includes an automatic rate limiter that prevents 429 errors during benchmark execution. It features:

- **Token budget tracking:** Monitors cumulative tokens within a 60-second window
- **Adaptive delay:** Adjusts inter-request delay based on rate-limit responses
- **Exponential backoff:** Automatic retry with increasing delays on 429 errors
- **Request serialization:** Prevents burst patterns

The rate limiter is transparent -- no configuration is required. It activates automatically during benchmark and compile operations.

### 11.6 Expected Results (v1.1.0 Multi-Model)

**Claude Sonnet 4 (clean domain benchmarks):**

| Domain | Natural | TSCG | TSCG+SAD | Token Savings |
|--------|---------|------|----------|---------------|
| RAG (22) | 95.5% | 100% | 100% | -- |
| Tools (30) | 96.7% | 93.3% | 93.3% | 71.7% |
| NIAH (30) | 50.0% | 83.3% | 73.3% | -- |
| Combined (44) | 93.2% | 95.5% | 90.9% | 7.0% |

**GPT-4o-2024-11-20:**

| Domain | Natural | TSCG | TSCG+SAD | Token Savings |
|--------|---------|------|----------|---------------|
| RAG (22) | 100% | 100% | 100% | -- |
| Tools (30) | 100% | 96.7% | 96.7% | 73.9% |
| Combined (44) | 90.9% | 84.1% | 75.0% | 8.6% |

**GPT-5.2:**

| Domain | Natural | TSCG | TSCG+SAD | Token Savings |
|--------|---------|------|----------|---------------|
| RAG (22) | 90.9% | 95.5% | 95.5% | -- |
| Tools (30) | 100% | 100% | 100% | 73.9% |
| Combined (44) | 95.5% | 90.9% | 90.9% | 8.8% |

**Gemini 2.5 Flash:**

| Domain | Natural | TSCG | TSCG+SAD | Token Savings |
|--------|---------|------|----------|---------------|
| RAG (22) | 77.3% | 72.7% | 68.2% | -- |
| Tools (30) | 83.3% | 90.0% | 90.0% | 70.9% |
| Combined (44) | 95.5% | 88.6% | 75.0% | 6.4% |

### 11.7 Updated Test Suite

```bash
# Run all 435 tests
npm test

# Expected output: 435 tests passing (387 existing + 28 provider + 20 rate limiter)
```

---

*This guide provides complete instructions for reproducing all TSCG results, including v1.1.0 multi-model benchmarks across 4 models (Claude Sonnet 4, GPT-4o, GPT-5.2, Gemini 2.5 Flash). For questions or issues, refer to the source code in the `src/` directory.*

---

## 12. v5.0 Update: TAB Benchmark Reproduction and npm Packages

**Date:** 2026-03-02

### 12.1 Additional Software Requirements (v5.0)

| Software | Version | Purpose |
|----------|---------|---------|
| **pnpm** | 8.x+ | Monorepo workspace management (for packages/) |
| **Ollama** | Any | Local model provider (optional, for Scenario D small-model tests) |

### 12.2 npm Package Installation

#### For End Users (Using TSCG in Your Project)

```bash
# Install the core compression library
npm install @tscg/core

# Install framework adapters (optional)
npm install @tscg/tool-optimizer
```

#### Usage

```typescript
import { compressTools } from '@tscg/core';

const tools = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the filesystem',
    parameters: [
      { name: 'path', type: 'string', description: 'The file path to read', required: true },
      { name: 'encoding', type: 'string', description: 'File encoding', required: false },
    ],
  },
  // ... more tools
];

const result = compressTools(tools);
console.log(result.text);            // Compressed tool schemas
console.log(result.savingsPercent);  // e.g., 71.7
```

#### Framework-Specific Usage

```typescript
// LangChain integration
import { optimizeLangChainTools } from '@tscg/tool-optimizer/langchain';

// MCP integration
import { optimizeMCPTools } from '@tscg/tool-optimizer/mcp';

// Vercel AI SDK integration
import { optimizeVercelTools } from '@tscg/tool-optimizer/vercel';
```

### 12.3 Building npm Packages from Source

```bash
# Navigate to project root
cd D:\0_TSCG

# Install workspace dependencies (requires pnpm)
pnpm install

# Build @tscg/core
cd packages/core
pnpm build    # tsup -> dist/ (ESM + CJS + .d.ts)
pnpm test     # Run package-level tests
pnpm lint     # Type-check

# Build @tscg/tool-optimizer
cd ../tool-optimizer
pnpm build    # tsup -> dist/ (ESM + CJS + .d.ts for all sub-exports)
pnpm test
pnpm lint
```

### 12.4 TAB Benchmark Reproduction

#### 12.4.1 Prerequisites

Set API keys for the providers you want to benchmark:

```bash
# Required for frontier model benchmarks
export ANTHROPIC_API_KEY="sk-ant-..."    # Anthropic (Claude)
export OPENAI_API_KEY="sk-..."            # OpenAI (GPT-4o, GPT-5.2)

# Optional
export GEMINI_API_KEY="AIza..."           # Google (Gemini 2.5 Flash)

# For local models
# Install and start Ollama: https://ollama.com
# ollama pull llama3.1  (or any model)
```

#### 12.4.2 Running TAB Scenarios

```bash
# Run a specific scenario on frontier models
npx tsx benchmark/scripts/run-frontier.ts --scenario A
npx tsx benchmark/scripts/run-frontier.ts --scenario B
npx tsx benchmark/scripts/run-frontier.ts --scenario C
npx tsx benchmark/scripts/run-frontier.ts --scenario D
npx tsx benchmark/scripts/run-frontier.ts --scenario E

# Specify provider
npx tsx benchmark/scripts/run-frontier.ts --scenario A --provider anthropic
npx tsx benchmark/scripts/run-frontier.ts --scenario A --provider openai

# Run BFCL evaluation (Scenario D, cross-benchmark comparison)
npx tsx benchmark/scripts/run-bfcl.ts

# Run GSM8K reasoning-under-load
npx tsx benchmark/scripts/run-gsm8k.ts

# Run small-model stress test (requires Ollama)
npx tsx benchmark/scripts/run-small-models.ts
```

#### 12.4.3 Using the TAB CLI

```bash
# General-purpose TAB CLI
npx tab run --scenario A --model claude-sonnet-4 --runs 3
npx tab run --scenario A --runs 5
```

#### 12.4.4 Analyzing Results

```bash
# Combined analysis with Cohen's d and paired t-test
npx tsx benchmark/scripts/analyze-results.ts

# Results are output to benchmark/results/ as:
# - JSON files (machine-readable, full metadata)
# - CSV files (for spreadsheet analysis)
# - LaTeX tables (for paper inclusion)
# - Console summary (human-readable)
```

#### 12.4.5 Checkpoint and Resume

TAB supports checkpointing for long-running evaluations. If a benchmark run is interrupted:

```bash
# Resume from checkpoint
npx tab run --scenario C --checkpoint benchmark/results/last-checkpoint.json
```

Checkpoints save per-task results, allowing expensive API-bound evaluations to resume from the last completed task.

### 12.5 TAB Benchmark Structure

```
benchmark/
  schemas/collectors/          # Tool sources (A-E)
    claude-code.ts             # 16 real Claude Code tools (Scenario A)
    mcp-servers.ts             # 43 MCP tools from 4 servers (Scenario B)
    synthetic.ts               # 3-100 generated tools (Scenario C)
    bfcl.ts                    # 15 BFCL tools (Scenario D)

  tasks/generators/            # Deterministic task generation
    tool-selection.ts          # single_tool tasks
    multi-tool.ts              # multi_tool tasks
    param-extract.ts           # parameter_extraction tasks
    no-tool.ts                 # no_tool tasks
    gsm8k-load.ts              # 50 GSM8K questions x 4 schema loads

  compression/                 # Condition rendering
    pipeline.ts                # natural / tscg / tscg_sad rendering
    natural-renderer.ts        # Baseline (uncompressed) rendering
    token-counter.ts           # Token counting

  harness/                     # Execution engine
    runner.ts                  # Main runner with retry + checkpoint
    evaluator.ts               # Scoring (tool_sel_acc, param_f1)
    providers/                 # LLM backends (Anthropic, OpenAI, Ollama)
    reporters/                 # Output (JSON, CSV, LaTeX, console)

  scripts/                     # Standalone benchmark scripts
    run-frontier.ts            # Frontier model evaluation
    run-small-models.ts        # Ollama local model evaluation
    run-gsm8k.ts               # GSM8K-under-load
    run-bfcl.ts                # BFCL cross-benchmark
    analyze-results.ts         # Combined statistical analysis

  results/                     # Output directory
```

### 12.6 Expected TAB Results

TAB benchmarks have not been fully executed at time of writing. Expected patterns based on v1.1.0 data:

| Scenario | Expected Token Savings | Expected Accuracy Pattern |
|----------|----------------------|--------------------------|
| A (Claude Code, 16 tools) | 65-72% | TSCG should match natural on Claude; mixed on GPT-4o |
| B (MCP, 43 tools) | 65-72% | Larger catalog may increase TSCG advantage |
| C (Synthetic, 3-100 tools) | 60-75% (scaling with size) | Compression advantage expected to grow with catalog size |
| D (BFCL, 15 tools) | ~65.7% (observed) | Below 71.7% target for small catalogs |
| E (Combined, 59+ tools) | 70-75% | Largest catalog should show highest savings |
| GSM8K | 60-75% (schema overhead only) | TSCG should reduce reasoning degradation from schema context |

### 12.7 Environment Variables (Updated for v5.0)

| Variable | Required For | Default | Description |
|----------|-------------|---------|-------------|
| `ANTHROPIC_API_KEY` | TAB Anthropic provider | none | Anthropic API key |
| `OPENAI_API_KEY` | TAB OpenAI provider | none | OpenAI API key |
| `GEMINI_API_KEY` | TAB Gemini provider | none | Google AI API key |
| `TSCG_PROVIDER` | Legacy v1.1.0 benchmark | anthropic | Provider name |
| `TSCG_MODEL` | Legacy v1.1.0 benchmark | claude-sonnet-4-20250514 | Model ID |
| `OLLAMA_BASE_URL` | TAB Ollama provider | http://localhost:11434 | Ollama server URL |

---
