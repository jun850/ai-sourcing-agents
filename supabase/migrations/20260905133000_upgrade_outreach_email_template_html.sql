-- Upgrade the seeded supplier outreach template to a complete, email-safe HTML document.
-- Presentation stays inline because supplier mail clients do not reliably preserve stylesheets.

DO $migration$
DECLARE
  v_active public.rfq_outreach_template_versions;
  v_next integer;
BEGIN
  SELECT * INTO v_active
  FROM public.rfq_outreach_template_versions
  WHERE locale='en' AND status='active'
  FOR UPDATE;

  -- Only replace the original plain-text seed. Custom HTML templates remain untouched.
  IF v_active.id IS NOT NULL AND lower(btrim(v_active.body_template)) NOT LIKE '<!doctype html>%'
     AND v_active.version=1 THEN
    UPDATE public.rfq_outreach_template_versions
    SET status='retired'
    WHERE locale='en' AND status='active';

    SELECT COALESCE(max(version),0)+1 INTO v_next
    FROM public.rfq_outreach_template_versions
    WHERE locale='en';

    INSERT INTO public.rfq_outreach_template_versions(
      locale, version, subject_template, body_template, status, activated_at
    )
    VALUES (
      'en',
      v_next,
      'RFQ [.case_no] — [.product]',
      $template$
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>RFQ [.case_no] — [.product]</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f9;color:#202936;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;padding:0;background:#f4f6f9;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #dfe4eb;border-radius:14px;">
            <tr>
              <td style="padding:36px 36px 10px;">
                <div style="color:#28704b;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Atelix Operations</div>
                <h1 style="margin:18px 0 0;color:#202936;font-size:28px;line-height:1.15;font-weight:700;">Production sourcing request</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 36px 0;color:#334256;font-size:16px;line-height:1.6;">
                <p style="margin:0 0 18px;">Hello [.supplier_name],</p>
                <p style="margin:0;">Atelix is reviewing production partners for the following sourcing request.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 36px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border:1px solid #dfe4eb;border-radius:10px;">
                  <tr><td style="padding:12px 14px;border-bottom:1px solid #edf0f3;color:#758091;font-size:13px;font-weight:700;">Product</td><td style="padding:12px 14px;border-bottom:1px solid #edf0f3;color:#202936;font-size:14px;text-align:right;">[.product]</td></tr>
                  <tr><td style="padding:12px 14px;border-bottom:1px solid #edf0f3;color:#758091;font-size:13px;font-weight:700;">Quantity</td><td style="padding:12px 14px;border-bottom:1px solid #edf0f3;color:#202936;font-size:14px;text-align:right;">[.quantity]</td></tr>
                  <tr><td style="padding:12px 14px;border-bottom:1px solid #edf0f3;color:#758091;font-size:13px;font-weight:700;">Material</td><td style="padding:12px 14px;border-bottom:1px solid #edf0f3;color:#202936;font-size:14px;text-align:right;">[.material]</td></tr>
                  <tr><td style="padding:12px 14px;border-bottom:1px solid #edf0f3;color:#758091;font-size:13px;font-weight:700;">Colors</td><td style="padding:12px 14px;border-bottom:1px solid #edf0f3;color:#202936;font-size:14px;text-align:right;">[.colors]</td></tr>
                  <tr><td style="padding:12px 14px;border-bottom:1px solid #edf0f3;color:#758091;font-size:13px;font-weight:700;">Sizes</td><td style="padding:12px 14px;border-bottom:1px solid #edf0f3;color:#202936;font-size:14px;text-align:right;">[.sizes]</td></tr>
                  <tr><td style="padding:12px 14px;border-bottom:1px solid #edf0f3;color:#758091;font-size:13px;font-weight:700;">Certifications requested</td><td style="padding:12px 14px;border-bottom:1px solid #edf0f3;color:#202936;font-size:14px;text-align:right;">[.certifications]</td></tr>
                  <tr><td style="padding:12px 14px;border-bottom:1px solid #edf0f3;color:#758091;font-size:13px;font-weight:700;">Buyer-stated budget</td><td style="padding:12px 14px;border-bottom:1px solid #edf0f3;color:#202936;font-size:14px;text-align:right;">[.budget]</td></tr>
                  <tr><td style="padding:12px 14px;color:#758091;font-size:13px;font-weight:700;">Required timeline</td><td style="padding:12px 14px;color:#202936;font-size:14px;text-align:right;">[.timeline]</td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 36px 10px;color:#334256;font-size:16px;line-height:1.6;">
                <p style="margin:0;">Please confirm whether this request fits your capabilities and provide your current MOQ, unit price, lead time, sample terms, production availability, certification evidence, and quote validity.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 36px 36px;color:#334256;font-size:16px;line-height:1.6;">
                <p style="margin:0;">Regards,<br><strong style="color:#202936;">Atelix Operations</strong></p>
                <p style="margin:26px 0 0;color:#9aa4b2;font-size:12px;line-height:1.5;">RFQ [.case_no] · This message is a sourcing request for supplier review.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
      $template$,
      'active',
      now()
    );
  END IF;
END;
$migration$;
