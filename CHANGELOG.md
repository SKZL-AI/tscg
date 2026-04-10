# Changelog

All notable changes to the TSCG project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-03-02

### Added

- **TAB (Tool-Aware Benchmark):** 6-scenario benchmark suite for evaluating tool-schema compression
  - Frontier model comparison (Claude 4 Sonnet, GPT-5.2, Gemini 2.5 Flash)
  - Small model scaling (Qwen3-8B, Phi-4, Gemma-3, Llama-3.2-3B at 10/25/50 tools)
  - Claude Code simulation (77 real tools)
  - GSM8K reasoning impact (math reasoning with tool overhead)
  - MCP aggregation (50 tools from 5 servers)
  - BFCL accuracy retention (Berkeley Function-Calling Leaderboard tasks)
- **npm packages:**
  - `@tscg/core` -- Deterministic prompt compiler (34.7KB ESM, zero dependencies)
  - `@tscg/tool-optimizer` -- LangChain, MCP, and Vercel AI SDK integrations
- **Statistical analysis suite:** Paired t-test, McNemar, bootstrap CI, Cohen's d, Hedges' g
- **Publication-quality output:** LaTeX tables and pgfplots figure data generators
- **Unified CLI:** `tscg compress`, `tscg benchmark`, `tscg analyze`, `tscg info`
- **LangChain integration:** `withTSCG()` wrapper for LangChain-compatible agents
- **MCP proxy:** `createTSCGMCPProxy()` for transparent MCP tool compression
- **Vercel AI SDK middleware:** `tscgMiddleware()` for Vercel AI SDK tool maps
- **Multi-model tokenizer profiles:** 14 model families with BPE-specific optimization
- **arXiv submission materials:** Checklist, compilation guide, supplementary index
- **Community launch materials:** Show HN, Dev.to, Twitter thread, Product Hunt drafts

### Changed

- Paper sections rewritten for TAB methodology (experiments, results, discussion, conclusion)
- Package architecture: monorepo with `packages/core` and `packages/tool-optimizer`
- Benchmark infrastructure completely rebuilt with typed harness and seeded PRNG

### Technical Details

- Compression pipeline: SDM, DRO, CAS, TAS transforms with principle-to-transform mapping
- Engine bridge (`_engine.ts`) for package boundary isolation
- JSON.stringify token estimation baseline (more accurate for real-world JSON wire format)
- Profile-based principle configuration (conservative/balanced/aggressive)
- SAD auto-disabled for non-Claude models (prevents echo-back degradation)

---

## [1.2.0] - 2026-02-28

### Fixed

- **CFL Echo-Back Fix:** Model-Aware CFL (Constraint-First Layout) profiles
  - GPT-4o and Gemini 2.5 Flash exhibited echo-back behavior with certain CFL patterns
  - CFL now adapts its constraint placement strategy based on target model
  - SAD (Selective Anchor Duplication) force-disabled for non-Claude models
- Fixed rate-limiting confounds in domain benchmarks from v1.1.0

### Added

- Model-aware compression profiles per model family
- CFL model detection via prefix matching for API compatibility
- Documentation of CFL fix across 4 docs (benchmark analysis, self-evaluation, discussion, experiments)

### Technical Details

- `isClaudeModel` check in `TSCGCompiler` constructor
- Non-Claude models use reduced CFL aggressiveness
- SAD principle gated behind model family detection

---

## [1.1.0] - 2026-02-27

### Added

- **Multi-Model Support:**
  - GPT-4o (OpenAI) provider
  - GPT-5.2 (OpenAI) provider with `max_completion_tokens` support
  - Gemini 2.5 Flash (Google) provider
  - Ollama provider for local model inference
- **Clean domain benchmarks:** Re-run without rate-limiting confounds
  - Long-context needle-in-a-haystack: 83.3% vs 50.0% (McNemar p=0.0063)
  - RAG accuracy: 100% across all strategies
  - Tool-description optimization: 71.7% savings maintained
- Provider factory with exhaustive switch for compile-time safety
- Rate limiter with per-provider:apiKey caching
- Native fetch (no HTTP libraries) for all providers

### Changed

- `callClaude()` name preserved for backward compatibility (4 call sites)
- Shared `callOpenAICompatible` helper eliminates OpenAI/Moonshot duplication

---

## [1.0.0] - 2026-02-25

### Added

- **TSCG Framework:** 8 causally-grounded optimization principles
  1. ATA -- Abbreviated Type Annotations
  2. DTR -- Description Text Reduction
  3. RKE -- Redundant Key Elimination
  4. SCO -- Structural Compression Operators
  5. CFL -- Constraint-First Layout
  6. TAS -- Tokenizer Alignment Scoring
  7. CSP -- Context-Sensitive Pruning
  8. SAD -- Selective Anchor Duplication
- **10 composable transforms** implemented in ~1,200 lines of TypeScript
- **Browser-compatible bundle:** 34.7KB (11.7KB gzipped)
- **Zero external dependencies**
- **Benchmark suite:** 19 core tasks + 25 hard tests + 82 domain-specific tests
  - 7 categories, 5 extended categories, 3 specialized domains
  - 11 independent runs with 0 degradations
- **Chrome Extension:** Real-time TSCG optimization in browser LLM UIs
- **Web Application:** Interactive TSCG compression demonstration
- **Academic paper:** LaTeX source for ACL Rolling Review format
- Token savings: 6.3% general-purpose, up to 71.7% tool-description optimization
- 100% task accuracy on core benchmarks (Claude Sonnet 4)
- Fragility score metric for parameter criticality under causal attention
- SAD-F (budget-constrained Selective Anchor Duplication)

### Technical Details

- TypeScript with ESM + CJS dual output
- `pdflatex` + `bibtex` compilation pipeline
- Deterministic output: same input always produces same output
- <1ms compression time for typical tool catalogs
