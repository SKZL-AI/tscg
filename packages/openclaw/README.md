# @tscg/openclaw

OpenClaw plugin for automatic TSCG (Tool-Schema Compression Grammar) optimization. Reduces tool definition token usage by 40-65% with <2pp accuracy impact.

## Features

- **4-Tier Profile Resolution**: Cache -> Static -> Size-Heuristic -> Fallback
- **Self-Tuning Benchmark**: Quick (30 calls, ~$1) or Full (600 calls, ~$20) calibration
- **Per-Operator Sweep**: Adaptive 9-condition isolation sweep (180 calls, ~$1) with combination-effect detection
- **Multi-LLM Support**: 13 pre-configured model profiles + custom profiles
- **Per-Request Resolution**: Different models get different compression profiles
- **CLI Tools**: 11 commands for tuning, profiling, diagnostics, and stats
- **Graceful Degradation**: Compression errors fall back to original tools

## Installation

```bash
npm install @tscg/openclaw @tscg/core
```

## Quick Start

### As OpenClaw Plugin

The plugin automatically compresses tool definitions:

```javascript
// In your OpenClaw config
{
  "plugins": ["@tscg/openclaw"]
}
```

### Self-Tune (Optional)

Create a custom profile for your model:

```bash
# Quick benchmark (30 calls, recommended for first setup)
npx tscg-openclaw tune --model claude-sonnet-4

# Full benchmark (600 calls, for production)
npx tscg-openclaw tune --model claude-sonnet-4 --full
```

### Programmatic Usage

```typescript
import { resolveProfile } from '@tscg/openclaw';
import { compress } from '@tscg/core';

const profile = await resolveProfile('claude-sonnet-4');
const result = compress(tools, {
  principles: {
    sdm: profile.operators.sdm,
    tas: profile.operators.tas,
    dro: profile.operators.dro,
    cfl: profile.operators.cfl,
    cfo: profile.operators.cfo,
    cas: profile.operators.cas,
    sad: profile.operators.sad,
    ccp: profile.operators.ccp,
  },
  preserveToolNames: true,
});
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `tune` | Run self-tuning benchmark |
| `tune --all-models` | Batch-tune all configured models |
| `list-profiles` | Show all cached profiles |
| `show-profile <model>` | Display a model's profile |
| `clear-profile <model>` | Delete a cached profile |
| `report <model>` | Show benchmark results |
| `stats` | Show compression statistics |
| `install` | Install skill to ~/.openclaw/ |
| `uninstall` | Remove installed skill |
| `doctor` | Run diagnostic checks |
| `help` | Show help text |

### Tune Options

```bash
tscg-openclaw tune [options]

Options:
  --model <name>        Model to benchmark (default: auto-detect)
  --full                Use full config (600 calls vs 30)
  --sweep               Per-operator isolation sweep (180 calls, ~$1)
  --dry-run             Show plan without executing
  --force               Re-tune even if cache exists
  --json                Output JSON
  --optimize-for <mode> accuracy | savings | balanced (default)
  --max-cost <usd>      Abort if cost exceeds threshold
  --yes                 Skip confirmation
  --all-models          Tune all models from config
```

### Per-Operator Sweep (v1.4.2)

The `--sweep` flag runs a 9-condition leave-one-in isolation test to determine which TSCG operators help, hurt, or have no effect on your model:

```bash
# Run per-operator sweep
tscg-openclaw tune --sweep --model your-model

# Preview the plan without running
tscg-openclaw tune --sweep --model your-model --dry-run

# View results after sweep
tscg-openclaw show-profile your-model --verbose
```

Example output:
```
  baseline-no-ops  : 80.0%  (reference)
  sdm-only         : 85.0%  +5.0pp  HELPFUL
  tas-only         : 80.0%  +0.0pp  neutral
  dro-only         : 75.0%  -5.0pp  HARMFUL
  cfl-only         : 75.0%  -5.0pp  HARMFUL
  cfo-only         : 80.0%  +0.0pp  neutral
  cas-only         : 85.0%  +5.0pp  HELPFUL
  sad-only         : 85.0%  +5.0pp  HELPFUL
  ccp-only         : 80.0%  +0.0pp  neutral

Classification: compression-friendly (3H/3N/2X)
Recommended: SDM+TAS+CFO+CAS+SAD+CCP (exclude DRO, CFL)
Confidence: HIGH
```

### Model Archetype Table (Empirical, 2,000+ calls)

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

## Architecture

### 4-Tier Profile Resolution

1. **Tier 0 (Memory)**: In-memory Map -- zero-cost repeated lookups
2. **Tier 1 (Cache)**: Disk cache in `~/.openclaw/tscg-profiles/` -- SHA-256 hashed JSON
3. **Tier 2 (Static)**: 13 pre-configured model families
4. **Tier 2.5 (Size Heuristic)**: Parameter-count regex (<40B/40-99B/>=100B)
5. **Tier 3 (Fallback)**: Conservative SDM-only profile

### Operator Configuration

TSCG uses 8 compression operators:

| Operator | Name | Description |
|----------|------|-------------|
| SDM | Schema Description Minimization | Strip filler words from descriptions |
| TAS | Type Annotation Simplification | Simplify type annotations |
| DRO | Default Removal Optimization | Remove default value annotations |
| CFL | Cross-Field Linking | Link related fields |
| CFO | Cross-Field Ordering | Reorder fields for compression |
| CAS | Constraint Annotation Simplification | Simplify constraints |
| SAD | Schema Abbreviation Dictionary | Use abbreviations |
| CCP | Cross-Context Pruning | Remove redundant context |

### Profile Archetypes

| Archetype | Operators | Best For |
|-----------|-----------|----------|
| hungry | All 8 ON | Claude Opus, large models (>=100B) |
| robust | 6/8 ON | Claude Sonnet, Llama 70B, GPT-5 |
| balanced | 5/8 ON | Claude Haiku |
| sensitive | 6/8 (CFO/SAD OFF) | GPT-4 family |
| small-model | SDM+TAS+DRO+CCP | Models <40B (Qwen, Phi, Gemma) |
| conservative | SDM only | DeepSeek, unknown models |

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `TSCG_MODEL` | Override model detection |
| `TSCG_CACHE_DIR` | Override cache directory |
| `ANTHROPIC_API_KEY` | API key for Claude models |
| `OPENAI_API_KEY` | API key for GPT models |
| `OLLAMA_BASE_URL` | Ollama server URL (default: http://localhost:11434) |

### Config File

`~/.openclaw/openclaw.json`:
```json
{
  "agents": {
    "default": { "model": "claude-sonnet-4" },
    "coding": { "model": "claude-opus-4" }
  }
}
```

## API

### resolveProfile(modelString)

Resolve a model to its compression profile using the 4-tier chain.

```typescript
const profile = await resolveProfile('claude-sonnet-4');
// { name: 'claude-sonnet', operators: {...}, source: 'static', archetype: 'robust' }
```

### recommend(results, options?)

Generate a recommendation from benchmark results.

```typescript
const rec = recommend(results, { optimizeFor: 'balanced' });
// { profile: 'balanced', operators: {...}, confidence: 'HIGH', score: 0.85 }
```

### estimateCost(config)

Estimate benchmark cost before running.

```typescript
const est = estimateCost({ model: 'claude-sonnet-4', full: false, dryRun: false, force: false });
// { totalCalls: 30, estimatedCostUsd: 0.45, provider: 'anthropic', isLocal: false }
```

### runTune(config)

Run the self-tuning benchmark.

```typescript
const result = await runTune({
  model: 'claude-sonnet-4',
  full: false,
  dryRun: false,
  force: false,
  optimizeFor: 'balanced',
  onProgress: (event) => console.log(event.message),
});
```

## License

MIT
