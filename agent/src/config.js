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
  sources: [
    // Lu.ma calendars
    {
      id: 'aitx',
      name: 'AITX',
      url: 'https://luma.com/aitx',
      type: 'luma',
    },
    // Meetup groups
    // NOTE: HackAI removed — they moved from Meetup to individual Lu.ma event pages
    // with no centralized calendar. Their events are discovered via web search and
    // cross-listed on Austin AI Alliance.
    {
      id: 'austin-langchain',
      name: 'Austin LangChain',
      url: 'https://www.meetup.com/austin-langchain-ai-group/events/',
      type: 'meetup',
    },
    {
      id: 'ai-automation',
      name: 'AI Automation & Marketing',
      url: 'https://www.meetup.com/marketing-automation-ai/events/',
      type: 'meetup',
    },
    // Austin Forum on Technology & Society
    {
      id: 'austin-forum',
      name: 'Austin Forum',
      url: 'https://www.austinforum.org/events',
      type: 'austinforum',
    },
    // AI Accelerator Institute
    {
      id: 'ai-accelerator',
      name: 'AI Accelerator Institute',
      url: 'https://world.aiacceleratorinstitute.com/location/austin/',
      type: 'aiaccelerator',
    },
    // Austin AI Alliance
    {
      id: 'austin-ai',
      name: 'Austin AI Alliance',
      url: 'https://austin-ai.org/events/',
      type: 'austinai',
    },
    // Leaders in AI Summit
    {
      id: 'leaders-in-ai',
      name: 'Leaders in AI Summit',
      url: 'https://www.leadersinaisummit.com/austin',
      type: 'leadersinai',
    },
    // AICamp - Austin-filtered listing (server-rendered, unlike the global page)
    {
      id: 'aicamp',
      name: 'AICamp',
      url: 'https://www.aicamp.ai/event/eventsquery?city=US-Austin',
      type: 'aicamp',
    },
    // Capital Factory - Austin tech hub (own events + Lu.ma events at CF venue)
    {
      id: 'capital-factory',
      name: 'Capital Factory',
      url: 'https://info.capitalfactory.com/ic-events',
      type: 'capitalfactory',
    },
    // UT Austin AI - university research events
    {
      id: 'ut-austin',
      name: 'UT Austin AI',
      url: 'https://ai.utexas.edu/events',
      type: 'utaustin',
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
