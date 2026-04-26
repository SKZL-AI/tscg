# Changelog

## [1.4.3] - 2026-04-27

### Fixed
- Hotfix release: v1.4.2 published with `workspace:*` dependency refs. v1.4.3 has clean npm refs.

## [1.4.2] - 2026-04-26

### Changed — Umbrella Version Sync
- Synchronized release with @tscg/mcp-proxy@1.4.2, @tscg/tool-optimizer@1.4.2, @tscg/openclaw@1.4.2
- No functional changes to @tscg/core in this release

## [1.4.1] - 2026-04-21

### Fixed
- **Regression fix:** Explicit `principles` overrides in compiler options are now respected when `profile === 'balanced'` and `tools.length >= 30`. Previously (in 1.4.0), the CFL/CFO auto-disable safety mechanism would silently override user-provided principles, causing reproduction failures for users attempting to manually enable CFO at large catalog sizes.
- New internal flag `hasExplicitPrinciples` gates the auto-disable: when user passes principles explicitly, their intent wins over the default safety.

### Added
- README: 720-call E2E benchmark results (Opus 4.7 +2.5 to +7.5pp, Sonnet 4 consistent 55-59% savings across 16/43/50 tool counts)
- README: Per-model operator archetypes section documenting Hungry/Robust/Sensitive classifications

### Changed
- Synchronized release with @tscg/mcp-proxy@1.4.1 and @tscg/tool-optimizer@1.4.1 under new umbrella-versioning scheme. Starting with 1.4.1, all three @tscg/* packages advance in lockstep.

### Note for 1.4.0 Users
Users on @tscg/core@1.4.0 who relied on balanced profile's auto-disable safety are unaffected -- the default behavior is unchanged. Only users who explicitly passed `principles` overrides will see the 1.4.1 fix take effect (their overrides are now respected).

## [1.4.0] - 2026-04-19

### Added
- Auto-profile: `profile: 'auto'` selects balanced (<= 10 tools) or conservative (> 10 tools)
- Auto-disable CFL/CFO at >= 30 tools (based on v1.3.0 5,580-call findings)
- `compressDescriptions()` -- description-only compression preserving JSON Schema structure

## [1.3.0] - 2026-04-07

### Added
- TAB (Tool-Aware Benchmark) harness
- 6-scenario evaluation across 12 models (4B-32B + 3 frontier APIs)
- BFCL accuracy retention validation (108-181% ARR)

## [1.2.0] - 2026-03-28

### Added
- Initial public release
- 8 TSCG operators (SDM, TAS, DRO, CFL, CFO, CAS, SAD-F, CCP)
- Multi-model tokenizer profiles (14 model families)
- Conservative, balanced, aggressive profiles
