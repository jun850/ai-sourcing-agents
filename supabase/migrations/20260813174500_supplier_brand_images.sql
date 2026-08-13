-- Separate supplier logo and company-page imagery while preserving legacy img.
ALTER TABLE public.factories
  ADD COLUMN IF NOT EXISTS logo_img text,
  ADD COLUMN IF NOT EXISTS page_img text;

UPDATE public.factories
SET page_img = img
WHERE page_img IS NULL AND img IS NOT NULL;

CREATE OR REPLACE FUNCTION public.intools_save_supplier_with_images(
  p_supplier_id uuid,
  p_payload jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_saved jsonb;
  v_supplier public.factories;
BEGIN
  PERFORM public.intools_require_admin();

  -- The established supplier writer remains the single validation and audit
  -- boundary. Image-only fields are applied in this same transaction.
  v_saved := public.intools_save_supplier(
    p_supplier_id,
    p_payload - 'logo_img' - 'page_img',
    p_expected_updated_at
  );

  UPDATE public.factories AS f
  SET
    logo_img = CASE WHEN p_payload ? 'logo_img' THEN p_payload->>'logo_img' ELSE f.logo_img END,
    page_img = CASE WHEN p_payload ? 'page_img' THEN p_payload->>'page_img' ELSE f.page_img END
  WHERE f.id = (v_saved->>'id')::uuid
  RETURNING f.* INTO v_supplier;

  RETURN to_jsonb(v_supplier);
END;
$$;

REVOKE ALL ON FUNCTION public.intools_save_supplier_with_images(uuid,jsonb,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intools_save_supplier_with_images(uuid,jsonb,timestamptz) TO authenticated;
