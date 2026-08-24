-- Clarifying-question turns (the assistant asking the buyer for a still-missing
-- optional detail, e.g. colors or certifications, without delivering a saved
-- answer) should not spend one of the buyer's 5 monthly paid AI turns. The
-- turn is still reserved and its real provider cost is still settled and
-- tracked against the fleet/user microusd caps -- only the paid_calls counter
-- that gates further usage is refunded, since it was optimistically
-- incremented at reservation time before the outcome kind was known.
DROP FUNCTION IF EXISTS public.agent_rfq_settle_budget(uuid, integer, text, text, integer, integer);

CREATE FUNCTION public.agent_rfq_settle_budget(p_turn_id uuid, p_reported_cost_microusd integer, p_resolved_model text DEFAULT NULL, p_provider text DEFAULT NULL, p_input_tokens integer DEFAULT NULL, p_output_tokens integer DEFAULT NULL, p_countable boolean DEFAULT true)
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
  UPDATE public.agent_rfq_turns SET status='settled',reported_cost_microusd=p_reported_cost_microusd,resolved_model=left(p_resolved_model,240),provider=left(p_provider,240),input_tokens=p_input_tokens,output_tokens=p_output_tokens,completed_at=now() WHERE id=p_turn_id;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_rfq_settle_budget(uuid, integer, text, text, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rfq_settle_budget(uuid, integer, text, text, integer, integer, boolean) TO service_role;
