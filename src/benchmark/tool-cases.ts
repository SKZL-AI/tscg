/**
 * TSCG Tool-Description Benchmark Test Cases
 * 25 tool definitions + 30 tool selection test cases.
 * Categories: Tool_SingleTool (10), Tool_MultiTool (8), Tool_Ambiguous (7), Tool_NoTool (5)
 */

import type { TestCase } from '../core/types.js';

// === Tool-Specific Types ===

export interface ToolDef {
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
    enum?: string[];
  }>;
  frequency: 'high' | 'medium' | 'low';
}

// ============================================================
// 25 Tool Definitions (8 high, 9 medium, 8 low)
// ============================================================

export const TOOL_DEFINITIONS: ToolDef[] = [
  // --- HIGH FREQUENCY (8) ---
  {
    name: 'web_search',
    description: 'Search the web for current information. Use this tool when you need to find recent events, news, product information, or any data that may have changed since your training cutoff.',
    parameters: [
      { name: 'query', type: 'string', description: 'The search query to find relevant web pages', required: true },
      { name: 'num_results', type: 'number', description: 'Number of results to return, between 1 and 20', required: false },
      { name: 'time_range', type: 'string', description: 'Filter results by time period', required: false, enum: ['past_hour', 'past_day', 'past_week', 'past_month', 'past_year'] },
    ],
    frequency: 'high',
  },
  {
    name: 'send_email',
    description: 'Send an email message to one or more recipients. Supports plain text and HTML content, attachments, and CC/BCC recipients.',
    parameters: [
      { name: 'to', type: 'string', description: 'Recipient email address or comma-separated list of addresses', required: true },
      { name: 'subject', type: 'string', description: 'Email subject line', required: true },
      { name: 'body', type: 'string', description: 'Email body content in plain text or HTML', required: true },
      { name: 'cc', type: 'string', description: 'CC recipient email address or comma-separated list', required: false },
      { name: 'attachments', type: 'array', description: 'List of file paths to attach to the email', required: false },
    ],
    frequency: 'high',
  },
  {
    name: 'create_task',
    description: 'Create a new task or to-do item in the task management system. Tasks can be assigned to team members with due dates and priority levels.',
    parameters: [
      { name: 'title', type: 'string', description: 'Title or name of the task', required: true },
      { name: 'description', type: 'string', description: 'Detailed description of what needs to be done', required: false },
      { name: 'assignee', type: 'string', description: 'Username or email of the person responsible', required: false },
      { name: 'due_date', type: 'string', description: 'Due date in ISO 8601 format (YYYY-MM-DD)', required: false },
      { name: 'priority', type: 'string', description: 'Priority level of the task', required: false, enum: ['low', 'medium', 'high', 'critical'] },
    ],
    frequency: 'high',
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file from the local filesystem. Returns the full text content of the specified file.',
    parameters: [
      { name: 'path', type: 'string', description: 'Absolute or relative path to the file to read', required: true },
      { name: 'encoding', type: 'string', description: 'Character encoding to use when reading the file', required: false, enum: ['utf-8', 'ascii', 'latin1', 'utf-16'] },
    ],
    frequency: 'high',
  },
  {
    name: 'write_file',
    description: 'Write content to a file on the local filesystem. Creates the file if it does not exist, or overwrites the existing content.',
    parameters: [
      { name: 'path', type: 'string', description: 'Absolute or relative path to the file to write', required: true },
      { name: 'content', type: 'string', description: 'The text content to write to the file', required: true },
      { name: 'append', type: 'boolean', description: 'If true, append to the file instead of overwriting', required: false },
    ],
    frequency: 'high',
  },
  {
    name: 'run_command',
    description: 'Execute a shell command on the local system. Returns the standard output, standard error, and exit code of the command.',
    parameters: [
      { name: 'command', type: 'string', description: 'The shell command to execute', required: true },
      { name: 'working_dir', type: 'string', description: 'Working directory for command execution', required: false },
      { name: 'timeout', type: 'number', description: 'Maximum execution time in seconds before the command is killed', required: false },
    ],
    frequency: 'high',
  },
  {
    name: 'calendar_event',
    description: 'Create, update, or query calendar events. Supports setting time, location, attendees, and recurrence rules for scheduling.',
    parameters: [
      { name: 'action', type: 'string', description: 'The calendar operation to perform', required: true, enum: ['create', 'update', 'delete', 'list'] },
      { name: 'title', type: 'string', description: 'Title or name of the calendar event', required: true },
      { name: 'start_time', type: 'string', description: 'Event start time in ISO 8601 format', required: false },
      { name: 'end_time', type: 'string', description: 'Event end time in ISO 8601 format', required: false },
      { name: 'attendees', type: 'array', description: 'List of attendee email addresses', required: false },
    ],
    frequency: 'high',
  },
  {
    name: 'database_query',
    description: 'Execute a SQL query against the connected database. Supports SELECT, INSERT, UPDATE, and DELETE operations with parameterized queries.',
    parameters: [
      { name: 'query', type: 'string', description: 'The SQL query to execute', required: true },
      { name: 'params', type: 'array', description: 'Parameterized values to safely inject into the query', required: false },
      { name: 'database', type: 'string', description: 'Name of the database to query, defaults to the primary database', required: false },
    ],
    frequency: 'high',
  },

  // --- MEDIUM FREQUENCY (9) ---
  {
    name: 'translate_text',
    description: 'Translate text from one language to another. Supports over 100 languages with automatic source language detection.',
    parameters: [
      { name: 'text', type: 'string', description: 'The text to translate', required: true },
      { name: 'target_language', type: 'string', description: 'Target language code (e.g., en, de, fr, ja, zh)', required: true },
      { name: 'source_language', type: 'string', description: 'Source language code; if omitted, language is auto-detected', required: false },
    ],
    frequency: 'medium',
  },
  {
    name: 'image_generate',
    description: 'Generate an image from a text description using AI image generation. Returns a URL to the generated image.',
    parameters: [
      { name: 'prompt', type: 'string', description: 'Detailed text description of the image to generate', required: true },
      { name: 'size', type: 'string', description: 'Image dimensions in pixels', required: false, enum: ['256x256', '512x512', '1024x1024', '1792x1024'] },
      { name: 'style', type: 'string', description: 'Visual style for the generated image', required: false, enum: ['photorealistic', 'illustration', 'watercolor', 'sketch'] },
    ],
    frequency: 'medium',
  },
  {
    name: 'get_weather',
    description: 'Get current weather conditions and forecast for a specified location. Returns temperature, humidity, wind speed, and conditions.',
    parameters: [
      { name: 'location', type: 'string', description: 'City name, ZIP code, or coordinates (lat,lon)', required: true },
      { name: 'units', type: 'string', description: 'Temperature units', required: false, enum: ['celsius', 'fahrenheit'] },
      { name: 'forecast_days', type: 'number', description: 'Number of forecast days to include (1-7)', required: false },
    ],
    frequency: 'medium',
  },
  {
    name: 'slack_message',
    description: 'Send a message to a Slack channel or user. Supports rich text formatting, mentions, and thread replies.',
    parameters: [
      { name: 'channel', type: 'string', description: 'Slack channel name (e.g., #general) or user ID for direct message', required: true },
      { name: 'message', type: 'string', description: 'The message text to send, supports Slack markdown', required: true },
      { name: 'thread_ts', type: 'string', description: 'Timestamp of parent message to reply in a thread', required: false },
    ],
    frequency: 'medium',
  },
  {
    name: 'create_spreadsheet',
    description: 'Create or modify a spreadsheet with data. Supports creating sheets, writing cell values, and applying basic formulas.',
    parameters: [
      { name: 'title', type: 'string', description: 'Title of the spreadsheet', required: true },
      { name: 'data', type: 'array', description: 'Two-dimensional array of cell values representing rows and columns', required: true },
      { name: 'sheet_name', type: 'string', description: 'Name of the worksheet tab', required: false },
    ],
    frequency: 'medium',
  },
  {
    name: 'pdf_extract',
    description: 'Extract text content, tables, and metadata from a PDF document. Returns structured text with page boundaries preserved.',
    parameters: [
      { name: 'file_path', type: 'string', description: 'Path to the PDF file to extract content from', required: true },
      { name: 'pages', type: 'string', description: 'Page range to extract (e.g., "1-5", "1,3,7")', required: false },
      { name: 'extract_tables', type: 'boolean', description: 'If true, attempt to extract tabular data as structured arrays', required: false },
    ],
    frequency: 'medium',
  },
  {
    name: 'code_review',
    description: 'Perform an automated code review on a file or code snippet. Identifies bugs, security issues, style violations, and suggests improvements.',
    parameters: [
      { name: 'code', type: 'string', description: 'The source code to review, or a file path', required: true },
      { name: 'language', type: 'string', description: 'Programming language of the code', required: false, enum: ['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'csharp'] },
      { name: 'focus', type: 'string', description: 'Area to focus the review on', required: false, enum: ['bugs', 'security', 'performance', 'style', 'all'] },
    ],
    frequency: 'medium',
  },
  {
    name: 'git_operation',
    description: 'Perform git version control operations on a repository. Supports common operations like commit, push, pull, branch, and status.',
    parameters: [
      { name: 'operation', type: 'string', description: 'The git operation to perform', required: true, enum: ['status', 'commit', 'push', 'pull', 'branch', 'checkout', 'log', 'diff'] },
      { name: 'message', type: 'string', description: 'Commit message (required for commit operation)', required: false },
      { name: 'branch', type: 'string', description: 'Branch name for branch or checkout operations', required: false },
    ],
    frequency: 'medium',
  },
  {
    name: 'api_request',
    description: 'Make an HTTP request to an external API endpoint. Supports all HTTP methods, custom headers, and request bodies.',
    parameters: [
      { name: 'url', type: 'string', description: 'The full URL of the API endpoint', required: true },
      { name: 'method', type: 'string', description: 'HTTP method to use', required: true, enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      { name: 'headers', type: 'object', description: 'HTTP headers as key-value pairs', required: false },
      { name: 'body', type: 'string', description: 'Request body content, typically JSON', required: false },
    ],
    frequency: 'medium',
  },

  // --- LOW FREQUENCY (8) ---
  {
    name: 'convert_currency',
    description: 'Convert an amount from one currency to another using real-time exchange rates. Supports all major world currencies.',
    parameters: [
      { name: 'amount', type: 'number', description: 'The amount of money to convert', required: true },
      { name: 'from_currency', type: 'string', description: 'Source currency ISO code (e.g., USD, EUR, GBP)', required: true },
      { name: 'to_currency', type: 'string', description: 'Target currency ISO code (e.g., USD, EUR, GBP)', required: true },
    ],
    frequency: 'low',
  },
  {
    name: 'calculate',
    description: 'Evaluate a mathematical expression or perform calculations. Supports arithmetic, trigonometry, statistics, and symbolic math.',
    parameters: [
      { name: 'expression', type: 'string', description: 'The mathematical expression to evaluate (e.g., "sqrt(144) + 3^2")', required: true },
      { name: 'precision', type: 'number', description: 'Number of decimal places in the result', required: false },
    ],
    frequency: 'low',
  },
  {
    name: 'set_reminder',
    description: 'Set a reminder that will trigger a notification at the specified time. Supports one-time and recurring reminders.',
    parameters: [
      { name: 'message', type: 'string', description: 'The reminder message text', required: true },
      { name: 'time', type: 'string', description: 'When to trigger the reminder in ISO 8601 format or natural language', required: true },
      { name: 'recurrence', type: 'string', description: 'Recurrence pattern for repeating reminders', required: false, enum: ['none', 'daily', 'weekly', 'monthly'] },
    ],
    frequency: 'low',
  },
  {
    name: 'screenshot',
    description: 'Capture a screenshot of a web page at a given URL. Returns an image of the rendered page.',
    parameters: [
      { name: 'url', type: 'string', description: 'The URL of the web page to screenshot', required: true },
      { name: 'viewport', type: 'string', description: 'Viewport size as widthxheight in pixels', required: false, enum: ['1280x720', '1920x1080', '375x812', '768x1024'] },
      { name: 'full_page', type: 'boolean', description: 'If true, capture the entire scrollable page', required: false },
    ],
    frequency: 'low',
  },
  {
    name: 'text_to_speech',
    description: 'Convert text into spoken audio. Returns an audio file URL with the synthesized speech.',
    parameters: [
      { name: 'text', type: 'string', description: 'The text to convert to speech', required: true },
      { name: 'language', type: 'string', description: 'Language and locale code (e.g., en-US, de-DE, ja-JP)', required: false },
      { name: 'voice', type: 'string', description: 'Voice selection', required: false, enum: ['male_1', 'female_1', 'male_2', 'female_2'] },
    ],
    frequency: 'low',
  },
  {
    name: 'qr_code',
    description: 'Generate a QR code image encoding the provided data. Supports URLs, text, contact cards, and Wi-Fi credentials.',
    parameters: [
      { name: 'data', type: 'string', description: 'The data to encode in the QR code', required: true },
      { name: 'size', type: 'number', description: 'Size of the QR code image in pixels (width and height)', required: false },
    ],
    frequency: 'low',
  },
  {
    name: 'compress_files',
    description: 'Compress one or more files into an archive. Supports ZIP, TAR.GZ, and 7Z formats.',
    parameters: [
      { name: 'files', type: 'array', description: 'List of file paths to include in the archive', required: true },
      { name: 'output_path', type: 'string', description: 'Path for the output archive file', required: true },
      { name: 'format', type: 'string', description: 'Archive format to use', required: false, enum: ['zip', 'tar.gz', '7z'] },
    ],
    frequency: 'low',
  },
  {
    name: 'dns_lookup',
    description: 'Perform a DNS lookup for a domain name. Returns DNS records including A, AAAA, MX, CNAME, TXT, and NS records.',
    parameters: [
      { name: 'domain', type: 'string', description: 'The domain name to look up', required: true },
      { name: 'record_type', type: 'string', description: 'Type of DNS record to query', required: false, enum: ['A', 'AAAA', 'MX', 'CNAME', 'TXT', 'NS', 'ALL'] },
    ],
    frequency: 'low',
  },
];

// ============================================================
// Helper: Format tool definitions for prompts
// ============================================================

function formatToolsNatural(tools: ToolDef[]): string {
  return tools.map(t => {
    const params = t.parameters.map(p => {
      let s = `    - ${p.name} (${p.type}${p.required ? ', required' : ', optional'}): ${p.description}`;
      if (p.enum) s += ` [${p.enum.join(', ')}]`;
      return s;
    }).join('\n');
    return `Tool: ${t.name}\n  Description: ${t.description}\n  Parameters:\n${params}`;
  }).join('\n\n');
}

function formatToolsTscg(tools: ToolDef[]): string {
  return tools.map(t => {
    const params = t.parameters.map(p => {
      const req = p.required ? '*' : '';
      const enumStr = p.enum ? ` [${p.enum.join('|')}]` : '';
      return `${p.name}${req}(${p.type})${enumStr}`;
    }).join(', ');
    return `${t.name}: ${params}`;
  }).join('\n');
}

const NATURAL_TOOLS_BLOCK = formatToolsNatural(TOOL_DEFINITIONS);
const TSCG_TOOLS_BLOCK = formatToolsTscg(TOOL_DEFINITIONS);

function makeToolNatural(userMessage: string): string {
  return `You are a helpful assistant with access to the following tools.\nFor each user message, respond with ONLY the tool name(s) you would use, separated by commas. If no tool is needed, respond with "none".\nDo not explain your reasoning. Only output tool names.\n\nAvailable tools:\n\n${NATURAL_TOOLS_BLOCK}\n\nUser message: ${userMessage}`;
}

function makeToolTscg(userMessage: string): string {
  return `[ANSWER:tool_names] Select tools from list. Output comma-separated tool names or "none".\nTools:\n${TSCG_TOOLS_BLOCK}\nUser: ${userMessage}`;
}

// ============================================================
// 30 Tool Selection Test Cases
// ============================================================

// --- Tool_SingleTool (10) ---

const SINGLE_TOOL_TESTS: TestCase[] = [
  {
    id: 'tool-ts1',
    category: 'Tool_SingleTool',
    name: 'Web Search',
    expected: 'web_search',
    natural: makeToolNatural('Search for the latest news about the 2024 Summer Olympics results.'),
    tscg: makeToolTscg('Search for the latest news about the 2024 Summer Olympics results.'),
    check: (r) => r.toLowerCase().includes('web_search'),
    tags: ['tool', 'single'],
  },
  {
    id: 'tool-ts2',
    category: 'Tool_SingleTool',
    name: 'Send Email',
    expected: 'send_email',
    natural: makeToolNatural('Send an email to john.doe@example.com with subject "Meeting Tomorrow" and body "Hi John, just confirming our meeting at 2pm."'),
    tscg: makeToolTscg('Send an email to john.doe@example.com with subject "Meeting Tomorrow" and body "Hi John, just confirming our meeting at 2pm."'),
    check: (r) => r.toLowerCase().includes('send_email'),
    tags: ['tool', 'single'],
  },
  {
    id: 'tool-ts3',
    category: 'Tool_SingleTool',
    name: 'Create Task',
    expected: 'create_task',
    natural: makeToolNatural('Create a high-priority task titled "Fix login bug" assigned to sarah@company.com, due next Friday.'),
    tscg: makeToolTscg('Create a high-priority task titled "Fix login bug" assigned to sarah@company.com, due next Friday.'),
    check: (r) => r.toLowerCase().includes('create_task'),
    tags: ['tool', 'single'],
  },
  {
    id: 'tool-ts4',
    category: 'Tool_SingleTool',
    name: 'Read File',
    expected: 'read_file',
    natural: makeToolNatural('Read the contents of /etc/nginx/nginx.conf and show me what is in it.'),
    tscg: makeToolTscg('Read the contents of /etc/nginx/nginx.conf and show me what is in it.'),
    check: (r) => r.toLowerCase().includes('read_file'),
    tags: ['tool', 'single'],
  },
  {
    id: 'tool-ts5',
    category: 'Tool_SingleTool',
    name: 'Get Weather',
    expected: 'get_weather',
    natural: makeToolNatural('What is the weather like right now in Berlin, Germany?'),
    tscg: makeToolTscg('What is the weather like right now in Berlin, Germany?'),
    check: (r) => r.toLowerCase().includes('get_weather'),
    tags: ['tool', 'single'],
  },
  {
    id: 'tool-ts6',
    category: 'Tool_SingleTool',
    name: 'Translate Text',
    expected: 'translate_text',
    natural: makeToolNatural('Translate "Good morning, how are you today?" into Japanese.'),
    tscg: makeToolTscg('Translate "Good morning, how are you today?" into Japanese.'),
    check: (r) => r.toLowerCase().includes('translate_text'),
    tags: ['tool', 'single'],
  },
  {
    id: 'tool-ts7',
    category: 'Tool_SingleTool',
    name: 'Database Query',
    expected: 'database_query',
    natural: makeToolNatural('Run this SQL query on the production database: SELECT COUNT(*) FROM users WHERE created_at > "2024-01-01"'),
    tscg: makeToolTscg('Run this SQL query on the production database: SELECT COUNT(*) FROM users WHERE created_at > "2024-01-01"'),
    check: (r) => r.toLowerCase().includes('database_query'),
    tags: ['tool', 'single'],
  },
  {
    id: 'tool-ts8',
    category: 'Tool_SingleTool',
    name: 'Calendar Event',
    expected: 'calendar_event',
    natural: makeToolNatural('Schedule a team standup meeting for tomorrow at 9:30 AM with the engineering team.'),
    tscg: makeToolTscg('Schedule a team standup meeting for tomorrow at 9:30 AM with the engineering team.'),
    check: (r) => r.toLowerCase().includes('calendar_event'),
    tags: ['tool', 'single'],
  },
  {
    id: 'tool-ts9',
    category: 'Tool_SingleTool',
    name: 'Image Generate',
    expected: 'image_generate',
    natural: makeToolNatural('Generate an image of a futuristic cityscape at sunset with flying cars, in a photorealistic style.'),
    tscg: makeToolTscg('Generate an image of a futuristic cityscape at sunset with flying cars, in a photorealistic style.'),
    check: (r) => r.toLowerCase().includes('image_generate'),
    tags: ['tool', 'single'],
  },
  {
    id: 'tool-ts10',
    category: 'Tool_SingleTool',
    name: 'PDF Extract',
    expected: 'pdf_extract',
    natural: makeToolNatural('Extract all the text from the PDF file at /documents/quarterly-report-q3.pdf, including any tables on pages 5 through 10.'),
    tscg: makeToolTscg('Extract all the text from the PDF file at /documents/quarterly-report-q3.pdf, including any tables on pages 5 through 10.'),
    check: (r) => r.toLowerCase().includes('pdf_extract'),
    tags: ['tool', 'single'],
  },
];

// --- Tool_MultiTool (8) ---

const MULTI_TOOL_TESTS: TestCase[] = [
  {
    id: 'tool-tm1',
    category: 'Tool_MultiTool',
    name: 'Search and Email',
    expected: 'web_search, send_email',
    natural: makeToolNatural('Find the latest quarterly earnings for Apple Inc. and email a summary to my boss at manager@company.com.'),
    tscg: makeToolTscg('Find the latest quarterly earnings for Apple Inc. and email a summary to my boss at manager@company.com.'),
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes('web_search') && lower.includes('send_email');
    },
    tags: ['tool', 'multi'],
  },
  {
    id: 'tool-tm2',
    category: 'Tool_MultiTool',
    name: 'Read and Write File',
    expected: 'read_file, write_file',
    natural: makeToolNatural('Read the configuration from /app/config.json, then write an updated version to /app/config.backup.json.'),
    tscg: makeToolTscg('Read the configuration from /app/config.json, then write an updated version to /app/config.backup.json.'),
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes('read_file') && lower.includes('write_file');
    },
    tags: ['tool', 'multi'],
  },
  {
    id: 'tool-tm3',
    category: 'Tool_MultiTool',
    name: 'Search and Translate',
    expected: 'web_search, translate_text',
    natural: makeToolNatural('Look up the official press release from Toyota about their new EV model, then translate the key points into German.'),
    tscg: makeToolTscg('Look up the official press release from Toyota about their new EV model, then translate the key points into German.'),
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes('web_search') && lower.includes('translate_text');
    },
    tags: ['tool', 'multi'],
  },
  {
    id: 'tool-tm4',
    category: 'Tool_MultiTool',
    name: 'Query and Spreadsheet',
    expected: 'database_query, create_spreadsheet',
    natural: makeToolNatural('Pull all sales records from the database for Q4 2024 and create a spreadsheet with the results organized by region.'),
    tscg: makeToolTscg('Pull all sales records from the database for Q4 2024 and create a spreadsheet with the results organized by region.'),
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes('database_query') && lower.includes('create_spreadsheet');
    },
    tags: ['tool', 'multi'],
  },
  {
    id: 'tool-tm5',
    category: 'Tool_MultiTool',
    name: 'Git and Slack',
    expected: 'git_operation, slack_message',
    natural: makeToolNatural('Commit all current changes with the message "Fix auth bug" and notify the #engineering channel on Slack that the fix has been pushed.'),
    tscg: makeToolTscg('Commit all current changes with the message "Fix auth bug" and notify the #engineering channel on Slack that the fix has been pushed.'),
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes('git_operation') && lower.includes('slack_message');
    },
    tags: ['tool', 'multi'],
  },
  {
    id: 'tool-tm6',
    category: 'Tool_MultiTool',
    name: 'Weather and Calendar',
    expected: 'get_weather, calendar_event',
    natural: makeToolNatural('Check the weather forecast for Saturday in Central Park, and if it looks clear, schedule an outdoor team picnic from 11 AM to 3 PM.'),
    tscg: makeToolTscg('Check the weather forecast for Saturday in Central Park, and if it looks clear, schedule an outdoor team picnic from 11 AM to 3 PM.'),
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes('get_weather') && lower.includes('calendar_event');
    },
    tags: ['tool', 'multi'],
  },
  {
    id: 'tool-tm7',
    category: 'Tool_MultiTool',
    name: 'PDF and Email',
    expected: 'pdf_extract, send_email',
    natural: makeToolNatural('Extract the executive summary from /reports/annual-2024.pdf and email it to the board members at board@company.com.'),
    tscg: makeToolTscg('Extract the executive summary from /reports/annual-2024.pdf and email it to the board members at board@company.com.'),
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes('pdf_extract') && lower.includes('send_email');
    },
    tags: ['tool', 'multi'],
  },
  {
    id: 'tool-tm8',
    category: 'Tool_MultiTool',
    name: 'Search, Screenshot, and Slack',
    expected: 'web_search, screenshot, slack_message',
    natural: makeToolNatural('Find our competitor\'s updated pricing page, take a screenshot of it, and share it in the #competitive-intel Slack channel.'),
    tscg: makeToolTscg('Find our competitor\'s updated pricing page, take a screenshot of it, and share it in the #competitive-intel Slack channel.'),
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes('web_search') && lower.includes('screenshot') && lower.includes('slack_message');
    },
    tags: ['tool', 'multi'],
  },
];

// --- Tool_Ambiguous (7) ---

const AMBIGUOUS_TOOL_TESTS: TestCase[] = [
  {
    id: 'tool-ta1',
    category: 'Tool_Ambiguous',
    name: 'Currency Lookup',
    expected: 'convert_currency',
    natural: makeToolNatural('How much is 500 EUR in USD right now?'),
    tscg: makeToolTscg('How much is 500 EUR in USD right now?'),
    check: (r) => r.toLowerCase().includes('convert_currency'),
    tags: ['tool', 'ambiguous'],
  },
  {
    id: 'tool-ta2',
    category: 'Tool_Ambiguous',
    name: 'Reminder vs Calendar',
    expected: 'set_reminder',
    natural: makeToolNatural('Remind me to call the dentist at 3 PM today.'),
    tscg: makeToolTscg('Remind me to call the dentist at 3 PM today.'),
    check: (r) => r.toLowerCase().includes('set_reminder'),
    tags: ['tool', 'ambiguous'],
  },
  {
    id: 'tool-ta3',
    category: 'Tool_Ambiguous',
    name: 'Run Command vs Git',
    expected: 'git_operation',
    natural: makeToolNatural('Show me the git log of the last 10 commits on the main branch.'),
    tscg: makeToolTscg('Show me the git log of the last 10 commits on the main branch.'),
    check: (r) => r.toLowerCase().includes('git_operation'),
    tags: ['tool', 'ambiguous'],
  },
  {
    id: 'tool-ta4',
    category: 'Tool_Ambiguous',
    name: 'Calculate vs Search',
    expected: 'calculate',
    natural: makeToolNatural('What is the square root of 2 to 10 decimal places?'),
    tscg: makeToolTscg('What is the square root of 2 to 10 decimal places?'),
    check: (r) => r.toLowerCase().includes('calculate'),
    tags: ['tool', 'ambiguous'],
  },
  {
    id: 'tool-ta5',
    category: 'Tool_Ambiguous',
    name: 'Slack vs Email',
    expected: 'slack_message',
    natural: makeToolNatural('Send a message to the #general channel saying "Deployment complete, all systems green."'),
    tscg: makeToolTscg('Send a message to the #general channel saying "Deployment complete, all systems green."'),
    check: (r) => r.toLowerCase().includes('slack_message'),
    tags: ['tool', 'ambiguous'],
  },
  {
    id: 'tool-ta6',
    category: 'Tool_Ambiguous',
    name: 'API Request vs Web Search',
    expected: 'api_request',
    natural: makeToolNatural('Make a GET request to https://api.github.com/repos/facebook/react and show me the stargazers count.'),
    tscg: makeToolTscg('Make a GET request to https://api.github.com/repos/facebook/react and show me the stargazers count.'),
    check: (r) => r.toLowerCase().includes('api_request'),
    tags: ['tool', 'ambiguous'],
  },
  {
    id: 'tool-ta7',
    category: 'Tool_Ambiguous',
    name: 'Write File vs Run Command',
    expected: 'write_file',
    natural: makeToolNatural('Save the following text to /tmp/notes.txt: "Meeting rescheduled to Thursday at 10 AM."'),
    tscg: makeToolTscg('Save the following text to /tmp/notes.txt: "Meeting rescheduled to Thursday at 10 AM."'),
    check: (r) => r.toLowerCase().includes('write_file'),
    tags: ['tool', 'ambiguous'],
  },
];

// --- Tool_NoTool (5) ---

const NO_TOOL_TESTS: TestCase[] = [
  {
    id: 'tool-tn1',
    category: 'Tool_NoTool',
    name: 'Simple Math',
    expected: 'none',
    natural: makeToolNatural('What is 2 + 2?'),
    tscg: makeToolTscg('What is 2 + 2?'),
    check: (r) => r.toLowerCase().includes('none'),
    tags: ['tool', 'no-tool'],
  },
  {
    id: 'tool-tn2',
    category: 'Tool_NoTool',
    name: 'Greeting',
    expected: 'none',
    natural: makeToolNatural('Hello, how are you doing today?'),
    tscg: makeToolTscg('Hello, how are you doing today?'),
    check: (r) => r.toLowerCase().includes('none'),
    tags: ['tool', 'no-tool'],
  },
  {
    id: 'tool-tn3',
    category: 'Tool_NoTool',
    name: 'General Knowledge',
    expected: 'none',
    natural: makeToolNatural('What is the capital of France?'),
    tscg: makeToolTscg('What is the capital of France?'),
    check: (r) => r.toLowerCase().includes('none'),
    tags: ['tool', 'no-tool'],
  },
  {
    id: 'tool-tn4',
    category: 'Tool_NoTool',
    name: 'Definition Request',
    expected: 'none',
    natural: makeToolNatural('Explain what a binary search tree is in simple terms.'),
    tscg: makeToolTscg('Explain what a binary search tree is in simple terms.'),
    check: (r) => r.toLowerCase().includes('none'),
    tags: ['tool', 'no-tool'],
  },
  {
    id: 'tool-tn5',
    category: 'Tool_NoTool',
    name: 'Opinion Request',
    expected: 'none',
    natural: makeToolNatural('Which is better for a beginner, Python or JavaScript?'),
    tscg: makeToolTscg('Which is better for a beginner, Python or JavaScript?'),
    check: (r) => r.toLowerCase().includes('none'),
    tags: ['tool', 'no-tool'],
  },
];

// ============================================================
// Exports
// ============================================================

/** All 30 tool selection test cases */
export const TOOL_TESTS: TestCase[] = [
  ...SINGLE_TOOL_TESTS,
  ...MULTI_TOOL_TESTS,
  ...AMBIGUOUS_TOOL_TESTS,
  ...NO_TOOL_TESTS,
];

/** Get tool tests by category */
export function getToolTestsByCategory(category: string): TestCase[] {
  return TOOL_TESTS.filter(t => t.category === category);
}
