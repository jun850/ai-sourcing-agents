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
- Requests are the durable RFQ index and timeline entry point. Products are
  buyer-owned immutable order-item snapshots, never a catalogue browse surface.
- Opening an RFQ from Requests keeps the request-scoped route and Requests
  navigation selection active, including on a direct/deep link.
- The Products workspace groups those snapshots by operational stage and supports
  search, supplier filtering, sorting, deep-linked read-only detail, linked-RFQ
  navigation, invoice handoff, and a reorder action that only pre-fills a fresh
  RFQ draft. It never sends a supplier request from the product surface.
- Products use a dense desktop table that reflows into labelled structured rows
  on narrow screens. Product detail keeps the immutable snapshot and order
  history in the main column and the current stage, invoice/RFQ handoff, and
  guarded reorder action in a secondary rail.
- Invoices continue through workspace invoice RPCs and Stripe Checkout; the
  browser may request checkout but cannot set totals or settlement state.
- Sign-up submissions are stored as Supabase `registration_requests` in
  `pending_review`; Intools exposes the queue and approval action only after
  the server confirms an administrator role.
- Intools record queues keep the comparison task in one bounded list panel:
  stable columns on desktop and compact structured rows on narrow screens.
  Selecting a record opens its existing detail workflow; it does not create a
  separate storefront-style card surface for every row.
- Intools top-level workspaces use canonical private routes: `/intools/invoices`,
  `/intools/rfq`, `/intools/requests`, `/intools/orders`, `/intools/audit`,
  `/intools/registrations`, and `/intools/suppliers`. Record detail stays under
  its owning workspace route.
- Intools order detail keeps immutable order items, fulfillment records, and
  status activity readable beside server-derived commercial and delivery
  context. Administrators can request a status change with an optional audit
  note; the guarded server workflow records the event and controls buyer
  notification. The browser never writes payment settlement or order totals.
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
- Authenticated interactions are sourcing-agent interactions, not marketplace
  interactions. Requests are operational cases, products are immutable order
  snapshots, suppliers are reviewed private records, and queues expose the
  next sourcing decision. Do not introduce browsing, storefront, seller,
  cart, wishlist, recommendation, or shopping metaphors.
- The buyer dashboard is conversational-first, similar to a ChatGPT-style
  drafting workspace beside a live RFQ document. Agent output remains a draft
  aid and must distinguish supplied facts, missing evidence, and human review;
  it never invents supplier or commercial truth.
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
- Message authorship is structural as well as textual: the current participant
  appears in a warm right-aligned bubble, while the other party appears in a
  white left-aligned bubble with an identifying avatar. The same rule mirrors
  correctly between buyer and Intools views.
- Buyer-authored message labels use the buyer's personal profile name, not the
  company name attached to the sourcing case.
- An unanswered buyer message reminds `info@arcanawangsa.com` after five hours;
  an unanswered Operations message reminds the buyer’s authenticated email.
  Reminders recur daily until an opposite-party reply and respect the buyer’s
  transactional-email preference.

## Accessibility

Target WCAG 2.2 Level AA. Support keyboard-only use, visible and unobscured focus, semantic status messages, reduced motion, 200% text resize, and 400% reflow without loss of task content.

Authenticated workspace scrolling belongs to the full work area at the viewport edge; centered reading and table widths must be applied by an inner surface so the scrollbar never appears beside a constrained table.

Route and data waits preserve the expected layout with content-shaped skeletons rather than visible loading sentences. Busy regions and controls expose programmatic state, and skeleton shimmer has a reduced-motion alternative.

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
