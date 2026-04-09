# Contributing to TSCG

Thank you for your interest in contributing to TSCG.

## Development Setup

```bash
git clone https://github.com/SKZL-AI/tscg.git
cd tscg
npm install
npm run build
npm test
```

**Requirements:** Node.js >= 18.0.0

## Project Structure

```
src/
  optimizer/     # Core transforms (SDM, DRO, CAS, TAS, CFL, CFO, CCP, SAD-F)
  compiler/      # NL-to-TSCG compilation
  core/          # Types, providers, rate-limiter
  benchmark/     # Test cases and runner
cli/             # Unified CLI entry point
packages/
  core/          # @tscg/core npm package
  tool-optimizer/# @tscg/tool-optimizer npm package
paper/           # Academic paper (LaTeX)
benchmark/       # Benchmark data and analysis
```

## Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Type checking
npm run typecheck
```

## Code Style

- TypeScript strict mode
- Zero external runtime dependencies in core
- ESM modules (ES2022 target)
- Deterministic transforms: same input must always produce same output

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-change`)
3. Make your changes
4. Run `npm test` and ensure all tests pass
5. Run `npm run typecheck` with no errors
6. Submit a pull request with a clear description

## Adding a New Transform

If you want to add a new compression principle:

1. Add the transform function in `src/optimizer/transforms.ts`
2. Register it in the optimizer pipeline (`src/optimizer/optimizer.ts`)
3. Add test cases in `tests/`
4. Document the principle in the paper if applicable

## Reporting Issues

Please use [GitHub Issues](https://github.com/SKZL-AI/tscg/issues) to report bugs or suggest features. Include:

- Steps to reproduce
- Expected vs actual behavior
- Node.js version
- TSCG version

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
