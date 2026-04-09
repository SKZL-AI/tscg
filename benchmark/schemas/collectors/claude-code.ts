/**
 * TAB Schema Collector — Claude Code Tools
 *
 * Extracts the 16 Claude Code tool definitions as ToolDefinition objects.
 * These tools represent a real-world agentic coding assistant environment
 * and serve as Scenario A in the TAB benchmark.
 *
 * Source: Claude Code (Anthropic) tool specification
 * Tools: Bash, Read, Write, Edit, MultiEdit, Glob, Grep, LS,
 *        TodoRead, TodoWrite, WebFetch, WebSearch, Task,
 *        NotebookEdit, KillShell
 *
 * Note: The original spec lists WebSearch twice — one is the web content
 * search tool and the other is a duplicate. We include 15 unique tools
 * plus we add NotebookRead to reach 16 distinct tools.
 */

import type { ToolDefinition } from '../../../packages/core/src/types.js';
import type { SchemaCollection } from '../types.js';

// ============================================================
// 16 Claude Code Tool Definitions
// ============================================================

const CLAUDE_CODE_TOOLS: ToolDefinition[] = [
  // --- 1. Bash ---
  {
    type: 'function',
    function: {
      name: 'Bash',
      description:
        'Executes a bash command in a persistent shell session with optional timeout. ' +
        'Supports background execution and captures stdout, stderr, and exit code. ' +
        'Use for terminal operations like git, npm, docker, and build commands.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The bash command to execute',
          },
          description: {
            type: 'string',
            description:
              'Clear, concise description of what this command does in active voice',
          },
          timeout: {
            type: 'number',
            description:
              'Optional timeout in milliseconds (max 600000). Defaults to 120000ms',
          },
          run_in_background: {
            type: 'boolean',
            description:
              'Set to true to run in the background; output can be read later',
          },
        },
        required: ['command'],
      },
    },
  },

  // --- 2. Read ---
  {
    type: 'function',
    function: {
      name: 'Read',
      description:
        'Reads a file from the local filesystem. Supports text files, images (PNG, JPG), ' +
        'PDFs, and Jupyter notebooks. Returns content with line numbers. ' +
        'Optionally specify offset and limit for large files.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the file to read',
          },
          offset: {
            type: 'number',
            description:
              'The line number to start reading from (for large files)',
          },
          limit: {
            type: 'number',
            description: 'The number of lines to read (for large files)',
          },
        },
        required: ['file_path'],
      },
    },
  },

  // --- 3. Write ---
  {
    type: 'function',
    function: {
      name: 'Write',
      description:
        'Writes content to a file on the local filesystem. Overwrites existing files. ' +
        'The file must be read first before writing to it. ' +
        'Prefer editing existing files over creating new ones.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the file to write',
          },
          content: {
            type: 'string',
            description: 'The content to write to the file',
          },
        },
        required: ['file_path', 'content'],
      },
    },
  },

  // --- 4. Edit ---
  {
    type: 'function',
    function: {
      name: 'Edit',
      description:
        'Performs exact string replacements in files. The old_string must be unique ' +
        'in the file. Use replace_all to change every occurrence. ' +
        'File must be read first before editing.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the file to modify',
          },
          old_string: {
            type: 'string',
            description: 'The text to replace (must be unique in file)',
          },
          new_string: {
            type: 'string',
            description: 'The text to replace it with',
          },
          replace_all: {
            type: 'boolean',
            description:
              'Replace all occurrences of old_string (default false)',
          },
        },
        required: ['file_path', 'old_string', 'new_string'],
      },
    },
  },

  // --- 5. MultiEdit ---
  {
    type: 'function',
    function: {
      name: 'MultiEdit',
      description:
        'Performs multiple exact string replacements in a single file atomically. ' +
        'All edits are applied in order. Each edit specifies old_string and new_string. ' +
        'More efficient than multiple Edit calls for batch changes.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the file to modify',
          },
          edits: {
            type: 'array',
            description:
              'Array of edit operations, each with old_string and new_string',
            items: {
              type: 'object',
              properties: {
                old_string: { type: 'string', description: 'Text to replace' },
                new_string: {
                  type: 'string',
                  description: 'Replacement text',
                },
              },
              required: ['old_string', 'new_string'],
            },
          },
        },
        required: ['file_path', 'edits'],
      },
    },
  },

  // --- 6. Glob ---
  {
    type: 'function',
    function: {
      name: 'Glob',
      description:
        'Fast file pattern matching tool for finding files by name patterns. ' +
        'Supports glob patterns like "**/*.js" or "src/**/*.ts". ' +
        'Returns matching file paths sorted by modification time.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The glob pattern to match files against',
          },
          path: {
            type: 'string',
            description:
              'The directory to search in. Defaults to current working directory',
          },
        },
        required: ['pattern'],
      },
    },
  },

  // --- 7. Grep ---
  {
    type: 'function',
    function: {
      name: 'Grep',
      description:
        'Content search tool built on ripgrep. Supports full regex syntax, ' +
        'file type filtering, and multiple output modes (content, files_with_matches, count). ' +
        'Use for searching file contents across the codebase.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The regular expression pattern to search for',
          },
          path: {
            type: 'string',
            description:
              'File or directory to search in. Defaults to current directory',
          },
          glob: {
            type: 'string',
            description:
              'Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}")',
          },
          type: {
            type: 'string',
            description:
              'File type to search (e.g. "js", "py", "rust", "go")',
          },
          output_mode: {
            type: 'string',
            description: 'Output mode for results',
            enum: ['content', 'files_with_matches', 'count'],
          },
          multiline: {
            type: 'boolean',
            description:
              'Enable multiline mode where . matches newlines (default false)',
          },
        },
        required: ['pattern'],
      },
    },
  },

  // --- 8. LS ---
  {
    type: 'function',
    function: {
      name: 'LS',
      description:
        'Lists files and directories at the specified path. Returns names, sizes, ' +
        'and modification dates. Use to explore directory structure and verify paths.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The absolute path to the directory to list',
          },
          ignore: {
            type: 'array',
            description: 'Patterns to exclude from the listing',
            items: { type: 'string' },
          },
        },
        required: ['path'],
      },
    },
  },

  // --- 9. TodoRead ---
  {
    type: 'function',
    function: {
      name: 'TodoRead',
      description:
        'Reads the current to-do list for the session. Returns all tasks with their ' +
        'status (pending, in_progress, completed). Use to check progress on multi-step work.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },

  // --- 10. TodoWrite ---
  {
    type: 'function',
    function: {
      name: 'TodoWrite',
      description:
        'Creates or updates to-do items for tracking multi-step tasks. ' +
        'Each item has a status, priority, and description. ' +
        'Replaces the entire to-do list with the provided items.',
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            description: 'The complete list of to-do items',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Unique task identifier' },
                content: {
                  type: 'string',
                  description: 'Task description',
                },
                status: {
                  type: 'string',
                  description: 'Current task status',
                  enum: ['pending', 'in_progress', 'completed'],
                },
                priority: {
                  type: 'string',
                  description: 'Task priority level',
                  enum: ['high', 'medium', 'low'],
                },
              },
              required: ['id', 'content', 'status'],
            },
          },
        },
        required: ['todos'],
      },
    },
  },

  // --- 11. WebFetch ---
  {
    type: 'function',
    function: {
      name: 'WebFetch',
      description:
        'Fetches content from a URL and returns it as text. Handles HTML pages, ' +
        'JSON APIs, and other web resources. Useful for downloading documentation, ' +
        'checking API responses, or reading remote files.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch content from',
          },
          headers: {
            type: 'object',
            description: 'Optional HTTP headers as key-value pairs',
          },
        },
        required: ['url'],
      },
    },
  },

  // --- 12. WebSearch ---
  {
    type: 'function',
    function: {
      name: 'WebSearch',
      description:
        'Searches the web for information using a search query. Returns relevant ' +
        'search results with titles, URLs, and snippets. Use when you need current ' +
        'information not available in local files.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query string',
          },
          num_results: {
            type: 'number',
            description: 'Number of results to return (default 5)',
          },
        },
        required: ['query'],
      },
    },
  },

  // --- 13. Task ---
  {
    type: 'function',
    function: {
      name: 'Task',
      description:
        'Spawns a sub-agent to handle a complex or open-ended task independently. ' +
        'The sub-agent has access to all tools and can perform multi-step operations. ' +
        'Use for tasks requiring multiple rounds of exploration and action.',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description:
              'A detailed description of the task for the sub-agent to accomplish',
          },
          working_directory: {
            type: 'string',
            description: 'The working directory for the sub-agent',
          },
        },
        required: ['description'],
      },
    },
  },

  // --- 14. NotebookEdit ---
  {
    type: 'function',
    function: {
      name: 'NotebookEdit',
      description:
        'Edits a Jupyter notebook cell by replacing its content or inserting a new cell. ' +
        'Supports both code and markdown cells. Specify the cell index and new content.',
      parameters: {
        type: 'object',
        properties: {
          notebook_path: {
            type: 'string',
            description: 'The absolute path to the .ipynb notebook file',
          },
          cell_index: {
            type: 'number',
            description: 'The zero-based index of the cell to edit',
          },
          new_source: {
            type: 'string',
            description: 'The new content for the cell',
          },
          cell_type: {
            type: 'string',
            description: 'Type of cell',
            enum: ['code', 'markdown'],
          },
          operation: {
            type: 'string',
            description: 'Whether to replace an existing cell or insert a new one',
            enum: ['replace', 'insert'],
          },
        },
        required: ['notebook_path', 'cell_index', 'new_source'],
      },
    },
  },

  // --- 15. NotebookRead ---
  {
    type: 'function',
    function: {
      name: 'NotebookRead',
      description:
        'Reads a Jupyter notebook and returns all cells with their outputs. ' +
        'Combines code, text, and visualizations. Useful for reviewing notebook ' +
        'content before editing.',
      parameters: {
        type: 'object',
        properties: {
          notebook_path: {
            type: 'string',
            description: 'The absolute path to the .ipynb notebook file',
          },
        },
        required: ['notebook_path'],
      },
    },
  },

  // --- 16. KillShell ---
  {
    type: 'function',
    function: {
      name: 'KillShell',
      description:
        'Terminates a running shell process by its process ID. Use to stop ' +
        'long-running or background commands that are no longer needed.',
      parameters: {
        type: 'object',
        properties: {
          pid: {
            type: 'number',
            description: 'The process ID of the shell process to terminate',
          },
        },
        required: ['pid'],
      },
    },
  },
];

// ============================================================
// Collector Function
// ============================================================

/**
 * Collect all 16 Claude Code tool definitions as a SchemaCollection.
 *
 * These tools represent the real-world Scenario A environment:
 * a coding agent with file, search, shell, and web capabilities.
 */
export function collectClaudeCodeTools(): SchemaCollection {
  return {
    id: 'claude-code',
    name: 'Claude Code Tools',
    scenario: 'A',
    source: 'claude-code',
    tools: CLAUDE_CODE_TOOLS,
    metadata: {
      targetSize: CLAUDE_CODE_TOOLS.length,
      domains: ['coding', 'filesystem', 'web', 'notebook', 'task-management'],
    },
  };
}

/**
 * Get the raw tool definitions array (for direct access without collection wrapper).
 */
export function getClaudeCodeToolDefinitions(): ToolDefinition[] {
  return [...CLAUDE_CODE_TOOLS];
}
