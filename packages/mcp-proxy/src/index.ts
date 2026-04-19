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
export { compressMCPTools } from './compressor.js';
export type { MCPToolDefinition, CompressionResult } from './compressor.js';

// === Router ===
export { ToolRouter } from './router.js';

// === Metrics ===
export { MetricsCollector } from './metrics.js';

// === Auto-Profile ===
export { resolveProfile } from './auto-profile.js';

// === Types ===
export type {
  ProxyConfig,
  DownstreamConfig,
  CompressionMode,
  TSCGProfile,
  ServerMetrics,
  AggregatedMetrics,
} from './types.js';
