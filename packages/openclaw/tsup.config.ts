import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/benchmark-harness.ts',
    'src/cli.ts',
    'bin/tscg-openclaw.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  // Disable code splitting — each entry is fully self-contained.
  // This prevents shared chunks that leak API-provider code (from
  // benchmark-harness) into the plugin entry, which would trigger
  // OpenClaw's credential-harvesting safety scanner.
  splitting: false,
  // Bundle @tscg/core into dist so the OpenClaw plugin is self-contained.
  // Without this, openclaw plugins install would fail because the plugin
  // installer extracts the tarball but does NOT run npm install.
  noExternal: ['@tscg/core'],
});
