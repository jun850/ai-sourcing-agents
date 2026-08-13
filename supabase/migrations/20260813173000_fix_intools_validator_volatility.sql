-- pg_column_size is stable rather than immutable, so the validator must use
-- the same volatility classification for accurate planner behavior and lint.
ALTER FUNCTION public.intools_validate_document(jsonb) STABLE;
