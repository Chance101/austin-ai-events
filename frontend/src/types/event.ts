export type AudienceType =
  | 'developers'
  | 'business'
  | 'researchers'
  | 'general'
  | 'students';

export type TechnicalLevel =
  | 'beginner'
  | 'intermediate'
  | 'advanced'
  | 'all-levels';

export type EventSource =
  | 'aicamp'
  | 'aitx'
  | 'hackai'
  | 'austin-langchain'
  | 'ai-automation'
  | 'capital-factory'
  | 'ut-austin'
  | 'austin-forum'
  | 'ai-accelerator'
  | 'austin-ai'
  | 'leaders-in-ai'
  | 'web-search'
  | 'manual';

export interface Event {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  venue_name: string | null;
  address: string | null;
  url: string;
  source: EventSource;
  source_event_id: string | null;
  audience_type: AudienceType[];
  technical_level: TechnicalLevel;
  is_free: boolean | null;
  price: string | null;
  organizer: string | null;
  image_url: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventFilters {
  audience?: AudienceType[];
  technicalLevel?: TechnicalLevel[];
  source?: EventSource[];
  isFree?: boolean;
  startDate?: string;
  endDate?: string;
}
