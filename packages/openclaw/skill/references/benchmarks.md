# Benchmark Data

## 720-Call Full Benchmark Results (TSCG v1.4.0)

### Per-Model Archetypes

| Model Family | Archetype | Avg Savings | Accuracy Delta | Recommended Profile |
|-------------|-----------|-------------|----------------|-------------------|
| Claude Opus | hungry | 62% | +1.2pp | All 8 operators ON |
| Claude Sonnet | robust | 58% | -0.8pp | 6/8 operators |
| Claude Haiku | balanced | 52% | -1.5pp | 5/8 operators |
| GPT-4o | sensitive | 48% | -2.1pp | CFO/SAD OFF |
| GPT-4o-mini | sensitive | 45% | -2.8pp | CFO/SAD OFF |
| Qwen3 14B | small-model | 41% | -1.9pp | SDM+TAS+DRO+CCP |
| Phi-4 14B | small-model | 39% | -2.3pp | SDM+TAS+DRO+CCP |
| Llama 3.1 70B | robust | 55% | -1.1pp | 6/8 operators |

### Operator Impact Summary

| Operator | Avg Savings Contribution | Risk Level |
|----------|------------------------|------------|
| SDM | 15-20% | Low (safe for all models) |
| TAS | 8-12% | Low |
| DRO | 5-8% | Low |
| CFL | 3-5% | Medium (can cause echo in non-Claude) |
| CFO | 4-7% | Medium (some models lose type info) |
| CAS | 3-5% | Low |
| SAD | 5-10% | High (only safe for Claude models) |
| CCP | 2-4% | Low |
