# TSCG Production Deployment Metrics — MCP-Proxy, Latency, Multi-Agent

**Author:** Furkan Sakizli, SKZL-AI
**Date:** April 2026
**Total benchmark calls:** ~1,500
**Repository:** [github.com/SKZL-AI/tscg](https://github.com/SKZL-AI/tscg)

---

## Executive Summary

Beyond accuracy and token savings, TSCG delivers measurable production benefits: 6-28% end-to-end latency reduction (scaling with tool count), $18,902/month cost savings at production scale via MCP-Proxy, and +26.7pp accuracy improvement in multi-agent architectures. These metrics come from controlled benchmarks simulating real deployment conditions.

---

## 1. End-to-End Latency Reduction

### Methodology

Measured total round-trip time (prompt encoding + inference + response decoding) for tool selection tasks across varying tool counts. Each measurement is averaged over 50 runs with warm model cache.

### Results

| Tool Count | Baseline Latency | TSCG Latency | Reduction | Token Savings |
|------------|-----------------|-------------|-----------|---------------|
| 10 tools | 1,240ms | 1,161ms | **-6.4%** | 44.1% |
| 16 tools | 1,680ms | 1,474ms | **-12.3%** | 52.7% |
| 43 tools | 3,120ms | 2,474ms | **-20.7%** | 63.4% |
| 100 tools | 5,840ms | 4,199ms | **-28.1%** | 71.2% |

### Analysis

Latency reduction is approximately linear with token savings because:
- Prompt encoding time scales linearly with token count
- KV-cache allocation is proportional to input length
- TSCG compression is deterministic and adds <2ms overhead (no LLM calls, no network requests)

The 2ms compression overhead is negligible compared to the 600-1,600ms saved on prompt processing.

---

## 2. MCP-Proxy Production Metrics

### What is MCP-Proxy?

The @tscg/mcp-proxy package is a transparent compression proxy for the Model Context Protocol (MCP). It sits between an MCP client and downstream MCP servers, automatically compressing tool schemas in `tools/list` responses before they reach the LLM.

### Architecture

```
MCP Client (e.g., Claude Desktop)
    ↓ tools/list response (compressed)
@tscg/mcp-proxy
    ↓ tools/list response (original)
Downstream MCP Server(s)
```

### Cost Savings at Scale

Based on measured token savings and published API pricing (April 2026):

| Scale | Daily Calls | Monthly Token Savings | Monthly Cost Savings |
|-------|-------------|----------------------|---------------------|
| Small | 1,000/day | 4.2M tokens | $189 |
| Medium | 10,000/day | 42M tokens | $1,890 |
| Large | 100,000/day | 420M tokens | **$18,902** |
| Enterprise | 1,000,000/day | 4.2B tokens | $189,024 |

### Performance Overhead

| Metric | Value |
|--------|-------|
| Compression latency | < 2ms per request |
| Memory usage | < 5MB |
| CPU overhead | Negligible (deterministic string operations) |
| Failure mode | Graceful fallback to uncompressed tools |

### 480-Call Benchmark (v1.4.1)

The MCP-Proxy was validated with a 480-call production-simulation benchmark:
- 4 models (Claude Sonnet 4, GPT-4o, GPT-5.2, Opus 4.7)
- 4 tool counts (10, 16, 43, 100)
- 3 MCP scenarios (single server, multi-server, filtered)
- Result: All accuracy metrics within 2pp of direct TSCG benchmarks, confirming proxy transparency

---

## 3. Multi-Agent Architecture

### Sequential Multi-Agent Pattern

In architectures where Agent A selects tools and Agent B executes them:

| Metric | Without TSCG | With TSCG | Delta |
|--------|-------------|-----------|-------|
| Agent A accuracy | 68.3% | 95.0% | +26.7pp |
| Token cost (Agent A) | 8,200 tokens | 3,726 tokens | -54.6% |
| Total pipeline accuracy | 61.5% | 90.3% | +28.8pp |

### Why Multi-Agent Benefits More

In multi-agent setups, TSCG's benefits compound:
1. Agent A gets cleaner tool schemas, improving selection accuracy
2. Agent B receives already-validated tool selections, reducing error propagation
3. Both agents save tokens, reducing total pipeline cost

---

## 4. RAG Synergy

When TSCG is combined with RAG (Retrieval-Augmented Generation), the token savings stack:

| Component | Token Savings |
|-----------|---------------|
| RAG document compression | 40-60% on document tokens |
| TSCG tool compression | 56-72% on tool tokens |
| Combined | 59.3% additional reduction on tool portion |

The savings are additive because TSCG operates on tool schemas (structured data) while RAG compression operates on document content (unstructured text). There is no ceiling effect between the two.

---

## 5. Deployment Recommendations

### Conservative (Zero-Risk)

Use SDM-only profile for guaranteed safety:
- 30-40% token savings
- 0pp accuracy impact (confirmed across all 13 models)
- No per-model tuning required

### Balanced (Recommended)

Run per-model sweep first, then deploy optimal profile:
```bash
npx tscg-openclaw tune --sweep --model your-model
```
- 50-65% token savings
- < 2pp accuracy impact
- One-time ~$1 setup cost

### Maximum Savings

Use full (600-call) benchmark for production-critical applications:
```bash
npx tscg-openclaw tune --model your-model --full
```
- 56-72% token savings
- Statistical confidence on accuracy impact
- One-time ~$20 setup cost

---

## Citation

```
Sakizli, F. (2026). Tool-Schema Compression Grammar: Deterministic Schema Optimization
for LLM Tool Use. TSCG v1.4.2 Empirical Report. https://github.com/SKZL-AI/tscg
```
