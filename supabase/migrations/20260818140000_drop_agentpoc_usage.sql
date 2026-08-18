-- ============================================================================
-- Atelix — retire the public agentpoc demo's rate-cap infrastructure.
-- The /agentpoc surface is now the authenticated Athelia copilot, which reuses
-- the per-user copilot_usage cap (reserve_athelia_usage / add_athelia_tokens).
-- The public, unauthenticated global cap (added in 20260818090000_agentpoc_usage)
-- is no longer used by any function and is dropped here.
-- ============================================================================

DROP FUNCTION IF EXISTS public.reserve_agentpoc_usage(integer);
DROP FUNCTION IF EXISTS public.add_agentpoc_tokens(integer);
DROP TABLE IF EXISTS public.agentpoc_usage;
