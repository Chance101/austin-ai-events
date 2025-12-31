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
    {
      id: 'aicamp',
      name: 'AICamp',
      url: 'https://www.aicamp.ai/event/eventlist?city=Austin',
      type: 'api',
    },
    {
      id: 'aitx',
      name: 'AITX',
      url: 'https://lu.ma/AITX',
      type: 'luma',
    },
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
    {
      id: 'capital-factory',
      name: 'Capital Factory',
      url: 'https://www.capitalfactory.com/events/',
      type: 'scrape',
    },
    {
      id: 'ut-austin',
      name: 'UT Austin AI',
      url: 'https://ai.utexas.edu/events',
      type: 'scrape',
    },
  ],

  // Web search queries for discovering new events
  searchQueries: [
    'Austin AI meetup events',
    'Austin machine learning events',
    'Austin LLM workshop',
    'Austin generative AI conference',
    'Austin tech AI networking',
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
