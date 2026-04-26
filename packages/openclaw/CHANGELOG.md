# Changelog

## [1.4.3] - 2026-04-27

### Fixed — Dependency Metadata Hotfix
- Replaced `workspace:*` and `file:../core` dependency refs with proper npm version refs (`^1.4.3`)
- v1.4.2 published with workspace refs which broke `npm install` for end users
- All hardcoded version strings updated to 1.4.3

### Migration
Drop-in replacement for v1.4.2. No code changes, only dependency metadata fixes.

## [1.4.2] - 2026-04-26

### Added — Per-Operator Adaptive Sweep
- **NEW:** `tune --sweep` CLI command — runs 9-condition per-operator isolation sweep (baseline-no-ops + 8 single-operator probes, 180 calls, ~$1)
- **NEW:** `selectOptimalProfile()` — derives optimal operator set from per-operator deltas with ±2.5pp classification thresholds (helpful/neutral/harmful)
- **NEW:** Combination-fragile detection (Scenario B) — when ≥4 neutral + ≥1 harmful operators detected, falls back to SDM-only conservative with LOW confidence
- **NEW:** `show-profile --verbose` — displays per-operator delta breakdown table from sweep cache data
- **NEW:** `tune --sweep --dry-run` — shows 9-condition plan with cost estimate without executing

### Changed
- Cache schema version bumped to 1.4.2 — adds optional `sweepData` field to `CachedProfile`
- 1.4.1 cache files remain valid (backward-compatible; `sweepData` is optional)
- Cache variant type now includes `'sweep'` alongside `'quick'` and `'full'`

### Empirical Findings (2,000+ benchmark calls)
- GPT-5.4: Config-robust. SDM harmful (-10pp), CFO most helpful (+15pp). Inverts GPT-5.2 pattern.
- GPT-5.5: Combination-fragile. Individual operators helpful/neutral, but combined they regress -7.5pp.
- Operator sensitivity is per-model, not per-vendor-family.
- See `findings/gpt-5x-empirical-characterization-v1.4.2.md` for full write-up.

### Tests
- 6 new test suites (Tests 18-23) for `selectOptimalProfile()` covering: GPT-5.4 robust, GPT-5.5 partial-sensitive, combination-fragile Scenario B, all-neutral, all-helpful, boundary thresholds
- Total: 459+ tests across all packages

## [1.4.1] - 2026-04-25

### Added

- **4-Tier Profile Resolution**: Cache -> Static -> Size-Heuristic -> Fallback with in-memory memoization
- **13 Static Profiles**: Claude (Opus/Sonnet/Haiku), GPT (4/5), Qwen3, Phi4, Llama 3.1, Gemma3, Mistral, DeepSeek-v3, DeepSeek-r1
- **Size Heuristic**: Automatic archetype detection from parameter count (<40B/40-99B/>=100B)
- **Self-Tune Benchmark**: Quick (30 calls) and Full (600 calls) calibration with cost estimation
- **Recommendation Algorithm**: Scoring with savings/accuracy weights, disqualification gates (savings<30%, worst-case delta<-5pp), confidence calibration (HIGH/MEDIUM/LOW)
- **Multi-LLM Providers**: Inline Anthropic, OpenAI, Ollama adapters with retry logic
- **Profile Cache**: SHA-256 indexed disk cache with atomic writes and schema versioning
- **OpenClaw Plugin**: beforeToolsList hook with per-request model resolution and graceful degradation
- **warmCache**: Pre-populate memory cache during plugin init (zero filesystem I/O in hot path)
- **CLI**: 11 commands (tune, list-profiles, show-profile, clear-profile, report, stats, install, uninstall, doctor, help, --version)
- **Stats Tracking**: JSONL-based compression statistics for the `stats` command
- **Skill Package**: SKILL.md with references for self-tuning, benchmarks, model profiles, and troubleshooting
- **Schema Migration**: loadCache handles old/future schema versions gracefully

### Technical Details

- All compression calls specify 8 operator keys explicitly (SDM, TAS, DRO, CFL, CFO, CAS, SAD, CCP) to prevent additive merge issues with @tscg/core
- Consistent use of `sad` operator key (not `sadf`) matching @tscg/core API
- Inline provider implementations (no external HTTP dependencies) for npm portability
- 263+ tests across 8 test files
