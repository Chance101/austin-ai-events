// Evolution Log - Narrative history of agent improvements
// Each entry frames changes as learning/growth, not bug fixes

export interface EvolutionEntry {
  id: string;
  date: string;
  title: string;
  description: string;
  category: 'learning' | 'optimization' | 'capability' | 'foundation';
  commitHash?: string;
}

export const evolutionLog: EvolutionEntry[] = [
  {
    id: 'trust-tiers',
    date: '2026-01-29',
    title: 'Learned to trust reliable sources',
    description: 'The agent now tracks which sources consistently provide valid events. Trusted sources skip validation, reducing API costs by ~50%. New sources start on probation and earn trust through quality.',
    category: 'optimization',
    commitHash: '570328f',
  },
  {
    id: 'image-location',
    date: '2026-01-14',
    title: 'Learned to read event images for venue info',
    description: 'When events are missing venue data, the agent now analyzes event images to extract location information. This fills in gaps that text scraping misses.',
    category: 'capability',
    commitHash: '6346226',
  },
  {
    id: 'html-entities',
    date: '2026-01-14',
    title: 'Learned to decode special characters',
    description: 'Event titles and descriptions with HTML entities (like &amp; or &apos;) are now properly decoded. No more garbled text.',
    category: 'learning',
    commitHash: '9d85315',
  },
  {
    id: 'sonnet-upgrade',
    date: '2026-01-07',
    title: 'Upgraded to Claude Sonnet 4.5',
    description: 'The agent now uses Claude Sonnet 4.5 for all AI tasks, improving accuracy while balancing cost efficiency.',
    category: 'optimization',
    commitHash: 'ac8519d',
  },
  {
    id: 'end-times',
    date: '2026-01-07',
    title: 'Learned to extract event end times',
    description: 'Some scrapers were missing end times, causing incomplete event displays. The agent now properly extracts end times from web search results and Austin AI events.',
    category: 'learning',
    commitHash: '522c283',
  },
  {
    id: 'timezone-fix',
    date: '2026-01-07',
    title: 'Mastered Austin timezone handling',
    description: 'Events were sometimes showing wrong times due to timezone confusion. The agent now correctly interprets and stores all times in Austin\'s timezone (America/Chicago).',
    category: 'learning',
    commitHash: '4359bec',
  },
  {
    id: 'year-awareness',
    date: '2026-01-05',
    title: 'Became aware of the current year',
    description: 'The agent was using hardcoded years in some prompts and scrapers. It now dynamically uses the current date, preventing future events from being misdated.',
    category: 'learning',
    commitHash: 'b0fe36b',
  },
  {
    id: 'single-event-filter',
    date: '2026-01-05',
    title: 'Learned to filter single-event URLs',
    description: 'Source discovery was sometimes adding individual event URLs instead of event listing pages. The agent now rejects these, keeping the source list clean.',
    category: 'learning',
    commitHash: '4c69b27',
  },
  {
    id: 'feedback-analysis',
    date: '2026-01-04',
    title: 'Gained ability to learn from missed events',
    description: 'When users report events the agent missed, it can now analyze the feedback to generate new search queries and discover new sources.',
    category: 'capability',
    commitHash: 'be1754b',
  },
  {
    id: 'validation-improvements',
    date: '2026-01-03',
    title: 'Improved event validation accuracy',
    description: 'Better extraction of organizer info, location details, and validation logic. Fewer false positives and negatives in event detection.',
    category: 'learning',
    commitHash: '67ada3d',
  },
  {
    id: 'run-logging',
    date: '2026-01-03',
    title: 'Started tracking its own performance',
    description: 'The agent now logs each run with detailed stats: events found, sources scraped, API usage, and errors. This enables the Observatory dashboard.',
    category: 'foundation',
    commitHash: '32e8268',
  },
  {
    id: 'query-prioritization',
    date: '2026-01-03',
    title: 'Learned smart query prioritization',
    description: 'Search queries now have priorities that decay over time. Queries that find new sources get boosted; stale queries get deprioritized. Includes an exploration budget for trying new queries.',
    category: 'optimization',
    commitHash: '7d9c0c9',
  },
  {
    id: 'timezone-dedup',
    date: '2025-12-31',
    title: 'Fixed duplicate detection across timezones',
    description: 'Events posted on multiple platforms with slight timezone differences were being treated as duplicates. The agent now handles these edge cases correctly.',
    category: 'learning',
    commitHash: '3455aeb',
  },
  {
    id: 'event-summaries',
    date: '2025-12-31',
    title: 'Started generating event summaries',
    description: 'Each event now gets an AI-generated summary that captures the key details in a concise format. Also added detection for paid vs free events.',
    category: 'capability',
    commitHash: '2e49b4e',
  },
  {
    id: 'cross-post-dedup',
    date: '2025-12-31',
    title: 'Learned to detect cross-posted events',
    description: 'The same event posted on Meetup and Lu.ma would appear twice. Improved fuzzy matching now catches these duplicates across platforms.',
    category: 'learning',
    commitHash: 'da78d98',
  },
  {
    id: 'autonomous-discovery',
    date: '2025-12-31',
    title: 'Gained autonomous source discovery',
    description: 'The agent can now discover new event sources on its own through web search, evaluate them, and add promising ones to its rotation. This is the core learning loop.',
    category: 'capability',
    commitHash: '08cfa31',
  },
  {
    id: 'initial-sources',
    date: '2025-12-30',
    title: 'Learned to scrape 8 event platforms',
    description: 'Built scrapers for Meetup, Lu.ma, Eventbrite, Austin Forum, AI Accelerator Institute, Austin AI Alliance, Leaders in AI, and general web pages.',
    category: 'foundation',
    commitHash: '765ad89',
  },
  {
    id: 'initial-commit',
    date: '2025-12-30',
    title: 'The agent was born',
    description: 'Initial creation of the Austin AI Events discovery agent. Started with basic event scraping and Claude-powered validation.',
    category: 'foundation',
    commitHash: '3a19903',
  },
];
