-- Deduplicated visitor count: counts unique (date, user_agent) pairs
-- instead of raw rows, to prevent inflation from repeat visits.
CREATE OR REPLACE FUNCTION get_unique_visitor_count(p_page TEXT, p_type TEXT)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM (
    SELECT DISTINCT DATE(created_at), user_agent
    FROM page_views
    WHERE page = p_page AND visitor_type = p_type
  ) d;
$$ LANGUAGE SQL STABLE;

-- Count only AI crawler visits (not general bots like vercel-screenshot)
CREATE OR REPLACE FUNCTION get_ai_crawler_count(p_page TEXT)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM page_views
  WHERE page = p_page
    AND visitor_type = 'bot'
    AND (
      user_agent ~* 'GPTBot|ChatGPT|ClaudeBot|Claude-Web|Anthropic'
      OR user_agent ~* 'Google-Extended|CCBot|PerplexityBot'
      OR user_agent ~* 'Bytespider|Amazonbot|cohere-ai|Manus-User'
    );
$$ LANGUAGE SQL STABLE;
