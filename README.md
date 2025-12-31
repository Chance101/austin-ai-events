# Austin AI Events

A fully automated, agentic system that discovers and curates AI events in Austin, TX.

**Live site:** [austinai.events](https://austinai.events)

## Features

- **Automated Discovery**: Daily scraping of known Austin AI community sources
- **Web Search**: Discovers new events via SerpAPI Google search
- **AI-Powered Validation**: Claude verifies events are legitimate, in-person, and AI-related
- **Smart Deduplication**: Fuzzy matching + AI reasoning prevents duplicate listings
- **Event Classification**: Auto-categorizes by audience type and technical level
- **Filterable Calendar**: Public frontend with filters for audience, level, and pricing

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   GitHub Actions │────▶│  Discovery Agent │────▶│    Supabase     │
│   (Daily Cron)   │     │   (Node.js)      │     │   (PostgreSQL)  │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                              ┌───────────────────────────┘
                              ▼
                        ┌─────────────────┐
                        │  Next.js Frontend │
                        │   (Vercel)        │
                        └─────────────────┘
```

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | Next.js 14, Tailwind CSS | Public event calendar |
| Database | Supabase (PostgreSQL) | Event storage with RLS |
| Agent | Node.js | Event discovery & processing |
| AI | Claude API | Validation, classification, dedup |
| Search | SerpAPI | Web search for new events |
| Hosting | Vercel | Frontend deployment |
| Scheduling | GitHub Actions | Daily agent runs |

## Known Sources

The agent monitors these Austin AI communities:

| Source | Type | URL |
|--------|------|-----|
| AICamp | API | [aicamp.ai](https://www.aicamp.ai/event/eventlist?city=Austin) |
| AITX | Lu.ma | [lu.ma/AITX](https://lu.ma/AITX) |
| HackAI | Meetup | [meetup.com/hack-ai](https://www.meetup.com/hack-ai/events/) |
| Austin LangChain | Meetup | [meetup.com/austin-langchain](https://www.meetup.com/austin-langchain-ai-group/events/) |
| AI Automation | Meetup | [meetup.com/ai-automation](https://www.meetup.com/marketing-automation-ai/events/) |
| Capital Factory | Scrape | [capitalfactory.com](https://www.capitalfactory.com/events/) |
| UT Austin AI | Scrape | [ai.utexas.edu](https://ai.utexas.edu/events) |

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- Supabase account
- Anthropic API key
- SerpAPI key (optional, for web search)

### 1. Clone & Install

```bash
git clone https://github.com/your-username/austin-ai-events.git
cd austin-ai-events

# Install frontend dependencies
cd frontend && npm install

# Install agent dependencies
cd ../agent && npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run `supabase/schema.sql`
3. (Optional) Run `supabase/seed.sql` for sample data
4. Get your API keys from Settings > API

### 3. Configure Environment

```bash
# Frontend
cp frontend/.env.example frontend/.env.local
# Edit with your Supabase URL and anon key

# Agent
cp agent/.env.example agent/.env
# Edit with your API keys
```

### 4. Run Locally

```bash
# Start frontend (from frontend/)
npm run dev

# Run agent once (from agent/)
npm run discover
```

## Project Structure

```
austin-ai-events/
├── frontend/                 # Next.js application
│   ├── src/
│   │   ├── app/             # App router pages
│   │   ├── components/      # React components
│   │   ├── lib/             # Supabase client
│   │   └── types/           # TypeScript types
│   └── package.json
│
├── agent/                    # Discovery agent
│   ├── src/
│   │   ├── sources/         # Source scrapers
│   │   │   ├── meetup.js    # Meetup.com scraper
│   │   │   ├── luma.js      # Lu.ma scraper
│   │   │   ├── generic.js   # Generic scraper
│   │   │   └── websearch.js # SerpAPI search
│   │   ├── utils/
│   │   │   ├── claude.js    # AI validation/classification
│   │   │   ├── dedup.js     # Deduplication logic
│   │   │   └── supabase.js  # Database operations
│   │   ├── config.js        # Configuration
│   │   └── index.js         # Main entry point
│   └── package.json
│
├── supabase/
│   ├── schema.sql           # Database schema
│   └── seed.sql             # Sample data
│
├── .github/workflows/
│   ├── discover-events.yml  # Daily agent cron
│   └── frontend-ci.yml      # Frontend CI
│
└── README.md
```

## Deployment

### Frontend (Vercel)

1. Connect your GitHub repo to [Vercel](https://vercel.com)
2. Set root directory to `frontend`
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

### Agent (GitHub Actions)

1. Go to repo Settings > Secrets and variables > Actions
2. Add repository secrets:
   - `ANTHROPIC_API_KEY`
   - `SERPAPI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. The agent runs automatically daily at 6 AM UTC
4. Manually trigger from Actions tab if needed

## Event Schema

```typescript
interface Event {
  id: string;
  title: string;
  description: string | null;
  start_time: string;        // ISO timestamp
  end_time: string | null;
  venue_name: string | null;
  address: string | null;
  url: string;
  source: EventSource;
  audience_type: AudienceType[];
  technical_level: TechnicalLevel;
  is_free: boolean | null;
  organizer: string | null;
  is_verified: boolean;
}

type AudienceType = 'developers' | 'business' | 'researchers' | 'general' | 'students';
type TechnicalLevel = 'beginner' | 'intermediate' | 'advanced' | 'all-levels';
```

## How the Agent Works

1. **Scrape Sources**: Fetches events from known community pages
2. **Web Search**: Searches Google for additional AI events in Austin
3. **URL Dedup**: Quick check against existing event URLs
4. **AI Validation**: Claude verifies each event is:
   - Real and upcoming
   - Located in Austin, TX (not virtual-only)
   - Related to AI/ML
5. **Fuzzy Dedup**: Checks for similar events using title matching + AI
6. **Classification**: Claude categorizes by audience and technical level
7. **Upsert**: Saves to database with conflict resolution

## API Costs

Estimated monthly costs (varies by event volume):

| Service | Usage | Estimated Cost |
|---------|-------|----------------|
| Anthropic (Claude) | ~100-200 calls/day | $5-15/month |
| SerpAPI | ~5 searches/day | $0 (free tier) |
| Supabase | Database + API | $0 (free tier) |
| Vercel | Frontend hosting | $0 (free tier) |

## Adding New Sources

1. Create a new scraper in `agent/src/sources/`
2. Add source config to `agent/src/config.js`
3. Import and add case in `agent/src/index.js`

Example scraper template:

```javascript
export async function scrapeNewSource(sourceConfig) {
  const events = [];
  // Fetch and parse events
  // Return array of event objects
  return events;
}
```

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

Ideas for contributions:
- Add new event sources
- Improve scraper reliability
- Add event submission form
- Implement email notifications
- Add iCal export

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Austin AI community organizers
- [AICamp](https://aicamp.ai), [AITX](https://lu.ma/AITX), [HackAI](https://meetup.com/hack-ai), and other communities
- Built with [Claude](https://anthropic.com), [Next.js](https://nextjs.org), [Supabase](https://supabase.com)
