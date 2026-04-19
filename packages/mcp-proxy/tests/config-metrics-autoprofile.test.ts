/**
 * @tscg/mcp-proxy — Config, Metrics & Auto-Profile Tests
 *
 * Tests for:
 * - parseConfig(): ENV parsing, defaults, validation
 * - MetricsCollector: per-server tracking, aggregation
 * - resolveProfile(): auto-profile logic, CFL/CFO threshold
 */

import { describe, it, expect } from 'vitest';
import { parseConfig } from '../src/config.js';
import { MetricsCollector } from '../src/metrics.js';
import { resolveProfile } from '../src/auto-profile.js';
import type { ProxyConfig } from '../src/types.js';

// ============================================================
// parseConfig
// ============================================================

describe('parseConfig', () => {
  it('should return defaults when no ENV vars set', () => {
    const config = parseConfig({});
    expect(config.downstreams).toEqual([]);
    expect(config.mode).toBe('description-only');
    expect(config.profile).toBe('auto');
    expect(config.model).toBe('auto');
    expect(config.autoDisableThreshold).toBe(30);
    expect(config.logLevel).toBe('info');
    expect(config.metrics).toBe(true);
  });

  it('should parse TSCG_DOWNSTREAM_SERVERS JSON', () => {
    const servers = JSON.stringify([
      { id: 'github', command: 'npx', args: ['-y', '@mcp/github'] },
      { id: 'fs', command: 'npx', args: ['-y', '@mcp/fs', '/tmp'] },
    ]);
    const config = parseConfig({ TSCG_DOWNSTREAM_SERVERS: servers });
    expect(config.downstreams).toHaveLength(2);
    expect(config.downstreams[0].id).toBe('github');
    expect(config.downstreams[1].args).toEqual(['-y', '@mcp/fs', '/tmp']);
  });

  it('should default args to empty array if not provided', () => {
    const servers = JSON.stringify([{ id: 'test', command: 'node' }]);
    const config = parseConfig({ TSCG_DOWNSTREAM_SERVERS: servers });
    expect(config.downstreams[0].args).toEqual([]);
  });

  it('should throw on invalid JSON', () => {
    expect(() => parseConfig({ TSCG_DOWNSTREAM_SERVERS: '{bad json' })).toThrow('Invalid TSCG_DOWNSTREAM_SERVERS JSON');
  });

  it('should throw on missing id or command', () => {
    const noId = JSON.stringify([{ command: 'node' }]);
    expect(() => parseConfig({ TSCG_DOWNSTREAM_SERVERS: noId })).toThrow("must have 'id' and 'command'");

    const noCmd = JSON.stringify([{ id: 'test' }]);
    expect(() => parseConfig({ TSCG_DOWNSTREAM_SERVERS: noCmd })).toThrow("must have 'id' and 'command'");
  });

  it('should parse TSCG_MODE', () => {
    expect(parseConfig({ TSCG_MODE: 'full-text' }).mode).toBe('full-text');
    expect(parseConfig({ TSCG_MODE: 'description-only' }).mode).toBe('description-only');
  });

  it('should throw on invalid mode', () => {
    expect(() => parseConfig({ TSCG_MODE: 'invalid' })).toThrow('Invalid TSCG_MODE');
  });

  it('should parse TSCG_PROFILE', () => {
    expect(parseConfig({ TSCG_PROFILE: 'conservative' }).profile).toBe('conservative');
    expect(parseConfig({ TSCG_PROFILE: 'balanced' }).profile).toBe('balanced');
    expect(parseConfig({ TSCG_PROFILE: 'aggressive' }).profile).toBe('aggressive');
  });

  it('should throw on invalid profile', () => {
    expect(() => parseConfig({ TSCG_PROFILE: 'superfast' })).toThrow('Invalid TSCG_PROFILE');
  });

  it('should parse TSCG_AUTO_DISABLE_THRESHOLD', () => {
    const config = parseConfig({ TSCG_AUTO_DISABLE_THRESHOLD: '50' });
    expect(config.autoDisableThreshold).toBe(50);
  });

  it('should parse TSCG_LOG_LEVEL', () => {
    expect(parseConfig({ TSCG_LOG_LEVEL: 'silent' }).logLevel).toBe('silent');
    expect(parseConfig({ TSCG_LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
  });
});

// ============================================================
// MetricsCollector
// ============================================================

describe('MetricsCollector', () => {
  it('should start with zero aggregated metrics', () => {
    const mc = new MetricsCollector('description-only');
    const agg = mc.getAggregated();
    expect(agg.totalTools).toBe(0);
    expect(agg.totalOriginalTokens).toBe(0);
    expect(agg.totalCompressedTokens).toBe(0);
    expect(agg.totalSavingsPercent).toBe(0);
    expect(agg.totalCallsRouted).toBe(0);
    expect(agg.perServer).toEqual([]);
    expect(agg.mode).toBe('description-only');
  });

  it('should record compression per server', () => {
    const mc = new MetricsCollector('description-only');
    mc.recordCompression('github', 5, 1000, 700, 2.5, 'conservative', ['SDM', 'DRO']);

    const agg = mc.getAggregated();
    expect(agg.totalTools).toBe(5);
    expect(agg.totalOriginalTokens).toBe(1000);
    expect(agg.totalCompressedTokens).toBe(700);
    expect(agg.totalSavingsPercent).toBe(30);
    expect(agg.perServer).toHaveLength(1);
    expect(agg.perServer[0].profile).toBe('conservative');
    expect(agg.perServer[0].appliedPrinciples).toEqual(['SDM', 'DRO']);
  });

  it('should aggregate multiple servers', () => {
    const mc = new MetricsCollector('description-only');
    mc.recordCompression('github', 5, 1000, 700, 2, 'conservative', ['SDM']);
    mc.recordCompression('fs', 3, 500, 300, 1, 'balanced', ['SDM', 'DRO']);

    const agg = mc.getAggregated();
    expect(agg.totalTools).toBe(8);
    expect(agg.totalOriginalTokens).toBe(1500);
    expect(agg.totalCompressedTokens).toBe(1000);
    // (1500-1000)/1500 = 33.3%
    expect(agg.totalSavingsPercent).toBe(33.3);
  });

  it('should record call counts', () => {
    const mc = new MetricsCollector('description-only');
    mc.recordCompression('github', 5, 1000, 700, 2, 'conservative', ['SDM']);
    mc.recordCall('github');
    mc.recordCall('github');
    mc.recordCall('github');

    const agg = mc.getAggregated();
    expect(agg.totalCallsRouted).toBe(3);
    expect(agg.perServer[0].callCount).toBe(3);
  });

  it('should preserve call count across compression updates', () => {
    const mc = new MetricsCollector('description-only');
    mc.recordCompression('github', 5, 1000, 700, 2, 'conservative', ['SDM']);
    mc.recordCall('github');
    mc.recordCall('github');
    // Re-record compression (e.g., tools refreshed)
    mc.recordCompression('github', 6, 1200, 800, 3, 'conservative', ['SDM', 'DRO']);

    const agg = mc.getAggregated();
    // Call count should persist from existing entry
    expect(agg.perServer[0].callCount).toBe(2);
    expect(agg.perServer[0].toolCount).toBe(6);
  });

  it('should ignore calls for unknown servers', () => {
    const mc = new MetricsCollector('description-only');
    mc.recordCall('unknown'); // Should not throw
    expect(mc.getAggregated().totalCallsRouted).toBe(0);
  });

  it('should track uptime', () => {
    const mc = new MetricsCollector('description-only');
    const agg = mc.getAggregated();
    expect(agg.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should handle zero original tokens gracefully', () => {
    const mc = new MetricsCollector('description-only');
    mc.recordCompression('empty', 0, 0, 0, 0, 'conservative', []);
    const agg = mc.getAggregated();
    expect(agg.totalSavingsPercent).toBe(0);
    expect(agg.perServer[0].savingsPercent).toBe(0);
  });
});

// ============================================================
// resolveProfile
// ============================================================

describe('resolveProfile', () => {
  function mkProxyConfig(overrides: Partial<ProxyConfig> = {}): ProxyConfig {
    return {
      downstreams: [],
      mode: 'description-only',
      profile: 'auto',
      model: 'auto',
      autoDisableThreshold: 30,
      metrics: true,
      logLevel: 'silent',
      ...overrides,
    };
  }

  it('should auto-select balanced for <=10 tools', () => {
    const options = resolveProfile(mkProxyConfig(), 5);
    expect(options.profile).toBe('balanced');
  });

  it('should auto-select conservative for >10 tools', () => {
    const options = resolveProfile(mkProxyConfig(), 15);
    expect(options.profile).toBe('conservative');
  });

  it('should respect explicit profile (no auto-override)', () => {
    const options = resolveProfile(mkProxyConfig({ profile: 'aggressive' }), 50);
    expect(options.profile).toBe('aggressive');
  });

  it('should disable CFL/CFO for tools above threshold', () => {
    const options = resolveProfile(mkProxyConfig({ autoDisableThreshold: 30 }), 35);
    expect(options.principles?.cfl).toBe(false);
    expect(options.principles?.cfo).toBe(false);
  });

  it('should NOT disable CFL/CFO for tools at or below threshold', () => {
    const options = resolveProfile(mkProxyConfig({ autoDisableThreshold: 30 }), 30);
    expect(options.principles?.cfl).toBeUndefined();
    expect(options.principles?.cfo).toBeUndefined();
  });

  it('should pass model through to options', () => {
    const options = resolveProfile(mkProxyConfig({ model: 'claude-3-5-sonnet' }), 10);
    expect(options.model).toBe('claude-3-5-sonnet');
  });

  it('should handle custom threshold', () => {
    const options = resolveProfile(mkProxyConfig({ autoDisableThreshold: 10 }), 15);
    expect(options.principles?.cfl).toBe(false);
    expect(options.principles?.cfo).toBe(false);
  });
});
