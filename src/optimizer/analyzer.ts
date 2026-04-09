/**
 * TSCG Prompt Analyzer
 * Analyzes natural language prompts to extract structure, classify type,
 * identify constraints, parameters, operations, and fragility points.
 * Fully deterministic — no API calls required.
 */

// === Prompt Classification ===

export type PromptType =
  | 'factual'          // Simple knowledge recall ("What is X?")
  | 'reasoning'        // Math, logic, multi-step deduction
  | 'classification'   // Categorize/classify/label
  | 'extraction'       // Extract specific info from context
  | 'generation'       // Creative/open-ended generation
  | 'instruction'      // Step-by-step task instruction
  | 'comparison'       // Compare A vs B
  | 'conversion'       // Convert/translate/transform format
  | 'multi_constraint' // Multiple output constraints combined
  | 'unknown';

export type OutputFormat =
  | 'single_word'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'letter'
  | 'list'
  | 'json'
  | 'text'
  | 'code'
  | 'unknown';

export interface PromptConstraint {
  type: 'format' | 'length' | 'style' | 'include' | 'exclude' | 'options';
  value: string;
  original: string;  // original text span that expressed this constraint
}

export interface PromptParameter {
  key: string;
  value: string;
  position: number;  // char offset in original prompt
  fragility: number; // 0-1, how critical this param is for correctness
}

export interface PromptOperation {
  verb: string;
  object?: string;
  order: number;
}

export interface PromptAnalysis {
  original: string;
  type: PromptType;
  outputFormat: OutputFormat;
  constraints: PromptConstraint[];
  parameters: PromptParameter[];
  operations: PromptOperation[];
  context: string | null;          // large context block if present
  question: string | null;         // the core question/instruction
  fillerWords: string[];           // identified filler words to remove
  sentenceCount: number;
  wordCount: number;
  estimatedTokens: number;
  hasMultipleChoice: boolean;
  mcOptions: string[];             // ["A) ...", "B) ...", ...]
  hasNumberValues: boolean;
  hasListInput: boolean;
  hasJsonRequest: boolean;
  hasCodeRequest: boolean;
}

// === Filler Word Lists (SDM) ===

const FILLER_WORDS = new Set([
  'please', 'kindly', 'could', 'would', 'can', 'you', 'help', 'me',
  'i', 'want', 'need', 'like', 'just', 'simply', 'basically',
  'actually', 'really', 'very', 'quite', 'rather', 'somewhat',
  'perhaps', 'maybe', 'possibly', 'certainly', 'definitely',
  'probably', 'obviously', 'clearly', 'of course',
  'in order to', 'the fact that', 'it is important to note that',
  'as you know', 'as we all know', 'needless to say',
  'it goes without saying', 'at the end of the day',
  'in my opinion', 'i think', 'i believe', 'i feel',
  'to be honest', 'honestly', 'frankly', 'literally',
]);

const FILLER_PHRASES = [
  /\bplease\b/gi,
  /\bcould you\b/gi,
  /\bwould you\b/gi,
  /\bcan you\b/gi,
  /\bi would like you to\b/gi,
  /\bi want you to\b/gi,
  /\bi need you to\b/gi,
  /\bhelp me\b/gi,
  /\bplease help\b/gi,
  /\bkindly\b/gi,
  /\bif you don'?t mind\b/gi,
  /\bif possible\b/gi,
  /\bit would be great if\b/gi,
  /\bi was wondering if\b/gi,
  /\bdo you think you could\b/gi,
  /\bi'?d appreciate if\b/gi,
  /\bwould it be possible to\b/gi,
  /\bin other words\b/gi,
  /\bthat is to say\b/gi,
  /\bbasically\b/gi,
  /\bessentially\b/gi,
  /\bsimply put\b/gi,
  /\bto put it simply\b/gi,
  /\bas a matter of fact\b/gi,
  /\bin fact\b/gi,
  /\bactually\b/gi,
  /\breally\b/gi,
  /\bjust\b/gi,
];

// === Classification Patterns ===

const TYPE_PATTERNS: Array<{ type: PromptType; patterns: RegExp[]; weight: number }> = [
  {
    type: 'factual',
    patterns: [
      /\bwhat is\b/i, /\bwho is\b/i, /\bwhere is\b/i, /\bwhen (was|is|did)\b/i,
      /\bwhat('s| is) the\b/i, /\bname the\b/i, /\bdefine\b/i,
      /\bcapital of\b/i, /\bcapital city\b/i, /\batomic number\b/i, /\bchemical symbol\b/i,
      /\btell me\b/i, /\bfigure out\b/i, /\bthe answer\b/i,
    ],
    weight: 1,
  },
  {
    type: 'reasoning',
    patterns: [
      /\bhow many\b/i, /\bcalculate\b/i, /\bsolve\b/i, /\bcompute\b/i,
      /\bwhat comes next\b/i, /\bsequence\b/i, /\bif .*then\b/i,
      /\bcan we conclude\b/i, /\blogic\b/i, /\bproof\b/i, /\bderive\b/i,
      /\bperimeter\b/i, /\barea\b/i, /\bdistance\b/i, /\bprice\b/i,
      /\bremain\b/i, /\btotal\b/i, /\bsum\b/i, /\bproduct\b/i,
      /\d+\s*[\+\-\*\/\×\÷]\s*\d+/,
    ],
    weight: 1.2,
  },
  {
    type: 'classification',
    patterns: [
      /\bclassify\b/i, /\bcategorize\b/i, /\blabel\b/i,
      /\bsentiment\b/i, /\bpositive.*(negative|neutral)\b/i,
      /\bcategory\b/i, /\btype of\b/i,
    ],
    weight: 1.1,
  },
  {
    type: 'extraction',
    patterns: [
      /\bextract\b/i, /\bfind (the|all|every)\b/i,
      /\blist of.*names?\b/i, /\bwhat is the \d+(st|nd|rd|th)\b/i,
      /\bfrom (the|this) (text|passage|document|list)\b/i,
      /\bmentioned in\b/i,
    ],
    weight: 1.1,
  },
  {
    type: 'generation',
    patterns: [
      /\bwrite\b/i, /\bgenerate\b/i, /\bcreate\b/i, /\bcompose\b/i,
      /\bdraft\b/i, /\bbrainstorm\b/i, /\bsuggest\b/i,
      /\bstory\b/i, /\bessay\b/i, /\bpoem\b/i, /\bemail\b/i,
    ],
    weight: 0.9,
  },
  {
    type: 'instruction',
    patterns: [
      /\bhow (do|to|can)\b/i, /\bsteps? to\b/i, /\bguide\b/i,
      /\btutorial\b/i, /\bexplain how\b/i, /\binstructions?\b/i,
      /\bprocess (of|for)\b/i,
    ],
    weight: 0.9,
  },
  {
    type: 'comparison',
    patterns: [
      /\bcompare\b/i, /\bdifference between\b/i, /\bvs\.?\b/i,
      /\bversus\b/i, /\bcontrast\b/i, /\bbetter.*(or|than)\b/i,
      /\bpros and cons\b/i, /\badvantages? (and|vs)\b/i,
    ],
    weight: 1.0,
  },
  {
    type: 'conversion',
    patterns: [
      /\bconvert\b/i, /\btranslate\b/i, /\btransform\b/i,
      /\bfrom .* to\b/i, /\brewrite\b/i, /\breformat\b/i,
      /\bin (JSON|XML|CSV|YAML|markdown)\b/i,
    ],
    weight: 1.0,
  },
];

const FORMAT_PATTERNS: Array<{ format: OutputFormat; patterns: RegExp[] }> = [
  { format: 'json', patterns: [/\bjson\b/i, /\bJSON\b/, /\{.*\}/] },
  { format: 'code', patterns: [/\bcode\b/i, /\bfunction\b/i, /\bprogram\b/i, /\bscript\b/i, /```/] },
  { format: 'integer', patterns: [/\bhow many\b/i, /\bnumber of\b/i, /\bcount\b/i, /\bcalculate\b/i, /\batomic number\b/i] },
  { format: 'number', patterns: [/\bdistance\b/i, /\bprice\b/i, /\barea\b/i, /\bperimeter\b/i, /\btotal\b/i, /\bcost\b/i] },
  { format: 'boolean', patterns: [/\byes or no\b/i, /\btrue or false\b/i, /\byes\/no\b/i] },
  { format: 'letter', patterns: [/\bone letter\b/i, /\breply with.*letter\b/i, /\b[A-D]\.\s/] },
  { format: 'single_word', patterns: [/\bone word\b/i, /\bsingle word\b/i, /\bcapital (of|city)\b/i, /\bsymbol\b/i] },
  { format: 'list', patterns: [/\blist\b/i, /\btop \d+\b/i, /\benumerate\b/i] },
];

// === Number & Entity Extraction ===

const NUMBER_PATTERN = /\b\d+(?:\.\d+)?(?:\s*(?:%|percent|km|cm|m|kg|lb|mph|km\/h|dollars?|\$|€|£|hours?|minutes?|seconds?|days?|years?|cm²|m²))?\b/g;

const MC_PATTERN = /^([A-D])[\.\)]\s+(.+)$/gm;

// === Main Analyze Function ===

export function analyzePrompt(prompt: string): PromptAnalysis {
  const words = prompt.split(/\s+/);
  const sentences = prompt.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  // Classify prompt type
  const type = classifyType(prompt);

  // Detect output format
  const outputFormat = detectOutputFormat(prompt);

  // Extract constraints
  const constraints = extractConstraints(prompt);

  // Extract parameters (numbers, entities, key values)
  const parameters = extractParameters(prompt);

  // Extract operations (verbs indicating steps)
  const operations = extractOperations(prompt, type);

  // Detect context blocks
  const context = extractContext(prompt);

  // Extract core question
  const question = extractQuestion(prompt);

  // Find filler words
  const fillerWords = findFillerWords(prompt);

  // Multiple choice detection
  const mcMatches = [...prompt.matchAll(MC_PATTERN)];
  const hasMultipleChoice = mcMatches.length >= 2;
  const mcOptions = mcMatches.map((m) => `${m[1]}:${m[2].trim()}`);

  // Feature detection
  const hasNumberValues = NUMBER_PATTERN.test(prompt);
  NUMBER_PATTERN.lastIndex = 0; // reset regex state
  const hasListInput = /\blist\b/i.test(prompt) || prompt.includes(',') && (prompt.match(/,/g)?.length || 0) > 3;
  const hasJsonRequest = /\bjson\b/i.test(prompt);
  const hasCodeRequest = /\b(code|function|program|script|implement)\b/i.test(prompt);

  return {
    original: prompt,
    type,
    outputFormat,
    constraints,
    parameters,
    operations,
    context,
    question,
    fillerWords,
    sentenceCount: sentences.length,
    wordCount: words.length,
    estimatedTokens: Math.ceil(prompt.length / 4),
    hasMultipleChoice,
    mcOptions,
    hasNumberValues,
    hasListInput,
    hasJsonRequest,
    hasCodeRequest,
  };
}

// === Helper Functions ===

function classifyType(prompt: string): PromptType {
  const scores: Partial<Record<PromptType, number>> = {};

  for (const { type, patterns, weight } of TYPE_PATTERNS) {
    let matchCount = 0;
    for (const p of patterns) {
      if (p.test(prompt)) matchCount++;
      p.lastIndex = 0;
    }
    if (matchCount > 0) {
      scores[type] = (scores[type] || 0) + matchCount * weight;
    }
  }

  // Multi-constraint detection
  const constraintSignals = [
    /\bjson\b/i, /\bformat\b/i, /\bfields?\b/i, /\bonly include\b/i,
    /\bno explanation\b/i, /\breturn as\b/i, /\bwith fields?\b/i,
  ];
  let constraintCount = 0;
  for (const p of constraintSignals) {
    if (p.test(prompt)) constraintCount++;
  }
  if (constraintCount >= 3) {
    scores.multi_constraint = (scores.multi_constraint || 0) + constraintCount * 1.3;
  }

  // Find highest score
  let best: PromptType = 'unknown';
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = type as PromptType;
    }
  }

  return best;
}

function detectOutputFormat(prompt: string): OutputFormat {
  for (const { format, patterns } of FORMAT_PATTERNS) {
    for (const p of patterns) {
      if (p.test(prompt)) {
        p.lastIndex = 0;
        return format;
      }
      p.lastIndex = 0;
    }
  }
  return 'text';
}

function extractConstraints(prompt: string): PromptConstraint[] {
  const constraints: PromptConstraint[] = [];
  const lower = prompt.toLowerCase();

  // Format constraints
  const formatPatterns: Array<[RegExp, string]> = [
    [/\breturn as (json|xml|csv|yaml|markdown|text)\b/i, 'json'],
    [/\b(in|as) (json|xml|csv|yaml) format\b/i, 'format'],
    [/\breply with (one|a single) (letter|word|number|sentence)\b/i, 'format'],
    [/\banswer (only|with) (yes|no)\b/i, 'format'],
    [/\boutput (only|exactly|just)\b/i, 'format'],
  ];

  for (const [pattern, type] of formatPatterns) {
    const match = prompt.match(pattern);
    if (match) {
      constraints.push({
        type: 'format',
        value: match[0],
        original: match[0],
      });
    }
  }

  // Length constraints
  const lengthPatterns: Array<[RegExp, string]> = [
    [/\b(top|first|last) (\d+)\b/i, 'length'],
    [/\b(\d+) (words?|sentences?|paragraphs?|items?|points?|bullet)\b/i, 'length'],
    [/\bmaximum (\d+)\b/i, 'length'],
    [/\bno more than (\d+)\b/i, 'length'],
    [/\bat (most|least) (\d+)\b/i, 'length'],
    [/\blimit.* (\d+)\b/i, 'length'],
  ];

  for (const [pattern] of lengthPatterns) {
    const match = prompt.match(pattern);
    if (match) {
      constraints.push({
        type: 'length',
        value: match[0],
        original: match[0],
      });
    }
  }

  // Style constraints
  if (/\bno explanation\b/i.test(lower)) {
    constraints.push({ type: 'style', value: 'no_explanation', original: 'no explanation' });
  }
  if (/\bconcise(ly)?\b/i.test(lower)) {
    constraints.push({ type: 'style', value: 'concise', original: 'concise' });
  }
  if (/\bstep[- ]by[- ]step\b/i.test(lower)) {
    constraints.push({ type: 'style', value: 'step_by_step', original: 'step by step' });
  }

  // Options/choices constraints
  const optionsMatch = prompt.match(/\b(positive|negative|neutral|yes|no|true|false)(?:\s*(?:,|or|\/)\s*(positive|negative|neutral|yes|no|true|false))+/i);
  if (optionsMatch) {
    constraints.push({
      type: 'options',
      value: optionsMatch[0],
      original: optionsMatch[0],
    });
  }

  // Include/exclude constraints
  if (/\bonly include\b/i.test(lower)) {
    const match = prompt.match(/only include (.+?)(?:\.|$)/i);
    if (match) constraints.push({ type: 'include', value: match[1], original: match[0] });
  }
  if (/\b(do not|don't|without|exclude|no)\b.*\b(include|mention|add|explain)\b/i.test(lower)) {
    const match = prompt.match(/(do not|don't|without|exclude|no)\s+\w+\s+(.+?)(?:\.|$)/i);
    if (match) constraints.push({ type: 'exclude', value: match[0], original: match[0] });
  }

  return constraints;
}

function extractParameters(prompt: string): PromptParameter[] {
  const params: PromptParameter[] = [];
  const seen = new Set<string>();

  // Extract numbers with units
  const numMatches = [...prompt.matchAll(/\b(\d+(?:\.\d+)?)\s*(%|percent|km\/h|km|cm²|cm|m²|m|kg|lb|mph|dollars?|\$|€|£|hours?|minutes?|seconds?|days?|years?)?\b/g)];
  for (const match of numMatches) {
    const key = match[2] ? `value_${match[2].replace(/[^a-z]/gi, '')}` : `num_${match[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      params.push({
        key,
        value: match[0].trim(),
        position: match.index || 0,
        fragility: 0.9, // numbers are critical
      });
    }
  }

  // Extract quoted strings
  const quoteMatches = [...prompt.matchAll(/'([^']+)'|"([^"]+)"/g)];
  for (const match of quoteMatches) {
    const val = match[1] || match[2];
    const key = `text_${val.slice(0, 20).replace(/\s+/g, '_').replace(/[^a-z0-9_]/gi, '')}`;
    if (!seen.has(key)) {
      seen.add(key);
      params.push({
        key,
        value: val,
        position: match.index || 0,
        fragility: 0.85,
      });
    }
  }

  // Extract proper nouns (capitalized words not at sentence start)
  const properNouns = [...prompt.matchAll(/(?<=[.!?]\s+|\n|,\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g)];
  for (const match of properNouns) {
    const key = `entity_${match[1].replace(/\s+/g, '_')}`;
    if (!seen.has(key)) {
      seen.add(key);
      params.push({
        key,
        value: match[1],
        position: match.index || 0,
        fragility: 0.7,
      });
    }
  }

  // Extract key entities from questions like "capital of France"
  const ofPatterns = [...prompt.matchAll(/\b(?:of|for|about|in|from)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g)];
  for (const match of ofPatterns) {
    const key = `subject_${match[1].replace(/\s+/g, '_')}`;
    if (!seen.has(key)) {
      seen.add(key);
      params.push({
        key,
        value: match[1],
        position: match.index || 0,
        fragility: 0.8,
      });
    }
  }

  return params;
}

function extractOperations(prompt: string, type: PromptType): PromptOperation[] {
  const ops: PromptOperation[] = [];
  let order = 0;

  if (type === 'reasoning') {
    // Look for arithmetic operations
    const mathOps = [...prompt.matchAll(/\b(sell|buy|receive|add|subtract|minus|plus|multiply|divide|spend|earn|lose|gain|discount|off|increase|decrease)\b\s*(\d+)?/gi)];
    for (const match of mathOps) {
      ops.push({
        verb: normalizeVerb(match[1]),
        object: match[2] || undefined,
        order: order++,
      });
    }

    // Look for "then" chains
    const thenChains = prompt.split(/\bthen\b/i);
    if (thenChains.length > 1) {
      // Already captured above, skip
    }
  }

  // Look for imperative verbs
  const imperatives = [...prompt.matchAll(/\b(find|calculate|compute|solve|list|extract|classify|categorize|compare|convert|translate|generate|write|create|sort|filter|group|count|sum|average|rank)\b/gi)];
  for (const match of imperatives) {
    const verb = match[1].toLowerCase();
    if (!ops.some((o) => o.verb === verb)) {
      ops.push({
        verb,
        order: order++,
      });
    }
  }

  // Terminal operation based on format
  if (ops.length > 0) {
    ops.push({ verb: 'emit', order: order++ });
  }

  return ops;
}

function normalizeVerb(verb: string): string {
  const map: Record<string, string> = {
    sell: 'subtract', buy: 'subtract', spend: 'subtract', lose: 'subtract', minus: 'subtract',
    receive: 'add', earn: 'add', gain: 'add', plus: 'add', increase: 'add',
    discount: 'discount', off: 'discount', decrease: 'subtract',
    multiply: 'multiply', divide: 'divide',
  };
  return map[verb.toLowerCase()] || verb.toLowerCase();
}

function extractContext(prompt: string): string | null {
  // Look for large context blocks (text inside quotes, after "text:", after "following text", etc.)
  const contextPatterns = [
    /(?:read|following|given|this|below is|here is)\s+(?:the\s+)?(?:text|passage|document|paragraph|context|article)[\s\S]*?:\s*\n([\s\S]{200,}?)(?:\n\s*\n|\nQuestion|\nWhat|\nWho|\nWhere|\nWhen|\nHow|\nWhich)/i,
    /<<CTX>>([\s\S]+?)<<\/CTX>>/i,
    /```([\s\S]{200,}?)```/,
  ];

  for (const pattern of contextPatterns) {
    const match = prompt.match(pattern);
    if (match) return match[1].trim();
  }

  // If prompt is very long (>500 chars), try to separate context from question
  if (prompt.length > 500) {
    const questionPatterns = [
      /\n\s*(?:What|Who|Where|When|How|Which|Why|Can|Is|Are|Do|Does)\s+/,
      /\n\s*Question:\s*/i,
      /\?\s*$/m,
    ];
    for (const qp of questionPatterns) {
      const idx = prompt.search(qp);
      if (idx > 200) {
        return prompt.slice(0, idx).trim();
      }
    }
  }

  return null;
}

function extractQuestion(prompt: string): string | null {
  // Extract the core question from the prompt
  const lines = prompt.split('\n').filter((l) => l.trim());

  // Look for question marks
  const questionLines = lines.filter((l) => l.trim().endsWith('?'));
  if (questionLines.length > 0) {
    return questionLines[questionLines.length - 1].trim();
  }

  // Look for imperative sentences at the end
  const lastLine = lines[lines.length - 1]?.trim();
  if (lastLine && /^(What|Who|Where|When|How|Which|Why|List|Find|Calculate|Classify|Extract|Compare|Convert)/i.test(lastLine)) {
    return lastLine;
  }

  // If short prompt, the whole thing is the question
  if (prompt.length < 200) {
    return prompt.trim();
  }

  return null;
}

// === Multi-Factor Fragility Scoring (CAS improvement) ===

/**
 * Computes a multi-factor fragility score for a parameter.
 *
 * Four weighted factors:
 *   - uniqueness  (0.3): 1.0 if param appears only once in allParams, 0.3 if repeated
 *   - queryRelevance (0.3): 1.0 if param appears in queryTokens, 0.0 if not
 *   - typePenalty  (0.2): based on param type — numbers most fragile (1.0),
 *                         proper nouns (0.8), quoted strings (0.5), common words (0.3)
 *   - lengthPenalty (0.2): shorter params more fragile — 1.0 for 1-char, 0.3 for >10 chars
 *
 * @param param       The parameter value to score
 * @param allParams   All parameter values in the prompt (for uniqueness check)
 * @param queryTokens Tokens from the core question/query (for relevance check)
 * @returns           Fragility score in [0, 1]
 */
export function computeMultiFactorFragility(
  param: string,
  allParams: string[],
  queryTokens: string[],
): number {
  // --- Uniqueness (weight 0.3) ---
  const occurrences = allParams.filter((p) => p === param).length;
  const uniqueness = occurrences <= 1 ? 1.0 : 0.3;

  // --- Query Relevance (weight 0.3) ---
  const paramLower = param.toLowerCase();
  const queryRelevance = queryTokens.some(
    (t) => t.toLowerCase() === paramLower || paramLower.includes(t.toLowerCase()),
  )
    ? 1.0
    : 0.0;

  // --- Type Penalty (weight 0.2) ---
  let typePenalty: number;
  if (/^\d+(?:\.\d+)?$/.test(param)) {
    // Pure number
    typePenalty = 1.0;
  } else if (/^[A-Z][a-z]/.test(param)) {
    // Proper noun (starts with capital, followed by lowercase)
    typePenalty = 0.8;
  } else if (/^["'].*["']$/.test(param) || /^'.*'$/.test(param)) {
    // Quoted string
    typePenalty = 0.5;
  } else {
    // Common word
    typePenalty = 0.3;
  }

  // --- Length Penalty (weight 0.2) ---
  let lengthPenalty: number;
  if (param.length <= 1) {
    lengthPenalty = 1.0;
  } else if (param.length <= 3) {
    lengthPenalty = 0.8;
  } else if (param.length <= 10) {
    lengthPenalty = 0.5;
  } else {
    lengthPenalty = 0.3;
  }

  // Weighted sum
  return (
    uniqueness * 0.3 +
    queryRelevance * 0.3 +
    typePenalty * 0.2 +
    lengthPenalty * 0.2
  );
}

function findFillerWords(prompt: string): string[] {
  const found: string[] = [];
  const words = prompt.toLowerCase().split(/\s+/);

  for (const word of words) {
    if (FILLER_WORDS.has(word)) {
      found.push(word);
    }
  }

  // Also check multi-word filler phrases
  for (const pattern of FILLER_PHRASES) {
    if (pattern.test(prompt)) {
      const match = prompt.match(pattern);
      if (match) found.push(match[0].toLowerCase());
    }
    pattern.lastIndex = 0;
  }

  return [...new Set(found)];
}
