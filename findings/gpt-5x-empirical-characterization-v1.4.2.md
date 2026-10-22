# Frontier operator characterization: published scope

Updated 22 October 2026. Source: [Paper 1](https://arxiv.org/html/2605.04107v1), Table 15 and Sections 6.3, 7.2, and 8. Historical filename retained for incoming links. [Measurement provenance](../docs/PUBLISHED-RESULTS.md).

| Tested model | Response profile | Published leave-one-in evidence |
|--------------|------------------|---------------------------------|
| Claude Opus 4.7 | Operator-hungry | CCP alone +20 pp; CFL+CFO synergy +17.5 pp; all eight optimal in this experiment |
| GPT-5.2 | Operator-sensitive | CFL +2.5 pp; CFO -5 pp; CCP 0 pp; all-eight condition -10 pp |
| Claude Sonnet 4 | Operator-robust | Six of seven per-operator conditions at 80.0%; CFO -2.5 pp |

Table 15 uses a 43-tool MCP catalog, `n=40` per cell, and two seeds. These operator deltas are separate from the native-FC vs TSCG comparison in Tables 1 and 8. Recommendations must preserve experiment and model-version scope.

Paper 1 Section 8 explicitly leaves post-evaluation GPT-5.5 testing to future work. The former GPT-5.4/GPT-5.5 sweep tables, claimed price estimates, and assertions that those measurements confirm or refute the published paper are not established by its detailed result tables and have been withdrawn from this paper-backed summary. Existing software profiles and tuning commands are implementation features, not additional published experiments.

The supported conclusion is that operator response differs across the tested models. Evaluate a new model version and verify combined operators rather than deriving a performance guarantee from vendor name or parameter count.
