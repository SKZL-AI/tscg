# Deployment evidence and context budgets

Updated 22 October 2026. Sources: [Paper 1](https://arxiv.org/html/2605.04107v1), Table 16 and Section 8; [Paper 2](https://arxiv.org/html/2605.26165v1), Tables 1–5 and Section 8. [Full measurement provenance](../docs/PUBLISHED-RESULTS.md).

## Heavy production schemas: Paper 1

Opus 4.7 on 43 heavy production MCP schemas: **75.0% → 80.0% accuracy**, +5.0 pp, **56.6% token savings** (Table 16, `json-text` vs `v13-smart`). At 100 light synthetic tools, both conditions score 75.0% with 52.5% savings. This is catalog-specific evidence, not a guarantee that gains grow with tool count.

## Agentic RAG: Paper 2

The study evaluates 14 models over 6,566 calls with 28 tools and 8K/16K/32K context budgets. Primary conservative compression saves 44–50% of schema tokens.

| Model | JSON EM at 8K | TSCG EM at 8K | Delta |
|-------|---------------|---------------|-------|
| Llama 3.1 8B | 1% | 34% | +33 pp |
| Phi-4 14B | 2% | 33% | +31 pp |
| Mistral-Small 24B | 4% | 33% | +29 pp |
| Claude Sonnet 4 | 10% | 36% | +26 pp |
| Qwen2.5-Coder 32B | 3% | 18% | +15 pp |
| Gemma 3 12B | 1% | 15% | +14 pp |
| Qwen3 14B | 0% | 12% | +12 pp |
| Gemma 4 26B | 0% | 4% | +4 pp |
| Average (eight models) | 2.6% | 23.1% | +20.5 pp |

Source: Table 1. At 8K, approximately 11,000-token JSON schemas overflow; approximately 5,500-token compiled schemas permit retrieval. Gemma 4 26B retains parsing failures.

At 16K, Table 2 reports retrieval budget **2,832 → 8,457 tokens**, **9 → 26 chunks**. Section 4.2 reports a median EM delta of -1 pp; more chunks do not generally improve accuracy. Qwen3 4B regresses by -8 pp. At 32K, four of five tested models remain within ±1 pp; Qwen2.5-Coder 32B improves by +12 pp (Table 5).

For Sonnet 4 at 200K, Table 4 reports 500 tools: **0% → 90% EM**; 800 tools: **0% → 100% EM**. The JSON overflow threshold is approximately 494 tools for this setup; compressed schemas remain operational beyond 800. Thresholds depend on schema complexity and context allocation.

HotpotQA is a separate 50-question experiment: Phi-4 at 8K/28 tools achieves **0% → 48% EM** and answer F1 **0.000 → 0.645** (Table 3).

## Deployment interpretation

Full text-mode compilation supports a model without native tool calling only when an application provides prompt instructions, output parsing, validation, and execution. Description-only compression preserves JSON schemas for an existing native interface; it does not create native support.

The former fixed monthly-dollar savings, per-tool-count latency figures, memory overhead, and multi-agent accuracy table are not established by the published papers and are withdrawn as paper-backed deployment measurements. Estimate cost from measured uncached input-token reduction and the deployment's actual billing assumptions; do not treat schema-token savings as total-request savings.

Conservative is a useful starting point, not guaranteed zero risk or zero regression. Validate the actual model, profile, catalog, and context budget. No new model calls were performed for this documentation reconciliation.
