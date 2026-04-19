/**
 * @tscg/mcp-proxy — Metrics Collection
 *
 * Tracks per-server compression metrics and call counts.
 */

import type { ServerMetrics, AggregatedMetrics, CompressionMode } from './types.js';

export class MetricsCollector {
  private readonly servers = new Map<string, ServerMetrics>();
  private readonly startTime: number;
  private mode: CompressionMode;

  constructor(mode: CompressionMode) {
    this.startTime = Date.now();
    this.mode = mode;
  }

  /**
   * Record compression results for a server.
   */
  recordCompression(
    serverId: string,
    toolCount: number,
    originalTokens: number,
    compressedTokens: number,
    compressionTimeMs: number,
    profile: string,
    appliedPrinciples: string[],
  ): void {
    const existing = this.servers.get(serverId);
    const savingsPercent = originalTokens > 0
      ? Math.round(((originalTokens - compressedTokens) / originalTokens) * 1000) / 10
      : 0;

    this.servers.set(serverId, {
      serverId,
      toolCount,
      originalTokens,
      compressedTokens,
      savingsPercent,
      compressionTimeMs,
      callCount: existing?.callCount ?? 0,
      lastCompressedAt: Date.now(),
      profile,
      appliedPrinciples,
    });
  }

  /**
   * Increment call count for a server (on tools/call routing).
   */
  recordCall(serverId: string): void {
    const existing = this.servers.get(serverId);
    if (existing) {
      existing.callCount++;
    }
  }

  /**
   * Get aggregated metrics across all servers.
   */
  getAggregated(): AggregatedMetrics {
    const perServer = Array.from(this.servers.values());
    const totalTools = perServer.reduce((sum, s) => sum + s.toolCount, 0);
    const totalOriginalTokens = perServer.reduce((sum, s) => sum + s.originalTokens, 0);
    const totalCompressedTokens = perServer.reduce((sum, s) => sum + s.compressedTokens, 0);
    const totalCallsRouted = perServer.reduce((sum, s) => sum + s.callCount, 0);
    const totalSavingsPercent = totalOriginalTokens > 0
      ? Math.round(((totalOriginalTokens - totalCompressedTokens) / totalOriginalTokens) * 1000) / 10
      : 0;

    return {
      totalTools,
      totalOriginalTokens,
      totalCompressedTokens,
      totalSavingsPercent,
      totalCallsRouted,
      perServer,
      uptime: Date.now() - this.startTime,
      mode: this.mode,
    };
  }
}
