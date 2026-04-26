import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type OperatorConfig,
  STATIC_PROFILES,
  matchStaticProfile,
  sizeHeuristicProfile,
  CONDITION_TO_OPERATORS,
} from '../src/index.js';
import { CONSERVATIVE_OPS } from '../src/profile-map.js';

const REQUIRED_KEYS: (keyof OperatorConfig)[] = [
  'sdm', 'tas', 'dro', 'cfl', 'cfo', 'cas', 'sad', 'ccp',
];

describe('Operator Completeness — 8-Key Invariant', () => {

  // 1. All static profiles have 8 keys
  it('every STATIC_PROFILES entry has exactly 8 boolean operator keys', () => {
    for (const profile of STATIC_PROFILES) {
      const keys = Object.keys(profile.operators).sort();
      expect(keys, `Profile "${profile.name}" missing keys`).toEqual([...REQUIRED_KEYS].sort());
      for (const key of REQUIRED_KEYS) {
        expect(typeof profile.operators[key], `Profile "${profile.name}" key "${key}" not boolean`).toBe('boolean');
      }
    }
  });

  // 2. CONDITION_TO_OPERATORS has 8 keys per entry
  it('every CONDITION_TO_OPERATORS entry has exactly 8 boolean operator keys', () => {
    for (const [condition, ops] of Object.entries(CONDITION_TO_OPERATORS)) {
      const keys = Object.keys(ops).sort();
      expect(keys, `Condition "${condition}" missing keys`).toEqual([...REQUIRED_KEYS].sort());
      for (const key of REQUIRED_KEYS) {
        expect(typeof ops[key as keyof OperatorConfig], `Condition "${condition}" key "${key}" not boolean`).toBe('boolean');
      }
    }
  });

  // 3. CONSERVATIVE_OPS has 8 keys
  it('CONSERVATIVE_OPS has exactly 8 boolean operator keys', () => {
    const keys = Object.keys(CONSERVATIVE_OPS).sort();
    expect(keys).toEqual([...REQUIRED_KEYS].sort());
    for (const key of REQUIRED_KEYS) {
      expect(typeof CONSERVATIVE_OPS[key]).toBe('boolean');
    }
  });

  // 4. sizeHeuristicProfile returns profiles with 8 keys
  it('sizeHeuristicProfile results have 8 operator keys', () => {
    const testModels = ['custom-7b-chat', 'custom-14b-model', 'custom-70b-mega', 'custom-200b-ultra'];
    for (const model of testModels) {
      const result = sizeHeuristicProfile(model);
      if (result) {
        const keys = Object.keys(result.operators).sort();
        expect(keys, `Size heuristic for "${model}" missing keys`).toEqual([...REQUIRED_KEYS].sort());
      }
    }
  });

  // 5. matchStaticProfile returns profiles with 8 keys
  it('matchStaticProfile results have 8 operator keys', () => {
    const testModels = ['claude-opus-4', 'gpt-4o', 'ollama/qwen3:14b', 'ollama/phi4:14b'];
    for (const model of testModels) {
      const result = matchStaticProfile(model);
      if (result && result.name !== 'auto') {
        const keys = Object.keys(result.operators).sort();
        expect(keys, `Static profile for "${model}" missing keys`).toEqual([...REQUIRED_KEYS].sort());
      }
    }
  });

  // 6. Grep-equivalent: verify compress() calls in source have all 8 keys
  //    Skip dynamic principles blocks (spread / variable references) — those
  //    are already covered by the SWEEP_CONDITIONS and CONDITION_TO_OPERATORS
  //    invariant checks above.
  it('all compress() calls in src/ specify all 8 operator keys', () => {
    const srcDir = path.join(import.meta.dirname, '..', 'src');
    const srcFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.ts'));

    for (const file of srcFiles) {
      const content = fs.readFileSync(path.join(srcDir, file), 'utf-8');

      // Find all compress() call blocks
      const compressCallRegex = /compress\([^)]*\{[\s\S]*?principles:\s*\{([\s\S]*?)\}/g;
      let match;
      while ((match = compressCallRegex.exec(content)) !== null) {
        const principlesBlock = match[1];
        // Skip dynamic principles blocks that use spread or variable references
        // (e.g. `{ ...cond.ops }`) — those are validated via SWEEP_CONDITIONS invariant
        if (/\.\.\.\w/.test(principlesBlock)) continue;
        for (const key of REQUIRED_KEYS) {
          expect(
            principlesBlock.includes(key),
            `File "${file}" compress() call missing "${key}" in principles block`
          ).toBe(true);
        }
      }
    }
  });

  // 7. No use of 'sadf' anywhere in source (must be 'sad')
  it('no source file uses "sadf" instead of "sad"', () => {
    const srcDir = path.join(import.meta.dirname, '..', 'src');
    const srcFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.ts'));

    for (const file of srcFiles) {
      const content = fs.readFileSync(path.join(srcDir, file), 'utf-8');
      expect(content.includes('sadf'), `File "${file}" contains "sadf" — should be "sad"`).toBe(false);
    }
  });
});
