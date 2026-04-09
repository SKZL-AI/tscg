/**
 * TSCG Tool Transforms & Tool Test Cases - Unit Tests
 * Validates tool transform functions, tool definitions, and tool benchmark test cases.
 */

import { describe, it, expect } from 'vitest';
import {
  applyToolSDM,
  applyToolDRO,
  applyToolCAS,
  applyToolTAS,
  optimizeToolDefinitions,
  type ToolDefinition,
  type ToolParameter,
  type OptimizedToolDefs,
} from '../src/optimizer/transforms-tools.js';
import {
  TOOL_DEFINITIONS,
  TOOL_TESTS,
  getToolTestsByCategory,
  type ToolDef,
} from '../src/benchmark/tool-cases.js';
import { CORE_TESTS } from '../src/benchmark/test-cases.js';
import { HARD_TESTS } from '../src/benchmark/hard-cases.js';

// ============================================================
// Tool Transform Functions
// ============================================================

describe('tool transforms', () => {
  // --- Helpers: sample tool definitions for transform tests ---

  const sampleTools: ToolDefinition[] = [
    {
      name: 'search',
      description: 'Use this tool when you need to search the web for current information.',
      parameters: [
        { name: 'query', type: 'string', description: 'The search query to find results', required: true },
        { name: 'limit', type: 'number', description: 'Specifies the maximum number of results', required: false },
      ],
      usageFrequency: 0.9,
    },
    {
      name: 'translate',
      description: 'This tool allows you to translate text from one language to another.',
      parameters: [
        { name: 'text', type: 'string', description: 'The text to translate', required: true },
        { name: 'target', type: 'string', description: 'The value of the target language code', required: true },
      ],
      usageFrequency: 0.3,
    },
    {
      name: 'calculate',
      description: 'Evaluate a mathematical expression. Note that complex expressions may take longer.',
      parameters: [
        { name: 'expression', type: 'string', description: 'The mathematical expression to evaluate', required: true },
        { name: 'precision', type: 'number', description: 'Determines the number of decimal places', required: false },
      ],
      usageFrequency: 0.1,
    },
  ];

  // ============================================================
  // applyToolSDM
  // ============================================================

  describe('applyToolSDM', () => {
    it('is a callable function', () => {
      expect(typeof applyToolSDM).toBe('function');
    });

    it('returns an array of the same length', () => {
      const result = applyToolSDM(sampleTools);
      expect(result).toHaveLength(sampleTools.length);
    });

    it('removes filler phrases from tool descriptions', () => {
      const result = applyToolSDM(sampleTools);
      // "Use this tool when you need to" should be stripped
      expect(result[0].description).not.toContain('Use this tool when you need to');
      // "This tool allows you to" should be stripped
      expect(result[1].description).not.toContain('This tool allows you to');
    });

    it('removes filler phrases from parameter descriptions', () => {
      const result = applyToolSDM(sampleTools);
      // "Specifies the" should be stripped from limit param
      const limitParam = result[0].parameters.find((p) => p.name === 'limit');
      expect(limitParam!.description).not.toContain('Specifies the');
      // "Determines the" should be stripped from precision param
      const precisionParam = result[2].parameters.find((p) => p.name === 'precision');
      expect(precisionParam!.description).not.toContain('Determines the');
    });

    it('removes "Note that" hedging', () => {
      const result = applyToolSDM(sampleTools);
      expect(result[2].description).not.toContain('Note that');
    });

    it('capitalizes first letter after filler removal', () => {
      const result = applyToolSDM(sampleTools);
      for (const tool of result) {
        if (tool.description.length > 0) {
          expect(tool.description[0]).toMatch(/[A-Z]/);
        }
      }
    });

    it('ensures descriptions end with punctuation', () => {
      const result = applyToolSDM(sampleTools);
      for (const tool of result) {
        if (tool.description.length > 0) {
          expect(tool.description).toMatch(/[.!?]$/);
        }
      }
    });

    it('preserves tool names unchanged', () => {
      const result = applyToolSDM(sampleTools);
      for (let i = 0; i < sampleTools.length; i++) {
        expect(result[i].name).toBe(sampleTools[i].name);
      }
    });

    it('preserves parameter names, types, and required flags', () => {
      const result = applyToolSDM(sampleTools);
      for (let i = 0; i < sampleTools.length; i++) {
        for (let j = 0; j < sampleTools[i].parameters.length; j++) {
          expect(result[i].parameters[j].name).toBe(sampleTools[i].parameters[j].name);
          expect(result[i].parameters[j].type).toBe(sampleTools[i].parameters[j].type);
          expect(result[i].parameters[j].required).toBe(sampleTools[i].parameters[j].required);
        }
      }
    });

    it('handles empty tool array', () => {
      const result = applyToolSDM([]);
      expect(result).toEqual([]);
    });

    it('handles tool with empty description', () => {
      const emptyDescTool: ToolDefinition[] = [
        { name: 'empty', description: '', parameters: [] },
      ];
      const result = applyToolSDM(emptyDescTool);
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('');
    });

    it('handles tool with no parameters', () => {
      const noParamTool: ToolDefinition[] = [
        { name: 'noop', description: 'This tool allows you to do nothing.', parameters: [] },
      ];
      const result = applyToolSDM(noParamTool);
      expect(result[0].parameters).toEqual([]);
    });

    it('does not mutate the original array', () => {
      const original = JSON.parse(JSON.stringify(sampleTools));
      applyToolSDM(sampleTools);
      expect(sampleTools).toEqual(original);
    });

    it('produces shorter or equal descriptions (compression)', () => {
      const result = applyToolSDM(sampleTools);
      for (let i = 0; i < sampleTools.length; i++) {
        expect(result[i].description.length).toBeLessThanOrEqual(
          sampleTools[i].description.length
        );
      }
    });
  });

  // ============================================================
  // applyToolDRO
  // ============================================================

  describe('applyToolDRO', () => {
    it('is a callable function', () => {
      expect(typeof applyToolDRO).toBe('function');
    });

    it('returns a string array of the same length as input', () => {
      const result = applyToolDRO(sampleTools);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(sampleTools.length);
    });

    it('includes tool name at the start of each line', () => {
      const result = applyToolDRO(sampleTools);
      for (let i = 0; i < sampleTools.length; i++) {
        expect(result[i]).toMatch(new RegExp(`^${sampleTools[i].name}:`));
      }
    });

    it('marks required parameters with asterisk', () => {
      const result = applyToolDRO(sampleTools);
      // "query" is required in search tool
      expect(result[0]).toContain('query*');
      // "limit" is not required
      expect(result[0]).not.toContain('limit*');
    });

    it('abbreviates type names', () => {
      const result = applyToolDRO(sampleTools);
      // string -> str
      expect(result[0]).toContain('(str)');
      // number -> num
      expect(result[0]).toContain('(num)');
    });

    it('handles enum values with pipe separator', () => {
      const toolWithEnum: ToolDefinition[] = [
        {
          name: 'filter',
          description: 'Filter items.',
          parameters: [
            {
              name: 'priority',
              type: 'string',
              description: 'Priority level',
              required: true,
              enum: ['low', 'medium', 'high'],
            },
          ],
        },
      ];
      const result = applyToolDRO(toolWithEnum);
      expect(result[0]).toContain('low|medium|high');
    });

    it('separates parameters with pipe delimiter', () => {
      const result = applyToolDRO(sampleTools);
      // search has 2 params, should have a | between them
      expect(result[0]).toContain(' | ');
    });

    it('handles tool with no parameters', () => {
      const noParamTool: ToolDefinition[] = [
        { name: 'ping', description: 'Ping the server.', parameters: [] },
      ];
      const result = applyToolDRO(noParamTool);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatch(/^ping:/);
      // Should not have param line
      expect(result[0]).not.toContain('\n');
    });

    it('handles empty tool array', () => {
      const result = applyToolDRO([]);
      expect(result).toEqual([]);
    });

    it('abbreviates boolean type to bool', () => {
      const boolTool: ToolDefinition[] = [
        {
          name: 'toggle',
          description: 'Toggle a setting.',
          parameters: [
            { name: 'enabled', type: 'boolean', description: 'Enabled state', required: true },
          ],
        },
      ];
      const result = applyToolDRO(boolTool);
      expect(result[0]).toContain('(bool)');
    });

    it('abbreviates array type to arr', () => {
      const arrTool: ToolDefinition[] = [
        {
          name: 'batch',
          description: 'Batch process items.',
          parameters: [
            { name: 'items', type: 'array', description: 'Items list', required: true },
          ],
        },
      ];
      const result = applyToolDRO(arrTool);
      expect(result[0]).toContain('(arr)');
    });

    it('abbreviates object type to obj', () => {
      const objTool: ToolDefinition[] = [
        {
          name: 'configure',
          description: 'Set configuration.',
          parameters: [
            { name: 'config', type: 'object', description: 'Config object', required: false },
          ],
        },
      ];
      const result = applyToolDRO(objTool);
      expect(result[0]).toContain('(obj)');
    });
  });

  // ============================================================
  // applyToolCAS
  // ============================================================

  describe('applyToolCAS', () => {
    it('is a callable function', () => {
      expect(typeof applyToolCAS).toBe('function');
    });

    it('returns an array of the same length', () => {
      const result = applyToolCAS(sampleTools);
      expect(result).toHaveLength(sampleTools.length);
    });

    it('returns a copy (not the same reference) for 3+ tools', () => {
      const result = applyToolCAS(sampleTools);
      expect(result).not.toBe(sampleTools);
    });

    it('places highest-frequency tool at position 0', () => {
      const result = applyToolCAS(sampleTools);
      // search has frequency 0.9 (highest), should be at index 0
      expect(result[0].name).toBe('search');
    });

    it('places second-highest frequency tool at last position', () => {
      const result = applyToolCAS(sampleTools);
      // translate has frequency 0.3 (second highest), should be at the end
      expect(result[result.length - 1].name).toBe('translate');
    });

    it('places lowest-frequency tool in the middle', () => {
      const result = applyToolCAS(sampleTools);
      // calculate has frequency 0.1 (lowest), should be in middle
      expect(result[1].name).toBe('calculate');
    });

    it('returns a shallow copy for arrays of 2 or fewer tools', () => {
      const two = sampleTools.slice(0, 2);
      const result = applyToolCAS(two);
      expect(result).toHaveLength(2);
      expect(result).not.toBe(two);
      // Same elements, same order for <= 2
      expect(result[0].name).toBe(two[0].name);
      expect(result[1].name).toBe(two[1].name);
    });

    it('handles single tool', () => {
      const single = [sampleTools[0]];
      const result = applyToolCAS(single);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('search');
    });

    it('handles empty array', () => {
      const result = applyToolCAS([]);
      expect(result).toEqual([]);
    });

    it('defaults missing usageFrequency to 0.5', () => {
      const noFreq: ToolDefinition[] = [
        { name: 'a', description: 'A', parameters: [], usageFrequency: 1.0 },
        { name: 'b', description: 'B', parameters: [] }, // defaults to 0.5
        { name: 'c', description: 'C', parameters: [], usageFrequency: 0.0 },
      ];
      const result = applyToolCAS(noFreq);
      // a (1.0) -> first, b (0.5) -> last, c (0.0) -> middle
      expect(result[0].name).toBe('a');
      expect(result[result.length - 1].name).toBe('b');
      expect(result[1].name).toBe('c');
    });

    it('preserves all original tool definitions (no data loss)', () => {
      const result = applyToolCAS(sampleTools);
      const names = result.map((t) => t.name).sort();
      const expectedNames = sampleTools.map((t) => t.name).sort();
      expect(names).toEqual(expectedNames);
    });

    it('creates U-shape for 5 tools', () => {
      const fiveTools: ToolDefinition[] = [
        { name: 'a', description: 'A', parameters: [], usageFrequency: 0.9 },
        { name: 'b', description: 'B', parameters: [], usageFrequency: 0.7 },
        { name: 'c', description: 'C', parameters: [], usageFrequency: 0.5 },
        { name: 'd', description: 'D', parameters: [], usageFrequency: 0.3 },
        { name: 'e', description: 'E', parameters: [], usageFrequency: 0.1 },
      ];
      const result = applyToolCAS(fiveTools);
      // Sorted by freq desc: a(0.9), b(0.7), c(0.5), d(0.3), e(0.1)
      // U-shape placement:
      //   i=0 (a) -> left=0  => result[0] = a
      //   i=1 (b) -> right=4 => result[4] = b
      //   i=2 (c) -> left=1  => result[1] = c
      //   i=3 (d) -> right=3 => result[3] = d
      //   i=4 (e) -> left=2  => result[2] = e
      expect(result[0].name).toBe('a');
      expect(result[1].name).toBe('c');
      expect(result[2].name).toBe('e');
      expect(result[3].name).toBe('d');
      expect(result[4].name).toBe('b');
    });
  });

  // ============================================================
  // applyToolTAS
  // ============================================================

  describe('applyToolTAS', () => {
    it('is a callable function', () => {
      expect(typeof applyToolTAS).toBe('function');
    });

    it('returns a string', () => {
      const result = applyToolTAS(['search: Find things']);
      expect(typeof result).toBe('string');
    });

    it('joins lines with newline', () => {
      const input = ['search: Find things', 'translate: Translate text'];
      const result = applyToolTAS(input);
      expect(result).toContain('\n');
      const lines = result.split('\n');
      expect(lines).toHaveLength(2);
    });

    it('replaces => with :', () => {
      const input = ['search => Find things'];
      const result = applyToolTAS(input);
      expect(result).not.toContain('=>');
      expect(result).toContain(':');
    });

    it('replaces --> with :', () => {
      const input = ['search --> Find things'];
      const result = applyToolTAS(input);
      expect(result).not.toContain('-->');
    });

    it('normalizes pipe delimiter spacing', () => {
      const input = ['a|b|c'];
      const result = applyToolTAS(input);
      expect(result).toContain(' | ');
    });

    it('collapses extra spaces after colons', () => {
      const input = ['search:    Find things'];
      const result = applyToolTAS(input);
      expect(result).toBe('search: Find things');
    });

    it('handles empty array', () => {
      const result = applyToolTAS([]);
      expect(result).toBe('');
    });

    it('handles single-element array', () => {
      const result = applyToolTAS(['hello']);
      expect(result).toBe('hello');
    });
  });

  // ============================================================
  // optimizeToolDefinitions (full pipeline)
  // ============================================================

  describe('optimizeToolDefinitions', () => {
    it('is a callable function', () => {
      expect(typeof optimizeToolDefinitions).toBe('function');
    });

    it('returns an OptimizedToolDefs object with required fields', () => {
      const result = optimizeToolDefinitions(sampleTools);
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('originalTokenEstimate');
      expect(result).toHaveProperty('optimizedTokenEstimate');
      expect(result).toHaveProperty('savingsPercent');
      expect(typeof result.text).toBe('string');
      expect(typeof result.originalTokenEstimate).toBe('number');
      expect(typeof result.optimizedTokenEstimate).toBe('number');
      expect(typeof result.savingsPercent).toBe('number');
    });

    it('produces positive token savings with all options enabled', () => {
      const result = optimizeToolDefinitions(sampleTools);
      expect(result.savingsPercent).toBeGreaterThan(0);
      expect(result.optimizedTokenEstimate).toBeLessThan(result.originalTokenEstimate);
    });

    it('text is non-empty for non-empty tool list', () => {
      const result = optimizeToolDefinitions(sampleTools);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('respects useSDM=false option', () => {
      const withSDM = optimizeToolDefinitions(sampleTools, { useSDM: true });
      const noSDM = optimizeToolDefinitions(sampleTools, { useSDM: false });
      // Without SDM, descriptions are longer, so the text should differ
      expect(noSDM.text).not.toBe(withSDM.text);
    });

    it('respects useDRO=false option', () => {
      const withDRO = optimizeToolDefinitions(sampleTools, { useDRO: true });
      const noDRO = optimizeToolDefinitions(sampleTools, { useDRO: false });
      expect(noDRO.text).not.toBe(withDRO.text);
    });

    it('respects useCAS=false option', () => {
      const withCAS = optimizeToolDefinitions(sampleTools, { useCAS: true });
      const noCAS = optimizeToolDefinitions(sampleTools, { useCAS: false });
      // CAS reorders tools; with 3 tools the order changes
      expect(noCAS.text).not.toBe(withCAS.text);
    });

    it('respects useTAS=false option', () => {
      const withTAS = optimizeToolDefinitions(sampleTools, { useTAS: true });
      const noTAS = optimizeToolDefinitions(sampleTools, { useTAS: false });
      expect(noTAS.text).not.toBe(withTAS.text);
    });

    it('all options disabled returns a baseline', () => {
      const result = optimizeToolDefinitions(sampleTools, {
        useSDM: false,
        useDRO: false,
        useCAS: false,
        useTAS: false,
      });
      expect(result.text.length).toBeGreaterThan(0);
      // With all optimizations disabled, savings could be 0 or very small
      expect(result.originalTokenEstimate).toBeGreaterThan(0);
    });

    it('handles empty tool array', () => {
      const result = optimizeToolDefinitions([]);
      expect(result.text).toBe('');
      expect(result.savingsPercent).toBe(0);
    });

    it('handles single tool', () => {
      const result = optimizeToolDefinitions([sampleTools[0]]);
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.originalTokenEstimate).toBeGreaterThan(0);
    });

    it('savingsPercent is between 0 and 100', () => {
      const result = optimizeToolDefinitions(sampleTools);
      expect(result.savingsPercent).toBeGreaterThanOrEqual(0);
      expect(result.savingsPercent).toBeLessThanOrEqual(100);
    });

    it('is deterministic (same input produces same output)', () => {
      const r1 = optimizeToolDefinitions(sampleTools);
      const r2 = optimizeToolDefinitions(sampleTools);
      expect(r1.text).toBe(r2.text);
      expect(r1.originalTokenEstimate).toBe(r2.originalTokenEstimate);
      expect(r1.optimizedTokenEstimate).toBe(r2.optimizedTokenEstimate);
      expect(r1.savingsPercent).toBe(r2.savingsPercent);
    });
  });
});

// ============================================================
// Tool Definitions (from tool-cases.ts)
// ============================================================

describe('tool definitions', () => {
  it('has exactly 25 tool definitions', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(25);
  });

  it('all tool definitions have required fields', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeTruthy();
      expect(typeof tool.description).toBe('string');
      expect(Array.isArray(tool.parameters)).toBe(true);
      expect(['high', 'medium', 'low']).toContain(tool.frequency);
    }
  });

  it('has no duplicate tool names', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has correct frequency distribution (8 high, 9 medium, 8 low)', () => {
    const counts: Record<string, number> = {};
    for (const tool of TOOL_DEFINITIONS) {
      counts[tool.frequency] = (counts[tool.frequency] || 0) + 1;
    }
    expect(counts['high']).toBe(8);
    expect(counts['medium']).toBe(9);
    expect(counts['low']).toBe(8);
  });

  it('all parameters have required fields', () => {
    for (const tool of TOOL_DEFINITIONS) {
      for (const param of tool.parameters) {
        expect(param.name).toBeTruthy();
        expect(typeof param.name).toBe('string');
        expect(param.type).toBeTruthy();
        expect(typeof param.type).toBe('string');
        expect(param.description).toBeTruthy();
        expect(typeof param.description).toBe('string');
        expect(typeof param.required).toBe('boolean');
      }
    }
  });

  it('each tool has at least one required parameter', () => {
    for (const tool of TOOL_DEFINITIONS) {
      const hasRequired = tool.parameters.some((p) => p.required);
      expect(hasRequired).toBe(true);
    }
  });

  it('enum arrays are non-empty when present', () => {
    for (const tool of TOOL_DEFINITIONS) {
      for (const param of tool.parameters) {
        if (param.enum !== undefined) {
          expect(param.enum.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

// ============================================================
// Tool Test Cases (from tool-cases.ts)
// ============================================================

describe('tool test cases', () => {
  it('has exactly 30 tests', () => {
    expect(TOOL_TESTS).toHaveLength(30);
  });

  it('has correct category distribution', () => {
    const counts: Record<string, number> = {};
    for (const t of TOOL_TESTS) {
      counts[t.category] = (counts[t.category] || 0) + 1;
    }
    expect(counts['Tool_SingleTool']).toBe(10);
    expect(counts['Tool_MultiTool']).toBe(8);
    expect(counts['Tool_Ambiguous']).toBe(7);
    expect(counts['Tool_NoTool']).toBe(5);
  });

  it('all tests have required fields', () => {
    for (const t of TOOL_TESTS) {
      expect(t.id).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.expected).toBeTruthy();
      expect(t.natural).toBeTruthy();
      expect(t.tscg).toBeTruthy();
      expect(typeof t.check).toBe('function');
    }
  });

  it('has no duplicate IDs within TOOL_TESTS', () => {
    const ids = TOOL_TESTS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no ID collisions with CORE_TESTS', () => {
    const coreIds = new Set(CORE_TESTS.map((t) => t.id));
    for (const t of TOOL_TESTS) {
      expect(coreIds.has(t.id)).toBe(false);
    }
  });

  it('has no ID collisions with HARD_TESTS', () => {
    const hardIds = new Set(HARD_TESTS.map((t) => t.id));
    for (const t of TOOL_TESTS) {
      expect(hardIds.has(t.id)).toBe(false);
    }
  });

  it('all checkers accept expected answers', () => {
    for (const t of TOOL_TESTS) {
      const result = t.check(t.expected);
      if (!result) {
        console.warn(
          `Checker for ${t.id} (${t.name}) rejected expected value: "${t.expected}"`
        );
      }
      expect(result).toBe(true);
    }
  });

  it('TSCG prompts contain tool instruction prefix', () => {
    for (const t of TOOL_TESTS) {
      expect(t.tscg).toMatch(/^\[ANSWER:tool_names\]/);
    }
  });

  it('natural prompts are substantial (length > 50)', () => {
    for (const t of TOOL_TESTS) {
      expect(t.natural.length).toBeGreaterThan(50);
    }
  });

  it('natural prompts contain the available tools block', () => {
    for (const t of TOOL_TESTS) {
      expect(t.natural).toContain('Available tools:');
    }
  });

  it('TSCG prompts contain the tools block', () => {
    for (const t of TOOL_TESTS) {
      expect(t.tscg).toContain('Tools:');
    }
  });

  it('IDs follow naming convention (tool-ts, tool-tm, tool-ta, tool-tn)', () => {
    const expectedPrefixes: Record<string, string> = {
      Tool_SingleTool: 'tool-ts',
      Tool_MultiTool: 'tool-tm',
      Tool_Ambiguous: 'tool-ta',
      Tool_NoTool: 'tool-tn',
    };
    for (const t of TOOL_TESTS) {
      const prefix = expectedPrefixes[t.category];
      expect(t.id.startsWith(prefix)).toBe(true);
    }
  });

  it('categories are valid TestCategory values', () => {
    const validCategories = [
      'Tool_SingleTool',
      'Tool_MultiTool',
      'Tool_Ambiguous',
      'Tool_NoTool',
    ];
    for (const t of TOOL_TESTS) {
      expect(validCategories).toContain(t.category);
    }
  });

  it('expected values for SingleTool tests are single tool names', () => {
    const singleTests = TOOL_TESTS.filter((t) => t.category === 'Tool_SingleTool');
    const toolNames = new Set(TOOL_DEFINITIONS.map((t) => t.name));
    for (const t of singleTests) {
      expect(toolNames.has(t.expected)).toBe(true);
    }
  });

  it('expected values for MultiTool tests contain multiple tool names', () => {
    const multiTests = TOOL_TESTS.filter((t) => t.category === 'Tool_MultiTool');
    for (const t of multiTests) {
      const tools = t.expected.split(',').map((s) => s.trim());
      expect(tools.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('expected value for NoTool tests is "none"', () => {
    const noToolTests = TOOL_TESTS.filter((t) => t.category === 'Tool_NoTool');
    for (const t of noToolTests) {
      expect(t.expected).toBe('none');
    }
  });

  it('all tests have tags array', () => {
    for (const t of TOOL_TESTS) {
      expect(Array.isArray(t.tags)).toBe(true);
      expect(t.tags!.length).toBeGreaterThan(0);
    }
  });

  it('all tests have "tool" tag', () => {
    for (const t of TOOL_TESTS) {
      expect(t.tags).toContain('tool');
    }
  });

  it('checkers reject clearly wrong answers', () => {
    // SingleTool checker should reject wrong tool name
    const singleTest = TOOL_TESTS.find((t) => t.id === 'tool-ts1')!;
    expect(singleTest.check('database_query')).toBe(false);

    // MultiTool checker should reject partial answer
    const multiTest = TOOL_TESTS.find((t) => t.id === 'tool-tm1')!;
    // needs both web_search AND send_email
    expect(multiTest.check('web_search')).toBe(false);
    expect(multiTest.check('send_email')).toBe(false);

    // NoTool checker should reject a tool name
    const noToolTest = TOOL_TESTS.find((t) => t.id === 'tool-tn1')!;
    expect(noToolTest.check('web_search')).toBe(false);
  });
});

// ============================================================
// getToolTestsByCategory
// ============================================================

describe('getToolTestsByCategory', () => {
  it('is a callable function', () => {
    expect(typeof getToolTestsByCategory).toBe('function');
  });

  it('returns correct count for Tool_SingleTool', () => {
    const result = getToolTestsByCategory('Tool_SingleTool');
    expect(result).toHaveLength(10);
  });

  it('returns correct count for Tool_MultiTool', () => {
    const result = getToolTestsByCategory('Tool_MultiTool');
    expect(result).toHaveLength(8);
  });

  it('returns correct count for Tool_Ambiguous', () => {
    const result = getToolTestsByCategory('Tool_Ambiguous');
    expect(result).toHaveLength(7);
  });

  it('returns correct count for Tool_NoTool', () => {
    const result = getToolTestsByCategory('Tool_NoTool');
    expect(result).toHaveLength(5);
  });

  it('returns empty array for unknown category', () => {
    const result = getToolTestsByCategory('NonExistent');
    expect(result).toEqual([]);
  });

  it('all returned tests match the requested category', () => {
    for (const cat of ['Tool_SingleTool', 'Tool_MultiTool', 'Tool_Ambiguous', 'Tool_NoTool']) {
      const result = getToolTestsByCategory(cat);
      for (const t of result) {
        expect(t.category).toBe(cat);
      }
    }
  });
});
