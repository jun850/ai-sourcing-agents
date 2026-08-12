-- ============================================================================
-- ARCANA — 0009 address book + buyer<->seller chat (beta testing, no maps/geocoding)
-- Idempotent: tables via CREATE TABLE IF NOT EXISTS, RLS dropped-then-created.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- addresses — simple manual entry, no map/pinpoint lookup (avoids paid geocoding).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.addresses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label          text,
  recipient_name text NOT NULL,
  phone          text,
  line1          text NOT NULL,
  line2          text,
  city           text NOT NULL,
  province       text,
  postal_code    text,
  country        text NOT NULL,
  is_default     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addresses_profile_id ON public.addresses(profile_id);

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS addresses_owner_all ON public.addresses;
CREATE POLICY addresses_owner_all ON public.addresses
  FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS addresses_admin_all ON public.addresses;
CREATE POLICY addresses_admin_all ON public.addresses
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- conversations — one thread per (buyer, factory) pair. Buyer-initiated.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  factory_id        uuid NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_profile_id, factory_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_buyer   ON public.conversations(buyer_profile_id);
CREATE INDEX IF NOT EXISTS idx_conversations_factory ON public.conversations(factory_id);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_select_participant ON public.conversations;
CREATE POLICY conversations_select_participant ON public.conversations
  FOR SELECT USING (
    public.is_admin()
    OR buyer_profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.factories f WHERE f.id = factory_id AND f.owner_profile_id = auth.uid())
  );

DROP POLICY IF EXISTS conversations_insert_buyer ON public.conversations;
CREATE POLICY conversations_insert_buyer ON public.conversations
  FOR INSERT WITH CHECK (buyer_profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- messages — plain text, participant-scoped read/write.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body               text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_select_participant ON public.messages;
CREATE POLICY messages_select_participant ON public.messages
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      LEFT JOIN public.factories f ON f.id = c.factory_id
      WHERE c.id = conversation_id
        AND (c.buyer_profile_id = auth.uid() OR f.owner_profile_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS messages_insert_participant ON public.messages;
CREATE POLICY messages_insert_participant ON public.messages
  FOR INSERT WITH CHECK (
    sender_profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      LEFT JOIN public.factories f ON f.id = c.factory_id
      WHERE c.id = conversation_id
        AND (c.buyer_profile_id = auth.uid() OR f.owner_profile_id = auth.uid())
    )
  );
