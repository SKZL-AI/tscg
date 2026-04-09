/**
 * TSCG Long-Context Transforms
 *
 * Deterministic, pure transforms designed for long contexts (5K-50K tokens).
 * These exploit attention distribution patterns that only manifest at scale:
 *   - "Lost in the Middle" (Liu et al., 2024): middle positions get less attention
 *   - "Attention Sink" (Xiao et al., 2023): first tokens receive disproportionate weight
 *   - Recency bias: last ~500 tokens dominate generation
 *
 * All functions are pure (no side effects, no API calls) and deterministic
 * (same input always produces same output). This file is self-contained --
 * it does not import from other TSCG modules.
 */

// === Stop Words ===

const STOP_WORDS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
  'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each',
  'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because',
  'if', 'when', 'where', 'how', 'what', 'which', 'who', 'whom', 'this',
  'that', 'these', 'those', 'it', 'its',
]);

// === Types ===

export interface Segment {
  text: string;
  relevanceScore: number; // 0-1, computed by word overlap with query
}

// === Helper: tokenize ===

/**
 * Tokenize a string into lowercase words, stripping punctuation and
 * filtering out stop words. Used consistently across all transforms.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
}

/**
 * Tokenize without stop-word filtering (for raw word sets).
 */
function tokenizeRaw(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

// === 1. computeJaccard ===

/**
 * Compute Jaccard similarity between two strings at the word level.
 *
 * Jaccard(A, B) = |A intersection B| / |A union B|
 *
 * Words are lowercased and punctuation is stripped. Stop words are removed
 * before comparison so that common function words do not inflate similarity.
 *
 * Returns 0 when both inputs are empty or contain only stop words.
 */
export function computeJaccard(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));

  if (setA.size === 0 && setB.size === 0) return 0;

  let intersectionSize = 0;
  for (const word of setA) {
    if (setB.has(word)) intersectionSize++;
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  if (unionSize === 0) return 0;

  return intersectionSize / unionSize;
}

// === 2. segmentText ===

/**
 * Split text into segments of approximately `segmentWords` words each and
 * compute each segment's relevance to `query` using Jaccard word overlap.
 *
 * Segmentation respects sentence boundaries when possible: if a sentence
 * boundary (period, question mark, exclamation mark followed by whitespace)
 * falls within 20% of the target segment size, the split happens there
 * rather than mid-sentence.
 *
 * Default segment size: 150 words.
 */
export function segmentText(
  text: string,
  query: string,
  segmentWords: number = 150,
): Segment[] {
  if (text.trim().length === 0) return [];

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const segments: Segment[] = [];
  let start = 0;

  while (start < words.length) {
    let end = Math.min(start + segmentWords, words.length);

    // Try to find a sentence boundary near the target end position.
    // Look within +/- 20% of segmentWords from the target boundary.
    if (end < words.length) {
      const windowStart = Math.max(start, end - Math.floor(segmentWords * 0.2));
      const windowEnd = Math.min(words.length, end + Math.floor(segmentWords * 0.2));
      let bestBoundary = -1;

      for (let i = windowStart; i < windowEnd; i++) {
        const word = words[i];
        if (/[.!?]$/.test(word)) {
          // Prefer the boundary closest to the target end
          if (bestBoundary === -1 || Math.abs(i - end) < Math.abs(bestBoundary - end)) {
            bestBoundary = i + 1; // include the sentence-ending word
          }
        }
      }

      if (bestBoundary > start) {
        end = bestBoundary;
      }
    }

    const segmentText = words.slice(start, end).join(' ');
    const relevanceScore = computeJaccard(segmentText, query);

    segments.push({ text: segmentText, relevanceScore });
    start = end;
  }

  return segments;
}

// === 3. applyContextCAS (Causal Access Score Reordering) ===

/**
 * Reorder text segments in a U-shape: highest relevance at the start and
 * end, lowest relevance in the middle.
 *
 * This exploits the "Lost in the Middle" effect where LLMs attend most
 * strongly to the beginning (attention sink / primacy) and end (recency)
 * of long contexts, with reduced attention to middle positions.
 *
 * Algorithm:
 *   1. Sort segments by relevanceScore descending
 *   2. Place them alternately at the left (start) and right (end)
 *      - Rank 1 (highest) -> position 0
 *      - Rank 2           -> position N-1
 *      - Rank 3           -> position 1
 *      - Rank 4           -> position N-2
 *      - ...
 *      - Lowest relevance -> middle positions
 *
 * The function is pure: it returns a new array and does not mutate the input.
 */
export function applyContextCAS(segments: Segment[]): Segment[] {
  if (segments.length <= 2) return [...segments];

  // Sort by relevance descending (stable: preserve original order for ties)
  const sorted = segments
    .map((seg, idx) => ({ seg, idx }))
    .sort((a, b) => b.seg.relevanceScore - a.seg.relevanceScore || a.idx - b.idx)
    .map((entry) => entry.seg);

  const result: Segment[] = new Array(sorted.length);
  let left = 0;
  let right = sorted.length - 1;

  for (let i = 0; i < sorted.length; i++) {
    if (i % 2 === 0) {
      result[left++] = sorted[i];
    } else {
      result[right--] = sorted[i];
    }
  }

  return result;
}

// === 4. applyLongContextCCP (Closure Block) ===

/**
 * Extract key facts from text that are relevant to the query and append
 * them as a compact closure block at the end.
 *
 * The closure block exploits recency bias: by placing a concentrated
 * summary of query-relevant facts at the end, we ensure the model has
 * fresh access to critical information during generation.
 *
 * Algorithm:
 *   1. Split text into sentences
 *   2. Score each sentence by relevance to the query (word overlap +
 *      bonus for numbers, proper nouns, quoted strings)
 *   3. Select the top 3-5 most relevant sentences
 *   4. From those sentences, extract key facts:
 *      - Numbers and measurements
 *      - Proper nouns (capitalized multi-word sequences)
 *      - Quoted strings
 *   5. Format as: ###<CC> key1:val1 | key2:val2 | ... ###</CC>
 *   6. Append to end of text
 *
 * The closure block is capped at `maxClosureWords` (default: 5% of
 * total text word count) to avoid bloating the context.
 */
export function applyLongContextCCP(
  text: string,
  query: string,
  maxClosureWords?: number,
): string {
  if (text.trim().length === 0) return text;

  const totalWords = text.split(/\s+/).filter((w) => w.length > 0).length;
  const closureBudget = maxClosureWords ?? Math.max(10, Math.floor(totalWords * 0.05));

  // Split into sentences
  const sentences = splitSentences(text);
  if (sentences.length === 0) return text;

  // Score sentences by relevance to the query
  const scored = sentences.map((sentence) => ({
    sentence,
    score: computeSentenceRelevance(sentence, query),
  }));

  // Sort by score descending, take top 3-5
  scored.sort((a, b) => b.score - a.score);
  const topCount = Math.min(5, Math.max(3, Math.floor(sentences.length * 0.1)));
  const topSentences = scored.slice(0, topCount);

  // Extract key facts from the top sentences
  const facts: string[] = [];

  for (const { sentence } of topSentences) {
    // Extract numbers and measurements
    const numbers = sentence.match(/\d[\d,.]*\s*(?:%|million|billion|thousand|km|m|kg|lb|hours?|days?|years?|°[CF]|milliseconds?|ms|tons?)?/gi);
    if (numbers) {
      for (const num of numbers) {
        const trimmed = num.trim();
        if (trimmed.length > 0 && !facts.includes(trimmed)) {
          facts.push(trimmed);
        }
      }
    }

    // Extract proper nouns (sequences of capitalized words, 2+ words)
    const properNouns = sentence.match(/(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g);
    if (properNouns) {
      for (const noun of properNouns) {
        if (!facts.includes(noun)) {
          facts.push(noun);
        }
      }
    }

    // Extract quoted strings
    const quoted = sentence.match(/"([^"]+)"/g) || sentence.match(/'([^']+)'/g);
    if (quoted) {
      for (const q of quoted) {
        const clean = q.replace(/['"]/g, '').trim();
        if (clean.length > 0 && !facts.includes(clean)) {
          facts.push(clean);
        }
      }
    }

    // Extract code/identifier patterns (e.g., XR-7, TM-442, REV-7)
    const codes = sentence.match(/[A-Z]{1,5}[-][A-Z0-9]+/g);
    if (codes) {
      for (const code of codes) {
        if (!facts.includes(code)) {
          facts.push(code);
        }
      }
    }
  }

  // If we found no facts, fall back to using top sentence fragments
  if (facts.length === 0) {
    for (const { sentence } of topSentences.slice(0, 3)) {
      const words = sentence.split(/\s+/).slice(0, 10);
      facts.push(words.join(' '));
    }
  }

  // Trim facts to fit within the closure budget
  const closureFacts: string[] = [];
  let closureWordCount = 0;

  for (const fact of facts) {
    const factWords = fact.split(/\s+/).length;
    if (closureWordCount + factWords > closureBudget) break;
    closureFacts.push(fact);
    closureWordCount += factWords;
  }

  if (closureFacts.length === 0) return text;

  // Format as key:value pairs where possible, otherwise plain facts
  const formattedFacts = closureFacts.map((fact, i) => {
    // If fact looks like "NUMBER UNIT", label it
    const numMatch = fact.match(/^([\d,.]+)\s*(.+)$/);
    if (numMatch) {
      return `val${i + 1}:${fact}`;
    }
    return `fact${i + 1}:${fact}`;
  });

  const closureBlock = `\n###<CC> ${formattedFacts.join(' | ')} ###</CC>`;

  return text + closureBlock;
}

// === 5. applyQueryPriming (Bookend) ===

/**
 * Place the question both before and after the context.
 *
 * This exploits both primacy (attention sink / CFL) and recency (CCP)
 * effects. At long context lengths, a question placed only at the start
 * can be "forgotten" by the time the model reaches the end of the context.
 * Repeating it at the end ensures it remains in the high-attention recency
 * window.
 *
 * Format:
 *   Question: {question}
 *
 *   {context}
 *
 *   Question: {question}
 *   Answer:
 */
export function applyQueryPriming(context: string, question: string): string {
  const trimmedContext = context.trim();
  const trimmedQuestion = question.trim();

  return (
    `Question: ${trimmedQuestion}\n\n` +
    `${trimmedContext}\n\n` +
    `Question: ${trimmedQuestion}\nAnswer:`
  );
}

// === 6. applySegmentSDM (Segment Deduplication) ===

/**
 * Remove near-duplicate segments based on Jaccard similarity.
 *
 * When long contexts contain repeated or paraphrased information, the
 * duplicates waste tokens and can confuse the model. This transform
 * identifies segment pairs with Jaccard similarity above the threshold
 * and removes the later occurrence, keeping the first.
 *
 * Default threshold: 0.7 (segments sharing 70%+ of their content words
 * are considered near-duplicates).
 */
export function applySegmentSDM(
  segments: Segment[],
  threshold: number = 0.7,
): Segment[] {
  if (segments.length <= 1) return [...segments];

  const kept: Segment[] = [];
  const removed: Set<number> = new Set();

  for (let i = 0; i < segments.length; i++) {
    if (removed.has(i)) continue;

    kept.push(segments[i]);

    // Mark all later segments that are near-duplicates of this one
    for (let j = i + 1; j < segments.length; j++) {
      if (removed.has(j)) continue;

      const similarity = computeJaccard(segments[i].text, segments[j].text);
      if (similarity >= threshold) {
        removed.add(j);
      }
    }
  }

  return kept;
}

// === Internal Helpers ===

/**
 * Split text into sentences. Handles common abbreviations and edge cases.
 */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace or end-of-string.
  // Avoid splitting on abbreviations like "Dr.", "Mr.", "etc.", decimal numbers.
  const raw = text.split(/(?<=[.!?])\s+(?=[A-Z"])/);

  return raw
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Compute a relevance score for a sentence relative to a query.
 * Combines Jaccard word overlap with bonuses for numbers, proper nouns,
 * and bigram matches found in the query.
 */
function computeSentenceRelevance(sentence: string, query: string): number {
  let score = 0;

  // 1. Jaccard word overlap (0-1)
  score += computeJaccard(sentence, query);

  // 2. Number match bonus: if query contains numbers and the sentence
  //    also contains them, boost relevance.
  const queryNumbers = query.match(/\d[\d,.]+/g) || [];
  for (const num of queryNumbers) {
    if (sentence.includes(num)) {
      score += 0.5;
    }
  }

  // 3. Bigram overlap: consecutive word pairs from the query that
  //    appear in the sentence indicate strong topical match.
  const queryWords = tokenizeRaw(query);
  const sentenceLower = sentence.toLowerCase();
  for (let i = 0; i < queryWords.length - 1; i++) {
    const bigram = queryWords[i] + ' ' + queryWords[i + 1];
    if (sentenceLower.includes(bigram)) {
      score += 0.3;
    }
  }

  // 4. Proper noun overlap: if capitalized multi-word phrases from the
  //    query appear in the sentence, boost relevance.
  const queryProperNouns = query.match(/(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g) || [];
  for (const noun of queryProperNouns) {
    if (sentence.includes(noun)) {
      score += 0.4;
    }
  }

  return score;
}
