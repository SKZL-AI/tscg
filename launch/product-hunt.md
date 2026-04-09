# Product Hunt Launch Draft

## Product Name

TSCG -- Tool-Schema Compression Grammar

## Tagline

Save 71.7% on LLM tool-calling tokens. Zero dependencies. <1ms.

## Description

### Problem

Every time an AI agent uses tools (function calling), the LLM receives full JSON Schema definitions for every available tool. Claude Code sends ~50,000 tokens of tool boilerplate per turn. GPT agents, LangChain apps, MCP integrations -- they all pay this overhead tax on every single request.

### Solution

TSCG is a deterministic compiler that compresses tool schemas by 71.7% while maintaining 100% tool-calling accuracy. It works by applying 8 formally-defined principles grounded in transformer architecture: causal attention optimization, BPE tokenizer alignment, and redundancy elimination.

### Key Features

- **71.7% token savings** on tool definitions, verified across 6 benchmark scenarios
- **100% accuracy retention** on Berkeley Function-Calling Leaderboard tasks
- **Small model unlock** -- 7B parameter models can now handle 50+ tools
- **Zero dependencies** -- pure TypeScript compiler, 14.9KB ESM bundle
- **<1ms compression** -- no GPU, no secondary model, no network calls
- **Works everywhere** -- OpenAI, Anthropic, MCP, LangChain, Vercel AI SDK
- **Deterministic** -- same input always produces the same output
- **Browser compatible** -- runs in Node.js, Deno, Bun, and browsers

### How It Works

```typescript
import { compress } from '@tscg/core';

const result = compress(myTools, { model: 'claude-sonnet' });
// 50K tokens -> 14K tokens, same accuracy
```

TSCG transforms verbose JSON Schema tool definitions into compact representations that LLMs understand just as well (or better) than the originals. It exploits the fact that models have seen abbreviated type formats millions of times in training data.

### Who Is This For

- **AI agent builders** -- reduce costs on every tool-calling request
- **Claude Code users** -- cut context overhead by 71.7%
- **Small model operators** -- unlock tool use on 7B/8B models running locally
- **API-heavy applications** -- significant cost savings at scale
- **MCP server developers** -- compress tool lists transparently

## Makers

SAI Sakizli

## Topics

- Artificial Intelligence
- Developer Tools
- Open Source
- API

## Pricing

Free -- MIT License

## Links

- Website: https://github.com/SKZL-AI/tscg
- npm: https://www.npmjs.com/package/@tscg/core

## Gallery Images (Suggested)

1. Before/after comparison of tool schema (JSON vs TSCG compressed)
2. Bar chart: Token savings across 6 benchmark scenarios
3. Line chart: Small model accuracy with/without TSCG at different tool counts
4. Code example: 5-line integration with any framework
5. Architecture diagram: TSCG 8 principles pipeline

## Launch Day Checklist

- [ ] GitHub repo public and README polished
- [ ] npm packages published (@tscg/core, @tscg/tool-optimizer)
- [ ] Demo GIF or video showing compression in action
- [ ] First comment prepared (founder story / motivation)
- [ ] arXiv paper link ready
- [ ] Respond to comments within first 2 hours
