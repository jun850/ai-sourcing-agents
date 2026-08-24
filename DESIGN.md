# Atelix design system

## Green Room

Atelix uses the existing Green Room vocabulary from the consolidated Vite application: quiet slate neutrals, white working surfaces, and moss green as a restrained signal for progress, selection, and primary action. The product should feel playful and modern without becoming decorative or wordy.

## Rules

- Preserve the existing landing page, dashboard shell, motion language, rounded controls, and responsive drawer.
- Design for the broker-led path from prompt or reference, through RFQ, human review, vetted matching, invoice/payment, quality, and logistics handoffs. Keep supplier and commercial facts inside reviewed, permissioned records.
- Use the established neutral sans stack throughout product UI.
- Keep one clear primary action per view; color communicates state rather than decoration.
- Use existing components and tokens before adding variants. Do not add promotional strips or new content sections unless requested.
- Working tables become structured list rows on narrow screens; do not force horizontal task scrolling.
- Provide default, hover, focus-visible, active, disabled, loading, empty, error, success, and permission-denied states where applicable.
- Motion communicates state in roughly 150–250 ms and has a reduced-motion alternative.
- Body copy stays within a readable measure. Controls remain at least 24 by 24 CSS pixels, with larger touch targets where practical.
- Avoid nested cards, decorative gradients, glass effects, oversized rounding, and dashboard metric-card filler.
- Preserve current routes and their guarded boundaries; do not reintroduce public shopping or unreviewed supplier-discovery surfaces.
- The dashboard prompt remains the first screen. The RFQ workspace then uses a
  split conversation + live RFQ review layout, followed by Requests, invoice,
  and sourced Product records tied back to the RFQ.
- Motion is functional: chat messages and request/product rows enter with a
  short 150–250 ms ease-out, send/save actions acknowledge immediately, and
  matching progress is only used for the review handoff. No page-load sequence
  may delay task content. `MotionConfig reducedMotion="user"` is required.
- Chat composer focus uses the slate-blue working state with white typed text;
  plain Enter sends, Shift+Enter inserts a newline, and IME composition never
  submits. The send control is moss/white in the focused state, not blue.
- Avoid local-only chat state, fake product catalogue rows, invented supplier
  quotes, or payment state. Read and write through the typed Supabase/RPC
  contracts and preserve server-authoritative status boundaries.
- Keep the Intools sign-up queue private, status-filterable, and explicit about
  the manual approval gate; never show it to non-admin users.
- The access-request form is a compact two-column workflow on desktop and a
  single-column workflow on narrow screens. Its header, fields, primary action,
  and login link stay in one surface; labels use a dedicated label row so
  optional metadata never breaks field alignment.
- Auth request surfaces use the existing moss action and quiet white surface,
  with a defined border rather than a decorative gradient or broad card shadow.
  Form hover, focus, busy, error, and reduced-motion states remain visible.
- Email-code sign-in is a focused alternative state, not an additional panel:
  one email field, then one six-digit code field after delivery. The message
  describes both available completion paths, preserves copy/paste and native
  one-time-code autofill, and uses the same moss action and quiet status style.
- Auth forms use a shared 52px control height and an 18px label row. Registration
  fields reserve a separate helper-text row so email, phone, and standard fields
  align cleanly across both desktop columns and the single-column mobile layout.
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
