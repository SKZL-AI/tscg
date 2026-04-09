/**
 * TAB Schema Collector — Synthetic Tool Catalog Generator
 *
 * Generates deterministic synthetic tool catalogs across 10 domains.
 * Uses a seeded PRNG for reproducibility (default seed=42).
 *
 * Domains: finance, weather, ecommerce, devops, communication,
 *          calendar, storage, analytics, auth, media
 *
 * Features:
 * - 3-5 parameters per tool
 * - ~30% cross-domain tool overlap (shared utility tools)
 * - Supported catalog sizes: 3, 5, 10, 15, 20, 30, 50, 75, 100
 * - Deterministic output for any given (size, seed) pair
 *
 * These catalogs serve as Scenario C in TAB, testing TSCG compression
 * at varying tool catalog scales.
 */

import type { ToolDefinition, JSONSchemaProperty } from '../../../packages/core/src/types.js';
import type { SchemaCollection } from '../types.js';

// ============================================================
// Seeded PRNG (Mulberry32)
// ============================================================

/**
 * Mulberry32 — a fast, high-quality 32-bit seeded PRNG.
 * Produces values in [0, 1) like Math.random().
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle using seeded PRNG.
 */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Pick n random items from array using seeded PRNG.
 */
function pickN<T>(arr: T[], n: number, rng: () => number): T[] {
  return shuffle(arr, rng).slice(0, Math.min(n, arr.length));
}

// ============================================================
// Parameter Templates
// ============================================================

interface ParamTemplate {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enum?: string[];
}

const COMMON_PARAMS: ParamTemplate[] = [
  { name: 'format', type: 'string', description: 'Output format for the response', required: false, enum: ['json', 'xml', 'csv', 'text'] },
  { name: 'limit', type: 'number', description: 'Maximum number of results to return', required: false },
  { name: 'offset', type: 'number', description: 'Number of results to skip for pagination', required: false },
  { name: 'sort_by', type: 'string', description: 'Field to sort results by', required: false },
  { name: 'sort_order', type: 'string', description: 'Sort direction', required: false, enum: ['asc', 'desc'] },
  { name: 'filter', type: 'string', description: 'Filter expression to narrow results', required: false },
  { name: 'timeout_ms', type: 'number', description: 'Request timeout in milliseconds', required: false },
  { name: 'verbose', type: 'boolean', description: 'Include detailed metadata in the response', required: false },
  { name: 'dry_run', type: 'boolean', description: 'Validate parameters without executing the operation', required: false },
  { name: 'locale', type: 'string', description: 'Locale code for localized results (e.g. en-US, de-DE)', required: false },
];

// ============================================================
// Domain Definitions (10 domains, each with tools)
// ============================================================

interface DomainDef {
  name: string;
  prefix: string;
  tools: Array<{
    baseName: string;
    description: string;
    params: ParamTemplate[];
    crossDomain?: boolean;
  }>;
}

const DOMAINS: DomainDef[] = [
  // 1. Finance
  {
    name: 'finance',
    prefix: 'fin',
    tools: [
      {
        baseName: 'get_stock_price',
        description: 'Retrieve the current stock price and market data for a given ticker symbol.',
        params: [
          { name: 'ticker', type: 'string', description: 'Stock ticker symbol (e.g. AAPL, MSFT)', required: true },
          { name: 'exchange', type: 'string', description: 'Stock exchange to query', required: false, enum: ['NYSE', 'NASDAQ', 'LSE', 'TSE'] },
          { name: 'include_history', type: 'boolean', description: 'Include price history for the last 30 days', required: false },
        ],
      },
      {
        baseName: 'convert_currency',
        description: 'Convert an amount between two currencies using live exchange rates.',
        params: [
          { name: 'amount', type: 'number', description: 'The monetary amount to convert', required: true },
          { name: 'from', type: 'string', description: 'Source currency ISO code (e.g. USD, EUR)', required: true },
          { name: 'to', type: 'string', description: 'Target currency ISO code', required: true },
        ],
        crossDomain: true,
      },
      {
        baseName: 'create_invoice',
        description: 'Create a new invoice with line items, tax calculation, and payment terms.',
        params: [
          { name: 'customer_id', type: 'string', description: 'Customer account identifier', required: true },
          { name: 'items', type: 'array', description: 'Line items with description, quantity, and unit price', required: true },
          { name: 'currency', type: 'string', description: 'Invoice currency code', required: false },
          { name: 'due_days', type: 'number', description: 'Payment due in N days from issue date', required: false },
        ],
      },
      {
        baseName: 'get_account_balance',
        description: 'Retrieve the current balance and recent transactions for a financial account.',
        params: [
          { name: 'account_id', type: 'string', description: 'Account identifier or IBAN', required: true },
          { name: 'include_pending', type: 'boolean', description: 'Include pending transactions', required: false },
        ],
      },
      {
        baseName: 'process_payment',
        description: 'Process a payment transaction between accounts or via payment gateway.',
        params: [
          { name: 'amount', type: 'number', description: 'Payment amount', required: true },
          { name: 'currency', type: 'string', description: 'Payment currency code', required: true },
          { name: 'recipient', type: 'string', description: 'Recipient account or email address', required: true },
          { name: 'method', type: 'string', description: 'Payment method', required: false, enum: ['bank_transfer', 'credit_card', 'paypal', 'crypto'] },
          { name: 'reference', type: 'string', description: 'Payment reference or memo', required: false },
        ],
      },
    ],
  },

  // 2. Weather
  {
    name: 'weather',
    prefix: 'wx',
    tools: [
      {
        baseName: 'get_current',
        description: 'Get current weather conditions for a location including temperature, humidity, and wind.',
        params: [
          { name: 'location', type: 'string', description: 'City name, ZIP code, or lat,lon coordinates', required: true },
          { name: 'units', type: 'string', description: 'Unit system for measurements', required: false, enum: ['metric', 'imperial'] },
        ],
      },
      {
        baseName: 'get_forecast',
        description: 'Get weather forecast for a location for the next 1-14 days.',
        params: [
          { name: 'location', type: 'string', description: 'City name, ZIP code, or lat,lon coordinates', required: true },
          { name: 'days', type: 'number', description: 'Number of forecast days (1-14)', required: false },
          { name: 'units', type: 'string', description: 'Unit system', required: false, enum: ['metric', 'imperial'] },
          { name: 'include_hourly', type: 'boolean', description: 'Include hourly breakdown', required: false },
        ],
      },
      {
        baseName: 'get_alerts',
        description: 'Get active weather alerts and warnings for a geographic region.',
        params: [
          { name: 'location', type: 'string', description: 'Location or region to check for alerts', required: true },
          { name: 'severity', type: 'string', description: 'Minimum severity level to include', required: false, enum: ['advisory', 'watch', 'warning', 'extreme'] },
        ],
      },
      {
        baseName: 'get_air_quality',
        description: 'Get air quality index and pollutant levels for a location.',
        params: [
          { name: 'location', type: 'string', description: 'City name or coordinates', required: true },
          { name: 'include_pollutants', type: 'boolean', description: 'Include individual pollutant readings', required: false },
        ],
        crossDomain: true,
      },
    ],
  },

  // 3. Ecommerce
  {
    name: 'ecommerce',
    prefix: 'shop',
    tools: [
      {
        baseName: 'search_products',
        description: 'Search the product catalog with filters for category, price range, and ratings.',
        params: [
          { name: 'query', type: 'string', description: 'Search query string', required: true },
          { name: 'category', type: 'string', description: 'Product category to filter by', required: false },
          { name: 'min_price', type: 'number', description: 'Minimum price filter', required: false },
          { name: 'max_price', type: 'number', description: 'Maximum price filter', required: false },
          { name: 'min_rating', type: 'number', description: 'Minimum customer rating (1-5)', required: false },
        ],
      },
      {
        baseName: 'add_to_cart',
        description: 'Add a product to the shopping cart with specified quantity.',
        params: [
          { name: 'product_id', type: 'string', description: 'Product identifier', required: true },
          { name: 'quantity', type: 'number', description: 'Number of items to add', required: true },
          { name: 'variant_id', type: 'string', description: 'Specific product variant (size, color)', required: false },
        ],
      },
      {
        baseName: 'checkout',
        description: 'Initiate checkout process for the current cart with shipping and payment details.',
        params: [
          { name: 'shipping_address', type: 'string', description: 'Full shipping address', required: true },
          { name: 'payment_method', type: 'string', description: 'Payment method to charge', required: true, enum: ['credit_card', 'paypal', 'bank_transfer', 'apple_pay'] },
          { name: 'coupon_code', type: 'string', description: 'Discount coupon code to apply', required: false },
        ],
        crossDomain: true,
      },
      {
        baseName: 'track_order',
        description: 'Get real-time tracking information for a placed order.',
        params: [
          { name: 'order_id', type: 'string', description: 'Order identifier', required: true },
          { name: 'include_history', type: 'boolean', description: 'Include full tracking event history', required: false },
        ],
      },
      {
        baseName: 'get_product_reviews',
        description: 'Retrieve customer reviews and ratings for a specific product.',
        params: [
          { name: 'product_id', type: 'string', description: 'Product identifier', required: true },
          { name: 'rating_filter', type: 'number', description: 'Filter by specific star rating (1-5)', required: false },
          { name: 'sort', type: 'string', description: 'Sort reviews by criteria', required: false, enum: ['newest', 'oldest', 'highest', 'lowest', 'most_helpful'] },
        ],
      },
    ],
  },

  // 4. DevOps
  {
    name: 'devops',
    prefix: 'ops',
    tools: [
      {
        baseName: 'deploy_service',
        description: 'Deploy a service to the specified environment with rollback capability.',
        params: [
          { name: 'service', type: 'string', description: 'Service name to deploy', required: true },
          { name: 'environment', type: 'string', description: 'Target deployment environment', required: true, enum: ['staging', 'production', 'canary'] },
          { name: 'version', type: 'string', description: 'Version tag or commit SHA to deploy', required: true },
          { name: 'strategy', type: 'string', description: 'Deployment strategy', required: false, enum: ['rolling', 'blue-green', 'canary'] },
        ],
      },
      {
        baseName: 'get_metrics',
        description: 'Query service metrics (CPU, memory, latency, error rate) for a time window.',
        params: [
          { name: 'service', type: 'string', description: 'Service name to query metrics for', required: true },
          { name: 'metric', type: 'string', description: 'Metric type to retrieve', required: true, enum: ['cpu', 'memory', 'latency_p50', 'latency_p99', 'error_rate', 'requests_per_sec'] },
          { name: 'window', type: 'string', description: 'Time window (e.g. 1h, 6h, 24h, 7d)', required: false },
        ],
        crossDomain: true,
      },
      {
        baseName: 'scale_service',
        description: 'Scale a service up or down by adjusting the number of replicas.',
        params: [
          { name: 'service', type: 'string', description: 'Service name to scale', required: true },
          { name: 'replicas', type: 'number', description: 'Target number of replicas', required: true },
          { name: 'environment', type: 'string', description: 'Target environment', required: true, enum: ['staging', 'production'] },
        ],
      },
      {
        baseName: 'get_logs',
        description: 'Retrieve recent log entries for a service with optional log level filtering.',
        params: [
          { name: 'service', type: 'string', description: 'Service name', required: true },
          { name: 'level', type: 'string', description: 'Minimum log level to include', required: false, enum: ['debug', 'info', 'warn', 'error', 'fatal'] },
          { name: 'since', type: 'string', description: 'Start time in ISO 8601 format', required: false },
          { name: 'tail', type: 'number', description: 'Number of most recent lines to return', required: false },
        ],
      },
      {
        baseName: 'create_alert',
        description: 'Create a monitoring alert rule for a service metric threshold.',
        params: [
          { name: 'service', type: 'string', description: 'Service name to monitor', required: true },
          { name: 'metric', type: 'string', description: 'Metric to watch', required: true },
          { name: 'threshold', type: 'number', description: 'Threshold value to trigger the alert', required: true },
          { name: 'channel', type: 'string', description: 'Notification channel', required: true, enum: ['slack', 'email', 'pagerduty', 'webhook'] },
        ],
      },
    ],
  },

  // 5. Communication
  {
    name: 'communication',
    prefix: 'comm',
    tools: [
      {
        baseName: 'send_message',
        description: 'Send a text message to a user or channel via the messaging platform.',
        params: [
          { name: 'recipient', type: 'string', description: 'User ID, email, or channel name', required: true },
          { name: 'message', type: 'string', description: 'Message content (supports Markdown)', required: true },
          { name: 'thread_id', type: 'string', description: 'Thread ID for threaded replies', required: false },
          { name: 'priority', type: 'string', description: 'Message priority', required: false, enum: ['normal', 'high', 'urgent'] },
        ],
        crossDomain: true,
      },
      {
        baseName: 'send_email',
        description: 'Send an email with optional attachments and HTML formatting.',
        params: [
          { name: 'to', type: 'string', description: 'Recipient email address', required: true },
          { name: 'subject', type: 'string', description: 'Email subject line', required: true },
          { name: 'body', type: 'string', description: 'Email body content (plain text or HTML)', required: true },
          { name: 'cc', type: 'string', description: 'CC recipient addresses (comma-separated)', required: false },
          { name: 'attachments', type: 'array', description: 'File paths to attach', required: false },
        ],
        crossDomain: true,
      },
      {
        baseName: 'create_channel',
        description: 'Create a new messaging channel for team collaboration.',
        params: [
          { name: 'name', type: 'string', description: 'Channel name', required: true },
          { name: 'description', type: 'string', description: 'Channel purpose description', required: false },
          { name: 'private', type: 'boolean', description: 'Create as private channel', required: false },
          { name: 'members', type: 'array', description: 'Initial member user IDs to invite', required: false },
        ],
      },
      {
        baseName: 'schedule_meeting',
        description: 'Schedule a video meeting with participants and an agenda.',
        params: [
          { name: 'title', type: 'string', description: 'Meeting title', required: true },
          { name: 'start_time', type: 'string', description: 'Meeting start time in ISO 8601 format', required: true },
          { name: 'duration_minutes', type: 'number', description: 'Meeting duration in minutes', required: true },
          { name: 'participants', type: 'array', description: 'Email addresses of participants', required: true },
          { name: 'agenda', type: 'string', description: 'Meeting agenda text', required: false },
        ],
        crossDomain: true,
      },
    ],
  },

  // 6. Calendar
  {
    name: 'calendar',
    prefix: 'cal',
    tools: [
      {
        baseName: 'create_event',
        description: 'Create a calendar event with time, location, and attendee information.',
        params: [
          { name: 'title', type: 'string', description: 'Event title', required: true },
          { name: 'start', type: 'string', description: 'Start datetime in ISO 8601 format', required: true },
          { name: 'end', type: 'string', description: 'End datetime in ISO 8601 format', required: true },
          { name: 'location', type: 'string', description: 'Event location or meeting URL', required: false },
          { name: 'attendees', type: 'array', description: 'Attendee email addresses', required: false },
        ],
      },
      {
        baseName: 'list_events',
        description: 'List calendar events within a date range with optional filtering.',
        params: [
          { name: 'start_date', type: 'string', description: 'Start of date range (YYYY-MM-DD)', required: true },
          { name: 'end_date', type: 'string', description: 'End of date range (YYYY-MM-DD)', required: true },
          { name: 'calendar_id', type: 'string', description: 'Specific calendar to query', required: false },
        ],
      },
      {
        baseName: 'update_event',
        description: 'Update an existing calendar event fields (title, time, location, attendees).',
        params: [
          { name: 'event_id', type: 'string', description: 'Calendar event identifier', required: true },
          { name: 'title', type: 'string', description: 'Updated event title', required: false },
          { name: 'start', type: 'string', description: 'Updated start datetime', required: false },
          { name: 'end', type: 'string', description: 'Updated end datetime', required: false },
        ],
      },
      {
        baseName: 'delete_event',
        description: 'Delete a calendar event by its identifier with optional notification to attendees.',
        params: [
          { name: 'event_id', type: 'string', description: 'Calendar event identifier to delete', required: true },
          { name: 'notify_attendees', type: 'boolean', description: 'Send cancellation notice to attendees', required: false },
        ],
      },
      {
        baseName: 'find_free_time',
        description: 'Find available time slots across one or more calendars for scheduling.',
        params: [
          { name: 'participants', type: 'array', description: 'Email addresses to check availability for', required: true },
          { name: 'duration_minutes', type: 'number', description: 'Required meeting duration in minutes', required: true },
          { name: 'start_date', type: 'string', description: 'Earliest date to search from', required: true },
          { name: 'end_date', type: 'string', description: 'Latest date to search to', required: true },
        ],
        crossDomain: true,
      },
    ],
  },

  // 7. Storage
  {
    name: 'storage',
    prefix: 'store',
    tools: [
      {
        baseName: 'upload_file',
        description: 'Upload a file to cloud storage with optional metadata tags.',
        params: [
          { name: 'path', type: 'string', description: 'Local file path to upload', required: true },
          { name: 'destination', type: 'string', description: 'Cloud storage destination path', required: true },
          { name: 'bucket', type: 'string', description: 'Storage bucket name', required: false },
          { name: 'tags', type: 'object', description: 'Key-value metadata tags for the file', required: false },
        ],
      },
      {
        baseName: 'download_file',
        description: 'Download a file from cloud storage to the local filesystem.',
        params: [
          { name: 'source', type: 'string', description: 'Cloud storage file path', required: true },
          { name: 'destination', type: 'string', description: 'Local filesystem destination path', required: true },
          { name: 'bucket', type: 'string', description: 'Storage bucket name', required: false },
        ],
      },
      {
        baseName: 'list_files',
        description: 'List files in a cloud storage directory with optional prefix filtering.',
        params: [
          { name: 'prefix', type: 'string', description: 'Path prefix to filter files', required: false },
          { name: 'bucket', type: 'string', description: 'Storage bucket name', required: false },
          { name: 'max_results', type: 'number', description: 'Maximum number of files to return', required: false },
        ],
        crossDomain: true,
      },
      {
        baseName: 'delete_file',
        description: 'Delete a file from cloud storage permanently.',
        params: [
          { name: 'path', type: 'string', description: 'Cloud storage file path to delete', required: true },
          { name: 'bucket', type: 'string', description: 'Storage bucket name', required: false },
        ],
      },
      {
        baseName: 'generate_signed_url',
        description: 'Generate a pre-signed URL for temporary access to a private storage object.',
        params: [
          { name: 'path', type: 'string', description: 'Cloud storage file path', required: true },
          { name: 'expiry_seconds', type: 'number', description: 'URL expiration time in seconds', required: false },
          { name: 'method', type: 'string', description: 'HTTP method the URL should allow', required: false, enum: ['GET', 'PUT'] },
        ],
      },
    ],
  },

  // 8. Analytics
  {
    name: 'analytics',
    prefix: 'analytics',
    tools: [
      {
        baseName: 'query_metrics',
        description: 'Query time-series metrics with aggregation and grouping options.',
        params: [
          { name: 'metric', type: 'string', description: 'Metric name to query', required: true },
          { name: 'start_time', type: 'string', description: 'Query start time in ISO 8601 format', required: true },
          { name: 'end_time', type: 'string', description: 'Query end time in ISO 8601 format', required: true },
          { name: 'aggregation', type: 'string', description: 'Aggregation function', required: false, enum: ['sum', 'avg', 'min', 'max', 'count', 'p50', 'p95', 'p99'] },
          { name: 'group_by', type: 'string', description: 'Field to group results by', required: false },
        ],
      },
      {
        baseName: 'create_dashboard',
        description: 'Create a new analytics dashboard with specified chart widgets.',
        params: [
          { name: 'name', type: 'string', description: 'Dashboard name', required: true },
          { name: 'widgets', type: 'array', description: 'Array of widget configurations', required: true },
          { name: 'shared', type: 'boolean', description: 'Make dashboard accessible to the team', required: false },
        ],
      },
      {
        baseName: 'run_report',
        description: 'Run a pre-defined analytics report and return formatted results.',
        params: [
          { name: 'report_id', type: 'string', description: 'Report template identifier', required: true },
          { name: 'date_range', type: 'string', description: 'Date range for the report (e.g. last_7d, last_30d, custom)', required: false },
          { name: 'filters', type: 'object', description: 'Report-specific filter parameters', required: false },
        ],
        crossDomain: true,
      },
      {
        baseName: 'track_event',
        description: 'Record a custom analytics event with associated properties.',
        params: [
          { name: 'event_name', type: 'string', description: 'Name of the event to track', required: true },
          { name: 'properties', type: 'object', description: 'Key-value properties associated with the event', required: false },
          { name: 'user_id', type: 'string', description: 'User identifier for attribution', required: false },
        ],
      },
    ],
  },

  // 9. Auth
  {
    name: 'auth',
    prefix: 'auth',
    tools: [
      {
        baseName: 'create_user',
        description: 'Create a new user account with email, name, and role assignment.',
        params: [
          { name: 'email', type: 'string', description: 'User email address', required: true },
          { name: 'name', type: 'string', description: 'User display name', required: true },
          { name: 'role', type: 'string', description: 'User role assignment', required: false, enum: ['admin', 'editor', 'viewer', 'guest'] },
          { name: 'password', type: 'string', description: 'Initial password (will be hashed)', required: false },
        ],
      },
      {
        baseName: 'verify_token',
        description: 'Verify and decode a JWT or API token, returning the embedded claims.',
        params: [
          { name: 'token', type: 'string', description: 'The JWT or API token to verify', required: true },
          { name: 'audience', type: 'string', description: 'Expected audience claim', required: false },
        ],
      },
      {
        baseName: 'list_users',
        description: 'List all user accounts with optional filtering by role and status.',
        params: [
          { name: 'role', type: 'string', description: 'Filter by role', required: false, enum: ['admin', 'editor', 'viewer', 'guest'] },
          { name: 'status', type: 'string', description: 'Filter by account status', required: false, enum: ['active', 'suspended', 'pending'] },
          { name: 'search', type: 'string', description: 'Search by name or email', required: false },
        ],
        crossDomain: true,
      },
      {
        baseName: 'update_permissions',
        description: 'Update role-based permissions for a user or group.',
        params: [
          { name: 'user_id', type: 'string', description: 'User identifier', required: true },
          { name: 'role', type: 'string', description: 'New role to assign', required: true, enum: ['admin', 'editor', 'viewer', 'guest'] },
          { name: 'resources', type: 'array', description: 'Specific resource scopes to grant access to', required: false },
        ],
      },
      {
        baseName: 'revoke_token',
        description: 'Revoke an active access or refresh token to terminate a session.',
        params: [
          { name: 'token', type: 'string', description: 'The token to revoke', required: true },
          { name: 'revoke_all', type: 'boolean', description: 'Revoke all tokens for the associated user', required: false },
        ],
      },
    ],
  },

  // 10. Media
  {
    name: 'media',
    prefix: 'media',
    tools: [
      {
        baseName: 'transcode_video',
        description: 'Transcode a video file to a different format, resolution, or bitrate.',
        params: [
          { name: 'input_path', type: 'string', description: 'Path to the input video file', required: true },
          { name: 'output_format', type: 'string', description: 'Target video format', required: true, enum: ['mp4', 'webm', 'avi', 'mkv'] },
          { name: 'resolution', type: 'string', description: 'Target resolution', required: false, enum: ['480p', '720p', '1080p', '4k'] },
          { name: 'bitrate', type: 'string', description: 'Target bitrate (e.g. 2M, 5M)', required: false },
        ],
      },
      {
        baseName: 'resize_image',
        description: 'Resize an image to specified dimensions while preserving aspect ratio.',
        params: [
          { name: 'input_path', type: 'string', description: 'Path to the input image', required: true },
          { name: 'width', type: 'number', description: 'Target width in pixels', required: true },
          { name: 'height', type: 'number', description: 'Target height in pixels', required: false },
          { name: 'quality', type: 'number', description: 'Output quality (1-100)', required: false },
        ],
      },
      {
        baseName: 'extract_audio',
        description: 'Extract the audio track from a video file into a standalone audio file.',
        params: [
          { name: 'input_path', type: 'string', description: 'Path to the video file', required: true },
          { name: 'output_format', type: 'string', description: 'Audio output format', required: false, enum: ['mp3', 'wav', 'aac', 'flac'] },
        ],
      },
      {
        baseName: 'generate_thumbnail',
        description: 'Generate a thumbnail image from a video at a specified timestamp.',
        params: [
          { name: 'input_path', type: 'string', description: 'Path to the video file', required: true },
          { name: 'timestamp', type: 'string', description: 'Timestamp to capture (HH:MM:SS format)', required: false },
          { name: 'width', type: 'number', description: 'Thumbnail width in pixels', required: false },
        ],
        crossDomain: true,
      },
      {
        baseName: 'text_to_speech',
        description: 'Convert text into spoken audio using neural text-to-speech synthesis.',
        params: [
          { name: 'text', type: 'string', description: 'Text to convert to speech', required: true },
          { name: 'voice', type: 'string', description: 'Voice selection', required: false, enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] },
          { name: 'language', type: 'string', description: 'Language code (e.g. en-US, de-DE)', required: false },
        ],
        crossDomain: true,
      },
    ],
  },
];

// ============================================================
// Tool Builder
// ============================================================

function buildToolDefinition(
  domain: DomainDef,
  toolDef: DomainDef['tools'][number],
  rng: () => number,
): ToolDefinition {
  const fullName = `${domain.prefix}_${toolDef.baseName}`;

  // Build parameters, potentially adding 0-1 common params for variety
  const properties: Record<string, JSONSchemaProperty> = {};
  const required: string[] = [];

  for (const p of toolDef.params) {
    const prop: JSONSchemaProperty = {
      type: p.type,
      description: p.description,
    };
    if (p.enum) prop.enum = p.enum;
    properties[p.name] = prop;
    if (p.required) required.push(p.name);
  }

  // ~40% chance to add one common parameter for natural variation
  if (rng() < 0.4 && COMMON_PARAMS.length > 0) {
    const extra = COMMON_PARAMS[Math.floor(rng() * COMMON_PARAMS.length)];
    if (!properties[extra.name]) {
      const prop: JSONSchemaProperty = {
        type: extra.type,
        description: extra.description,
      };
      if (extra.enum) prop.enum = extra.enum;
      properties[extra.name] = prop;
      // Common params are always optional
    }
  }

  return {
    type: 'function',
    function: {
      name: fullName,
      description: toolDef.description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  };
}

// ============================================================
// Public API
// ============================================================

/** Standard catalog sizes supported by the synthetic generator */
export const CATALOG_SIZES = [3, 5, 10, 15, 20, 30, 50, 75, 100] as const;
export type CatalogSize = (typeof CATALOG_SIZES)[number];

/**
 * Generate a synthetic tool catalog of the specified size.
 *
 * The catalog is deterministic: same (size, seed) always produces the same tools.
 * Tools are drawn from 10 domains with ~30% cross-domain overlap.
 *
 * @param size   Number of tools to generate (one of CATALOG_SIZES, or any positive integer)
 * @param seed   PRNG seed for reproducibility (default: 42)
 * @returns      A SchemaCollection containing the generated tools
 */
export function generateSyntheticCatalog(
  size: number,
  seed: number = 42,
): SchemaCollection {
  const rng = mulberry32(seed);

  // Build all possible tools across all domains
  const allToolEntries: Array<{
    domain: DomainDef;
    toolDef: DomainDef['tools'][number];
  }> = [];

  for (const domain of DOMAINS) {
    for (const toolDef of domain.tools) {
      allToolEntries.push({ domain, toolDef });
    }
  }

  const poolSize = allToolEntries.length; // 47 base tools

  // Shuffle the base pool
  const shuffled = shuffle(allToolEntries, rng);

  // If size <= poolSize, just pick from the shuffled pool
  // If size > poolSize, create variant tools with numeric suffixes
  // (e.g., fin_get_stock_price_v2, fin_get_stock_price_v3)
  const selected: Array<{
    domain: DomainDef;
    toolDef: DomainDef['tools'][number];
    variant: number;
  }> = [];

  let remaining = size;
  let variantRound = 0;

  while (remaining > 0) {
    const batch = variantRound === 0
      ? shuffled.slice(0, Math.min(remaining, poolSize))
      : shuffle(allToolEntries, rng).slice(0, Math.min(remaining, poolSize));

    for (const entry of batch) {
      if (remaining <= 0) break;
      selected.push({ ...entry, variant: variantRound });
      remaining--;
    }
    variantRound++;
  }

  // Build ToolDefinition objects, appending _v{N} suffix for variants
  const tools: ToolDefinition[] = selected.map((entry) => {
    const baseTool = buildToolDefinition(entry.domain, entry.toolDef, rng);
    if (entry.variant === 0) return baseTool;

    // Create variant: append version suffix to name and tweak description
    const suffix = `_v${entry.variant + 1}`;
    return {
      type: 'function' as const,
      function: {
        name: baseTool.function.name + suffix,
        description: baseTool.function.description + ` (variant ${entry.variant + 1})`,
        parameters: baseTool.function.parameters,
      },
    };
  });

  // Compute cross-domain overlap count
  const crossDomainCount = selected.filter(
    (e) => e.toolDef.crossDomain === true,
  ).length;

  // Collect which domains are represented
  const domainNames = [...new Set(selected.map((e) => e.domain.name))];

  return {
    id: `synthetic-${size}`,
    name: `Synthetic ${size}-Tool Catalog`,
    scenario: 'C',
    source: 'synthetic',
    tools,
    metadata: {
      targetSize: size,
      actualSize: tools.length,
      seed,
      domains: domainNames,
      crossDomainTools: crossDomainCount,
      crossDomainRatio: size > 0 ? crossDomainCount / size : 0,
      variantRounds: variantRound,
    },
  };
}

/**
 * Generate all standard-sized synthetic catalogs (3 through 100).
 * Each catalog uses the same seed for reproducibility.
 */
export function generateAllSyntheticCatalogs(
  seed: number = 42,
): SchemaCollection[] {
  return CATALOG_SIZES.map((size) => generateSyntheticCatalog(size, seed));
}

/**
 * Get the total number of unique tools across all 10 domains.
 * Useful for understanding the maximum possible catalog size.
 */
export function getTotalSyntheticToolCount(): number {
  return DOMAINS.reduce((sum, d) => sum + d.tools.length, 0);
}
