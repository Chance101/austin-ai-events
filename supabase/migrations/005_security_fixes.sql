-- Migration: Fix security vulnerabilities flagged by Supabase Security Advisor
--
-- 1. Fix upcoming_events view: SECURITY DEFINER → SECURITY INVOKER
--    The view was running with the owner's (service_role) permissions,
--    bypassing RLS for any caller. Recreate with security_invoker = on.
--
-- 2. Fix update_updated_at_column function: set immutable search_path
--    Prevents search_path manipulation attacks.

-- Fix #1: Recreate view with SECURITY INVOKER
DROP VIEW IF EXISTS upcoming_events;
CREATE VIEW upcoming_events WITH (security_invoker = on) AS
SELECT *
FROM events
WHERE start_time >= NOW()
ORDER BY start_time ASC;

-- Re-grant access after recreating the view
GRANT SELECT ON upcoming_events TO anon;
GRANT SELECT ON upcoming_events TO service_role;

-- Fix #2: Pin search_path on trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';
