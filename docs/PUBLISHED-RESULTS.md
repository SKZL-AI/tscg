# Published TSCG results and measurement provenance

Reconciled against the published arXiv v1 manuscripts on **22 October 2026**. These versioned sources govern current research claims in this repository. Development notes, software release benchmarks, and archived documents are separate evidence and must not be presented as published paper results.

1. Furkan Sakizli. **TSCG: Deterministic Tool-Schema Compilation for Agentic LLM Deployments**. [arXiv:2605.04107v1](https://arxiv.org/html/2605.04107v1), submitted 4 May 2026. [PDF](https://arxiv.org/pdf/2605.04107v1).
2. Furkan Sakizli. **Tool-Schema Compression Enables Agentic RAG Under Constrained Context Budgets**. [arXiv:2605.26165v1](https://arxiv.org/html/2605.26165v1), submitted 24 May 2026. [PDF](https://arxiv.org/pdf/2605.26165v1).

## Metrics and baselines

- **TAB** means TSCG-Agentic-Bench, the author's benchmark. Paper 1 reports approximately 19,000 calls across five core scenarios and supplementary experiments. Its headline count is 12 models; Section 5.1 additionally counts GPT-4o comparisons as a thirteenth distinct model evaluation. Appendix I's approximately 3,960-call ablation is described separately. These counts must not be added to Paper 2's count without deduplicating experiments.
- **Native FC** means the provider's function-calling API. **JSON as text** means full schemas embedded in a prompt. **TSCG text** means compiled schemas delivered as text. These are different conditions, not interchangeable baselines.
- Section 5.1 defines TAB overall accuracy as `0.6 × tool-selection accuracy + 0.4 × parameter F1`. Table 13 is captioned tool-selection accuracy; its numbers below are transcribed as reported. Do not silently interpret all reported percentages as exact-match task completion.
- **BFCL** means Berkeley Function Calling Leaderboard. The paper's small external-validation experiment uses BFCL schemas and the project's scoring; it is not an official full-suite BFCL leaderboard submission or an independent replication.
- **ARR** is an accuracy ratio, `TSCG accuracy / baseline accuracy`. An ARR above 100% is possible; accuracy above 100% is not. When baseline accuracy is zero, ARR is undefined. Use a percentage-point delta for Phi-4 instead.
- Paper 2's **EM** (answer exact match) and answer F1 measure agentic RAG. They are distinct from TAB tool-selection accuracy and parameter F1. Schema-token savings are also distinct from total-request token savings or character savings.

## Paper 1: frontier TAB results

Source: **Tables 1 and 8**; three runs, 20 tasks per run in A (`n=60`), 100 per run in B (`n=300`). TSCG is the balanced condition; TSCG+SAD is a separate condition.

| Model | TAB scenario | Native FC | JSON as text | TSCG text | Delta vs native FC | Token savings vs native FC |
|-------|--------------|-----------|--------------|-----------|--------------------|----------------------------|
| Claude Sonnet 4 | A: 16 tools | 74.0% | 51.1% | 85.2% | +11.2 pp | 50.1% |
| Claude Sonnet 4 | B: 43 tools | 90.0% | 70.0% | 95.0% | +5.0 pp | 50.1% |
| GPT-4o | A: 16 tools | 55.5% | 45.7% | 56.5% | +1.0 pp | 6.2% |
| GPT-4o | B: 43 tools | 70.0% | 55.0% | 79.7% | +9.7 pp | 6.2% |
| GPT-5.2 | A: 16 tools | 51.9% | 78.3% | 81.6% | +29.7 pp | 11.4% |
| GPT-5.2 | B: 43 tools | 82.4% | 98.2% | 91.6% | +9.2 pp | 11.4% |

The published GPT-4o values are scenario-specific. They replace the old repository's unsupported GPT-4o BFCL row. For GPT-5.2 in B, TSCG improves over native FC but falls below JSON-as-text (98.2% → 91.6%, -6.6 pp); a blanket claim that every model improves over every baseline is incorrect.

## Paper 1: BFCL external validation

Source: **Table 4 and Section 6.6**, **Claude Sonnet 4**, 20 tasks × 3 runs (`n=60` per condition).

| Condition | Accuracy | Tool selection | Parameter F1 | Token savings |
|-----------|----------|----------------|--------------|---------------|
| Natural | 85.7% | 86.7% | 84.2% | — |
| TSCG | 93.2% | 95.0% | 91.7% | 46.8% |
| TSCG+SAD | 89.0% | 90.0% | 87.5% | 46.0% |

TSCG improves reported accuracy by **+7.5 pp**. Its 95% accuracy CI is **[86.3%, 98.3%]**. ARR is approximately **108.8%**, calculated from the displayed rounded values (`93.2 / 85.7 × 100`); the paper summarizes it as **108%**. ARR is not the accuracy column and the baseline is not 100% accuracy.

**Manuscript inconsistency:** Paper 1's abstract and contribution overview state 108–181% ARR across three models. The detailed BFCL Table 4, benchmark overview Table 7, Section 6.6, and limitations provide the explicit Sonnet 4 validation. They do not provide the old README's GPT-4o **31.7% → 57.4%** or GPT-5.2 **61.9% → 89.4%** BFCL rows. Those rows, their claimed token savings, and normalized ARR-as-accuracy tables have been withdrawn from current summaries. Do not invent replacement BFCL measurements for GPT-4o, GPT-5.2, or Phi-4 from the abstract's ratio range.

## Paper 1: small-model enablement and Phi-4

Source: **Table 13**, TAB Scenario D; Table 3 separately compares conservative and balanced profiles.

| Model | JSON baseline, 20 tools | TSCG, 20 tools | JSON baseline, 50 tools | TSCG, 50 tools |
|-------|-------------------------|----------------|-------------------------|----------------|
| Phi-4 14B | 0.0% | 84.4% | 0.0% | 90.3% |
| Mistral 7B | 35.0% | 80.1% | 30.0% | 65.0% |
| Gemma 3 4B | 49.9% | 67.0% | 24.3% | 87.4% |
| Gemma 3 12B | 85.0% | 95.0% | 85.0% | 98.0% |
| Llama 3.1 8B | 78.4% | 81.0% | 75.1% | 86.3% |
| Qwen3 4B | 44.3% | 69.3% | 90.0% | 75.0% |
| Qwen3 14B | 90.2% | 84.1% | 94.6% | 89.6% |

**Phi-4 14B has no native tool calling in the tested Ollama deployment.** TSCG enables tool use through a text interface: compile the schemas, include the resulting text in the prompt, parse the model's generated tool name and arguments, then validate and execute the call in the host application. Native tool-calling support is not required for this path. `compress()` alone does not execute tools or add a native API interface to the model.

An unsupported native-FC path should be reported as **unsupported / N/A**, rather than interpreted as a measured reasoning score of zero. The published **0.0% → 84.4% (20 tools)** and **0.0% → 90.3% (50 tools)** results are **TAB Scenario D**, not Phi-4 BFCL leaderboard scores. Table 13 labels its baseline `json-text`; those published zeros must also not be silently relabelled as native-FC measurements or attributed solely to missing native support. The paper's E4 control identifies format translation as the dominant enablement mechanism (+92.0 pp format effect, -7.0 pp additional compression effect for Phi-4, Table 14).

Implementation references: [`run-e1-phi4-text-baseline.ts`](../benchmark/scripts/run-e1-phi4-text-baseline.ts) sends ordinary chat messages and parses text output; [`ollama.ts`](../benchmark/harness/providers/ollama.ts) separately supports the native `tools`/`tool_calls` API path. Model reference: [Ollama Phi-4](https://ollama.com/library/phi4). Phi-4 14B is distinct from Phi-4-mini and other Phi variants.

The gains are **model-, profile-, and baseline-dependent**. Table 14 reports format-dominated gains for Phi-4, Mistral 7B, Gemma 3 4B, and Qwen3 4B; extra compression can reduce accuracy relative to a working text baseline. Table 3 shows Qwen3 14B at 20 tools: natural 90.2%, conservative 99.3%, balanced 84.1%. The conservative mean improvement is +4.4 pp across 10/20/50 tools. Conservative is not a universal zero-regression guarantee: Mistral 7B at 10 tools falls from 83.5% to 76.0%.

## Paper 1: operator and scaling evidence

Source: **Tables 15, 16, and 23**.

| Experiment | Published result | Scope |
|------------|------------------|-------|
| Opus 4.7 leave-one-in | CCP alone +20 pp; CFL+CFO synergy +17.5 pp | 43-tool MCP catalog, n=40 per cell, two seeds |
| GPT-5.2 leave-one-in | CFL +2.5 pp; CFO -5 pp; all-eight condition -10 pp | Same catalog; model-specific response |
| Sonnet 4 leave-one-in | Six of seven conditions at 80.0%; CFO -2.5 pp | Same catalog |
| Opus 4.7, heavy production MCP | 75.0% → 80.0%, +5.0 pp, 56.6% savings | 43 tools, Table 16 |
| Opus 4.7, light synthetic catalog | 75.0% → 75.0%, 52.5% savings | 100 tools, Table 16 |
| Eleven-model leave-one-out | DRO accounts for 95% of token savings; CAS consistently helps accuracy | Table 23; averaged effects, not per-model guarantees |

Operator names from Section 3.1: **TAS** Tokenizer-Aligned Syntax; **CFL** Constraint-First Layout; **CFO** Causal-Forward Ordering; **SDM** Semantic Density Maximization; **DRO** Delimiter-Role Optimization; **CCP** Causal Closure Principle; **CAS** Causal Access Score; **SAD-F** Selective Anchor Duplication with Fragility. The software option is named `sad`.

The theoretical >=51% bound has the assumptions in **Theorem 3.1**; it is not a guaranteed saving for every API request, tokenizer, compression mode, or profile. Section 8 notes English-only evaluation, limited task coverage, and model-version dependence. Only 9 of 107 pairwise McNemar comparisons survive Holm–Bonferroni correction (Appendix H); observed positive deltas are not automatically statistically significant. The reported TAB-to-MCP agreement within 0.1 pp is one transfer experiment (Section 6.5), not a universal prediction guarantee.

## Paper 2: agentic RAG under constrained context

Source: **Table 1**, NovaTech-28, 28 tools, conservative compression at an 8,192-token context budget. The full study covers **14 models and 6,566 API calls** across 8K/16K/32K; eight models appear in this 8K table.

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

JSON schemas use approximately 11,000 tokens and overflow 8K; compressed schemas use approximately 5,500 tokens and permit retrieval. Gemma 4 26B has persistent output-parsing failures. The abstract separately reports +24.7 pp among six models with full enablement; do not relabel that subset average as the eight-model mean.

| Experiment | Published result | Source |
|------------|------------------|--------|
| Phi-4, HotpotQA, 8K, 28 tools | 0.0% → 48.0% EM; answer F1 0.000 → 0.645; 50 questions | Table 3; Appendix D |
| Phi-4, NovaTech-28, 8K, 28 tools | 2% → 33% EM | Tables 1 and 5; different dataset from HotpotQA |
| 16K retrieval budget | 2,832 → 8,457 tokens; 9 → 26 chunks | Table 2 |
| 16K accuracy control | Median EM delta -1 pp; Qwen3 4B -8 pp | Section 4.2; Table 5 |
| 32K control | Four of five tested models within ±1 pp; Qwen2.5-Coder 32B +12 pp | Section 4.3; Table 5 |
| Sonnet 4, 200K, 500 tools | JSON 0% → TSCG 90% EM | Table 4 |
| Sonnet 4, 200K, 800 tools | JSON 0% → TSCG 100% EM | Table 4 |
| Sonnet 4 overflow threshold | JSON approximately 494 tools; TSCG operational beyond 800 | Section 4.5; Appendix C |
| Conservative vs balanced ablation | +0.8 pp EM for balanced, n=400 | Appendix F; two models at two budgets |

Paper 2 reports **44–50% schema-token savings** for the primary conservative condition. More retrieval capacity does not guarantee higher answer accuracy when both formats already fit. The overflow thresholds depend on the tested schemas, Sonnet 4, and the 200K budget; they are not universal model limits.

## Corrections and evidence boundaries

- Current README, package benchmark summaries, and findings use the detailed published tables above. Older development reports are explicitly marked historical and superseded for current research claims.
- Withdrawn: untraceable multi-model BFCL rows; ARR values presented as >100% accuracy; blanket zero-accuracy-loss claims; unsupported 43-tool small-model averages and equalizer percentages; unqualified production cost/latency, multi-agent, and competitor superiority numbers absent from the two papers.
- Paper 1 discusses ToolBench, API-Bank, and other compressors as related work. A citation to a benchmark or competitor is not a published head-to-head evaluation. The former numeric claims are not retained as paper-backed evidence.
- GPT-5.4/GPT-5.5 software profiles may exist, but their old development sweep tables are not published result tables in these manuscripts. Paper 1 explicitly leaves post-freeze GPT-5.5 evaluation to future work.
- The repository PDFs and release assets are manuscript snapshots. Use the versioned arXiv links above as the authority; this documentation correction does not modify published manuscripts, raw measurements, executable benchmark code, or released npm artifacts.
- Source availability: this checkout includes the Paper 1 benchmark harness and scripts, but no `paper/` or `paper2-rag-benchmark/` directory and no tracked per-call result checkpoints. Do not promise reproduction from files absent here; Paper 2's public-data statement alone does not establish their presence in this checkout.
