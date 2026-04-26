# Changelog

## [1.4.2] - 2026-04-26

### Added — Adaptive Profile Resolution
- **NEW:** `cacheReader` parameter on `resolveModelProfile()` and `compressMCPToolsFull()` — allows @tscg/openclaw adaptive profiles (from `tune --sweep`) to override static profiles at runtime
- **NEW:** GPT-5.4 static profile: config-robust archetype, SDM excluded, CFO enabled (+15pp), derived from 440-call Step 5.8/5.8.1 benchmark
- **NEW:** GPT-5.5 static profile: combination-fragile archetype, SDM-only conservative, derived from 440-call Step 5.8/5.8.1 benchmark

### Profile Resolution Order (v1.4.2)
1. `cacheReader` adaptive profile (from openclaw sweep cache)
2. Exact match in MODEL_PROFILES (static)
3. Loose alias resolution
4. `auto` safe fallback (SDM-only)

### Backward Compatibility
The `cacheReader` parameter is optional. Existing callers without it behave identically to v1.4.1.

## [1.4.1] - 2026-04-21

### Major Feature -- Per-Model Target Resolution
- **NEW:** `target` config for known models: `claude-opus-4-7`, `claude-sonnet-4`, `gpt-5.2`, `auto`
- **NEW:** `mode: 'full'` uses complete @tscg/core compress() pipeline with per-model optimized operator set
- **NEW:** CLI flags `--target=<model>` and `--mode=<full|description-only|off>`
- **NEW:** Environment variables `MCP_PROXY_TARGET` and `MCP_PROXY_MODE`
- **NEW:** Exported helpers: `resolveModelProfile()`, `resolveEffectiveMode()`, `compressMCPToolsFull()`

### Default Behavior -- Zero-Config for Claude Models
Setting `--target=claude-*` (without explicit `--mode`) now auto-enables `mode='full'` with balanced profile. Users running `npx @tscg/mcp-proxy --target=claude-opus-4-7` get optimized 55-59% savings immediately. Previous default (description-only + conservative) remains for calls without target.

### Validated by 720-Call E2E Benchmark
With `--target=claude-opus-4-7 --mode=full`:
- 16 tools: +7.5pp accuracy, 55.7% char savings
- 43 tools: +2.5pp accuracy, 58.7% char savings
- 50 tools: +7.5pp accuracy, 58.2% char savings

With `--target=claude-sonnet-4 --mode=full`:
- Consistent 55-59% savings, accuracy within -5 to +2.5pp of baseline

### Versioning -- Umbrella Sync
Version jump 1.0.1 -> 1.4.1 is intentional: synchronized release with @tscg/core@1.4.1 and @tscg/tool-optimizer@1.4.1 under new umbrella-versioning scheme. Versions 1.1-1.3 were not published for this package.

### Backward Compatibility -- Zero Breaking Changes
`createProxy({})` and `npx @tscg/mcp-proxy` without any flags continues to work exactly as in v1.0.1 -- description-only mode, conservative profile, zero regression guarantee. The legacy `mode: 'full-text'` value is accepted and mapped to `'full'` at runtime.

## [1.0.1] - 2026-04-19

### Fixed
- Peer dependency range for @tscg/core

## [1.0.0] - 2026-04-07

### Added
- Initial release
- stdio MCP proxy with transparent TSCG compression
- Description-only and full-text compression modes
- Auto-profile resolution based on tool count
- Metrics collection per downstream server
