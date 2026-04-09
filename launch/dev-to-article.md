# Dev.to Article Draft

## Title

Claude Code wastes 50K tokens per turn -- here's how to fix it (and what we learned about JSON vs text)

## Tags

#ai #llm #typescript #opensource

## Cover Image Alt Text

TSCG: Tool-Schema Compression Grammar -- 72% token savings, 12 models, ~13,000 API calls

---

## Article Body

Every time Claude Code processes your request, it sends approximately **50,000 tokens** of tool definitions to the model. Every single turn.

That's 16 tools (Read, Write, Edit, Bash, Glob, Grep, etc.) described in verbose JSON Schema format. The model has seen these patterns millions of times during training. It does not need the full verbosity.

I built **TSCG** (Token-Context Semantic Grammar) to fix this -- and in doing so, discovered something surprising about *why* small models fail at tool-use.

### The Problem: JSON Schema Bloat

When you use function calling with any LLM, the API sends full JSON Schema definitions:

```json
{
  "type": "function",
  "function": {
    "name": "read_file",
    "description": "Read the contents of a file from the local filesystem. The file_path parameter must be an absolute path...",
    "parameters": {
      "type": "object",
      "properties": {
        "file_path": {
          "type": "string",
          "description": "The absolute path to the file to read"
        },
        "offset": { "type": "number" },
        "limit": { "type": "number" }
      },
      "required": ["file_path"]
    }
  }
}
```

Now multiply that by 16 tools. Every turn. At production scale (100k calls/day), the schema overhead alone costs **>$30,000/month**.

### The Fix: TSCG Compression

```bash
npm install @tscg/core
```

```typescript
import { compress } from '@tscg/core';

const result = compress(tools, {
  model: 'claude-sonnet',
  profile: 'balanced'
});

console.log(result.metrics.tokens.savingsPercent); // ~72%
```

TSCG applies 8 formally-defined transforms grounded in how causal transformers actually process tokens:

1. **TAS** (Tokenizer-Aligned Syntax): `->` (2 tokens) becomes `->` (1 Unicode token)
2. **CFL** (Constraint-First Layout): put output constraints at position 0 where the attention sink amplifies them
3. **SDM** (Semantic Density Maximization): remove 104+ filler patterns ("please", "in order to", etc.)
4. **DRO** (Delimiter-Role Optimization): `"the following items"` becomes compact enumeration markers
5. **CFO** (Causal-Forward Ordering): reorder operations into causal dependency chains
6. **CAS** (Causal Access Score): score parameters by fragility, put critical ones at attention hotspots
7. **CCP** (Causal Closure Principle): append key information at the end (recency bias)
8. **SAD-F** (Selective Anchor Duplication): budget-constrained duplication of critical parameters

### The Benchmark: ~13,000 API Calls, 12 Models

We built TAB (TSCG-Agentic-Bench) -- the first benchmark measuring how tool-schema compression affects LLM tool-use performance:

| Scenario | Focus | Result |
|----------|-------|--------|
| A: Claude Code | 16 real tools | +10.9pp text-mode, 50% savings |
| B: MCP Servers | 43 protocol tools | +5.3pp, 65% savings |
| D: Small Models | 7 models, 3-50 tools | 0-49% -> 65-90% accuracy |
| BFCL | External validation | 108% ARR (improves accuracy!) |
| GSM8K | Reasoning preservation | ~4.5pp advantage under load |

### The "Aha" Moment: Format Translation vs Compression

This is the finding that changed the paper's entire framing.

We ran E4 (2,940 Ollama calls across 6 small models) to decompose TSCG's gains into two components:

- **Format gain**: difference between text-baseline and JSON-baseline (just changing format)
- **Compression gain**: difference between TSCG and text-baseline (structural compression)

The result:

| Model | Format Gain | Compression Gain | Class |
|-------|------------|-----------------|-------|
| Phi-4 14B | +92.0pp | -7.0pp | Format-dominated |
| Mistral 7B | +44.6pp | -7.4pp | Format-dominated |
| Gemma 3 4B | +47.3pp | -8.9pp | Format-dominated |
| Llama 3.1 8B | +5.6pp | +0.3pp | Neutral |

**No small model shows genuine compression benefit.** The dramatic improvements (Phi-4: 0% -> 90%) are entirely from format translation -- converting JSON to structured text.

But here's why that matters: **every production API transmits JSON**. OpenAI Function Calling, Anthropic Tool Use, MCP, LangChain -- all JSON. The JSON format is what makes small models fail, and TSCG's implicit format translation is exactly the needed intervention.

For frontier models (Claude, GPT-4o, GPT-5.2), the story is different: genuine +5-11pp structural compression persists when you eliminate the format confound. These models benefit from CAS reordering, CFL constraint positioning, and SDM density optimization.

### The Predictive Model

One regression captures the entire taxonomy:

```
Delta_TSCG = -0.93 * Accuracy_JSON + 0.76    (R²=0.88)
```

Against text baselines? R² collapses to **0.03** (not significant). The JSON-baseline R² measures format sensitivity, not compression benefit.

### 4-Class Taxonomy

| Class | Models | Recommendation |
|-------|--------|---------------|
| 1: Format-dominated | Phi-4, Mistral 7B, Gemma 4B, Qwen3 4B | Conservative profile |
| 2: Compression | Claude, GPT-4o, GPT-5.2 | Balanced profile |
| 3: Neutral | Llama 8B, Gemma 12B, Mistral-Sm 24B | Conservative (safe) |
| 4: Conservative-only | Qwen3 14B, Qwen2.5-Coder 32B | Conservative **only** |

The Qwen finding is interesting: balanced TSCG *hurts* Qwen models (-6.6pp), but conservative mode (filler removal only) *helps* (+4.4pp). This persists from 14B to 32B -- it's architectural sensitivity to structural transforms, not a capacity issue.

### Naive Truncation Honesty

A natural question: why not just strip descriptions entirely?

At 16 well-known tools (like Claude Code's Bash/Read/Write), naive truncation matches TSCG: 87.0% vs 87.8%. Claude recognizes tools by name alone.

At 50 tools with ambiguous names, TSCG achieves 100% while naive truncation drops to 98.5%, with the gap concentrated in multi-tool sequencing (87.5% vs 75.0%). Descriptions matter when tools are similar.

### Get Started

```bash
npm install @tscg/core
```

- **Zero dependencies**, <1ms execution, 27.7KB bundle
- ~40,000x faster than LLMLingua-2 (42.5s vs <1ms)
- Works with OpenAI, Anthropic, MCP, LangChain formats
- Fully deterministic

- GitHub: https://github.com/SKZL-AI/tscg
- npm: [@tscg/core](https://www.npmjs.com/package/@tscg/core)
- Paper: [arXiv link]

Paper submitted to EMNLP 2026. All benchmark data and code are open-source.

---

*TSCG is MIT licensed. Contributions welcome.*
