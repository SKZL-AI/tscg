# Self-Tuning Guide

## Benchmark Modes

| | Quick | Full | Sweep |
|--|-------|------|-------|
| Tool counts | 10, 50 | 10, 20, 40, 50, 75, 100 | 43 |
| Conditions | 3 | 5 | 9 (baseline + 8 operators) |
| Tasks/cell | 5 | 10 | 20 |
| Seeds | 1 | 2 | 1 |
| Total calls | 30 | 600 | 180 |
| Est. cost (API) | $0.50-$2 | $15-$25 | ~$1 |
| Est. cost (Ollama) | $0 | $0 | $0 |
| Duration | 2-5 min | 30-60 min | 10-15 min |

## When to Use Each

- **Quick**: First-time setup, testing, local models
- **Full**: Production deployment, accuracy-critical applications
- **Sweep**: Per-operator isolation analysis, identifying which operators help or hurt your model

## Per-Operator Sweep (v1.4.2)

The `--sweep` flag runs a 9-condition leave-one-in isolation test:

```bash
tscg-openclaw tune --sweep --model your-model
tscg-openclaw tune --sweep --model your-model --dry-run  # preview plan
tscg-openclaw show-profile your-model --verbose          # view results
```

Each operator is tested individually against a no-ops baseline. Classification thresholds:
- **Helpful**: delta >= +2.5pp
- **Neutral**: -2.5pp < delta < +2.5pp
- **Harmful**: delta <= -2.5pp

Combination-fragile detection: if >= 4 neutral + >= 1 harmful operators, falls back to SDM-only conservative profile (LOW confidence).

## Confidence Levels

| Level | Criteria | Action |
|-------|----------|--------|
| HIGH | n>=20 samples, clear margin (>=0.15), meaningful accuracy delta (>=10pp) | Use recommended profile |
| MEDIUM | n>=10 + margin>=0.10, OR n>=5 + delta>=15pp | Consider re-running with --full |
| LOW | Below thresholds or combination-fragile detected | Re-run with --full or use conservative fallback |

## Cost Optimization

- Use `--dry-run` to preview costs before running
- Use `--max-cost <usd>` to set spending limits
- Local models (Ollama) are always free
- Quick benchmark is sufficient for most use cases
- Sweep is cost-effective (~$1) for detailed per-operator analysis
