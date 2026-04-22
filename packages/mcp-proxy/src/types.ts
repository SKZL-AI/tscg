/**
 * @tscg/mcp-proxy — Type Definitions
 */

import type { ModelTarget } from '@tscg/core';

/**
 * Compression mode.
 * - 'full': Full @tscg/core compress() pipeline (recommended with target)
 * - 'description-only': Legacy v1.0.x behavior -- only compress descriptions
 * - 'off': Pass-through, no compression (for A/B debugging)
 * - 'full-text': @deprecated -- use 'full'. Kept for backward compatibility with v1.0.x.
 */
export type CompressionMode = 'full' | 'description-only' | 'off' | 'full-text';

/** TSCG profile with auto-selection */
export type TSCGProfile = 'conservative' | 'balanced' | 'aggressive' | 'auto';

/** Configuration for a single downstream MCP server */
export interface DownstreamConfig {
  /** Unique identifier for this server */
  id: string;
  /** Command to launch the MCP server */
  command: string;
  /** Arguments for the server command */
  args: string[];
  /** Optional environment variables */
  env?: Record<string, string>;
}

/** Full proxy configuration */
export interface ProxyConfig {
  /** Downstream servers to wrap */
  downstreams: DownstreamConfig[];
  /** Compression mode (default: description-only) */
  mode: CompressionMode;
  /** TSCG profile */
  profile: TSCGProfile;
  /** Model target for tokenizer alignment */
  model: ModelTarget;
  /** Tool count threshold to auto-disable CFL/CFO (default: 30) */
  autoDisableThreshold: number;
  /** Enable metrics collection */
  metrics: boolean;
  /** Log level */
  logLevel: 'silent' | 'info' | 'debug';

  /**
   * Target model identifier for per-model optimization.
   * When set to a known value (claude-opus-4-7, claude-sonnet-4, gpt-5.2),
   * automatically enables mode='full' with optimized per-model profile.
   *
   * Default: undefined (legacy description-only behavior)
   */
  target?: string;
}

/** Per-server metrics snapshot */
export interface ServerMetrics {
  serverId: string;
  toolCount: number;
  originalTokens: number;
  compressedTokens: number;
  savingsPercent: number;
  compressionTimeMs: number;
  callCount: number;
  lastCompressedAt: number;
  profile: string;
  appliedPrinciples: string[];
}

/** Aggregated metrics across all downstreams */
export interface AggregatedMetrics {
  totalTools: number;
  totalOriginalTokens: number;
  totalCompressedTokens: number;
  totalSavingsPercent: number;
  totalCallsRouted: number;
  perServer: ServerMetrics[];
  uptime: number;
  mode: CompressionMode;
}
