export interface DecisionSummary {
  totalDecisions: number;
  bySource: Record<string, {
    accepted: number;
    rejected: number;
    duplicated: number;
    updated: number;
    skipped: number;
    error: number;
    reasons: Record<string, number>;
  }>;
  byStage: Record<string, number>;
  topRejectionReasons: Array<{ reason: string; count: number; sources: string[] }>;
  topDupSources: Array<{ source: string; count: number; layer: string }>;
  costEfficiency: {
    bySource: Record<string, {
      claudeCalls: number;
      eventsAccepted: number;
      estCost: number;
      costPerEvent: number | null;
    }>;
    totalClaudeCalls: number;
    totalEstCost: number;
    totalEventsAccepted: number;
    avgCostPerEvent: number | null;
  };
}

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
  error_messages: Array<string | { source?: string; error?: string; message?: string; timestamp?: string }>;
  claude_api_calls: number;
  serpapi_calls: number;
  created_at: string;
  decision_summary?: DecisionSummary;
}

export interface HumanActionItem {
  id: string;
  created_at: string;
  resolved_at: string | null;
  severity: string;
  category: string;
  title: string;
  description: string;
  suggested_fix: string | null;
  monitor_report_id: string | null;
  is_resolved: boolean;
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
  // Trust tier fields
  trust_tier: 'config' | 'trusted' | 'probation' | 'demoted';
  validation_pass_count: number;
  validation_fail_count: number;
  consecutive_empty_scrapes: number;
  promoted_at: string | null;
  demoted_at: string | null;
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
