-- Remove the fixed 5-conversational-turn cap entirely (both the earlier
-- per-user-per-month version and the more recent per-RFQ version). The real
-- constraint that actually protects against runaway spend is, and remains,
-- the dollar ceiling below (per-user and fleet, per calendar month) -- the
-- turn count was an arbitrary secondary gate on top of it, and in practice
-- it kept blocking legitimate multi-turn conversations on a single RFQ.
--
-- remainingTurns in the response is now an honest estimate derived from the
-- remaining dollar budget (headroom / reservation-per-turn) rather than a
-- fixed number, so the buyer-facing "N left" copy still means something.
CREATE OR REPLACE FUNCTION public.agent_rfq_reserve_budget(p_profile_id uuid, p_turn_id uuid, p_reservation_microusd integer DEFAULT 10000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_month date:=date_trunc('month', now() AT TIME ZONE 'UTC')::date; v_user public.agent_rfq_monthly_user_budgets; v_fleet public.agent_rfq_monthly_fleet_budgets; v_rows integer:=0; v_turn public.agent_rfq_turns; v_headroom integer;
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
  v_headroom := LEAST(50000 - (v_user.settled_microusd+v_user.reserved_microusd+v_user.unknown_microusd), v_fleet.active_user_count*50000 - (v_fleet.settled_microusd+v_fleet.reserved_microusd+v_fleet.unknown_microusd));
  IF v_headroom < p_reservation_microusd THEN
    RETURN jsonb_build_object('allowed',false,'reason','budget','remainingTurns',0);
  END IF;
  UPDATE public.agent_rfq_monthly_user_budgets SET reserved_microusd=reserved_microusd+p_reservation_microusd WHERE month_start=v_month AND profile_id=p_profile_id;
  UPDATE public.agent_rfq_monthly_fleet_budgets SET reserved_microusd=reserved_microusd+p_reservation_microusd,updated_at=now() WHERE month_start=v_month;
  UPDATE public.agent_rfq_turns SET status='reserved',reserved_microusd=p_reservation_microusd,budget_month_start=v_month WHERE id=p_turn_id;
  RETURN jsonb_build_object('allowed',true,'remainingTurns',GREATEST(0,(v_headroom-p_reservation_microusd)/10000));
END;
$$;
