# Atelix design system

## Green Room

Atelix uses the existing Green Room vocabulary from the consolidated Vite application: quiet slate neutrals, white working surfaces, and moss green as a restrained signal for progress, selection, and primary action. The product should feel playful and modern without becoming decorative or wordy.

## Rules

- Preserve the existing landing page, dashboard shell, motion language, rounded controls, and responsive drawer.
- Design for the broker-led path from prompt or reference, through RFQ, human review, vetted matching, invoice/payment, quality, and logistics handoffs. Keep supplier and commercial facts inside reviewed, permissioned records.
- Use the established neutral sans stack throughout product UI.
- Keep one clear primary action per view; color communicates state rather than decoration.
- Use existing components and tokens before adding variants. Do not add promotional strips or new content sections unless requested.
- The Products workspace uses one bounded operational list per stage with
  rectangular rows, visible columns on desktop, structured rows on narrow
  screens, and no product-card/pill stack. Product detail is a read-only split
  surface: immutable snapshot fields and order history on the left, one
  stage-aware next action plus a prefilled-RFQ reorder action on the right.
- Products use a quiet 52px filter row: search, status tabs, supplier filter,
  and sort. Stage state uses a small semantic dot and text label; the selected
  tab and consequential actions use moss. Product detail uses a 64px back
  toolbar, a 350px stage rail on desktop, and a stacked rail on narrow screens.
- Working tables become structured list rows on narrow screens; do not force horizontal task scrolling.
- Provide default, hover, focus-visible, active, disabled, loading, empty, error, success, and permission-denied states where applicable.
- Loading states use layout-shaped skeletons within the existing route or list surface. Do not render visible loading sentences or swap stable action labels for progress wording; keep `aria-busy` on the affected region or control and stop shimmer when reduced motion is requested.
- Motion communicates state in roughly 150–250 ms and has a reduced-motion alternative.
- Body copy stays within a readable measure. Controls remain at least 24 by 24 CSS pixels, with larger touch targets where practical.
- Avoid nested cards, decorative gradients, glass effects, oversized rounding, and dashboard metric-card filler.
- FAQ surfaces use one shared stack of independent soft-neutral disclosure rows: 1180px wide on the landing page to align with sourcing intelligence, and the existing content measure on resource pages. Each native summary has a circled plus that rotates to a close mark when expanded, while the answer remains inside the same rounded row. Preserve each route's canonical FAQ copy, visible focus, full-row keyboard activation, reduced-motion behavior, and compact mobile padding.
- The landing trusted-brand rail uses five fixed logo slots instead of a horizontal marquee. Each slot cycles through the canonical local brand assets with a vertical blur-and-fade handoff; hovering an individual slot reveals that logo's original color, hover or keyboard focus pauses the sequence, reduced motion shows a static logo per slot, and narrow screens reduce the visible slot count without changing the accessible brand list.
- Preserve current routes and their guarded boundaries; do not reintroduce public shopping or unreviewed supplier-discovery surfaces.
- Opening an RFQ from Requests keeps the Requests navigation item selected and
  preserves that request context on refresh/deep link.
- Intools section tabs are route-backed, with one canonical `/intools/<section>`
  path per operational workspace and detail paths nested beneath that section.
- The dashboard prompt remains the first screen. The RFQ workspace then uses a
  split conversation + live RFQ review layout, followed by Requests, invoice,
  and sourced Product records tied back to the RFQ.
- The initial dashboard prompt is a flat, left-aligned editorial composition on
  the existing neutral workspace surface: one concise heading, one instruction,
  and the existing reference-aware composer. Avoid decorative glows. Submission
  keeps the entered brief visible and disables repeat actions until the guarded
  request succeeds.
- The main prompt and authenticated chat composer are white rounded surfaces
  with a soft shadow and no CSS border. Their focused states must not add a green
  outline or frame; only the controls inside may expose their own focus state.
- Motion is functional: chat messages and request/product rows enter with a
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
- Intools operational records use one bounded, 14px-radius list panel with
  row dividers and a quiet column header on desktop. Rows are rectangular,
  never individually pill-shaped; hover and keyboard focus communicate the
  active record without adding decorative card shadows.
- Intools order detail uses one operational surface: a concise record header,
  structured item, fulfillment, and activity rows, plus a quiet summary rail
  that stacks below the records on narrow screens. Keep the single status
  action in that rail with explicit labels, optional audit note, busy state,
  and inline success or error status; never expose a raw record dump or imply
  that payment settlement can be changed in the browser.
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

## Accessibility target

WCAG 2.2 AA: semantic landmarks and headings, native controls, programmatic labels and errors, logical focus order, visible focus, sufficient contrast, accessible authentication, keyboard-complete dialogs and drawers, route titles, resize/reflow support, and no motion-dependent understanding.
