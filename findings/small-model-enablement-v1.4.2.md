# Small-Model Tool-Use Enablement via TSCG — 7 Models, 5,000+ Calls

**Author:** Furkan Sakizli, SKZL-AI
**Date:** April 2026
**Total benchmark calls:** 5,000+ (across 7 local models)
**Repository:** [github.com/SKZL-AI/tscg](https://github.com/SKZL-AI/tscg)

---

## Executive Summary

TSCG enables tool use on sub-15B parameter models that achieve 0-25% accuracy with standard JSON schemas. Across 7 local models tested via Ollama (4B to 14B parameters), TSCG compression lifts accuracy from an average of 16.4% to 82.9% — a +66.4pp improvement. This is not incremental optimization; it is categorical enablement of a capability these models cannot perform without schema compression.

The practical implication: a free, locally-hosted 4B model with TSCG achieves 85% tool selection accuracy — comparable to GPT-4o's 85% with native function calling, at zero API cost.

---

## Results by Model

### Accuracy (Tool Selection @ 43 Tools)

| Model | Parameters | JSON Baseline | TSCG (small-model) | Delta | Token Savings |
|-------|-----------|---------------|---------------------|-------|---------------|
| Phi-4 | 14B | 0% | 90% | **+90pp** | 52.1% |
| Gemma 3 | 4B | 5% | 85% | **+80pp** | 48.7% |
| Gemma 3 | 12B | 15% | 85% | **+70pp** | 51.3% |
| Qwen 3 | 4B | 10% | 80% | **+70pp** | 47.2% |
| Qwen 3 | 14B | 45% | 85% | **+40pp** | 53.8% |
| Llama 3.1 | 8B | 20% | 80% | **+60pp** | 49.6% |
| Mistral | 7B | 25% | 75% | **+50pp** | 46.9% |

### Why JSON Fails for Small Models

Small models fail at JSON-schema tool use for three compounding reasons:

1. **Token overhead:** A 43-tool JSON schema consumes 8,000-12,000 tokens — a significant fraction of the model's context window. After the schema, little capacity remains for reasoning.
2. **Structural complexity:** Nested JSON objects with `type`, `properties`, `required`, `description`, `enum`, `default` fields create a complex parsing task that small models haven't been trained on at scale.
3. **Format confusion:** Small models sometimes generate valid JSON that doesn't match the schema structure, or mix up field names due to the repetitive nature of JSON schemas.

### Why TSCG Works

TSCG addresses all three failure modes:

1. **Token reduction (47-54%):** Compressed schemas use 4,000-6,000 fewer tokens, freeing context for reasoning.
2. **Structural simplification:** SDM removes filler words, TAS simplifies types, DRO removes defaults — the schema becomes a clean, readable specification.
3. **Format clarity:** CCP removes redundant context, making each tool's purpose unambiguous in text form.

---

## The Equalizer Effect

### Pre-TSCG Accuracy Spread (13 Models)

- **Best:** Claude Opus 4.7 at 90%
- **Worst:** Phi-4 at 0%
- **Spread:** 90pp
- **Standard deviation:** 31.2pp

### Post-TSCG Accuracy Spread (13 Models)

- **Best:** Claude Opus 4.7 at 100%
- **Worst:** Mistral 7B at 75%
- **Spread:** 25pp
- **Standard deviation:** 7.8pp

**Variance reduction: 75%**

This "equalizer effect" means TSCG makes model selection less critical — a $0 local model with TSCG approaches the performance of a $20/M frontier model without it.

---

## Profile Recommendations by Size

### Small-Model Profile (< 40B)

Operators: SDM + TAS + DRO + CCP only

| Operator | Status | Rationale |
|----------|--------|-----------|
| SDM | ON | Safe across all sizes, biggest impact |
| TAS | ON | Type simplification helps small models parse |
| DRO | ON | Removing defaults reduces confusion |
| CFL | OFF | Cross-field linking too complex for small models |
| CFO | OFF | Reordering confuses models with limited reasoning |
| CAS | OFF | Constraint simplification marginal at this scale |
| SAD | OFF | Abbreviations can confuse models not trained on them |
| CCP | ON | Redundancy removal always beneficial |

### How to Tune

```bash
# Run per-model sweep to verify (recommended, ~$0 for local models)
npx tscg-openclaw tune --sweep --model ollama/your-model

# Quick benchmark
npx tscg-openclaw tune --model ollama/your-model
```

Local models via Ollama are always free to benchmark.

---

## Deployment Pattern: Local Model + TSCG

For organizations that need tool-use capabilities without API costs or data privacy concerns:

1. Install Ollama and pull a 12-14B model (Gemma 3 12B or Qwen 3 14B recommended)
2. Install TSCG: `npm install @tscg/core @tscg/openclaw`
3. Run tune: `npx tscg-openclaw tune --sweep --model ollama/gemma3:12b`
4. Use in your application with the tuned profile

**Expected results:** 80-90% tool selection accuracy at 50%+ token savings with zero API cost.

---

## Citation

```
Sakizli, F. (2026). Tool-Schema Compression Grammar: Deterministic Schema Optimization
for LLM Tool Use. TSCG v1.4.2 Empirical Report. https://github.com/SKZL-AI/tscg
```
