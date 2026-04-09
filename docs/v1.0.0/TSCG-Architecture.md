# TSCG Technical Architecture

**Document Version:** 2.0
**Date:** 2026-02-27
**Author:** SAI Sakizli / TSCG Research
**Source Code:** `src/` directory (TypeScript, ES2022, NodeNext modules)
**Transform Count:** 26 total (10 core + 4 long-context + 5 RAG + 4 tool + 3 new general)

---

## 1. System Overview

TSCG (Token-Context Semantic Grammar) is a deterministic prompt optimization framework that transforms natural language prompts into token-efficient formats grounded in causal attention theory.

### Architecture Diagram

```
+------------------------------------------------------------------+
|                         TSCG System                               |
|                                                                   |
|  +------------------+    +--------------------+    +----------+   |
|  |   CLI Interface  |    | Programmatic API   |    | Browser  |   |
|  | src/cli/index.ts |    | src/index.ts       |    | Bundle   |   |
|  +--------+---------+    +--------+-----------+    +----+-----+   |
|           |                       |                      |        |
|           v                       v                      v        |
|  +----------------------------------------------------------+    |
|  |               Optimizer Pipeline                          |    |
|  |                src/optimizer/optimizer.ts                  |    |
|  |                                                           |    |
|  |  +-----------+    +----------------+    +-------------+   |    |
|  |  | Analyzer  |--->| 10 Transforms  |--->| Report Gen  |   |    |
|  |  | analyzer  |    | transforms.ts  |    | report.ts   |   |    |
|  |  +-----------+    +----------------+    +-------------+   |    |
|  +----------------------------------------------------------+    |
|           |                                                       |
|           v (hybrid mode only)                                    |
|  +----------------------------------------------------------+    |
|  |               Compiler (API-based)                        |    |
|  |              src/compiler/compiler.ts                      |    |
|  |  NL Prompt ---[Claude API]---> TSCG Syntax                |    |
|  +----------------------------------------------------------+    |
|           |                                                       |
|           v (benchmark mode only)                                 |
|  +----------------------------------------------------------+    |
|  |               Benchmark Suite                             |    |
|  |  +---------------+    +--------------+    +-----------+   |    |
|  |  | Test Cases    |    | Runner       |    | Statistics |   |    |
|  |  | test-cases.ts |    | runner.ts    |    | stats.ts   |   |    |
|  |  +---------------+    +--------------+    +-----------+   |    |
|  +----------------------------------------------------------+    |
|           |                                                       |
|           v                                                       |
|  +----------------------------------------------------------+    |
|  |               Core Layer                                  |    |
|  |  +---------+    +----------+    +-------------+           |    |
|  |  | Types   |    | API      |    | Strategies  |           |    |
|  |  | types.ts|    | api.ts   |    | strategies  |           |    |
|  |  +---------+    +----------+    +-------------+           |    |
|  +----------------------------------------------------------+    |
+------------------------------------------------------------------+
```

---

## 2. Module Dependency Graph

```
src/index.ts (public API)
  |
  +-- core/types.ts         (no deps - leaf module)
  +-- core/statistics.ts    (no deps - leaf module)
  +-- core/api.ts           (depends: types.ts)
  +-- core/strategies.ts    (depends: types.ts, compiler/compiler.ts)
  |
  +-- optimizer/analyzer.ts (no deps - leaf module)
  +-- optimizer/transforms.ts (depends: analyzer.ts)
  +-- optimizer/optimizer.ts  (depends: analyzer.ts, transforms.ts, compiler/compiler.ts, types.ts)
  +-- optimizer/report.ts     (depends: optimizer.ts)
  |
  +-- compiler/compiler.ts  (depends: types.ts, api.ts)
  |
  +-- benchmark/test-cases.ts (depends: types.ts)
  +-- benchmark/runner.ts     (depends: types.ts, api.ts, strategies.ts, statistics.ts)

src/cli/index.ts (CLI entry point)
  +-- benchmark/test-cases.ts
  +-- benchmark/runner.ts
  +-- compiler/compiler.ts
  +-- optimizer/optimizer.ts
  +-- optimizer/report.ts
  +-- core/types.ts

src/browser.ts (browser entry point)
  +-- optimizer/analyzer.ts
  +-- optimizer/transforms.ts
  +-- optimizer/optimizer.ts
```

### Key Architectural Principles

1. **No circular dependencies:** The dependency graph is a DAG (directed acyclic graph)
2. **Core layer has zero imports from other layers:** `types.ts` and `statistics.ts` are leaf modules
3. **Optimizer is self-contained:** Can run without API, compiler, or benchmark modules
4. **Browser bundle excludes:** API client, benchmark runner, CLI (reduces bundle size)

---

## 3. Core Optimizer Pipeline (10 Transforms in Order)

The core optimizer executes transforms in a fixed, theoretically motivated order. Each transform receives the output of the previous one. Additional domain-specific transforms (Sections 12-15) extend this pipeline for long-context, RAG, tool, and advanced general use cases.

```
Input NL Prompt
      |
      v
[1. ANALYZE] ---- Classify prompt type, extract structure
      |
      v
[2. SDM] --------- Strip filler words and hedging (Semantic Density Maximization)
      |
      v
[3. DRO] --------- Optimize delimiters: "options: A, B, C" -> "A|B|C" (Delimiter-Role Optimization)
      |
      v
[4. CFL] --------- Prepend [ANSWER:type] constraint at position 0 (Constraint-First Layout)
      |
      v
[5. CFO] --------- Reorder into causal chain: initial:X -> op1:Y -> result (Causal-Forward Ordering)
      |
      v
[6. TAS] --------- Replace non-BPE-optimal delimiters: "=>" -> "→" (Tokenizer-Aligned Syntax)
      |
      v
[7. MC-COMPACT] -- Compact multiple choice: "A. Foo\nB. Bar" -> "A:Foo B:Bar"
      |
      v
[8. CTX-WRAP] ---- Wrap context blocks: <<CTX>>...<<CTX>>
      |
      v
[9. CCP] --------- Append ###<CC>...###</CC> closure block (Causal Closure Principle)
      |
      v
[10. CAS] -------- Verify and reorder by causal access score (Causal Access Score)
      |
      v
[11. SAD-F] ------ Append [ANCHOR:key:value,...] duplication tag (Selective Anchor Duplication)
      |
      v
Optimized TSCG Prompt
```

### Pipeline Execution Control

Not all transforms run on every prompt. Two control mechanisms determine which transforms execute:

**1. Profile-based enablement:**

| Profile | Enabled Transforms |
|---------|--------------------|
| minimal | SDM, CFL |
| balanced | SDM, DRO, CFL, CFO, TAS, MC-COMPACT, CTX-WRAP |
| max_compress | SDM, DRO, CFL, CFO, TAS, MC-COMPACT, CTX-WRAP |
| max_accuracy | SDM, CFL, DRO, TAS, MC-COMPACT, CTX-WRAP, CCP, SAD-F |
| full | All 10 transforms + CAS |

**2. Analysis-based skipping:** Each transform has internal guards based on the analyzer output:
- CFO skips if `operations.length < 2`
- CCP skips if `wordCount < 15`
- CAS skips if `parameters.length < 2`
- MC-COMPACT skips if `hasMultipleChoice === false`
- CTX-WRAP skips if no context block detected
- SAD-F skips if no key:value pairs and no parameters found

---

## 4. Analyzer: Prompt Classification Algorithm

### 4.1 Overview

The analyzer (`src/optimizer/analyzer.ts`) is a deterministic, rule-based prompt classifier. It takes a natural language prompt and produces a `PromptAnalysis` object containing:

- **Prompt type** (factual, reasoning, classification, extraction, generation, instruction, comparison, conversion, multi_constraint, unknown)
- **Output format** (single_word, number, integer, boolean, letter, list, json, text, code, unknown)
- **Extracted parameters** with fragility scores
- **Detected operations** with ordering
- **Constraints** (format, length, style, include, exclude, options)
- **Filler words** identified for removal
- **Multiple choice detection** with option extraction
- **Structural metrics** (word count, sentence count, estimated tokens)

### 4.2 Classification Algorithm

The classifier uses weighted pattern matching:

```
For each PromptType:
  score = 0
  For each pattern in TYPE_PATTERNS[type]:
    if pattern matches input:
      score += pattern.weight
  types_scored[type] = score

winner = argmax(types_scored)
if max_score == 0: type = "unknown"
```

Pattern weights by type:
- **reasoning:** weight 1.2 (boosted because reasoning prompts benefit most from TSCG)
- **classification:** weight 1.1
- **extraction:** weight 1.1
- **factual:** weight 1.0
- **comparison:** weight 1.0
- **conversion:** weight 1.0
- **generation:** weight 0.9 (lowered because generation benefits less from TSCG)
- **instruction:** weight 0.9

### 4.3 Output Format Detection

The format detector uses a priority hierarchy:

```
1. If hasJsonRequest: "json"
2. If hasCodeRequest: "code"
3. If hasMultipleChoice: "letter"
4. If pattern matches integer keywords: "integer"
5. If pattern matches number keywords: "number"
6. If pattern matches boolean keywords: "boolean"
7. If pattern matches single_word keywords: "single_word"
8. If pattern matches list keywords: "list"
9. Default: "text"
```

### 4.4 Parameter Extraction

Parameters are extracted via regex patterns:

```typescript
// Number parameters: "45 apples" -> { key: "num_apples", value: "45", fragility: 0.9 }
// Named entities: "capital of Australia" -> { key: "entity", value: "Australia", fragility: 0.95 }
// Measurement values: "24 cm" -> { key: "value_cm", value: "24", fragility: 0.9 }
```

Fragility scores are assigned heuristically:
- **Named entities:** 0.95 (high fragility -- changing the entity changes the answer)
- **Numeric values:** 0.9 (high fragility -- changing a number changes the result)
- **Option labels:** 0.7 (medium fragility)
- **Filler parameters:** 0.3 (low fragility)

---

## 5. Transform Details: Input/Output Contracts

### 5.1 SDM (Semantic Density Maximization)

| Property | Value |
|----------|-------|
| **Purpose** | Remove filler words, hedging, politeness wrappers |
| **Input** | Natural language prompt |
| **Output** | Denser prompt with filler removed |
| **Token impact** | Saves 0-15+ tokens depending on verbosity |
| **Skip condition** | Never skips (always applies patterns) |
| **Pattern count** | 30+ regex patterns for English filler |

**Example:**
```
Input:  "Please kindly help me figure out what the capital city of Australia is, I would really appreciate it"
Output: "Capital city of Australia"
```

### 5.2 DRO (Delimiter-Role Optimization)

| Property | Value |
|----------|-------|
| **Purpose** | Replace verbose natural language delimiters with compact symbols |
| **Input** | Prompt (post-SDM) |
| **Output** | Prompt with `:`, `|`, arrows as delimiters |
| **Token impact** | Saves 1-5 tokens typically |
| **Skip condition** | Skips if no delimiter opportunities found |

**Transformations performed:**
- `"A. Conduction\nB. Radiation"` to `"A:Conduction B:Radiation"`
- `"positive, negative, or neutral"` to `"positive|negative|neutral"`
- `"and then"` / `"then"` to `" -> "`
- `"Next, ..."` / `"Then, ..."` / `"Finally, ..."` to `" -> ..."`

### 5.3 CFL (Constraint-First Layout)

| Property | Value |
|----------|-------|
| **Purpose** | Place output format constraint at position 0 (attention sink zone) |
| **Input** | Prompt (post-DRO) |
| **Output** | `[ANSWER:type] ` + prompt |
| **Token impact** | Adds 3-8 tokens (constraint tag) |
| **Skip condition** | Skips if text already starts with `[` |

**Constraint tag formats:**
- `[ANSWER:single_word]` -- factual single-word answers
- `[ANSWER:integer]` -- math results
- `[ANSWER:number]` -- numeric results
- `[ANSWER:yes|no]` -- boolean questions
- `[ANSWER:letter]` -- multiple choice
- `[ANSWER:json]` -- JSON output requests
- `[CLASSIFY:positive|negative|neutral]` -- classification tasks

### 5.4 CFO (Causal-Forward Ordering)

| Property | Value |
|----------|-------|
| **Purpose** | Reorder multi-step operations into causal chain (left to right) |
| **Input** | Prompt (post-CFL) |
| **Output** | `[ANSWER:type] initial:X -> op1:Y -> op2:Z -> result ->` |
| **Token impact** | Varies (may save or add tokens) |
| **Skip condition** | Skips if `operations.length < 2` or type is not reasoning with parameters |

**Example:**
```
Input:  "[ANSWER:integer] A store has 45 apples, sells 12, receives 30. How many remain?"
Output: "[ANSWER:integer] initial:45 -> sell:12 -> receive:30 -> result ->"
```

### 5.5 TAS (Tokenizer-Aligned Syntax)

| Property | Value |
|----------|-------|
| **Purpose** | Replace multi-token delimiters with BPE-efficient equivalents |
| **Input** | Prompt (post-CFO) |
| **Output** | Prompt with BPE-optimal delimiters |
| **Token impact** | Saves 0-3 tokens |
| **Skip condition** | Skips if delimiters already optimal |

**Replacements:**
- `=>` to UTF-8 arrow character (single BPE token)
- `-->` or `->` to arrow character
- `key : value` (with spaces around colon) to `key:value`
- Normalize semicolons to consistent spacing

### 5.6 MC-COMPACT (Multiple Choice Compaction)

| Property | Value |
|----------|-------|
| **Purpose** | Compact verbose multiple choice formatting |
| **Input** | Prompt (post-TAS) |
| **Output** | Compact single-line multiple choice |
| **Token impact** | Saves 3-10 tokens on multi-line MC prompts |
| **Skip condition** | Skips if `hasMultipleChoice === false` |

**Example:**
```
Input:  "A. Conduction\nB. Radiation\nC. Convection\nD. Insulation"
Output: "A:Conduction B:Radiation C:Convection D:Insulation"
```

### 5.7 CTX-WRAP (Context Wrapping)

| Property | Value |
|----------|-------|
| **Purpose** | Wrap large context blocks in explicit delimiters |
| **Input** | Prompt (post-MC-COMPACT) |
| **Output** | Prompt with `<<CTX>>...<<CTX>>` wrapped context |
| **Token impact** | Adds 2-4 tokens (delimiter tags) |
| **Skip condition** | Skips if no context block detected |

### 5.8 CCP (Causal Closure Principle)

| Property | Value |
|----------|-------|
| **Purpose** | Append a summary closure block repeating key semantic atoms |
| **Input** | Prompt (post-CTX-WRAP) |
| **Output** | Prompt + `\n###<CC>\n...;\n###</CC>` |
| **Token impact** | Adds 10-30 tokens (closure block) |
| **Skip condition** | Skips if `wordCount < 15` and type is not `multi_constraint` |

**Closure block format:**
```
###<CC>
task=reasoning;
num_apples=45;
num_sell=12;
num_receive=30;
OP=EMIT_INTEGER;
###</CC>
```

### 5.9 CAS (Causal Access Score)

| Property | Value |
|----------|-------|
| **Purpose** | Reorder key:value pairs by fragility score (highest fragility first) |
| **Input** | Prompt (post-CCP) |
| **Output** | Prompt with parameters reordered by fragility |
| **Token impact** | 0 (reordering only, no tokens added or removed) |
| **Skip condition** | Skips if `parameters.length < 2` or if order already optimal |

### 5.10 SAD-F (Selective Anchor Duplication with Fragility Weighting)

| Property | Value |
|----------|-------|
| **Purpose** | Duplicate highest-fragility atoms as anchors at end of prompt |
| **Input** | Prompt (post-CAS) |
| **Output** | Prompt + ` [ANCHOR:key:value,key:value,...]` |
| **Token impact** | Adds 5-15 tokens (anchor tag) |
| **Skip condition** | Skips if no key:value pairs or parameters found |
| **Budget control** | `topK` parameter limits number of anchors (default: 4) |

---

## 6. Type System (Key Interfaces)

### 6.1 Core Types (`src/core/types.ts`)

```typescript
// Grammar atom -- the fundamental unit of TSCG
interface TscgAtom {
  type: AtomType;       // 'constraint' | 'parameter' | 'operation' | 'context' | 'anchor' | 'delimiter' | 'section'
  key: string;
  value: string;
  position?: number;
  fragilityScore?: number;
}

// Compiled TSCG prompt
interface TscgPrompt {
  constraint: string;        // [ANSWER:type]
  parameters: TscgAtom[];    // key:value pairs
  operations: TscgAtom[];    // step chain
  context?: string;          // <<CTX>>...<<CTX>>
  anchors?: string[];        // [ANCHOR:...]
  raw: string;               // final string
}

// Strategy name (benchmark)
type StrategyName = 'natural' | 'repetition' | 'tscg' | 'tscg+sad' | 'tscg+rep' | 'ccp';

// Test case (benchmark)
interface TestCase {
  id: string;
  category: TestCategory;
  name: string;
  expected: string;
  natural: string;           // NL prompt
  tscg: string;              // TSCG grammar prompt
  check: (response: string) => boolean;
}
```

### 6.2 Analyzer Types (`src/optimizer/analyzer.ts`)

```typescript
type PromptType = 'factual' | 'reasoning' | 'classification' | 'extraction' |
                  'generation' | 'instruction' | 'comparison' | 'conversion' |
                  'multi_constraint' | 'unknown';

type OutputFormat = 'single_word' | 'number' | 'integer' | 'boolean' | 'letter' |
                    'list' | 'json' | 'text' | 'code' | 'unknown';

interface PromptAnalysis {
  original: string;
  type: PromptType;
  outputFormat: OutputFormat;
  constraints: PromptConstraint[];
  parameters: PromptParameter[];
  operations: PromptOperation[];
  context: string | null;
  question: string | null;
  fillerWords: string[];
  sentenceCount: number;
  wordCount: number;
  estimatedTokens: number;
  hasMultipleChoice: boolean;
  mcOptions: string[];
  hasNumberValues: boolean;
  hasListInput: boolean;
  hasJsonRequest: boolean;
  hasCodeRequest: boolean;
}
```

### 6.3 Optimizer Types (`src/optimizer/optimizer.ts`)

```typescript
type OptimizationProfile = 'balanced' | 'max_compress' | 'max_accuracy' | 'minimal' | 'full';

interface OptimizerOptions {
  profile: OptimizationProfile;
  enableSADF: boolean;
  enableCCP: boolean;
  sadTopK: number;
  verbose: boolean;
}

interface OptimizeResult {
  original: string;
  optimized: string;
  analysis: PromptAnalysis;
  pipeline: TransformPipeline;
  profile: OptimizationProfile;
  metrics: OptimizeMetrics;
}

interface OptimizeMetrics {
  originalChars: number;
  optimizedChars: number;
  originalTokensEst: number;
  optimizedTokensEst: number;
  compressionRatio: number;
  tokensRemoved: number;
  tokensSaved: number;
  transformsApplied: number;
  transformsSkipped: number;
  promptType: PromptType;
  outputFormat: string;
}
```

### 6.4 Transform Types (`src/optimizer/transforms.ts`)

```typescript
interface TransformResult {
  name: string;           // e.g., "SDM", "CFL"
  applied: boolean;       // whether transform was actually applied
  input: string;          // text before transform
  output: string;         // text after transform
  tokensRemoved: number;  // estimated tokens removed (negative = added)
  description: string;    // human-readable description
}

interface TransformPipeline {
  transforms: TransformResult[];
  original: string;
  optimized: string;
  totalTokensBefore: number;
  totalTokensAfter: number;
  compressionRatio: number;
}
```

---

## 7. Build System

### 7.1 TypeScript Compilation

```
tsconfig.json
  target: ES2022
  module: NodeNext
  moduleResolution: NodeNext
  strict: true
  outDir: dist/
  rootDir: src/
  declaration: true        # generates .d.ts
  declarationMap: true     # generates .d.ts.map
  sourceMap: true          # generates .js.map

Command: npm run build (tsc)
Input:   src/**/*.ts
Output:  dist/**/*.js + dist/**/*.d.ts + dist/**/*.js.map
```

### 7.2 Browser Bundle (esbuild)

```
esbuild.browser.mjs
  entry:    src/browser.ts
  bundle:   true
  format:   esm
  platform: browser
  target:   es2022
  treeshake: true
  minify:   false (for debugging)

Command: npm run build:browser (node esbuild.browser.mjs)
Input:   src/browser.ts (imports only optimizer modules)
Output:  dist/tscg.browser.js (single self-contained ESM file)

Excludes: API client, benchmark runner, CLI, Node.js built-ins
```

### 7.3 Development Mode

```
Command: npm run dev (tsx src/cli/index.ts)
Uses tsx for direct TypeScript execution without compilation.
Supports hot-reload via tsx watch mode.
```

---

## 8. Test Architecture

### 8.1 Test Framework

- **Runner:** Vitest 4.0.18+
- **Command:** `npm test` (vitest run) or `npm run test:watch` (vitest)
- **Configuration:** Default vitest config (auto-discovers `*.test.ts` files)

### 8.2 Test Coverage Areas

| Module | Test Focus |
|--------|-----------|
| `analyzer.ts` | Prompt type classification, parameter extraction, format detection, filler word identification |
| `transforms.ts` | Individual transform correctness, edge cases, skip conditions |
| `optimizer.ts` | Pipeline integration, profile selection, option overrides |
| `statistics.ts` | Wilson CI calculation, McNemar test, Cohen's h |

### 8.3 Benchmark Test Suite (Integration Tests)

The benchmark suite (`benchmark/test-cases.ts`) defines 19 core tests and optional long-context tests. Each test has:

```typescript
{
  id: string;          // e.g., "f1", "r3", "nd2"
  category: string;    // "Factual", "Reasoning", etc.
  name: string;        // "Capital", "Syllogism", etc.
  expected: string;    // "Canberra", "63", etc.
  natural: string;     // NL prompt
  tscg: string;        // Pre-compiled TSCG version
  check: (response: string) => boolean;  // Flexible correctness checker
}
```

---

## 9. CLI Command Reference

### 9.1 Commands

| Command | Alias | Description | Requires API |
|---------|-------|-------------|--------------|
| `tscg optimize <text>` | `tscg opt`, `tscg o` | Optimize a prompt locally | No |
| `tscg optimize --hybrid <text>` | -- | Optimize using Claude API + local transforms | Yes |
| `tscg optimize --compare <text>` | -- | Compare all profiles side-by-side | No |
| `tscg optimize --interactive` | `tscg o -i` | Interactive REPL mode | No |
| `tscg benchmark` | -- | Run full benchmark suite | Yes |
| `tscg compile <text>` | -- | Compile NL to TSCG via Claude API | Yes |
| `tscg sad <tscg-prompt>` | -- | Apply SAD-F to existing TSCG prompt | No |
| `tscg help` | `--help`, `-h` | Show usage information | No |

### 9.2 Global Options

| Option | Description |
|--------|-------------|
| `--file <path>` | Read input from file instead of arguments |
| `--json` | Output in JSON format |
| `--markdown` | Output in Markdown format |
| `--out=<path>` | Write output to file |
| `--quiet` | Suppress verbose output (only show result) |
| `--verbose` | Show detailed transform pipeline |

### 9.3 Optimize-Specific Options

| Option | Default | Description |
|--------|---------|-------------|
| `--profile=NAME` | balanced | Optimization profile |
| `--no-sadf` | (enabled) | Disable SAD-F anchoring |
| `--no-ccp` | (enabled) | Disable CCP closure |
| `--sad-k=N` | 4 | Number of SAD-F anchors |
| `--hybrid` | off | Use Claude API compilation |
| `--compare` | off | Compare all profiles |

### 9.4 Benchmark-Specific Options

| Option | Default | Description |
|--------|---------|-------------|
| `--long` | off | Include long-context tests |
| `--strategies=LIST` | all 6 | Comma-separated strategy list |
| `--quiet` | off | Suppress per-test output |

---

## 10. API Surface for Programmatic Use

### 10.1 Primary Exports (`import from 'tscg'`)

**Optimizer (no API needed):**
```typescript
import {
  optimizePrompt,        // (prompt: string, options?: Partial<OptimizerOptions>) => OptimizeResult
  optimizePromptHybrid,  // (prompt: string, config: TscgConfig, options?) => Promise<OptimizeResult>
  batchOptimize,         // (prompts: string[], options?) => OptimizeResult[]
  analyzePrompt,         // (prompt: string) => PromptAnalysis
} from 'tscg';
```

**Individual Transforms (no API needed):**
```typescript
import {
  applySDM,              // (text: string, analysis: PromptAnalysis) => TransformResult
  applyCFLTransform,     // (text: string, analysis: PromptAnalysis) => TransformResult
  applyCFO,              // (text: string, analysis: PromptAnalysis) => TransformResult
  applyDRO,              // (text: string, analysis: PromptAnalysis) => TransformResult
  applyTAS,              // (text: string, analysis: PromptAnalysis) => TransformResult
  applyCCPTransform,     // (text: string, analysis: PromptAnalysis) => TransformResult
  applyCAS,              // (text: string, analysis: PromptAnalysis) => TransformResult
  applySADFTransform,    // (text: string, analysis: PromptAnalysis, topK?: number) => TransformResult
  wrapContext,           // (text: string, analysis: PromptAnalysis) => TransformResult
  compactMultipleChoice, // (text: string, analysis: PromptAnalysis) => TransformResult
} from 'tscg';
```

**Compiler (requires API):**
```typescript
import {
  compileTscg,   // (prompt: string, config: TscgConfig) => Promise<CompileResult>
  batchCompile,  // (prompts: string[], config: TscgConfig) => Promise<CompileResult[]>
  applySADF,     // (tscg: string) => string
  applyCCP,      // (tscg: string) => string
} from 'tscg';
```

**Benchmark (requires API):**
```typescript
import {
  runBenchmark,         // (options: BenchmarkOptions) => Promise<BenchmarkReport>
  getAllTests,           // (includeLong?: boolean) => TestCase[]
  getTestsByCategory,   // (category: TestCategory) => TestCase[]
} from 'tscg';
```

**Statistics:**
```typescript
import {
  wilsonCI,      // (k: number, n: number, z?: number) => [number, number]
  mcnemarExact,  // (b: number, c: number) => { pValue: number; significant: boolean }
  cohensH,       // (p1: number, p2: number) => number
} from 'tscg';
```

**Report Generation:**
```typescript
import {
  printOptimizeReport,  // (result: OptimizeResult) => void (console output)
  toJSON,               // (result: OptimizeResult) => object
  toMarkdown,           // (result: OptimizeResult) => string
  printComparison,      // (results: OptimizeResult[]) => void
} from 'tscg';
```

### 10.2 Browser Exports (`import from 'tscg/browser'`)

The browser bundle exports a subset of the full API, excluding Node.js-specific modules:

```typescript
import {
  optimizePrompt,
  batchOptimize,
  analyzePrompt,
  applySDM,
  applyCFL,
  applyCFO,
  applyDRO,
  applyTAS,
  applyCCP,
  applyCAS,
  applySADF,
  // NO: compileTscg (requires API client)
  // NO: runBenchmark (requires API client)
  // NO: fs/readline (Node.js built-ins)
} from 'tscg/browser';
```

---

## 11. Data Flow Examples

### 11.1 Local Optimization Flow

```
User: tscg optimize "Please help me find the capital city of Australia"

1. CLI parses args, selects profile=balanced
2. optimizePrompt() called with prompt string
3. analyzePrompt() -> { type: "factual", outputFormat: "single_word", ... }
4. SDM: "Please help me find the capital city of Australia"
       -> "Capital city of Australia"  (-7 tokens)
5. DRO: No changes (no delimiter opportunities)
6. CFL: "[ANSWER:single_word] Capital city of Australia"  (+3 tokens)
7. CFO: Skipped (no multi-step operations)
8. TAS: No changes (delimiters already optimal)
9. MC-COMPACT: Skipped (no multiple choice)
10. CTX-WRAP: Skipped (no context block)
11. Metrics: 51 chars -> 47 chars, 13 -> 12 tokens est, ratio 0.92

Output: "[ANSWER:single_word] Capital city of Australia"
```

### 11.2 Hybrid Optimization Flow

```
User: tscg optimize --hybrid "List the top 3 countries by GDP as JSON"

1. CLI parses args, detects --hybrid, loads API config
2. optimizePromptHybrid() called
3. analyzePrompt() -> { type: "factual", outputFormat: "json", ... }
4. compileTscg() -> Claude API call -> returns TSCG syntax
5. TAS: Applied to compiled output
6. CCP: Applied (adds closure block)
7. SAD-F: Applied (adds anchors for fragile params)

Output: API-compiled TSCG + local post-processing
```

---

## 12. Long-Context Transforms (Phase 1)

Four transforms designed for long-context (multi-thousand token) prompts where the "lost-in-the-middle" effect degrades retrieval accuracy.

### 12.1 Context-CAS (Context-Aware Causal Access Scoring)

| Property | Value |
|----------|-------|
| **Purpose** | Position-aware reordering of segments in long documents based on attention distribution |
| **Input** | Long document with embedded facts/instructions |
| **Output** | Document with critical segments repositioned to high-attention zones (beginning/end) |
| **Token impact** | 0 (reordering only) |
| **Theoretical basis** | Liu et al. "Lost in the Middle" (TACL 2024) |

Context-CAS extends the core CAS transform for multi-segment documents. It computes fragility scores for each document segment and repositions high-fragility segments away from the attention valley (middle positions) toward the attention peaks (beginning and end of document).

### 12.2 Long-CCP (Long-Context Causal Closure)

| Property | Value |
|----------|-------|
| **Purpose** | Generate extended closure blocks for long documents that summarize distributed key facts |
| **Input** | Long document (post-Context-CAS) |
| **Output** | Document + extended `###<CC>` block with distributed fact summary |
| **Token impact** | Adds 20-60 tokens (extended closure) |

Long-CCP extends core CCP for documents where key facts are distributed across many segments. The closure block provides a concentrated summary of all semantic atoms detected throughout the document, enabling the model to access critical information without scanning the full context.

### 12.3 Query-Priming

| Property | Value |
|----------|-------|
| **Purpose** | Place query/question at both beginning and end of long document context |
| **Input** | Document with query |
| **Output** | Query + Document + Query (bookended) |
| **Token impact** | Adds query-length tokens (duplication) |

Query-Priming ensures the model's attention is primed for the query at document entry and reinforced at document exit. This exploits the attention sink at position 0 and the recency bias at the final positions.

### 12.4 Segment-SDM (Segment-Level Semantic Density Maximization)

| Property | Value |
|----------|-------|
| **Purpose** | Apply SDM filler removal on a per-segment basis within long documents |
| **Input** | Long document with multiple segments |
| **Output** | Document with each segment independently density-maximized |
| **Token impact** | Saves 15-40% of padding tokens in long documents |

Segment-SDM applies the core SDM transform to each individual segment of a long document, rather than treating the entire document as a single string. This enables more aggressive compression of transitional phrases, repetitive introductions, and segment-level boilerplate.

---

## 13. RAG Transforms (Phase 2)

Five transforms designed for RAG (Retrieval-Augmented Generation) workflows where multiple retrieved chunks contain overlapping and redundant content.

### 13.1 Chunk-CAS (Inter-Chunk Access Scoring)

| Property | Value |
|----------|-------|
| **Purpose** | Score and reorder retrieved chunks by relevance and semantic density |
| **Input** | Set of retrieved chunks |
| **Output** | Chunks reordered by access score (highest relevance first and last) |
| **Token impact** | 0 (reordering only) |

Chunk-CAS computes a combined score for each chunk based on query term overlap, semantic density, and information novelty. Chunks are reordered to place the most relevant chunks at attention peak positions.

### 13.2 Chunk-Dedup (Cross-Chunk Deduplication)

| Property | Value |
|----------|-------|
| **Purpose** | Remove duplicate and near-duplicate content across retrieved chunks |
| **Input** | Set of chunks (post-Chunk-CAS) |
| **Output** | Deduplicated chunks with overlapping content removed |
| **Token impact** | Saves 10-30% depending on chunk overlap |

Chunk-Dedup identifies content that appears in multiple retrieved chunks (common in RAG systems where chunks have sliding-window overlap) and retains only the first occurrence, replacing subsequent duplicates with back-references.

### 13.3 RAG-Closure (Query-Aware Closure)

| Property | Value |
|----------|-------|
| **Purpose** | Generate a closure block that links query terms to chunk-sourced answers |
| **Input** | Query + deduplicated chunks |
| **Output** | Chunks + query-chunk closure block |
| **Token impact** | Adds 10-25 tokens |

RAG-Closure extends CCP specifically for RAG workflows, creating a closure block that maps query terms to the chunks that contain relevant information, enabling the model to efficiently locate source material.

### 13.4 Query-Chunk Anchoring

| Property | Value |
|----------|-------|
| **Purpose** | Emphasize query-relevant terms within each chunk via anchor markers |
| **Input** | Chunks with query context |
| **Output** | Chunks with query terms marked as high-fragility anchors |
| **Token impact** | Adds 2-5 tokens per chunk |

Query-Chunk Anchoring marks terms within chunks that match or are semantically related to the query, increasing their attention weight during model processing.

### 13.5 Chunk-SDM (Chunk-Specific Density Maximization)

| Property | Value |
|----------|-------|
| **Purpose** | Apply density maximization to each chunk individually |
| **Input** | Retrieved chunks |
| **Output** | Chunks with per-chunk filler removal |
| **Token impact** | Saves 5-15% per chunk |

Chunk-SDM applies SDM patterns optimized for RAG chunk content, including removal of source attribution boilerplate, metadata headers, and retrieval-framework-specific formatting.

---

## 14. Tool Transforms (Phase 3)

Four transforms designed for tool/function definition compression in agentic LLM workflows.

### 14.1 Tool-SDM (Tool Semantic Density Maximization)

| Property | Value |
|----------|-------|
| **Purpose** | Remove verbose boilerplate from tool parameter descriptions |
| **Input** | Tool definition with verbose descriptions |
| **Output** | Compact tool definition with key:value parameter notation |
| **Token impact** | Saves 20-40% of description tokens |

Tool-SDM applies SDM patterns specific to tool definitions: removing "This parameter specifies...", "The value of this field should be...", and similar boilerplate patterns common in OpenAPI/function-calling schemas.

### 14.2 Tool-DRO (Tool Delimiter Optimization)

| Property | Value |
|----------|-------|
| **Purpose** | Replace JSON-like tool formatting with compact TSCG delimiter syntax |
| **Input** | Tool definition (post-Tool-SDM) |
| **Output** | Tool definition with optimized delimiters |
| **Token impact** | Saves 10-20% of structural tokens |

Tool-DRO converts verbose JSON schema formatting (nested braces, repeated "type": "string" declarations, quotation marks) into compact TSCG notation that preserves semantic meaning with fewer tokens.

### 14.3 Tool-CAS (Tool Parameter Access Scoring)

| Property | Value |
|----------|-------|
| **Purpose** | Reorder tool parameters by fragility and usage frequency |
| **Input** | Tool definition (post-Tool-DRO) |
| **Output** | Tool definition with parameters reordered (required first, high-fragility first) |
| **Token impact** | 0 (reordering only) |

Tool-CAS ensures required parameters and high-fragility parameters appear at attention-optimal positions within each tool definition.

### 14.4 Tool-TAS (Tool Tokenizer-Aligned Syntax)

| Property | Value |
|----------|-------|
| **Purpose** | Optimize tool definition delimiters for BPE efficiency |
| **Input** | Tool definition (post-Tool-CAS) |
| **Output** | Tool definition with BPE-optimal delimiters |
| **Token impact** | Saves 2-5% of delimiter tokens |

Tool-TAS extends core TAS with patterns specific to tool schemas, optimizing structural characters (braces, brackets, colons) for tokenizer efficiency.

---

## 15. New General Transforms (Phase 4)

Three new transforms that extend the core pipeline for improved general-purpose optimization.

### 15.1 ADC (Adaptive Density Control)

| Property | Value |
|----------|-------|
| **Purpose** | 3-tier filler categorization replacing SDM's binary remove/keep approach |
| **Input** | Natural language prompt |
| **Output** | Prompt with filler words categorized and processed by tier |
| **Token impact** | Varies (more nuanced than SDM) |

ADC introduces a 3-tier categorization system for filler words:

| Tier | Action | Example Patterns |
|------|--------|-----------------|
| **Remove** | Always strip (pure filler) | "basically", "actually", "you know" |
| **Conditional** | Strip based on context/prompt type | "please", "could you" (keep in generation, strip in factual) |
| **Amplify** | Preserve or strengthen (semantically important) | Emphasis words that affect model behavior |

This replaces SDM's binary approach with a context-aware system that avoids over-stripping in generation/instruction prompts where politeness markers may affect output quality.

### 15.2 TPD (Tokenizer-Profiled Delimiters)

| Property | Value |
|----------|-------|
| **Purpose** | Select BPE-optimal delimiters based on target tokenizer profile |
| **Input** | Prompt (post-ADC) |
| **Output** | Prompt with tokenizer-specific optimal delimiters |
| **Token impact** | Saves 1-5 tokens depending on tokenizer |

TPD extends core TAS by maintaining delimiter optimization profiles for multiple tokenizers:

| Profile | Target Tokenizer | Optimal Delimiters |
|---------|-----------------|-------------------|
| `claude` | Claude (Anthropic) | Optimized for Anthropic's BPE tokenizer |
| `gpt4o` | GPT-4o (OpenAI o200k_base) | Optimized for OpenAI's current tokenizer |
| `llama3` | Llama 3 (Meta) | Optimized for Meta's SentencePiece tokenizer |
| `universal` | Cross-tokenizer | Conservative delimiters that tokenize well across all major tokenizers |

The default profile is `universal`. When the target model is known, specifying the tokenizer profile enables more aggressive delimiter optimization.

### 15.3 ICoT (Implicit Chain-of-Thought Priming)

| Property | Value |
|----------|-------|
| **Purpose** | Add minimal CoT primers to reasoning prompts without verbose "Let's think step by step" |
| **Input** | Reasoning prompt (post-CFO) |
| **Output** | Prompt with compact reasoning primers |
| **Token impact** | Adds 2-5 tokens |
| **Skip condition** | Skips if prompt type is not reasoning/instruction |

ICoT adds minimal chain-of-thought primers that encourage step-by-step reasoning without the token overhead of explicit CoT prompting:

Instead of: `"Let's think about this step by step..."` (8+ tokens)
ICoT adds: `"[REASON:steps]"` (2-3 tokens)

This provides the reasoning benefit of CoT while maintaining TSCG's token-efficiency principle.

---

## 16. Complete Transform Inventory (v1.0.0)

### 16.1 Summary by Category

| Category | Count | Transforms |
|----------|-------|-----------|
| Core | 10 | SDM, DRO, CFL, CFO, TAS, MC-COMPACT, CTX-WRAP, CCP, CAS, SAD-F |
| Long-Context | 4 | Context-CAS, Long-CCP, Query-Priming, Segment-SDM |
| RAG | 5 | Chunk-CAS, Chunk-Dedup, RAG-Closure, Query-Chunk Anchoring, Chunk-SDM |
| Tool | 4 | Tool-SDM, Tool-DRO, Tool-CAS, Tool-TAS |
| New General | 3 | ADC, TPD, ICoT |
| **Total** | **26** | |

### 16.2 Transform Evolution

| Version | Core | Domain | Total |
|---------|------|--------|-------|
| v0.1.0 | 8 | 0 | 8 |
| v0.2.0 | 10 | 0 | 10 |
| v1.0.0 | 10 | 16 | 26 |

---

*This architecture document reflects the TSCG codebase as of version 1.0.0 (2026-02-27). All file paths are relative to the project root.*
