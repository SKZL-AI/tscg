# TSCG findings: published evidence

This former paper-planning document is superseded by the published manuscripts. Updated 22 October 2026. [Full measurements, sources, and corrections](PUBLISHED-RESULTS.md).

1. Furkan Sakizli. **TSCG: Deterministic Tool-Schema Compilation for Agentic LLM Deployments**. [arXiv:2605.04107v1](https://arxiv.org/html/2605.04107v1), submitted 4 May 2026. [PDF](https://arxiv.org/pdf/2605.04107v1).
2. Furkan Sakizli. **Tool-Schema Compression Enables Agentic RAG Under Constrained Context Budgets**. [arXiv:2605.26165v1](https://arxiv.org/html/2605.26165v1), submitted 24 May 2026. [PDF](https://arxiv.org/pdf/2605.26165v1).

- **Format enablement:** Phi-4 14B TAB D rises from 0.0% to 84.4% at 20 tools and 90.3% at 50 tools (Paper 1 Table 13). Phi-4 has no native tool calling in the tested Ollama deployment; compiled text plus application-side parsing and execution provides a working tool-use path. Table 13 labels the zero baseline `json-text`; it is not a native-FC or BFCL leaderboard score.
- **Format versus compression:** Paper 1 Table 14 reports Phi-4 +92.0 pp from format translation, -7.0 pp from additional compression. Gains against a failing JSON baseline do not imply gains against a working text baseline.
- **Frontier results:** GPT-4o native FC → TSCG is 55.5% → 56.5% in TAB A and 70.0% → 79.7% in TAB B (Tables 1 and 8).
- **BFCL validation:** Sonnet 4 85.7% → 93.2%, +7.5 pp, 46.8% token savings (Table 4). The detailed table does not establish the old GPT BFCL rows; ARR is a ratio, not >100% accuracy.
- **Model-specific operators:** Paper 1 Table 15 distinguishes Opus 4.7, GPT-5.2, and Sonnet 4 response profiles. Table 23's eleven-model ablation identifies DRO as the main token-saving operator and CAS as a consistent accuracy contributor.
- **Scaling:** Opus 4.7 on 43 heavy production MCP schemas scores 75.0% → 80.0%, +5.0 pp, 56.6% savings; 100 light synthetic tools show 75.0% parity (Table 16). Generalization is catalog-specific.
- **RAG enablement:** Paper 2 reports 14 models and 6,566 calls. At 8K/28 tools, eight-model mean EM rises 2.6% → 23.1% (+20.5 pp, Table 1); Phi-4 HotpotQA rises 0% → 48% (Table 3).

The old draft's claim that small-model enablement was independently established on BFCL is withdrawn: the published BFCL table evaluates Sonnet 4. The papers also report negative results and limited statistical power; only 9 of 107 pairwise McNemar comparisons in Paper 1 survive Holm–Bonferroni correction. See the provenance guide before reusing a headline.
