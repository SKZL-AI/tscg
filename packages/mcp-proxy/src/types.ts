/**
 * @tscg/mcp-proxy — Type Definitions
 */

import type { ModelTarget } from '@tscg/core';

/** Compression mode */
export type CompressionMode = 'description-only' | 'full-text';

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
