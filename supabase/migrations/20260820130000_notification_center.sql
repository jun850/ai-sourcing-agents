-- Atelix notification center: private operational alerts and consented campaigns.

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  transactional_email boolean NOT NULL DEFAULT true,
  marketing_in_app boolean NOT NULL DEFAULT false,
  marketing_email boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('chat','order','account','campaign','agent')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 1000),
  href text NOT NULL DEFAULT '/' CHECK (href ~ '^/'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  marketing boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  expires_at timestamptz,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_profile_created_idx ON public.notifications(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_profile_unread_idx ON public.notifications(profile_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','in_app')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE(notification_id, channel)
);

CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  href text NOT NULL CHECK (href ~ '^/'),
  audience jsonb NOT NULL DEFAULT '{"roles":["buyer","seller"]}'::jsonb,
  send_email boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent')),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_campaign_audiences (
  campaign_id uuid NOT NULL REFERENCES public.notification_campaigns(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(campaign_id, profile_id)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_campaign_audiences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_preferences_self ON public.notification_preferences;
CREATE POLICY notification_preferences_self ON public.notification_preferences FOR SELECT USING (profile_id=auth.uid());
DROP POLICY IF EXISTS notifications_self ON public.notifications;
CREATE POLICY notifications_self ON public.notifications FOR SELECT USING (profile_id=auth.uid());

CREATE OR REPLACE FUNCTION public.notification_insert(
  p_profile_id uuid,p_kind text,p_title text,p_body text,p_href text,p_marketing boolean DEFAULT false,
  p_priority text DEFAULT 'normal',p_payload jsonb DEFAULT '{}'::jsonb,p_idempotency_key text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.notifications(profile_id,kind,priority,title,body,href,marketing,payload,idempotency_key)
  VALUES(p_profile_id,p_kind,p_priority,p_title,p_body,p_href,p_marketing,COALESCE(p_payload,'{}'::jsonb),p_idempotency_key)
  ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
  RETURNING id INTO v_id;
  INSERT INTO public.notification_deliveries(notification_id,channel,status) VALUES(v_id,'in_app','sent') ON CONFLICT DO NOTHING;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.my_notifications(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC),'[]'::jsonb)
  FROM (SELECT id,kind,priority,title,body,href,marketing,read_at,expires_at,created_at
    FROM public.notifications WHERE profile_id=auth.uid() AND (expires_at IS NULL OR expires_at>now())
    ORDER BY created_at DESC LIMIT LEAST(GREATEST(p_limit,1),100)) n;
$$;

CREATE OR REPLACE FUNCTION public.notification_unread_count()
RETURNS integer LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
  SELECT count(*)::integer FROM public.notifications WHERE profile_id=auth.uid() AND read_at IS NULL AND (expires_at IS NULL OR expires_at>now());
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.notifications SET read_at=COALESCE(read_at,now()) WHERE profile_id=auth.uid() AND read_at IS NULL AND (p_ids IS NULL OR id=ANY(p_ids));
  GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.my_notification_preferences()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_pref public.notification_preferences;
BEGIN
  INSERT INTO public.notification_preferences(profile_id) VALUES(auth.uid()) ON CONFLICT DO NOTHING;
  SELECT * INTO v_pref FROM public.notification_preferences WHERE profile_id=auth.uid();
  RETURN to_jsonb(v_pref)-'profile_id'-'updated_at';
END; $$;

CREATE OR REPLACE FUNCTION public.save_notification_preferences(p_preferences jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_pref public.notification_preferences;
BEGIN
  INSERT INTO public.notification_preferences(profile_id,transactional_email,marketing_in_app,marketing_email,updated_at)
  VALUES(auth.uid(),COALESCE((p_preferences->>'transactional_email')::boolean,true),COALESCE((p_preferences->>'marketing_in_app')::boolean,false),COALESCE((p_preferences->>'marketing_email')::boolean,false),now())
  ON CONFLICT(profile_id) DO UPDATE SET transactional_email=EXCLUDED.transactional_email,marketing_in_app=EXCLUDED.marketing_in_app,marketing_email=EXCLUDED.marketing_email,updated_at=now()
  RETURNING * INTO v_pref; RETURN to_jsonb(v_pref)-'profile_id'-'updated_at';
END; $$;

CREATE OR REPLACE FUNCTION public.send_chat_message(p_conversation_id uuid,p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_conversation public.conversations; v_factory public.factories; v_message public.messages; v_recipient uuid; v_notification uuid;
BEGIN
  IF p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'message must contain 1 to 4000 characters' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_conversation FROM public.conversations WHERE id=p_conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_factory FROM public.factories WHERE id=v_conversation.factory_id;
  IF auth.uid()<>v_conversation.buyer_profile_id AND auth.uid()<>v_factory.owner_profile_id AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
  INSERT INTO public.messages(conversation_id,sender_profile_id,body) VALUES(p_conversation_id,auth.uid(),btrim(p_body)) RETURNING * INTO v_message;
  v_recipient:=CASE WHEN auth.uid()=v_conversation.buyer_profile_id THEN v_factory.owner_profile_id WHEN auth.uid()=v_factory.owner_profile_id THEN v_conversation.buyer_profile_id ELSE v_conversation.buyer_profile_id END;
  IF v_recipient IS NOT NULL THEN
    v_notification:=public.notification_insert(v_recipient,'chat','New message on Atelix',left(v_message.body,200),CASE WHEN v_recipient=v_conversation.buyer_profile_id THEN '/pages/brand-owner.html?convo='||p_conversation_id||'#chat' ELSE '/pages/dashboard.html?convo='||p_conversation_id||'#chat' END,false,'high',jsonb_build_object('conversation_id',p_conversation_id),'chat:'||v_message.id);
    IF COALESCE((SELECT transactional_email FROM public.notification_preferences WHERE profile_id=v_recipient),true) THEN INSERT INTO public.notification_deliveries(notification_id,channel,status) VALUES(v_notification,'email','queued') ON CONFLICT DO NOTHING; END IF;
  END IF;
  RETURN jsonb_build_object('message',to_jsonb(v_message),'notification_id',v_notification);
END; $$;

CREATE OR REPLACE FUNCTION public.intools_list_notification_campaigns()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb; BEGIN PERFORM public.intools_require_admin();
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) INTO v_result FROM (SELECT c.*,count(a.profile_id)::integer AS recipient_count FROM public.notification_campaigns c LEFT JOIN public.notification_campaign_audiences a ON a.campaign_id=c.id GROUP BY c.id) x; RETURN v_result; END; $$;

CREATE OR REPLACE FUNCTION public.intools_save_notification_campaign(p_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_campaign public.notification_campaigns; v_roles text[];
BEGIN PERFORM public.intools_require_admin();
  v_roles:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_payload->'audience'->'roles','["buyer","seller"]'::jsonb)));
  IF NOT (v_roles <@ ARRAY['buyer','seller']) THEN RAISE EXCEPTION 'unsupported audience role' USING ERRCODE='22023'; END IF;
  IF p_id IS NULL THEN INSERT INTO public.notification_campaigns(title,body,href,audience,send_email,created_by) VALUES(p_payload->>'title',p_payload->>'body',p_payload->>'href',jsonb_build_object('roles',v_roles),COALESCE((p_payload->>'send_email')::boolean,false),auth.uid()) RETURNING * INTO v_campaign;
  ELSE UPDATE public.notification_campaigns SET title=p_payload->>'title',body=p_payload->>'body',href=p_payload->>'href',audience=jsonb_build_object('roles',v_roles),send_email=COALESCE((p_payload->>'send_email')::boolean,false),updated_at=now() WHERE id=p_id AND status='draft' RETURNING * INTO v_campaign; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign not found or already sent' USING ERRCODE='40001'; END IF; RETURN to_jsonb(v_campaign); END; $$;

CREATE OR REPLACE FUNCTION public.intools_send_notification_campaign(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_campaign public.notification_campaigns; v_profile record; v_notification uuid; v_count integer:=0;
BEGIN PERFORM public.intools_require_admin(); SELECT * INTO v_campaign FROM public.notification_campaigns WHERE id=p_id FOR UPDATE; IF NOT FOUND OR v_campaign.status<>'draft' THEN RAISE EXCEPTION 'campaign is not available to send' USING ERRCODE='40001'; END IF;
  FOR v_profile IN SELECT p.id FROM public.profiles p LEFT JOIN public.notification_preferences pref ON pref.profile_id=p.id WHERE p.role::text=ANY(ARRAY(SELECT jsonb_array_elements_text(v_campaign.audience->'roles'))) AND COALESCE(pref.marketing_in_app,false)
  LOOP v_notification:=public.notification_insert(v_profile.id,'campaign',v_campaign.title,v_campaign.body,v_campaign.href,true,'normal',jsonb_build_object('campaign_id',v_campaign.id),'campaign:'||v_campaign.id||':'||v_profile.id); INSERT INTO public.notification_campaign_audiences(campaign_id,profile_id,notification_id) VALUES(v_campaign.id,v_profile.id,v_notification) ON CONFLICT DO NOTHING; IF v_campaign.send_email AND COALESCE((SELECT marketing_email FROM public.notification_preferences WHERE profile_id=v_profile.id),false) THEN INSERT INTO public.notification_deliveries(notification_id,channel,status) VALUES(v_notification,'email','queued') ON CONFLICT DO NOTHING; END IF; v_count:=v_count+1; END LOOP;
  UPDATE public.notification_campaigns SET status='sent',approved_by=auth.uid(),approved_at=now(),updated_at=now() WHERE id=p_id; RETURN jsonb_build_object('recipient_count',v_count); END; $$;

-- Keep transactional order state visible in the same inbox. The existing email
-- endpoint remains best-effort; delivery intent is recorded here atomically.
CREATE OR REPLACE FUNCTION public.admin_update_order_status(p_order_no text,p_status public.order_status,p_note text DEFAULT NULL)
RETURNS TABLE(order_no text,status public.order_status,buyer_email text,buyer_name text,total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_order public.orders; v_notification uuid; v_label text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE order_no=p_order_no FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  UPDATE public.orders SET status=p_status WHERE id=v_order.id;
  INSERT INTO public.order_status_events(order_id,status,note,created_by) VALUES(v_order.id,p_status,p_note,auth.uid());
  v_label:=replace(initcap(replace(p_status::text,'_',' ')),' ',' ');
  v_notification:=public.notification_insert(v_order.buyer_profile_id,'order','Order '||v_order.order_no||' updated',v_label||CASE WHEN p_note IS NOT NULL AND btrim(p_note)<>'' THEN ': '||left(btrim(p_note),700) ELSE '' END,'/pages/brand-owner.html#orders',false,'high',jsonb_build_object('order_no',v_order.order_no),'order:'||v_order.id||':'||p_status::text||':'||coalesce(p_note,''));
  IF COALESCE((SELECT transactional_email FROM public.notification_preferences WHERE profile_id=v_order.buyer_profile_id),true) THEN INSERT INTO public.notification_deliveries(notification_id,channel,status) VALUES(v_notification,'email','queued') ON CONFLICT DO NOTHING; END IF;
  RETURN QUERY SELECT v_order.order_no,p_status,u.email::text,coalesce(p.company_name,p.full_name),v_order.total FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=v_order.buyer_profile_id;
END; $$;

-- Intools replies use the same audited delivery path as buyer and supplier chat.
CREATE OR REPLACE FUNCTION public.intools_send_supplier_chat_message(p_conversation_id uuid,p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  v_result:=public.send_chat_message(p_conversation_id,p_body);
  RETURN v_result->'message';
END; $$;

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
DO $$ DECLARE r record; BEGIN FOR r IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('notification_insert','my_notifications','notification_unread_count','mark_notifications_read','my_notification_preferences','save_notification_preferences','send_chat_message','intools_list_notification_campaigns','intools_save_notification_campaign','intools_send_notification_campaign') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',r.signature); END LOOP; END $$;
GRANT EXECUTE ON FUNCTION public.my_notifications(integer),public.notification_unread_count(),public.mark_notifications_read(uuid[]),public.my_notification_preferences(),public.save_notification_preferences(jsonb),public.send_chat_message(uuid,text),public.intools_list_notification_campaigns(),public.intools_save_notification_campaign(uuid,jsonb),public.intools_send_notification_campaign(uuid) TO authenticated;
