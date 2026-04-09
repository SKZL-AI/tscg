import type { TestCase } from '../core/types.js';
import { generateHaystack } from './generators/haystack.js';

/**
 * Long-Context Needle-in-a-Haystack (NIAH) test cases.
 * Tests whether TSCG long-context transforms help find information
 * embedded at various positions in long documents.
 *
 * Test Matrix:
 *   3 context sizes  x  5 needle positions  x  2 needles  =  30 tests
 *
 * The "lost in the middle" effect (Liu et al., 2024) predicts that models
 * struggle most to retrieve facts at position ~0.5. CAS-reordering and
 * CCP-closure should mitigate this by moving query-relevant segments to
 * high-attention positions (start/end).
 */

const SIZES = [
  { label: '5K', words: 3750 },
  { label: '10K', words: 7500 },
  { label: '20K', words: 15000 },
];

const POSITIONS = [0.1, 0.3, 0.5, 0.7, 0.9];

function generateNIAHTests(): TestCase[] {
  const tests: TestCase[] = [];
  let testIdx = 0;

  for (const size of SIZES) {
    for (const pos of POSITIONS) {
      // 2 needles per combination
      for (let needleIdx = 0; needleIdx < 2; needleIdx++) {
        const actualNeedleIdx = (testIdx * 2 + needleIdx) % 10;
        const id = `niah-${size.label.toLowerCase()}-p${Math.round(pos * 10)}-n${needleIdx}`;
        const name = `NIAH ${size.label} pos=${pos} needle=${needleIdx}`;

        const haystack = generateHaystack({
          needleIdx: actualNeedleIdx,
          targetWords: size.words,
          needlePosition: pos,
        });

        tests.push({
          id,
          category: 'LongContext_NIAH',
          name,
          expected: haystack.answer,
          natural: `${haystack.question}\n\n${haystack.context}`,
          tscg: `[ANSWER:fact] ${haystack.question}\n\n${haystack.context}`,
          // For now, natural and tscg are similar. The long-context transforms
          // will be applied at the strategy level in the benchmark runner.
          check: (r: string) => {
            const lower = r.toLowerCase();
            const answerLower = haystack.answer.toLowerCase();
            // Check if key parts of the answer appear (numbers, names, units)
            const keyParts = answerLower
              .split(/[,\s]+/)
              .filter(
                (p) =>
                  p.length > 2 &&
                  !/^(the|and|of|at|in|a|an)$/.test(p),
              );
            const matchCount = keyParts.filter((p) =>
              lower.includes(p),
            ).length;
            return matchCount >= Math.ceil(keyParts.length * 0.5);
          },
        });
      }
      testIdx++;
    }
  }

  return tests;
}

export const LONG_CONTEXT_NIAH_TESTS = generateNIAHTests();
