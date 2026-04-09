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

*This guide provides complete instructions for reproducing all TSCG results. For questions or issues, refer to the source code in the `src/` directory.*
