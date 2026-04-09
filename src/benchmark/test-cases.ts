/**
 * TSCG Benchmark Test Cases
 * 20 core tests + long-context tests
 * v1.1 — Optimized TSCG prompts for Sonnet based on v1.0 failure analysis
 */

import type { TestCase } from '../core/types.js';
import { HARD_TESTS } from './hard-cases.js';

// === Near-Duplicate Test Helpers ===

const BASE_STR = 'abcdefghijklmnopqrstuvwxyz'.repeat(4); // 104 chars

function makeVariant(b: string, pos: number, char: string): string {
  return b.slice(0, pos) + char + b.slice(pos + 1);
}

const DISTRACTOR =
  'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud exercitation ullamco laboris';

// === Core 20 Test Cases ===

export const CORE_TESTS: TestCase[] = [
  // --- FACTUAL (4) ---
  {
    id: 'f1', category: 'Factual', name: 'Capital', expected: 'Canberra',
    natural: 'What is the capital city of Australia?',
    tscg: '[ANSWER:single_word] country:Australia \u2192 capital_city \u2192',
    check: (r) => /canberra/i.test(r),
  },
  {
    id: 'f2', category: 'Factual', name: 'Atomic#', expected: '79',
    natural: 'What is the atomic number of gold?',
    tscg: '[ANSWER:integer] element:gold \u2192 atomic_number \u2192',
    check: (r) => r.includes('79'),
  },
  {
    id: 'f3', category: 'Factual', name: 'Planet', expected: 'Jupiter',
    natural: 'What is the largest planet in our solar system?',
    tscg: '[ANSWER:single_word] solar_system \u2192 largest_planet \u2192',
    check: (r) => /jupiter/i.test(r),
  },
  {
    id: 'f4', category: 'Factual', name: 'Element', expected: 'O',
    natural: 'What is the chemical symbol for oxygen?',
    tscg: '[ANSWER:symbol] element:oxygen \u2192 chemical_symbol \u2192',
    check: (r) => /\bO\b/.test(r),
  },

  // --- REASONING (4) ---
  {
    id: 'r1', category: 'Reasoning', name: 'MathWord', expected: '63',
    natural: 'A store has 45 apples. They sell 12 in the morning and receive 30 in the afternoon. How many apples at end of day?',
    tscg: '[ANSWER:integer] initial:45 \u2192 subtract:12 \u2192 add:30 \u2192 result \u2192',
    check: (r) => r.includes('63'),
  },
  {
    id: 'r2', category: 'Reasoning', name: 'Sequence', expected: '162',
    natural: 'What comes next in this sequence: 2, 6, 18, 54, ?',
    tscg: '[ANSWER:integer] sequence:[2,6,18,54] pattern:geometric ratio:3 \u2192 next_term \u2192',
    check: (r) => r.includes('162'),
  },
  {
    // v1.1: Replaced Unicode logic symbols with natural-language TSCG notation
    // v1.0 had: premise1:roses⊂flowers premise2:∃flowers→fade_quickly → valid:∃roses→fade_quickly?
    // This confused Sonnet into treating it as a formal proof instead of answering yes/no
    id: 'r3', category: 'Reasoning', name: 'Syllogism', expected: 'No',
    natural: 'If all roses are flowers and some flowers fade quickly, can we conclude that some roses fade quickly? Answer only yes or no.',
    tscg: '[ANSWER:yes|no] premise1:"all roses are flowers" premise2:"some flowers fade quickly" \u2192 conclude:"some roses fade quickly"? \u2192',
    check: (r) => /^\s*no/i.test(r),
  },
  {
    id: 'r4', category: 'Reasoning', name: 'Rectangle', expected: '192',
    natural: 'A rectangle has length = 3 times width, perimeter = 64 cm. What is the area in cm\u00b2?',
    tscg: '[ANSWER:number,unit:cm\u00b2] rectangle length=3w perimeter=64 \u2192 solve:2(3w+w)=64 \u2192 area=w\u00d7l \u2192',
    check: (r) => r.includes('192'),
  },

  // --- CLASSIFICATION (2) ---
  {
    id: 'c1', category: 'Classification', name: 'Sentiment', expected: 'negative',
    natural: "Classify the sentiment as positive, negative, or neutral: 'The movie was absolutely terrible, I want my money back.'",
    tscg: "[CLASSIFY:positive|negative|neutral] text:'movie absolutely terrible want money back' \u2192 sentiment \u2192",
    check: (r) => /negative/i.test(r),
  },
  {
    id: 'c2', category: 'Classification', name: 'Category', expected: 'grain',
    natural: 'Classify quinoa into a category: fruit, vegetable, grain, or protein.',
    tscg: '[CLASSIFY:fruit|vegetable|grain|protein] item:quinoa \u2192 category \u2192',
    check: (r) => /grain/i.test(r),
  },

  // --- EXTRACTION (1) ---
  {
    // v1.1: Added numbered list format so the model can count positions unambiguously
    // v1.0 had: list:[...comma-separated...] → index:13 — model returned 14th item (Nick Harris)
    id: 'e1', category: 'Extraction', name: 'NameIdx13', expected: 'Mary White',
    natural: 'Here is a list of 25 names: Alice Johnson, Bob Smith, Carol Williams, David Brown, Eve Davis, Frank Miller, Grace Wilson, Henry Moore, Iris Taylor, Jack Anderson, Kate Thomas, Leo Jackson, Mary White, Nick Harris, Olivia Martin, Paul Thompson, Quinn Garcia, Rachel Martinez, Sam Robinson, Tina Clark, Uma Rodriguez, Victor Lewis, Wendy Lee, Xavier Walker, Yuki Hall. What is the 13th name?',
    tscg: '[ANSWER:name] list:[1:Alice Johnson,2:Bob Smith,3:Carol Williams,4:David Brown,5:Eve Davis,6:Frank Miller,7:Grace Wilson,8:Henry Moore,9:Iris Taylor,10:Jack Anderson,11:Kate Thomas,12:Leo Jackson,13:Mary White,14:Nick Harris,15:Olivia Martin,16:Paul Thompson,17:Quinn Garcia,18:Rachel Martinez,19:Sam Robinson,20:Tina Clark,21:Uma Rodriguez,22:Victor Lewis,23:Wendy Lee,24:Xavier Walker,25:Yuki Hall] \u2192 item_at:13 \u2192',
    check: (r) => /mary\s*white/i.test(r),
  },

  // --- OPTIONS-FIRST MC (3) ---
  {
    // v1.1: Simplified operation chain; more tolerant check (\bC\b instead of ^\s*C)
    // v1.0: model returned "[ANSWER:C]" which failed ^\s*C check
    id: 'o1', category: 'OptFirst', name: 'SciMC', expected: 'C',
    natural: 'A. Conduction\nB. Convection\nC. Radiation\nD. Insulation\n\nWhich heat transfer uses electromagnetic waves without a medium? Reply with one letter only.',
    tscg: '[ANSWER:letter] A:Conduction B:Convection C:Radiation D:Insulation \u2192 heat_transfer+electromagnetic_waves+no_medium \u2192',
    check: (r) => /\bC\b/.test(r),
  },
  {
    id: 'o2', category: 'OptFirst', name: 'GeoMC', expected: 'A',
    natural: 'A. Nile\nB. Amazon\nC. Yangtze\nD. Mississippi\n\nWhich is the longest river? Reply with one letter only.',
    tscg: '[ANSWER:letter] A:Nile B:Amazon C:Yangtze D:Mississippi \u2192 longest_river_world \u2192',
    check: (r) => /\bA\b/.test(r),
  },
  {
    id: 'o3', category: 'OptFirst', name: 'BioMC', expected: 'A',
    natural: 'A. Mitochondria\nB. Ribosome\nC. Nucleus\nD. Golgi apparatus\n\nWhich organelle is the powerhouse of the cell? Reply with one letter only.',
    tscg: '[ANSWER:letter] A:Mitochondria B:Ribosome C:Nucleus D:Golgi \u2192 powerhouse_of_cell \u2192',
    check: (r) => /\bA\b/.test(r),
  },

  // --- COMPLEX (2) ---
  {
    id: 'x1', category: 'Complex', name: 'Distance', expected: '380',
    natural: 'A train travels at 80 km/h for 2.5 hours, then at 120 km/h for 1.5 hours. Total distance?',
    tscg: '[ANSWER:number,unit:km] seg1:80\u00d72.5 seg2:120\u00d71.5 \u2192 total=sum \u2192',
    check: (r) => r.includes('380'),
  },
  {
    id: 'x2', category: 'Complex', name: 'Discount', expected: '54',
    natural: 'A shirt costs 80 dollars, 25% off sale, then 10% coupon on sale price. Final price?',
    tscg: '[ANSWER:number,unit:$] price:80 \u2192 discount:25%\u219260 \u2192 discount:10% \u2192 final \u2192',
    check: (r) => r.includes('54'),
  },

  // --- NEAR-DUPLICATE MATCH (3) ---
  {
    // v1.1: Removed abstract "exact_match:options → select →" which triggered analysis mode
    // Now uses explicit instruction within TSCG to output one letter only
    id: 'nd1', category: 'NearDup', name: 'StringMatch1', expected: 'B',
    natural: `You must output exactly ONE letter: A, B, C, or D.\n\nA) ${makeVariant(BASE_STR, 50, 'X')}\nB) ${BASE_STR}\nC) ${makeVariant(BASE_STR, 50, 'Y')}\nD) ${makeVariant(BASE_STR, 50, 'Z')}\n\nDISTRACTOR (ignore):\n${DISTRACTOR}\n\nkey=${BASE_STR}\n\nWhich option exactly matches the key? Reply with one letter only.`,
    tscg: `[ANSWER:letter] Output one letter only.\nA) ${makeVariant(BASE_STR, 50, 'X')}\nB) ${BASE_STR}\nC) ${makeVariant(BASE_STR, 50, 'Y')}\nD) ${makeVariant(BASE_STR, 50, 'Z')}\nkey=${BASE_STR}\nWhich option exactly matches the key?`,
    check: (r) => /\bB\b/.test(r),
  },
  {
    id: 'nd2', category: 'NearDup', name: 'StringMatch2', expected: 'C',
    natural: `You must output exactly ONE letter: A, B, C, or D.\n\nA) ${makeVariant(BASE_STR, 30, 'Q')}\nB) ${makeVariant(BASE_STR, 70, 'R')}\nC) ${BASE_STR}\nD) ${makeVariant(BASE_STR, 30, 'S')}\n\nDISTRACTOR (ignore):\n${DISTRACTOR}\n\nkey=${BASE_STR}\n\nWhich option exactly matches the key? Reply with one letter only.`,
    tscg: `[ANSWER:letter] Output one letter only.\nA) ${makeVariant(BASE_STR, 30, 'Q')}\nB) ${makeVariant(BASE_STR, 70, 'R')}\nC) ${BASE_STR}\nD) ${makeVariant(BASE_STR, 30, 'S')}\nkey=${BASE_STR}\nWhich option exactly matches the key?`,
    check: (r) => /\bC\b/.test(r),
  },
  {
    id: 'nd3', category: 'NearDup', name: 'StringMatch3', expected: 'A',
    natural: `You must output exactly ONE letter: A, B, C, or D.\n\nA) ${BASE_STR}\nB) ${makeVariant(BASE_STR, 20, 'M')}\nC) ${makeVariant(BASE_STR, 80, 'N')}\nD) ${makeVariant(BASE_STR, 20, 'P')}\n\nDISTRACTOR (ignore):\n${DISTRACTOR}\n\nkey=${BASE_STR}\n\nWhich option exactly matches the key? Reply with one letter only.`,
    tscg: `[ANSWER:letter] Output one letter only.\nA) ${BASE_STR}\nB) ${makeVariant(BASE_STR, 20, 'M')}\nC) ${makeVariant(BASE_STR, 80, 'N')}\nD) ${makeVariant(BASE_STR, 20, 'P')}\nkey=${BASE_STR}\nWhich option exactly matches the key?`,
    check: (r) => /\bA\b/.test(r),
  },
];

// === Long Context Tests (1k-10k token equivalents) ===

function generateLongContextTest(targetChars: number, id: string, name: string): TestCase {
  // Generate a long context with a hidden answer
  const filler = 'The quick brown fox jumps over the lazy dog. ';
  const fillerCount = Math.ceil(targetChars / filler.length);
  const padding = Array.from({ length: fillerCount }, () => filler).join('');
  const hiddenFact = 'The secret code is ALPHA-7742.';
  // Insert at ~60% position (past middle, where models struggle)
  const insertPos = Math.floor(padding.length * 0.6);
  const context = padding.slice(0, insertPos) + ' ' + hiddenFact + ' ' + padding.slice(insertPos);

  return {
    id,
    category: 'LongContext',
    name,
    expected: 'ALPHA-7742',
    natural: `Read the following text carefully and answer the question at the end.\n\n${context}\n\nWhat is the secret code mentioned in the text above?`,
    tscg: `[ANSWER:code] <<CTX>>\n${context}\n<</CTX>> \u2192 extract:secret_code \u2192`,
    check: (r) => /ALPHA.?7742/i.test(r),
    tags: ['long-context'],
  };
}

function generateMultiConstraintTest(): TestCase {
  return {
    id: 'mc1',
    category: 'MultiConstraint',
    name: 'FormatConstraint',
    expected: 'JSON with 3 fields',
    natural: 'List the top 3 programming languages by popularity in 2025. Return as JSON with fields: name, rank, and paradigm. Only include the JSON, no explanation.',
    tscg: '[ANSWER:json{name:string,rank:integer,paradigm:string}[3]] query:top_programming_languages_2025 \u2192 sort:popularity \u2192 limit:3 \u2192 emit:json \u2192',
    check: (r) => {
      try {
        const parsed = JSON.parse(r.trim());
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        return arr.length >= 1 && arr.every((item: Record<string, unknown>) => 'name' in item && 'rank' in item);
      } catch {
        return false;
      }
    },
    tags: ['multi-constraint'],
  };
}

export const LONG_CONTEXT_TESTS: TestCase[] = [
  generateLongContextTest(4000, 'lc1', 'Needle1K'),    // ~1k tokens
  generateLongContextTest(16000, 'lc2', 'Needle4K'),   // ~4k tokens
  generateLongContextTest(40000, 'lc3', 'Needle10K'),  // ~10k tokens
];

export const MULTI_CONSTRAINT_TESTS: TestCase[] = [
  generateMultiConstraintTest(),
];

/** Get all test cases */
export function getAllTests(includeLongContext = false): TestCase[] {
  const tests = [...CORE_TESTS];
  if (includeLongContext) {
    tests.push(...LONG_CONTEXT_TESTS, ...MULTI_CONSTRAINT_TESTS);
  }
  return tests;
}

/** Get tests by set: 'core' (original 19), 'hard' (25 hard), 'all' (combined) */
export function getTestsBySet(set: 'core' | 'hard' | 'all' = 'core', includeLongContext = false): TestCase[] {
  switch (set) {
    case 'core':
      return getAllTests(includeLongContext);
    case 'hard':
      return [...HARD_TESTS];
    case 'all':
      return [...getAllTests(includeLongContext), ...HARD_TESTS];
    default:
      return getAllTests(includeLongContext);
  }
}

/** Get tests by category */
export function getTestsByCategory(category: string): TestCase[] {
  return getTestsBySet('all', true).filter((t) => t.category === category);
}
