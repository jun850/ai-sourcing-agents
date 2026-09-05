# PRD 02 — Quote Approval Atomicity

**Source of truth:** `docs/AI_NATIVE_HUMAN_LOOP_PLATFORM_PLAN.md` ("PLAN.md") §6, §4.2 (gate rows "Quote publication", "Quote selection"), §15.2, §17, §19 (item 8), §22 (Wave 3), §23. No detail below is invented.

## 1. Overview & use cases

### 1.1 Problem statement

The current quote path is three sequential PostgREST calls (upsert, set total, publish). A later call failing after an earlier one succeeds can leave a **partial draft persisted**, and produces unnecessary PostgREST traffic. (`PLAN.md` §6, §19 item 8)

### 1.2 Use cases

- As an **Ops user**, I want publishing a reviewed quote to be one action that either fully succeeds or fully fails, so that I never end up with a half-saved quote a buyer could see in an inconsistent state. (`PLAN.md` §6)
- As a **buyer**, I want to keep comparing all published quotes (up to three) and select one, exactly as today, so this fix is invisible to me except that it's more reliable. (`PLAN.md` §2.3, §4.2 "Quote selection")
- As the **Quote Normalizer agent**, I take supplier-confirmed source terms and produce a comparable structured draft — I never determine or publish the authoritative price. (`PLAN.md` §3.3, §6)

### 1.3 Non-goals

- AI calculating undocumented landed cost, fees, freight, tax, duty, or margin. (`PLAN.md` §6)
- Changing the quote cap (still three). (`PLAN.md` §2.3, §6)
- New buyer-facing UI beyond the existing quote comparison/selection surface — this PRD is about the publication path's atomicity and integrity.

### 1.4 Users and access

- **Ops (admin) users**: publish the reviewed quote. (`PLAN.md` §3.2, §6)
- **Buyers**: compare all published quotes and select one — unchanged behavior, downstream of this fix. (`PLAN.md` §3.1, §4.2)
- **Quote Normalizer agent**: input = supplier-confirmed source terms; output = comparable structured draft; forbidden authority = cannot determine/publish price. (`PLAN.md` §3.3)

## 2. Functional requirements

The atomic publication operation (`intools_publish_rfq_quote_reviewed` — see [`TRD.md` §II.2.2](../TRD.md#ii22-quote-rpc-planmd-152)) must, in one transaction (`PLAN.md` §6):

1. Lock the quote and RFQ.
2. Revalidate match approval and supplier eligibility.
3. Validate positive unit price, MOQ, lead time, and total.
4. Enforce USD in v1 and the maximum of three visible quotes.
5. Store supplier-evidence references and the reviewed commercial snapshot.
6. Mark the approving operator and time.
7. Publish the quote.
8. Append audit/lifecycle events.
9. Emit the buyer notification within the same transaction.

### Gate-table framing (`PLAN.md` §4.2)

| Gate | Starting state | AI work | Human action | Server guard | Resulting event |
|---|---|---|---|---|---|
| Quote publication | Quote draft | Normalize comparable terms | Ops publishes quote | Approved match; positive server-validated values; quote cap | `quote_published` |
| Quote selection | Published quotes | Compare and summarize | Buyer selects one | Buyer owns case; quote still published; no prior selection | `proposal_selected` |

## 3. Non-functional requirements

- "Quote entry and publication use one atomic RPC" is a stated PostgREST/workload-safety rule, not just an implementation preference. (`PLAN.md` §17)
- Migration to this RPC must be additive; applied migrations are never rewritten. (`PLAN.md` §2.4; `AGENTS.md`)
- Stale revisions fail without overwriting another operator's work (`p_expected_revision` parameter). (`PLAN.md` §6, §23)

## 4. Wireframes / mockups

No visual mockup exists in the source; this sequence schematic makes the "one atomic call" contrast with the legacy path visible to a non-engineering reader.

```text
BEFORE (legacy — 3 browser calls, can partially fail)
  Ops UI --upsert draft--> DB
  Ops UI --set total------> DB      ← a failure here leaves an upserted-but-untotaled draft
  Ops UI --publish--------> DB

AFTER (this PRD — 1 RPC, all-or-nothing)
  Ops UI --intools_publish_rfq_quote_reviewed(quote_id, payload, expected_revision)--> DB
                                                    │
                                    ┌───────────────┴───────────────┐
                                    │ 1 lock  2 revalidate  3 validate │
                                    │ 4 enforce cap/currency  5 store  │
                                    │ 6 mark approver  7 publish       │
                                    │ 8 audit/lifecycle  9 notify      │
                                    └───────────────────────────────────┘
                                    (single DB transaction)
```

## 5. Acceptance criteria

(`PLAN.md` §23 "Authority and data integrity", applied to quotes)
- No model or browser action can approve a supplier, publish a quote, settle payment, approve QC, or advance shipment.
- Every consequential action (quote publication) records actor, time, source state, resulting state, and target record.
- Stale revisions fail without overwriting another operator's work.

## 6. States and error handling

| Condition | Required behavior | Source |
|---|---|---|
| Supplier eligibility changed since match approval | Block contact/quote publication and require re-review | `PLAN.md` §18 |
| Non-positive unit price, MOQ, lead time, or total | Publication rejected (validation step 3) | `PLAN.md` §6 |
| Currency other than USD (v1) | Publication rejected (enforcement step 4) | `PLAN.md` §6 |
| Fourth quote attempted | Publication rejected — cap of three | `PLAN.md` §2.3, §6 |
| Partial-call failure (legacy 3-call path) | Eliminated by moving to one transaction | `PLAN.md` §6, §19 item 8 |

## 7. Dependencies & milestones

- **Depends on:** an approved, contacted supplier with supplier-confirmed terms recorded (upstream gates: "Supplier contacted", "Supplier response"). (`PLAN.md` §4.2)
- **Blocks:** [PRD 03 Production monitoring](03-production-monitoring.md)'s "Sample payment" gate, which starts only after a quote is selected. (`PLAN.md` §4.2 "Sample payment" row)
- **Delivery wave:** Wave 3 — Quote atomicity: add the atomic RPC, attach supplier evidence and approval identity, replace sequential browser calls, preserve all approved quote visibility and the existing cap. (`PLAN.md` §22)
- **Rollout flag:** `atomic_quote_publication_enabled`. (`PLAN.md` §25)
- **Infrastructure boundary:** quote authority is one Supabase Pro transaction invoked from the existing Vercel application; no worker or additional cloud service participates. (`PLAN.md` §11.1)

## 8. Open questions / not specified in source docs

- Whether existing in-flight (already-partially-saved) quote drafts require a data-migration/cleanup step — not addressed in `PLAN.md`.
- Multi-currency support beyond USD is explicitly future/undated.
