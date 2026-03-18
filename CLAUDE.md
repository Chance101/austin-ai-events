# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Austin AI Events** is an autonomous AI-powered event discovery and curation system. It discovers upcoming AI-related events in Austin, TX through automated scraping and web search, validates them with Claude, deduplicates them, and presents them on a public calendar (https://austinai.events).

**Tech Stack:**
- Frontend: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- Backend Agent: Node.js 20+ (vanilla JavaScript, ES modules)
- Database: Supabase (PostgreSQL)
- AI: Anthropic Claude API (multi-model: Haiku / Sonnet / Opus)
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
2. **Discovery**: Agent scrapes 11 event sources (Meetup, Lu.ma, AICamp, Capital Factory, UT Austin, etc.) and performs web search
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
│   │   │   └── observatory/           # Three-layer observability dashboard
│   │   │       ├── (Agent Performance) # LastRunCard, PerformanceChart, SystemHealth, etc.
│   │   │       ├── (Under the Hood)    # SourceHealth, DecisionLog, CostTracking, ErrorLog
│   │   │       ├── MonitorReport.tsx   # Self-evaluation health report display
│   │   │       └── HumanStewardship.tsx # Human-AI collaboration log
│   │   ├── data/
│   │   │   └── evolutionLog.ts        # Stewardship entries (Problem → Action → Result)
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
│   │   │   ├── aicamp.js              # AICamp Austin meetups
│   │   │   ├── capitalfactory.js      # Capital Factory tech hub
│   │   │   ├── utaustin.js            # UT Austin AI research events
│   │   │   └── websearch.js           # SerpAPI + event enrichment
│   │   ├── utils/
│   │   │   ├── claude.js              # Claude API calls (validation, classification)
│   │   │   ├── dedup.js               # Fuzzy matching + duplicate detection
│   │   │   ├── decisionLog.js         # In-memory pipeline decision capture
│   │   │   └── supabase.js            # Database operations
│   │   ├── monitor.js                 # Self-monitoring agent (health reports + auto-fix)
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
        ├── 003_data_cleanup.sql        # Initialize trust tiers for existing data
        ├── 004_source_results.sql      # Per-source results JSONB on agent_runs
        ├── 005_monitor_reports.sql     # Self-monitoring health reports table
        ├── 007_add_meetup_enum.sql     # Add 'meetup' event_source enum value
        ├── 009_decision_log.sql        # Decision summary JSONB on agent_runs
        ├── 010_monitor_enrichment.sql  # Action review + decision summary on monitor_reports
        ├── 011_source_context.sql      # Per-source validation context on sources
        └── 012_human_action_items.sql  # Human escalation action items table
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
  - `source_results`: JSONB array of per-source event counts (`[{name, url, events}]`)
  - `decision_summary`: JSONB with per-source accept/reject/duplicate breakdowns, top rejection reasons, cost efficiency
- `sources`: Tracked event sources for autonomous discovery
  - `trust_tier`: 'config' | 'probation' | 'demoted' (trusted tier deprecated — all DB sources stay probation)
  - `validation_pass_count`, `validation_fail_count`: Track event validation outcomes
  - `consecutive_empty_scrapes`: Track scrapes that return no events
  - `promoted_at`, `demoted_at`: Timestamps for tier changes
  - `validation_context`: Optional text the monitor writes to tune Haiku validation prompts per-source
- `search_queries`: Web search query logs (max 50 active, priority-based deactivation)
- `daily_stats`: Aggregated metrics by date
- `monitor_reports`: Self-evaluation health reports (grade, findings, auto-actions, metrics snapshot)
  - `action_review`: JSONB array of the monitor's review of its previous actions' outcomes
  - `decision_summary`: JSONB snapshot of the pipeline's decision log for that run
- `human_action_items`: Persistent action items escalated by the monitor for human attention
  - Fields: severity, category, title, description, suggested_fix, is_resolved
  - Linked to the monitor_report that created them via `monitor_report_id`

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

### Documentation Requirements
**IMPORTANT**: When making significant changes, always update this file before committing.

Update CLAUDE.md when:
- Adding new systems or architectural patterns (e.g., trust tiers, caching)
- Adding new database tables or columns
- Changing the event processing pipeline
- Adding new scrapers or data sources
- Modifying cost-impacting behavior (API calls, rate limits)

Update `frontend/src/data/evolutionLog.ts` when:
- Fixing agent bugs or improving agent logic
- Adding new agent capabilities
- Optimizing performance or costs
- Any change worth showing on the Observatory's Evolution Log

Workflow: **Code → Test → Document → Update Evolution Log → Commit**

### Claude API Usage — Multi-Model Architecture
The system uses three model tiers, configured in `config.js`:

| Tier | Model | Used For | ~Cost/call |
|------|-------|----------|------------|
| `fast` | `claude-haiku-4-5` | Validation, classification, dedup | $0.001 |
| `standard` | `claude-sonnet-4-6` | Source evaluation, image analysis | $0.01 |
| `strategic` | `claude-opus-4-6` | Monitor evaluation (system brain) | $0.10 |

**Design principle:** Haiku handles ~80% of calls (high-volume, structured tasks). The one expensive Opus call goes to the monitor — the only place where deep reasoning drives system behavior.

**Access models via config:**
```javascript
import { config } from '../config.js';
// config.models.fast      → Haiku (validation, classification, dedup)
// config.models.standard  → Sonnet (source eval, image extraction)
// config.models.strategic → Opus (monitor evaluation)
```

### Event Processing Pipeline
1. **Scraping**: Each source returns `{ title, description, start_time, url, ... }`
   - Sources are scraped on a **weekly schedule** (not daily) to reduce duplicate noise
   - High-update sources (AITX, Austin AI, Capital Factory): 3x/week (Mon/Wed/Fri)
   - Low-update sources (AICamp, Meetup groups, UT Austin, Austin Forum): 1x/week (Thu)
   - Schedule configured via `scrapeDays` in `config.js` (0=Sun through 6=Sat)
   - DB-discovered sources (trusted/probation) still scraped every run
   - Per-source event counts are tracked and logged to `agent_runs.source_results`
   - Sources returning 0 events trigger a console warning for silent failure detection
2. **Pre-validation checks** (no Claude API cost):
   - `isMalformedTitle()`: Rejects CSS, HTML, code in titles
   - `checkAustinLocation()`: Fast string-based Austin location check for ALL events
3. **Deduplication** (before validation to save API costs):
   - URL hash lookup against existing events (includes past 30 days to prevent phantom re-adds)
   - Fuzzy match against existing events (Fuse.js with default threshold)
   - Claude semantic analysis for edge cases
4. **Claude Validation**: Validates structure and event quality (confidence score >= 0.6)
   - **Config sources skip validation only if Austin location is confirmed**
   - All DB-discovered sources (probation) always validated
5. **Classification**: Claude assigns audience and technical level
6. **Upsert**: Insert or update in database, creating agent_run log entry

### Source Lifecycle
Sources have two entry paths and a simple lifecycle:

**Entry Paths:**
- `config`: Manually added to `config.js` — proven, recurring community sources (8 total). Always scraped on schedule. Monitor cannot skip these autonomously; must `escalate_to_human` if issues arise.
- `probation`: Discovered by web search — enter the `sources` DB table and must prove themselves through validation.

**Lifecycle of DB-discovered sources:**
```
Web search finds URL → PROBATION (every event validated by Claude)
  → 5+ validated events with <50% pass rate → DEMOTED (never scraped again)
  → 5 consecutive empty scrapes → DEMOTED
  → Monitor uses skip_source → DEMOTED
  → If source becomes active again → web search rediscovers it fresh
```

**Config source stats are tracked in the DB** (upserted on startup) so the monitor has data to evaluate them. Config sources that fail get escalated to the human for review, not auto-skipped.

**SCRAPE_ALL=1**: Environment variable bypasses the weekly schedule, scraping all config sources. Useful for debugging.

**Key Functions in `sourceDiscovery.js`:**
- `getProbationSources()`: Returns up to 10 non-config, non-demoted DB sources per run
- `updateSourceValidationStats()`: Tracks pass/fail counts, demotes at <50% after 5 events
- `updateSourceStats()`: Tracks consecutive empty scrapes, demotes at 5
- `isBroadSearchUrl()`: Filters garbage URLs (meetup.com/find/, eventbrite.com/d/, etc.)
- `getEventSearchQueries()`: Returns query strings for direct event search (oldest `last_run` first for rotation)
- `getActiveQueries()`: Returns queries for source discovery using exploration budget strategy

**Key Functions in `index.js`:**
- `checkAustinLocation()`: Fast string-based Austin check (no API cost)
- `isMalformedTitle()`: Detects CSS, HTML, code in titles

### Query Management
Search queries are managed in the `search_queries` table and used for two purposes:
1. **Source discovery** (`discoverSources()`): 3 queries/run, finds new listing pages
2. **Event search** (`searchEvents()`): 2 queries/run, finds individual events directly

- **SerpAPI budget**: 5 searches/day total (3 source discovery + 2 event search)
- **Deduplication**: New queries checked against existing before insert
- **Cap**: Maximum 50 active queries at any time
- **Query creation**: Only the Opus monitor creates new queries (no auto-generation)
- **Aggressive recycling**: Queries deactivated if (times_run >= 2 AND sources_found = 0 AND priority < 0.3) OR (times_run >= 5 AND priority < 0.15). ALL queries eligible, including seed.
- **Priority decay**: 10% per day since last success (`0.9^days`)
- **Event search rotation**: Queries selected by oldest `last_run` to ensure diversity

### Self-Monitoring Agent
The monitor (`agent/src/monitor.js`) runs automatically as the final phase of every agent run. It evaluates overall system effectiveness and can take safe auto-actions.

**How it works:**
1. **Capture** (Layer 1): `RunDecisionLog` in `utils/decisionLog.js` tracks every accept/reject/duplicate decision during the pipeline in-memory (zero API cost). Summary stored on `agent_runs.decision_summary`.
2. **Remember** (Layer 2): Gathers metrics from Supabase (run history, source performance, calendar coverage, query health) PLUS last 5 monitor reports and outcomes of previously created queries — giving Opus multi-run memory.
3. **Evaluate**: Sends all metrics + decision summary + previous reports to **Opus** (strategic model, 4096 max_tokens) for deep evaluation.
4. **Act** (Layer 3): Receives structured report with letter grade, findings with status tags (new/recurring/resolved/escalated), action review, and auto-actions. Executes up to 5 safe auto-actions per run.
5. Stores enriched report in `monitor_reports` (includes `action_review` and `decision_summary`).

**Grading (21-day window):**
The monitor grades on a 21-day window (not 30) because community events are typically posted 2-3 weeks out. The 30-day data is still gathered for strategic planning.
- A: 12+ events, <8 empty days, 5+ contributing sources, <5% error rate
- B: 8-11 events, <12 empty days, 3-4 contributing sources
- C: 4-7 events, 12-16 empty days, some source issues
- D: <4 events, 16+ empty days, multiple broken sources
- F: System producing no value

**Why Opus for the monitor:**
The monitor is the system's brain — it drives the feedback loop. Opus identifies root causes rather than symptoms, generates targeted queries rather than generic ones, and avoids repeating the same findings daily. With multi-run memory, it can track hypotheses across runs ("I created a query 3 runs ago — did it produce events?").

**Auto-actions (safe, reversible):**
- `create_query`: Add event-search queries for specific coverage gaps (Opus is the sole query strategist)
- `create_source_query`: Add source-discovery queries to find new listing pages
  (inserted with `query_type: 'source_discovery'`, picked up by next discovery run)
- `deactivate_query`: Remove underperforming queries
- `boost_query`: Increase priority for productive queries
- `flag_source`: Log concern about a source (no destructive action)
- `add_source_context`: Write per-source validation guidance injected into the Haiku prompt (stored in `sources.validation_context`). Reversible by setting to NULL.
- `skip_source`: Demote a DB-discovered source that is no longer producing value. Guardrails: (1) blocked for config sources — must use `escalate_to_human` instead, (2) blocked if source produced accepted events in last 28 days.
- `escalate_to_human`: Create persistent action item in `human_action_items` table for issues requiring code changes (broken scrapers, new platforms, strategic decisions).
- `resolve_action_item`: Mark a previously escalated action item as resolved when the underlying issue is fixed.

**Decision Log (`utils/decisionLog.js`):**
- In-memory collector — zero DB calls during the pipeline
- Logs every decision: `{ event, source, stage, outcome, reason, details }`
- Stages: `pre_filter`, `dedup_hash`, `dedup_fuzzy`, `dedup_claude`, `location_check`, `validation`, `classification`, `upsert`
- Outcomes: `accepted`, `rejected`, `duplicate`, `updated`, `skipped`, `error`
- `getSummary()` produces compact aggregate: per-source breakdowns, top rejection reasons, cost efficiency per source
- Summary stored on `agent_runs.decision_summary` JSONB column

**Monitor → Discovery handoff:**
When the monitor detects coverage gaps, it creates targeted `create_source_query` actions. These are inserted into `search_queries` with `query_type: 'source_discovery'` and `priority_score: 1.0`. On the next agent run, `discoverSources()` picks them up and searches for new listing pages.

**Aggressive query recycling:**
Queries are deactivated when: (times_run >= 2 AND sources_found = 0 AND priority < 0.3) OR (times_run >= 5 AND priority < 0.15). ALL queries are eligible, including seed/human-created. This ensures the query table stays clean and unblocked for the monitor's strategic additions.

**What requires human intervention:**
- Config source issues — monitor escalates but cannot skip config sources autonomously
- Broken scrapers (HTML structure changes) — monitor escalates to `human_action_items`
- New scraper types for new platforms
- Strategic decisions (expand scope, change validation criteria)
- Validation prompt tuning — monitor can partially handle via `add_source_context`

**Run manually:** `cd agent && npm run monitor`

## Critical Implementation Details

### Timezone Handling
- Austin timezone: `America/Chicago` (CST/CDT)
- Sources may return times in UTC or local time without timezone info
- **Use `date-fns-tz` `fromZonedTime()` when source provides times without explicit timezone**
- Audit needed: `luma.js`, `meetup.js`, `websearch.js`, `generic.js`, `austinai.js`, `austinforum.js` (see TODO.md)

### API Costs & Rate Limiting
- **Claude API**: Multi-model architecture optimizes cost allocation
  - Haiku handles validation, classification, dedup (~80% of calls, cheapest)
  - Sonnet handles source evaluation, image analysis (moderate)
  - Opus handles monitor evaluation (1 call/run, most expensive but highest leverage)
  - Config sources skip validation when Austin location is confirmed
  - All DB-discovered sources go through validation
- **SerpAPI**: Free tier covers ~5 searches/day (budget: 3 source discovery + 2 event search)
- Agent includes 500ms delay between event processing to respect rate limits

### Frontend ISR
- Revalidation interval: 300 seconds (5 minutes)
- Events query window: 30 days from today
- Full-text search supported via Supabase

### Observatory Page Architecture
The Observatory (`/observatory`) provides transparency through three layers:

1. **Agent Performance** - What the agent does autonomously
   - Last run stats, performance chart, system health
   - Activity feed, discovery stats, learning activity (queries)

2. **Under the Hood** - How the agent thinks and fails
   - Source Health: trust tier distribution, promotions/demotions
   - Decision Log: validation pass/reject rates per run
   - Cost Tracking: API costs and efficiency metrics
   - Error Log: categorized failures with context

3. **Human Stewardship** - How humans guide the agent
   - Problem → Action → Result format
   - Located in `src/data/evolutionLog.ts`
   - Update when making significant agent changes

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
- **Missing Events**: Check `agent_runs.source_results` JSONB to see per-source event counts. Sources returning 0 may be silently broken.
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
