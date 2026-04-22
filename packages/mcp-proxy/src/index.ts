/**
 * @tscg/mcp-proxy — Public API
 *
 * Transparent TSCG compression proxy for MCP tool servers.
 * Sits between Claude Code and downstream MCP servers,
 * compressing tool descriptions to save tokens.
 *
 * @packageDocumentation
 */

// === Server ===
export { TSCGMCPProxyServer } from './server.js';

// === Configuration ===
export { parseConfig } from './config.js';

// === Compressor ===
export { compressMCPTools, compressMCPToolsFull } from './compressor.js';
export type { MCPToolDefinition, CompressionResult, FullCompressionResult } from './compressor.js';

// === Router ===
export { ToolRouter } from './router.js';

// === Metrics ===
export { MetricsCollector } from './metrics.js';

// === Auto-Profile ===
export { resolveProfile } from './auto-profile.js';

// === Model Profiles (v1.4.1) ===
export { resolveModelProfile, MODEL_PROFILES } from './model-profiles.js';
export type { ModelProfile } from './model-profiles.js';

// === Mode Resolver (v1.4.1) ===
export { resolveEffectiveMode } from './mode-resolver.js';
export type { EffectiveMode } from './mode-resolver.js';

// === Types ===
export type {
  ProxyConfig,
  DownstreamConfig,
  CompressionMode,
  TSCGProfile,
  ServerMetrics,
  AggregatedMetrics,
} from './types.js';
