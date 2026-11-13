# Marketplace agent access

## Existing interfaces and sources

- Begin with [the shipped product contract](../PRODUCT.md), [repository instructions](../AGENTS.md), and [the documentation index](README.md). The index explicitly distinguishes the baseline from the next feature wave. [Technical requirements](TRD.md), [data flows](data-flows.md), and [agent authority](prd/06-personas-and-agent-authority.md) include proposed behavior; verify implementation before presenting any planned RPC, table, or tool as available.
- [Edge Functions](../supabase/functions/) and [migrations](../supabase/migrations/) are implementation sources for guarded operations and schema evolution. Preserve grants, RLS, ownership, server-authoritative facts, additive migrations, and the existing PostgREST load-safety requirements. Document supported inputs, outputs, permissions, and errors beside the relevant contract when implementing a specific workflow.
- Public discovery may explain broker-led fashion sourcing and approved service facts. Preserve the supported sequence: prompt/reference → RFQ → human review → vetted matching → invoice/payment → quality/logistics coordination. This policy does not authorize a supplier directory, storefront, catalogue shopping flow, or new product page section.
- Private RFQs, messages, invoices, QC evidence, supplier provenance, capacity, quotes, and internal economics stay behind existing access controls. Models draft from supplied facts; human review and guarded server operations determine authoritative outcomes. Preserve server-calculated Checkout amounts and verified webhook settlement.

## MCP status

No product MCP implementation was found in the inspected repository tree. Existing internal AI workflows do not imply a public MCP endpoint. This guide creates no tool server or additional database access. A future integration must identify a concrete public or authenticated workflow, reuse existing guarded operations, declare data exposure and side effects, preserve review/approval gates, and meet the repository's bounded PostgREST call-volume rules. Avoid general-purpose SQL, unrestricted supplier search, or bulk private-data export tools.

## Engineering defaults

Apply this guide when changing public discovery, APIs, MCP tools, backend boundaries, or database models. Treat authorized agents as users across discovery, evaluation, and task completion. Choose the smallest useful implementation and reuse current contracts and services. Add MCP tools, abstractions, dependencies, or schema changes only for a concrete supported workflow.

Keep approved public information readable in ordinary HTML, with stable canonical links and structured data matching visible content. Reuse the existing publishing and sitemap pipeline. Markdown mirrors and llms.txt are optional conveniences; accessibility alone does not prove indexing, recommendations, or revenue.

Document API/tool purpose, inputs, outputs, authentication, authorization, side effects, errors, pagination, and retry behavior alongside the authoritative implementation. Use consistent domain terminology and link schema/migration sources rather than copying a second schema. Keep public documentation to approved interface details and synthetic examples; never publish credentials, private records, signed URLs, or sensitive operational configuration.

## Access and crawler policy

Public discovery does not authorize access to private records or consequential actions. Agents inherit the same ownership, role, consent, payment, and human-review requirements as other clients. Keep public reads, authenticated reads, and writes distinct. Raw databases, private schemas, customer documents, supplier provenance, and internal economics are not crawl targets.

Crawler intent cannot be established from a user-agent string. Verify provider identity when supported and enforce authorization, bounded pagination/query cost, quotas, backoff, and targeted controls against scraping, enumeration, or abusive extraction. Preserve legitimate visitors, search, authorized agents, provider webhooks, and scheduled jobs. Robots directives express preferences rather than enforce access; publicly readable information cannot reliably exclude competitors. Do not promise complete competitor blocking or grant broad access to an alleged friendly bot.

Future enforcement changes need current provider documentation and task-specific verification. Start from observed behavior and narrow controls rather than a site-wide IP allowlist or blanket AI block. This documentation update activates no new enforcement, API, schema, or MCP server.

## Verification for future implementation

Check public retrieval without login or JavaScript where intended; ensure visible content and metadata agree. Exercise missing credentials, foreign-owned records, expired access, and permitted roles for private interfaces. Test bounded queries, pagination, retry behavior, and required human approval for affected actions. Maintain normal customer and webhook flows.

Report source changes, local checks, deployed behavior, verified crawler activity, indexing/referrals, and successful authorized actions separately. A spoofed user agent tests routing only. Run the subsystem's documented checks for later runtime changes; this documentation-only update requires link, scope, and instruction-consistency checks.

## Source and status

Owner policy recorded 13 November 2026, inspired by [Welcome to the B2A Economy](https://www.a16z.news/p/welcome-to-the-b2a-economy) (a16z, 11 November 2026). The article motivates agent-facing distribution; the security and implementation requirements here come from the owner. Its market statistics have not been independently verified. Repository source establishes implementation, not current deployment; use the linked verification/operations documents before claiming live availability.
