# Changelog

## [1.4.2] - 2026-04-26

### Changed — Umbrella Version Sync
- Synchronized release with @tscg/core@1.4.2, @tscg/mcp-proxy@1.4.2, @tscg/openclaw@1.4.2
- No functional changes to @tscg/tool-optimizer in this release

## [1.4.1] - 2026-04-21

### Changed — Umbrella Version Sync
- Synchronized under new umbrella-versioning scheme with @tscg/core@1.4.1 and @tscg/mcp-proxy@1.4.1
- Version jump from 1.2.0 → 1.4.1 is cosmetic (monorepo version unification) — no functional changes, no API changes, no breaking changes

### Rationale
Starting with v1.4.1, all `@tscg/*` packages use lockstep/umbrella versioning. This simplifies dependency management: if you install `@tscg/core@1.4.1`, you know `@tscg/mcp-proxy@1.4.1` and `@tscg/tool-optimizer@1.4.1` are the matching versions. Future releases advance all three packages together.

### Unchanged
- LangChain integration
- MCP integration
- Vercel AI SDK integration
- Public API — fully backward-compatible with 1.2.0
