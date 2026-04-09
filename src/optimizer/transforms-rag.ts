/**
 * TSCG RAG Chunk-Ordering Transforms
 *
 * RAG-specific transforms for optimizing how retrieved chunks are presented
 * to an LLM. Operates at chunk level rather than prompt level.
 *
 * Transforms:
 *   1. applyChunkCAS   - U-Shape ordering (attention sink + recency)
 *   2. applyChunkDedup  - Remove near-duplicate chunks (Jaccard similarity)
 *   3. applyRAGClosure  - Compact summary block from top-K chunks
 *   4. applyQueryChunkAnchoring - Insert query reminders between groups
 *   5. applyChunkSDM    - Filler word removal per chunk
 *   6. formatRAGContext  - Combine all transforms into final context
 *
 * All functions are pure, deterministic, and require no API calls.
 * Self-contained: no imports from other TSCG files.
 */

// === Types ===

export interface RAGChunk {
  id: string;
  text: string;
  relevanceScore: number;  // 0-1, from retriever
  metadata?: Record<string, unknown>;
}

export interface RAGResult {
  chunks: RAGChunk[];
  closureBlock?: string;
  totalTokensEstimate: number;
}

// === Stop Words for Jaccard Similarity ===

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'will', 'would', 'could', 'should', 'shall', 'may', 'might', 'must',
  'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'in', 'on', 'at', 'to', 'of', 'by', 'with', 'from', 'up', 'about',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'not', 'only', 'own', 'same', 'than', 'too',
  'very', 'can', 'just', 'don', 'now', 'also', 'its', 'it', 'this',
  'that', 'these', 'those', 'what', 'which', 'who', 'whom',
  'her', 'his', 'him', 'she', 'he', 'they', 'them', 'their',
  'our', 'your', 'we', 'you', 'me', 'my',
]);

// === Helpers ===

/**
 * Extract a set of meaningful words from text, excluding stop words
 * and words shorter than 3 characters.
 */
function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
}

/**
 * Jaccard similarity between two word sets.
 * Returns 0-1 (0 = no overlap, 1 = identical).
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// === SDM Filler Patterns for Chunk Compression ===

/**
 * Filler patterns commonly found in retrieved document chunks.
 * Includes both RAG-specific verbose patterns and standard SDM fillers.
 */
const CHUNK_FILLER_PATTERNS: Array<[RegExp, string]> = [
  // RAG-specific verbose patterns (document prose)
  [/\bIt is important to note that\s*/gi, ''],
  [/\bIt should be noted that\s*/gi, ''],
  [/\bIn order to\b/gi, 'To'],
  [/\bAs a matter of fact,?\s*/gi, ''],
  [/\bIt is worth mentioning that\s*/gi, ''],
  [/\bIt is widely known that\s*/gi, ''],
  [/\bIt goes without saying that\s*/gi, ''],
  [/\bFor all intents and purposes,?\s*/gi, ''],
  [/\bAt the end of the day,?\s*/gi, ''],
  [/\bIn the event that\b/gi, 'If'],
  [/\bDue to the fact that\b/gi, 'Because'],
  [/\bIn light of the fact that\b/gi, 'Since'],
  [/\bWith regard to\b/gi, 'Regarding'],
  [/\bWith respect to\b/gi, 'Regarding'],
  [/\bIn terms of\b/gi, 'For'],
  [/\bA large number of\b/gi, 'Many'],
  [/\bA significant number of\b/gi, 'Many'],
  [/\bThe vast majority of\b/gi, 'Most'],
  [/\bOn the other hand,?\s*/gi, ''],
  [/\bNeedless to say,?\s*/gi, ''],
  [/\bAs a result of this,?\s*/gi, 'Therefore, '],
  [/\bIn conclusion,?\s*/gi, ''],
  [/\bTo summarize,?\s*/gi, ''],
  [/\bAs previously mentioned,?\s*/gi, ''],
  [/\bAs noted (above|earlier|previously),?\s*/gi, ''],

  // Standard SDM filler adverbs
  [/\b(basically|essentially|actually|really|quite|rather|somewhat|literally|simply|obviously|clearly|certainly|definitely|undoubtedly)\s+/gi, ''],

  // Hedging in documents
  [/\bIt can be said that\s*/gi, ''],
  [/\bIt has been suggested that\s*/gi, ''],
  [/\bIt is generally accepted that\s*/gi, ''],
  [/\bThere is no doubt that\s*/gi, ''],
  [/\bIt is evident that\s*/gi, ''],

  // Verbose connectors
  [/\bIn other words,?\s*/gi, ''],
  [/\bThat is to say,?\s*/gi, ''],

  // Clean up multiple spaces
  [/\s{2,}/g, ' '],
];

// === Transform 1: Chunk-CAS (U-Shape Ordering) ===

/**
 * Reorder chunks in U-shape: highest relevance at position 0 and N,
 * lowest in the middle. Exploits the "lost in the middle" effect where
 * LLMs pay most attention to the beginning and end of context.
 *
 * Algorithm:
 *   1. Sort chunks by relevance (descending)
 *   2. Place alternately at start and end of result array
 *   Result: [1st, 3rd, 5th, ..., 6th, 4th, 2nd]
 */
export function applyChunkCAS(chunks: RAGChunk[]): RAGChunk[] {
  if (chunks.length <= 2) {
    return [...chunks];
  }

  // Sort by relevance descending
  const sorted = [...chunks].sort((a, b) => b.relevanceScore - a.relevanceScore);

  const result: RAGChunk[] = new Array(sorted.length);
  let left = 0;
  let right = sorted.length - 1;

  for (let i = 0; i < sorted.length; i++) {
    if (i % 2 === 0) {
      // Even indices (0, 2, 4, ...) -> place at start (highest relevance first)
      result[left] = sorted[i];
      left++;
    } else {
      // Odd indices (1, 3, 5, ...) -> place at end (second-highest near end)
      result[right] = sorted[i];
      right--;
    }
  }

  return result;
}

// === Transform 2: Chunk Deduplication ===

/**
 * Remove chunks with high text similarity (Jaccard > threshold).
 * When two chunks are similar, keeps the one with the higher relevance score.
 *
 * Default threshold: 0.6 (conservative -- only removes near-duplicates).
 */
export function applyChunkDedup(
  chunks: RAGChunk[],
  threshold = 0.6
): RAGChunk[] {
  if (chunks.length <= 1) {
    return [...chunks];
  }

  // Pre-compute word sets for all chunks
  const wordSets = chunks.map((c) => wordSet(c.text));

  // Track which chunks to keep (indices)
  const removed = new Set<number>();

  for (let i = 0; i < chunks.length; i++) {
    if (removed.has(i)) continue;

    for (let j = i + 1; j < chunks.length; j++) {
      if (removed.has(j)) continue;

      const similarity = jaccard(wordSets[i], wordSets[j]);
      if (similarity > threshold) {
        // Remove the one with lower relevance
        if (chunks[i].relevanceScore >= chunks[j].relevanceScore) {
          removed.add(j);
        } else {
          removed.add(i);
          break; // i is removed, no need to compare further
        }
      }
    }
  }

  return chunks.filter((_, idx) => !removed.has(idx));
}

// === Transform 3: RAG Closure Block ===

/**
 * Create a compact closure block from top-K chunks.
 * Extracts: numbers, proper nouns, key facts.
 * Format: ###<RAG-CC> fact1 | fact2 | ... ###</RAG-CC>
 *
 * The closure block acts as a "recency anchor" at the end of context,
 * reinforcing the most important facts just before the LLM generates.
 */
export function applyRAGClosure(
  chunks: RAGChunk[],
  query: string,
  maxWords = 100
): string {
  if (chunks.length === 0) {
    return '';
  }

  // Take top 3 chunks by relevance
  const topChunks = [...chunks]
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 3);

  const allText = topChunks.map((c) => c.text).join(' ');

  // Split into sentences
  const sentences = allText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Extract sentences containing numbers or proper nouns (capitalized words not at sentence start)
  const factSentences: string[] = [];
  const queryWords = wordSet(query);

  for (const sentence of sentences) {
    const hasNumber = /\d/.test(sentence);
    // Proper noun: capitalized word not at start of sentence, at least 2 chars
    const hasProperNoun = /(?:^.+?\s)([A-Z][a-z]{1,})/m.test(sentence);
    // Contains query-relevant terms
    const sentenceWords = wordSet(sentence);
    const queryOverlap = [...queryWords].some((qw) => sentenceWords.has(qw));

    if (hasNumber || hasProperNoun || queryOverlap) {
      factSentences.push(sentence);
    }
  }

  // If no fact sentences found, take first sentences from top chunks
  if (factSentences.length === 0) {
    for (const chunk of topChunks) {
      const firstSentence = chunk.text.split(/(?<=[.!?])\s+/)[0];
      if (firstSentence) {
        factSentences.push(firstSentence.trim());
      }
    }
  }

  // Convert to compact key:value format
  const facts: string[] = [];
  let wordCount = 0;

  for (const sentence of factSentences) {
    if (wordCount >= maxWords) break;

    // Try to extract key:value pairs from the sentence
    const compact = compactifyFact(sentence);
    const compactWords = compact.split(/\s+/).length;

    if (wordCount + compactWords <= maxWords) {
      facts.push(compact);
      wordCount += compactWords;
    }
  }

  if (facts.length === 0) {
    return '';
  }

  return `###<RAG-CC> ${facts.join(' | ')} ###</RAG-CC>`;
}

/**
 * Compress a sentence into a compact fact representation.
 * Extracts the core assertion, removing filler.
 */
function compactifyFact(sentence: string): string {
  let fact = sentence.trim();

  // Remove trailing period
  fact = fact.replace(/\.\s*$/, '');

  // Try to extract "Subject verb number/value" patterns
  // e.g., "The company's total revenue reached $847 million" -> "revenue:$847M"
  const numMatch = fact.match(
    /\b([\w\s'-]+?)\s+(?:was|is|are|were|reached|totaled?|amounted?\s+to|reported|recorded)\s+([$€£]?\d[\d,.]*\s*(?:million|billion|trillion|thousand|percent|%|kg|km|m|cm)?)/i
  );
  if (numMatch) {
    const key = numMatch[1].trim().replace(/^(?:the|a|an)\s+/i, '').trim();
    const value = numMatch[2].trim();
    return `${key}:${value}`;
  }

  // Try "X of Y" patterns with numbers
  const ofMatch = fact.match(
    /\b([\w\s'-]+?)\s+of\s+([$€£]?\d[\d,.]*\s*(?:million|billion|trillion|thousand|percent|%)?)/i
  );
  if (ofMatch) {
    const key = ofMatch[1].trim().replace(/^(?:the|a|an)\s+/i, '').trim();
    const value = ofMatch[2].trim();
    return `${key}:${value}`;
  }

  // Fallback: just remove common filler from the sentence
  fact = fact.replace(/\b(?:the|a|an|was|is|are|were|has|have|had|been|which|that|this)\b\s*/gi, '');
  fact = fact.replace(/\s{2,}/g, ' ').trim();

  // Truncate if too long
  const words = fact.split(/\s+/);
  if (words.length > 15) {
    fact = words.slice(0, 15).join(' ');
  }

  return fact;
}

// === Transform 4: Query-Chunk Anchoring ===

/**
 * Insert query reminder text between groups of chunks.
 * For N chunks, insert a reminder every groupSize chunks.
 *
 * This exploits the SAD-F principle at context level: repeating the query
 * ensures the LLM maintains focus on what is being asked even in long contexts.
 *
 * Default groupSize: 4.
 *
 * Output format:
 *   Question: {query}
 *
 *   [Chunk 1 text]
 *   [Chunk 2 text]
 *   ...
 *
 *   Reminder: {query}
 *
 *   [Chunk 5 text]
 *   ...
 */
export function applyQueryChunkAnchoring(
  chunks: RAGChunk[],
  query: string,
  groupSize = 4
): string {
  if (chunks.length === 0) {
    return `Question: ${query}`;
  }

  const parts: string[] = [];
  parts.push(`Question: ${query}`);
  parts.push('');

  for (let i = 0; i < chunks.length; i++) {
    parts.push(chunks[i].text);

    // Insert reminder after every groupSize chunks (but not after the last chunk)
    if ((i + 1) % groupSize === 0 && i + 1 < chunks.length) {
      parts.push('');
      parts.push(`Reminder: ${query}`);
      parts.push('');
    }
  }

  return parts.join('\n');
}

// === Transform 5: Chunk-SDM (Intra-Chunk Compression) ===

/**
 * Apply basic SDM (filler word removal) to each chunk individually.
 * Returns new chunks with compressed text. Chunk boundaries and metadata
 * are preserved; only the text field is modified.
 */
export function applyChunkSDM(chunks: RAGChunk[]): RAGChunk[] {
  return chunks.map((chunk) => {
    let text = chunk.text;

    for (const [pattern, replacement] of CHUNK_FILLER_PATTERNS) {
      text = text.replace(pattern, replacement);
    }

    text = text.trim();

    // Capitalize first letter if lowered after filler removal
    if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
      text = text[0].toUpperCase() + text.slice(1);
    }

    return {
      ...chunk,
      text,
    };
  });
}

// === Transform 6: Format RAG Context (Pipeline) ===

/**
 * Format chunks into a complete RAG context string.
 * Optionally applies: dedup, CAS ordering, SDM compression,
 * query anchoring, and closure block.
 *
 * Pipeline order:
 *   1. Dedup (remove near-duplicates first to reduce volume)
 *   2. SDM (compress individual chunks)
 *   3. CAS (reorder for attention optimization)
 *   4. Anchoring or plain assembly (build the text)
 *   5. Closure (append summary block at the end)
 */
export function formatRAGContext(
  chunks: RAGChunk[],
  query: string,
  options?: {
    useCAS?: boolean;
    useSDM?: boolean;
    useClosure?: boolean;
    useAnchoring?: boolean;
    dedup?: boolean;
  }
): string {
  const opts = {
    useCAS: false,
    useSDM: false,
    useClosure: false,
    useAnchoring: false,
    dedup: false,
    ...options,
  };

  let processed = [...chunks];

  // 1. Deduplication
  if (opts.dedup) {
    processed = applyChunkDedup(processed);
  }

  // 2. Chunk-level SDM compression
  if (opts.useSDM) {
    processed = applyChunkSDM(processed);
  }

  // 3. CAS U-shape ordering
  if (opts.useCAS) {
    processed = applyChunkCAS(processed);
  }

  // 4. Assemble text (with or without anchoring)
  let assembled: string;
  if (opts.useAnchoring) {
    assembled = applyQueryChunkAnchoring(processed, query);
  } else {
    // Plain assembly with document markers
    const parts: string[] = [];
    for (let i = 0; i < processed.length; i++) {
      parts.push(`[Document ${i + 1}]`);
      parts.push(processed[i].text);
    }
    assembled = parts.join('\n');
  }

  // 5. Closure block
  if (opts.useClosure) {
    const closure = applyRAGClosure(processed, query);
    if (closure) {
      assembled = assembled + '\n\n' + closure;
    }
  }

  return assembled;
}
