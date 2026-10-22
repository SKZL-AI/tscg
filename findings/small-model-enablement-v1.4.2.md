# Small-model tool-use enablement

Source: [Paper 1](https://arxiv.org/html/2605.04107v1), Tables 3, 13, and 14; Sections 6.1, 6.2, and 7.2. Updated 22 October 2026. [Measurement provenance](../docs/PUBLISHED-RESULTS.md).

## Phi-4: enablement without native tool calling

**Phi-4 14B has no native tool calling in the tested Ollama deployment.** TSCG enables tool use through a text interface: compile the schemas, include the resulting text in the prompt, parse the model's generated tool name and arguments, then validate and execute the call in the host application. Native tool-calling support is not required for this path. `compress()` alone does not execute tools or add a native API interface to the model.

An unsupported native-FC path should be reported as **unsupported / N/A**, rather than interpreted as a measured reasoning score of zero. The published **0.0% → 84.4% (20 tools)** and **0.0% → 90.3% (50 tools)** results are **TAB Scenario D**, not Phi-4 BFCL leaderboard scores. Table 13 labels its baseline `json-text`; those published zeros must also not be silently relabelled as native-FC measurements or attributed solely to missing native support. The paper's E4 control identifies format translation as the dominant enablement mechanism (+92.0 pp format effect, -7.0 pp additional compression effect for Phi-4, Table 14).

## Published TAB D results

Table 13 reports:

| Model | JSON baseline, 20 tools | TSCG, 20 tools | JSON baseline, 50 tools | TSCG, 50 tools |
|-------|-------------------------|----------------|-------------------------|----------------|
| Phi-4 14B | 0.0% | 84.4% | 0.0% | 90.3% |
| Mistral 7B | 35.0% | 80.1% | 30.0% | 65.0% |
| Gemma 3 4B | 49.9% | 67.0% | 24.3% | 87.4% |
| Gemma 3 12B | 85.0% | 95.0% | 85.0% | 98.0% |
| Llama 3.1 8B | 78.4% | 81.0% | 75.1% | 86.3% |
| Qwen3 4B | 44.3% | 69.3% | 90.0% | 75.0% |
| Qwen3 14B | 90.2% | 84.1% | 94.6% | 89.6% |

These values preserve the published table's labels and catalog sizes; they are not the old report's unsupported 43-tool table. Section 5.1 defines the TAB composite score; Table 13's caption instead calls these tool-selection accuracy. This manuscript label inconsistency is documented in the provenance guide.

## Format translation versus additional compression

Table 14's E4 decomposition reports:

| Model | Format effect | Additional compression effect |
|-------|---------------|-------------------------------|
| Phi-4 14B | +92.0 pp | -7.0 pp |
| Mistral 7B | +44.6 pp | -7.4 pp |
| Gemma 3 4B | +47.3 pp | -8.9 pp |
| Qwen3 4B | +16.7 pp | -23.4 pp |
| Llama 3.1 8B | +5.6 pp | +0.3 pp |
| Gemma 3 12B | +9.2 pp | -0.9 pp |

This supports format-driven enablement for the first four models. It does not show that additional compression always improves a working text interface. The regression R² falls from approximately 0.88 against the JSON baseline to 0.03 against the text baseline; it is not a universal percentage of causal accuracy variance explained.

## Profiles and negative results

Paper 1 Table 3, at 20 tools:

| Model | Natural | Conservative | Balanced |
|-------|---------|--------------|----------|
| Mistral 7B | 35.0% | 80.0% | 80.1% |
| Gemma 3 4B | 49.9% | 87.3% | 67.0% |
| Qwen3 14B | 90.2% | 99.3% | 84.1% |

Conservative is SDM-only in Paper 1's implementation description; the OpenClaw `small-model` preset is a separate software configuration, not the same experimental condition. At 10 tools, Mistral conservative regresses from 83.5% to 76.0%. Do not promise zero accuracy loss, a universal parameter-size rule, or frontier-model equivalence from these experiments.

## Separate RAG result

[Paper 2](https://arxiv.org/html/2605.26165v1) reports Phi-4 at 8K/28 tools: NovaTech-28 EM **2% → 33%** (Table 1), versus **0% → 48%** on HotpotQA (Table 3). These are answer-EM measurements, distinct from the TAB values above.
