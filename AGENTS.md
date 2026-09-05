# Agent contribution rules

- Do not add a new page section, subsection, promotional strip, or content block unless the user explicitly asks for it.
- Surface operational updates through existing lists, filters, rows, cards, counts, and status patterns before proposing new layout.
- Atelix is broker-led fashion sourcing for apparel, fabrics, trims, labels, accessories, and OEM or cut-and-sew. Do not add catalogue shopping, seller storefronts, carts, wishlists, public supplier directories, or a standalone Products workspace (retired — buyer surfaces are Home, Requests, Messages, Invoices).
- The supported path is prompt or reference -> RFQ -> human review -> vetted matching -> invoice and Stripe payment -> quality and logistics coordination. Keep model output as a drafting aid and preserve reviewed/server-authoritative truth boundaries.
- Supabase records and guarded server operations are authoritative. Models may structure or summarize supplied facts but must not invent supplier identity, MOQ, pricing, certification, capacity, availability, or payment state.
- Prevent PostgREST load spikes in every task: before implementing or releasing any application code, Edge/server function, migration/RPC, test, script, backfill, import, automation, polling loop, or user-seeding flow, inspect the changed and invoked code for Supabase/PostgREST call volume. Never issue unbounded, per-record, N+1, retry-storm, or tight-polling calls. Prefer one guarded SQL/RPC bulk operation or paginated batches; cap concurrency, add rate limiting/backoff, make runs resumable/idempotent, and use a dry run or small sampled batch before any larger execution. Record the load-safety check in task verification whenever the task can invoke Supabase.
- Never rewrite an applied migration. Use additive migrations until a separately verified post-cutover baseline operation.
- Run local lint, build, database/RLS, route, keyboard, responsive, and payment regression gates before any production action.
- Stripe Checkout amounts and eligibility are computed server-side. Verified, idempotent webhooks are the only payment-settlement authority.
- Never place service-role, Stripe secret, webhook, or OpenRouter credentials in Vite code or `VITE_*` variables.
- Keep interactive UI plain and modern: fields, toggles, icon buttons, tooltips,
  prompts, and related controls must not use green focus rings, colored halos,
  or decorative control-level shadows. Use a visible neutral slate outline or
  border for keyboard focus; preserve soft neutral shadows only on larger
  surfaces where the protected visual contract calls for them.
- Treat the dashboard main flow as a protected visual contract. The primary prompt
  and authenticated conversation composer use a white rounded surface with a
  soft shadow, no CSS border, and no green `:focus-within` frame. Any dashboard
  change must check both `/dashboard` and the post-login RFQ workspace states;
  run `npm run qa:dashboard-prompt`, build, and the RFQ contract tests before
  release. Do not restore the old bordered or green-ring treatment.
