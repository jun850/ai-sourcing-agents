# Atelix implementation guidance

Build only the broker-led fashion sourcing workflow defined in `PRODUCT.md`: apparel, fabrics, trims, labels, accessories, and OEM or cut-and-sew. Use the Green Room system in `DESIGN.md`, reuse existing Vite routes and components, and do not introduce unrequested page sections or public shopping surfaces.

The working path is prompt or reference -> traceable RFQ -> human review -> vetted matching -> invoice and Stripe payment -> quality and logistics coordination. Keep supplier, commercial, payment, and production facts inside reviewed server records; models may structure supplied evidence but may not invent it.

The signed-in buyer workspace has four surfaces: Home, Requests, Messages, and Invoices. The standalone Products workspace is retired — order-item snapshots and order history are read inside the owning RFQ and its linked invoice, and `/dashboard/products` links redirect to Requests. The retired product catalogue and its Algolia index are not reintroduced.

Keep identity, roles, RFQs, suppliers, invoices, and payments server-authoritative. Apply database changes additively, preserve historical order/payment data, and never edit already-applied migrations. Models are drafting aids only; deterministic eligibility and approved database facts come first. Stripe Checkout is server-computed and webhook-settled.

Before handoff, separate evidence for lint/build, local database/RLS tests, local HTTP routes, browser/accessibility checks, Git state, migrations, and deployment. Never claim an untested layer.
