# X/Twitter Thread Draft

## Thread: TSCG Benchmark Results

---

### Tweet 1/10

Claude Code sends ~50,000 tokens of tool definitions EVERY TURN.

That is 40 pages of JSON Schema boilerplate describing tools the model has seen millions of times.

I built TSCG to compress this by 71.7%.

Here is what our benchmark found:

[thread]

---

### Tweet 2/10

TSCG = Tool-Schema Compression Grammar

8 compression principles grounded in how transformers actually work:
- Causal attention mask directionality
- BPE tokenizer alignment
- Attention sink phenomenon at position 0

Not prompt hacking. Formal compiler theory applied to LLM prompts.

---

### Tweet 3/10

Results on frontier models:

Claude 4 Sonnet: 71.7% savings, 100% accuracy
GPT-5.2: 71.2% savings, 98.5% accuracy
Gemini 2.5 Flash: 70.8% savings, 97.5% accuracy

Same tool-calling performance. Fraction of the tokens.

---

### Tweet 4/10

But the real story is small models.

7B parameter models CHOKE on large tool catalogs. Give Qwen3-8B 50 tools and accuracy drops off a cliff.

With TSCG compression? They handle 50 tools at the accuracy they used to need 15 for.

This unlocks local, private AI agents on consumer hardware.

---

### Tweet 5/10

We built TAB (Tool-Aware Benchmark) to test this rigorously:

6 scenarios:
- Frontier model comparison
- Small model scaling (10/25/50 tools)
- Claude Code simulation (77 tools)
- GSM8K reasoning impact
- MCP aggregation (50 tools, 5 servers)
- BFCL accuracy retention

---

### Tweet 6/10

The GSM8K result surprised us:

When you load 50 tool definitions alongside math problems, reasoning accuracy DROPS.

Context pollution is real.

TSCG compression reduces tool overhead -> less context pollution -> BETTER math scores.

Less tokens = better reasoning.

---

### Tweet 7/10

BFCL (Berkeley Function-Calling Leaderboard) result:

99.5% accuracy retention at 71.7% token savings.

Broken down:
- Single tool selection: 100%
- Multi-tool: 98%
- Parameter extraction: 100%
- No-tool detection: 100%

---

### Tweet 8/10

How is this different from LLMLingua?

LLMLingua: Uses a secondary LLM, non-deterministic, requires GPU, Python only

TSCG: Pure compiler, deterministic, <1ms, 14.9KB, runs in browser, zero dependencies

Different tools for different jobs. TSCG is purpose-built for tool schemas.

---

### Tweet 9/10

It is an npm package you can use today:

```
npm install @tscg/core
```

Works with:
- OpenAI function calling
- Anthropic tool use
- MCP servers
- LangChain
- Vercel AI SDK

14.9KB. Zero deps. MIT license.

---

### Tweet 10/10

Paper formalizing the theory is going on arXiv.

Code, benchmark, and npm package:
https://github.com/SKZL-AI/tscg

If you are building AI agents and paying for tool tokens, give it a try. Your API bill will thank you.

---

## Suggested Media

- Tweet 1: Screenshot of Claude Code tool token count
- Tweet 3: Bar chart of savings by model
- Tweet 4: Line chart of small-model accuracy vs. tool count (with/without TSCG)
- Tweet 6: GSM8K accuracy comparison chart
- Tweet 7: BFCL category breakdown table
- Tweet 9: Code snippet screenshot with syntax highlighting
