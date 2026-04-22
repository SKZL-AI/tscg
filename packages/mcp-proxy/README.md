# @tscg/mcp-proxy

[![npm](https://img.shields.io/npm/v/@tscg/mcp-proxy)](https://www.npmjs.com/package/@tscg/mcp-proxy)

Transparent MCP middleware -- compiles tool schemas into token-efficient representations at the API boundary. No client or server changes required.

## Quick Start -- Zero-Config for Claude Models (Recommended)

```bash
# Opus 4.7 -- auto-optimized, 55-59% savings, +2.5 to +7.5pp accuracy
npx @tscg/mcp-proxy --target=claude-opus-4-7 --server=<your-mcp-command>

# Sonnet 4 -- auto-optimized, 55-59% savings
npx @tscg/mcp-proxy --target=claude-sonnet-4 --server=<your-mcp-command>
```

**Setting `--target` automatically activates the full compression pipeline** (`mode=full`, `profile=balanced`, all operators). No other flags needed.

Validated by 720-call E2E benchmark (April 2026):

### Claude Opus 4.7
| Tool Count | Baseline | TSCG | Delta Accuracy | Token Savings |
|------------|----------|------|----------------|---------------|
| 16 | 70.0% | **77.5%** | +7.5pp | 55.7% |
| 43 | 77.5% | **80.0%** | +2.5pp | 58.7% |
| 50 | 72.5% | **80.0%** | +7.5pp | 58.2% |

### Claude Sonnet 4
| Tool Count | Baseline | TSCG | Delta Accuracy | Token Savings |
|------------|----------|------|----------------|---------------|
| 16 | 77.5% | 80.0% | +2.5pp | 55.7% |
| 43 | 85.0% | 80.0% | -5.0pp | 58.7% |
| 50 | 77.5% | 77.5% | +/-0.0pp | 58.2% |

n=40 per cell, 2 seeds, deterministic tokenizer-aware compression.

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

Without `--target`: runs in safe default (description-only compression, conservative profile, zero regression guarantee). Identical behavior to v1.0.1.

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
