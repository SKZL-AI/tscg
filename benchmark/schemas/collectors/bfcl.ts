/**
 * TAB Schema Collector — BFCL (Berkeley Function Calling Leaderboard) Integration
 *
 * Provides 15 representative BFCL-style function definitions covering
 * three BFCL evaluation categories:
 *   - simple_function    (5 tools): Single function, clear intent
 *   - multiple_function  (5 tools): Multiple functions needed in sequence
 *   - relevance_detection (5 tools): Distractors mixed with relevant tools
 *
 * These serve as Scenario D in the TAB benchmark, enabling comparison
 * with the established BFCL evaluation methodology.
 *
 * All schemas are self-contained — no external API calls or BFCL dataset
 * downloads required. The definitions are modeled after real BFCL patterns
 * but are original creations for the TAB benchmark.
 */

import type { ToolDefinition, JSONSchemaProperty } from '../../../packages/core/src/types.js';
import type { SchemaCollection } from '../types.js';

// ============================================================
// Helper
// ============================================================

function bfclTool(
  name: string,
  description: string,
  properties: Record<string, JSONSchemaProperty>,
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
// BFCL Category: simple_function (5 tools)
// Single function calls with clear parameter mapping.
// ============================================================

const SIMPLE_FUNCTION_TOOLS: ToolDefinition[] = [
  bfclTool(
    'get_weather_forecast',
    'Get the weather forecast for a specific city. Returns temperature, conditions, humidity, and wind speed for the requested number of days.',
    {
      city: { type: 'string', description: 'Name of the city to get the forecast for' },
      days: { type: 'number', description: 'Number of forecast days (1-7)' },
      unit: { type: 'string', description: 'Temperature unit', enum: ['celsius', 'fahrenheit'] },
    },
    ['city', 'days'],
  ),

  bfclTool(
    'search_movies',
    'Search for movies by title, genre, or year of release. Returns a list of matching movies with ratings and synopsis.',
    {
      query: { type: 'string', description: 'Search query (title, keyword, or actor name)' },
      genre: { type: 'string', description: 'Filter by genre', enum: ['action', 'comedy', 'drama', 'horror', 'sci-fi', 'documentary'] },
      year: { type: 'number', description: 'Filter by release year' },
      min_rating: { type: 'number', description: 'Minimum IMDb rating (0-10)' },
    },
    ['query'],
  ),

  bfclTool(
    'calculate_mortgage',
    'Calculate monthly mortgage payment, total interest, and amortization schedule for a home loan.',
    {
      principal: { type: 'number', description: 'Loan principal amount in dollars' },
      annual_rate: { type: 'number', description: 'Annual interest rate as a percentage (e.g. 6.5)' },
      term_years: { type: 'number', description: 'Loan term in years (e.g. 15, 30)' },
      down_payment: { type: 'number', description: 'Down payment amount in dollars' },
    },
    ['principal', 'annual_rate', 'term_years'],
  ),

  bfclTool(
    'translate_text',
    'Translate text from a source language to a target language. Auto-detects source language if not specified.',
    {
      text: { type: 'string', description: 'The text to translate' },
      target_language: { type: 'string', description: 'Target language code (e.g. en, de, fr, ja, zh, es)' },
      source_language: { type: 'string', description: 'Source language code (auto-detected if omitted)' },
      formality: { type: 'string', description: 'Formality level', enum: ['informal', 'formal'] },
    },
    ['text', 'target_language'],
  ),

  bfclTool(
    'lookup_word',
    'Look up a word in the dictionary. Returns definitions, pronunciation, etymology, and usage examples.',
    {
      word: { type: 'string', description: 'The word to look up' },
      language: { type: 'string', description: 'Dictionary language code (default: en)' },
      include_examples: { type: 'boolean', description: 'Include usage examples in the response' },
    },
    ['word'],
  ),
];

// ============================================================
// BFCL Category: multiple_function (5 tools)
// Tools that are typically used in combination for multi-step tasks.
// ============================================================

const MULTIPLE_FUNCTION_TOOLS: ToolDefinition[] = [
  bfclTool(
    'find_restaurants',
    'Search for restaurants by cuisine, location, price range, and rating. Returns a ranked list of matching restaurants.',
    {
      location: { type: 'string', description: 'City or address to search near' },
      cuisine: { type: 'string', description: 'Type of cuisine', enum: ['italian', 'japanese', 'mexican', 'indian', 'french', 'thai', 'chinese', 'american'] },
      price_range: { type: 'string', description: 'Price level', enum: ['$', '$$', '$$$', '$$$$'] },
      min_rating: { type: 'number', description: 'Minimum star rating (1-5)' },
      open_now: { type: 'boolean', description: 'Only show currently open restaurants' },
    },
    ['location'],
  ),

  bfclTool(
    'make_reservation',
    'Make a restaurant reservation for a specific date, time, and party size.',
    {
      restaurant_id: { type: 'string', description: 'Restaurant identifier from search results' },
      date: { type: 'string', description: 'Reservation date in YYYY-MM-DD format' },
      time: { type: 'string', description: 'Reservation time in HH:MM format (24h)' },
      party_size: { type: 'number', description: 'Number of guests' },
      special_requests: { type: 'string', description: 'Special requests or dietary requirements' },
    },
    ['restaurant_id', 'date', 'time', 'party_size'],
  ),

  bfclTool(
    'get_directions',
    'Get directions and estimated travel time between two locations by the specified transport mode.',
    {
      origin: { type: 'string', description: 'Starting address or location' },
      destination: { type: 'string', description: 'Destination address or location' },
      mode: { type: 'string', description: 'Transportation mode', enum: ['driving', 'walking', 'transit', 'cycling'] },
      departure_time: { type: 'string', description: 'Departure time in ISO 8601 format (for traffic estimates)' },
    },
    ['origin', 'destination'],
  ),

  bfclTool(
    'send_notification',
    'Send a push notification to a user device with a title, body, and optional action URL.',
    {
      user_id: { type: 'string', description: 'Target user identifier' },
      title: { type: 'string', description: 'Notification title (max 50 chars)' },
      body: { type: 'string', description: 'Notification body text (max 200 chars)' },
      action_url: { type: 'string', description: 'URL to open when notification is tapped' },
      priority: { type: 'string', description: 'Notification priority', enum: ['low', 'normal', 'high'] },
    },
    ['user_id', 'title', 'body'],
  ),

  bfclTool(
    'add_calendar_event',
    'Add an event to the user calendar with title, datetime, and optional reminders.',
    {
      title: { type: 'string', description: 'Event title' },
      start_datetime: { type: 'string', description: 'Event start in ISO 8601 format' },
      end_datetime: { type: 'string', description: 'Event end in ISO 8601 format' },
      reminder_minutes: { type: 'number', description: 'Minutes before event to send reminder' },
      location: { type: 'string', description: 'Event location' },
    },
    ['title', 'start_datetime', 'end_datetime'],
  ),
];

// ============================================================
// BFCL Category: relevance_detection (5 tools)
// Distractor tools that should NOT be called for certain queries.
// Tests the model's ability to identify irrelevant tools.
// ============================================================

const RELEVANCE_DETECTION_TOOLS: ToolDefinition[] = [
  bfclTool(
    'control_smart_light',
    'Control a smart light bulb — adjust brightness, color temperature, or power state.',
    {
      device_id: { type: 'string', description: 'Smart light device identifier' },
      action: { type: 'string', description: 'Action to perform', enum: ['on', 'off', 'set_brightness', 'set_color'] },
      brightness: { type: 'number', description: 'Brightness level (0-100)' },
      color: { type: 'string', description: 'Color in hex format (e.g. #FF5500)' },
    },
    ['device_id', 'action'],
  ),

  bfclTool(
    'get_stock_price',
    'Get the current stock price, daily change, and volume for a ticker symbol.',
    {
      symbol: { type: 'string', description: 'Stock ticker symbol (e.g. AAPL, GOOGL, TSLA)' },
      include_history: { type: 'boolean', description: 'Include 30-day price history' },
    },
    ['symbol'],
  ),

  bfclTool(
    'order_food_delivery',
    'Place a food delivery order from a restaurant to a specified address.',
    {
      restaurant_id: { type: 'string', description: 'Restaurant identifier' },
      items: { type: 'array', description: 'List of menu items with quantities', items: { type: 'object' } },
      delivery_address: { type: 'string', description: 'Delivery address' },
      tip_percent: { type: 'number', description: 'Tip percentage for the driver' },
    },
    ['restaurant_id', 'items', 'delivery_address'],
  ),

  bfclTool(
    'analyze_sentiment',
    'Analyze the sentiment of a text passage. Returns positive, negative, or neutral classification with confidence scores.',
    {
      text: { type: 'string', description: 'Text to analyze for sentiment' },
      language: { type: 'string', description: 'Language of the text (auto-detected if omitted)' },
      granularity: { type: 'string', description: 'Analysis granularity', enum: ['document', 'sentence'] },
    },
    ['text'],
  ),

  bfclTool(
    'set_thermostat',
    'Set the target temperature and mode for a smart thermostat device.',
    {
      device_id: { type: 'string', description: 'Thermostat device identifier' },
      target_temp: { type: 'number', description: 'Target temperature in the configured unit' },
      mode: { type: 'string', description: 'HVAC mode', enum: ['heat', 'cool', 'auto', 'off'] },
      unit: { type: 'string', description: 'Temperature unit', enum: ['celsius', 'fahrenheit'] },
    },
    ['device_id', 'target_temp', 'mode'],
  ),
];

// ============================================================
// All BFCL Tools
// ============================================================

const ALL_BFCL_TOOLS: ToolDefinition[] = [
  ...SIMPLE_FUNCTION_TOOLS,
  ...MULTIPLE_FUNCTION_TOOLS,
  ...RELEVANCE_DETECTION_TOOLS,
];

/** BFCL category metadata */
export interface BFCLCategory {
  name: string;
  description: string;
  toolCount: number;
  toolNames: string[];
}

export const BFCL_CATEGORIES: BFCLCategory[] = [
  {
    name: 'simple_function',
    description: 'Single function call with clear parameter mapping from user query',
    toolCount: SIMPLE_FUNCTION_TOOLS.length,
    toolNames: SIMPLE_FUNCTION_TOOLS.map((t) => t.function.name),
  },
  {
    name: 'multiple_function',
    description: 'Multi-step tasks requiring sequence of function calls',
    toolCount: MULTIPLE_FUNCTION_TOOLS.length,
    toolNames: MULTIPLE_FUNCTION_TOOLS.map((t) => t.function.name),
  },
  {
    name: 'relevance_detection',
    description: 'Distractor detection — identifying when available tools are irrelevant',
    toolCount: RELEVANCE_DETECTION_TOOLS.length,
    toolNames: RELEVANCE_DETECTION_TOOLS.map((t) => t.function.name),
  },
];

// ============================================================
// Public API
// ============================================================

/**
 * Collect all 15 BFCL-style tool schemas as a SchemaCollection.
 *
 * These tools represent Scenario D in the TAB benchmark,
 * covering the three BFCL evaluation categories:
 * simple_function, multiple_function, and relevance_detection.
 */
export function collectBFCLSchemas(): SchemaCollection {
  return {
    id: 'bfcl',
    name: 'BFCL-Style Function Definitions',
    scenario: 'D',
    source: 'bfcl',
    tools: ALL_BFCL_TOOLS,
    metadata: {
      targetSize: ALL_BFCL_TOOLS.length,
      categories: BFCL_CATEGORIES.map((c) => c.name),
      categoryBreakdown: Object.fromEntries(
        BFCL_CATEGORIES.map((c) => [c.name, c.toolCount]),
      ),
    },
  };
}

/**
 * Get BFCL tools filtered by category.
 */
export function getBFCLToolsByCategory(
  category: 'simple_function' | 'multiple_function' | 'relevance_detection',
): ToolDefinition[] {
  switch (category) {
    case 'simple_function':
      return [...SIMPLE_FUNCTION_TOOLS];
    case 'multiple_function':
      return [...MULTIPLE_FUNCTION_TOOLS];
    case 'relevance_detection':
      return [...RELEVANCE_DETECTION_TOOLS];
  }
}

/**
 * Get all BFCL tools as a flat array.
 */
export function getAllBFCLTools(): ToolDefinition[] {
  return [...ALL_BFCL_TOOLS];
}
