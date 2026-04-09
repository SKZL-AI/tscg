/**
 * TAB Anthropic Provider
 *
 * Claude model provider using the Anthropic Messages API.
 * Handles tool_use content blocks for structured tool calling.
 *
 * Rate limits: 50 rpm, 100K tpm (configurable per tier).
 *
 * API Reference: https://docs.anthropic.com/en/api/messages
 */

import type {
  ModelProvider,
  CompletionRequest,
  CompletionResponse,
  ProviderRateLimits,
} from './provider.js';

export const ANTHROPIC_RATE_LIMITS: ProviderRateLimits = {
  requestsPerMinute: 50,
  tokensPerMinute: 100_000,
};

// ============================================================
// Anthropic API Types (subset used by this provider)
// ============================================================

/** Anthropic tool definition format */
interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** Content block types in Anthropic responses */
interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

/** Anthropic Messages API response */
interface AnthropicMessagesResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/** Anthropic API error response */
interface AnthropicErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

// ============================================================
// Provider Implementation
// ============================================================

export class AnthropicProvider implements ModelProvider {
  readonly name = 'anthropic';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: { apiKey: string; model: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
  }

  /**
   * Execute a completion request against the Anthropic Messages API.
   *
   * 1. POSTs to /v1/messages with x-api-key header
   * 2. Maps tools array to Anthropic tool format (name, description, input_schema)
   * 3. Parses content blocks (text, tool_use) from response
   * 4. Extracts usage.input_tokens and usage.output_tokens
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const t0 = Date.now();

    // Build request body
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      system: request.system,
      messages: request.messages,
    };

    // Map tools to Anthropic format if provided
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(tool => formatAnthropicTool(tool));
    }

    // Execute API call
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const latency = Date.now() - t0;

    // Handle HTTP errors
    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage: string;
      try {
        const parsed = JSON.parse(errorBody) as AnthropicErrorResponse;
        errorMessage = parsed.error?.message ?? errorBody;
      } catch {
        errorMessage = errorBody;
      }
      throw new Error(
        `Anthropic API error (${response.status}): ${errorMessage}`
      );
    }

    const data = (await response.json()) as AnthropicMessagesResponse;

    // Extract text content from response blocks
    const textBlocks = data.content
      .filter((block): block is AnthropicTextBlock => block.type === 'text')
      .map(block => block.text);
    const contentText = textBlocks.join('\n');

    // Extract tool_use blocks and map to our format
    const toolUseBlocks = data.content.filter(
      (block): block is AnthropicToolUseBlock => block.type === 'tool_use'
    );

    const toolCalls =
      toolUseBlocks.length > 0
        ? toolUseBlocks.map(block => ({
            name: block.name,
            arguments: block.input,
          }))
        : undefined;

    return {
      content: contentText,
      tool_calls: toolCalls,
      usage: {
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
      },
      latency_ms: latency,
    };
  }

  /**
   * Estimate token count for text.
   * Uses a rough heuristic: ~4 chars per token for English text.
   * For precise counting, Anthropic provides a token counting API, but
   * the heuristic is sufficient for benchmark cost estimation.
   */
  async countTokens(text: string): Promise<number> {
    return this.estimateTokensSync(text);
  }

  private estimateTokensSync(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

// ============================================================
// Tool Format Mapping
// ============================================================

/**
 * Convert a tool definition (OpenAI format) to Anthropic tool format.
 *
 * OpenAI format:
 * { type: "function", function: { name, description, parameters: { type, properties, required } } }
 *
 * Anthropic format:
 * { name, description, input_schema: { type, properties, required } }
 */
function formatAnthropicTool(tool: unknown): AnthropicTool {
  // Handle OpenAI function-calling format (most common)
  const t = tool as Record<string, unknown>;
  if (t.type === 'function' && t.function) {
    const fn = t.function as Record<string, unknown>;
    return {
      name: fn.name as string,
      description: (fn.description as string) ?? '',
      input_schema: (fn.parameters as AnthropicTool['input_schema']) ?? {
        type: 'object' as const,
        properties: {},
      },
    };
  }

  // Handle raw tool objects that already have name/description/parameters
  if (typeof t.name === 'string') {
    return {
      name: t.name,
      description: (t.description as string) ?? '',
      input_schema: (t.parameters as AnthropicTool['input_schema']) ??
        (t.input_schema as AnthropicTool['input_schema']) ?? {
          type: 'object' as const,
          properties: {},
        },
    };
  }

  // Fallback: pass through (will likely cause an API error, which is fine)
  return tool as AnthropicTool;
}
