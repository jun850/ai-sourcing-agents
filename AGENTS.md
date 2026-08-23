# Agent contribution rules

- Do not add a new page section, subsection, promotional strip, or content block unless the user explicitly asks for it.
- Surface operational updates through existing lists, filters, rows, cards, counts, and status patterns before proposing new layout.
- Atelix is broker-led fashion sourcing for apparel, fabrics, trims, labels, accessories, and OEM or cut-and-sew. Do not add catalogue shopping, seller storefronts, carts, wishlists, or public supplier directories.
- The supported path is prompt or reference -> RFQ -> human review -> vetted matching -> invoice and Stripe payment -> quality and logistics coordination. Keep model output as a drafting aid and preserve reviewed/server-authoritative truth boundaries.
- Supabase records and guarded server operations are authoritative. Models may structure or summarize supplied facts but must not invent supplier identity, MOQ, pricing, certification, capacity, availability, or payment state.
- Never rewrite an applied migration. Use additive migrations until a separately verified post-cutover baseline operation.
- Run local lint, build, database/RLS, route, keyboard, responsive, and payment regression gates before any production action.
- Stripe Checkout amounts and eligibility are computed server-side. Verified, idempotent webhooks are the only payment-settlement authority.
- Never place service-role, Stripe secret, webhook, or OpenRouter credentials in Vite code or `VITE_*` variables.
