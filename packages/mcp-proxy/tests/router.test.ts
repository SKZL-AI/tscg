/**
 * @tscg/mcp-proxy — Router Tests
 *
 * Tests that ToolRouter correctly maps tool names to server IDs,
 * handles multi-server registration, clearServer, and getToolCounts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRouter } from '../src/router.js';
import type { MCPToolDefinition } from '../src/compressor.js';

// ============================================================
// Helpers
// ============================================================

function mkTool(name: string, desc = ''): MCPToolDefinition {
  return {
    name,
    description: desc,
    inputSchema: { type: 'object', properties: {} },
  };
}

// ============================================================
// Tests
// ============================================================

describe('ToolRouter', () => {
  let router: ToolRouter;

  beforeEach(() => {
    router = new ToolRouter();
  });

  // --- registerTools / getServer ---

  it('should register tools and resolve server', () => {
    router.registerTools('github', [mkTool('create_issue'), mkTool('list_repos')]);
    expect(router.getServer('create_issue')).toBe('github');
    expect(router.getServer('list_repos')).toBe('github');
  });

  it('should return undefined for unknown tools', () => {
    expect(router.getServer('nonexistent')).toBeUndefined();
  });

  it('should handle multiple servers', () => {
    router.registerTools('github', [mkTool('create_issue')]);
    router.registerTools('filesystem', [mkTool('read_file'), mkTool('write_file')]);

    expect(router.getServer('create_issue')).toBe('github');
    expect(router.getServer('read_file')).toBe('filesystem');
    expect(router.getServer('write_file')).toBe('filesystem');
  });

  it('should overwrite server mapping on duplicate tool names', () => {
    router.registerTools('server-a', [mkTool('do_thing')]);
    router.registerTools('server-b', [mkTool('do_thing')]);
    expect(router.getServer('do_thing')).toBe('server-b');
  });

  // --- clearServer ---

  it('should clear all tools for a server', () => {
    router.registerTools('github', [mkTool('create_issue'), mkTool('list_repos')]);
    router.registerTools('fs', [mkTool('read_file')]);

    router.clearServer('github');
    expect(router.getServer('create_issue')).toBeUndefined();
    expect(router.getServer('list_repos')).toBeUndefined();
    expect(router.getServer('read_file')).toBe('fs');
  });

  it('should be idempotent for clearing nonexistent server', () => {
    router.registerTools('fs', [mkTool('read_file')]);
    router.clearServer('nonexistent');
    expect(router.getServer('read_file')).toBe('fs');
  });

  // --- getAllToolNames ---

  it('should return all registered tool names', () => {
    router.registerTools('github', [mkTool('create_issue')]);
    router.registerTools('fs', [mkTool('read_file'), mkTool('write_file')]);

    const names = router.getAllToolNames().sort();
    expect(names).toEqual(['create_issue', 'read_file', 'write_file']);
  });

  it('should return empty array when no tools registered', () => {
    expect(router.getAllToolNames()).toEqual([]);
  });

  // --- getToolCounts ---

  it('should return tool count per server', () => {
    router.registerTools('github', [mkTool('create_issue'), mkTool('list_repos')]);
    router.registerTools('fs', [mkTool('read_file')]);

    const counts = router.getToolCounts();
    expect(counts.get('github')).toBe(2);
    expect(counts.get('fs')).toBe(1);
  });

  it('should return empty map when no tools registered', () => {
    const counts = router.getToolCounts();
    expect(counts.size).toBe(0);
  });
});
