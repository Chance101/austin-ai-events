import 'dotenv/config';

export const config = {
  // API Keys
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  serpApiKey: process.env.SERPAPI_API_KEY,

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,

  // Claude model for reasoning
  claudeModel: 'claude-sonnet-4-20250514',

  // Known Austin AI community sources
  sources: [
    // Lu.ma calendars
    {
      id: 'aitx',
      name: 'AITX',
      url: 'https://lu.ma/aitx',
      type: 'luma',
    },
    // Meetup groups
    {
      id: 'hackai',
      name: 'HackAI',
      url: 'https://www.meetup.com/hack-ai/events/',
      type: 'meetup',
    },
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
    // Disabled for now - need custom scrapers
    // {
    //   id: 'aicamp',
    //   name: 'AICamp',
    //   url: 'https://www.aicamp.ai/event/eventlist?city=Austin',
    //   type: 'api',
    // },
    // {
    //   id: 'capital-factory',
    //   name: 'Capital Factory',
    //   url: 'https://www.capitalfactory.com/events/',
    //   type: 'scrape',
    // },
    // {
    //   id: 'ut-austin',
    //   name: 'UT Austin AI',
    //   url: 'https://ai.utexas.edu/events',
    //   type: 'scrape',
    // },
  ],

  // Web search queries for discovering new events
  // Disabled for initial testing - enable later
  searchQueries: [
    // 'Austin AI meetup events',
    // 'Austin machine learning events',
    // 'Austin LLM workshop',
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
