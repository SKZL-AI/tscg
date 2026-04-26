# TSCG Empirical Findings

Consolidated empirical results from 20,000+ API calls across 13+ language models, 4 external validation suites, and production deployment benchmarks.

## Documents

| Document | Focus | API Calls | Key Finding |
|----------|-------|-----------|-------------|
| [Master Report](./tscg-master-empirical-report-v1.4.2.md) | Complete overview | 20,000+ | All findings consolidated |
| [GPT-5.x Characterization](./gpt-5x-empirical-characterization-v1.4.2.md) | Per-operator sweep, GPT-4o to GPT-5.5 | 2,000+ | Non-monotonic operator sensitivity, combination-fragile discovery |
| [Small-Model Enablement](./small-model-enablement-v1.4.2.md) | Sub-15B models (Phi-4, Gemma, Qwen, Llama, Mistral) | 5,000+ | 0% JSON -> 85% TSCG enablement, equalizer effect |
| [Production Deployment](./production-deployment-metrics-v1.4.2.md) | MCP-Proxy, latency, multi-agent, RAG | ~1,500 | $18,902/month savings, -20.7% latency at 43 tools |
| [External Validation](./external-validation-bfcl-toolbench-v1.4.2.md) | BFCL, ToolBench, API-Bank, LLMLingua-2 | ~2,000 | 108-181% BFCL ARR, Pareto dominance over LLMLingua-2 |

## Models Tested

**Frontier (API):** Claude Sonnet 4, Claude Opus 4.7, GPT-4o, GPT-5.2, GPT-5.4, GPT-5.5
**Local (Ollama):** Gemma 3 (4B, 12B), Phi-4, Llama 3.1 8B, Mistral 7B, Qwen 3 (4B, 14B)

## TSCG Version

All findings produced with TSCG v1.4.1 and v1.4.2. See [CHANGELOG](../packages/core/CHANGELOG.md).

## Author

Furkan Sakizli, [SKZL-AI](https://github.com/SKZL-AI)
