# TAB Benchmark Results Provenance

**Generated:** 2026-03-03
**Branch:** plan-5-1
**Latest commit:** bf85b44

## Data Sources

### Plan 5.0 (Legacy — Corrected in Plan 5.1)
- **LLMLingua Head-to-Head** (Wave 2.7): `data/llmlingua-results.json`
  - 120 API calls, Claude Sonnet 4
  - BUG: Used `words * 1.3` for token counting
  - Corrected in Wave 2.5.3 (see below)

### Plan 5.1 Waves

| Wave | Description | API Calls | Data Location |
|------|-------------|-----------|---------------|
| 2.1-2.4 | Frontier Scenarios A-E | ~4,000 | `benchmark/results/frontier/` |
| 2.5 | Small Model Scenario D | ~5,000 | `benchmark/results/small-models/` |
| 2.5.2 | Medium Model Analysis | 0 (analysis) | `PLAN 5.1/Analysen/Wave-2.5.2/` |
| 2.5.3 | LLMLingua BPE-Corrected | 120 | `data/llmlingua-v2/` |
| 2.7 | LLMLingua Head-to-Head | 120 (legacy) | `data/llmlingua-results.json` |
| 2.8 | BFCL External Validation | 360 | `benchmark/results/bfcl/` |
| 2.9 | GSM8K Reasoning Control | 150 | `benchmark/results/gsm8k/` |
| 2.11 | Degradation Analysis | 0 (analysis) | `PLAN 5.1/Analysen/Wave-2.11/` |
| 2.12 | Native FC Baseline | 0 (analysis) | `PLAN 5.1/Analysen/Wave-2.12/` |
| 2.12b | Format vs Compression | 1,080 | `benchmark/results/frontier-natural-text/` |
| 2.13 | Tokenizer Anomaly | 0 (analysis) | `benchmark/results/analysis/tokenizer-anomaly.*` |
| 2.14 | SDM Ablation | 360 | `benchmark/results/small-models/` (tscg_conservative) |
| 2.15 | Paper Tables | 0 (tables) | `paper/tables/tab-benchmark.tex` |

### Plan 5.1.1 Experiments (2026-03-04 — 2026-03-05)

| Experiment | Description | API Calls | Data Location |
|------------|-------------|-----------|---------------|
| E1 | Phi-4 Text-Baseline (format effect) | 420 | `benchmark/results/e1-phi4-text-baseline/` |
| Run 1 | Fresh 3-condition (Claude, 16 tools) | 60 | `benchmark/results/fresh-3condition/` |
| Run 2 | Fresh 3-condition (Claude, 50 tools) | 60 | `benchmark/results/run2-50tools/` |
| Run 3 | Small model TSCG vs naive (20 tools) | 120 | `benchmark/results/run3-smallmodel/` |
| Run 3b | Small model scaling (20/50/100 tools) | 360 | `benchmark/results/run3b-smallmodel-scaling/` |
| E4 | Text-baseline all 6 models (IN PROGRESS: Mistral/Llama/Gemma12B done, Qwen4B/Qwen14B/Gemma4B running) | ~2,520 | `benchmark/results/e4-text-baseline-all/` |
| N3 | Qwen3-14B Conservative SDM (COMPLETE) | 180 | `benchmark/results/n3-qwen3-14b-conservative/` |
| N1 | 30B models (PENDING) | ~840 | `benchmark/results/n1-30b-models/` |

**Key Finding — Format Effect (E1, Run 3b):**
Phi-4's dramatic enablement (0%→90%) under JSON-baseline is a format translation effect: when given human-readable text (renderNaturalSchema), Phi-4 scores 87-97%. TSCG's value for small models includes implicit JSON→text translation. All Ollama models always use text-mode (runner.ts:287-293: `supportsNativeTools = model.provider === 'openai' || model.provider === 'anthropic'`). The real baseline distinction is `renderNaturalSchemaJSON()` (raw JSON) vs `renderNaturalSchema()` (human-readable text).

**Key Finding — N3 Conservative Ablation (BUG DETECTED):**
N3 script had a bug: `profile: 'minimal'` does not exist as a valid profile and silently falls back to `'balanced'` (see compiler.ts:151). This caused the N3 "conservative" condition to actually run balanced compression, producing identical scores. The Wave 2.14 data (scenario-d-report.json) is the CORRECT conservative data: Conservative virtually eliminates Qwen3-14B degradation (mean Δ: +0.6pp vs -10.3pp balanced). Bug fixed in run-n3-qwen3-14b-conservative.ts (profile: 'minimal' → 'conservative'). N3 re-run pending.

**Key Finding — E4 Mistral Text-Baseline:**
Natural-text OUTPERFORMS TSCG at 6/7 catalog sizes for Mistral-7B (420 calls). E.g., 50 tools: text 75.0% vs TSCG 63.7% (-11.3pp). This confirms Mistral's large JSON-baseline gains (+17.6pp mean) are format-dominated — the model handles text schemas better than JSON, and TSCG's apparent benefit is largely implicit JSON→text translation. Naive truncation also outperforms TSCG at most sizes.

### Models Evaluated

**Frontier (API-served):**
- Claude Sonnet 4 (Anthropic, claude-sonnet-4-6)
- GPT-4o (OpenAI, gpt-4o-2024-11-20)
- GPT-5.2 (OpenAI, gpt-5.2-2026-02)

**Small/Medium (Ollama, RTX 5070 Ti):**
- Gemma 3 4B (google/gemma-3-4b)
- Mistral 7B (mistralai/mistral-7b-instruct-v0.3)
- Qwen 3 8B (qwen/qwen3-8b)
- Llama 3.1 8B (meta/llama-3.1-8b-instruct)
- Gemma 3 12B (google/gemma-3-12b)
- Qwen 3 14B (qwen/qwen3-14b)
- Phi-4 14B (microsoft/phi-4-14b)

### Conditions

| Condition | Description | Implementation |
|-----------|-------------|----------------|
| natural | Native FC via tools API | Provider-specific tools parameter |
| natural_text | Full JSON schemas as text | System prompt embedding, no FC API |
| tscg | TSCG balanced profile | SDM + CAS + DRO + TAS |
| tscg_sad | TSCG aggressive + SAD | SDM + CAS + DRO + TAS + SAD |
| tscg_conservative | SDM-only | Filler removal, no structural compression |

### Reproduction

```bash
# Frontier Scenarios A+B
npx tsx benchmark/scripts/run-frontier.ts --scenario a
npx tsx benchmark/scripts/run-frontier.ts --scenario b

# Small Model Scenario D
npx tsx benchmark/scripts/run-small-models.ts --models all --sizes 3,5,10,20,50

# SDM Ablation
npx tsx benchmark/scripts/run-small-models.ts --models mistral,gemma3 --sizes 10,20,50 --conditions tscg_conservative

# BFCL Validation
npx tsx benchmark/scripts/run-bfcl.ts

# natural_text Frontier
npx tsx benchmark/scripts/run-frontier.ts --scenario a --conditions natural_text
npx tsx benchmark/scripts/run-frontier.ts --scenario b --conditions natural_text
```

### Token Counting

All token counts use `tiktoken cl100k_base` BPE tokenizer via `benchmark/compression/token-counter.ts`. The Plan 5.0 bug (`words * 1.3` heuristic) was identified and corrected in Wave 2.5.3.

### Known Limitations

1. **Scenario A sample size**: Only 20 tasks x 3 runs = 60 evaluations per cell. CIs are wide.
2. **GPT-4o rate limits**: 30K TPM limit caused some natural_text failures (retry handled).
3. **Anthropic 529 errors**: Sporadic overload during Wave 2.12b (retry handled).
4. **Conservative profile not tested on 12B+ models**: Only Mistral-7B and Gemma3-4B.
5. **Qwen3-14B TSCG-negative**: Shows -10.3pp average degradation; possible tokenizer mismatch.
6. **statistics-v2.json metric mismatch (BUG)**: `statistical-analysis.ts:426` uses `r.accuracy` (= `tool_selection_accuracy` only), but paper defines accuracy as composite `0.6×TSA + 0.4×param_F1` (main.tex:199). The `fig4-arr-heatmap.json` correctly uses `overall` composite scores. Re-run C4 with `r.overall` to fix. Provenance check (2026-03-05): all 5 spot-checked cells show heatmap matches raw checkpoint data exactly; stats-v2 diverges by 0.7–5.4pp because it uses TSA-only.
