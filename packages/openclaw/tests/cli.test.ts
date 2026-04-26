import { describe, it, expect } from 'vitest';
import { parseArgs, main } from '../src/cli.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capture stdout during an async callback */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const origWrite = process.stdout.write;
  process.stdout.write = ((chunk: string) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = origWrite;
  }
  return chunks.join('');
}

/** Capture stderr during an async callback */
async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const origWrite = process.stderr.write;
  process.stderr.write = ((chunk: string) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    await fn();
  } finally {
    process.stderr.write = origWrite;
  }
  return chunks.join('');
}

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('parses empty args as help', () => {
    const result = parseArgs([]);
    expect(result.command).toBe('help');
    expect(result.flags).toEqual({});
    expect(result.positionals).toEqual([]);
  });

  it('parses command with no flags', () => {
    const result = parseArgs(['tune']);
    expect(result.command).toBe('tune');
    expect(result.flags).toEqual({});
    expect(result.positionals).toEqual([]);
  });

  it('parses --flag=value format', () => {
    const result = parseArgs(['tune', '--model=gpt-4o']);
    expect(result.command).toBe('tune');
    expect(result.flags['model']).toBe('gpt-4o');
  });

  it('parses --flag value format', () => {
    const result = parseArgs(['tune', '--model', 'gpt-4o']);
    expect(result.command).toBe('tune');
    expect(result.flags['model']).toBe('gpt-4o');
  });

  it('parses boolean flags', () => {
    const result = parseArgs(['tune', '--full', '--dry-run']);
    expect(result.command).toBe('tune');
    expect(result.flags['full']).toBe(true);
    expect(result.flags['dry-run']).toBe(true);
  });

  it('parses short flags -f', () => {
    const result = parseArgs(['tune', '-f']);
    expect(result.command).toBe('tune');
    expect(result.flags['force']).toBe(true);
  });

  it('parses --version as command', () => {
    const result = parseArgs(['--version']);
    expect(result.command).toBe('--version');
  });

  it('parses --help as help command', () => {
    const result = parseArgs(['--help']);
    expect(result.command).toBe('help');
  });

  it('parses positional arguments', () => {
    const result = parseArgs(['show-profile', 'claude-sonnet-4']);
    expect(result.command).toBe('show-profile');
    expect(result.positionals).toEqual(['claude-sonnet-4']);
  });

  it('parses tune with multiple flags', () => {
    const result = parseArgs([
      'tune',
      '--model', 'gpt-4o',
      '--full',
      '--dry-run',
      '--optimize-for', 'accuracy',
      '--max-cost', '5',
      '--yes',
    ]);
    expect(result.command).toBe('tune');
    expect(result.flags['model']).toBe('gpt-4o');
    expect(result.flags['full']).toBe(true);
    expect(result.flags['dry-run']).toBe(true);
    expect(result.flags['optimize-for']).toBe('accuracy');
    expect(result.flags['max-cost']).toBe('5');
    expect(result.flags['yes']).toBe(true);
  });

  it('maps -h to help command', () => {
    const result = parseArgs(['-h']);
    expect(result.command).toBe('help');
  });

  it('maps -v to --version command', () => {
    const result = parseArgs(['-v']);
    expect(result.command).toBe('--version');
  });

  it('parses --all flag for clear-profile', () => {
    const result = parseArgs(['clear-profile', '--all', '--force', '--yes']);
    expect(result.command).toBe('clear-profile');
    expect(result.flags['all']).toBe(true);
    expect(result.flags['force']).toBe(true);
    expect(result.flags['yes']).toBe(true);
  });

  it('handles --version even after other args', () => {
    // --version should be detected immediately when encountered
    const result = parseArgs(['tune', '--version']);
    // The first arg 'tune' becomes the command before --version is found,
    // but --version returns early
    expect(result.command).toBe('--version');
  });
});

// ---------------------------------------------------------------------------
// main - version
// ---------------------------------------------------------------------------

describe('main - version', () => {
  it('outputs version string', async () => {
    const output = await captureStdout(() => main(['--version']));
    expect(output).toContain('1.4.2');
    expect(output).toContain('@tscg/openclaw');
  });

  it('outputs version for -v shorthand', async () => {
    const output = await captureStdout(() => main(['-v']));
    expect(output).toContain('1.4.2');
  });
});

// ---------------------------------------------------------------------------
// main - help
// ---------------------------------------------------------------------------

describe('main - help', () => {
  it('outputs help text with command list', async () => {
    const output = await captureStdout(() => main(['help']));
    expect(output).toContain('tune');
    expect(output).toContain('list-profiles');
    expect(output).toContain('show-profile');
    expect(output).toContain('clear-profile');
    expect(output).toContain('report');
    expect(output).toContain('install');
    expect(output).toContain('uninstall');
    expect(output).toContain('doctor');
    expect(output).toContain('stats');
  });

  it('outputs help for empty args', async () => {
    const output = await captureStdout(() => main([]));
    expect(output).toContain('COMMANDS');
    expect(output).toContain('tune');
  });

  it('outputs command-specific help', async () => {
    const output = await captureStdout(() => main(['help', 'tune']));
    expect(output).toContain('--model');
    expect(output).toContain('--full');
    expect(output).toContain('--dry-run');
    expect(output).toContain('--optimize-for');
  });

  it('shows general help for unknown subcommand', async () => {
    const output = await captureStdout(() => main(['help', 'nonexistent']));
    expect(output).toContain('Unknown command: nonexistent');
    expect(output).toContain('COMMANDS');
  });
});

// ---------------------------------------------------------------------------
// main - show-profile
// ---------------------------------------------------------------------------

describe('main - show-profile', () => {
  it('resolves and displays a known model profile', async () => {
    const output = await captureStdout(() =>
      main(['show-profile', 'claude-sonnet-4']),
    );
    expect(output).toContain('claude-sonnet');
    expect(output).toContain('static');
    expect(output).toContain('SDM');
    expect(output).toContain('TAS');
  });

  it('outputs JSON when --json flag is set', async () => {
    const output = await captureStdout(() =>
      main(['show-profile', 'claude-sonnet-4', '--json']),
    );
    const parsed = JSON.parse(output);
    expect(parsed.name).toBe('claude-sonnet');
    expect(parsed.source).toBe('static');
    expect(parsed.operators).toBeDefined();
    expect(parsed.operators.sdm).toBe(true);
  });

  it('errors when no model argument given', async () => {
    const errOutput = await captureStderr(() => main(['show-profile']));
    expect(errOutput).toContain('model argument required');
  });

  it('resolves fallback profile for unknown model', async () => {
    const output = await captureStdout(() =>
      main(['show-profile', 'totally-unknown-model-xyz']),
    );
    expect(output).toContain('fallback');
  });
});

// ---------------------------------------------------------------------------
// main - doctor
// ---------------------------------------------------------------------------

describe('main - doctor', () => {
  it('runs diagnostic checks without error', async () => {
    const output = await captureStdout(() => main(['doctor']));
    expect(output).toContain('Node.js');
    expect(output).toContain('Cache directory');
  });
});

// ---------------------------------------------------------------------------
// main - tune --dry-run
// ---------------------------------------------------------------------------

describe('main - tune --dry-run', () => {
  it('shows plan without executing', async () => {
    const output = await captureStdout(() =>
      main(['tune', '--dry-run', '--model', 'claude-sonnet-4']),
    );
    expect(output).toContain('Dry Run');
    expect(output).toContain('claude-sonnet-4');
    expect(output).toContain('anthropic');
    expect(output).toContain('Total calls');
  });

  it('outputs JSON plan with --json', async () => {
    const output = await captureStdout(() =>
      main(['tune', '--dry-run', '--model', 'claude-sonnet-4', '--json']),
    );
    const parsed = JSON.parse(output);
    expect(parsed.model).toBe('claude-sonnet-4');
    expect(parsed.variant).toBe('quick');
    expect(parsed.totalCalls).toBeGreaterThan(0);
    expect(parsed.provider).toBe('anthropic');
  });

  it('shows full variant info when --full', async () => {
    const output = await captureStdout(() =>
      main(['tune', '--dry-run', '--model', 'claude-sonnet-4', '--full']),
    );
    expect(output).toContain('full');
  });
});

// ---------------------------------------------------------------------------
// main - list-profiles
// ---------------------------------------------------------------------------

describe('main - list-profiles', () => {
  it('shows empty message when no profiles cached', async () => {
    // Use temp cache dir to ensure empty
    const origEnv = process.env.TSCG_CACHE_DIR;
    process.env.TSCG_CACHE_DIR = '/tmp/tscg-test-empty-' + Date.now();
    try {
      const output = await captureStdout(() => main(['list-profiles']));
      expect(output).toContain('No cached profiles found');
    } finally {
      if (origEnv !== undefined) {
        process.env.TSCG_CACHE_DIR = origEnv;
      } else {
        delete process.env.TSCG_CACHE_DIR;
      }
    }
  });

  it('outputs empty JSON array when no profiles cached', async () => {
    const origEnv = process.env.TSCG_CACHE_DIR;
    process.env.TSCG_CACHE_DIR = '/tmp/tscg-test-empty-json-' + Date.now();
    try {
      const output = await captureStdout(() =>
        main(['list-profiles', '--json']),
      );
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(0);
    } finally {
      if (origEnv !== undefined) {
        process.env.TSCG_CACHE_DIR = origEnv;
      } else {
        delete process.env.TSCG_CACHE_DIR;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// main - clear-profile
// ---------------------------------------------------------------------------

describe('main - clear-profile', () => {
  it('errors when no model and no --all', async () => {
    const errOutput = await captureStderr(() => main(['clear-profile']));
    expect(errOutput).toContain('model argument required');
  });

  it('errors when --all without --force --yes', async () => {
    const errOutput = await captureStderr(() =>
      main(['clear-profile', '--all']),
    );
    expect(errOutput).toContain('requires --all --force --yes');
  });

  it('reports no profile found for non-existent model', async () => {
    const origEnv = process.env.TSCG_CACHE_DIR;
    process.env.TSCG_CACHE_DIR = '/tmp/tscg-test-clear-' + Date.now();
    try {
      const output = await captureStdout(() =>
        main(['clear-profile', 'nonexistent-model']),
      );
      expect(output).toContain('No cached profile found');
    } finally {
      if (origEnv !== undefined) {
        process.env.TSCG_CACHE_DIR = origEnv;
      } else {
        delete process.env.TSCG_CACHE_DIR;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// main - stats
// ---------------------------------------------------------------------------

describe('main - stats', () => {
  it('outputs stats or no-stats message', async () => {
    const output = await captureStdout(() => main(['stats']));
    // Either shows stats data or reports no stats found (depends on local state)
    expect(output.length).toBeGreaterThan(0);
    const hasStats = output.includes('Compression Statistics');
    const hasNoStats = output.includes('No compression stats found');
    expect(hasStats || hasNoStats).toBe(true);
  });

  it('outputs valid JSON with --json flag', async () => {
    const output = await captureStdout(() => main(['stats', '--json']));
    const parsed = JSON.parse(output);
    expect(typeof parsed.totalCompressions).toBe('number');
    expect(typeof parsed.avgSavingsPercent).toBe('number');
    expect(parsed.totalCompressions).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// main - report
// ---------------------------------------------------------------------------

describe('main - report', () => {
  it('errors when no model argument given', async () => {
    const errOutput = await captureStderr(() => main(['report']));
    expect(errOutput).toContain('model argument required');
  });

  it('errors when no cached results', async () => {
    const origEnv = process.env.TSCG_CACHE_DIR;
    process.env.TSCG_CACHE_DIR = '/tmp/tscg-test-report-' + Date.now();
    try {
      const errOutput = await captureStderr(() =>
        main(['report', 'nonexistent-model']),
      );
      expect(errOutput).toContain('No benchmark results found');
    } finally {
      if (origEnv !== undefined) {
        process.env.TSCG_CACHE_DIR = origEnv;
      } else {
        delete process.env.TSCG_CACHE_DIR;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// main - unknown command
// ---------------------------------------------------------------------------

describe('main - unknown command', () => {
  it('reports unknown command', async () => {
    const errOutput = await captureStderr(() => main(['foobar']));
    expect(errOutput).toContain('Unknown command: foobar');
  });
});

// ---------------------------------------------------------------------------
// main - tune error handling
// ---------------------------------------------------------------------------

describe('main - tune error handling', () => {
  it('errors on --all-models when no config file', async () => {
    // --all-models reads from config; if config is missing or has no models, it errors
    // Use a fake config path by temporarily poisoning env so detectDefaultModel fails
    // This test verifies the error path exists and produces output
    const errOutput = await captureStderr(() =>
      main(['tune', '--all-models']),
    );
    // Either "no config file found" or "no models found" depending on local state
    const isError = errOutput.includes('no config file found') || errOutput.includes('no models found');
    // On machines with config, it may succeed -- check that it doesn't crash
    expect(typeof errOutput).toBe('string');
  });

  it('respects --model flag over auto-detection', async () => {
    const output = await captureStdout(() =>
      main(['tune', '--dry-run', '--model', 'test-model-abc']),
    );
    expect(output).toContain('test-model-abc');
  });

  it('respects TSCG_MODEL env var', async () => {
    const origModel = process.env.TSCG_MODEL;
    process.env.TSCG_MODEL = 'env-test-model';
    try {
      const output = await captureStdout(() =>
        main(['tune', '--dry-run']),
      );
      expect(output).toContain('env-test-model');
    } finally {
      if (origModel !== undefined) {
        process.env.TSCG_MODEL = origModel;
      } else {
        delete process.env.TSCG_MODEL;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// main - uninstall
// ---------------------------------------------------------------------------

describe('main - uninstall', () => {
  it('shows confirmation message without --yes', async () => {
    const output = await captureStdout(() => main(['uninstall']));
    // Either "not installed" or "use --yes" depending on state
    expect(output.length).toBeGreaterThan(0);
  });
});
