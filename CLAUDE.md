# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Austin AI Events** is an autonomous AI-powered event discovery and curation system. It discovers upcoming AI-related events in Austin, TX through automated scraping and web search, validates them with Claude, deduplicates them, and presents them on a public calendar (https://austinai.events).

**Tech Stack:**
- Frontend: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- Backend Agent: Node.js 20+ (vanilla JavaScript, ES modules)
- Database: Supabase (PostgreSQL)
- AI: Anthropic Claude API
- Hosting: Vercel (frontend), GitHub Actions (agent)

## Quick Commands

### Frontend Development
```bash
cd frontend
npm install                    # Install dependencies
npm run dev                    # Start dev server (localhost:3000)
npm run build                  # Production build
npm start                      # Run production server
npm run lint                   # Run ESLint
```

### Agent Development
```bash
cd agent
npm install                    # Install dependencies
npm run discover              # Run event discovery once (or: npm start)
npm run test                  # Run tests (Node.js native test runner)
```

### Database
- Supabase schema defined in `supabase/schema.sql`
- Run migrations via Supabase dashboard or CLI
- Service role key required for agent writes

## High-Level Architecture

### Data Flow
1. **Scheduled Trigger**: GitHub Actions runs daily at 6 AM UTC (midnight CST)
2. **Discovery**: Agent scrapes 8 event sources (Meetup, Lu.ma, etc.) and performs web search
3. **Validation**: Each event sent to Claude API for verification (AI-related? Austin-based? Upcoming?)
4. **Deduplication**: 3-layer approach:
   - URL hash check (quick)
   - Fuzzy title matching with Fuse.js
   - Claude semantic analysis
5. **Classification**: Claude assigns audience types (developers/business/researchers/general/students) and technical levels (beginner/intermediate/advanced/all-levels)
6. **Storage**: Events upserted to Supabase with unique constraint on (source, source_event_id)
7. **Frontend**: Next.js fetches upcoming events (30-day window), renders filterable calendar with ISR (5-min revalidation)

### Directory Structure
```
austin-ai-events/
├── frontend/                           # Next.js 16 app
│   ├── src/
│   │   ├── app/                        # App router
│   │   │   ├── page.tsx               # Main calendar + filters
│   │   │   ├── observatory/page.tsx   # Analytics dashboard
│   │   │   ├── api/track/route.ts     # Visitor tracking endpoint
│   │   │   └── layout.tsx             # Root layout
│   │   ├── components/
│   │   │   ├── EventCard.tsx          # Event display
│   │   │   ├── EventFilters.tsx       # Filter controls (client-side)
│   │   │   ├── EventModal.tsx         # Event details modal
│   │   │   ├── PageTracker.tsx        # Analytics (Vercel)
│   │   │   └── observatory/           # Dashboard visualizations
│   │   ├── lib/
│   │   │   ├── supabase.ts            # Browser client
│   │   │   └── supabase-server.ts     # Server-side fetching (fetchEventsServer)
│   │   └── types/
│   │       ├── event.ts               # Event interface + ENUMs
│   │       └── observatory.ts         # Analytics types
│   └── tsconfig.json                  # Path alias: @/* → ./src/*
│
├── agent/                             # Discovery agent
│   ├── src/
│   │   ├── index.js                   # Main orchestrator
│   │   ├── config.js                  # Source definitions + validation
│   │   ├── sources/                   # Event scrapers
│   │   │   ├── meetup.js              # GraphQL scraping
│   │   │   ├── luma.js                # JSON-LD extraction
│   │   │   ├── generic.js             # Cheerio-based HTML parser
│   │   │   ├── austinforum.js         # Forum scraper
│   │   │   ├── aiaccelerator.js       # AI Accelerator Institute
│   │   │   ├── austinai.js            # Austin AI Alliance
│   │   │   ├── leadersinai.js         # Leaders in AI Summit
│   │   │   └── websearch.js           # SerpAPI + event enrichment
│   │   ├── utils/
│   │   │   ├── claude.js              # Claude API calls (validation, classification)
│   │   │   ├── dedup.js               # Fuzzy matching + duplicate detection
│   │   │   └── supabase.js            # Database operations
│   │   ├── discovery/
│   │   │   └── sourceDiscovery.js     # Autonomous source discovery
│   │   └── feedback/
│   │       └── analyzeFeedback.js     # User feedback analysis
│   └── .env.example                   # Environment template
│
└── supabase/
    ├── schema.sql                     # Database schema + ENUMs
    ├── seed.sql                       # Sample data
    └── migrations/
        ├── 001_search_queries_priority.sql
        ├── 002_agent_runs.sql
        ├── 003_source_trust_tiers.sql  # Trust tier columns for sources table
        └── 003_data_cleanup.sql        # Initialize trust tiers for existing data
```

## Key Database Schema

**Custom ENUMs:**
- `audience_type`: 'developers' | 'business' | 'researchers' | 'general' | 'students'
- `technical_level`: 'beginner' | 'intermediate' | 'advanced' | 'all-levels'
- `event_source`: 'meetup' | 'luma' | 'aicamp' | etc.

**Primary Table: `events`**
- Unique constraint on `(source, source_event_id)` for deduplication
- Indexes on: `start_time`, `source`, `audience_type` (GIN array), `technical_level`, `is_verified`
- Full-text search on `title` and `description`

**Tracking Tables:**
- `agent_runs`: Discovery run statistics
- `sources`: Tracked event sources for autonomous discovery
  - `trust_tier`: 'config' | 'trusted' | 'probation' | 'demoted'
  - `validation_pass_count`, `validation_fail_count`: Track event validation outcomes
  - `consecutive_empty_scrapes`: Track scrapes that return no events
  - `promoted_at`, `demoted_at`: Timestamps for tier changes
- `search_queries`: Web search query logs (max 50 active, priority-based deactivation)
- `daily_stats`: Aggregated metrics by date

## Development Patterns

### TypeScript (Frontend)
- Strict mode enabled
- Path alias `@/*` resolves to `src/*`
- Event and Observatory types defined in `src/types/`
- Server components fetch data directly; client components use hooks

### JavaScript (Agent)
- ES modules (`"type": "module"` in package.json)
- Async/await for all I/O
- Error handling with try-catch, failures logged to Supabase
- Configuration validation on startup (config.js)

### Claude API Usage
**Current Model**: `claude-sonnet-4-5`

**Common Tasks:**
- Event validation (real? upcoming? AI-focused? Austin-based?)
- Classification (audience type, technical level)
- Duplicate detection via semantic understanding
- Source discovery via web search analysis

**Patterns:**
```javascript
// Validation with JSON output
const response = await client.messages.create({
  model: 'claude-sonnet-4-5',
  max_tokens: 1024,
  messages: [{ role: 'user', content: prompt }],
  temperature: 0,
  tool_use: true
});
```

### Event Processing Pipeline
1. **Scraping**: Each source returns `{ title, description, start_time, url, ... }`
2. **Validation**: Claude validates structure and event quality (confidence score >= 0.6)
   - **Trusted/config sources skip validation** (see Source Trust Tiers below)
3. **Deduplication**:
   - URL hash lookup in database
   - Fuzzy match against existing events (Fuse.js with default threshold)
   - Claude semantic analysis for edge cases
4. **Classification**: Claude assigns audience and technical level
5. **Upsert**: Insert or update in database, creating agent_run log entry

### Source Trust Tiers
Sources are assigned trust tiers that determine validation behavior:

**Tier Levels:**
- `config`: Hardcoded sources in `config.js` - always trusted, never demoted
- `trusted`: Earned trust through consistent quality - skip Claude validation
- `probation`: New/unproven sources - require Claude validation for every event
- `demoted`: Poor performers - excluded from scraping

**Promotion/Demotion Logic:**
- New discovered sources start in `probation`
- Promoted to `trusted` after 10+ validated events with 80%+ pass rate
- Demoted after 10+ validated events with <30% pass rate
- Demoted after 5 consecutive empty scrapes

**Cost Optimization:**
- Trusted sources skip ~$0.01-0.02 per event in Claude API calls
- Only probation sources incur validation costs
- Expected daily cost: ~$0.50-0.75 (down from ~$1.50)

**Key Functions in `sourceDiscovery.js`:**
- `getTrustedSources()`: Returns config + trusted tier sources
- `getProbationSources()`: Returns up to 10 probation sources per run
- `updateSourceValidationStats()`: Handles promotion/demotion logic
- `isBroadSearchUrl()`: Filters garbage URLs (meetup.com/find/, eventbrite.com/d/, etc.)

### Query Management
Search queries are managed in the `search_queries` table:
- **Deduplication**: New queries checked against existing before insert
- **Cap**: Maximum 50 active queries at any time
- **Deactivation**: Queries with priority < 0.1 after 5+ runs are deactivated
- **Priority decay**: Queries that don't find new sources decrease in priority

## Critical Implementation Details

### Timezone Handling
- Austin timezone: `America/Chicago` (CST/CDT)
- Sources may return times in UTC or local time without timezone info
- **Use `date-fns-tz` `fromZonedTime()` when source provides times without explicit timezone**
- Audit needed: `luma.js`, `meetup.js`, `websearch.js`, `generic.js`, `austinai.js`, `austinforum.js` (see TODO.md)

### API Costs & Rate Limiting
- **Claude API**: ~$0.50-0.75/day with trust tiers (was ~$1.50/day before)
  - Trusted/config sources skip validation entirely
  - Only probation sources incur validation costs
- **SerpAPI**: Free tier covers ~5 searches/day
- Agent includes 500ms delay between event processing to respect rate limits

### Frontend ISR
- Revalidation interval: 300 seconds (5 minutes)
- Events query window: 30 days from today
- Full-text search supported via Supabase

### Agent Concurrency
- GitHub Actions workflow has concurrency lock (single run at a time)
- Prevents race conditions during deduplication/upsert
- Manual trigger available with optional `skip_web_search` parameter

## Common Debugging

### Frontend Issues
- **SSR/Hydration**: Observatory page uses `'use client'` with useEffect data fetching (not crawlable by bots)
- **Type Errors**: Check `src/types/` and run `npm run lint`
- **Supabase Connection**: Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`

### Agent Issues
- **Missing Events**: Check if source scrapers are returning data (logs in agent_runs table)
- **Timezone Errors**: Verify source returns timezone-aware times or use `fromZonedTime()`
- **Deduplication**: URL hash check happens first (fast), then fuzzy matching, then Claude analysis
- **Claude API Errors**: Check token usage, model availability, API key validity

### Database Issues
- **Connection**: Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in agent `.env`
- **Schema**: Run `supabase/schema.sql` to initialize tables and ENUMs
- **Unique Constraint**: Upsert targets `(source, source_event_id)` - duplicates within same source will overwrite

## Testing

### Agent
- Native Node.js test runner: `npm run test` (from agent/)
- Pattern: `src/**/*.test.js`
- Currently no tests present (contribution opportunity)

### Frontend
- No test framework configured
- ESLint available: `npm run lint`

## GitHub Actions Workflows

### Daily Discovery (`discover-events.yml`)
- Trigger: Every day at 6 AM UTC (midnight CST)
- Runs: Single instance (concurrency lock prevents parallel runs)
- Timeout: 30 minutes
- Secrets required: `ANTHROPIC_API_KEY`, `SERPAPI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- On failure: Creates GitHub issue with error details
- Manual run: Available from Actions tab with `skip_web_search` option

### Frontend CI (`frontend-ci.yml`)
- Trigger: Push to main branch (frontend/** or workflow file changes)
- Steps: Install dependencies, lint, build
- Secrets required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Known Limitations & TODOs

See `TODO.md` for detailed improvement list:
- **Timezone audit**: Several scrapers may store times in wrong timezone
- **Missing end times**: Some sources don't provide duration
- **Missing locations**: Some events lack venue data
- **Observatory SEO**: Page uses client-side rendering (not crawlable)

## Accessing Related Resources

- **Live Site**: https://austinai.events
- **Known Event Sources**: See README.md "Known Sources" section
- **GitHub Repo**: Standard workflows run on push/schedule
