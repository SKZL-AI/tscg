# TSCG research overview: published results

Updated 22 October 2026. This replaces the earlier development aggregate with evidence from the published manuscripts. Historical filename retained for links.

1. Furkan Sakizli. **TSCG: Deterministic Tool-Schema Compilation for Agentic LLM Deployments**. [arXiv:2605.04107v1](https://arxiv.org/html/2605.04107v1), submitted 4 May 2026. [PDF](https://arxiv.org/pdf/2605.04107v1).
2. Furkan Sakizli. **Tool-Schema Compression Enables Agentic RAG Under Constrained Context Budgets**. [arXiv:2605.26165v1](https://arxiv.org/html/2605.26165v1), submitted 24 May 2026. [PDF](https://arxiv.org/pdf/2605.26165v1).

## Tool-schema compilation: Paper 1

The paper reports approximately 19,000 calls, five core TAB scenarios, and model-specific supplementary experiments. TAB is the author's benchmark and reports tool selection and parameter extraction. The headline count is 12 models; Section 5.1 counts additional GPT-4o comparisons as a thirteenth distinct evaluation. See [scope and metric definitions](../docs/PUBLISHED-RESULTS.md#metrics-and-baselines).

| Model | TAB scenario | Native FC | JSON as text | TSCG text | Delta vs native FC | Token savings vs native FC |
|-------|--------------|-----------|--------------|-----------|--------------------|----------------------------|
| Claude Sonnet 4 | A: 16 tools | 74.0% | 51.1% | 85.2% | +11.2 pp | 50.1% |
| Claude Sonnet 4 | B: 43 tools | 90.0% | 70.0% | 95.0% | +5.0 pp | 50.1% |
| GPT-4o | A: 16 tools | 55.5% | 45.7% | 56.5% | +1.0 pp | 6.2% |
| GPT-4o | B: 43 tools | 70.0% | 55.0% | 79.7% | +9.7 pp | 6.2% |
| GPT-5.2 | A: 16 tools | 51.9% | 78.3% | 81.6% | +29.7 pp | 11.4% |
| GPT-5.2 | B: 43 tools | 82.4% | 98.2% | 91.6% | +9.2 pp | 11.4% |

Sources: Tables 1 and 8. A positive delta against native FC does not imply a positive delta against JSON-as-text. In particular, GPT-5.2 B falls from 98.2% JSON-as-text to 91.6% TSCG.

## Phi-4 and local-model enablement

**Phi-4 14B has no native tool calling in the tested Ollama deployment.** TSCG enables tool use through a text interface: compile the schemas, include the resulting text in the prompt, parse the model's generated tool name and arguments, then validate and execute the call in the host application. Native tool-calling support is not required for this path. `compress()` alone does not execute tools or add a native API interface to the model.

An unsupported native-FC path should be reported as **unsupported / N/A**, rather than interpreted as a measured reasoning score of zero. The published **0.0% → 84.4% (20 tools)** and **0.0% → 90.3% (50 tools)** results are **TAB Scenario D**, not Phi-4 BFCL leaderboard scores. Table 13 labels its baseline `json-text`; those published zeros must also not be silently relabelled as native-FC measurements or attributed solely to missing native support. The paper's E4 control identifies format translation as the dominant enablement mechanism (+92.0 pp format effect, -7.0 pp additional compression effect for Phi-4, Table 14).

See [all seven local-model results and negative effects](small-model-enablement-v1.4.2.md). Model-size heuristics in software are not universal empirical rules.

## External validation

Paper 1 Table 4 reports Sonnet 4 BFCL-schema accuracy **85.7% → 93.2%**, +7.5 pp, with **46.8% token savings**, `n=60` per condition. ARR is a ratio, not >100% accuracy. The detailed table does not establish the old GPT BFCL rows. See [external validation and the manuscript inconsistency](external-validation-bfcl-toolbench-v1.4.2.md).

## Context-budget enablement: Paper 2

The separate study reports 14 models, 6,566 calls, 28 tools, and 8K/16K/32K context budgets. At 8K, eight-model mean EM rises **2.6% → 23.1%** (+20.5 pp), using conservative compression with 44–50% schema-token savings (Table 1). HotpotQA on Phi-4 rises **0% → 48% EM** (Table 3). At 32K, four of five tested models are within ±1 pp, with a +12 pp Qwen2.5-Coder exception (Table 5).

See [deployment and budget details](production-deployment-metrics-v1.4.2.md). TAB accuracy and RAG answer EM are different metrics; the two studies' call counts must not be combined without checking overlap.

## Evidence limits

Accuracy depends on baseline, catalog, model version, and operator configuration. The papers do not establish the old report's aggregate production cost/latency tables, multi-agent accuracy table, competitor superiority table, equalizer percentages, or post-freeze GPT-5.5 sweep measurements. Those are withdrawn as published-paper claims. [Full correction record](../docs/PUBLISHED-RESULTS.md#corrections-and-evidence-boundaries).
