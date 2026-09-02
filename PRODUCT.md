# Atelix product contract

## Register and platform

Product UI on the web.

## Purpose

Atelix is a broker-led fashion sourcing workspace for apparel, fabrics, trims, labels, accessories, and OEM or cut-and-sew production. A buyer begins with a prompt, image, or technical reference. Atelix turns that material into a traceable RFQ, supports human review and vetted supplier matching, and records the commercial handoff through invoices and Stripe-hosted payment. The workflow continues through quality and logistics coordination, with each handoff retaining its evidence and owner.

Atelix is not a public catalogue, seller storefront, cart, wishlist, or self-serve supplier directory. Supplier identity, MOQ, capacity, certification, pricing, payment state, and production commitments come only from reviewed records and authoritative server systems.

## Users

- Buyers create and follow their own sourcing cases, attachments, invoices, and payment history.
- Atelix operators review access requests, supplier submissions, RFQs, matches, orders, and invoices through the unlinked Intools route.
- Suppliers submit capabilities for private review; Atelix does not expose a public supplier directory.

## Product principles

- One clear next action on each working surface.
- Human approval before supplier outreach or commercial commitment.
- Hard eligibility checks before any model-written summary.
- Models may structure or summarize supplied facts, but never create commercial or supplier facts.
- Supabase is authoritative for identity, roles, sourcing records, and permissions.
- Supabase access must remain load-safe across every product change. Before implementing or releasing application code, server/Edge code, migrations/RPCs, tests, scripts, imports, backfills, automation, polling, or user-seeding, inspect the affected and invoked code for PostgREST call volume. Use bounded, idempotent bulk RPC/SQL or paginated batches with limited concurrency and retry backoff; never introduce high-frequency loops, N+1/per-record request storms, retry storms, or tight polling. Record this review in verification whenever a task can invoke Supabase.
- Stripe webhooks are authoritative for payment settlement.
- Quality, logistics, invoice, and payment states are authoritative only when recorded by guarded server workflows.
- Every consequential change is attributable and auditable.

## Workspace flow contract

- The buyer starts on the existing dashboard prompt. Creating a request creates
  the durable RFQ case and its buyer/assistant chat thread together.
- The initial prompt remains one restrained, editorial working surface. While a
  request is being created, its text and references stay in place, duplicate
  submission is disabled, and success moves directly into the request-scoped
  RFQ route. The first agent turn uses document-shaped skeletons until reviewed
  RFQ fields are available; empty optional fields remain explicit rather than
  being filled with inferred requirements.
- The dashboard prompt and authenticated conversation composer share the same
  white rounded, soft-shadow surface. They must remain borderless in default and
  focused states; focus must not add a green frame or outline around the
  composer container.
- Chat messages are persisted to the RFQ thread through guarded workspace RPCs;
  the assistant acknowledgement is status-only and must not invent supplier,
  price, MOQ, certification, capacity, availability, quote, or payment facts.
- The RFQ conversation uses the server-side OpenRouter preset
  `@preset/marketplace-copilot`. It may clarify, refine, or double-check the
  active draft, but it can save only the eight reviewed RFQ fields (product,
  quantity, material, certifications, colors, sizes, budget, and timeline)
  through an optimistic, revision-checked server operation.
- A conversational patch updates the live RFQ immediately, states the fields
  changed, and offers a reversible undo while the RFQ is still a draft.
  Questions alone never mutate the RFQ. Submitted RFQs remain read-only to the
  agent. If authoritative payment or order context is unavailable, the agent
  directs the buyer to `info@arcanawangsa.com` rather than guessing.
- The buyer workspace has four surfaces: Home (the prompt), Requests, Messages,
  and Invoices. There is no Products surface; immutable order-item snapshots and
  order history are read inside the owning RFQ's Timeline and Quotes tabs and in
  the linked invoice, never as a catalogue browse surface.
- Requests are the durable RFQ index and timeline entry point.
- Opening an RFQ from Requests keeps the request-scoped route and Requests
  navigation selection active, including on a direct/deep link.
- A reorder is only ever a fresh RFQ draft pre-filled from a prior request; the
  workspace never sends a supplier request from a read-only record surface.
- The workspace top bar has one command palette ("Search everything", Cmd/Ctrl+K):
  quick navigation actions, recent requests, and free-text search over the
  buyer's own RFQ cases and invoices through the guarded `workspace_search` RPC.
  Results are navigational only; the palette never surfaces supplier, price, MOQ,
  certification, capacity, availability, quote, or payment facts.
- Invoices continue through workspace invoice RPCs and Stripe Checkout; the
  browser may request checkout but cannot set totals or settlement state.
- Legacy `/dashboard/products` links redirect to Requests; the retired product
  catalogue and its Algolia index are not reintroduced.
- Sign-up submissions are stored as Supabase `registration_requests` in
  `pending_review`; Intools exposes the queue and approval action only after
  the server confirms an administrator role.
- Intools is one operator shell: a dark, collapsible left sidebar (wordmark,
  nine section links, operator pill), a slim top bar (dashboard link,
  notifications, avatar), and one work surface. Its sections are Analytics,
  Invoices, Orders, Requests, Sign-up requests, Suppliers, Knowledge, Messages,
  and Audit history. There is no separate "RFQ review" surface; Requests is the
  single RFQ queue.
- Every section except Analytics and Messages is one bounded operational list:
  a quiet filter row (search + status chips), rectangular selectable rows with a
  section-accent lead chip and a pill status, and a moss bulk-action toolbar when
  rows are selected. Bulk actions run the same guarded per-record server
  operations one row at a time and never bypass eligibility. Opening a row slides
  a right-hand detail drawer over a scrim; there is no full-page record view and
  no storefront-style card per row.
- The detail drawer carries the record's fields plus the operator actions that
  already existed: invoice send / record-payment / cancel / notes with read-only
  line items, payments, and audit history; order status change with an optional
  note beside immutable items, fulfillment, and activity; a Requests supplier-
  match flow (approve or reject a match, enter a quote with a total, select one,
  then generate the linked invoice with every field carried over and editable);
  supplier approve / reject / archive; sign-up approve / decline; knowledge
  publish / archive. The browser never writes payment settlement or order totals.
- Centered modals cover create and upload flows (new invoice, new supplier, bulk
  supplier upload, knowledge upload) and bulk-destructive confirmation; a single
  bottom toast confirms each completed action.
- Intools top-level workspaces use canonical private routes
  `/intools/<section>` for the nine sections, with `/intools/<section>/<id>`
  opening that record's drawer. `/intools` resolves to `/intools/analytics`, and
  the retired `/intools/rfq` (and `/intools/rfq/<id>`) paths redirect to
  `/intools/requests` so older links keep working. `/intools` and
  `/intools/<path>` stay `no-store` and `noindex`.
- Intools Analytics is authoritative RFQ and commercial activity (dashboard
  users, RFQs created, quote pipeline, invoice total, verified suppliers,
  supplier countries, and a daily RFQ-creation trend) shown beside dated Google
  Search Console CSV snapshots imported manually and kept separate from live
  commercial records.
- The sign-up screen is an access-request workflow, not immediate self-serve
  account creation. It records the request, explains the human review gate,
  and only promises an email invitation after approval.
- Existing approved users can choose password sign-in or a single email message
  containing both a magic link and a six-digit OTP. Either completes the same
  Supabase session; the OTP is an accessible fallback, never a second account
  path.
- Magic-link requests are checked server-side against the latest access request.
  Only `approved` or `invited` emails may receive a link, and Auth may not create
  a missing user during sign-in. Every valid email submission receives the same
  generic response so account and approval status cannot be enumerated.
- The sign-in and sign-up screens use no green on any focus indicator: fields,
  selects, the primary action, and links show a neutral slate focus ring only.
  The global green accessibility focus ring is overridden within these screens.
- Access request, sign-in, and supplier-intake forms use the shared Material
  component layer. Searchable lookup controls are limited to bounded,
  user-supplied options such as country calling code, manufacturing category,
  and certification; selecting an option does not verify or create supplier
  capability, certification, or commercial facts.
- After login, the dashboard is the buyer's private RFQ workspace: a persistent
  request sidebar and RFQ context header frame a split conversation and live
  RFQ document. The buyer can save edits and submit the RFQ, but submission
  only queues Atelix review; it never sends supplier outreach directly.
- The live RFQ view exposes the durable RFQ, timeline, quotes, orders, and
  files records in one workspace. Empty tabs remain explicit until guarded
  records exist, and the assistant presents drafting progress only, never
  invented supplier or commercial facts.
- Authenticated interactions are sourcing-agent interactions, not retail-commerce
  interactions. Requests are operational cases, order-item snapshots stay inside
  their RFQ and invoice records, suppliers are reviewed private records, and
  queues expose the next sourcing decision. Do not introduce browsing, storefront,
  seller, cart, wishlist, recommendation, product-catalogue, or shopping metaphors.
- The buyer dashboard is conversational-first, similar to a ChatGPT-style
  drafting workspace beside a live RFQ document. Agent output remains a draft
  aid and must distinguish supplied facts, missing evidence, and human review;
  it never invents supplier or commercial truth.
- The Home prompt may show one bounded, self-hosted illustrative animation while
  the buyer is composing a brief, and the existing drafting indicator once a
  request is being created. Both are decorative context only, carry no status
  meaning, must not delay task content, and are replaced by a static state under
  reduced-motion.
- Authenticated long lists use stable cursor pages, append loading, duplicate
  protection, retry, end-of-queue feedback, and preserved selection/scroll
  context. They are operational queues rather than catalogue grids.
- Messages are human buyer–Atelix Operations conversations scoped to one RFQ.
  Buyers use `/dashboard/messages`; confirmed administrators use `/intools/messages`.
  Realtime updates, attachment access, unread state, and reply reminders use
  guarded RFQ Ops server contracts, never direct browser table writes.
- On desktop, Messages is a bounded inbox: the request queue and selected
  thread scroll independently while the thread composer stays visible at the
  bottom of its pane. Choosing a request replaces the thread without moving the
  surrounding workspace or hiding the composer.
- Message authorship is structural: buyer messages are warm and right-aligned;
  Atelix Operations messages are white and left-aligned. The thread header
  carries the Atelix Operations avatar and RFQ reference; the party mapping is
  the same in the buyer and Intools views.
- An open conversation behaves as live chat: private, RFQ-scoped Supabase
  Broadcast delivery appends new messages without a page refresh or polling.
  Existing history uses the same party mapping, and attachment enrichment never
  replaces the active thread.
- Buyer message context uses the buyer's personal profile name, not the
  company name attached to the sourcing case.
- An unanswered buyer message reminds `info@arcanawangsa.com` after five hours;
  an unanswered Operations message reminds the buyer’s authenticated email.
  Reminders recur daily until an opposite-party reply and respect the buyer’s
  transactional-email preference.

## Accessibility

Target WCAG 2.2 Level AA. Support keyboard-only use, visible and unobscured focus, semantic status messages, reduced motion, 200% text resize, and 400% reflow without loss of task content.

Authenticated workspace scrolling belongs to the full work area at the viewport edge; centered reading and table widths must be applied by an inner surface so the scrollbar never appears beside a constrained table.

Route and data waits preserve the expected layout with content-shaped skeletons rather than visible loading sentences. Busy regions and controls expose programmatic state, and skeleton shimmer has a reduced-motion alternative.

The command palette is a keyboard-complete modal dialog: it traps focus, closes on Escape and returns focus to its trigger, exposes an accessible name and a live result count, and its options are reachable with arrow keys and activated with Enter.

Access-request fields preserve native required validation without relying on
visible asterisks. The optional phone number is entered as one international-
format value so keyboard and mobile autofill behavior remain predictable.

Landing and resource-page FAQs keep their existing sourcing questions and
answers in one shared native, keyboard-operable disclosure pattern. Expanding
a row reveals only its canonical answer and does not create a new route or
sourcing claim.

The landing trusted-brand rail presents only the canonical local logo assets.
Its blur transition changes presentation, not the represented brand set, and
the full list remains available as one accessible label when motion is paused
or reduced.
