-- One-time cleanup: deactivate excess queries to get back under 50 cap
-- Deactivates lowest-priority queries first, keeping the best 50

WITH ranked AS (
  SELECT id, query_text, priority_score, times_run, sources_found,
         ROW_NUMBER() OVER (ORDER BY priority_score DESC, sources_found DESC, times_run ASC) AS rn
  FROM search_queries
  WHERE is_active = true
)
UPDATE search_queries
SET is_active = false
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 50
);
