# OpenAI Community Blog Post

## Title

Compressing OpenAI function-calling schemas saves $30K/month -- here's the data

## Tags

#openai #gpt #function-calling #optimization

---

If you're running OpenAI function calling at production scale, your tool-schema overhead is likely your largest hidden cost. We measured it.

### The Problem

Every API call with function calling sends full JSON Schema definitions for every tool. A 30-tool catalog consumes 3,000-25,000 tokens per call. At 100k calls/day with 16 tools at $3/MTok, the schema overhead alone exceeds **$30,000/month**.

We built TSCG (Token-Context Semantic Grammar) -- a deterministic compiler that compresses these schemas by 50-75% -- and benchmarked it across ~13,000 API calls on 12 models including GPT-4o and GPT-5.2.

### GPT Results

**GPT-5.2 (strongest single result):**
- Scenario A (16 tools): +24.4pp improvement over natural JSON schemas
- 95% CI: [+15.0, +33.9], Cohen's d = 0.54
- This is the largest single-model improvement in the entire benchmark

**GPT-4o:**
- Token savings transfer perfectly: 73.9% on tool-description schemas
- Moderate accuracy improvement on multi-tool scenarios
- CFL (Constraint-First Layout) annotations require the conservative profile

**Both GPT models confirm cross-model transferability** -- TSCG is not an Anthropic-specific optimization. The compression principles (BPE alignment, causal attention grounding, semantic density) are architecture-agnostic.

### The Format Discovery

The key research finding: we decomposed TSCG's gains into format translation (JSON -> text) and genuine structural compression using 2,940 Ollama calls across 6 small models.

Result: **small models' dramatic improvements are from format translation, not compression**. But for frontier models like GPT-4o and GPT-5.2, the structural compression (+5-11pp) persists when you eliminate the format confound entirely.

This means GPT-5.2 genuinely benefits from TSCG's causal attention optimization -- not just from getting text instead of JSON.

### Predictive Model

Our regression model (R²=0.88, n=49 data points, 7 models x 7 catalog sizes) predicts TSCG benefit from a single baseline measurement:

**Delta_TSCG = -0.93 x Accuracy_natural + 0.76**

If your model achieves <50% on natural JSON baselines, TSCG will provide substantial gains. If >90%, the benefit is moderate but real (for Class 2 models like GPT-5.2).

### Cost Impact

| Deployment | Calls/Day | Tools | Monthly Savings |
|-----------|----------|-------|----------------|
| Small SaaS | 10k | 16 | ~$3,200 |
| Mid-scale | 50k | 30 | ~$16,000 |
| Production | 100k | 16 | >$30,000 |

These savings come purely from token reduction. The accuracy improvements are a bonus.

### Integration

```bash
npm install @tscg/core
```

```typescript
import { compress } from '@tscg/core';

const result = compress(myOpenAITools, {
  model: 'gpt-4o',    // or 'gpt-5'
  profile: 'balanced'  // Full compression for frontier models
});

// Use result.compressed in your function calling API calls
```

Zero dependencies, <1ms execution, 27.7KB bundle. Deterministic -- same input always produces same output.

### 4-Class Taxonomy

We tested 12 models and found 4 behavioral classes:

- **Class 1 (Format-dominated):** Small models (4B-14B) -- JSON format is the bottleneck
- **Class 2 (Compression):** GPT-4o, GPT-5.2, Claude -- genuine structural benefit
- **Class 3 (Neutral):** Llama 8B, Gemma 12B -- no effect
- **Class 4 (Conservative-only):** Qwen models -- use conservative profile only

GPT-4o and GPT-5.2 are both Class 2 -- the class that benefits most from TSCG's structural reorganization.

### Links

- Paper: [arXiv link]
- GitHub: https://github.com/SKZL-AI/tscg
- npm: [@tscg/core](https://www.npmjs.com/package/@tscg/core)

Paper submitted to EMNLP 2026. All data and code open-source.
