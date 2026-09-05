# Atelix — AI-Native Human-Loop Platform & Visual QC: Documentation Set

This folder documents the **next feature wave** described in [`AI_NATIVE_HUMAN_LOOP_PLATFORM_PLAN.md`](AI_NATIVE_HUMAN_LOOP_PLATFORM_PLAN.md) ("PLAN.md"), read together with the shipped baseline product contract at the repo root (`PRODUCT.md`, `DESIGN.md`, `AGENTS.md`, `CLAUDE.md`).

**Ground rule for every document in this folder:** nothing is invented. Every requirement, limit, RPC name, table, and diagram traces back to a specific section of a source document. Where the source is silent, the document says **"Not specified in source docs"** instead of guessing.

**Infrastructure decision:** the delivery uses only Supabase Pro and Vercel for hosted infrastructure. Supabase owns authoritative data, private evidence, scheduling, leases, and Realtime. The existing Vercel project hosts the Vite app, and a separate Vercel Hobby container project runs resumable FFmpeg/OpenCV work. GCP, AWS, and Tencent are excluded. OpenRouter and Stripe remain external application providers, not infrastructure hosts for Atelix.

## Document framework

This set follows the standard BRD → PRD → SDD/TSD progression, so each document answers a different question for a different reader:

| Document | Question it answers | Primary audience |
|---|---|---|
| [`BRD.md`](BRD.md) | **Why** are we building this? (business goals, scope, risk, stakeholders) | Product Owner, Client, Business Analyst, CTO |
| [`prd/`](prd/) (6 documents) | **What** will the product do, feature by feature? (use cases, functional/non-functional requirements, acceptance criteria, wireframes) | Product Manager, Tech Lead, Architect, UI/UX, QA |
| [`TRD.md`](TRD.md) — Part I (SDD) | **How** is the system designed? (architecture, modules, conceptual data model, API overview, security) | Tech Lead, Architect, Senior Devs |
| [`TRD.md`](TRD.md) — Part II (TSD) | **How** is it built, tested, and deployed? (final stack, exact RPC signatures, testing strategy, performance standards, deployment plan) | Developers, QA, DevOps |
| [`data-flows.md`](data-flows.md) | Diagrams of every flow above, in one place | Everyone — this is the fastest way for a VP of Product or VP of Engineering to verify the same document without re-reading prose |
| [`test-cases.md`](test-cases.md) | What must be tested, including edge cases and pre-existing defects | QA, Engineering |

## Recommended reading order

- **VP of Product / Product Owner:** `BRD.md` → `data-flows.md` §1–2 (the two top-level diagrams) → each PRD's "Overview & use cases" and "Acceptance criteria" sections.
- **VP of Engineering / Tech Lead:** `BRD.md` §7 (truth/authority model) → `TRD.md` Part I (SDD) in full → `TRD.md` Part II (TSD) for exact RPCs/limits → `test-cases.md`.
- **QA:** `test-cases.md` end to end, cross-referencing each PRD's "States and error handling" table and `PLAN.md` §18 (failure behavior).
- **New engineer onboarding to this wave:** `data-flows.md` first (see the shape of the system before the prose), then the PRD for the module being worked on, then the matching section of `TRD.md`.

## Feature inventory

| # | Feature | PRD |
|---|---|---|
| 1 | Supplier-outreach drafting (Master settings + Request-drawer modal) | [prd/01-supplier-outreach-drafting.md](prd/01-supplier-outreach-drafting.md) |
| 2 | Quote approval atomicity | [prd/02-quote-approval-atomicity.md](prd/02-quote-approval-atomicity.md) |
| 3 | Production monitoring | [prd/03-production-monitoring.md](prd/03-production-monitoring.md) |
| 4 | Visual QC — AI triage and human review | [prd/04-visual-qc-triage-and-review.md](prd/04-visual-qc-triage-and-review.md) |
| 5 | Realtime activity and notifications | [prd/05-realtime-activity-and-notifications.md](prd/05-realtime-activity-and-notifications.md) |
| 6 | Personas and agent authority (cross-cutting governance) | [prd/06-personas-and-agent-authority.md](prd/06-personas-and-agent-authority.md) |

## A note on scope and fidelity

- This documentation set covers the feature wave in `PLAN.md`. It does **not** re-document already-shipped baseline features (auth, Messages, the four buyer surfaces, Intools' original nine sections) beyond what's needed for context — those are already specified in `PRODUCT.md`/`DESIGN.md`/`AGENTS.md`/`CLAUDE.md` and are treated as given.
- "Final tech stack" and similar TSD-style sections list only technologies the source documents name or the approved infrastructure decision adds (Supabase Pro Postgres/Storage/Vault/cron, Vercel Hobby container functions, FFmpeg/FFprobe/OpenCV, OpenRouter, Stripe, the existing Vite frontend). Nothing (e.g., a caching layer or a different cloud) is added just to fill out a template section — where the source is silent, the document says so.
- Wireframes are literal, text-based layouts of the fields and controls `PLAN.md` explicitly lists (e.g., the outreach modal's stated buttons and status fields) — they are not new visual designs, and none should be treated as approved UI beyond what the source specifies.
