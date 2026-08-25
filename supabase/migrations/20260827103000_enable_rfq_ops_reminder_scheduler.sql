-- The reply-reminder dispatcher is invoked by a managed pg_cron job.
-- Keep its HTTP client extension tracked with the database schema.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
