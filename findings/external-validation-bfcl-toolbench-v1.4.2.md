# External validation: published evidence

Updated 22 October 2026. Source: [Paper 1](https://arxiv.org/html/2605.04107v1), Table 4 and Section 6.6; [Paper 2](https://arxiv.org/html/2605.26165v1), Table 3. See [measurement definitions and correction history](../docs/PUBLISHED-RESULTS.md).

## BFCL: Sonnet 4

Twenty tasks × three runs (`n=60` per condition), evaluated using BFCL schemas. This is the author's external-schema validation experiment, not an official full-suite leaderboard submission or independent replication.

| Condition | Accuracy | Tool selection | Parameter F1 | Token savings |
|-----------|----------|----------------|--------------|---------------|
| Natural | 85.7% | 86.7% | 84.2% | — |
| TSCG | 93.2% | 95.0% | 91.7% | 46.8% |
| TSCG+SAD | 89.0% | 90.0% | 87.5% | 46.0% |

Accuracy improves by +7.5 pp. ARR is approximately 108.8% calculated from the rounded values; the paper summarizes it as 108%. ARR above 100% means a ratio above one, never accuracy above 100%.

The old normalized baseline of 100% and >100% accuracy entries were incorrect. The former GPT BFCL accuracy and token-saving rows are not supplied by the detailed published Table 4 and are withdrawn. The abstract's three-model ARR range is inconsistent with the detailed validation; [the source note](../docs/PUBLISHED-RESULTS.md#paper-1-bfcl-external-validation) records this explicitly. Phi-4's zero-baseline enablement is a TAB D result, not a BFCL score.

## HotpotQA: agentic RAG

Paper 2 Table 3: Phi-4 14B, 50 multi-hop questions, 28 tools, 8K context. JSON EM **0.0%**, TSCG EM **48.0%** (+48 pp); answer F1 **0.000 → 0.645**. This measures answer quality under context overflow, separately from BFCL tool selection and parameter extraction.

## Withdrawn comparator claims

The previous API-Bank, ToolBench, and LLMLingua-2 numeric comparison tables are not established by either published manuscript. References to these systems in related work do not constitute a head-to-head evaluation. No parity, superiority, extra-savings, or production-safety conclusion is inferred from those removed tables. Paper 1 Section 8 explicitly leaves direct comparison with schema-replacement alternatives to future work.
