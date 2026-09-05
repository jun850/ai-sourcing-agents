# PRD 03 — Production Monitoring

**Source of truth:** `docs/AI_NATIVE_HUMAN_LOOP_PLATFORM_PLAN.md` ("PLAN.md") §7, §4.2 (gate rows "Sample payment" → "Delivery"), §15.6, §16, §19 (items 1–3, 5, 7), §22 (Wave 1), §23. No detail below is invented.

## 1. Overview & use cases

### 1.1 Problem statement

Buyers and Ops need a shared, server-authoritative production timeline for the paid phase of an RFQ (sampling → bulk → QC → shipment → delivery), without a new buyer navigation section, and without regressing the known bug where the production aggregate stopped returning order data. (`PLAN.md` §7, §19 item 1)

### 1.2 Use cases

- As a **buyer**, I want to see current phase/stage, who owns it, the latest Ops-verified update, and what I need to do next, inside the RFQ I already have open — not a new tab. (`PLAN.md` §7.1)
- As a **buyer**, I want the order I paid for the bulk phase to actually say "bulk," not "Sample order," so I'm not confused about what I paid for. (`PLAN.md` §19 item 2)
- As an **Ops user**, I want to publish a sample-ready update and change a production stage from Intools, using controls that are actually wired up. (`PLAN.md` §19 item 3)
- As an **Ops user**, I want production data to update live when I publish a change, not only when the buyer happens to reload the page. (`PLAN.md` §19 item 4)
- As a **buyer**, I want the transition to `shipped` to be impossible unless QC actually approved it — I shouldn't be able to see a shipped status that skipped review. (`PLAN.md` §7.3)

### 1.3 Non-goals

- No new buyer-facing navigation item or page. (`PLAN.md` §7.1)
- No rewriting of applied lifecycle history — new structured substates are additive beneath the existing `quality_inspection` top-level state. (`PLAN.md` §7.3)
- No change to the Request row / Intools queue visual pattern beyond the existing status/owner/due/count/filter conventions. (`PLAN.md` §7.1)

### 1.4 Users and access

- **Buyers**: read committed progress and published evidence for their own cases; approve or decline a ready sample; initiate Stripe Checkout for an eligible invoice. (`PLAN.md` §3.1)
- **Ops**: upload/record factory production evidence; advance guarded fulfillment stages when prerequisites are satisfied. (`PLAN.md` §3.2)
- **Production Summarizer agent**: input = Ops-entered update + evidence metadata; output = concise draft summary + missing-field flags; forbidden authority = cannot advance production state. (`PLAN.md` §3.3)

## 2. Functional requirements

### 2.1 Existing-surface extension (no new nav)

Extend the RFQ's Timeline and Orders/Production content with: current phase and stage; accountable owner; latest Ops-verified update; next expected update time; evidence count; open exception and mitigation; required buyer action; published QC review and selected evidence. The Request row and Intools queue use the existing status/owner/due/count/filter patterns; the Request drawer holds the operational controls. (`PLAN.md` §7.1)

### 2.2 Production update contract

Every buyer-visible production update requires: lifecycle phase and stage; Ops-verified note; source and received-at time; relevant evidence when the stage requires it; next expected update time; exception severity, when applicable; mitigation or required follow-up for an exception; publishing operator and time. Draft updates remain **private**. Corrections create a **new version** and retain the prior published record. (`PLAN.md` §7.2)

### 2.3 Production states

Keep the existing top-level lifecycle states. Add structured substates **beneath** `quality_inspection` (additive) (`PLAN.md` §7.3):

```text
awaiting_evidence → uploading → analysis_queued → analyzing → review_required
                                                                   │
                                     ┌─────────────────────────────┼───────────────────────┐
                                     ▼                              ▼                        ▼
                                 approved                   rework_required          reinspection_required
                                     │                                                insufficient_evidence
                                     ▼                                                analysis_failed
                              (only this unlocks
                               guarded transition
                               to `shipped`)
```

Only a current Ops-published `approved` QC review allows the guarded transition to `shipped`. (`PLAN.md` §7.3)

### 2.4 Gate-table framing (`PLAN.md` §4.2)

| Gate | Starting state | AI work | Human action | Server guard | Resulting event |
|---|---|---|---|---|---|
| Sample payment | Sample invoice sent | Explain recorded state | Buyer initiates Checkout | Server-computed invoice; verified webhook settles | `invoice_paid:sample` |
| Sample readiness | Paid sampling | Summarize Ops update | Ops publishes sample ready | Lifecycle is `sample_in_progress` | `sample_ready` |
| Sample decision | Sample ready | None | Buyer approves/declines | Buyer owns case; one pending decision | `sample_approved` or `sample_declined` |
| Bulk payment | Approved sample | Explain recorded state | Buyer initiates Checkout | Server-computed invoice; verified webhook settles | `invoice_paid:bulk` |
| Production update | Paid bulk | Structure update and identify missing evidence | Ops publishes update | Valid state, expected revision, evidence ownership | `production_update_published` |
| Shipment | Approved QC | Summarize shipment evidence | Ops advances shipment | Latest QC review is approved | `stage_changed:shipped` |
| Delivery | Shipped | Summarize delivery evidence | Ops confirms delivery | Ordered transition; evidence retained | `stage_changed:delivered` |

### 2.5 Data this feature depends on / produces

Extended `workspace_get_rfq_production(p_case_id)` aggregate — see [`TRD.md` §II.2.6](../TRD.md#ii26-aggregate-read-rpcs-planmd-156). (`PLAN.md` §15.6)

Existing RFQ and Ops message attachment buckets currently **reject video** and are not suitable for large QC evidence — a known gap the neighboring QC feature must not paper over. (`PLAN.md` §19 item 6; see [PRD 04](04-visual-qc-triage-and-review.md))

## 3. Non-functional requirements

- Visible RFQ state uses one aggregate RPC per surface refresh — never per-row/per-event browser fetches. (`PLAN.md` §17)
- Activity history uses stable cursor pagination. (`PLAN.md` §17)

## 4. Wireframes / mockups

No visual mockup exists in the source; this schematic lays out the stated fields inside the existing RFQ Timeline/Orders tab.

```text
┌─ RFQ <case_no> — Timeline / Production tab ────────────────────┐
│ Phase: bulk        Stage: quality_inspection › review_required   │
│ Owner: Atelix Operations           Next update expected: <time>  │
│ Evidence: 6 assets                                                │
│ Exception: none                                                   │
│ Required buyer action: — (waiting on Ops)                         │
│                                                                     │
│ Latest Ops-verified update                                        │
│  "Bulk production 60% complete, on schedule."     — <operator>, <time> │
│                                                                     │
│ Published QC review: (none yet — awaiting analysis)               │
└─────────────────────────────────────────────────────────────────┘
```

## 5. Acceptance criteria

Derived from `PLAN.md` §23 and §19:
- `workspace_get_rfq_production` returns `order`; `ProductionTab` renders order number and QC/shipping/delivery stage correctly.
- Buyer UI never labels a bulk-paid order "Sample order."
- `publishIntoolsRfqSample` and `updateIntoolsOrderProductionStage` are wired to real Intools actions.
- Production data subscribes to committed lifecycle changes (not mount-only).
- Lifecycle event reads include IDs, actors, metadata, evidence relationships.
- No horizontal task scrolling on narrow screens; 200% text resize / 400% reflow preserved.

## 6. States and error handling

| Condition | Required behavior | Source |
|---|---|---|
| QC not approved | Guarded shipment RPC fails closed | `PLAN.md` §18 |
| QC evidence corrected | Create a new asset/review version; retain prior history | `PLAN.md` §18 |
| Notification destinations point to retired routes | Must use canonical deep links, not retired `/intools/rfq` or `/dashboard/products` | `PLAN.md` §16, §19 item 7 |

## 7. Dependencies & milestones

- **Depends on:** [PRD 02 Quote approval atomicity](02-quote-approval-atomicity.md) (a selected quote precedes the sample-payment gate). (`PLAN.md` §4.2)
- **Blocks:** [PRD 04 Visual QC](04-visual-qc-triage-and-review.md) (production update precedes QC evidence upload) and [PRD 05 Realtime/notifications](05-realtime-activity-and-notifications.md) (production events are a primary notification source). (`PLAN.md` §4.2, §16)
- **Delivery placement:** Wave 1 — Restore lifecycle integrity (the bug-fix core of this PRD) and Wave 4 — Production and QC foundation (new production-update/QC contracts). (`PLAN.md` §22)
- **Rollout flag:** `production_updates_enabled`. (`PLAN.md` §25)
- **Infrastructure boundary:** production truth and lifecycle events stay in Supabase Pro and render through the existing Vercel application. (`PLAN.md` §11.1)

## 8. Open questions / not specified in source docs

- Exact copy for "required buyer action" strings per stage.
- Whether historical (pre-fix) production records need backfill — not addressed in `PLAN.md`.
