# Atelix design system

## Green Room

Atelix uses the existing Green Room vocabulary from the consolidated Vite application: quiet slate neutrals, white working surfaces, and moss green as a restrained signal for progress, selection, and primary action. The product should feel playful and modern without becoming decorative or wordy.

## Rules

- Preserve the existing landing page, dashboard shell, motion language, rounded controls, and responsive drawer.
- Design for the broker-led path from prompt or reference, through RFQ, human review, vetted matching, invoice/payment, quality, and logistics handoffs. Keep supplier and commercial facts inside reviewed, permissioned records.
- Use the established neutral sans stack throughout product UI.
- Keep one clear primary action per view; color communicates state rather than decoration.
- Use existing components and tokens before adding variants. Do not add promotional strips or new content sections unless requested.
- The signed-in workspace has one collapsible sidebar (wordmark, "New request",
  Home / Requests / Messages / Invoices, recent requests, Settings, account pill)
  and one top bar (breadcrumb, centered command-palette trigger, notifications).
  There is no Products workspace; order-item snapshots and order history are read
  inside their RFQ's Timeline/Quotes tabs and the linked invoice.
- The command palette ("Search everything", Cmd/Ctrl+K) is one modal over a dim
  scrim: quick-action rows, a recent-requests group, and a debounced result list
  from `workspace_search`. Rectangular rows, moss only for the active option,
  geometry-matched skeletons while a query is pending, and an inline empty state.
  It is navigation only and shows no supplier or commercial facts.
- Working lists (Requests, Invoices) use one bounded operational list: a quiet
  filter row (search + status tabs), rectangular rows, visible columns on
  desktop, structured rows on narrow screens, and no card/pill stack. Stage
  state uses a small semantic dot plus text label; the selected tab and
  consequential actions use moss.
- Working tables become structured list rows on narrow screens; do not force horizontal task scrolling.
- The authenticated Dashboard and Intools work areas own vertical scrolling across the full available width. Keep the scrollbar at the right edge of the workspace and center only the inner content measure or table surface.
- Provide default, hover, focus-visible, active, disabled, loading, empty, error, success, and permission-denied states where applicable.
- Loading states use layout-shaped skeletons within the existing route or list surface. Do not render visible loading sentences or swap stable action labels for progress wording; keep `aria-busy` on the affected region or control and stop shimmer when reduced motion is requested.
- Motion communicates state in roughly 150–250 ms and has a reduced-motion alternative.
- Body copy stays within a readable measure. Controls remain at least 24 by 24 CSS pixels, with larger touch targets where practical.
- Avoid nested cards, decorative gradients, glass effects, oversized rounding, and dashboard metric-card filler.
- FAQ surfaces use one shared stack of independent soft-neutral disclosure rows: 1180px wide on the landing page to align with sourcing intelligence, and the existing content measure on resource pages. Each native summary has a circled plus that rotates to a close mark when expanded, while the answer remains inside the same rounded row. Preserve each route's canonical FAQ copy, visible focus, full-row keyboard activation, reduced-motion behavior, and compact mobile padding.
- The landing trusted-brand rail uses five fixed logo slots instead of a horizontal marquee. Each slot cycles through the canonical local brand assets with a vertical blur-and-fade handoff; hovering an individual slot reveals that logo's original color, hover or keyboard focus pauses the sequence, reduced motion shows a static logo per slot, and narrow screens reduce the visible slot count without changing the accessible brand list.
- Preserve current routes and their guarded boundaries; do not reintroduce public shopping or unreviewed supplier-discovery surfaces.
- Every authenticated interaction must read as a sourcing-agent workspace,
  never as a retail-commerce surface. Use case queues, evidence rows, RFQ context,
  reviewed states, and next-step ownership. Do not use storefront cards,
  browse/discover patterns, seller language, carts, wishlists, product
  recommendation patterns, or ecommerce calls to action.
- The dashboard should feel conversational-first: a restrained ChatGPT-like
  composer and message history beside a live RFQ document. Structured fields,
  evidence, and human approval remain visible; the agent is a drafting aid,
  not a seller or autonomous commercial actor.
- Long authenticated lists use one operational queue vocabulary and shared
  cursor-loading behavior. Appended rows preserve scroll and selection,
  loading uses geometry-matched skeletons, and end/error states remain inline.
- Opening an RFQ from Requests keeps the Requests navigation item selected and
  preserves that request context on refresh/deep link.
- Intools navigation is a dark `#1c2430` collapsible left sidebar: the atelix
  wordmark, nine route-backed section links (Analytics, Invoices, Orders,
  Requests, Sign-up requests, Suppliers, Knowledge, Messages, Audit history),
  and an operator pill. The active link shows a moss left bar and a tinted row
  when expanded, or a moss glyph chip when collapsed to 72px. Each canonical
  `/intools/<section>` path owns its section, and `/intools/<section>/<id>` opens
  that record's drawer.
- The dashboard prompt remains the first screen. The RFQ workspace then uses a
  split conversation + live RFQ review layout, followed by Requests, Messages,
  and Invoices tied back to the RFQ.
- The initial dashboard prompt is a flat, left-aligned editorial composition on
  the existing neutral workspace surface: one concise heading, one instruction,
  and the existing reference-aware composer. Avoid decorative glows. Submission
  keeps the entered brief visible and disables repeat actions until the guarded
  request succeeds. While the buyer is composing a brief the Home screen may
  cross-fade its recent-requests block for one bounded, self-hosted illustrative
  animation; it carries no status meaning, must not delay task content, and
  resolves to a static state under reduced motion.
- The main prompt and authenticated chat composer are white rounded surfaces
  with a soft shadow and no CSS border. Their focused states must not add a green
  outline or frame; only the controls inside may expose their own focus state.
- Motion is functional: chat messages and request rows enter with a
  short 150–250 ms ease-out, send/save actions acknowledge immediately, and
  matching progress is only used for the review handoff. After RFQ submission,
  show a compact queued-for-review acknowledgement before the matching
  progress view; use one contained checkmark and a restrained three-dot drift,
  never a spinner or decorative confetti. No page-load sequence may delay task
  content. `MotionConfig reducedMotion="user"` is required.
- The matching-stage visual uses one centered transparent green route artwork;
  do not layer waypoint labels or status badges over it. The artwork is
  decorative context only; the surrounding heading, checks, and timeline
  remain the source of status meaning.
- Chat composer focus uses the slate-blue working state with white typed text;
  plain Enter sends, Shift+Enter inserts a newline, and IME composition never
  submits. On desktop, the conversation fills the split workspace row and pins
  the composer to its bottom edge, aligned with the RFQ document's primary
  action; only the message history scrolls. The send control is moss/white in
  the focused state, not blue.
- The RFQ conversation keeps agent outcomes within the existing conversation
  and live-document pattern: concise text status announces checking, saved
  fields, unavailable, remaining-turn, and support-handoff
  states without creating a second chat surface. Agent-applied updates name
  their changed RFQ fields and offer one inline undo action while the draft is
  editable. A routine `verified` response does not leave a standalone status
  label above the composer. Use status text as well as color; unavailable or
  unknown payment and order questions direct buyers to `info@arcanawangsa.com`.
- During the initial agent turn, the live document preserves its final geometry
  with title, summary, and field-row skeletons. Field updates use one concise
  `Updated ...` notice in the document and one reversible status beside the
  composer; they never repeat raw model verification wording. Unspecified fields
  render an em dash, and certification requirements come only from the saved
  RFQ field.
- Avoid local-only chat state, fake product catalogue rows, invented supplier
  quotes, or payment state. Read and write through the typed Supabase/RPC
  contracts and preserve server-authoritative status boundaries.
- Keep the Intools sign-up queue private, status-filterable, and explicit about
  the manual approval gate; never show it to non-admin users.
- Every Intools section except Analytics and Messages renders through one shared
  list: a quiet filter row (full-width search plus rounded status chips, moss for
  the active chip), an optional select-all header, then one bounded 14px-radius
  panel of rectangular divided rows. Each row has a checkbox, a 30px section-
  accent lead chip with initials, a title/subtitle button, up to three text
  columns, and a right-aligned pill status. Rows are never individually
  pill-shaped and carry no decorative card shadow. Loading uses geometry-matched
  skeleton rows; the empty state is one centered line inside the same panel.
- When rows are selected, a moss `#eef4f0` bulk-action strip appears above the
  panel with the count, a Clear link, and the section's bulk actions. Destructive
  bulk actions (cancel, decline, archive) open a centered confirmation modal
  first; every completed action is confirmed by a single dark bottom-centered
  toast that auto-dismisses.
- Opening a row slides a right-hand detail drawer (`min(440px, 94vw)`, white,
  `-8px 0 32px` shadow) over a `rgba(20,26,34,.36)` scrim, closing on the scrim,
  the ✕, or Escape. The drawer header carries the record title, subtitle, and
  pill status; the scroll body is uppercase-labelled field rows plus a per-type
  section (invoice line items / payments / audit, order items / fulfillment /
  activity, RFQ supplier matches with inline quote fields, supplier intake,
  sign-up detail, knowledge metadata); the footer holds that record's actions
  with busy state and inline success or error notices. Never expose a raw record
  dump or imply that payment settlement or order totals can be set in the browser.
- Intools create and upload flows (new invoice, new supplier, bulk supplier
  upload, knowledge upload) use one centered modal on a `rgba(20,26,34,.4)` scrim
  with a `#f9fafb` footer holding a quiet Cancel and a moss confirm; the confirm
  is disabled until the form is valid.
- Intools Analytics keeps its own layout: a range toggle, a three-up metric grid,
  a daily RFQ-creation bar strip, and a Search Console snapshot block (metric
  columns, a daily-clicks strip, and top query/page/country/device lists) fed by
  manual CSV import and visually separated from live commercial records.
- The access-request form is a compact two-column workflow on desktop and a
  single-column workflow on narrow screens. Its header, fields, primary action,
  and login link stay in one surface; labels use a dedicated label row so
  optional metadata never breaks field alignment.
- Auth request surfaces use the existing moss action and quiet white surface,
  with a defined border rather than a decorative gradient or broad card shadow.
  Form hover, focus, busy, error, and reduced-motion states remain visible.
- Magic-link submission always transitions to the same quiet success state for
  syntactically valid emails. Its copy may say that an eligible email will
  receive a link, but must never reveal account existence or approval status.
- Email-code sign-in is a focused alternative state, not an additional panel:
  one email field, then one six-digit code field after delivery. The message
  describes both available completion paths, preserves copy/paste and native
  one-time-code autofill, and uses the same moss action and quiet status style.
- Auth forms use a shared 52px control height, an 18px label row, and a compact
  16px field gap across desktop columns and the single-column mobile layout.
- Auth required fields rely on native validation and accessible field semantics,
  without scattered visible asterisks. Registration collects an optional phone
  number in one international-format field rather than a separate calling-code
  control, keeping both columns on the same 52px outlined-field rhythm.
- Auth labels remain in a stable 18px row above their outlined controls; they do
  not float into or notch the border on focus, input, selection, or autofill.
- The sign-in and sign-up screens carry no green on any focus indicator. Fields,
  selects, the primary action, and links take a neutral (slate) focus ring only —
  the field border goes transparent on focus and a soft neutral box-shadow ring
  stands in. The global green a11y focus ring is explicitly overridden inside
  `.signin-screen`; do not reintroduce moss/accent outlines here.
- Auth and supplier-intake forms use a shared Material 3-inspired control
  vocabulary: outlined text fields, select menus, searchable Autocomplete
  lookups, native-labelled radio/checkbox groups, inline status alerts, and
  contained moss primary actions. Lookup controls must remain keyboard-complete
  and use an explicit option list; do not present a lookup result as reviewed
  supplier or commercial truth.
- The signed-in RFQ workspace follows the split sourcing-flow composition:
  persistent request navigation, a concise RFQ context header, conversation on
  the left, and a live review document on the right. On narrow screens these
  regions stack in task order without horizontal scrolling.
- The RFQ document keeps its status, tabs, decision notice, specifications,
  autosave/review explanation, and single Submit RFQ action visible. Use moss
  only for current state and consequential actions; the request remains a
  draft until the guarded submission has queued Atelix review.
- Messages uses a list-first RFQ inbox: the request list is visible before a
  thread is chosen, then the selected human Operations conversation fills the
  adjacent panel. On narrow screens, list and thread stack without horizontal
  scrolling. Thread selection and incoming messages use short ease-out motion;
  reduced motion is immediate. Keep the composer a working control, not an AI
  drafting surface, and expose loading, empty, error, attachment, and unread
  states with text as well as color.
- Message metadata identifies buyer-authored messages by the buyer's personal
  name; company names remain request context rather than chat authorship.
- On desktop, the Messages request queue and thread history scroll independently
  inside one fixed-height inbox. The composer remains pinned to the thread's
  bottom edge while browsing either list, matching the durable chat posture of
  an operations inbox.
- Message party is encoded by consistent position and controlled bubble color:
  buyer messages are warm yellow on the right with a tight lower-right corner;
  Atelix Operations messages are white on the left with a soft shadow and a
  tight upper-left corner. The thread header carries the `AO` avatar and RFQ
  reference. The mapping is stable in both buyer and Intools workspaces.
- Conversation updates arrive on authorized private Broadcast channels and do
  not reset, poll, or reload the visible thread. The same buyer/Operations
  mapping applies to historical and live rows; the local operations seam joins
  the same private channel with a short-lived loopback-only administrator JWT.

## Accessibility target

WCAG 2.2 AA: semantic landmarks and headings, native controls, programmatic labels and errors, logical focus order, visible focus, sufficient contrast, accessible authentication, keyboard-complete dialogs and drawers, route titles, resize/reflow support, and no motion-dependent understanding.
