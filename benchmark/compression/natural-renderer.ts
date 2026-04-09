/**
 * TAB Benchmark — Natural Schema Renderer
 *
 * Renders tool schemas in their "natural" (uncompressed) format.
 * This is the baseline condition for all TAB benchmark comparisons.
 *
 * The natural format is the standard OpenAI function-calling JSON format
 * as sent to LLMs in production. TSCG compression savings are measured
 * relative to this baseline.
 *
 * Two output formats:
 *   - renderNaturalSchema():      Formatted text for system prompts
 *   - renderNaturalSchemaJSON():   Raw JSON (exact OpenAI wire format)
 */

import type { ToolDefinition, JSONSchemaProperty } from '../../packages/core/src/types.js';
import type { ToolSchema, ToolSchemaParameter } from '../schemas/types.js';

// ============================================================
// JSON Format Renderer (Exact OpenAI Wire Format)
// ============================================================

/**
 * Render tool schemas as the exact JSON that would be sent to an OpenAI
 * or compatible API in the `tools` parameter.
 *
 * This is the most accurate baseline for token counting since it
 * represents exactly what the model receives.
 *
 * @param tools - Array of tool definitions in OpenAI format
 * @returns JSON string of the tools array
 *
 * @example
 * ```ts
 * const json = renderNaturalSchemaJSON(tools);
 * const tokens = countTokens(json, 'gpt-4');
 * // This is the "natural" token count baseline
 * ```
 */
export function renderNaturalSchemaJSON(tools: ToolDefinition[]): string {
  return JSON.stringify(tools, null, 2);
}

// ============================================================
// Text Format Renderer (System Prompt Embedding)
// ============================================================

/**
 * Render tool schemas as human-readable text suitable for embedding
 * in a system prompt (the "natural text" condition).
 *
 * Format per tool:
 * ```
 * Tool: get_weather
 * Description: Get the current weather for a location
 * Parameters:
 *   - location (string, required): City name or coordinates
 *   - unit (string, optional): Temperature unit. Allowed: celsius, fahrenheit
 * ```
 *
 * @param tools - Array of tool definitions in OpenAI format
 * @returns Formatted text string
 */
export function renderNaturalSchema(tools: ToolDefinition[]): string {
  const sections: string[] = [];

  for (const tool of tools) {
    const fn = tool.function;
    const lines: string[] = [];

    lines.push(`Tool: ${fn.name}`);
    lines.push(`Description: ${fn.description}`);

    const props = fn.parameters.properties || {};
    const required = fn.parameters.required || [];

    if (Object.keys(props).length > 0) {
      lines.push('Parameters:');

      for (const [paramName, paramDef] of Object.entries(props)) {
        const isRequired = required.includes(paramName);
        const reqStr = isRequired ? 'required' : 'optional';
        const typeStr = paramDef.type;
        const descStr = paramDef.description || '';
        const enumStr = paramDef.enum && paramDef.enum.length > 0
          ? `. Allowed: ${paramDef.enum.join(', ')}`
          : '';
        const defaultStr = paramDef.default !== undefined
          ? `. Default: ${JSON.stringify(paramDef.default)}`
          : '';

        lines.push(`  - ${paramName} (${typeStr}, ${reqStr}): ${descStr}${enumStr}${defaultStr}`);

        // Handle nested properties
        if (paramDef.properties) {
          renderNestedProperties(paramDef.properties, paramDef.required, lines, 4);
        }

        // Handle array items
        if (paramDef.items) {
          lines.push(`    Items: ${paramDef.items.type || 'any'}${paramDef.items.description ? ' - ' + paramDef.items.description : ''}`);
        }
      }
    } else {
      lines.push('Parameters: none');
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}

/**
 * Render nested properties recursively.
 */
function renderNestedProperties(
  properties: Record<string, JSONSchemaProperty>,
  required: string[] | undefined,
  lines: string[],
  indent: number,
): void {
  const prefix = ' '.repeat(indent);
  const reqSet = new Set(required || []);

  for (const [name, prop] of Object.entries(properties)) {
    const isReq = reqSet.has(name);
    const reqStr = isReq ? 'required' : 'optional';
    const enumStr = prop.enum && prop.enum.length > 0
      ? `. Allowed: ${prop.enum.join(', ')}`
      : '';

    lines.push(`${prefix}- ${name} (${prop.type}, ${reqStr}): ${prop.description || ''}${enumStr}`);

    if (prop.properties) {
      renderNestedProperties(prop.properties, prop.required, lines, indent + 2);
    }
  }
}

// ============================================================
// From ToolSchema (simplified format)
// ============================================================

/**
 * Render simplified ToolSchema objects as natural text.
 * Used when working with the benchmark's internal ToolSchema format
 * rather than full OpenAI ToolDefinition objects.
 *
 * @param schemas - Array of simplified tool schemas
 * @returns Formatted text string
 */
export function renderToolSchemasAsText(schemas: ToolSchema[]): string {
  const sections: string[] = [];

  for (const tool of schemas) {
    const lines: string[] = [];

    lines.push(`Tool: ${tool.name}`);
    lines.push(`Description: ${tool.description}`);

    if (tool.parameters.length > 0) {
      lines.push('Parameters:');

      for (const param of tool.parameters) {
        const reqStr = param.required ? 'required' : 'optional';
        const enumStr = param.enum && param.enum.length > 0
          ? `. Allowed: ${param.enum.join(', ')}`
          : '';

        lines.push(`  - ${param.name} (${param.type}, ${reqStr}): ${param.description}${enumStr}`);
      }
    } else {
      lines.push('Parameters: none');
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}

// ============================================================
// Conversion: ToolSchema -> ToolDefinition
// ============================================================

/**
 * Convert a simplified ToolSchema to the full OpenAI ToolDefinition format.
 * Useful for generating the JSON baseline from internal representations.
 *
 * @param schema - Simplified tool schema
 * @returns OpenAI ToolDefinition object
 */
export function toolSchemaToDefinition(schema: ToolSchema): ToolDefinition {
  const properties: Record<string, JSONSchemaProperty> = {};
  const required: string[] = [];

  for (const param of schema.parameters) {
    const prop: JSONSchemaProperty = {
      type: param.type,
      description: param.description,
    };

    if (param.enum && param.enum.length > 0) {
      prop.enum = param.enum;
    }

    if (param.default !== undefined) {
      prop.default = param.default;
    }

    properties[param.name] = prop;

    if (param.required) {
      required.push(param.name);
    }
  }

  return {
    type: 'function',
    function: {
      name: schema.name,
      description: schema.description,
      parameters: {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      },
    },
  };
}
