export interface AgentRun {
  id: string;
  run_type: string;
  started_at: string;
  completed_at: string | null;
  run_duration_seconds: number | null;
  queries_run: number;
  new_sources_found: number;
  new_queries_generated: number;
  sources_scraped: number;
  events_discovered: number;
  events_validated: number;
  events_added: number;
  events_updated: number;
  duplicates_skipped: number;
  errors: number;
  error_messages: string[];
  claude_api_calls: number;
  serpapi_calls: number;
  created_at: string;
}

export interface Source {
  id: string;
  name: string;
  url: string;
  source_type: string;
  is_trusted: boolean;
  trust_score: number | null;
  discovery_reasoning: string | null;
  created_at: string;
}

export interface SearchQuery {
  id: string;
  query_text: string;
  created_by: string;
  is_active: boolean;
  times_run: number;
  sources_found: number;
  priority_score: number | null;
  last_run: string | null;
  last_success_at: string | null;
  created_at: string;
}

export interface DailyStats {
  date: string;
  events_added: number;
}
