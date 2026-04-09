# Show HN Post Draft

## Title

Show HN: TSCG -- A tool-schema compiler that saves 72% of tokens in LLM agent frameworks

---

## Post Body

Hi HN,

I built TSCG (Token-Context Semantic Grammar), a deterministic compiler that compresses LLM tool/function-calling schemas by 50-75% while maintaining or improving accuracy. It's ~1,200 LOC TypeScript, zero dependencies, sub-millisecond execution.

**The problem:** Every time you use Claude Code, GPT, or any agent framework with tools enabled, the model receives full JSON Schema definitions for every tool on every API call. Claude Code sends ~50,000 tokens of tool definitions per subprocess. At production scale (100k calls/day), the schema overhead alone costs >$30,000/month.

**Bigger problem:** Small models (4B-14B) cannot parse JSON-format tool schemas reliably -- 0-49% accuracy with >15 tools. This locks agentic capabilities behind expensive frontier APIs.

**What TSCG does:** It applies 8 formally-defined transforms grounded in how causal transformers process tokens:

- Tokenizer-Aligned Syntax (TAS): optimize for BPE boundaries
- Constraint-First Layout (CFL): exploit the attention sink at position 0
- Semantic Density Maximization (SDM): remove 104+ filler patterns
- Causal Access Score (CAS): reorder by parameter fragility
- ...plus 4 more (DRO, CFO, CCP, SAD-F)

**Key results from the paper (~13,000 API calls, 12 models):**

- 50-75% token savings on tool schemas (74.8% on LLMLingua comparison set)
- Small models recover from 0-49% to 65-90% accuracy (the "JSON-API enablement" effect)
- Format decomposition (2,940 Ollama calls) reveals the mechanism: TSCG's gains on small models are from JSON→text translation, not compression -- but since every API sends JSON, that's the needed intervention
- Frontier models (Claude, GPT-4o, GPT-5.2): genuine +5-11pp compression persists when format confound is eliminated
- R²=0.88 predictive model: one baseline measurement predicts TSCG benefit (collapses to R²=0.03 against text baselines -- confirming format sensitivity)
- BFCL: 108% Accuracy Retention Rate (TSCG *improves* accuracy on Berkeley Function Calling Leaderboard)
- 4-class behavioral taxonomy: Format-dominated, Compression, Neutral, Conservative-only

**Technical:**

- Zero runtime dependencies, <1ms, 27.7KB bundle
- Works with OpenAI, Anthropic, MCP, LangChain formats
- Deterministic: same input always produces same output
- ~40,000x faster than LLMLingua-2 (42.5s vs <1ms)

**Install:**

```bash
npm install @tscg/core
```

```typescript
import { compress } from '@tscg/core';
const result = compress(myTools, { model: 'claude-sonnet' });
// ~72% fewer tokens, same or better accuracy
```

**Links:**

- GitHub: https://github.com/SKZL-AI/tscg
- npm: https://www.npmjs.com/package/@tscg/core
- Paper: [arXiv link]
- TAB Benchmark: included in repo under `benchmark/`

This started as a research project (paper submitted to EMNLP 2026) and turned into something production-ready. The key insight: for small models, the JSON format itself is the bottleneck -- TSCG's "compression" is really format translation, and that's exactly what's needed.

Happy to answer questions about the compression principles, the format-confound finding, or anything else.

---

## Expected HN Questions & Answers

**Q: Does this break tool calling?**
A: No. TSCG preserves all semantic atoms (tool names, parameter names, types, constraints). On frontier models it improves accuracy; on small models it enables tool-use that was previously impossible.

**Q: How does this compare to just stripping descriptions?**
A: At 16 well-known tools, naive truncation matches TSCG (87.0% vs 87.8%). At 50 tools with ambiguous names, TSCG pulls ahead: 100% vs 98.5%, with the gap concentrated in multi-tool sequencing (87.5% vs 75.0%). Descriptions matter when tools are similar.

**Q: Why not just use text descriptions instead of JSON?**
A: You can't -- every production API (OpenAI Function Calling, Anthropic Tool Use, MCP) transmits JSON. TSCG sits between the framework and the API, transparently converting.

**Q: What about Qwen models?**
A: Qwen shows architecture-specific sensitivity to structural transforms. Use conservative mode (filler removal only, +4.4pp) instead of balanced mode (-6.6pp). The degradation persists from 14B to 32B -- it's architectural, not a capacity issue.
