import 'dotenv/config';

// ============================================================================
// READ-ONLY — DO NOT EDIT WITHOUT HUMAN REVIEW
// ============================================================================
// Daily budget ceiling for Anthropic API spend across all phases of a run.
// Checked at start of run (refuse to start if today's cumulative spend already
// exceeds) AND before each Opus/Sonnet call (graceful degrade — skip expensive
// calls, let Haiku work finish since Haiku is trivially cheap).
//
// This is a FLOOR guarantee for cost control. The planner may read this value
// but must never modify it. The autonomous outer loop must never edit this
// constant. Monitor-as-planner is explicitly told about this cap in its
// context so it can plan within budget.
//
// Current baseline (14-day average, 2026-04): ~$0.15-$0.25/day.
// Tight cap prevents "budget absorption" where agents fill any available
// budget with marginal-value work.
export const MAX_DAILY_ANTHROPIC_SPEND_USD = 1.00;
// ============================================================================

// Estimated per-call costs for budget tracking. These are rough — actual
// billing comes from Anthropic — but good enough for in-process enforcement.
export const ESTIMATED_COST_PER_CALL = {
  fast: 0.001,       // Haiku: ~$0.25/M input, ~$1.25/M output, ~500 tokens average
  standard: 0.015,   // Sonnet: higher context + more output for source evaluation
  strategic: 0.10,   // Opus: large context (metrics + reports + plan), 4K output
};

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
      scrapeDays: [4],  // Monthly meetups, 1x/week is sufficient
    },
    {
      id: 'austin-langchain',
      name: 'Austin LangChain',
      url: 'https://www.meetup.com/austin-langchain-ai-group/events/',
      type: 'meetup',
      scrapeDays: [4],  // Monthly meetup, 1x/week
    },
    {
      id: 'ai-automation',
      name: 'AI Automation & Marketing',
      url: 'https://www.meetup.com/marketing-automation-ai/events/',
      type: 'meetup',
      scrapeDays: [4],  // Monthly meetup, 1x/week
    },

    // --- Low-update: 1x/week ---
    {
      id: 'ut-austin',
      name: 'UT Austin AI',
      url: 'https://ai.utexas.edu/events',
      type: 'utaustin',
      scrapeDays: [4],  // Academic calendar, slow-changing
    },
    // AI Accelerator Institute removed — conference marketing site using
    // city pages for SEO. /location/austin/ returns events from San Jose,
    // Washington, etc. 100% rejection rate, 0 Austin events ever accepted.
    {
      id: 'austin-forum',
      name: 'Austin Forum',
      url: 'https://www.austinforum.org/events',
      type: 'austinforum',
      scrapeDays: [4],  // Civic tech, ~2 events/month
    },
    // Leaders in AI Summit removed — annual conference, not a recurring source.
    // Will be discovered via web search if it returns.
  ],
};

/**
 * Multi-tenant event platforms where domain-level matching is too broad.
 * Each URL path on these platforms is a completely independent organizer/calendar.
 * luma.com/aitx and luma.com/ai-tinkerers are as different as two separate websites.
 * Used by: skip_source guardrails, feedback source matching, monitor reasoning.
 */
export const PLATFORM_DOMAINS = [
  'lu.ma',
  'luma.com',
  'meetup.com',
  'eventbrite.com',
  'eventbrite.co.uk',
];

/**
 * Check if a URL is on a known multi-tenant platform.
 */
export function isMultiTenantPlatform(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return PLATFORM_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

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
