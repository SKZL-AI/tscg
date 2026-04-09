/**
 * TAB Provider Registry
 *
 * Factory function for creating ModelProvider instances from configuration.
 */

export type { ModelProvider, CompletionRequest, CompletionResponse, ProviderRateLimits, ProviderName, ProviderConfig } from './provider.js';
export { AnthropicProvider, ANTHROPIC_RATE_LIMITS } from './anthropic.js';
export { OpenAIProvider, OPENAI_RATE_LIMITS } from './openai.js';
export { OllamaProvider, OLLAMA_RATE_LIMITS, OLLAMA_SUPPORTED_MODELS } from './ollama.js';

import type { ModelProvider, ProviderName } from './provider.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';

/**
 * Create a ModelProvider from provider name and configuration.
 *
 * @throws Error if provider name is unknown or required config is missing
 */
export function createProvider(config: {
  provider: ProviderName;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}): ModelProvider {
  switch (config.provider) {
    case 'anthropic':
      if (!config.apiKey) throw new Error('Anthropic provider requires apiKey');
      return new AnthropicProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      });

    case 'openai':
      if (!config.apiKey) throw new Error('OpenAI provider requires apiKey');
      return new OpenAIProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      });

    case 'ollama':
      return new OllamaProvider({
        model: config.model,
        baseUrl: config.baseUrl,
      });

    case 'together':
      // Together uses OpenAI-compatible API
      if (!config.apiKey) throw new Error('Together provider requires apiKey');
      return new OpenAIProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl ?? 'https://api.together.xyz/v1',
      });

    default: {
      const _exhaustive: never = config.provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}
