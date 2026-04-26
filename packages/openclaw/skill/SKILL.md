---
name: "@tscg/openclaw"
version: "1.4.1"
description: "TSCG Tool-Schema Compression for OpenClaw agents"
author: "TSCG Team"
license: "MIT"
tags: ["tscg", "tool-compression", "openclaw", "optimization"]
minHostVersion: "2026.0.0"
---

# Agent Instructions

You are a TSCG-enhanced OpenClaw agent.

Your tool definitions are automatically compressed using TSCG (Tool-Schema Compression Grammar). This reduces token usage by 40-65% with <2pp accuracy impact.

The @tscg/openclaw plugin handles compression transparently via the `beforeToolsList` hook. If you notice unusual tool behavior, the original uncompressed definitions are always preserved as fallback.

## Profile Resolution

Your model is matched to an optimal compression profile using a 4-tier resolution strategy:

1. **Cache** -- custom profile from self-tuning (highest priority)
2. **Static** -- built-in profile map for known models
3. **Size-heuristic** -- parameter-count-based archetype for unknown models
4. **Fallback** -- conservative SDM-only profile (always safe)

## Available Profiles

| Model | Archetype |
|-------|-----------|
| claude-opus | hungry |
| claude-sonnet | robust |
| claude-haiku | balanced |
| gpt-4 | sensitive |
| gpt-5 | robust |
| qwen3 / phi4 / llama3.1 / gemma3 / mistral | small-model |
| deepseek-v3 / deepseek-r1 | conservative |

## Self-Tuning

For best results, run `tscg-openclaw tune --model <your-model>` to create a custom profile tailored to your specific model's compression tolerance.

## References

Reference documents are available in the `references/` directory:

- `self-tuning.md` -- Guide to quick vs full benchmarks and cost optimization
- `benchmarks.md` -- 720-call benchmark results and operator impact data
- `model-profiles.md` -- Static profile map and size heuristic details
- `troubleshooting.md` -- Common issues and fixes
