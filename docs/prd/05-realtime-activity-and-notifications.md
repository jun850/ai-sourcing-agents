# PRD 05 — Realtime Activity and Notifications

**Source of truth:** `docs/AI_NATIVE_HUMAN_LOOP_PLATFORM_PLAN.md` ("PLAN.md") §13, §15.7, §16, §2.3–2.4, §17–§19 (item 7), §22 (Wave 6), §23. No detail below is invented.

## 1. Overview & use cases

### 1.1 Problem statement

Buyers and Ops need to see committed progress (quotes, invoices, production, QC, shipment/delivery) without polling, without the realtime channel ever leaking private data, and with notifications reaching the right audience through the right channel (in-app vs. email) without duplication or retired-route links. (`PLAN.md` §13, §16, §19 item 7)

### 1.2 Use cases

- As a **buyer**, I want my Requests/Timeline view to update the moment Ops publishes a quote or QC review, without me refreshing the page. (`PLAN.md` §15.7)
- As an **Ops user**, I want an email only when something actually needs my action or an exception happened — not a copy of every routine update. (`PLAN.md` §16)
- As a **buyer or Ops user**, I want the link inside a notification to always open the real record, never a retired route. (`PLAN.md` §19 item 7)
- As the **Notification Composer agent**, I turn a committed event payload into grounded buyer/admin copy — I cannot emit an event on my own. (`PLAN.md` §3.3)

### 1.3 Non-goals

- Emailing every event — the policy table (§16) explicitly limits email to action-required, exception, and transactional-milestone rows.
- Broadcasting findings, supplier data, commercial terms, storage paths, signed URLs, or evidence bytes over realtime. (`PLAN.md` §15.7)
- Polling of any kind, at any layer. (`PLAN.md` §2.4, §15.7, §17)

### 1.4 Users and access

- **Buyers**: in-app realtime for their own case's committed events; case-scoped email for actions/exceptions/milestones per the policy table. (`PLAN.md` §16)
- **Ops (admin)**: in-app realtime plus admin-directed email for the rows marked "Yes" under Admin in-app / relevant email column. (`PLAN.md` §16)
- **Notification Composer agent**: input = committed event payload; output = grounded buyer/admin copy; forbidden authority = cannot emit an event on its own. (`PLAN.md` §3.3)

## 2. Functional requirements

### 2.1 Realtime contract (`PLAN.md` §15.7)

Private topic: `rfq:<rfq_case_id>:activity`

Broadcast payload (exact shape):

```json
{ "event_id": "uuid", "event_type": "qc_review_published", "revision": 14 }
```

Rules: never broadcast findings, supplier data, commercial terms, storage paths, signed URLs, or evidence bytes — the payload only invalidates local state, and the client rereads the authoritative aggregate. Clients must: debounce invalidations; allow only one aggregate request in flight; queue at most one trailing refresh; refresh once after reconnect; unsubscribe on route/case change; never poll.

### 2.2 Notification policy (`PLAN.md` §16, verbatim table)

| Event | Buyer in-app | Admin in-app | Email |
|---|---:|---:|---:|
| RFQ submitted/review started | Yes | Yes | No |
| Supplier outreach started | Yes, case-level only | Yes | No |
| Supplier response recorded | No | Yes | Exception/SLA only |
| Quote published | Yes | Yes | Buyer action required |
| Invoice sent | Yes | Yes | Buyer action required |
| Payment settled | Yes | Yes | Transactional confirmation |
| Sample ready | Yes | Yes | Buyer action required |
| Sample approved/declined | Yes | Yes | Ops action required |
| Routine production update | Yes | Yes | No |
| QC analysis ready | No | Yes | Ops action required |
| QC approved | Yes | Yes | No |
| Rework/reinspection/evidence request | Yes when published | Yes | Action/exception |
| Missed next-update deadline | Yes if buyer-relevant | Yes | Exception |
| Shipped/delivered | Yes | Yes | Transactional milestone |

Every notification uses a **deterministic idempotency key** and a canonical deep link to `/dashboard/requests/<rfq-id>` or `/intools/requests/<rfq-id>`. (`PLAN.md` §16)

### 2.3 Data flow summary (`PLAN.md` §13, this feature's slice)

Committed lifecycle event → append-only event + admin audit entry → private Broadcast invalidation on `rfq:<rfq_case_id>:activity` → durable notification record → buyer/Intools bounded refresh of the authoritative aggregate. (`PLAN.md` §13, §14 "Layer 7")

### 2.4 Data this feature depends on / produces

Existing notification ledger (`PLAN.md` §11.1, §14); append-only lifecycle events and admin audit entries (`PLAN.md` §14); aggregate read RPCs this feature triggers a refresh of — `workspace_get_rfq_production`, `intools_get_rfq_operations` (see [`TRD.md` §II.2.6](../TRD.md#ii26-aggregate-read-rpcs-planmd-156)).

## 3. Non-functional requirements

- Realtime invalidation is bounded and never becomes polling. (`PLAN.md` §17)
- Queue depth, oldest-job age, attempts, analysis latency, provider failures, and cost per inspection are observable (shared observability surface with the QC feature). (`PLAN.md` §17)

## 4. Wireframes / mockups

No visual mockup exists in the source; this sequence schematic shows the invalidation-then-refetch pattern the client must implement — it never trusts the realtime payload as data.

```text
DB commits event  ──▶  rfq:<case_id>:activity  ──▶  Client receives
                                                        { event_id, event_type, revision }
                                                              │
                                                   debounce + "one in flight" guard
                                                              │
                                                              ▼
                                          Client calls workspace_get_rfq_production(case_id)
                                          or intools_get_rfq_operations(case_id)
                                                              │
                                                              ▼
                                              UI re-renders from the authoritative aggregate
```

## 5. Acceptance criteria

(`PLAN.md` §23 "Realtime and notifications")
- Buyer and Intools update from committed events without polling.
- Duplicate events do not duplicate notifications or list rows.
- Reconnect performs one authoritative refresh.
- Email is limited to actions, exceptions, and transactional milestones.
- Deep links use canonical Requests, Invoices, Messages, or Orders destinations.

## 6. States and error handling

| Condition | Required behavior | Source |
|---|---|---|
| Realtime disconnected | Show saved state and refresh once on reconnect | `PLAN.md` §18 |
| Notification delivery failed | Preserve committed event; retry delivery independently | `PLAN.md` §18 |
| Notification destinations produce retired routes | Must be corrected to canonical `/dashboard/requests/<id>` or `/intools/requests/<id>` | `PLAN.md` §16, §19 item 7 |

## 7. Dependencies & milestones

- **Depends on:** every other feature in this wave as an event source — [PRD 01](01-supplier-outreach-drafting.md), [PRD 02](02-quote-approval-atomicity.md), [PRD 03](03-production-monitoring.md), [PRD 04](04-visual-qc-triage-and-review.md) all emit the committed events this feature distributes.
- **Delivery wave:** Wave 6 — Realtime and notifications: add private RFQ activity invalidation, bounded aggregate refresh, production/QC notification mapping, verify canonical deep links and delivery idempotency. (`PLAN.md` §22)
- **Rollout flag:** `rfq_activity_realtime_enabled`. (`PLAN.md` §25)
- **Infrastructure boundary:** Supabase Pro owns committed-event invalidation, notification records, and bounded scheduler state; the existing Vercel application consumes invalidation and re-fetches guarded aggregates. (`PLAN.md` §11.1)

## 8. Open questions / not specified in source docs

- Exact retry backoff schedule for failed notification delivery (beyond "retry delivery independently").
- Whether buyer email preference (referenced in `PRODUCT.md` for Messages reminders) also gates these new notification categories — `PLAN.md` does not restate that constraint for this feature.
