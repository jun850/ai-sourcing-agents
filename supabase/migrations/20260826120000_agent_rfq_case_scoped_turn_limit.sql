-- The 5-paid-turn allowance previously applied per buyer per calendar month,
-- shared across every RFQ that buyer works on. In practice a single RFQ can
-- easily need 5 back-and-forth turns on its own (initial parse + a few gap
-- clarifications), so sharing that pool across all of a buyer's RFQs for the
-- whole month was too tight. The allowance now applies per RFQ case instead:
-- each RFQ gets its own 5 paid turns, independent of how many other RFQs the
-- buyer has open this month.
--
-- The dollar ceiling ($0.05 admitted spend per user per month, and the fleet
-- ceiling) is unchanged and still tracked monthly -- that is real provider
-- cost governance, not a per-conversation pacing limit, and stays as-is.
ALTER TABLE public.rfq_cases
  ADD COLUMN IF NOT EXISTS agent_paid_calls integer NOT NULL DEFAULT 0
    CHECK (agent_paid_calls BETWEEN 0 AND 5);

CREATE OR REPLACE FUNCTION public.agent_rfq_reserve_budget(p_profile_id uuid, p_turn_id uuid, p_reservation_microusd integer DEFAULT 10000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_month date:=date_trunc('month', now() AT TIME ZONE 'UTC')::date; v_user public.agent_rfq_monthly_user_budgets; v_fleet public.agent_rfq_monthly_fleet_budgets; v_rows integer:=0; v_turn public.agent_rfq_turns; v_case public.rfq_cases;
BEGIN
  IF p_reservation_microusd NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid agent reservation' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_month::text));
  INSERT INTO public.agent_rfq_monthly_fleet_budgets(month_start) VALUES(v_month) ON CONFLICT DO NOTHING;
  SELECT * INTO v_fleet FROM public.agent_rfq_monthly_fleet_budgets WHERE month_start=v_month FOR UPDATE;
  INSERT INTO public.agent_rfq_monthly_user_budgets(month_start,profile_id) VALUES(v_month,p_profile_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    UPDATE public.agent_rfq_monthly_fleet_budgets SET active_user_count=active_user_count+1,updated_at=now() WHERE month_start=v_month RETURNING * INTO v_fleet;
  END IF;
  SELECT * INTO v_user FROM public.agent_rfq_monthly_user_budgets WHERE month_start=v_month AND profile_id=p_profile_id FOR UPDATE;
  SELECT * INTO v_turn FROM public.agent_rfq_turns WHERE id=p_turn_id AND profile_id=p_profile_id AND status='created';
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent turn is not reservable' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_case FROM public.rfq_cases WHERE id=v_turn.rfq_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent turn is not reservable' USING ERRCODE='42501'; END IF;
  IF v_case.agent_paid_calls >= 5 THEN
    RETURN jsonb_build_object('allowed',false,'reason','case_turns','remainingTurns',0);
  END IF;
  IF v_user.settled_microusd+v_user.reserved_microusd+v_user.unknown_microusd+p_reservation_microusd > 50000
     OR v_fleet.settled_microusd+v_fleet.reserved_microusd+v_fleet.unknown_microusd+p_reservation_microusd > v_fleet.active_user_count*50000 THEN
    RETURN jsonb_build_object('allowed',false,'reason','budget','remainingTurns',GREATEST(0,5-v_case.agent_paid_calls));
  END IF;
  UPDATE public.rfq_cases SET agent_paid_calls=agent_paid_calls+1 WHERE id=v_case.id;
  UPDATE public.agent_rfq_monthly_user_budgets SET paid_calls=LEAST(5,paid_calls+1),reserved_microusd=reserved_microusd+p_reservation_microusd WHERE month_start=v_month AND profile_id=p_profile_id;
  UPDATE public.agent_rfq_monthly_fleet_budgets SET reserved_microusd=reserved_microusd+p_reservation_microusd,updated_at=now() WHERE month_start=v_month;
  UPDATE public.agent_rfq_turns SET status='reserved',reserved_microusd=p_reservation_microusd,budget_month_start=v_month WHERE id=p_turn_id;
  RETURN jsonb_build_object('allowed',true,'remainingTurns',GREATEST(0,4-v_case.agent_paid_calls));
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_rfq_settle_budget(p_turn_id uuid, p_reported_cost_microusd integer, p_resolved_model text DEFAULT NULL, p_provider text DEFAULT NULL, p_input_tokens integer DEFAULT NULL, p_output_tokens integer DEFAULT NULL, p_countable boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_turn public.agent_rfq_turns; v_month date; v_settle integer; v_unknown integer;
BEGIN
  SELECT * INTO v_turn FROM public.agent_rfq_turns WHERE id=p_turn_id FOR UPDATE;
  IF NOT FOUND OR v_turn.status <> 'reserved' THEN RETURN; END IF;
  v_month:=v_turn.budget_month_start;
  IF v_month IS NULL THEN RAISE EXCEPTION 'Reserved turn has no budget month' USING ERRCODE='55000'; END IF;
  -- Record the provider's full reported cost. Never hide an over-reservation;
  -- any overspend exhausts subsequent application reservations and is visible
  -- for the provider-side hard-cap alert/release gate.
  v_settle:=CASE WHEN p_reported_cost_microusd IS NULL THEN 0 ELSE GREATEST(p_reported_cost_microusd,0) END;
  v_unknown:=CASE WHEN p_reported_cost_microusd IS NULL THEN v_turn.reserved_microusd ELSE 0 END;
  UPDATE public.agent_rfq_monthly_user_budgets
    SET reserved_microusd=reserved_microusd-v_turn.reserved_microusd,
        settled_microusd=settled_microusd+v_settle,
        unknown_microusd=unknown_microusd+v_unknown,
        paid_calls=GREATEST(0, paid_calls - (CASE WHEN p_countable THEN 0 ELSE 1 END))
    WHERE month_start=v_month AND profile_id=v_turn.profile_id;
  UPDATE public.agent_rfq_monthly_fleet_budgets SET reserved_microusd=reserved_microusd-v_turn.reserved_microusd,settled_microusd=settled_microusd+v_settle,unknown_microusd=unknown_microusd+v_unknown,updated_at=now() WHERE month_start=v_month;
  IF NOT p_countable THEN
    UPDATE public.rfq_cases SET agent_paid_calls=GREATEST(0, agent_paid_calls-1) WHERE id=v_turn.rfq_case_id;
  END IF;
  UPDATE public.agent_rfq_turns SET status='settled',reported_cost_microusd=p_reported_cost_microusd,resolved_model=left(p_resolved_model,240),provider=left(p_provider,240),input_tokens=p_input_tokens,output_tokens=p_output_tokens,completed_at=now() WHERE id=p_turn_id;
END;
$$;
