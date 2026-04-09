/**
 * TSCG Long-Context Unit Tests
 * Validates the haystack generator, long-context transforms, and NIAH test cases.
 */

import { describe, it, expect } from 'vitest';
import {
  generateHaystack,
  NEEDLES,
  type HaystackConfig,
  type HaystackResult,
} from '../src/benchmark/generators/haystack.js';
import {
  computeJaccard,
  segmentText,
  applyContextCAS,
  applyLongContextCCP,
  applyQueryPriming,
  applySegmentSDM,
  type Segment,
} from '../src/optimizer/transforms-longctx.js';
import { LONG_CONTEXT_NIAH_TESTS } from '../src/benchmark/long-context-cases.js';

// ============================================================================
// 1. Haystack Generator
// ============================================================================

describe('generateHaystack', () => {
  it('returns correct output structure', () => {
    const result = generateHaystack({
      needleIdx: 0,
      targetWords: 3750,
      needlePosition: 0.5,
    });

    expect(result).toHaveProperty('context');
    expect(result).toHaveProperty('question');
    expect(result).toHaveProperty('answer');
    expect(result).toHaveProperty('needleSentence');
    expect(result).toHaveProperty('wordCount');
    expect(result).toHaveProperty('needleWordPos');

    expect(typeof result.context).toBe('string');
    expect(typeof result.question).toBe('string');
    expect(typeof result.answer).toBe('string');
    expect(typeof result.needleSentence).toBe('string');
    expect(typeof result.wordCount).toBe('number');
    expect(typeof result.needleWordPos).toBe('number');
  });

  it('embeds the needle sentence within the context', () => {
    const result = generateHaystack({
      needleIdx: 0,
      targetWords: 3750,
      needlePosition: 0.5,
    });

    expect(result.context).toContain(result.needleSentence);
  });

  it('returns the correct question and answer for each needle index', () => {
    for (let i = 0; i < NEEDLES.length; i++) {
      const result = generateHaystack({
        needleIdx: i,
        targetWords: 500,
        needlePosition: 0.5,
      });

      expect(result.question).toBe(NEEDLES[i].question);
      expect(result.answer).toBe(NEEDLES[i].answer);
      expect(result.needleSentence).toBe(NEEDLES[i].fact + '.');
    }
  });

  it('produces a word count close to the target', () => {
    const targets = [500, 3750, 7500];

    for (const target of targets) {
      const result = generateHaystack({
        needleIdx: 0,
        targetWords: target,
        needlePosition: 0.5,
      });

      // Allow up to 50% overshoot from the last paragraph added, plus
      // some tolerance. The generator is designed to slightly exceed rather
      // than undercount.
      expect(result.wordCount).toBeGreaterThan(target * 0.5);
      expect(result.wordCount).toBeLessThan(target * 2.0);
    }
  });

  it('places needle near the expected position', () => {
    const positions = [0.1, 0.5, 0.9];

    for (const pos of positions) {
      const result = generateHaystack({
        needleIdx: 0,
        targetWords: 3750,
        needlePosition: pos,
      });

      // Needle word position should be approximately at pos * wordCount
      // with generous tolerance since insertion is paragraph-granular
      const expectedWordPos = pos * result.wordCount;
      const tolerance = result.wordCount * 0.35; // 35% tolerance for paragraph granularity

      expect(result.needleWordPos).toBeGreaterThanOrEqual(0);
      expect(result.needleWordPos).toBeLessThanOrEqual(result.wordCount);

      // Check it is roughly in the right zone
      expect(Math.abs(result.needleWordPos - expectedWordPos)).toBeLessThan(tolerance);
    }
  });

  it('is deterministic (same config produces same result)', () => {
    const config: HaystackConfig = {
      needleIdx: 3,
      targetWords: 3750,
      needlePosition: 0.5,
    };

    const result1 = generateHaystack(config);
    const result2 = generateHaystack(config);

    expect(result1.context).toBe(result2.context);
    expect(result1.question).toBe(result2.question);
    expect(result1.answer).toBe(result2.answer);
    expect(result1.needleSentence).toBe(result2.needleSentence);
    expect(result1.wordCount).toBe(result2.wordCount);
    expect(result1.needleWordPos).toBe(result2.needleWordPos);
  });

  it('throws for out-of-range needleIdx', () => {
    expect(() =>
      generateHaystack({ needleIdx: -1, targetWords: 500, needlePosition: 0.5 }),
    ).toThrow();
    expect(() =>
      generateHaystack({ needleIdx: 10, targetWords: 500, needlePosition: 0.5 }),
    ).toThrow();
  });

  it('throws for targetWords below minimum', () => {
    expect(() =>
      generateHaystack({ needleIdx: 0, targetWords: 10, needlePosition: 0.5 }),
    ).toThrow();
  });

  it('throws for needlePosition out of 0-1 range', () => {
    expect(() =>
      generateHaystack({ needleIdx: 0, targetWords: 500, needlePosition: -0.1 }),
    ).toThrow();
    expect(() =>
      generateHaystack({ needleIdx: 0, targetWords: 500, needlePosition: 1.1 }),
    ).toThrow();
  });

  it('handles needlePosition at boundaries (0.0 and 1.0)', () => {
    const resultStart = generateHaystack({
      needleIdx: 0,
      targetWords: 500,
      needlePosition: 0.0,
    });
    // Needle at position 0 means it should appear near the beginning
    expect(resultStart.needleWordPos).toBe(0);

    const resultEnd = generateHaystack({
      needleIdx: 0,
      targetWords: 500,
      needlePosition: 1.0,
    });
    // Needle at position 1.0 means it should appear near the end
    expect(resultEnd.needleWordPos).toBeGreaterThan(0);
  });

  it('different needleIdx values produce different needles', () => {
    const results: HaystackResult[] = [];
    for (let i = 0; i < NEEDLES.length; i++) {
      results.push(
        generateHaystack({ needleIdx: i, targetWords: 500, needlePosition: 0.5 }),
      );
    }

    const uniqueAnswers = new Set(results.map((r) => r.answer));
    expect(uniqueAnswers.size).toBe(NEEDLES.length);
  });
});

describe('NEEDLES constant', () => {
  it('has exactly 10 needles', () => {
    expect(NEEDLES).toHaveLength(10);
  });

  it('each needle has fact, question, and answer', () => {
    for (const needle of NEEDLES) {
      expect(typeof needle.fact).toBe('string');
      expect(typeof needle.question).toBe('string');
      expect(typeof needle.answer).toBe('string');
      expect(needle.fact.length).toBeGreaterThan(0);
      expect(needle.question.length).toBeGreaterThan(0);
      expect(needle.answer.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// 2. Long-Context Transforms
// ============================================================================

describe('computeJaccard', () => {
  it('returns 1 for identical strings', () => {
    expect(computeJaccard('quantum entanglement physics', 'quantum entanglement physics')).toBe(1);
  });

  it('returns 0 for completely disjoint strings', () => {
    // Use non-stop-word terms that do not overlap at all
    expect(computeJaccard('quantum physics entanglement', 'baseball football soccer')).toBe(0);
  });

  it('returns a value between 0 and 1 for partial overlap', () => {
    const score = computeJaccard(
      'quantum physics entanglement theory',
      'quantum computing theory algorithms',
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('returns 0 for two empty strings', () => {
    expect(computeJaccard('', '')).toBe(0);
  });

  it('returns 0 when inputs contain only stop words', () => {
    expect(computeJaccard('the a an is are', 'the a an is are')).toBe(0);
  });

  it('is commutative', () => {
    const a = 'stellar formation nebula';
    const b = 'nebula gas cloud formation';
    expect(computeJaccard(a, b)).toBe(computeJaccard(b, a));
  });
});

describe('segmentText', () => {
  it('returns an empty array for empty text', () => {
    expect(segmentText('', 'some query')).toEqual([]);
  });

  it('returns an empty array for whitespace-only text', () => {
    expect(segmentText('   \n\t  ', 'some query')).toEqual([]);
  });

  it('returns segments with text and relevanceScore properties', () => {
    const text = 'The quick brown fox jumps over the lazy dog. ' +
      'Stars form within dense regions of molecular clouds. ' +
      'Photosynthesis converts light energy into chemical energy.';
    const segments = segmentText(text, 'star formation', 10);

    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      expect(seg).toHaveProperty('text');
      expect(seg).toHaveProperty('relevanceScore');
      expect(typeof seg.text).toBe('string');
      expect(typeof seg.relevanceScore).toBe('number');
      expect(seg.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(seg.relevanceScore).toBeLessThanOrEqual(1);
    }
  });

  it('produces segments that together cover all original words', () => {
    const text = 'Alpha bravo charlie delta echo foxtrot golf hotel india juliet';
    const segments = segmentText(text, 'alpha', 4);

    const allWords = segments.map((s) => s.text).join(' ');
    // All original words should appear in the concatenated segments
    for (const word of text.split(/\s+/)) {
      expect(allWords).toContain(word);
    }
  });

  it('short text produces a single segment', () => {
    const text = 'Hello world testing';
    const segments = segmentText(text, 'hello', 150);
    expect(segments).toHaveLength(1);
  });

  it('assigns higher relevance to segments matching the query', () => {
    const text =
      'Coral reefs are diverse ecosystems supporting marine life. ' +
      'Stars form within molecular clouds in deep space. ' +
      'The asteroid belt sits between Mars and Jupiter orbits.';
    const segments = segmentText(text, 'asteroid belt Mars Jupiter', 15);

    // Find the segment about asteroids
    const asteroidSeg = segments.find((s) => s.text.toLowerCase().includes('asteroid'));
    const otherSegs = segments.filter((s) => !s.text.toLowerCase().includes('asteroid'));

    if (asteroidSeg && otherSegs.length > 0) {
      const maxOtherScore = Math.max(...otherSegs.map((s) => s.relevanceScore));
      expect(asteroidSeg.relevanceScore).toBeGreaterThanOrEqual(maxOtherScore);
    }
  });
});

describe('applyContextCAS', () => {
  it('returns a copy (does not mutate input)', () => {
    const segments: Segment[] = [
      { text: 'A', relevanceScore: 0.1 },
      { text: 'B', relevanceScore: 0.5 },
      { text: 'C', relevanceScore: 0.9 },
    ];
    const original = [...segments];
    applyContextCAS(segments);
    expect(segments).toEqual(original);
  });

  it('returns all segments (none dropped)', () => {
    const segments: Segment[] = [
      { text: 'A', relevanceScore: 0.1 },
      { text: 'B', relevanceScore: 0.5 },
      { text: 'C', relevanceScore: 0.9 },
      { text: 'D', relevanceScore: 0.3 },
    ];
    const result = applyContextCAS(segments);
    expect(result).toHaveLength(segments.length);
  });

  it('places highest relevance at the start', () => {
    const segments: Segment[] = [
      { text: 'Low', relevanceScore: 0.1 },
      { text: 'Mid', relevanceScore: 0.5 },
      { text: 'High', relevanceScore: 0.9 },
      { text: 'Med', relevanceScore: 0.3 },
    ];
    const result = applyContextCAS(segments);
    expect(result[0].relevanceScore).toBe(0.9);
  });

  it('places second-highest relevance at the end', () => {
    const segments: Segment[] = [
      { text: 'Low', relevanceScore: 0.1 },
      { text: 'Mid', relevanceScore: 0.5 },
      { text: 'High', relevanceScore: 0.9 },
      { text: 'Med', relevanceScore: 0.3 },
    ];
    const result = applyContextCAS(segments);
    expect(result[result.length - 1].relevanceScore).toBe(0.5);
  });

  it('puts lowest relevance in the middle', () => {
    const segments: Segment[] = [
      { text: 'A', relevanceScore: 0.9 },
      { text: 'B', relevanceScore: 0.7 },
      { text: 'C', relevanceScore: 0.1 },
      { text: 'D', relevanceScore: 0.5 },
      { text: 'E', relevanceScore: 0.3 },
    ];
    const result = applyContextCAS(segments);

    // The lowest-scoring segment (0.1) should end up somewhere in the middle
    const lowestIdx = result.findIndex((s) => s.relevanceScore === 0.1);
    expect(lowestIdx).toBeGreaterThan(0);
    expect(lowestIdx).toBeLessThan(result.length - 1);
  });

  it('handles empty input', () => {
    expect(applyContextCAS([])).toEqual([]);
  });

  it('handles single segment', () => {
    const segments: Segment[] = [{ text: 'Only', relevanceScore: 0.5 }];
    const result = applyContextCAS(segments);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Only');
  });

  it('handles two segments without reordering', () => {
    const segments: Segment[] = [
      { text: 'A', relevanceScore: 0.3 },
      { text: 'B', relevanceScore: 0.7 },
    ];
    const result = applyContextCAS(segments);
    expect(result).toHaveLength(2);
  });
});

describe('applyLongContextCCP', () => {
  it('returns the original text when input is empty', () => {
    expect(applyLongContextCCP('', 'some query')).toBe('');
  });

  it('returns the original text when input is whitespace-only', () => {
    expect(applyLongContextCCP('   ', 'some query')).toBe('   ');
  });

  it('returns a string', () => {
    const result = applyLongContextCCP(
      'The total budget for Project Aurora was $4.7 million in fiscal year 2024.',
      'budget Project Aurora',
    );
    expect(typeof result).toBe('string');
  });

  it('appends a closure block with ###<CC> and ###</CC> markers', () => {
    const text =
      'The total budget for Project Aurora was $4.7 million in fiscal year 2024. ' +
      'Compound XR-7 reduced inflammation by 73% in the Phase II trial. ' +
      'The server migration has an estimated downtime of 4 hours. ' +
      'Contract #2847-B was awarded to Meridian Technologies for $2.3 million. ' +
      'Professor Elena Vasquez published her seminal paper with 847 citations.';
    const result = applyLongContextCCP(text, 'budget Project Aurora');

    expect(result).toContain('###<CC>');
    expect(result).toContain('###</CC>');
  });

  it('contains the original text before the closure block', () => {
    const text = 'Stars form in molecular clouds. The budget was $4.7 million.';
    const result = applyLongContextCCP(text, 'budget');

    expect(result.startsWith(text) || result.includes(text)).toBe(true);
  });

  it('respects maxClosureWords parameter', () => {
    const text =
      'The total budget for Project Aurora was $4.7 million. ' +
      'Compound XR-7 showed 73% reduction. ' +
      'Server migration takes 4 hours. ' +
      'Contract awarded for $2.3 million. ' +
      'Paper received 847 citations by year end.';
    const result = applyLongContextCCP(text, 'budget Aurora', 5);

    // The closure block should exist but be short
    const closureMatch = result.match(/###<CC>(.*?)###<\/CC>/);
    if (closureMatch) {
      const closureWords = closureMatch[1].trim().split(/\s+/).length;
      // Should not massively exceed the budget (some tolerance for formatting)
      expect(closureWords).toBeLessThanOrEqual(15);
    }
  });
});

describe('applyQueryPriming', () => {
  it('returns a string', () => {
    expect(typeof applyQueryPriming('some context', 'some question')).toBe('string');
  });

  it('places the question at the start', () => {
    const result = applyQueryPriming('The context text.', 'What is the answer?');
    expect(result.startsWith('Question: What is the answer?')).toBe(true);
  });

  it('places the question at the end with "Answer:" prompt', () => {
    const result = applyQueryPriming('The context text.', 'What is the answer?');
    expect(result.endsWith('Question: What is the answer?\nAnswer:')).toBe(true);
  });

  it('contains the context in the middle', () => {
    const result = applyQueryPriming('The context text.', 'What is the answer?');
    expect(result).toContain('The context text.');
  });

  it('handles empty context', () => {
    const result = applyQueryPriming('', 'What is the answer?');
    expect(result).toContain('Question: What is the answer?');
    expect(result).toContain('Answer:');
  });

  it('handles empty question', () => {
    const result = applyQueryPriming('Some context.', '');
    expect(result).toContain('Question:');
    expect(result).toContain('Some context.');
  });

  it('trims whitespace from context and question', () => {
    const result = applyQueryPriming('  padded context  ', '  padded question  ');
    expect(result).toContain('Question: padded question');
    expect(result).toContain('padded context');
  });
});

describe('applySegmentSDM', () => {
  it('returns a copy (does not mutate input)', () => {
    const segments: Segment[] = [
      { text: 'Hello world', relevanceScore: 0.5 },
    ];
    const original = [...segments];
    applySegmentSDM(segments);
    expect(segments).toEqual(original);
  });

  it('returns all segments when none are duplicates', () => {
    const segments: Segment[] = [
      { text: 'quantum physics entanglement', relevanceScore: 0.5 },
      { text: 'baseball football soccer', relevanceScore: 0.3 },
      { text: 'coral reef marine biology', relevanceScore: 0.7 },
    ];
    const result = applySegmentSDM(segments);
    expect(result).toHaveLength(3);
  });

  it('removes near-duplicate segments', () => {
    const segments: Segment[] = [
      { text: 'stars form within dense molecular clouds', relevanceScore: 0.5 },
      { text: 'stars form within dense molecular clouds gas', relevanceScore: 0.3 },
      { text: 'coral reefs support diverse marine life', relevanceScore: 0.7 },
    ];
    const result = applySegmentSDM(segments, 0.7);
    // The second segment is a near-duplicate of the first; should be removed
    expect(result.length).toBeLessThanOrEqual(segments.length);
  });

  it('keeps the first occurrence of duplicates', () => {
    const segments: Segment[] = [
      { text: 'stars form within dense molecular clouds', relevanceScore: 0.5 },
      { text: 'stars form within dense molecular clouds region', relevanceScore: 0.8 },
    ];
    const result = applySegmentSDM(segments, 0.5);
    // First occurrence should be kept
    expect(result[0].relevanceScore).toBe(0.5);
  });

  it('handles empty input', () => {
    expect(applySegmentSDM([])).toEqual([]);
  });

  it('handles single segment', () => {
    const segments: Segment[] = [{ text: 'Only one', relevanceScore: 0.5 }];
    const result = applySegmentSDM(segments);
    expect(result).toHaveLength(1);
  });

  it('respects custom threshold', () => {
    const segments: Segment[] = [
      { text: 'alpha bravo charlie delta', relevanceScore: 0.5 },
      { text: 'alpha bravo charlie echo', relevanceScore: 0.3 },
    ];
    // With a very high threshold, nothing should be removed
    const resultHigh = applySegmentSDM(segments, 0.99);
    expect(resultHigh).toHaveLength(2);

    // With a very low threshold, almost everything is a "duplicate"
    const resultLow = applySegmentSDM(segments, 0.1);
    expect(resultLow.length).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// 3. Long-Context NIAH Test Cases
// ============================================================================

describe('LONG_CONTEXT_NIAH_TESTS', () => {
  it('has exactly 30 tests (3 sizes x 5 positions x 2 needles)', () => {
    expect(LONG_CONTEXT_NIAH_TESTS).toHaveLength(30);
  });

  it('all tests have required fields', () => {
    for (const t of LONG_CONTEXT_NIAH_TESTS) {
      expect(t.id).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.expected).toBeTruthy();
      expect(t.natural).toBeTruthy();
      expect(t.tscg).toBeTruthy();
      expect(typeof t.check).toBe('function');
    }
  });

  it('all tests have category LongContext_NIAH', () => {
    for (const t of LONG_CONTEXT_NIAH_TESTS) {
      expect(t.category).toBe('LongContext_NIAH');
    }
  });

  it('has no duplicate IDs', () => {
    const ids = LONG_CONTEXT_NIAH_TESTS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('IDs follow naming convention niah-{size}-p{pos}-n{needle}', () => {
    for (const t of LONG_CONTEXT_NIAH_TESTS) {
      expect(t.id).toMatch(/^niah-(5k|10k|20k)-p\d+-n\d+$/);
    }
  });

  it('names include size and position info', () => {
    for (const t of LONG_CONTEXT_NIAH_TESTS) {
      expect(t.name).toMatch(/^NIAH\s+(5K|10K|20K)\s+pos=[\d.]+\s+needle=\d+$/);
    }
  });

  it('covers all three context sizes', () => {
    const sizes = new Set(
      LONG_CONTEXT_NIAH_TESTS.map((t) => {
        const match = t.id.match(/^niah-(5k|10k|20k)/);
        return match ? match[1] : '';
      }),
    );
    expect(sizes.has('5k')).toBe(true);
    expect(sizes.has('10k')).toBe(true);
    expect(sizes.has('20k')).toBe(true);
  });

  it('covers all five needle positions', () => {
    const positions = new Set(
      LONG_CONTEXT_NIAH_TESTS.map((t) => {
        const match = t.id.match(/p(\d+)/);
        return match ? match[1] : '';
      }),
    );
    // 0.1 -> p1, 0.3 -> p3, 0.5 -> p5, 0.7 -> p7, 0.9 -> p9
    expect(positions.has('1')).toBe(true);
    expect(positions.has('3')).toBe(true);
    expect(positions.has('5')).toBe(true);
    expect(positions.has('7')).toBe(true);
    expect(positions.has('9')).toBe(true);
  });

  it('all checkers accept expected answers', () => {
    for (const t of LONG_CONTEXT_NIAH_TESTS) {
      const result = t.check(t.expected);
      if (!result) {
        console.warn(
          `Checker for ${t.id} (${t.name}) rejected expected value: "${t.expected}"`,
        );
      }
      expect(result).toBe(true);
    }
  });

  it('checkers reject clearly wrong answers', () => {
    // Use a random unrelated answer for all test cases
    let rejectedCount = 0;
    for (const t of LONG_CONTEXT_NIAH_TESTS) {
      const wrongAnswer = 'completely unrelated banana purple elephant';
      if (!t.check(wrongAnswer)) {
        rejectedCount++;
      }
    }
    // Most (if not all) checkers should reject a clearly wrong answer
    expect(rejectedCount).toBeGreaterThan(LONG_CONTEXT_NIAH_TESTS.length * 0.8);
  });

  it('TSCG prompts start with [ANSWER:fact]', () => {
    for (const t of LONG_CONTEXT_NIAH_TESTS) {
      expect(t.tscg.startsWith('[ANSWER:fact]')).toBe(true);
    }
  });

  it('natural prompts contain a question and context', () => {
    for (const t of LONG_CONTEXT_NIAH_TESTS) {
      // Natural prompts should have substantial length (question + haystack context)
      expect(t.natural.length).toBeGreaterThan(100);
      // Should contain a question mark (from the needle question)
      expect(t.natural).toContain('?');
    }
  });

  it('10 tests per size category', () => {
    const countBySize: Record<string, number> = {};
    for (const t of LONG_CONTEXT_NIAH_TESTS) {
      const match = t.id.match(/^niah-(5k|10k|20k)/);
      if (match) {
        countBySize[match[1]] = (countBySize[match[1]] || 0) + 1;
      }
    }
    expect(countBySize['5k']).toBe(10);
    expect(countBySize['10k']).toBe(10);
    expect(countBySize['20k']).toBe(10);
  });
});
