# Model Profiles

## Static Profiles (13 models)

| Model Pattern | Profile Name | Archetype | Operators |
|--------------|-------------|-----------|-----------|
| claude-opus* | claude-opus | hungry | All 8 ON |
| claude-sonnet* | claude-sonnet | robust | 6/8 (CFO ON, SAD ON) |
| claude-haiku* | claude-haiku | balanced | 5/8 |
| gpt-5* | gpt-5 | robust | 6/8 (CFO OFF, SAD OFF) |
| gpt-4* | gpt-4 | sensitive | 6/8 (CFO OFF, SAD OFF) |
| qwen3* | qwen3 | small-model | SDM+TAS+DRO+CCP |
| phi4* | phi4 | small-model | SDM+TAS+DRO+CCP |
| llama3* | llama3.1 | robust | 6/8 |
| gemma3* | gemma3 | small-model | SDM+TAS+DRO+CCP |
| mistral* | mistral | small-model | SDM+TAS+DRO+CCP |
| deepseek-v3* | deepseek-v3 | conservative | SDM only |
| deepseek-r1* | deepseek-r1 | conservative | SDM only |

## Empirical Model Archetype Table (v1.4.2, 2,000+ calls)

| Model | Archetype | Key Finding | Recommended Profile |
|-------|-----------|-------------|---------------------|
| Claude Opus 4.7 | hungry | All 8 operators beneficial | All ON |
| Claude Sonnet 4 | robust | Config-agnostic | All ON |
| GPT-5.2 | sensitive | CFO -5pp, CFL helps | 7 ops (no CFO) |
| GPT-5.4 | robust | SDM -10pp, CFO +15pp | 7 ops (no SDM) |
| GPT-5.5 | combination-fragile | Operators interact non-linearly | SDM-only |
| GPT-4o | sensitive | CFO -7.5pp | 7 ops (no CFO) |
| Gemma 4B | sensitive | CFO -7.5pp (matches GPT-4o) | Run sweep |
| Unknown | safe-fallback | Use sweep to determine | SDM-only or sweep |

## Size Heuristic (for unknown models)

| Parameter Count | Archetype | Logic |
|----------------|-----------|-------|
| < 40B | small-model | Conservative operators |
| 40-99B | robust | Moderate operators |
| >= 100B | hungry | Full operators |

## Override via Self-Tune

Run `tscg-openclaw tune --model <model>` to create a custom profile that overrides the static map. Custom profiles are stored in `~/.openclaw/tscg-profiles/` and take priority in the 4-tier resolution.

For per-operator analysis, use `tscg-openclaw tune --sweep --model <model>` to run a 9-condition isolation sweep that identifies which operators help, hurt, or are neutral for your specific model.
