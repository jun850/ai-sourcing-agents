# PRD 06 — Personas and Agent Authority

**Source of truth:** `docs/AI_NATIVE_HUMAN_LOOP_PLATFORM_PLAN.md` ("PLAN.md") §2.2, §2.3, §3, §14, §23 "Authority and data integrity". No detail below is invented. This is a cross-cutting governance feature: every other PRD in this set (01–05) inherits these rules and must not be implemented in a way that contradicts them.

## 1. Overview & use cases

### 1.1 Problem statement

An AI-native platform must let agents do real work (drafting, ranking, normalizing, summarizing, flagging) while making it structurally impossible for a model — or an unauthenticated/under-privileged browser call — to create supplier, commercial, payment, production, QC, shipment, or delivery truth. (`PLAN.md` §2.1)

### 1.2 Use cases

- As a **VP of Engineering**, I want one document that lists exactly what every agent is and isn't allowed to do, so a code reviewer can reject a PR that gives an agent new authority without a deliberate decision. (`PLAN.md` §3.3)
- As a **VP of Product**, I want to be able to tell a buyer or investor "no AI in this system can ship an order, publish a price, or approve quality" and have that be structurally true, not just a policy statement. (`PLAN.md` §2.1, §23)
- As an **Ops user**, I want to know precisely what I can and cannot do versus what only the buyer or only the server can do, so I'm not guessing at my own authority. (`PLAN.md` §3.2)

### 1.3 Goals

- Encode the truth/authority layering so every feature's data model and RPCs can be checked against it. (`PLAN.md` §2.2)
- Enumerate exactly what each persona (buyer, Ops, each runtime agent) can and cannot do. (`PLAN.md` §3)
- Lock the decisions that must not be revisited without a deliberate authority change. (`PLAN.md` §2.3)

## 2. Functional requirements

### 2.1 Truth and authority layers

| Layer | Meaning | Examples | May AI create it? |
|---|---|---|---|
| Buyer-stated | Submitted by the buyer | Product, quantity, target budget, material, requested timeline | AI may extract and structure; buyer text remains the source |
| AI-extracted | Model interpretation tied to evidence | Visible requirement, suspected defect, missing view | Yes, as a non-authoritative observation |
| Supplier-confirmed | Received from a supplier and recorded by Ops | MOQ, price, lead time, availability, quote validity | No; AI may normalize only |
| Ops-verified | Reviewed and accepted by an accountable operator | Supplier release, quote publication, QC review, mitigation | No |
| Server-authoritative | Committed by guarded backend workflow | Roles, state, invoice total, payment settlement, shipment eligibility | No |

(`PLAN.md` §2.2)

### 2.2 Locked decisions (must not be silently changed)

(`PLAN.md` §2.3)
- Factory updates are Ops-mediated in the first release.
- A single accountable Ops user can approve a supplier for outreach, publish a quote, and publish a QC review. Every action is immutable and attributable.
- Buyers see every Ops-approved quote, up to the existing maximum of three. Internal recommendations and rejected suppliers remain private.
- AI visual QC is triage-only: it can assign risk, identify missing evidence, cite image/frame evidence; it cannot publish a pass or fail.
- In-app updates are realtime for committed events; email is reserved for required actions, exceptions, and missed deadlines.
- Supabase records and guarded RPCs are authoritative.
- Stripe webhooks are the only payment-settlement authority.
- QC originals remain private; buyers see only media explicitly approved for buyer visibility by Ops.

### 2.3 Personas

#### Buyer (`PLAN.md` §3.1)

**Can:** submit/revise a draft RFQ; approve and submit the RFQ for review; read committed progress and published evidence for their own cases; compare all published quotes and select one; initiate Stripe Checkout for an eligible invoice; approve or decline a ready sample; respond to Ops via RFQ-scoped Messages.

**Cannot:** see private routing scores, rejected suppliers, internal rationale, or unreviewed findings; contact suppliers through the platform; set price, invoice, payment, production, QC, shipment, or delivery state.

#### Atelix Operations (`PLAN.md` §3.2)

**Can:** review the submitted RFQ and evidence; approve or reject each recommended supplier; prepare and edit supplier-outreach drafts; record that an approved supplier was contacted externally; record supplier-confirmed responses and supporting evidence; review and publish buyer-visible quotes; upload or record factory production evidence; review AI visual-risk findings; publish the authoritative QC decision; advance guarded fulfillment stages when their prerequisites are satisfied.

#### Runtime agents (`PLAN.md` §3.3)

Agents read only the minimum data needed for their job and return strictly typed outputs.

| Agent | Input | Output | Forbidden authority |
|---|---|---|---|
| Intake Agent | Buyer prompt, references, current RFQ draft | Supported field patch, questions, evidence links | Cannot submit RFQ or invent requirements |
| Match Analyst | Submitted RFQ, real eligible factories, policy | Ranked existing factory IDs with grounded rationale | Cannot make a supplier eligible or approve outreach |
| Outreach Draft Agent | Active template, resolved allowlisted fields | Editable English subject and body | Cannot send email or add supplier/commercial facts |
| Quote Normalizer | Supplier-confirmed source terms | Comparable structured draft | Cannot determine or publish authoritative price |
| Production Summarizer | Ops-entered update and evidence metadata | Concise draft summary and missing-field flags | Cannot advance production state |
| QC Vision Triage Agent | Approved specification, checklist, derived images | Evidence-linked visible-risk findings | Cannot pass QC or unlock shipment |
| Risk Monitor | Authoritative dates, current state, unresolved issues | SLA/exception flags | Cannot change deadlines or state |
| Notification Composer | Committed event payload | Grounded buyer/admin copy | Cannot emit an event on its own |

### 2.4 Orchestration layers (system-level enforcement mechanism)

(`PLAN.md` §14) Every feature must map onto these seven layers so authority stays enforceable and auditable:

1. **Experience** — Buyer Requests, Quotes, Timeline/Orders, Messages, Invoices, notification bell; Intools Requests drawer, Master settings, existing queues, modals, audit history.
2. **Authority** — Guarded RPCs; RLS and admin/service checks; optimistic revisions; ordered lifecycle transitions; immutable approvals and audit.
3. **Agent execution** — Typed input/output schemas; minimum necessary context; model/preset/version metadata; evidence references; deterministic fallback or explicit failure.
4. **Durable queues** — Idempotent job keys; bounded claims; `FOR UPDATE SKIP LOCKED` leases; attempt limits and exponential backoff; dead-letter state.
5. **Media processing** — Immutable private originals; deterministic validation and preprocessing; derived contact sheets and evidence mapping.
6. **Human review** — Supplier release; outreach/contact confirmation; quote publication; QC decision; shipment advancement.
7. **Events and communication** — Append-only lifecycle events; admin audit entries; private Broadcast invalidations; durable notifications; action/exception email delivery.

## 3. Non-functional requirements

- Every layer above must be independently testable and auditable — this is why [`TRD.md` §II.6](../TRD.md#ii6-testing-strategy) requires separate evidence per layer (database/RLS, browser, model-quality) rather than one combined pass/fail. (`PLAN.md` §23)

## 4. Wireframes / mockups

Not a UI feature — this is a cross-cutting governance model. The one visual that represents it is the authority funnel: every layer below must approve before a fact becomes truth.

```text
Buyer-stated ──▶ AI-extracted ──▶ Supplier-confirmed ──▶ Ops-verified ──▶ Server-authoritative
   (buyer)         (model,           (supplier via         (accountable        (guarded backend
                  non-authoritative)   Ops, no AI)           operator, no AI)     workflow, no AI)

                                                                                        │
                                                                                        ▼
                                                                          Only this layer is "truth"
                                                                          buyers/Ops/other systems can rely on.
```

## 5. Acceptance criteria

(`PLAN.md` §23 "Authority and data integrity")
- No model or browser action can approve a supplier, publish a quote, settle payment, approve QC, or advance shipment.
- Every consequential action records actor, time, source state, resulting state, and target record.
- Applied migrations remain immutable; all changes are additive.
- Stale revisions fail without overwriting another operator's work.

## 6. How other PRDs must be checked against this one

| Feature (PRD) | Layer(s) it must respect | Persona rule it must not violate |
|---|---|---|
| [01 Supplier outreach drafting](01-supplier-outreach-drafting.md) | 1, 2, 3, 7 | Outreach Draft Agent cannot send email or add facts; only Ops marks contacted |
| [02 Quote approval atomicity](02-quote-approval-atomicity.md) | 2, 6, 7 | Quote Normalizer cannot determine/publish price; only Ops publishes |
| [03 Production monitoring](03-production-monitoring.md) | 1, 2, 6, 7 | Production Summarizer cannot advance state; only Ops publishes updates |
| [04 Visual QC](04-visual-qc-triage-and-review.md) | 2, 3, 4, 5, 6, 7 | QC Vision Triage Agent cannot pass QC or unlock shipment; only Ops publishes the review |
| [05 Realtime and notifications](05-realtime-activity-and-notifications.md) | 4, 7 | Notification Composer cannot emit an event on its own |

## 7. Dependencies & milestones

- **Depends on:** nothing — this PRD is the governance baseline every other PRD in this wave (01–05) is checked against, and it is not itself gated behind a delivery wave or rollout flag.
- **Applies across:** all seven delivery waves in [`TRD.md` §II.8.1](../TRD.md#ii81-delivery-waves-planmd-22); SOL (Head of Engineering) does not accept a subsystem until it is checked against this document. (`PLAN.md` §21.1)
- **Infrastructure boundary:** Supabase Pro remains the authority and scheduler; Vercel hosts presentation and stateless processing only. Neither Vercel nor a model may become a business-truth authority. (`PLAN.md` §2.2, §11.1)

## 8. Open questions / not specified in source docs

- Whether the Risk Monitor and Notification Composer agents have dedicated UI surfaces of their own, or operate purely server-side — `PLAN.md` describes their input/output contracts but not a UI.
