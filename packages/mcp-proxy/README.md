# @tscg/mcp-proxy

[![npm version](https://img.shields.io/npm/v/@tscg/mcp-proxy)](https://www.npmjs.com/package/@tscg/mcp-proxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)

**Transparent TSCG compression proxy for MCP tool servers.** Sits between any MCP client (Claude Code, Cursor, Windsurf) and your downstream MCP servers, compressing tool descriptions to reduce token overhead.

- Zero config changes to downstream servers
- Native JSON Schema preserved (description-only mode)
- ~25--40% token savings on tool descriptions
- Full-text TSCG mode available (~50--72% savings)
- Multi-server routing with per-tool metrics
- Auto-profile: disables harmful operators at scale (>=30 tools)

Part of the [TSCG](https://github.com/SKZL-AI/tscg) ecosystem -- backed by a peer-reviewed study with ~15,000 API calls across 12 models.

## Install

```bash
npm install @tscg/mcp-proxy
# peer dependency:
npm install @tscg/core
```

## Usage with Claude Code

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "tscg-proxy": {
      "command": "npx",
      "args": ["@tscg/mcp-proxy"],
      "env": {
        "TSCG_MODE": "description-only",
        "TSCG_PROFILE": "balanced",
        "TSCG_DOWNSTREAM_SERVERS": "[{\"id\":\"filesystem\",\"command\":\"npx\",\"args\":[\"-y\",\"@modelcontextprotocol/server-filesystem\",\"/tmp\"]}]"
      }
    }
  }
}
```

That's it. The proxy intercepts `tools/list` responses, compresses descriptions using TSCG, and forwards `tools/call` requests unchanged.

## Configuration (ENV)

| Variable | Default | Description |
|----------|---------|-------------|
| `TSCG_MODE` | `description-only` | `description-only` preserves JSON Schema, `full` applies all 8 TSCG operators |
| `TSCG_PROFILE` | `balanced` | `conservative`, `balanced`, `aggressive`, or `auto` |
| `TSCG_MODEL` | `claude-sonnet` | Target model for tokenizer-aligned optimization |
| `TSCG_DOWNSTREAM_SERVERS` | `[]` | JSON array of downstream MCP server configs |

### Downstream Server Config

Each entry in `TSCG_DOWNSTREAM_SERVERS`:

```json
{
  "id": "unique-server-id",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  "env": { "OPTIONAL_ENV": "value" }
}
```

## Compression Modes

### Description-Only (default, recommended)

Compresses `.description` fields while keeping JSON Schema intact. Compatible with all native tool-calling APIs (OpenAI, Anthropic, Google). No changes to how models invoke tools.

```
TSCG_MODE=description-only
```

### Full TSCG

Applies all 8 operators (SDM, TAS, DRO, CFL, CFO, CAS, SAD-F, CCP) to produce maximally compressed text-format schemas. Higher savings but requires TSCG-aware parsing.

```
TSCG_MODE=full
```

## Auto Profile (v1.4.0)

When `TSCG_PROFILE=auto`, the proxy selects compression principles based on the total tool count across all downstream servers:

| Tool Count | Behavior |
|------------|----------|
| <=20 | Conservative profile |
| 21--40 | Balanced without CFL/CFO |
| >40 | Conservative (safety default) |

CFL and CFO are automatically disabled at >=30 tools in balanced mode -- these operators become harmful at scale (validated across 100-tool catalogs).

## How It Works

```
MCP Client (Claude Code)
    |
    |  stdio
    v
@tscg/mcp-proxy
    |
    |  Intercepts tools/list -> compresses descriptions
    |  Forwards tools/call -> routes to correct server
    |
    v
Downstream MCP Servers (filesystem, github, database, ...)
```

1. On startup, the proxy spawns all configured downstream servers via stdio
2. It collects `tools/list` from each server and merges them
3. Tool descriptions are compressed using `@tscg/core`
4. The compressed tool list is served to the MCP client
5. When `tools/call` arrives, the router resolves which downstream server owns the tool and forwards the request

## Programmatic API

```typescript
import { createTSCGProxy, TSCGProxyConfig } from '@tscg/mcp-proxy';

const config: TSCGProxyConfig = {
  mode: 'description-only',
  profile: 'balanced',
  model: 'claude-sonnet',
  servers: [
    { id: 'fs', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] }
  ]
};

const proxy = createTSCGProxy(config);
await proxy.start();
```

## Metrics

The proxy tracks per-tool compression metrics:

```typescript
import { MetricsCollector } from '@tscg/mcp-proxy';

const metrics = new MetricsCollector();
// After compression:
metrics.record(compressionResult);
console.log(metrics.summary());
// { totalTools: 47, avgSavingsPercent: 34.2, totalOriginalTokens: 12400, totalCompressedTokens: 8160 }
```

## Tests

```bash
npm test
# 49 tests across 3 suites:
#   router.test.ts — multi-server routing, deduplication
#   compressor.test.ts — description-only + full mode, SDM patterns
#   config-metrics-autoprofile.test.ts — ENV parsing, metrics, auto-profile
```

## Related

- [`@tscg/core`](https://www.npmjs.com/package/@tscg/core) -- Core compression engine
- [TSCG Paper](https://github.com/SKZL-AI/tscg/blob/main/TSCG-paper.pdf) -- Full research paper (~15,000 API calls, 12 models)
- [GitHub](https://github.com/SKZL-AI/tscg) -- Source code and documentation

## License

[MIT](../../LICENSE)
