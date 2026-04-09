/**
 * TSCG Prompt Optimizer - Self-contained Chrome Extension Build
 * Inlined from src/optimizer/analyzer.ts + src/optimizer/transforms.ts + src/optimizer/optimizer.ts
 *
 * This is a fully self-contained, pure-JS implementation of the TSCG optimizer.
 * No build step, no imports, no dependencies. Works in popup and content script contexts.
 *
 * Version: 5.0.0
 */

/* global globalThis */

(function (root) {
  'use strict';

  // ============================================================
  // ANALYZER
  // ============================================================

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
    /\bplease\b/gi, /\bcould you\b/gi, /\bwould you\b/gi, /\bcan you\b/gi,
    /\bi would like you to\b/gi, /\bi want you to\b/gi, /\bi need you to\b/gi,
    /\bhelp me\b/gi, /\bplease help\b/gi, /\bkindly\b/gi,
    /\bif you don'?t mind\b/gi, /\bif possible\b/gi,
    /\bit would be great if\b/gi, /\bi was wondering if\b/gi,
    /\bdo you think you could\b/gi, /\bi'?d appreciate if\b/gi,
    /\bwould it be possible to\b/gi, /\bin other words\b/gi,
    /\bthat is to say\b/gi, /\bbasically\b/gi, /\bessentially\b/gi,
    /\bsimply put\b/gi, /\bto put it simply\b/gi,
    /\bas a matter of fact\b/gi, /\bin fact\b/gi,
    /\bactually\b/gi, /\breally\b/gi, /\bjust\b/gi,
  ];

  const TYPE_PATTERNS = [
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
        /\d+\s*[+\-*\/\u00d7\u00f7]\s*\d+/,
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

  const FORMAT_PATTERNS = [
    { format: 'json', patterns: [/\bjson\b/i, /\bJSON\b/, /\{.*\}/] },
    { format: 'code', patterns: [/\bcode\b/i, /\bfunction\b/i, /\bprogram\b/i, /\bscript\b/i, /```/] },
    { format: 'integer', patterns: [/\bhow many\b/i, /\bnumber of\b/i, /\bcount\b/i, /\bcalculate\b/i, /\batomic number\b/i] },
    { format: 'number', patterns: [/\bdistance\b/i, /\bprice\b/i, /\barea\b/i, /\bperimeter\b/i, /\btotal\b/i, /\bcost\b/i] },
    { format: 'boolean', patterns: [/\byes or no\b/i, /\btrue or false\b/i, /\byes\/no\b/i] },
    { format: 'letter', patterns: [/\bone letter\b/i, /\breply with.*letter\b/i, /\b[A-D]\.\s/] },
    { format: 'single_word', patterns: [/\bone word\b/i, /\bsingle word\b/i, /\bcapital (of|city)\b/i, /\bsymbol\b/i] },
    { format: 'list', patterns: [/\blist\b/i, /\btop \d+\b/i, /\benumerate\b/i] },
  ];

  const NUMBER_PATTERN = /\b\d+(?:\.\d+)?(?:\s*(?:%|percent|km|cm|m|kg|lb|mph|km\/h|dollars?|\$|\u20ac|\u00a3|hours?|minutes?|seconds?|days?|years?|cm\u00b2|m\u00b2))?\b/g;
  const MC_PATTERN = /^([A-D])[.)]\s+(.+)$/gm;

  function classifyType(prompt) {
    var scores = {};
    for (var i = 0; i < TYPE_PATTERNS.length; i++) {
      var entry = TYPE_PATTERNS[i];
      var matchCount = 0;
      for (var j = 0; j < entry.patterns.length; j++) {
        var p = entry.patterns[j];
        if (p.test(prompt)) matchCount++;
        p.lastIndex = 0;
      }
      if (matchCount > 0) {
        scores[entry.type] = (scores[entry.type] || 0) + matchCount * entry.weight;
      }
    }

    var constraintSignals = [
      /\bjson\b/i, /\bformat\b/i, /\bfields?\b/i, /\bonly include\b/i,
      /\bno explanation\b/i, /\breturn as\b/i, /\bwith fields?\b/i,
    ];
    var constraintCount = 0;
    for (var k = 0; k < constraintSignals.length; k++) {
      if (constraintSignals[k].test(prompt)) constraintCount++;
    }
    if (constraintCount >= 3) {
      scores['multi_constraint'] = (scores['multi_constraint'] || 0) + constraintCount * 1.3;
    }

    var best = 'unknown';
    var bestScore = 0;
    for (var type in scores) {
      if (scores[type] > bestScore) {
        bestScore = scores[type];
        best = type;
      }
    }
    return best;
  }

  function detectOutputFormat(prompt) {
    for (var i = 0; i < FORMAT_PATTERNS.length; i++) {
      var entry = FORMAT_PATTERNS[i];
      for (var j = 0; j < entry.patterns.length; j++) {
        var p = entry.patterns[j];
        if (p.test(prompt)) {
          p.lastIndex = 0;
          return entry.format;
        }
        p.lastIndex = 0;
      }
    }
    return 'text';
  }

  function extractConstraints(prompt) {
    var constraints = [];
    var lower = prompt.toLowerCase();

    var formatPatterns = [
      [/\breturn as (json|xml|csv|yaml|markdown|text)\b/i, 'format'],
      [/\b(in|as) (json|xml|csv|yaml) format\b/i, 'format'],
      [/\breply with (one|a single) (letter|word|number|sentence)\b/i, 'format'],
      [/\banswer (only|with) (yes|no)\b/i, 'format'],
      [/\boutput (only|exactly|just)\b/i, 'format'],
    ];

    for (var i = 0; i < formatPatterns.length; i++) {
      var match = prompt.match(formatPatterns[i][0]);
      if (match) {
        constraints.push({ type: 'format', value: match[0], original: match[0] });
      }
    }

    var lengthPatterns = [
      /\b(top|first|last) (\d+)\b/i,
      /\b(\d+) (words?|sentences?|paragraphs?|items?|points?|bullet)\b/i,
      /\bmaximum (\d+)\b/i,
      /\bno more than (\d+)\b/i,
      /\bat (most|least) (\d+)\b/i,
      /\blimit.* (\d+)\b/i,
    ];

    for (var j = 0; j < lengthPatterns.length; j++) {
      var lmatch = prompt.match(lengthPatterns[j]);
      if (lmatch) {
        constraints.push({ type: 'length', value: lmatch[0], original: lmatch[0] });
      }
    }

    if (/\bno explanation\b/i.test(lower)) {
      constraints.push({ type: 'style', value: 'no_explanation', original: 'no explanation' });
    }
    if (/\bconcise(ly)?\b/i.test(lower)) {
      constraints.push({ type: 'style', value: 'concise', original: 'concise' });
    }
    if (/\bstep[- ]by[- ]step\b/i.test(lower)) {
      constraints.push({ type: 'style', value: 'step_by_step', original: 'step by step' });
    }

    var optionsMatch = prompt.match(/\b(positive|negative|neutral|yes|no|true|false)(?:\s*(?:,|or|\/)\s*(positive|negative|neutral|yes|no|true|false))+/i);
    if (optionsMatch) {
      constraints.push({ type: 'options', value: optionsMatch[0], original: optionsMatch[0] });
    }

    if (/\bonly include\b/i.test(lower)) {
      var incMatch = prompt.match(/only include (.+?)(?:\.|$)/i);
      if (incMatch) constraints.push({ type: 'include', value: incMatch[1], original: incMatch[0] });
    }

    if (/\b(do not|don't|without|exclude|no)\b.*\b(include|mention|add|explain)\b/i.test(lower)) {
      var exMatch = prompt.match(/(do not|don't|without|exclude|no)\s+\w+\s+(.+?)(?:\.|$)/i);
      if (exMatch) constraints.push({ type: 'exclude', value: exMatch[0], original: exMatch[0] });
    }

    return constraints;
  }

  function extractParameters(prompt) {
    var params = [];
    var seen = new Set();

    var numMatches = Array.from(prompt.matchAll(/\b(\d+(?:\.\d+)?)\s*(%|percent|km\/h|km|cm\u00b2|cm|m\u00b2|m|kg|lb|mph|dollars?|\$|\u20ac|\u00a3|hours?|minutes?|seconds?|days?|years?)?\b/g));
    for (var i = 0; i < numMatches.length; i++) {
      var nm = numMatches[i];
      var key = nm[2] ? 'value_' + nm[2].replace(/[^a-z]/gi, '') : 'num_' + nm[1];
      if (!seen.has(key)) {
        seen.add(key);
        params.push({ key: key, value: nm[0].trim(), position: nm.index || 0, fragility: 0.9 });
      }
    }

    var quoteMatches = Array.from(prompt.matchAll(/'([^']+)'|"([^"]+)"/g));
    for (var j = 0; j < quoteMatches.length; j++) {
      var qm = quoteMatches[j];
      var val = qm[1] || qm[2];
      var qkey = 'text_' + val.slice(0, 20).replace(/\s+/g, '_').replace(/[^a-z0-9_]/gi, '');
      if (!seen.has(qkey)) {
        seen.add(qkey);
        params.push({ key: qkey, value: val, position: qm.index || 0, fragility: 0.85 });
      }
    }

    var properNouns = Array.from(prompt.matchAll(/(?<=[.!?]\s+|\n|,\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g));
    for (var k = 0; k < properNouns.length; k++) {
      var pn = properNouns[k];
      var pkey = 'entity_' + pn[1].replace(/\s+/g, '_');
      if (!seen.has(pkey)) {
        seen.add(pkey);
        params.push({ key: pkey, value: pn[1], position: pn.index || 0, fragility: 0.7 });
      }
    }

    var ofPatterns = Array.from(prompt.matchAll(/\b(?:of|for|about|in|from)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g));
    for (var m = 0; m < ofPatterns.length; m++) {
      var op = ofPatterns[m];
      var okey = 'subject_' + op[1].replace(/\s+/g, '_');
      if (!seen.has(okey)) {
        seen.add(okey);
        params.push({ key: okey, value: op[1], position: op.index || 0, fragility: 0.8 });
      }
    }

    return params;
  }

  function normalizeVerb(verb) {
    var map = {
      sell: 'subtract', buy: 'subtract', spend: 'subtract', lose: 'subtract', minus: 'subtract',
      receive: 'add', earn: 'add', gain: 'add', plus: 'add', increase: 'add',
      discount: 'discount', off: 'discount', decrease: 'subtract',
      multiply: 'multiply', divide: 'divide',
    };
    return map[verb.toLowerCase()] || verb.toLowerCase();
  }

  function extractOperations(prompt, type) {
    var ops = [];
    var order = 0;

    if (type === 'reasoning') {
      var mathOps = Array.from(prompt.matchAll(/\b(sell|buy|receive|add|subtract|minus|plus|multiply|divide|spend|earn|lose|gain|discount|off|increase|decrease)\b\s*(\d+)?/gi));
      for (var i = 0; i < mathOps.length; i++) {
        ops.push({ verb: normalizeVerb(mathOps[i][1]), object: mathOps[i][2] || undefined, order: order++ });
      }
    }

    var imperatives = Array.from(prompt.matchAll(/\b(find|calculate|compute|solve|list|extract|classify|categorize|compare|convert|translate|generate|write|create|sort|filter|group|count|sum|average|rank)\b/gi));
    for (var j = 0; j < imperatives.length; j++) {
      var verb = imperatives[j][1].toLowerCase();
      if (!ops.some(function (o) { return o.verb === verb; })) {
        ops.push({ verb: verb, order: order++ });
      }
    }

    if (ops.length > 0) {
      ops.push({ verb: 'emit', order: order++ });
    }

    return ops;
  }

  function extractContext(prompt) {
    var contextPatterns = [
      /(?:read|following|given|this|below is|here is)\s+(?:the\s+)?(?:text|passage|document|paragraph|context|article)[\s\S]*?:\s*\n([\s\S]{200,}?)(?:\n\s*\n|\nQuestion|\nWhat|\nWho|\nWhere|\nWhen|\nHow|\nWhich)/i,
      /<<CTX>>([\s\S]+?)<<\/CTX>>/i,
      /```([\s\S]{200,}?)```/,
    ];

    for (var i = 0; i < contextPatterns.length; i++) {
      var match = prompt.match(contextPatterns[i]);
      if (match) return match[1].trim();
    }

    if (prompt.length > 500) {
      var questionPatterns = [
        /\n\s*(?:What|Who|Where|When|How|Which|Why|Can|Is|Are|Do|Does)\s+/,
        /\n\s*Question:\s*/i,
        /\?\s*$/m,
      ];
      for (var j = 0; j < questionPatterns.length; j++) {
        var idx = prompt.search(questionPatterns[j]);
        if (idx > 200) return prompt.slice(0, idx).trim();
      }
    }

    return null;
  }

  function extractQuestion(prompt) {
    var lines = prompt.split('\n').filter(function (l) { return l.trim().length > 0; });

    var questionLines = lines.filter(function (l) { return l.trim().endsWith('?'); });
    if (questionLines.length > 0) {
      return questionLines[questionLines.length - 1].trim();
    }

    var lastLine = lines[lines.length - 1];
    if (lastLine) {
      lastLine = lastLine.trim();
      if (/^(What|Who|Where|When|How|Which|Why|List|Find|Calculate|Classify|Extract|Compare|Convert)/i.test(lastLine)) {
        return lastLine;
      }
    }

    if (prompt.length < 200) return prompt.trim();
    return null;
  }

  function findFillerWords(prompt) {
    var found = [];
    var words = prompt.toLowerCase().split(/\s+/);

    for (var i = 0; i < words.length; i++) {
      if (FILLER_WORDS.has(words[i])) found.push(words[i]);
    }

    for (var j = 0; j < FILLER_PHRASES.length; j++) {
      var p = FILLER_PHRASES[j];
      if (p.test(prompt)) {
        var match = prompt.match(p);
        if (match) found.push(match[0].toLowerCase());
      }
      p.lastIndex = 0;
    }

    return Array.from(new Set(found));
  }

  function analyzePrompt(prompt) {
    var words = prompt.split(/\s+/);
    var sentences = prompt.split(/[.!?]+/).filter(function (s) { return s.trim().length > 0; });
    var type = classifyType(prompt);
    var outputFormat = detectOutputFormat(prompt);
    var constraints = extractConstraints(prompt);
    var parameters = extractParameters(prompt);
    var operations = extractOperations(prompt, type);
    var context = extractContext(prompt);
    var question = extractQuestion(prompt);
    var fillerWords = findFillerWords(prompt);

    MC_PATTERN.lastIndex = 0;
    var mcMatches = Array.from(prompt.matchAll(MC_PATTERN));
    var hasMultipleChoice = mcMatches.length >= 2;
    var mcOptions = mcMatches.map(function (m) { return m[1] + ':' + m[2].trim(); });

    NUMBER_PATTERN.lastIndex = 0;
    var hasNumberValues = NUMBER_PATTERN.test(prompt);
    NUMBER_PATTERN.lastIndex = 0;

    var commaCount = (prompt.match(/,/g) || []).length;
    var hasListInput = /\blist\b/i.test(prompt) || (prompt.includes(',') && commaCount > 3);
    var hasJsonRequest = /\bjson\b/i.test(prompt);
    var hasCodeRequest = /\b(code|function|program|script|implement)\b/i.test(prompt);

    return {
      original: prompt,
      type: type,
      outputFormat: outputFormat,
      constraints: constraints,
      parameters: parameters,
      operations: operations,
      context: context,
      question: question,
      fillerWords: fillerWords,
      sentenceCount: sentences.length,
      wordCount: words.length,
      estimatedTokens: Math.ceil(prompt.length / 4),
      hasMultipleChoice: hasMultipleChoice,
      mcOptions: mcOptions,
      hasNumberValues: hasNumberValues,
      hasListInput: hasListInput,
      hasJsonRequest: hasJsonRequest,
      hasCodeRequest: hasCodeRequest,
    };
  }

  // ============================================================
  // TRANSFORMS
  // ============================================================

  var FILLER_REMOVAL_PATTERNS = [
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

    // Articles before known patterns
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

    // Verbose wrapping
    [/\bhelp\s+me\s+(figure\s+out|find\s+out|determine|understand)\s+(what\s+)?/gi, ''],
    [/\bHelp\s+me\s+what\b/gi, ''],
    [/\bHelp\s+me\s+/gi, ''],

    // Clean up orphaned articles
    [/\bthe\s+the\b/gi, 'the'],

    // Clean up multiple spaces
    [/\s{2,}/g, ' '],
  ];

  function applySDM(text, analysis) {
    var result = text;
    for (var i = 0; i < FILLER_REMOVAL_PATTERNS.length; i++) {
      result = result.replace(FILLER_REMOVAL_PATTERNS[i][0], FILLER_REMOVAL_PATTERNS[i][1]);
    }
    result = result.trim();

    if (result.length > 0 && result[0] !== result[0].toUpperCase()) {
      result = result[0].toUpperCase() + result.slice(1);
    }

    var tokensRemoved = Math.ceil((text.length - result.length) / 4);
    return {
      name: 'SDM',
      applied: result !== text,
      input: text,
      output: result,
      tokensRemoved: tokensRemoved,
      description: tokensRemoved > 0
        ? 'Removed ' + tokensRemoved + ' filler tokens (' + analysis.fillerWords.length + ' filler words detected)'
        : 'No significant filler detected',
    };
  }

  function buildConstraintTag(analysis) {
    if (analysis.type === 'classification') {
      var options = analysis.constraints
        .filter(function (c) { return c.type === 'options'; })
        .map(function (c) { return c.value.split(/\s*(?:,|or|\/)\s*/).join('|'); })
        .join('|');
      if (options) return '[CLASSIFY:' + options + ']';
      return '[CLASSIFY:category]';
    }

    if (analysis.hasMultipleChoice) return '[ANSWER:letter]';

    if (analysis.hasJsonRequest) {
      var fieldMatch = analysis.original.match(/\bfields?:?\s*(.+?)(?:\.|$)/i);
      if (fieldMatch) {
        var fields = fieldMatch[1]
          .split(/\s*(?:,|and)\s*/)
          .map(function (f) { return f.trim().replace(/\s+/g, '_'); })
          .filter(Boolean);
        if (fields.length > 0) {
          var fieldSpec = fields.map(function (f) { return f + ':string'; }).join(',');
          var limitMatch = analysis.original.match(/\btop (\d+)\b/i);
          var limit = limitMatch ? '[' + limitMatch[1] + ']' : '';
          return '[ANSWER:json{' + fieldSpec + '}' + limit + ']';
        }
      }
      return '[ANSWER:json]';
    }

    var formatMap = {
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

    var unitMatch = analysis.original.match(/\b(km\u00b2?|cm\u00b2?|m\u00b2?|\$|\u20ac|\u00a3|kg|lb|mph)\b/);
    var unit = unitMatch ? ',unit:' + unitMatch[1] : '';

    return '[ANSWER:' + (formatMap[analysis.outputFormat] || 'text') + unit + ']';
  }

  function applyCFL(text, analysis) {
    var constraint = buildConstraintTag(analysis);

    if (text.startsWith('[')) {
      return {
        name: 'CFL', applied: false, input: text, output: text,
        tokensRemoved: 0, description: 'Constraint already present at position 0',
      };
    }

    var result = constraint + ' ' + text;
    var tokensAdded = Math.ceil(constraint.length / 4);

    return {
      name: 'CFL', applied: true, input: text, output: result,
      tokensRemoved: -tokensAdded,
      description: 'Prepended constraint "' + constraint + '" (Attention Sink at position 0)',
    };
  }

  function applyCFO(text, analysis) {
    if (analysis.operations.length < 2) {
      return {
        name: 'CFO', applied: false, input: text, output: text,
        tokensRemoved: 0, description: 'No multi-step operations detected to reorder',
      };
    }

    var ops = analysis.operations
      .slice().sort(function (a, b) { return a.order - b.order; })
      .map(function (op) { return op.object ? op.verb + ':' + op.object : op.verb; });

    if (analysis.type === 'reasoning' && analysis.parameters.length > 0) {
      var nums = analysis.parameters.filter(function (p) { return p.key.startsWith('num_') || p.key.startsWith('value_'); });
      if (nums.length > 0 && ops.length > 0) {
        var constraintMatch = text.match(/^\[.+?\]\s*/);
        var prefix = constraintMatch ? constraintMatch[0] : '';

        var firstNum = nums[0];
        var chain = ['initial:' + firstNum.value].concat(
          ops.filter(function (o) { return o !== 'emit'; })
        ).join(' \u2192 ');
        var result = prefix + chain + ' \u2192 result \u2192';

        return {
          name: 'CFO', applied: true, input: text, output: result,
          tokensRemoved: Math.ceil((text.length - result.length) / 4),
          description: 'Reordered ' + ops.length + ' operations into causal chain (left\u2192right)',
        };
      }
    }

    return {
      name: 'CFO', applied: false, input: text, output: text,
      tokensRemoved: 0, description: 'Could not establish clear causal ordering',
    };
  }

  function applyDRO(text, analysis) {
    var result = text;
    var changes = 0;

    var constraintMatch = result.match(/^\[.+?\]\s*/);
    var prefix = constraintMatch ? constraintMatch[0] : '';
    var body = constraintMatch ? result.slice(prefix.length) : result;

    if (analysis.hasMultipleChoice && analysis.mcOptions.length > 0) {
      body = body.replace(/([A-D])\.\s+(.+?)(?:\n|$)/g, function (_, letter, txt) {
        changes++;
        return letter + ':' + txt.trim() + ' ';
      });
      body = body.replace(/([A-D])\)\s+(.+?)(?:\n|$)/g, function (_, letter, txt) {
        changes++;
        return letter + ':' + txt.trim() + ' ';
      });
    }

    body = body.replace(/\b(?:options?|choices?|categories):\s*(.+?)(?:\.|$)/gi, function (full, opts) {
      var items = opts.split(/\s*(?:,|or)\s*/).filter(Boolean);
      if (items.length >= 2) {
        changes++;
        return items.join('|') + ' ';
      }
      return full;
    });

    body = body.replace(/\bas\s+([\w]+(?:\s*,\s*[\w]+)*\s*(?:,?\s*or\s+[\w]+))/gi, function (full, opts) {
      var items = opts.split(/\s*(?:,|or)\s*/).filter(Boolean);
      if (items.length >= 2) {
        changes++;
        return items.join('|');
      }
      return full;
    });

    body = body.replace(/\s+(?:and )?then\s+/gi, function () {
      changes++;
      return ' \u2192 ';
    });

    body = body.replace(/\.\s+(?:Next|Then|After that|Subsequently|Finally),?\s+/gi, function () {
      changes++;
      return ' \u2192 ';
    });

    result = prefix + body.trim();

    return {
      name: 'DRO', applied: changes > 0, input: text, output: result,
      tokensRemoved: Math.ceil((text.length - result.length) / 4),
      description: changes > 0
        ? 'Applied ' + changes + ' delimiter optimizations (key:value, |, \u2192)'
        : 'No delimiter optimization opportunities found',
    };
  }

  function applyTAS(text) {
    var result = text;
    var changes = 0;

    if (result.includes('=>')) {
      result = result.replace(/=>/g, '\u2192');
      changes++;
    }

    if (/-->?/.test(result) && !result.includes('\u2192')) {
      result = result.replace(/-->/g, '\u2192').replace(/->/g, '\u2192');
      changes++;
    }

    result = result.replace(/(\w)\s*:\s+(\w)/g, function (_, k, v) {
      changes++;
      return k + ':' + v;
    });

    result = result.replace(/\s*;\s*/g, function () {
      changes++;
      return '; ';
    });

    return {
      name: 'TAS', applied: changes > 0, input: text, output: result,
      tokensRemoved: Math.ceil((text.length - result.length) / 4),
      description: changes > 0
        ? 'Optimized ' + changes + ' delimiters for BPE tokenization'
        : 'Delimiters already BPE-optimal',
    };
  }

  function applyCCP(text, analysis) {
    if (analysis.wordCount < 15 && analysis.type !== 'multi_constraint') {
      return {
        name: 'CCP', applied: false, input: text, output: text,
        tokensRemoved: 0, description: 'Prompt too short for CCP benefit',
      };
    }

    var atoms = [];
    if (analysis.type !== 'unknown') {
      atoms.push('task=' + analysis.type);
    }

    var topParams = analysis.parameters.slice()
      .sort(function (a, b) { return b.fragility - a.fragility; })
      .slice(0, 6);
    for (var i = 0; i < topParams.length; i++) {
      atoms.push(topParams[i].key + '=' + topParams[i].value);
    }

    atoms.push('OP=EMIT_' + analysis.outputFormat.toUpperCase());

    if (atoms.length < 2) {
      return {
        name: 'CCP', applied: false, input: text, output: text,
        tokensRemoved: 0, description: 'Insufficient semantic atoms for closure block',
      };
    }

    var closureBlock = '\n###<CC>\n' + atoms.join(';\n') + ';\n###</CC>';
    var result = text + closureBlock;

    return {
      name: 'CCP', applied: true, input: text, output: result,
      tokensRemoved: -Math.ceil(closureBlock.length / 4),
      description: 'Added causal closure block with ' + atoms.length + ' semantic atoms',
    };
  }

  function applyCAS(text, analysis) {
    if (analysis.parameters.length < 2) {
      return {
        name: 'CAS', applied: false, input: text, output: text,
        tokensRemoved: 0, description: 'Too few parameters for CAS repositioning',
      };
    }

    var constraintMatch = text.match(/^\[.+?\]\s*/);
    var prefix = constraintMatch ? constraintMatch[0] : '';
    var body = constraintMatch ? text.slice(prefix.length) : text;

    var kvPairs = Array.from(body.matchAll(/\b(\w+):([^\s\u2192|,\]]+)/g));
    if (kvPairs.length >= 2) {
      var sorted = kvPairs.map(function (m) {
        var found = analysis.parameters.find(function (p) {
          return p.key.includes(m[1]) || p.value === m[2];
        });
        return { full: m[0], key: m[1], value: m[2], fragility: found ? found.fragility : 0.5 };
      }).sort(function (a, b) { return b.fragility - a.fragility; });

      var currentOrder = kvPairs.map(function (m) { return m[0]; });
      var newOrder = sorted.map(function (s) { return s.full; });
      var orderChanged = currentOrder.some(function (v, i) { return v !== newOrder[i]; });

      if (orderChanged) {
        var tempBody = body;
        for (var i = 0; i < kvPairs.length; i++) {
          var kv = kvPairs[i][0];
          var idx = tempBody.indexOf(kv);
          if (idx >= 0) {
            tempBody = tempBody.slice(0, idx) + '__KV_' + i + '__' + tempBody.slice(idx + kv.length);
          }
        }

        for (var j = 0; j < kvPairs.length && j < sorted.length; j++) {
          tempBody = tempBody.replace('__KV_' + j + '__', sorted[j].full);
        }

        var casResult = prefix + tempBody;
        return {
          name: 'CAS', applied: true, input: text, output: casResult,
          tokensRemoved: 0,
          description: 'Reordered ' + sorted.length + ' params by fragility',
        };
      }
    }

    return {
      name: 'CAS', applied: false, input: text, output: text,
      tokensRemoved: 0, description: 'Parameter ordering already optimal for causal access',
    };
  }

  function applySADF(text, analysis, topK) {
    topK = topK || 4;

    var kvs = text.match(/\b\w+:[^\s\u2192|,\]]+/g) || [];
    var filtered = kvs.filter(function (kv) { return !/^(ANSWER|CLASSIFY|ANCHOR|CC):/i.test(kv); });

    if (filtered.length === 0) {
      if (analysis.parameters.length === 0) {
        return {
          name: 'SAD-F', applied: false, input: text, output: text,
          tokensRemoved: 0, description: 'No anchors to duplicate',
        };
      }

      var topParams = analysis.parameters.slice()
        .sort(function (a, b) { return b.fragility - a.fragility; })
        .slice(0, topK);

      var anchorStr = topParams.map(function (p) { return p.key + ':' + p.value; }).join(',');
      var tag = ' [ANCHOR:' + anchorStr + ']';
      var result = text + tag;

      return {
        name: 'SAD-F', applied: true, input: text, output: result,
        tokensRemoved: -Math.ceil(tag.length / 4),
        description: 'Added ' + topParams.length + ' fragility-weighted anchors from analysis',
      };
    }

    var sortedKvs = filtered.slice().sort(function (a, b) { return b.length - a.length; });
    var anchors = sortedKvs.slice(0, topK);

    var spec = text.match(/\[[^\]]+\]/);
    var specStr = spec ? spec[0] : null;
    var allAnchors = specStr ? [specStr].concat(anchors) : anchors;

    var sadfTag = ' [ANCHOR:' + allAnchors.join(',') + ']';
    var sadfResult = text + sadfTag;

    return {
      name: 'SAD-F', applied: true, input: text, output: sadfResult,
      tokensRemoved: -Math.ceil(sadfTag.length / 4),
      description: 'Duplicated ' + allAnchors.length + ' high-fragility anchors (budget: ' + topK + ')',
    };
  }

  function wrapContext(text, analysis) {
    if (!analysis.context) {
      return {
        name: 'CTX-WRAP', applied: false, input: text, output: text,
        tokensRemoved: 0, description: 'No context block detected',
      };
    }

    var ctxWrapped = '<<CTX>>\n' + analysis.context + '\n<</CTX>>';
    var question = analysis.question || '';

    var constraintMatch = text.match(/^\[.+?\]\s*/);
    var prefix = constraintMatch ? constraintMatch[0] : '';
    var result = prefix + ctxWrapped + ' \u2192 ' + question;

    return {
      name: 'CTX-WRAP', applied: true, input: text, output: result,
      tokensRemoved: Math.ceil((text.length - result.length) / 4),
      description: 'Wrapped ' + analysis.context.length + ' char context in <<CTX>> delimiters',
    };
  }

  function compactMultipleChoice(text, analysis) {
    if (!analysis.hasMultipleChoice) {
      return {
        name: 'MC-COMPACT', applied: false, input: text, output: text,
        tokensRemoved: 0, description: 'No multiple choice detected',
      };
    }

    var constraintMatch = text.match(/^\[.+?\]\s*/);
    var prefix = constraintMatch ? constraintMatch[0] : '';
    var body = constraintMatch ? text.slice(prefix.length) : text;

    var opts = analysis.mcOptions.join(' ');

    for (var i = 0; i < analysis.mcOptions.length; i++) {
      var letter = analysis.mcOptions[i].split(':')[0];
      body = body.replace(new RegExp(letter + '[.):]\s*[^\n]+\n?', 'g'), '');
    }

    body = body.replace(/\n{2,}/g, '\n').trim();

    var result = prefix + opts + ' \u2192 ' + body;

    return {
      name: 'MC-COMPACT', applied: true, input: text, output: result,
      tokensRemoved: Math.ceil((text.length - result.length) / 4),
      description: 'Compacted ' + analysis.mcOptions.length + ' MC options into DRO format',
    };
  }

  // ============================================================
  // OPTIMIZER (Main Orchestrator)
  // ============================================================

  var PROFILE_TRANSFORMS = {
    minimal: ['SDM', 'CFL'],
    balanced: ['SDM', 'DRO', 'CFL', 'CFO', 'TAS', 'MC-COMPACT', 'CTX-WRAP'],
    max_compress: ['SDM', 'DRO', 'CFL', 'CFO', 'TAS', 'MC-COMPACT', 'CTX-WRAP'],
    max_accuracy: ['SDM', 'CFL', 'DRO', 'TAS', 'MC-COMPACT', 'CTX-WRAP', 'CCP', 'SAD-F'],
    full: ['SDM', 'DRO', 'CFL', 'CFO', 'TAS', 'MC-COMPACT', 'CTX-WRAP', 'CCP', 'CAS', 'SAD-F'],
  };

  var DEFAULT_OPTIMIZER_OPTIONS = {
    profile: 'balanced',
    enableSADF: true,
    enableCCP: true,
    sadTopK: 4,
    verbose: false,
  };

  function optimizePrompt(prompt, options) {
    options = options || {};
    var opts = {
      profile: options.profile || DEFAULT_OPTIMIZER_OPTIONS.profile,
      enableSADF: options.enableSADF !== undefined ? options.enableSADF : DEFAULT_OPTIMIZER_OPTIONS.enableSADF,
      enableCCP: options.enableCCP !== undefined ? options.enableCCP : DEFAULT_OPTIMIZER_OPTIONS.enableCCP,
      sadTopK: options.sadTopK !== undefined ? options.sadTopK : DEFAULT_OPTIMIZER_OPTIONS.sadTopK,
      verbose: options.verbose || false,
    };

    var enabledTransforms = new Set(PROFILE_TRANSFORMS[opts.profile] || PROFILE_TRANSFORMS.balanced);

    if (opts.enableSADF && !enabledTransforms.has('SAD-F')) enabledTransforms.add('SAD-F');
    if (!opts.enableSADF) enabledTransforms.delete('SAD-F');
    if (opts.enableCCP && !enabledTransforms.has('CCP')) enabledTransforms.add('CCP');
    if (!opts.enableCCP) enabledTransforms.delete('CCP');

    var analysis = analyzePrompt(prompt);
    var transforms = [];
    var current = prompt;

    function runTransform(name, fn) {
      if (!enabledTransforms.has(name)) return;
      var result = fn();
      transforms.push(result);
      if (result.applied) current = result.output;
    }

    runTransform('SDM', function () { return applySDM(current, analysis); });
    runTransform('DRO', function () { return applyDRO(current, analysis); });
    runTransform('CFL', function () { return applyCFL(current, analysis); });
    runTransform('CFO', function () { return applyCFO(current, analysis); });
    runTransform('TAS', function () { return applyTAS(current, analysis); });
    runTransform('MC-COMPACT', function () { return compactMultipleChoice(current, analysis); });
    runTransform('CTX-WRAP', function () { return wrapContext(current, analysis); });
    runTransform('CCP', function () { return applyCCP(current, analysis); });
    runTransform('CAS', function () { return applyCAS(current, analysis); });
    runTransform('SAD-F', function () { return applySADF(current, analysis, opts.sadTopK); });

    // Model-aware CFL/SAD stripping (v1.2.0)
    if (options && options.provider) {
      var profile = getModelProfile(options.provider);
      if (!profile.enableCFL) {
        current = stripCFLTags(current);
      }
      if (!profile.enableSAD) {
        current = stripSADTags(current);
      }
    }

    var applied = transforms.filter(function (t) { return t.applied; });
    var skipped = transforms.filter(function (t) { return !t.applied; });
    var totalTokensBefore = Math.ceil(prompt.length / 4);
    var totalTokensAfter = Math.ceil(current.length / 4);

    var pipeline = {
      transforms: transforms,
      original: prompt,
      optimized: current,
      totalTokensBefore: totalTokensBefore,
      totalTokensAfter: totalTokensAfter,
      compressionRatio: current.length / prompt.length,
    };

    var metrics = {
      originalChars: prompt.length,
      optimizedChars: current.length,
      originalTokensEst: totalTokensBefore,
      optimizedTokensEst: totalTokensAfter,
      compressionRatio: totalTokensAfter / totalTokensBefore,
      tokensRemoved: totalTokensBefore - totalTokensAfter,
      tokensSaved: Math.max(0, totalTokensBefore - totalTokensAfter),
      transformsApplied: applied.length,
      transformsSkipped: skipped.length,
      promptType: analysis.type,
      outputFormat: analysis.outputFormat,
    };

    return {
      original: prompt,
      optimized: current,
      analysis: analysis,
      pipeline: pipeline,
      profile: opts.profile,
      metrics: metrics,
    };
  }

  // ============================================================
  // MODEL PROFILES (v1.2.0)
  // ============================================================

  var MODEL_PROFILES = {
    claude:  { family: 'claude',  enableCFL: true,  enableSAD: true  },
    gpt5:    { family: 'gpt5',    enableCFL: true,  enableSAD: true  },
    gpt4o:   { family: 'gpt4o',   enableCFL: false, enableSAD: false },
    gemini:  { family: 'gemini',  enableCFL: false, enableSAD: false },
    unknown: { family: 'unknown', enableCFL: false, enableSAD: false },
  };

  function getModelFamily(provider) {
    if (!provider) return 'unknown';
    provider = provider.toLowerCase();
    if (provider === 'anthropic' || provider === 'claude') return 'claude';
    if (provider === 'openai_gpt5' || provider === 'gpt5') return 'gpt5';
    if (provider === 'openai_gpt4o' || provider === 'gpt4o' || provider === 'openai') return 'gpt4o';
    if (provider === 'gemini' || provider === 'google') return 'gemini';
    return 'unknown';
  }

  function getModelProfile(provider) {
    var family = getModelFamily(provider);
    return MODEL_PROFILES[family] || MODEL_PROFILES.unknown;
  }

  function stripCFLTags(prompt) {
    return prompt.replace(/\[ANSWER:[^\]]*\]\s*/g, '').replace(/\[CLASSIFY:[^\]]*\]\s*/g, '').trim();
  }

  function stripSADTags(prompt) {
    return prompt.replace(/\s*\[ANCHOR:[^\]]*\]/g, '').trim();
  }

  // ============================================================
  // TOOL SCHEMA OPTIMIZATION (v5.0 — from transforms-tools.ts)
  // ============================================================

  // Filler patterns for tool description compression (SDM for tools)
  var TOOL_FILLER_PATTERNS = [
    [/\bUse this tool when you need to\s*/gi, ''],
    [/\bUse this (?:tool|function) (?:to|for)\s*/gi, ''],
    [/\bThis tool (?:allows you to|lets you|enables you to|is used to|can be used to|will)\s*/gi, ''],
    [/\bYou can use this (?:tool )? ?to\s*/gi, ''],
    [/\bThis (?:tool|function) (?:is designed|was designed) to\s*/gi, ''],
    [/\bPlease note that\s*/gi, ''],
    [/\bNote that\s*/gi, ''],
    [/\bIt (?:is|can be) (?:useful|helpful) (?:for|when)\s*/gi, ''],
    [/\bThis is (?:a|the) tool (?:for|that)\s*/gi, ''],
    [/\bThe (?:value|name|text|content|data|input|output) (?:of |for )?(?:the |a )?/gi, ''],
    [/\bSpecifies the\s*/gi, ''],
    [/\bIndicates (?:the|whether)\s*/gi, ''],
    [/\bDetermines (?:the|whether)\s*/gi, ''],
    [/\bRepresents (?:the|a)\s*/gi, ''],
    [/\s*\bif needed\.?\s*$/gi, ''],
    [/\s*\bif applicable\.?\s*$/gi, ''],
    [/\s*\bas needed\.?\s*$/gi, ''],
    [/\s*\bwhen available\.?\s*$/gi, ''],
    [/\bthat may have changed since your training cutoff\b/gi, ''],
    [/\bsince (?:the|your) (?:training|knowledge) cutoff\b/gi, ''],
    [/\bor any (?:other )?(?:current |relevant )?(?:data|information)\b/gi, ''],
    [/\bor any (?:other )?\w+ that (?:you |might |may )?\w+\b/gi, ''],
    [/\bto execute\b/gi, ''],
    [/\bto perform\b/gi, ''],
    [/\bto carry out\b/gi, ''],
    [/\s{2,}/g, ' '],
    [/\s+\./g, '.'],
    [/,\s*\./g, '.'],
    [/,\s*,/g, ','],
    [/^\s*,\s*/g, ''],
  ];

  var TYPE_ABBREV = {
    string: 'str',
    number: 'num',
    boolean: 'bool',
    array: 'arr',
    object: 'obj',
  };

  function compressToolText(text) {
    var result = text;
    for (var i = 0; i < TOOL_FILLER_PATTERNS.length; i++) {
      result = result.replace(TOOL_FILLER_PATTERNS[i][0], TOOL_FILLER_PATTERNS[i][1]);
    }
    result = result.trim();
    if (result.length > 0 && /[a-z]/.test(result[0])) {
      result = result[0].toUpperCase() + result.slice(1);
    }
    if (result.length > 0 && !/[.!?]$/.test(result)) {
      result += '.';
    }
    return result;
  }

  /**
   * Parse tool definitions from OpenAI or Anthropic format.
   */
  function parseToolDefinitions(tools) {
    var parsed = [];
    for (var i = 0; i < tools.length; i++) {
      var tool = tools[i];
      var name, description, params;

      if (tool.type === 'function' && tool.function) {
        // OpenAI format
        name = tool.function.name;
        description = tool.function.description || '';
        var schema = tool.function.parameters || {};
        params = extractParams(schema);
      } else if (tool.name && tool.input_schema) {
        // Anthropic format
        name = tool.name;
        description = tool.description || '';
        params = extractParams(tool.input_schema);
      } else {
        continue;
      }

      parsed.push({ name: name, description: description, parameters: params });
    }
    return parsed;
  }

  function extractParams(schema) {
    var params = [];
    var props = (schema && schema.properties) || {};
    var required = (schema && schema.required) || [];

    for (var paramName in props) {
      if (!props.hasOwnProperty(paramName)) continue;
      var def = props[paramName];
      params.push({
        name: paramName,
        type: def.type || 'string',
        description: def.description || '',
        required: required.indexOf(paramName) >= 0,
        enum: def.enum || null,
      });
    }
    return params;
  }

  /**
   * Optimize tool definitions: SDM -> DRO -> TAS pipeline.
   */
  function optimizeToolDefinitions(tools) {
    var parsed = parseToolDefinitions(tools);

    // Compute original text for token estimation
    var originalLines = [];
    for (var i = 0; i < parsed.length; i++) {
      var t = parsed[i];
      originalLines.push('Tool: ' + t.name);
      originalLines.push('Description: ' + t.description);
      originalLines.push('Parameters:');
      for (var j = 0; j < t.parameters.length; j++) {
        var p = t.parameters[j];
        var reqStr = p.required ? ' (required)' : ' (optional)';
        var enumStr = p.enum ? ' Allowed values: ' + p.enum.join(', ') + '.' : '';
        originalLines.push('  - ' + p.name + ' (' + p.type + ')' + reqStr + ': ' + p.description + enumStr);
      }
      originalLines.push('');
    }
    var originalText = originalLines.join('\n');
    var originalTokens = Math.ceil(originalText.length / 4);

    // SDM: compress descriptions
    for (var si = 0; si < parsed.length; si++) {
      parsed[si].description = compressToolText(parsed[si].description);
      for (var sj = 0; sj < parsed[si].parameters.length; sj++) {
        parsed[si].parameters[sj].description = compressToolText(parsed[si].parameters[sj].description);
      }
    }

    // DRO: compact parameter format
    var optimizedLines = [];
    for (var di = 0; di < parsed.length; di++) {
      var dt = parsed[di];
      var paramParts = [];
      for (var dj = 0; dj < dt.parameters.length; dj++) {
        var dp = dt.parameters[dj];
        var reqMark = dp.required ? '*' : '';
        var typeAbbrev = TYPE_ABBREV[dp.type] || dp.type;
        var eStr = dp.enum && dp.enum.length > 0 ? ': ' + dp.enum.join('|') : '';
        paramParts.push(dp.name + reqMark + ' (' + typeAbbrev + eStr + '): ' + dp.description);
      }
      var paramLine = paramParts.length > 0 ? '\n  ' + paramParts.join(' | ') : '';
      optimizedLines.push(dt.name + ': ' + dt.description + paramLine);
    }

    // TAS: BPE-optimal formatting
    var optimizedText = optimizedLines.map(function (line) {
      return line.replace(/=>/g, ':').replace(/-->/g, ':').replace(/:\s{2,}/g, ': ');
    }).join('\n');

    var optimizedTokens = Math.ceil(optimizedText.length / 4);
    var savingsPercent = originalTokens > 0
      ? Math.round(((originalTokens - optimizedTokens) / originalTokens) * 1000) / 10
      : 0;

    return {
      text: optimizedText,
      originalTokenEstimate: originalTokens,
      optimizedTokenEstimate: optimizedTokens,
      savingsPercent: savingsPercent,
      toolCount: parsed.length,
    };
  }

  // ============================================================
  // EXPORTS
  // ============================================================

  var TSCG = {
    optimizePrompt: optimizePrompt,
    optimizeToolDefinitions: optimizeToolDefinitions,
    analyzePrompt: analyzePrompt,
    DEFAULT_OPTIMIZER_OPTIONS: DEFAULT_OPTIMIZER_OPTIONS,
    PROFILE_TRANSFORMS: PROFILE_TRANSFORMS,
    getModelProfile: getModelProfile,
    getModelFamily: getModelFamily,
    MODEL_PROFILES: MODEL_PROFILES,
    VERSION: '5.0.0',
  };

  // Make available globally
  if (typeof root !== 'undefined') {
    root.TSCG = TSCG;
  }

})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this);
