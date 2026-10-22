# @tscg/mcp-proxy

[![npm](https://img.shields.io/npm/v/@tscg/mcp-proxy)](https://www.npmjs.com/package/@tscg/mcp-proxy)

Transparent MCP middleware -- compiles tool schemas into token-efficient representations at the API boundary. No client or server changes required.

## Quick Start -- Zero-Config for Claude Models (Recommended)

```bash
# Opus 4.7 target profile
npx @tscg/mcp-proxy --target=claude-opus-4-7 --server=<your-mcp-command>

# Sonnet 4 target profile
npx @tscg/mcp-proxy --target=claude-sonnet-4 --server=<your-mcp-command>
```

**Setting `--target` automatically activates the full compression pipeline** (`mode=full`, `profile=balanced`, all operators). No other flags needed.

## Published evidence

See [Paper 1 and Paper 2 with exact measurement provenance](../../docs/PUBLISHED-RESULTS.md). Paper 1 Table 16 reports Opus 4.7 on 43 heavy production MCP schemas at 75.0% → 80.0%, +5.0 pp, 56.6% token savings. This is a `json-text` vs `v13-smart` experiment, not a measurement of every proxy invocation. The former 720-call software benchmark tables are not established by the published tables and have been removed from the current research summary.

Description-only mode preserves native tool schemas and requires existing model/provider tool support. Phi-4 14B lacks native tool calling in the tested Ollama deployment: its TAB enablement uses compiled text plus host-side parsing and execution. It is not a Phi-4 BFCL score or a guarantee that an MCP proxy alone adds native tool calling.

## Supported Targets

| Target            | Archetype     | Operators active | Best for                  |
|-------------------|---------------|------------------|---------------------------|
| `claude-opus-4-7` | Hungry        | All 8            | Opus 4.7 deployments      |
| `claude-sonnet-4` | Robust        | All 8            | Sonnet 4 deployments      |
| `gpt-5.2`         | Sensitive     | 7 (no CFO)       | GPT-5.2 deployments       |
| `auto` (default)  | Safe fallback | SDM only         | Unknown models, max safety |

## Legacy Mode (Backward Compatible with v1.0.x)

```bash
npx @tscg/mcp-proxy --server=<your-mcp-command>
```

Without `--target`: runs in default (description-only compression, conservative profile). Identical behavior to v1.0.1.

## Programmatic Usage

```typescript
import { createProxy, resolveModelProfile, resolveEffectiveMode } from '@tscg/mcp-proxy';

// Zero-config for Claude models
const proxy = createProxy({ target: 'claude-opus-4-7' });

// Check resolved profile
const profile = resolveModelProfile('claude-opus-4-7');
console.log(profile.archetype); // 'hungry'
console.log(profile.operators); // { sdm: true, tas: true, ... }

// Check effective mode
const mode = resolveEffectiveMode({ target: 'claude-opus-4-7' });
console.log(mode); // 'full'
```

## Configuration

| Setting | CLI Flag | Env Var | Default |
|---|---|---|---|
| Target model | `--target=<model>` | `MCP_PROXY_TARGET` | `auto` |
| Compression mode | `--mode=<full\|description-only\|off>` | `MCP_PROXY_MODE` | auto-resolved |

**Default-mode resolution:**
- `target` set + `mode` unset -> `mode=full` (optimized, recommended)
- `target` unset + `mode` unset -> `mode=description-only` (legacy safe)
- `mode` set explicitly -> respected (overrides target inference)

## Claude Code Integration

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "tscg-proxy": {
      "command": "npx",
      "args": ["@tscg/mcp-proxy", "--target=claude-opus-4-7"],
      "env": {
        "TSCG_DOWNSTREAM_SERVERS": "[{\"id\":\"fs\",\"command\":\"npx\",\"args\":[\"-y\",\"@modelcontextprotocol/server-filesystem\",\"/tmp\"]}]"
      }
    }
  }
}
```

## Related Packages

- [`@tscg/core`](https://www.npmjs.com/package/@tscg/core) -- Core compression engine (8 operators)
- [`@tscg/tool-optimizer`](https://www.npmjs.com/package/@tscg/tool-optimizer) -- LangChain, MCP, Vercel AI SDK integrations

All three `@tscg/*` packages use umbrella versioning (same version, released together).

## License

MIT
