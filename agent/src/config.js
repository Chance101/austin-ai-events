import 'dotenv/config';

export const config = {
  // API Keys
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  serpApiKey: process.env.SERPAPI_API_KEY,

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,

  // Claude models — multi-model architecture
  // fast:      cheap, high-volume tasks (validation, classification, dedup)
  // standard:  moderate reasoning (source evaluation, image analysis)
  // strategic: complex reasoning (monitor evaluation, system-level decisions)
  models: {
    fast: 'claude-haiku-4-5-20251001',
    standard: 'claude-sonnet-4-6',
    strategic: 'claude-opus-4-6',
  },

  // Backward compat alias (used by any code not yet migrated)
  claudeModel: 'claude-sonnet-4-6',

  // Known Austin AI community sources
  // scrapeDays: days of week to scrape (0=Sun, 1=Mon, ..., 6=Sat)
  // High-update sources: 3x/week (Mon/Wed/Fri)
  // Medium-update sources: 2x/week
  // Low-update sources: 1x/week
  sources: [
    // --- High-update: 3x/week (Mon, Wed, Fri) ---
    {
      id: 'aitx',
      name: 'AITX',
      url: 'https://luma.com/aitx',
      type: 'luma',
      scrapeDays: [1, 3, 5],  // Community calendar, multiple organizers
    },
    {
      id: 'austin-ai',
      name: 'Austin AI Alliance',
      url: 'https://austin-ai.org/events/',
      type: 'austinai',
      scrapeDays: [1, 3, 5],  // Aggregator, cross-lists community events
    },
    {
      id: 'capital-factory',
      name: 'Capital Factory',
      url: 'https://info.capitalfactory.com/ic-events',
      type: 'capitalfactory',
      scrapeDays: [1, 3, 5],  // Busy venue, frequent events
    },

    // --- Medium-update: 2x/week ---
    // NOTE: HackAI removed — they moved from Meetup to individual Lu.ma event pages
    // with no centralized calendar. Their events are discovered via web search and
    // cross-listed on Austin AI Alliance.
    {
      id: 'aicamp',
      name: 'AICamp',
      url: 'https://www.aicamp.ai/event/eventsquery?city=US-Austin',
      type: 'aicamp',
      scrapeDays: [2, 4],  // Monthly meetups
    },
    {
      id: 'austin-langchain',
      name: 'Austin LangChain',
      url: 'https://www.meetup.com/austin-langchain-ai-group/events/',
      type: 'meetup',
      scrapeDays: [2, 6],  // Monthly meetup
    },
    {
      id: 'ai-automation',
      name: 'AI Automation & Marketing',
      url: 'https://www.meetup.com/marketing-automation-ai/events/',
      type: 'meetup',
      scrapeDays: [2, 6],  // Monthly meetup
    },

    // --- Low-update: 1x/week ---
    {
      id: 'ut-austin',
      name: 'UT Austin AI',
      url: 'https://ai.utexas.edu/events',
      type: 'utaustin',
      scrapeDays: [4],  // Academic calendar, slow-changing
    },
    {
      id: 'ai-accelerator',
      name: 'AI Accelerator Institute',
      url: 'https://world.aiacceleratorinstitute.com/location/austin/',
      type: 'aiaccelerator',
      scrapeDays: [4],  // Rare Austin events
    },
    {
      id: 'austin-forum',
      name: 'Austin Forum',
      url: 'https://www.austinforum.org/events',
      type: 'austinforum',
      scrapeDays: [0],  // Rarely has events
    },
    {
      id: 'leaders-in-ai',
      name: 'Leaders in AI Summit',
      url: 'https://www.leadersinaisummit.com/austin',
      type: 'leadersinai',
      scrapeDays: [0],  // Conference, rarely updates
    },
  ],
};

// Validate required config
export function validateConfig() {
  const required = [
    'anthropicApiKey',
    'supabaseUrl',
    'supabaseServiceKey',
  ];

  const missing = required.filter(key => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (!config.serpApiKey) {
    console.warn('Warning: SERPAPI_API_KEY not set. Web search discovery will be disabled.');
  }
}
