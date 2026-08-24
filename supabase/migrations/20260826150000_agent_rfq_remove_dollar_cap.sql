-- Explicit decision: no AI-turn limitation at all right now, neither the
-- earlier fixed-turn-count gate (already removed) nor the dollar headroom
-- gate. A call is never denied for budget reasons. Actual cost is still
-- recorded (settled/reserved/unknown_microusd) for visibility, it just no
-- longer blocks anything -- re-add a gate here later if real spend needs
-- to be capped again.
CREATE OR REPLACE FUNCTION public.agent_rfq_reserve_budget(p_profile_id uuid, p_turn_id uuid, p_reservation_microusd integer DEFAULT 10000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_month date:=date_trunc('month', now() AT TIME ZONE 'UTC')::date; v_rows integer:=0;
BEGIN
  IF p_reservation_microusd NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid agent reservation' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_month::text));
  INSERT INTO public.agent_rfq_monthly_fleet_budgets(month_start) VALUES(v_month) ON CONFLICT DO NOTHING;
  INSERT INTO public.agent_rfq_monthly_user_budgets(month_start,profile_id) VALUES(v_month,p_profile_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    UPDATE public.agent_rfq_monthly_fleet_budgets SET active_user_count=active_user_count+1,updated_at=now() WHERE month_start=v_month;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agent_rfq_turns WHERE id=p_turn_id AND profile_id=p_profile_id AND status='created') THEN
    RAISE EXCEPTION 'Agent turn is not reservable' USING ERRCODE='42501';
  END IF;
  UPDATE public.agent_rfq_monthly_user_budgets SET reserved_microusd=reserved_microusd+p_reservation_microusd WHERE month_start=v_month AND profile_id=p_profile_id;
  UPDATE public.agent_rfq_monthly_fleet_budgets SET reserved_microusd=reserved_microusd+p_reservation_microusd,updated_at=now() WHERE month_start=v_month;
  UPDATE public.agent_rfq_turns SET status='reserved',reserved_microusd=p_reservation_microusd,budget_month_start=v_month WHERE id=p_turn_id;
  RETURN jsonb_build_object('allowed',true,'remainingTurns',null);
END;
$$;
