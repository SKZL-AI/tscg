/**
 * TAB Model Provider Interface
 *
 * Defines the abstraction layer for LLM provider implementations.
 * Each provider handles a specific API format (Anthropic, OpenAI, Ollama, Together).
 * Providers are stateless -- rate limiting and retries are handled by the runner.
 */

// === Completion Request ===

export interface CompletionRequest {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools?: unknown[];
  temperature: number;
  max_tokens: number;
}

// === Completion Response ===

export interface CompletionResponse {
  content: string;
  tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  usage: { input_tokens: number; output_tokens: number };
  latency_ms: number;
}

// === Provider Interface ===

export interface ModelProvider {
  /** Execute a completion request and return the response */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /** Estimate token count for a text string */
  countTokens(text: string): Promise<number>;

  /** Provider display name */
  readonly name: string;
}

// === Rate Limit Configuration ===

export interface ProviderRateLimits {
  requestsPerMinute: number;
  tokensPerMinute: number;
}

// === Provider Factory ===

export type ProviderName = 'anthropic' | 'openai' | 'ollama' | 'together';

export interface ProviderConfig {
  provider: ProviderName;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}
