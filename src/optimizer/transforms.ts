/**
 * TSCG Deterministic Transforms
 * Implements all 8 TSCG principles as composable, deterministic transforms.
 * No API calls — pure string transformation based on prompt analysis.
 *
 * Transforms are ordered by the causal pipeline:
 *   1. SDM  — Semantic Density Maximization (strip filler first)
 *   2. CFL  — Constraint-First Layout (prepend output constraint)
 *   3. CFO  — Causal-Forward Ordering (reorder dependencies left→right)
 *   4. DRO  — Delimiter-Role Optimization (key:value, →, |)
 *   5. TAS  — Tokenizer-Aligned Syntax (BPE-optimal delimiters)
 *   6. CCP  — Causal Closure Principle (append closure block)
 *   7. CAS  — Causal Access Score (position critical info early)
 *   8. SAD-F — Selective Anchor Duplication with Fragility weighting
 */

import type { PromptAnalysis, PromptParameter, OutputFormat } from './analyzer.js';

// === TPD — Tokenizer-Profiled Delimiters ===

/**
 * Tokenizer profile identifier.
 * Each profile maps to delimiters that are single tokens in that model's BPE vocabulary.
 */
export type TokenizerProfile = 'claude' | 'gpt4o' | 'llama3' | 'universal';

/**
 * Delimiter set for a tokenizer profile.
 * `arrow` replaces " -> ", " => " style arrows.
 * `pipe` replaces " | " style separators.
 * `dot` replaces " : " style key-value separators.
 */
interface DelimiterSet {
  arrow: string;
  pipe: string;
  dot: string;
}

const DELIMITER_PROFILES: Record<TokenizerProfile, DelimiterSet> = {
  claude: { arrow: '\u2192', pipe: '|', dot: '\u00B7' },   // →, |, ·
  gpt4o:  { arrow: '\u2192', pipe: '|', dot: '\u00B7' },   // |, →, ·  (same chars, ordering preference differs but replacement targets are identical)
  llama3: { arrow: '\u2192', pipe: '|', dot: '\u00B7' },   // |, →, ·
  universal: { arrow: '-', pipe: '|', dot: ':' },           // ASCII-only, safe for all tokenizers
};

/**
 * TPD — Tokenizer-Profiled Delimiters.
 *
 * Replaces common multi-token delimiters with single-token equivalents
 * optimal for the target tokenizer's BPE vocabulary.
 *
 * Replacement targets:
 *   " -> "  =>  profile.arrow
 *   " => "  =>  profile.arrow
 *   " | "   =>  profile.pipe (surrounded by spaces)
 *   " : "   =>  profile.dot  (surrounded by spaces, outside brackets)
 */
export function applyTPD(text: string, profile: TokenizerProfile = 'claude'): string {
  const delims = DELIMITER_PROFILES[profile];
  let result = text;

  // Replace " -> " and " => " with the profile's arrow delimiter
  result = result.replace(/\s*->\s*/g, delims.arrow);
  result = result.replace(/\s*=>\s*/g, delims.arrow);

  // Replace " | " (pipe with surrounding spaces) — preserve pipes inside bracket expressions
  result = result.replace(/\s+\|\s+/g, delims.pipe);

  // Replace " : " (colon with surrounding spaces) — only outside bracket/constraint tags
  // We do NOT replace colons inside [ANSWER:...] or key:value pairs that are already tight
  result = result.replace(/(?<!\[[\w]*)\s+:\s+(?![^\[]*\])/g, delims.dot);

  return result;
}

// === ICoT — Implicit Chain-of-Thought Priming ===

/**
 * ICoT — Implicit Chain-of-Thought Priming.
 *
 * For reasoning/math prompts, appends a minimal 1-2 token chain-of-thought
 * primer that nudges the model toward step-by-step reasoning without
 * adding verbose "think step by step" instructions.
 *
 * Only activates when:
 *   - promptType includes 'reasoning' or 'math'
 *   - The text does not already contain step/think/chain/→→ cues
 *
 * For non-reasoning prompts, returns text unchanged.
 */
export function applyICoT(text: string, promptType: string): string {
  const lower = promptType.toLowerCase();
  if (!lower.includes('reasoning') && !lower.includes('math')) {
    return text;
  }

  // Check if text already has a chain-of-thought cue
  const textLower = text.toLowerCase();
  if (
    textLower.includes('step') ||
    textLower.includes('think') ||
    textLower.includes('chain') ||
    text.includes('\u2192\u2192')  // →→
  ) {
    return text;
  }

  return text + ' \u2192 steps:';
}

// === ADC — Adaptive Density Control ===
// Three-tier categorization for filler removal.
// Unlike binary SDM, ADC preserves amplifiers and applies contextual heuristics
// for words that are only redundant in certain positions.

/** Words that are always safe to strip — pure politeness / padding. */
export const ADC_REMOVE_ALWAYS: ReadonlyArray<string> = [
  'please',
  'kindly',
  'could you',
  'I would like',
  'I want you to',
  'Can you',
];

/**
 * Words removed only when they appear before an adjective/adverb and add no
 * semantic weight.  Simple heuristic: remove when the next word is NOT a
 * common noun/verb (i.e. it is likely an adjective or adverb).
 */
export const ADC_REMOVE_IF_REDUNDANT: ReadonlyArray<string> = [
  'very',
  'really',
  'quite',
  'actually',
  'just',
];

/** Words that sharpen meaning — must be kept. */
export const ADC_KEEP_AS_AMPLIFIER: ReadonlyArray<string> = [
  'exactly',
  'must',
  'never',
  'critical',
  'required',
  'strictly',
  'only',
];

// Common nouns/verbs used by the redundancy heuristic.  When a
// REMOVE_IF_REDUNDANT word is followed by one of these the word is
// considered meaningful and kept (e.g. "just run" keeps "just").
const NOUN_VERB_STARTS = new Set<string>([
  // high-frequency verbs
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'say', 'said', 'get', 'got', 'make', 'made',
  'go', 'went', 'gone', 'take', 'took', 'taken',
  'come', 'came', 'see', 'saw', 'know', 'knew',
  'give', 'gave', 'find', 'found', 'think', 'thought',
  'tell', 'told', 'run', 'ran', 'write', 'wrote',
  'read', 'call', 'called', 'try', 'tried', 'need',
  'want', 'use', 'used', 'work', 'worked', 'start',
  'move', 'moved', 'put', 'set', 'keep', 'kept',
  'let', 'begin', 'began', 'show', 'showed', 'shown',
  'help', 'talk', 'turn', 'play', 'send', 'sent',
  'build', 'built', 'return', 'returned', 'create',
  // common nouns
  'the', 'a', 'an', 'this', 'that', 'it', 'its',
  'people', 'time', 'day', 'way', 'year', 'man', 'woman',
  'child', 'world', 'life', 'hand', 'part', 'place',
  'thing', 'case', 'week', 'system', 'program', 'question',
  'home', 'water', 'room', 'number', 'data', 'code',
  'file', 'name', 'point', 'list', 'result', 'output',
  'input', 'value', 'text', 'line', 'word', 'type',
]);

/**
 * Adaptive Density Control transform.
 *
 * Applies 3-tier filler removal:
 *   - REMOVE_ALWAYS  — stripped unconditionally
 *   - REMOVE_IF_REDUNDANT — stripped only before adjectives/adverbs
 *   - KEEP_AS_AMPLIFIER — never touched
 *
 * Returns the cleaned text with leading/trailing whitespace trimmed and
 * first character uppercased.
 */
export function applyADC(text: string): string {
  if (text.length === 0) return text;

  let result = text;

  // --- Tier 1: REMOVE_ALWAYS (case-insensitive, phrase-level) ---
  for (const phrase of ADC_REMOVE_ALWAYS) {
    // Build a pattern that matches the phrase surrounded by word boundaries
    // (or start/end of string) with optional trailing/leading whitespace.
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b\\s*`, 'gi');
    result = result.replace(pattern, '');
  }

  // --- Tier 2: REMOVE_IF_REDUNDANT (contextual) ---
  // For each redundant word, check the word that follows.
  // Remove only when the next word is NOT in NOUN_VERB_STARTS
  // (heuristic: it is probably an adjective or adverb).
  for (const word of ADC_REMOVE_IF_REDUNDANT) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\s+(\\S+)`, 'gi');
    result = result.replace(pattern, (_match, nextWord: string) => {
      const lower = nextWord.toLowerCase().replace(/[^a-z]/g, '');
      if (NOUN_VERB_STARTS.has(lower)) {
        // Next word is a noun/verb — keep the qualifier, it might matter.
        return `${word} ${nextWord}`;
      }
      // Next word is likely an adjective/adverb — drop the qualifier.
      return nextWord;
    });
  }

  // --- Tier 3: KEEP_AS_AMPLIFIER — no action needed, they stay. ---

  // Clean up multiple spaces and trim.
  result = result.replace(/\s{2,}/g, ' ').trim();

  // Capitalize first letter if lowered after removals.
  if (result.length > 0 && result[0] !== result[0].toUpperCase()) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  return result;
}

// === Transform Result ===

export interface TransformResult {
  name: string;           // transform name (e.g. "SDM", "CFL")
  applied: boolean;       // whether transform was actually applied
  input: string;          // text before transform
  output: string;         // text after transform
  tokensRemoved: number;  // estimated tokens removed (negative = added)
  description: string;    // human-readable description of what happened
}

export interface TransformPipeline {
  transforms: TransformResult[];
  original: string;
  optimized: string;
  totalTokensBefore: number;
  totalTokensAfter: number;
  compressionRatio: number;
}

// === 1. SDM — Semantic Density Maximization ===

const FILLER_REMOVAL_PATTERNS: Array<[RegExp, string]> = [
  // Politeness wrappers
  [/^(?:Please|Kindly|Could you|Would you|Can you|I would like you to|I want you to|I need you to|Help me)\s+/i, ''],
  [/\s*(?:please|kindly)\s*[.?!]?\s*$/i, ''],
  [/\s+please\b/gi, ''],
  [/\bplease\s+/gi, ''],

  // Hedging & uncertainty
  [/\bI think\s+/gi, ''],
  [/\bI believe\s+/gi, ''],
  [/\bI feel like\s+/gi, ''],
  [/\bIn my opinion,?\s*/gi, ''],
  [/\bTo be honest,?\s*/gi, ''],
  [/\bHonestly,?\s*/gi, ''],
  [/\bFrankly,?\s*/gi, ''],

  // Filler adverbs
  [/\b(basically|essentially|actually|really|very|quite|rather|somewhat|literally|simply)\s+/gi, ''],

  // Verbose connectors
  [/\bIn other words,?\s*/gi, ''],
  [/\bThat is to say,?\s*/gi, ''],
  [/\bAs a matter of fact,?\s*/gi, ''],
  [/\bIt is important to note that\s*/gi, ''],
  [/\bAs you (may )?know,?\s*/gi, ''],
  [/\bNeedless to say,?\s*/gi, ''],
  [/\bAt the end of the day,?\s*/gi, ''],
  [/\bIf you don'?t mind,?\s*/gi, ''],
  [/\bIf possible,?\s*/gi, ''],
  [/\bIt would be great if you could\s*/gi, ''],
  [/\bI was wondering if you could\s*/gi, ''],
  [/\bDo you think you could\s*/gi, ''],
  [/\bWould it be possible to\s*/gi, ''],
  [/\bI'?d appreciate if you could\s*/gi, ''],

  // Articles before known patterns (careful not to break meaning)
  [/\bthe\s+(capital|atomic|chemical|largest|smallest|longest|shortest|first|last|top)\b/gi, '$1'],

  // Redundant question framing
  [/\bWhat is\s+/i, ''],
  [/\bTell me\s+/gi, ''],
  [/\bCan you tell me\s+/gi, ''],
  [/\bFigure out\s+/gi, ''],
  [/\btell me the answer\b/gi, ''],
  [/\bthe answer\s*\.?\s*$/gi, ''],

  // Appreciation / politeness closers
  [/\.\s*I would\s+appreciate\s+it\s+if\s+you\s+could\b.*$/gi, ''],
  [/\.\s*I'?d\s+appreciate\b.*$/gi, ''],
  [/\.\s*Thank(s| you)\b.*$/gi, ''],
  [/\.\s*I\s+would\s+really\b.*$/gi, ''],

  // Verbose wrapping ("help me figure out what X is" → "X")
  [/\bhelp\s+me\s+(figure\s+out|find\s+out|determine|understand)\s+(what\s+)?/gi, ''],
  // Catch orphaned "Help me what" after partial removal
  [/\bHelp\s+me\s+what\b/gi, ''],
  [/\bHelp\s+me\s+/gi, ''],

  // Clean up orphaned articles
  [/\bthe\s+the\b/gi, 'the'],

  // Clean up multiple spaces
  [/\s{2,}/g, ' '],
];

export function applySDM(text: string, analysis: PromptAnalysis): TransformResult {
  let result = text;

  for (const [pattern, replacement] of FILLER_REMOVAL_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  result = result.trim();

  // Capitalize first letter if it was lowered
  if (result.length > 0 && result[0] !== result[0].toUpperCase()) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  const tokensRemoved = Math.ceil((text.length - result.length) / 4);

  return {
    name: 'SDM',
    applied: result !== text,
    input: text,
    output: result,
    tokensRemoved,
    description: tokensRemoved > 0
      ? `Removed ${tokensRemoved} filler tokens (${analysis.fillerWords.length} filler words detected)`
      : 'No significant filler detected',
  };
}

// === 2. CFL — Constraint-First Layout ===

function buildConstraintTag(analysis: PromptAnalysis): string {
  const fmt = analysis.outputFormat;

  // Build [ANSWER:type] or [CLASSIFY:opts]
  if (analysis.type === 'classification') {
    const options = analysis.constraints
      .filter((c) => c.type === 'options')
      .map((c) => c.value.split(/\s*(?:,|or|\/)\s*/).join('|'))
      .join('|');
    if (options) return `[CLASSIFY:${options}]`;
    return '[CLASSIFY:category]';
  }

  // Multiple choice
  if (analysis.hasMultipleChoice) {
    return '[ANSWER:letter]';
  }

  // JSON output
  if (analysis.hasJsonRequest) {
    // Try to extract field names from constraints
    const fieldMatch = analysis.original.match(/\bfields?:?\s*(.+?)(?:\.|$)/i);
    if (fieldMatch) {
      const fields = fieldMatch[1]
        .split(/\s*(?:,|and)\s*/)
        .map((f) => f.trim().replace(/\s+/g, '_'))
        .filter(Boolean);
      if (fields.length > 0) {
        const fieldSpec = fields.map((f) => `${f}:string`).join(',');
        const limitMatch = analysis.original.match(/\btop (\d+)\b/i);
        const limit = limitMatch ? `[${limitMatch[1]}]` : '';
        return `[ANSWER:json{${fieldSpec}}${limit}]`;
      }
    }
    return '[ANSWER:json]';
  }

  // Map output format to constraint type
  const formatMap: Record<OutputFormat, string> = {
    single_word: 'single_word',
    number: 'number',
    integer: 'integer',
    boolean: 'yes|no',
    letter: 'letter',
    list: 'list',
    json: 'json',
    text: 'text',
    code: 'code',
    unknown: 'text',
  };

  // Add unit if detected
  const unitMatch = analysis.original.match(/\b(km²?|cm²?|m²?|\$|€|£|kg|lb|mph)\b/);
  const unit = unitMatch ? `,unit:${unitMatch[1]}` : '';

  return `[ANSWER:${formatMap[fmt] || 'text'}${unit}]`;
}

export function applyCFL(text: string, analysis: PromptAnalysis): TransformResult {
  const constraint = buildConstraintTag(analysis);

  // Don't duplicate if constraint already present
  if (text.startsWith('[')) {
    return {
      name: 'CFL',
      applied: false,
      input: text,
      output: text,
      tokensRemoved: 0,
      description: 'Constraint already present at position 0',
    };
  }

  const result = `${constraint} ${text}`;
  const tokensAdded = Math.ceil(constraint.length / 4);

  return {
    name: 'CFL',
    applied: true,
    input: text,
    output: result,
    tokensRemoved: -tokensAdded,
    description: `Prepended constraint "${constraint}" (Attention Sink at position 0)`,
  };
}

// === 3. CFO — Causal-Forward Ordering ===

export function applyCFO(text: string, analysis: PromptAnalysis): TransformResult {
  // Only apply if we detected operations that can be reordered
  if (analysis.operations.length < 2) {
    return {
      name: 'CFO',
      applied: false,
      input: text,
      output: text,
      tokensRemoved: 0,
      description: 'No multi-step operations detected to reorder',
    };
  }

  // Build causal chain from operations
  const ops = analysis.operations
    .sort((a, b) => a.order - b.order)
    .map((op) => {
      if (op.object) return `${op.verb}:${op.object}`;
      return op.verb;
    });

  // Extract constraint tag if present
  const constraintMatch = text.match(/^\[.+?\]\s*/);
  const prefix = constraintMatch ? constraintMatch[0] : '';
  const body = constraintMatch ? text.slice(constraintMatch[0].length) : text;

  // For reasoning prompts: build a numeric step chain
  if (analysis.type === 'reasoning' && analysis.parameters.length > 0) {
    const nums = analysis.parameters.filter((p) => p.key.startsWith('num_') || p.key.startsWith('value_'));
    if (nums.length > 0 && ops.length > 0) {
      const firstNum = nums[0];
      const chain = [`initial:${firstNum.value}`, ...ops.filter((o) => o !== 'emit')].join(' → ');
      const result = `${prefix}${chain} → result →`;

      return {
        name: 'CFO',
        applied: true,
        input: text,
        output: result,
        tokensRemoved: Math.ceil((text.length - result.length) / 4),
        description: `Reordered ${ops.length} operations into causal chain (left→right)`,
      };
    }
  }

  // For instruction prompts: chain imperative verbs as step sequence
  if (analysis.type === 'instruction') {
    const steps = ops.filter((o) => o !== 'emit');
    if (steps.length >= 2) {
      const chain = steps.join(' → ') + ' → emit';
      const result = `${prefix}${chain}`;

      return {
        name: 'CFO',
        applied: true,
        input: text,
        output: result,
        tokensRemoved: Math.ceil((text.length - result.length) / 4),
        description: `Chained ${steps.length} instruction steps into causal order`,
      };
    }
  }

  // For comparison prompts: structure as A vs B → criteria → result
  if (analysis.type === 'comparison') {
    const subjects = analysis.parameters
      .filter((p) => p.key.startsWith('entity_') || p.key.startsWith('subject_'))
      .slice(0, 2);
    if (subjects.length === 2) {
      const steps = ops.filter((o) => o !== 'emit');
      const chain = `${subjects[0].value} vs ${subjects[1].value}` +
        (steps.length > 0 ? ` → ${steps.join(' → ')}` : '') +
        ' → result →';
      const result = `${prefix}${chain}`;

      return {
        name: 'CFO',
        applied: true,
        input: text,
        output: result,
        tokensRemoved: Math.ceil((text.length - result.length) / 4),
        description: `Structured comparison: ${subjects[0].value} vs ${subjects[1].value} into causal chain`,
      };
    }
  }

  return {
    name: 'CFO',
    applied: false,
    input: text,
    output: text,
    tokensRemoved: 0,
    description: 'Could not establish clear causal ordering',
  };
}

// === 4. DRO — Delimiter-Role Optimization ===

export function applyDRO(text: string, analysis: PromptAnalysis): TransformResult {
  let result = text;
  let changes = 0;

  // Convert "X is Y" patterns to key:value
  // But only outside of constraint brackets
  const constraintMatch = result.match(/^\[.+?\]\s*/);
  const prefix = constraintMatch ? constraintMatch[0] : '';
  let body = constraintMatch ? result.slice(prefix.length) : result;

  // Convert multiple choice options to DRO format
  if (analysis.hasMultipleChoice && analysis.mcOptions.length > 0) {
    // Replace verbose MC format with compact DRO
    for (const opt of analysis.mcOptions) {
      // opt is like "A:Conduction"
      // Just ensure it's using : not )
    }
    // Replace "A. Foo\nB. Bar" with "A:Foo B:Bar"
    body = body.replace(/([A-D])\.\s+(.+?)(?:\n|$)/g, (_, letter, text) => {
      changes++;
      return `${letter}:${text.trim()} `;
    });
    // Also handle "A) Foo"
    body = body.replace(/([A-D])\)\s+(.+?)(?:\n|$)/g, (_, letter, text) => {
      changes++;
      return `${letter}:${text.trim()} `;
    });
  }

  // Convert "options: X, Y, or Z" to "X|Y|Z"
  body = body.replace(/\b(?:options?|choices?|categories):\s*(.+?)(?:\.|$)/gi, (_, opts) => {
    const items = opts.split(/\s*(?:,|or)\s*/).filter(Boolean);
    if (items.length >= 2) {
      changes++;
      return items.join('|') + ' ';
    }
    return _;
  });

  // Convert "as positive, negative, or neutral" to compact form
  body = body.replace(/\bas\s+([\w]+(?:\s*,\s*[\w]+)*\s*(?:,?\s*or\s+[\w]+))/gi, (_, opts) => {
    const items = opts.split(/\s*(?:,|or)\s*/).filter(Boolean);
    if (items.length >= 2) {
      changes++;
      return items.join('|');
    }
    return _;
  });

  // Replace " and then " / " then " with →
  body = body.replace(/\s+(?:and )?then\s+/gi, () => {
    changes++;
    return ' → ';
  });

  // Replace step indicators with →
  body = body.replace(/\.\s+(?:Next|Then|After that|Subsequently|Finally),?\s+/gi, () => {
    changes++;
    return ' → ';
  });

  result = prefix + body.trim();

  return {
    name: 'DRO',
    applied: changes > 0,
    input: text,
    output: result,
    tokensRemoved: Math.ceil((text.length - result.length) / 4),
    description: changes > 0
      ? `Applied ${changes} delimiter optimizations (key:value, |, →)`
      : 'No delimiter optimization opportunities found',
  };
}

// === 5. TAS — Tokenizer-Aligned Syntax ===

export function applyTAS(text: string, _analysis: PromptAnalysis): TransformResult {
  let result = text;
  let changes = 0;

  // Replace non-BPE-optimal delimiters with optimal ones
  // "=>" to "→" (→ is a single token in most BPE tokenizers)
  if (result.includes('=>')) {
    result = result.replace(/=>/g, '→');
    changes++;
  }

  // "-->" or "->" to "→"
  if (/-->?/.test(result) && !result.includes('→')) {
    result = result.replace(/-->/g, '→').replace(/->/g, '→');
    changes++;
  }

  // Replace "||" or " or " in option lists with |
  // (careful: only in clear option contexts)
  // This is handled by DRO, so TAS focuses on delimiter chars

  // Ensure : is used without spaces in key:value pairs
  result = result.replace(/(\w)\s*:\s+(\w)/g, (_, k, v) => {
    changes++;
    return `${k}:${v}`;
  });

  // Replace verbose separators
  result = result.replace(/\s*;\s*/g, () => {
    changes++;
    return '; ';
  });

  return {
    name: 'TAS',
    applied: changes > 0,
    input: text,
    output: result,
    tokensRemoved: Math.ceil((text.length - result.length) / 4),
    description: changes > 0
      ? `Optimized ${changes} delimiters for BPE tokenization`
      : 'Delimiters already BPE-optimal',
  };
}

// === 6. CCP — Causal Closure Principle ===

export function applyCCP(text: string, analysis: PromptAnalysis): TransformResult {
  // CCP is most effective for complex prompts
  if (analysis.wordCount < 15 && analysis.type !== 'multi_constraint') {
    return {
      name: 'CCP',
      applied: false,
      input: text,
      output: text,
      tokensRemoved: 0,
      description: 'Prompt too short for CCP benefit',
    };
  }

  // Extract key semantic atoms for closure block
  const atoms: string[] = [];

  // Add constraint type
  if (analysis.type !== 'unknown') {
    atoms.push(`task=${analysis.type}`);
  }

  // Add key parameters (top 6 by fragility)
  const topParams = [...analysis.parameters]
    .sort((a, b) => b.fragility - a.fragility)
    .slice(0, 6);
  for (const p of topParams) {
    atoms.push(`${p.key}=${p.value}`);
  }

  // Add output format
  atoms.push(`OP=EMIT_${analysis.outputFormat.toUpperCase()}`);

  if (atoms.length < 2) {
    return {
      name: 'CCP',
      applied: false,
      input: text,
      output: text,
      tokensRemoved: 0,
      description: 'Insufficient semantic atoms for closure block',
    };
  }

  const closureBlock = `\n###<CC>\n${atoms.join(';\n')};\n###</CC>`;
  const result = text + closureBlock;

  return {
    name: 'CCP',
    applied: true,
    input: text,
    output: result,
    tokensRemoved: -Math.ceil(closureBlock.length / 4), // adds tokens
    description: `Added causal closure block with ${atoms.length} semantic atoms`,
  };
}

// === 7. CAS — Causal Access Score ===

export function applyCAS(text: string, analysis: PromptAnalysis): TransformResult {
  // CAS moves critical information to positions with highest causal influence:
  // Position 0 (attention sink) — already handled by CFL
  // Early positions — critical params should be near the beginning
  // Before the final token — recency bias

  if (analysis.parameters.length < 2) {
    return {
      name: 'CAS',
      applied: false,
      input: text,
      output: text,
      tokensRemoved: 0,
      description: 'Too few parameters for CAS repositioning',
    };
  }

  // This is a soft transform — it promotes critical info to early positions
  // The main effect is already achieved by CFL (constraint at pos 0) and CFO (causal ordering)
  // CAS adds: sort parameters by fragility (most fragile → earliest position)

  const constraintMatch = text.match(/^\[.+?\]\s*/);
  const prefix = constraintMatch ? constraintMatch[0] : '';
  const body = constraintMatch ? text.slice(prefix.length) : text;

  // Check if body already uses key:value format (post-DRO/CFO)
  const kvPairs = [...body.matchAll(/\b(\w+):([^\s→|,\]]+)/g)];
  if (kvPairs.length >= 2) {
    // Sort by fragility — highest fragility first
    const sorted = kvPairs
      .map((m) => ({
        full: m[0],
        key: m[1],
        value: m[2],
        fragility: analysis.parameters.find((p) =>
          p.key.includes(m[1]) || p.value === m[2]
        )?.fragility || 0.5,
      }))
      .sort((a, b) => b.fragility - a.fragility);

    // Only reorder if fragility order differs from current order
    const currentOrder = kvPairs.map((m) => m[0]);
    const newOrder = sorted.map((s) => s.full);
    const orderChanged = currentOrder.some((v, i) => v !== newOrder[i]);

    if (orderChanged) {
      // Reorder key:value pairs by fragility (highest first)
      // Strategy: rebuild body with kv pairs in fragility order, preserving non-kv structure
      let reordered = body;

      // Extract the structural skeleton: everything that's not a kv pair
      // Replace each kv pair with a placeholder, then fill in sorted order
      const placeholders: string[] = [];
      let tempBody = body;
      for (let i = 0; i < kvPairs.length; i++) {
        const kv = kvPairs[i][0];
        const idx = tempBody.indexOf(kv);
        if (idx >= 0) {
          tempBody = tempBody.slice(0, idx) + `__KV_${i}__` + tempBody.slice(idx + kv.length);
          placeholders.push(kv);
        }
      }

      // Replace placeholders with fragility-sorted kv pairs
      for (let i = 0; i < placeholders.length && i < sorted.length; i++) {
        tempBody = tempBody.replace(`__KV_${i}__`, sorted[i].full);
      }

      const result = prefix + tempBody;
      return {
        name: 'CAS',
        applied: true,
        input: text,
        output: result,
        tokensRemoved: 0,
        description: `Reordered ${sorted.length} params by fragility: ${sorted.slice(0, 3).map(s => `${s.full}(${s.fragility.toFixed(1)})`).join(', ')}`,
      };
    }
  }

  return {
    name: 'CAS',
    applied: false,
    input: text,
    output: text,
    tokensRemoved: 0,
    description: 'Parameter ordering already optimal for causal access',
  };
}

// === 8. SAD-F — Selective Anchor Duplication with Fragility Weighting ===

export function applySADF(text: string, analysis: PromptAnalysis, topK = 4): TransformResult {
  // Extract key:value pairs from the (potentially already TSCG-ified) text
  const kvs = text.match(/\b\w+:[^\s→|,\]]+/g) || [];
  const filtered = kvs.filter((kv) => !/^(ANSWER|CLASSIFY|ANCHOR|CC):/i.test(kv));

  if (filtered.length === 0) {
    // Fall back to using analysis parameters
    if (analysis.parameters.length === 0) {
      return {
        name: 'SAD-F',
        applied: false,
        input: text,
        output: text,
        tokensRemoved: 0,
        description: 'No anchors to duplicate',
      };
    }

    // Build anchors from analysis parameters
    const topParams = [...analysis.parameters]
      .sort((a, b) => b.fragility - a.fragility)
      .slice(0, topK);

    const anchorStr = topParams.map((p) => `${p.key}:${p.value}`).join(',');
    const tag = ` [ANCHOR:${anchorStr}]`;
    const result = text + tag;

    return {
      name: 'SAD-F',
      applied: true,
      input: text,
      output: result,
      tokensRemoved: -Math.ceil(tag.length / 4),
      description: `Added ${topParams.length} fragility-weighted anchors from analysis`,
    };
  }

  // Sort by length (longer = more information = more fragile)
  const sorted = [...filtered].sort((a, b) => b.length - a.length);
  const anchors = sorted.slice(0, topK);

  // Add constraint spec as anchor too (for attention reinforcement)
  const spec = text.match(/\[[^\]]+\]/)?.[0];
  const allAnchors = spec ? [spec, ...anchors] : anchors;

  const tag = ` [ANCHOR:${allAnchors.join(',')}]`;
  const result = text + tag;

  return {
    name: 'SAD-F',
    applied: true,
    input: text,
    output: result,
    tokensRemoved: -Math.ceil(tag.length / 4),
    description: `Duplicated ${allAnchors.length} high-fragility anchors (budget: ${topK})`,
  };
}

// === Context Wrapping (for long-context prompts) ===

export function wrapContext(text: string, analysis: PromptAnalysis): TransformResult {
  if (!analysis.context) {
    return {
      name: 'CTX-WRAP',
      applied: false,
      input: text,
      output: text,
      tokensRemoved: 0,
      description: 'No context block detected',
    };
  }

  // Wrap context in <<CTX>> tags for explicit boundary marking
  const ctxWrapped = `<<CTX>>\n${analysis.context}\n<</CTX>>`;
  const question = analysis.question || '';

  // Build: constraint + context + question
  const constraintMatch = text.match(/^\[.+?\]\s*/);
  const prefix = constraintMatch ? constraintMatch[0] : '';
  const result = `${prefix}${ctxWrapped} → ${question}`;

  return {
    name: 'CTX-WRAP',
    applied: true,
    input: text,
    output: result,
    tokensRemoved: Math.ceil((text.length - result.length) / 4),
    description: `Wrapped ${analysis.context.length} char context in <<CTX>> delimiters`,
  };
}

// === Multiple Choice Compactor ===

export function compactMultipleChoice(text: string, analysis: PromptAnalysis): TransformResult {
  if (!analysis.hasMultipleChoice) {
    return {
      name: 'MC-COMPACT',
      applied: false,
      input: text,
      output: text,
      tokensRemoved: 0,
      description: 'No multiple choice detected',
    };
  }

  // Already handled in DRO — this is a specialized compactor
  // Moves options before question (CFL principle applied to options)
  const constraintMatch = text.match(/^\[.+?\]\s*/);
  const prefix = constraintMatch ? constraintMatch[0] : '';
  let body = constraintMatch ? text.slice(prefix.length) : text;

  // Extract options and question
  const opts = analysis.mcOptions.join(' ');

  // Remove options from body
  for (const opt of analysis.mcOptions) {
    const [letter] = opt.split(':');
    // Remove "A. Text" or "A) Text" or "A:Text" lines
    body = body.replace(new RegExp(`${letter}[.):]\\s*[^\\n]+\\n?`, 'g'), '');
  }

  // Clean up the remaining question
  body = body.replace(/\n{2,}/g, '\n').trim();

  // Build: constraint + options + → + question
  const result = `${prefix}${opts} → ${body}`;

  return {
    name: 'MC-COMPACT',
    applied: true,
    input: text,
    output: result,
    tokensRemoved: Math.ceil((text.length - result.length) / 4),
    description: `Compacted ${analysis.mcOptions.length} MC options into DRO format`,
  };
}
