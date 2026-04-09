/**
 * @tscg/tool-optimizer — High-Level Tool Schema Optimizer
 *
 * Provides framework-specific integrations for TSCG compression:
 * - withTSCG()         — Generic wrapper for any tool array
 * - createTSCGMCPProxy — MCP server proxy with transparent compression
 * - tscgMiddleware     — Vercel AI SDK middleware
 *
 * @packageDocumentation
 */

export { withTSCG } from './langchain.js';
export { createTSCGMCPProxy } from './mcp.js';
export { tscgMiddleware } from './vercel.js';

// Re-export core types for convenience
export type {
  CompilerOptions,
  CompressedResult,
  ModelTarget,
  AnyToolDefinition,
} from '@tscg/core';
