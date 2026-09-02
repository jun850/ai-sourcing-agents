-- Historical buyer imports stored self-reported annual revenue in Auth metadata,
-- rather than registration_requests. Keep the aggregate separate from the
-- commercial overview so no buyer-level data is exposed to the browser.
CREATE OR REPLACE FUNCTION public.intools_get_customer_distribution()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.intools_require_admin();
  WITH customer_base AS (
    SELECT
      COALESCE(
        NULLIF(btrim(p.country), ''),
        NULLIF(btrim(r.country_code), ''),
        NULLIF(btrim(u.raw_user_meta_data->>'country'), ''),
        NULLIF(btrim(a.country), '')
      ) AS country,
      COALESCE(
        NULLIF(btrim(r.annual_revenue), ''),
        NULLIF(btrim(u.raw_user_meta_data->>'annual_revenue'), '')
      ) AS annual_revenue
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN LATERAL (
      SELECT rr.country_code, rr.annual_revenue
      FROM public.registration_requests rr
      WHERE lower(rr.email) = lower(u.email)
        AND rr.status IN ('approved', 'invited')
      ORDER BY rr.updated_at DESC, rr.created_at DESC
      LIMIT 1
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT address.country
      FROM public.addresses address
      WHERE address.profile_id = p.id
        AND NULLIF(btrim(address.country), '') IS NOT NULL
      ORDER BY address.is_default DESC, address.created_at DESC
      LIMIT 1
    ) a ON true
    WHERE p.role = 'buyer'
  ), geography AS (
    SELECT country AS label, count(*)::integer AS customers,
      round(count(*) * 100.0 / NULLIF(sum(count(*)) OVER (), 0), 1) AS percentage
    FROM customer_base WHERE country IS NOT NULL GROUP BY country
  ), revenue_tiers AS (
    SELECT annual_revenue AS label, count(*)::integer AS customers,
      round(count(*) * 100.0 / NULLIF(sum(count(*)) OVER (), 0), 1) AS percentage
    FROM customer_base WHERE annual_revenue IS NOT NULL GROUP BY annual_revenue
  )
  SELECT jsonb_build_object(
    'customers', (SELECT count(*) FROM customer_base),
    'countries_reported', (SELECT count(country) FROM customer_base),
    'revenue_reported', (SELECT count(annual_revenue) FROM customer_base),
    'geography', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'customers', customers, 'percentage', percentage) ORDER BY customers DESC, label), '[]'::jsonb) FROM geography),
    'revenue_tiers', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', label, 'customers', customers, 'percentage', percentage) ORDER BY customers DESC, label), '[]'::jsonb) FROM revenue_tiers)
  ) INTO v_result;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.intools_get_customer_distribution() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intools_get_customer_distribution() TO authenticated;
