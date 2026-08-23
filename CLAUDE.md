# Atelix implementation guidance

Build only the broker-led sourcing workflow defined in `PRODUCT.md`, using the Green Room system in `DESIGN.md`. Reuse existing Vite routes and components and do not introduce unrequested page sections.

Keep identity, roles, RFQs, suppliers, invoices, and payments server-authoritative. Apply database changes additively, preserve historical order/payment data, and never edit already-applied migrations. Models are drafting aids only; deterministic eligibility and approved database facts come first. Stripe Checkout is server-computed and webhook-settled.

Before handoff, separate evidence for lint/build, local database/RLS tests, local HTTP routes, browser/accessibility checks, Git state, migrations, and deployment. Never claim an untested layer.
