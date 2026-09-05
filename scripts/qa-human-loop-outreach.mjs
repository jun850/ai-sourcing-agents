import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [outreach, quote, ui, client, server] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260905093000_human_loop_wave2_outreach.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260905094500_human_loop_wave3_atomic_quote.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/intools.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/supabase.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/index.mjs", import.meta.url), "utf8"),
]);

for (const token of ["[.case_no]", "[.product]", "[.quantity]", "[.material]", "[.certifications]", "[.colors]", "[.sizes]", "[.budget]", "[.timeline]", "[.supplier_name]"]) {
  assert.match(outreach, new RegExp(token.replace(/[.\[\]]/g, "\\$&")));
}
for (const rpc of ["intools_get_rfq_outreach_settings", "intools_save_rfq_outreach_template", "intools_activate_rfq_outreach_template", "intools_prepare_rfq_outreach_draft", "intools_update_rfq_outreach_draft", "intools_reset_rfq_outreach_draft", "intools_record_rfq_outreach_copy", "intools_mark_rfq_supplier_contacted", "intools_record_rfq_supplier_response"]) {
  assert.match(outreach, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}`));
  assert.match(client, new RegExp(`"${rpc}"`));
  assert.match(server, new RegExp(`"${rpc}"`));
}
assert.match(outreach, /status IN \('draft','active','retired'\)/);
assert.match(outreach, /status IN \('draft','copied','contacted','superseded'\)/);
assert.match(outreach, /Supplier outreach templates are not enabled/);
assert.match(outreach, /Supplier response requires a valid evidence reference/);
assert.match(ui, /Prepare supplier email/);
assert.match(ui, /Copying|does not mark the supplier contacted/);
assert.match(ui, /Record supplier response/);
assert.match(ui, /Master settings/);

assert.match(quote, /CREATE OR REPLACE FUNCTION public\.intools_publish_rfq_quote_reviewed/);
assert.match(quote, /FOR UPDATE/);
assert.match(quote, /v_visible_count>=3/);
assert.match(quote, /supplier_response_event_id/);
assert.match(quote, /Use reviewed atomic quote publication/);
assert.match(client, /"intools_publish_rfq_quote_reviewed"/);
assert.doesNotMatch(ui, /setIntoolsRfqQuoteTotal\(/);
assert.doesNotMatch(ui, /upsertIntoolsRfqQuote\(/);

console.log("human-loop outreach and atomic quote contracts passed");
