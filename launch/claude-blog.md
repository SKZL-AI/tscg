# Claude Community Blog Post

## Title

We benchmarked Claude Code's 50K token overhead -- here's how to cut it by 72%

## Tags

#claude #anthropic #tool-use #optimization

---

Every Claude Code subprocess injects approximately 50,000 tokens of tool definitions into the context window -- 16 tools (Bash, Read, Write, Edit, Glob, Grep, etc.) described in verbose JSON Schema format, repeated verbatim on every API call. We built TSCG (Token-Context Semantic Grammar) to compress these schemas by 50-72%, and the results tell an interesting story about how Claude processes structured data.

### The Benchmark

We ran ~13,000 API calls across 12 models (4B-32B local + 3 frontier APIs) on TAB (TSCG-Agentic-Bench), the first benchmark designed to measure how tool-schema compression affects LLM tool-use performance. Five scenarios: real Claude Code tools, MCP server catalogs, scaling tests (3-100 tools), small-model stress tests, and multi-collection stress.

### Claude Sonnet 4 Results

**Scenario A (16 Claude Code tools):**
- Natural JSON schemas: 68.9% overall accuracy
- TSCG compressed: 78.9% (+10.0pp) with 50.1% token savings
- In text-mode comparison (eliminating JSON format confound): TSCG achieves 87.8% vs 76.9% natural text -- a genuine +10.9pp compression benefit

**BFCL (Berkeley Function Calling Leaderboard):**
- TSCG achieves 93.2% on BFCL-sourced schemas (vs 85.7% natural)
- 108% Accuracy Retention Rate -- TSCG *improves* accuracy
- 46.8% token savings

**GSM8K-Under-Load:**
- Claude Sonnet 4 maintains ~81% GSM8K accuracy across 0-50 irrelevant tool definitions
- TSCG provides a consistent ~4.5pp advantage -- less schema overhead means better reasoning

### The Format Translation Discovery

The most surprising finding: when we systematically decomposed TSCG's gains using text baselines (E4 experiment, 2,940 Ollama calls across 6 small models), we found that the dramatic accuracy improvements on small models (0% -> 90% for some) are from **format translation** (JSON -> structured text), not structural compression.

But here's why that matters: every production API -- OpenAI Function Calling, Anthropic Tool Use, MCP, LangChain -- transmits tool definitions as JSON. The JSON format itself is what makes small models fail at tool-use. TSCG's implicit format translation is the precisely needed intervention.

For Claude Sonnet 4 specifically, the story is different: TSCG provides genuine structural compression (+10.9pp in text-mode comparison) that goes beyond format effects. Claude benefits from TSCG's causal attention optimization -- Constraint-First Layout (CFL), Causal Access Score (CAS) reordering, and Semantic Density Maximization (SDM).

### 4-Class Taxonomy

We identified four behavioral classes across 12 models:

| Class | Models | TSCG Effect |
|-------|--------|-------------|
| 1: Format-dominated | Phi-4, Mistral 7B, Gemma 4B, Qwen3 4B | JSON->text is the mechanism |
| 2: Compression | Claude, GPT-4o, GPT-5.2 | Genuine +5-11pp structural benefit |
| 3: Neutral | Llama 8B, Gemma 12B, Mistral-Small 24B | No effect either way |
| 4: Conservative-only | Qwen3 14B, Qwen2.5-Coder 32B | Balanced hurts, conservative helps |

Claude is Class 2 -- one of only three models that shows confirmed compression benefit beyond format translation.

### Integration

```bash
npm install @tscg/core
```

```typescript
import { compress } from '@tscg/core';

// Compress Claude Code's tool definitions
const result = compress(claudeCodeTools, {
  model: 'claude-sonnet',
  profile: 'balanced'  // Full compression for frontier models
});
// 50-72% fewer tokens, +10pp accuracy improvement
```

TSCG is 1,200 lines of TypeScript, zero dependencies, sub-millisecond execution, 27.7KB bundle. It sits transparently between your agent framework and the API.

### Links

- Paper: [arXiv link]
- GitHub: https://github.com/SKZL-AI/tscg
- npm: [@tscg/core](https://www.npmjs.com/package/@tscg/core)
- TAB Benchmark: included in repo

The paper is submitted to EMNLP 2026 (ARR May cycle). All benchmark data, evaluation code, and the full implementation are open-source.
