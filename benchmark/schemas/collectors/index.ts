/**
 * TAB Schema Collectors — Unified Entry Point
 *
 * Aggregates tool schemas from all 4 sources into a unified collection:
 *   - Claude Code (16 tools)     -> Scenario A
 *   - MCP Servers (43 tools)     -> Scenario B
 *   - Synthetic (3-100 tools)    -> Scenario C
 *   - BFCL (15 tools)            -> Scenario D
 *
 * Also provides access to Phase 3 baseline data for regression testing.
 */

import type { SchemaCollection } from '../types.js';
import type { BaselineData } from '../types.js';

import { collectClaudeCodeTools, getClaudeCodeToolDefinitions } from './claude-code.js';
import { collectMCPTools, getMCPServerTools, getMCPToolsByServer } from './mcp-servers.js';
import { generateSyntheticCatalog, generateAllSyntheticCatalogs, CATALOG_SIZES } from './synthetic.js';
import { collectBFCLSchemas, getBFCLToolsByCategory, getAllBFCLTools } from './bfcl.js';
import { importBaselineData, getBaselineSummary } from './baseline-import.js';

// ============================================================
// Re-exports for convenient access
// ============================================================

export { collectClaudeCodeTools, getClaudeCodeToolDefinitions } from './claude-code.js';
export { collectMCPTools, getMCPServerTools, getMCPToolsByServer } from './mcp-servers.js';
export { generateSyntheticCatalog, generateAllSyntheticCatalogs, CATALOG_SIZES } from './synthetic.js';
export { collectBFCLSchemas, getBFCLToolsByCategory, getAllBFCLTools } from './bfcl.js';
export { importBaselineData, getBaselineSummary } from './baseline-import.js';

// ============================================================
// Unified Collection
// ============================================================

/**
 * Collect all schema collections from all 4 sources.
 *
 * Returns an array of SchemaCollections covering:
 * - 1 Claude Code collection (16 tools)
 * - 5 MCP collections (4 individual servers + 1 combined = 43 total tools)
 * - 9 Synthetic catalogs (sizes: 3, 5, 10, 15, 20, 30, 50, 75, 100)
 * - 1 BFCL collection (15 tools)
 *
 * Total: 16 SchemaCollections
 *
 * @param syntheticSeed  PRNG seed for synthetic generation (default: 42)
 */
export async function collectAllSchemas(
  syntheticSeed: number = 42,
): Promise<SchemaCollection[]> {
  const collections: SchemaCollection[] = [];

  // Scenario A: Claude Code
  collections.push(collectClaudeCodeTools());

  // Scenario B: MCP Servers (4 individual + 1 combined)
  collections.push(...collectMCPTools());

  // Scenario C: Synthetic catalogs at all standard sizes
  collections.push(...generateAllSyntheticCatalogs(syntheticSeed));

  // Scenario D: BFCL
  collections.push(collectBFCLSchemas());

  return collections;
}

/**
 * Get a summary report of all collected schemas.
 */
export async function getCollectionSummary(): Promise<string> {
  const collections = await collectAllSchemas();

  const lines: string[] = [
    '=== TAB Schema Collection Summary ===',
    '',
    `Total collections: ${collections.length}`,
    `Total tools: ${collections.reduce((sum, c) => sum + c.tools.length, 0)}`,
    '',
    'By Scenario:',
  ];

  const byScenario = new Map<string, SchemaCollection[]>();
  for (const c of collections) {
    const key = c.scenario;
    if (!byScenario.has(key)) byScenario.set(key, []);
    byScenario.get(key)!.push(c);
  }

  for (const [scenario, colls] of byScenario) {
    const toolCount = colls.reduce((sum, c) => sum + c.tools.length, 0);
    lines.push(
      `  Scenario ${scenario}: ${colls.length} collections, ${toolCount} tools`,
    );
    for (const c of colls) {
      lines.push(`    - ${c.id}: ${c.tools.length} tools (${c.name})`);
    }
  }

  return lines.join('\n');
}

/**
 * Collect all schemas plus baseline data in one call.
 * Convenience function for benchmark initialization.
 */
export async function initializeBenchmarkData(
  syntheticSeed: number = 42,
): Promise<{
  collections: SchemaCollection[];
  baseline: BaselineData;
}> {
  const [collections, baseline] = await Promise.all([
    collectAllSchemas(syntheticSeed),
    Promise.resolve(importBaselineData()),
  ]);

  return { collections, baseline };
}
