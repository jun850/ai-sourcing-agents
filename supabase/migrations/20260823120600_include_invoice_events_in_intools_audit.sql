-- The operational audit feed combines legacy Intools and invoice-ledger events.
CREATE OR REPLACE FUNCTION public.intools_list_audit(p_target_type text DEFAULT NULL,p_target_id uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',x.id,'admin_id',x.admin_id,'admin_name',x.admin_name,'target_type',x.target_type,
    'target_id',x.target_id,'action',x.action,'summary',x.summary,'metadata',x.metadata,'created_at',x.created_at
  ) ORDER BY x.created_at DESC),'[]'::jsonb) INTO v_result
  FROM (
    SELECT * FROM (
      SELECT a.id,a.admin_id,COALESCE(p.full_name,p.company_name,'Admin') AS admin_name,a.target_table AS target_type,a.target_id,a.action,a.summary,a.metadata,a.created_at
      FROM public.admin_audit_log a JOIN public.profiles p ON p.id=a.admin_id
      UNION ALL
      SELECT a.id,a.actor_profile_id AS admin_id,COALESCE(p.full_name,p.company_name,'System') AS admin_name,'invoices'::text AS target_type,a.invoice_id AS target_id,a.action,a.summary,a.metadata,a.created_at
      FROM public.invoice_audit_log a LEFT JOIN public.profiles p ON p.id=a.actor_profile_id
    ) rows
    WHERE (p_target_type IS NULL OR rows.target_type=p_target_type) AND (p_target_id IS NULL OR rows.target_id=p_target_id)
    ORDER BY rows.created_at DESC
    LIMIT LEAST(GREATEST(p_limit,1),500)
  ) x;
  RETURN v_result;
END; $$;
