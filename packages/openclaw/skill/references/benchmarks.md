# Published benchmark evidence

Sources: [Paper 1](https://arxiv.org/html/2605.04107v1) and [Paper 2](https://arxiv.org/html/2605.26165v1). See [the repository provenance guide](../../../../docs/PUBLISHED-RESULTS.md) for exact tables, baselines, metrics, and manuscript inconsistencies.

- **BFCL schemas, Sonnet 4:** 85.7% → 93.2% accuracy, +7.5 pp, 46.8% token savings; Paper 1 Table 4, n=60 per condition. This is external-schema validation, not an official full-suite leaderboard score.
- **Phi-4 14B, TAB D:** 0.0% → 84.4% at 20 tools; 0.0% → 90.3% at 50 tools; Paper 1 Table 13. Phi-4 lacks native tool calling in the tested Ollama deployment. TSCG text plus host-side parsing and execution enables tool use without native support. The published zero baseline is labelled `json-text`, not a Phi-4 BFCL or native-FC score.
- **GPT-4o, TAB A/B:** native FC 55.5% / 70.0%; TSCG 56.5% / 79.7%; Paper 1 Tables 1 and 8. Do not relabel these as BFCL results.
- **RAG at 8K, 28 tools:** mean answer EM 2.6% → 23.1% across eight models; Paper 2 Table 1. The whole study covers 14 models and 6,566 calls.
- **HotpotQA, Phi-4, 8K:** 0% → 48% answer EM; Paper 2 Table 3, 50 questions.

Static archetypes and `small-model` presets describe implementation choices. They do not establish a published accuracy delta, operator savings contribution, or universal model-size rule. The former per-family 720-call table and additive operator-saving percentages were not supported by these published tables and are superseded. Conservative is not a universal zero-regression guarantee.
