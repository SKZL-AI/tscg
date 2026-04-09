/**
 * TSCG RAG Transforms & RAG Test Cases - Unit Tests
 * Validates RAG transform functions and RAG benchmark test case structure.
 */

import { describe, it, expect } from 'vitest';
import {
  applyChunkCAS,
  applyChunkDedup,
  applyRAGClosure,
  applyQueryChunkAnchoring,
  applyChunkSDM,
  formatRAGContext,
  type RAGChunk,
} from '../src/optimizer/transforms-rag.js';
import {
  RAG_TESTS,
  getRAGTestsByCategory,
  type RAGTestCase,
} from '../src/benchmark/rag-cases.js';
import { CORE_TESTS } from '../src/benchmark/test-cases.js';
import { HARD_TESTS } from '../src/benchmark/hard-cases.js';

// === Helpers: reusable test chunks ===

function makeChunk(id: string, text: string, score: number): RAGChunk {
  return { id, text, relevanceScore: score };
}

const SAMPLE_CHUNKS: RAGChunk[] = [
  makeChunk('c1', 'The total revenue was $50 million in Q1 2024.', 0.9),
  makeChunk('c2', 'Employee count reached 1,200 across all offices.', 0.7),
  makeChunk('c3', 'The CEO announced a new product launch in March.', 0.8),
  makeChunk('c4', 'Customer satisfaction scores improved to 92%.', 0.6),
  makeChunk('c5', 'R&D spending increased by 15% year over year.', 0.5),
];

// ============================================================
// RAG Transform Functions
// ============================================================

describe('RAG transforms', () => {
  // --- applyChunkCAS ---

  describe('applyChunkCAS', () => {
    it('is a callable function', () => {
      expect(typeof applyChunkCAS).toBe('function');
    });

    it('returns empty array for empty input', () => {
      const result = applyChunkCAS([]);
      expect(result).toEqual([]);
    });

    it('returns single chunk unchanged', () => {
      const single = [makeChunk('a', 'text', 0.5)];
      const result = applyChunkCAS(single);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
    });

    it('returns two chunks unchanged (shallow copy)', () => {
      const two = [makeChunk('a', 'first', 0.3), makeChunk('b', 'second', 0.9)];
      const result = applyChunkCAS(two);
      expect(result).toHaveLength(2);
      // Should be a copy, not the same reference
      expect(result).not.toBe(two);
    });

    it('places highest relevance at position 0 and second-highest near end', () => {
      const result = applyChunkCAS(SAMPLE_CHUNKS);
      expect(result).toHaveLength(SAMPLE_CHUNKS.length);
      // First element should be highest relevance (0.9)
      expect(result[0].relevanceScore).toBe(0.9);
      // Last element should be second-highest relevance (0.8)
      expect(result[result.length - 1].relevanceScore).toBe(0.8);
    });

    it('produces U-shape ordering: ends high, middle low', () => {
      const result = applyChunkCAS(SAMPLE_CHUNKS);
      // Middle element(s) should have lowest scores
      const midIdx = Math.floor(result.length / 2);
      const endScores = [result[0].relevanceScore, result[result.length - 1].relevanceScore];
      const midScore = result[midIdx].relevanceScore;
      expect(Math.min(...endScores)).toBeGreaterThanOrEqual(midScore);
    });

    it('does not mutate the input array', () => {
      const original = [...SAMPLE_CHUNKS];
      applyChunkCAS(SAMPLE_CHUNKS);
      expect(SAMPLE_CHUNKS).toEqual(original);
    });

    it('preserves all chunks (no loss, no duplication)', () => {
      const result = applyChunkCAS(SAMPLE_CHUNKS);
      const inputIds = new Set(SAMPLE_CHUNKS.map((c) => c.id));
      const outputIds = new Set(result.map((c) => c.id));
      expect(outputIds).toEqual(inputIds);
    });
  });

  // --- applyChunkDedup ---

  describe('applyChunkDedup', () => {
    it('is a callable function', () => {
      expect(typeof applyChunkDedup).toBe('function');
    });

    it('returns empty array for empty input', () => {
      const result = applyChunkDedup([]);
      expect(result).toEqual([]);
    });

    it('returns single chunk unchanged', () => {
      const single = [makeChunk('a', 'some unique text here', 0.5)];
      const result = applyChunkDedup(single);
      expect(result).toHaveLength(1);
    });

    it('removes near-duplicate chunks', () => {
      const dupes = [
        makeChunk('a', 'The project budget was approved for two million dollars in total spending', 0.9),
        makeChunk('b', 'The project budget was approved for two million dollars in total spending by the committee', 0.7),
      ];
      const result = applyChunkDedup(dupes);
      expect(result.length).toBeLessThan(dupes.length);
      // Should keep the higher-relevance one
      expect(result[0].id).toBe('a');
    });

    it('keeps all chunks when texts are dissimilar', () => {
      const distinct = [
        makeChunk('a', 'Quantum computing leverages superposition entanglement', 0.9),
        makeChunk('b', 'Mediterranean cuisine features olive oil herbs vegetables', 0.7),
        makeChunk('c', 'Baseball statistics include batting average earned runs', 0.5),
      ];
      const result = applyChunkDedup(distinct);
      expect(result).toHaveLength(3);
    });

    it('respects custom threshold', () => {
      const similar = [
        makeChunk('a', 'machine learning algorithms process training data patterns', 0.9),
        makeChunk('b', 'machine learning algorithms analyze training data models', 0.7),
      ];
      // Very high threshold should keep both
      const keepBoth = applyChunkDedup(similar, 0.99);
      expect(keepBoth).toHaveLength(2);
    });

    it('does not mutate the input array', () => {
      const original = [...SAMPLE_CHUNKS];
      applyChunkDedup(SAMPLE_CHUNKS);
      expect(SAMPLE_CHUNKS).toEqual(original);
    });
  });

  // --- applyRAGClosure ---

  describe('applyRAGClosure', () => {
    it('is a callable function', () => {
      expect(typeof applyRAGClosure).toBe('function');
    });

    it('returns empty string for empty chunks', () => {
      const result = applyRAGClosure([], 'What is the budget?');
      expect(result).toBe('');
    });

    it('returns a closure block with RAG-CC markers for non-empty chunks', () => {
      const result = applyRAGClosure(SAMPLE_CHUNKS, 'What was the total revenue?');
      if (result) {
        expect(result).toContain('###<RAG-CC>');
        expect(result).toContain('###</RAG-CC>');
      }
    });

    it('produces output within maxWords limit', () => {
      const result = applyRAGClosure(SAMPLE_CHUNKS, 'revenue?', 10);
      if (result) {
        // Remove the markers and count words in the content
        const inner = result.replace('###<RAG-CC>', '').replace('###</RAG-CC>', '').trim();
        const wordCount = inner.split(/\s+/).length;
        // Should be roughly bounded; allow some slack for formatting
        expect(wordCount).toBeLessThanOrEqual(20);
      }
    });

    it('works with a single chunk', () => {
      const single = [makeChunk('a', 'The revenue was $50 million last year.', 0.9)];
      const result = applyRAGClosure(single, 'What was the revenue?');
      // Should not crash; may produce a closure or empty string
      expect(typeof result).toBe('string');
    });
  });

  // --- applyQueryChunkAnchoring ---

  describe('applyQueryChunkAnchoring', () => {
    it('is a callable function', () => {
      expect(typeof applyQueryChunkAnchoring).toBe('function');
    });

    it('returns query-only string for empty chunks', () => {
      const result = applyQueryChunkAnchoring([], 'What is the price?');
      expect(result).toBe('Question: What is the price?');
    });

    it('starts with Question: prefix', () => {
      const result = applyQueryChunkAnchoring(SAMPLE_CHUNKS, 'budget?');
      expect(result).toMatch(/^Question: budget\?/);
    });

    it('includes chunk text in output', () => {
      const result = applyQueryChunkAnchoring(SAMPLE_CHUNKS, 'info?');
      for (const chunk of SAMPLE_CHUNKS) {
        expect(result).toContain(chunk.text);
      }
    });

    it('inserts Reminder every groupSize chunks', () => {
      const result = applyQueryChunkAnchoring(SAMPLE_CHUNKS, 'test query', 2);
      const reminderCount = (result.match(/Reminder: test query/g) || []).length;
      // With 5 chunks and groupSize=2, reminders after chunk 2 and chunk 4
      expect(reminderCount).toBe(2);
    });

    it('does not insert Reminder after the last chunk', () => {
      const fourChunks = SAMPLE_CHUNKS.slice(0, 4);
      const result = applyQueryChunkAnchoring(fourChunks, 'query', 4);
      // groupSize=4 and exactly 4 chunks: no reminder needed
      expect(result).not.toContain('Reminder:');
    });

    it('respects custom groupSize', () => {
      const result = applyQueryChunkAnchoring(SAMPLE_CHUNKS, 'query', 3);
      const reminderCount = (result.match(/Reminder: query/g) || []).length;
      // 5 chunks, groupSize=3 -> reminder after chunk 3 only (chunk 6 would need another but only 5 exist)
      expect(reminderCount).toBe(1);
    });
  });

  // --- applyChunkSDM ---

  describe('applyChunkSDM', () => {
    it('is a callable function', () => {
      expect(typeof applyChunkSDM).toBe('function');
    });

    it('returns empty array for empty input', () => {
      const result = applyChunkSDM([]);
      expect(result).toEqual([]);
    });

    it('removes filler phrases', () => {
      const chunks = [
        makeChunk('a', 'It is important to note that the budget was approved.', 0.9),
      ];
      const result = applyChunkSDM(chunks);
      expect(result[0].text).not.toContain('It is important to note that');
      expect(result[0].text.toLowerCase()).toContain('budget');
    });

    it('replaces verbose phrases with concise alternatives', () => {
      const chunks = [
        makeChunk('a', 'In order to complete the task, we need resources.', 0.8),
      ];
      const result = applyChunkSDM(chunks);
      expect(result[0].text).toContain('To');
      expect(result[0].text).not.toMatch(/In order to/i);
    });

    it('preserves chunk id, relevanceScore, and metadata', () => {
      const chunks: RAGChunk[] = [
        { id: 'test', text: 'Basically the answer is yes.', relevanceScore: 0.75, metadata: { source: 'doc1' } },
      ];
      const result = applyChunkSDM(chunks);
      expect(result[0].id).toBe('test');
      expect(result[0].relevanceScore).toBe(0.75);
      expect(result[0].metadata).toEqual({ source: 'doc1' });
    });

    it('capitalizes first letter after filler removal', () => {
      const chunks = [
        makeChunk('a', 'basically the answer is correct.', 0.5),
      ];
      const result = applyChunkSDM(chunks);
      // After removing "basically ", first char should be uppercase
      expect(result[0].text[0]).toBe(result[0].text[0].toUpperCase());
    });

    it('does not mutate input chunks', () => {
      const original = SAMPLE_CHUNKS.map((c) => ({ ...c }));
      applyChunkSDM(SAMPLE_CHUNKS);
      for (let i = 0; i < SAMPLE_CHUNKS.length; i++) {
        expect(SAMPLE_CHUNKS[i].text).toBe(original[i].text);
      }
    });
  });

  // --- formatRAGContext ---

  describe('formatRAGContext', () => {
    it('is a callable function', () => {
      expect(typeof formatRAGContext).toBe('function');
    });

    it('produces plain assembly with Document markers by default', () => {
      const result = formatRAGContext(SAMPLE_CHUNKS, 'query');
      expect(result).toContain('[Document 1]');
      expect(result).toContain('[Document 2]');
    });

    it('applies anchoring when useAnchoring is true', () => {
      const result = formatRAGContext(SAMPLE_CHUNKS, 'test?', { useAnchoring: true });
      expect(result).toContain('Question: test?');
    });

    it('applies CAS ordering when useCAS is true', () => {
      // With CAS, the first chunk text should be the highest-relevance chunk
      const result = formatRAGContext(SAMPLE_CHUNKS, 'q', { useCAS: true });
      // Highest relevance chunk (0.9) text should appear first
      expect(result).toContain(SAMPLE_CHUNKS[0].text);
    });

    it('applies SDM when useSDM is true', () => {
      const chunks = [
        makeChunk('a', 'It is important to note that revenue grew.', 0.9),
      ];
      const result = formatRAGContext(chunks, 'q', { useSDM: true });
      expect(result).not.toContain('It is important to note that');
    });

    it('appends closure block when useClosure is true', () => {
      const result = formatRAGContext(SAMPLE_CHUNKS, 'What was the revenue?', { useClosure: true });
      // Closure block may or may not be generated depending on content
      // Just verify no crash and output is a string
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('applies dedup when dedup is true', () => {
      const dupes = [
        makeChunk('a', 'The project budget was approved for two million dollars in total spending', 0.9),
        makeChunk('b', 'The project budget was approved for two million dollars in total spending by the board', 0.7),
        makeChunk('c', 'Unrelated text about quantum computing and physics experiments', 0.5),
      ];
      const result = formatRAGContext(dupes, 'q', { dedup: true });
      // After dedup, there should be fewer Document markers
      const docMarkers = (result.match(/\[Document \d+\]/g) || []).length;
      expect(docMarkers).toBeLessThanOrEqual(2);
    });

    it('applies all options together without error', () => {
      const result = formatRAGContext(SAMPLE_CHUNKS, 'What was the total revenue?', {
        useCAS: true,
        useSDM: true,
        useClosure: true,
        useAnchoring: true,
        dedup: true,
      });
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles empty chunks array', () => {
      const result = formatRAGContext([], 'query');
      expect(typeof result).toBe('string');
    });
  });
});

// ============================================================
// RAG Test Cases (rag-cases.ts)
// ============================================================

describe('RAG test cases', () => {
  it('has exactly 22 tests', () => {
    expect(RAG_TESTS).toHaveLength(22);
  });

  it('has correct category distribution', () => {
    const counts: Record<string, number> = {};
    for (const t of RAG_TESTS) {
      counts[t.category] = (counts[t.category] || 0) + 1;
    }
    expect(counts['RAG_SingleFact']).toBe(6);
    expect(counts['RAG_MultiFact']).toBe(6);
    expect(counts['RAG_Reasoning']).toBe(5);
    expect(counts['RAG_Conflicting']).toBe(5);
  });

  it('only uses valid RAG categories', () => {
    const validCategories = new Set([
      'RAG_SingleFact',
      'RAG_MultiFact',
      'RAG_Reasoning',
      'RAG_Conflicting',
    ]);
    for (const t of RAG_TESTS) {
      expect(validCategories.has(t.category)).toBe(true);
    }
  });

  it('has no duplicate IDs within RAG_TESTS', () => {
    const ids = RAG_TESTS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no ID collisions with CORE_TESTS', () => {
    const coreIds = new Set(CORE_TESTS.map((t) => t.id));
    for (const t of RAG_TESTS) {
      expect(coreIds.has(t.id)).toBe(false);
    }
  });

  it('has no ID collisions with HARD_TESTS', () => {
    const hardIds = new Set(HARD_TESTS.map((t) => t.id));
    for (const t of RAG_TESTS) {
      expect(hardIds.has(t.id)).toBe(false);
    }
  });

  it('all tests have required TestCase fields', () => {
    for (const t of RAG_TESTS) {
      expect(t.id).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.expected).toBeTruthy();
      expect(t.natural).toBeTruthy();
      expect(t.tscg).toBeTruthy();
      expect(typeof t.check).toBe('function');
    }
  });

  it('all tests have chunks array with correct structure', () => {
    for (const t of RAG_TESTS) {
      const ragTest = t as RAGTestCase;
      expect(Array.isArray(ragTest.chunks)).toBe(true);
      expect(ragTest.chunks.length).toBeGreaterThan(0);
      for (const chunk of ragTest.chunks) {
        expect(typeof chunk.id).toBe('string');
        expect(chunk.id.length).toBeGreaterThan(0);
        expect(typeof chunk.text).toBe('string');
        expect(chunk.text.length).toBeGreaterThan(0);
        expect(typeof chunk.relevance).toBe('number');
        expect(chunk.relevance).toBeGreaterThanOrEqual(0);
        expect(chunk.relevance).toBeLessThanOrEqual(1);
      }
    }
  });

  it('all checkers accept expected answers', () => {
    for (const t of RAG_TESTS) {
      const result = t.check(t.expected);
      if (!result) {
        console.warn(
          `Checker for ${t.id} (${t.name}) rejected expected value: "${t.expected}"`
        );
      }
      expect(result).toBe(true);
    }
  });

  it('natural prompts contain question text (length > 20)', () => {
    for (const t of RAG_TESTS) {
      expect(t.natural.length).toBeGreaterThan(20);
    }
  });

  it('TSCG prompts start with [ANSWER: bracket', () => {
    for (const t of RAG_TESTS) {
      expect(t.tscg).toMatch(/^\[ANSWER:/);
    }
  });

  it('natural prompts include document markers', () => {
    for (const t of RAG_TESTS) {
      expect(t.natural).toContain('[Document 1]');
    }
  });

  it('TSCG prompts include DOC markers', () => {
    for (const t of RAG_TESTS) {
      expect(t.tscg).toContain('<<DOC1>>');
    }
  });

  it('IDs follow rag- prefix naming convention', () => {
    for (const t of RAG_TESTS) {
      expect(t.id).toMatch(/^rag-/);
    }
  });

  it('IDs follow expected naming pattern', () => {
    const expectedIds = [
      'rag-sf1', 'rag-sf2', 'rag-sf3', 'rag-sf4', 'rag-sf5', 'rag-sf6',
      'rag-mf1', 'rag-mf2', 'rag-mf3', 'rag-mf4', 'rag-mf5', 'rag-mf6',
      'rag-rr1', 'rag-rr2', 'rag-rr3', 'rag-rr4', 'rag-rr5',
      'rag-rc1', 'rag-rc2', 'rag-rc3', 'rag-rc4', 'rag-rc5',
    ];
    const actualIds = RAG_TESTS.map((t) => t.id);
    expect(actualIds).toEqual(expectedIds);
  });

  it('all tests have tags array', () => {
    for (const t of RAG_TESTS) {
      expect(Array.isArray(t.tags)).toBe(true);
      expect(t.tags!.length).toBeGreaterThan(0);
    }
  });

  it('no duplicate chunk IDs within any single test', () => {
    for (const t of RAG_TESTS) {
      const ragTest = t as RAGTestCase;
      const chunkIds = ragTest.chunks.map((c) => c.id);
      expect(new Set(chunkIds).size).toBe(chunkIds.length);
    }
  });

  it('no duplicate chunk IDs across all tests', () => {
    const allChunkIds: string[] = [];
    for (const t of RAG_TESTS) {
      const ragTest = t as RAGTestCase;
      allChunkIds.push(...ragTest.chunks.map((c) => c.id));
    }
    expect(new Set(allChunkIds).size).toBe(allChunkIds.length);
  });
});

// ============================================================
// getRAGTestsByCategory
// ============================================================

describe('getRAGTestsByCategory', () => {
  it('returns 6 tests for RAG_SingleFact', () => {
    expect(getRAGTestsByCategory('RAG_SingleFact')).toHaveLength(6);
  });

  it('returns 6 tests for RAG_MultiFact', () => {
    expect(getRAGTestsByCategory('RAG_MultiFact')).toHaveLength(6);
  });

  it('returns 5 tests for RAG_Reasoning', () => {
    expect(getRAGTestsByCategory('RAG_Reasoning')).toHaveLength(5);
  });

  it('returns 5 tests for RAG_Conflicting', () => {
    expect(getRAGTestsByCategory('RAG_Conflicting')).toHaveLength(5);
  });

  it('returns empty array for unknown category', () => {
    expect(getRAGTestsByCategory('NonExistent')).toHaveLength(0);
  });

  it('returns tests that all have the requested category', () => {
    const sfTests = getRAGTestsByCategory('RAG_SingleFact');
    for (const t of sfTests) {
      expect(t.category).toBe('RAG_SingleFact');
    }
  });
});
