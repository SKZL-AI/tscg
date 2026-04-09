/**
 * TAB Schema Collector — MCP Server Tools
 *
 * Defines tool schemas for 4 representative MCP (Model Context Protocol) servers:
 *   1. GitHub      — 20 tools for repository management and code operations
 *   2. Filesystem  — 5 tools for local file operations
 *   3. PostgreSQL  — 10 tools for database operations
 *   4. Playwright  — 8 tools for browser automation
 *
 * These tools serve as Scenario B in the TAB benchmark, representing
 * real-world MCP server integrations with varying catalog sizes.
 *
 * All schemas are self-contained (no external API calls required).
 */

import type { ToolDefinition } from '../../../packages/core/src/types.js';
import type { SchemaCollection } from '../types.js';

// ============================================================
// Helper: build a ToolDefinition quickly
// ============================================================

function tool(
  name: string,
  description: string,
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
    items?: { type: string };
    default?: unknown;
  }>,
  required: string[],
): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  };
}

// ============================================================
// 1. GitHub MCP Server (20 tools)
// ============================================================

const GITHUB_TOOLS: ToolDefinition[] = [
  tool('github_create_issue', 'Create a new issue in a GitHub repository with title, body, labels, and assignees.', {
    owner: { type: 'string', description: 'Repository owner (user or organization)' },
    repo: { type: 'string', description: 'Repository name' },
    title: { type: 'string', description: 'Issue title' },
    body: { type: 'string', description: 'Issue body content in Markdown format' },
    labels: { type: 'array', description: 'Labels to assign to the issue', items: { type: 'string' } },
    assignees: { type: 'array', description: 'GitHub usernames to assign', items: { type: 'string' } },
  }, ['owner', 'repo', 'title']),

  tool('github_list_issues', 'List issues in a GitHub repository with filtering by state, labels, and assignee.', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
    state: { type: 'string', description: 'Filter by issue state', enum: ['open', 'closed', 'all'] },
    labels: { type: 'string', description: 'Comma-separated list of label names to filter by' },
    assignee: { type: 'string', description: 'Filter by assignee username' },
    per_page: { type: 'number', description: 'Results per page (max 100)' },
  }, ['owner', 'repo']),

  tool('github_get_issue', 'Get detailed information about a specific issue including comments and timeline.', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
    issue_number: { type: 'number', description: 'The issue number' },
  }, ['owner', 'repo', 'issue_number']),

  tool('github_create_pr', 'Create a pull request from a head branch to a base branch in a repository.', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
    title: { type: 'string', description: 'Pull request title' },
    body: { type: 'string', description: 'Pull request description in Markdown' },
    head: { type: 'string', description: 'The branch containing changes (e.g. feature-branch)' },
    base: { type: 'string', description: 'The branch to merge into (e.g. main)' },
    draft: { type: 'boolean', description: 'Create as draft pull request' },
  }, ['owner', 'repo', 'title', 'head', 'base']),

  tool('github_list_prs', 'List pull requests in a repository with filtering by state and head/base branch.', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
    state: { type: 'string', description: 'Filter by PR state', enum: ['open', 'closed', 'all'] },
    head: { type: 'string', description: 'Filter by head branch (user:branch format)' },
    base: { type: 'string', description: 'Filter by base branch' },
    sort: { type: 'string', description: 'Sort criteria', enum: ['created', 'updated', 'popularity', 'long-running'] },
  }, ['owner', 'repo']),

  tool('github_merge_pr', 'Merge a pull request using the specified merge method.', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
    pull_number: { type: 'number', description: 'The pull request number' },
    merge_method: { type: 'string', description: 'Merge strategy to use', enum: ['merge', 'squash', 'rebase'] },
    commit_title: { type: 'string', description: 'Custom merge commit title' },
  }, ['owner', 'repo', 'pull_number']),

  tool('github_list_repos', 'List repositories for a user or organization with sorting and filtering options.', {
    owner: { type: 'string', description: 'User or organization name' },
    type: { type: 'string', description: 'Type of repositories to list', enum: ['all', 'owner', 'member'] },
    sort: { type: 'string', description: 'Sort field', enum: ['created', 'updated', 'pushed', 'full_name'] },
    per_page: { type: 'number', description: 'Results per page (max 100)' },
  }, ['owner']),

  tool('github_get_repo', 'Get detailed information about a repository including stats, topics, and settings.', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
  }, ['owner', 'repo']),

  tool('github_create_repo', 'Create a new repository for the authenticated user or an organization.', {
    name: { type: 'string', description: 'Repository name' },
    description: { type: 'string', description: 'Short description of the repository' },
    private: { type: 'boolean', description: 'Whether the repository should be private' },
    auto_init: { type: 'boolean', description: 'Initialize with a README' },
    org: { type: 'string', description: 'Organization name (for org repos)' },
  }, ['name']),

  tool('github_search_code', 'Search for code across GitHub repositories using query syntax.', {
    query: { type: 'string', description: 'Search query using GitHub code search syntax' },
    sort: { type: 'string', description: 'Sort field', enum: ['indexed'] },
    order: { type: 'string', description: 'Sort order', enum: ['asc', 'desc'] },
    per_page: { type: 'number', description: 'Results per page (max 100)' },
  }, ['query']),

  tool('github_search_repos', 'Search for repositories on GitHub with language and topic filters.', {
    query: { type: 'string', description: 'Search query using GitHub search syntax' },
    sort: { type: 'string', description: 'Sort criteria', enum: ['stars', 'forks', 'help-wanted-issues', 'updated'] },
    order: { type: 'string', description: 'Sort order', enum: ['asc', 'desc'] },
    per_page: { type: 'number', description: 'Results per page' },
  }, ['query']),

  tool('github_get_file', 'Get the contents of a file from a GitHub repository at a specific ref (branch/tag/commit).', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
    path: { type: 'string', description: 'Path to the file within the repository' },
    ref: { type: 'string', description: 'Branch, tag, or commit SHA (defaults to default branch)' },
  }, ['owner', 'repo', 'path']),

  tool('github_create_file', 'Create or update a file in a repository with a commit message.', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
    path: { type: 'string', description: 'File path within the repository' },
    content: { type: 'string', description: 'File content (will be base64-encoded)' },
    message: { type: 'string', description: 'Commit message for this file change' },
    branch: { type: 'string', description: 'Branch to commit to' },
    sha: { type: 'string', description: 'SHA of existing file (required for updates)' },
  }, ['owner', 'repo', 'path', 'content', 'message']),

  tool('github_list_branches', 'List branches in a GitHub repository with optional protection status.', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
    protected: { type: 'boolean', description: 'Filter to only protected branches' },
    per_page: { type: 'number', description: 'Results per page' },
  }, ['owner', 'repo']),

  tool('github_create_branch', 'Create a new branch from a specified source reference.', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
    branch: { type: 'string', description: 'New branch name' },
    from_ref: { type: 'string', description: 'Source branch, tag, or commit SHA' },
  }, ['owner', 'repo', 'branch', 'from_ref']),

  tool('github_add_comment', 'Add a comment to an issue or pull request.', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
    issue_number: { type: 'number', description: 'The issue or PR number' },
    body: { type: 'string', description: 'Comment body in Markdown format' },
  }, ['owner', 'repo', 'issue_number', 'body']),

  tool('github_list_commits', 'List commits on a repository branch with optional author and date filtering.', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
    sha: { type: 'string', description: 'Branch name or commit SHA to start from' },
    author: { type: 'string', description: 'Filter by commit author (GitHub username or email)' },
    since: { type: 'string', description: 'ISO 8601 timestamp to filter commits after' },
    per_page: { type: 'number', description: 'Results per page' },
  }, ['owner', 'repo']),

  tool('github_create_release', 'Create a new release with tag, name, and release notes.', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
    tag_name: { type: 'string', description: 'Git tag for this release (e.g. v1.0.0)' },
    name: { type: 'string', description: 'Release title' },
    body: { type: 'string', description: 'Release notes in Markdown' },
    draft: { type: 'boolean', description: 'Create as draft release' },
    prerelease: { type: 'boolean', description: 'Mark as pre-release' },
  }, ['owner', 'repo', 'tag_name']),

  tool('github_list_workflows', 'List GitHub Actions workflows defined in a repository.', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
    per_page: { type: 'number', description: 'Results per page' },
  }, ['owner', 'repo']),

  tool('github_dispatch_workflow', 'Trigger a GitHub Actions workflow dispatch event with optional inputs.', {
    owner: { type: 'string', description: 'Repository owner' },
    repo: { type: 'string', description: 'Repository name' },
    workflow_id: { type: 'string', description: 'Workflow file name or ID (e.g. ci.yml)' },
    ref: { type: 'string', description: 'Git reference to run the workflow on (branch or tag)' },
    inputs: { type: 'object', description: 'Key-value pairs of workflow input parameters' },
  }, ['owner', 'repo', 'workflow_id', 'ref']),
];

// ============================================================
// 2. Filesystem MCP Server (5 tools)
// ============================================================

const FILESYSTEM_TOOLS: ToolDefinition[] = [
  tool('fs_read_file', 'Read the complete contents of a file from the filesystem. Returns UTF-8 text content.', {
    path: { type: 'string', description: 'Absolute path to the file to read' },
  }, ['path']),

  tool('fs_write_file', 'Write content to a file, creating it if it does not exist or overwriting if it does.', {
    path: { type: 'string', description: 'Absolute path to the file to write' },
    content: { type: 'string', description: 'Text content to write to the file' },
  }, ['path', 'content']),

  tool('fs_list_directory', 'List all files and subdirectories in the specified directory path.', {
    path: { type: 'string', description: 'Absolute path to the directory to list' },
  }, ['path']),

  tool('fs_search_files', 'Recursively search for files matching a pattern within a directory tree.', {
    path: { type: 'string', description: 'Root directory to start the search from' },
    pattern: { type: 'string', description: 'Glob pattern to match file names (e.g. "*.ts")' },
    exclude: { type: 'array', description: 'Patterns to exclude from results', items: { type: 'string' } },
  }, ['path', 'pattern']),

  tool('fs_get_file_info', 'Get metadata about a file including size, modification time, and permissions.', {
    path: { type: 'string', description: 'Absolute path to the file or directory' },
  }, ['path']),
];

// ============================================================
// 3. PostgreSQL MCP Server (10 tools)
// ============================================================

const POSTGRESQL_TOOLS: ToolDefinition[] = [
  tool('pg_query', 'Execute a read-only SQL query against the connected PostgreSQL database and return results as JSON.', {
    sql: { type: 'string', description: 'The SQL SELECT query to execute' },
    params: { type: 'array', description: 'Parameterized values for $1, $2, etc. placeholders', items: { type: 'string' } },
    limit: { type: 'number', description: 'Maximum number of rows to return (default 100)' },
  }, ['sql']),

  tool('pg_insert', 'Insert one or more rows into a PostgreSQL table.', {
    table: { type: 'string', description: 'Table name (optionally schema-qualified)' },
    rows: { type: 'array', description: 'Array of objects representing rows to insert', items: { type: 'object' } },
    returning: { type: 'array', description: 'Columns to return from inserted rows', items: { type: 'string' } },
  }, ['table', 'rows']),

  tool('pg_update', 'Update rows in a PostgreSQL table matching a WHERE condition.', {
    table: { type: 'string', description: 'Table name (optionally schema-qualified)' },
    set: { type: 'object', description: 'Column-value pairs to update' },
    where: { type: 'string', description: 'SQL WHERE clause (without the WHERE keyword)' },
    params: { type: 'array', description: 'Parameterized values for the WHERE clause', items: { type: 'string' } },
  }, ['table', 'set', 'where']),

  tool('pg_delete', 'Delete rows from a PostgreSQL table matching a WHERE condition.', {
    table: { type: 'string', description: 'Table name (optionally schema-qualified)' },
    where: { type: 'string', description: 'SQL WHERE clause (without the WHERE keyword)' },
    params: { type: 'array', description: 'Parameterized values for the WHERE clause', items: { type: 'string' } },
  }, ['table', 'where']),

  tool('pg_list_tables', 'List all tables in the specified schema with row counts and column counts.', {
    schema: { type: 'string', description: 'PostgreSQL schema name (default: public)' },
  }, []),

  tool('pg_describe_table', 'Get the column definitions, types, constraints, and indexes for a specific table.', {
    table: { type: 'string', description: 'Table name (optionally schema-qualified)' },
    include_indexes: { type: 'boolean', description: 'Include index definitions in the output' },
  }, ['table']),

  tool('pg_execute', 'Execute a DDL or DML statement (CREATE, ALTER, DROP, etc.) against the database.', {
    sql: { type: 'string', description: 'The SQL statement to execute' },
    params: { type: 'array', description: 'Parameterized values for the statement', items: { type: 'string' } },
  }, ['sql']),

  tool('pg_list_schemas', 'List all schemas in the connected PostgreSQL database.', {}, []),

  tool('pg_explain', 'Run EXPLAIN ANALYZE on a query and return the execution plan.', {
    sql: { type: 'string', description: 'The SQL query to explain' },
    format: { type: 'string', description: 'Output format for the plan', enum: ['text', 'json', 'yaml'] },
  }, ['sql']),

  tool('pg_list_indexes', 'List all indexes on a table including type, columns, and uniqueness.', {
    table: { type: 'string', description: 'Table name (optionally schema-qualified)' },
  }, ['table']),
];

// ============================================================
// 4. Playwright MCP Server (8 tools)
// ============================================================

const PLAYWRIGHT_TOOLS: ToolDefinition[] = [
  tool('pw_navigate', 'Navigate the browser to a specified URL and wait for the page to load.', {
    url: { type: 'string', description: 'The URL to navigate to' },
    wait_until: { type: 'string', description: 'When to consider navigation complete', enum: ['load', 'domcontentloaded', 'networkidle'] },
    timeout: { type: 'number', description: 'Maximum time to wait in milliseconds' },
  }, ['url']),

  tool('pw_click', 'Click on a page element identified by a CSS selector or text content.', {
    selector: { type: 'string', description: 'CSS selector or text selector to find the element' },
    button: { type: 'string', description: 'Mouse button to use', enum: ['left', 'right', 'middle'] },
    click_count: { type: 'number', description: 'Number of clicks (1 for single, 2 for double)' },
  }, ['selector']),

  tool('pw_type', 'Type text into a focused input element or into an element matching a selector.', {
    selector: { type: 'string', description: 'CSS selector for the input element' },
    text: { type: 'string', description: 'Text to type into the element' },
    delay: { type: 'number', description: 'Delay between keystrokes in milliseconds' },
  }, ['selector', 'text']),

  tool('pw_screenshot', 'Capture a screenshot of the current page or a specific element.', {
    path: { type: 'string', description: 'File path to save the screenshot' },
    selector: { type: 'string', description: 'CSS selector to screenshot a specific element (optional)' },
    full_page: { type: 'boolean', description: 'Capture the full scrollable page' },
    type: { type: 'string', description: 'Image format', enum: ['png', 'jpeg'] },
  }, []),

  tool('pw_get_text', 'Extract text content from an element or all visible text on the page.', {
    selector: { type: 'string', description: 'CSS selector to extract text from (omit for full page)' },
  }, []),

  tool('pw_evaluate', 'Execute JavaScript code in the browser context and return the result.', {
    expression: { type: 'string', description: 'JavaScript expression or function to evaluate' },
  }, ['expression']),

  tool('pw_wait_for', 'Wait for an element to appear, become visible, or match a specific state.', {
    selector: { type: 'string', description: 'CSS selector for the element to wait for' },
    state: { type: 'string', description: 'Element state to wait for', enum: ['attached', 'detached', 'visible', 'hidden'] },
    timeout: { type: 'number', description: 'Maximum time to wait in milliseconds (default 30000)' },
  }, ['selector']),

  tool('pw_fill_form', 'Fill multiple form fields at once by mapping field selectors to values.', {
    fields: { type: 'object', description: 'Map of CSS selectors to values to fill' },
    submit_selector: { type: 'string', description: 'CSS selector of the submit button (optional, auto-submits if provided)' },
  }, ['fields']),
];

// ============================================================
// Collection Builder
// ============================================================

const MCP_SERVERS = {
  github: { name: 'GitHub', tools: GITHUB_TOOLS },
  filesystem: { name: 'Filesystem', tools: FILESYSTEM_TOOLS },
  postgresql: { name: 'PostgreSQL', tools: POSTGRESQL_TOOLS },
  playwright: { name: 'Playwright', tools: PLAYWRIGHT_TOOLS },
} as const;

type MCPServerKey = keyof typeof MCP_SERVERS;

/**
 * Collect all MCP server tool schemas as SchemaCollections.
 *
 * Returns one SchemaCollection per MCP server (4 total), plus a
 * combined collection containing all MCP tools together.
 */
export function collectMCPTools(): SchemaCollection[] {
  const collections: SchemaCollection[] = [];

  for (const [key, server] of Object.entries(MCP_SERVERS)) {
    collections.push({
      id: `mcp-${key}`,
      name: `MCP ${server.name} Server`,
      scenario: 'B',
      source: 'mcp',
      tools: server.tools,
      metadata: {
        mcpServer: key,
        targetSize: server.tools.length,
      },
    });
  }

  // Combined collection for scenarios that test all MCP tools at once
  const allMCPTools = Object.values(MCP_SERVERS).flatMap((s) => s.tools);
  collections.push({
    id: 'mcp-combined',
    name: 'MCP All Servers Combined',
    scenario: 'B',
    source: 'mcp',
    tools: allMCPTools,
    metadata: {
      targetSize: allMCPTools.length,
      domains: Object.keys(MCP_SERVERS),
    },
  });

  return collections;
}

/**
 * Get tools for a specific MCP server by key.
 */
export function getMCPServerTools(server: MCPServerKey): ToolDefinition[] {
  return [...MCP_SERVERS[server].tools];
}

/**
 * Get all MCP tools as a flat Record keyed by server name.
 * Matches the expected export signature: Record<string, ToolSchema[]>
 */
export function getMCPToolsByServer(): Record<string, ToolDefinition[]> {
  const result: Record<string, ToolDefinition[]> = {};
  for (const [key, server] of Object.entries(MCP_SERVERS)) {
    result[key] = [...server.tools];
  }
  return result;
}
