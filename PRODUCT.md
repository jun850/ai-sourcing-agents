# Atelix product contract

## Register and platform

Product UI on the web.

## Purpose

Atelix is a broker-led fashion sourcing workspace for apparel, fabrics, trims, labels, accessories, and OEM or cut-and-sew production. A buyer begins with a prompt, image, or technical reference. Atelix turns that material into a traceable RFQ, supports human review and vetted supplier matching, and records the commercial handoff through invoices and Stripe-hosted payment.

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
- Every consequential change is attributable and auditable.

## Accessibility

Target WCAG 2.2 Level AA. Support keyboard-only use, visible and unobscured focus, semantic status messages, reduced motion, 200% text resize, and 400% reflow without loss of task content.
