-- Account-level keyword search history for the shared marketplace autocomplete.
CREATE TABLE IF NOT EXISTS public.search_history (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  query text NOT NULL CHECK (char_length(query) BETWEEN 1 AND 160),
  last_searched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, query)
);

CREATE INDEX IF NOT EXISTS idx_search_history_profile_recent
  ON public.search_history (profile_id, last_searched_at DESC);

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS search_history_owner_all ON public.search_history;
CREATE POLICY search_history_owner_all ON public.search_history
  FOR ALL USING (profile_id = (select auth.uid()))
  WITH CHECK (profile_id = (select auth.uid()));
