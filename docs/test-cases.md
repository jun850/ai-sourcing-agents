# Test Cases — Atelix AI-Native Human-Loop Platform and Visual QC

**Source of truth:** `docs/AI_NATIVE_HUMAN_LOOP_PLATFORM_PLAN.md` ("PLAN.md") — primarily §4.2 (gate table / server guards), §17 (workload safety), §18 (failure behavior table), §19 (bug-bash baseline), §23 (acceptance criteria + verification gates). Every test case below is traceable to a stated rule, limit, or failure behavior; where a boundary value is stated (e.g., "maximum of three," "250 MB," "three minutes"), the corresponding boundary test is listed explicitly. No test case asserts a number or behavior the source docs don't state.

**How to read this document:** each feature section has (a) functional test cases derived from acceptance criteria/functional requirements, and (b) edge cases derived from the failure-behavior table and stated limits. Test IDs are stable references, not automation IDs.

---

## 0. Pre-existing defects carried from the bug-bash baseline

`PLAN.md` §19 lists issues found by a planning audit that must be resolved (mostly in Wave 1) before visual-QC automation is considered production-ready. Each is a required regression test once fixed.

| # | Defect | Expected fixed-state test |
|---|---|---|
| 1 | `workspace_get_rfq_production` no longer returns `order`, but `ProductionTab` still depends on `data.order` | Assert the RPC response includes a non-null `order` object; assert `ProductionTab` renders order number and QC/shipping/delivery stage without a client-side error |
| 2 | Buyer Production UI calls the bulk-paid order a "Sample order" | Assert the bulk-paid order's buyer-visible label is not "Sample order" |
| 3 | `publishIntoolsRfqSample` and `updateIntoolsOrderProductionStage` exist in the typed client but are unwired | Assert both functions are invoked by a real Intools UI action and produce the expected lifecycle event |
| 4 | Production data loads on mount only, no subscription to committed lifecycle changes | Assert the production view updates after a lifecycle event commits, without a manual reload |
| 5 | Lifecycle event reads omit IDs, actors, metadata, evidence relationships | Assert each returned event includes `id`, `actor`, `metadata`, and evidence relationship fields |
| 6 | Existing RFQ/Ops-message attachment buckets reject video, unsuitable for large QC evidence | Assert QC evidence uses the new `rfq-qc-evidence` bucket, not the messaging attachment bucket |
| 7 | Notification destinations still produce retired `/intools/rfq` and `/dashboard/products` routes | Assert no notification payload contains `/intools/rfq` or `/dashboard/products`; all deep links match `/dashboard/requests/<id>` or `/intools/requests/<id>` |
| 8 | Quote upsert/total/publish is three sequential calls, can persist a partial draft | Assert quote publication is one RPC call and a simulated mid-sequence failure leaves no partial draft (see [§2 Quote atomicity test cases](#2-quote-approval-atomicity)) |
| 9 | `qa:intools-supplier-bulk` references removed `src/intools-suppliers.tsx`, fails `ENOENT` | Assert `npm run qa:intools-supplier-bulk` passes after the fixture is replaced |
| 10 | Linked database lint reports `STABLE` routing functions calling a volatile guard | Assert lint passes after the routing-function volatility is resolved additively |
| 11 | Compatibility-only `intools_confirm_rfq_order` raises intentionally but produces unused-parameter lint warnings | Assert lint is clean or the warning is explicitly accepted/documented |
| 12 | Local database lint unverified — local Postgres unavailable at inspection time | Assert local database lint runs and passes once local Postgres is available |

---

## 1. Supplier Outreach Drafting

Feature spec: [PRD 01](prd/01-supplier-outreach-drafting.md).

### 1.1 Functional test cases

| ID | Case | Expected result | Source |
|---|---|---|---|
| OUT-F1 | Admin saves a new template version with only allowlisted placeholders | New `draft` version created; previous active version untouched | `PLAN.md` §5.4 |
| OUT-F2 | Admin activates a draft version | Previous active version retired; new version active; audit event appended; all in one transaction | `PLAN.md` §5.4, §15.1 |
| OUT-F3 | Ops opens "Prepare supplier email" on an **approved** match | Modal opens with subject/body rendered from active template + real RFQ/supplier data | `PLAN.md` §5.2 |
| OUT-F4 | RFQ has no value for `[.budget]` | Rendered draft shows literally "Not provided by buyer" in that field | `PLAN.md` §5.3 |
| OUT-F5 | Ops clicks "Copy subject" / "Copy body" / "Copy all" | Corresponding copy event recorded; draft status remains `copied`; RFQ state unchanged | `PLAN.md` §5.2, §18 |
| OUT-F6 | Ops clicks "Mark supplier as contacted" on a still-approved, still-eligible match | Event `supplier_contacted` recorded; RFQ advances to `awaiting_supplier` when appropriate | `PLAN.md` §4.2, §5.4 |
| OUT-F7 | Ops clicks "Reset from latest master template" | Draft reverts to the current active template's rendering, discarding local edits | `PLAN.md` §5.2 |

### 1.2 Edge cases

| ID | Case | Expected result | Source |
|---|---|---|---|
| OUT-E1 | "Prepare supplier email" attempted on a suggested/rejected match | CTA is disabled; action is blocked | `PLAN.md` §5.2 |
| OUT-E2 | No active template exists | Draft CTA disabled; Ops linked to Master settings | `PLAN.md` §18 |
| OUT-E3 | Admin tries to activate a template containing an unknown placeholder (e.g., `[.margin]`) | Activation blocked; exact offending token(s) shown | `PLAN.md` §5.3, §18 |
| OUT-E4 | Two Ops users edit the same draft concurrently; second save uses a stale `p_expected_revision` | Second save rejected as a conflict; first operator's edit is preserved; UI shows compare/reload option | `PLAN.md` §18 |
| OUT-E5 | Clipboard permission denied by browser | Draft remains visible/selectable as plain text; no error swallows the draft | `PLAN.md` §18 |
| OUT-E6 | Ops copies the draft but never sends the email outside Atelix | RFQ status remains `copied`; no auto-advance to `awaiting_supplier` | `PLAN.md` §18 |
| OUT-E7 | Supplier match is rejected/expires *after* a draft was created but *before* "Mark supplier as contacted" | Contact action blocked; case routed back to re-review | `PLAN.md` §18 |
| OUT-E8 | Subject template at 240 characters (boundary) vs. 241 characters | 240 accepted; 241 rejected | `PLAN.md` §5.4 (`subject_template`: 1–240 characters) |
| OUT-E9 | Body template at 12,000 characters (boundary) vs. 12,001 characters | 12,000 accepted; 12,001 rejected | `PLAN.md` §5.4 (`body_template`: 1–12,000 characters) |
| OUT-E10 | Attempt to save an empty (0-character) subject or body | Rejected — minimum is 1 character | `PLAN.md` §5.4 |
| OUT-E11 | Attempt to activate a second English version while one is already active | Blocked — only one active English version permitted (or the activation retires the prior one atomically, per §5.4 — assert exactly one active version exists post-activation, never zero or two) | `PLAN.md` §5.4 |
| OUT-E12 | Buyer attempts to view outreach draft content directly | Not exposed to buyer; buyer only sees the case-level "Supplier outreach started" notification | `PLAN.md` §16 |

---

## 2. Quote Approval Atomicity

Feature spec: [PRD 02](prd/02-quote-approval-atomicity.md).

### 2.1 Functional test cases

| ID | Case | Expected result | Source |
|---|---|---|---|
| QUO-F1 | Ops publishes a quote for an approved match with valid positive price/MOQ/lead time/total, in USD | Quote published; audit/lifecycle events appended; buyer notification emitted in the same transaction | `PLAN.md` §6 |
| QUO-F2 | Buyer views Requests after publication | Sees the newly published quote among up to 3 visible quotes | `PLAN.md` §2.3, §4.2 |
| QUO-F3 | Buyer selects one of the published quotes | Event `proposal_selected`; no prior selection existed | `PLAN.md` §4.2 |

### 2.2 Edge cases

| ID | Case | Expected result | Source |
|---|---|---|---|
| QUO-E1 | Simulate failure mid-transaction (e.g., step 6 "mark approving operator") | No partial quote is persisted — entire operation rolls back | `PLAN.md` §6, §19 item 8 |
| QUO-E2 | Attempt to publish with unit price = 0 or negative | Rejected by validation step 3 | `PLAN.md` §6 |
| QUO-E3 | Attempt to publish with MOQ or lead time = 0/negative | Rejected by validation step 3 | `PLAN.md` §6 |
| QUO-E4 | Attempt to publish in a non-USD currency | Rejected — USD enforced in v1 | `PLAN.md` §6 |
| QUO-E5 | Attempt to publish a 4th visible quote for the same case | Rejected — cap of 3 enforced | `PLAN.md` §2.3, §6 |
| QUO-E6 | Supplier eligibility revoked after match approval but before publish | Publication blocked; re-review required | `PLAN.md` §18 |
| QUO-E7 | Publish call uses a stale `p_expected_revision` | Rejected as a conflict; no overwrite | `PLAN.md` §23 |
| QUO-E8 | Buyer attempts to select a quote a second time for the same case | Rejected — "no prior selection" guard | `PLAN.md` §4.2 |
| QUO-E9 | AI (Quote Normalizer) output includes a calculated landed cost/freight/tax/duty/margin figure | Rejected/flagged — normalizer must not calculate undocumented figures | `PLAN.md` §6 |

---

## 3. Production Monitoring

Feature spec: [PRD 03](prd/03-production-monitoring.md).

### 3.1 Functional test cases

| ID | Case | Expected result | Source |
|---|---|---|---|
| PRO-F1 | Buyer pays the sample invoice via Stripe Checkout | Webhook settles; event `invoice_paid:sample` | `PLAN.md` §4.2 |
| PRO-F2 | Ops publishes "sample ready" while lifecycle is `sample_in_progress` | Event `sample_ready` | `PLAN.md` §4.2 |
| PRO-F3 | Buyer approves/declines the ready sample (exactly one pending decision) | Event `sample_approved` or `sample_declined` | `PLAN.md` §4.2 |
| PRO-F4 | Buyer pays the bulk invoice | Webhook settles; event `invoice_paid:bulk` | `PLAN.md` §4.2 |
| PRO-F5 | Ops publishes a production update with a valid state and expected revision | Event `production_update_published`; draft remains private until published | `PLAN.md` §4.2, §7.2 |
| PRO-F6 | A published update is later corrected | New version created; prior published record retained, not overwritten | `PLAN.md` §7.2 |
| PRO-F7 | `workspace_get_rfq_production` called for a case with QC approved | Response includes `order`, lifecycle, phase invoices, granular events, latest production update, current QC review, buyer-visible QC asset metadata, next expected update, exception summary | `PLAN.md` §15.6 |

### 3.2 Edge cases

| ID | Case | Expected result | Source |
|---|---|---|---|
| PRO-E1 | Ops attempts to advance to `shipped` without a current approved QC review | Guarded RPC fails closed | `PLAN.md` §7.3, §18 |
| PRO-E2 | A second sample decision is attempted after one is already recorded | Rejected — only one pending decision allowed | `PLAN.md` §4.2 |
| PRO-E3 | Production update submitted with a stale expected revision | Rejected as a conflict | `PLAN.md` §4.2 |
| PRO-E4 | Production update evidence references an asset not owned by the case | Rejected — evidence ownership guard | `PLAN.md` §4.2 |
| PRO-E5 | Buyer views the bulk-paid order | Label is not "Sample order" (regression test for bug-bash item 2) | `PLAN.md` §19 item 2 |
| PRO-E6 | Lifecycle changes while a buyer has the Production tab open | View updates from the committed event, not only on next mount/reload | `PLAN.md` §19 item 4 |

---

## 4. Visual QC — Triage and Review

Feature spec: [PRD 04](prd/04-visual-qc-triage-and-review.md).

### 4.1 Functional test cases

| ID | Case | Expected result | Source |
|---|---|---|---|
| QC-F1 | Ops uploads images/video via reserve → TUS upload → finalize | Asset inserted only after finalize validates reservation + object metadata; analysis idempotently queued | `PLAN.md` §15.3 |
| QC-F2 | Worker claims jobs, fetches context, completes analysis | `qc_claim_analysis_jobs` (≤2), `qc_get_analysis_context` (1 bulk call), `qc_complete_analysis_jobs` (1 bulk call) all succeed with valid schemas | `PLAN.md` §15.4 |
| QC-F3 | Analysis produces findings citing valid frames/assets/checklist references | Findings stored; each reference belongs to the owning inspection/run | `PLAN.md` §12.6 |
| QC-F4 | Ops reviews findings: accepts some, dismisses some, amends one | Review stores the accepted/dismissed/amended sets alongside the decision | `PLAN.md` §10 |
| QC-F5 | Ops publishes decision = `approved` | Immutable review created; substate updated; shipment guard unlocked | `PLAN.md` §7.3, §15.5 |
| QC-F6 | Ops publishes decision = `rework_required` / `reinspection_required` / `insufficient_evidence` | Immutable review created; shipment remains locked; expected next update recorded | `PLAN.md` §10, §18 |
| QC-F7 | Ops selects specific `buyer_visible_asset_ids` when publishing | Only those assets/summary become visible to the buyer | `PLAN.md` §10, §23 |
| QC-F8 | Beauty/skincare substance inspection produces a finding | Output explicitly labeled "Visual observation only" | `PLAN.md` §8.2 |

### 4.2 Edge cases (media & pipeline limits)

| ID | Case | Expected result | Source |
|---|---|---|---|
| QC-E1 | Upload exactly 10 images in one inspection update (boundary) vs. 11 images | 10 accepted; 11th rejected | `PLAN.md` §11.3 |
| QC-E2 | Upload a 2nd video in the same inspection update | Rejected — max 1 video per update | `PLAN.md` §11.3 |
| QC-E3 | Video exactly 250 MB (boundary) vs. 250 MB + 1 byte | 250 MB accepted; over rejected | `PLAN.md` §11.3 |
| QC-E4 | Video exactly 3:00 minutes (boundary) vs. 3:00:01 | 3:00 accepted; over rejected | `PLAN.md` §11.3 |
| QC-E5 | Upload a MIME type outside the accepted list (e.g., `image/gif`) | Rejected at finalize (declared MIME type / magic bytes check) | `PLAN.md` §11.3 |
| QC-E6 | Upload interrupted mid-transfer | TUS resumes; no asset row created until finalize succeeds | `PLAN.md` §18 |
| QC-E7 | Uploaded file's magic bytes don't match its declared MIME type | Finalize rejects it | `PLAN.md` §11.3 |
| QC-E8 | Corrupt/unusable video (decoder probe fails) | Marked evidence-unusable; replacement requested; **not** treated as a product-defect finding | `PLAN.md` §11.3, §18 |
| QC-E9 | Evidence set is blurry, dark, incomplete (missing required views), or duplicated | Returned as `evidence_quality` risk category, not a defect verdict | `PLAN.md` §9, §11.3 |
| QC-E10 | Worker crashes/times out mid-job | Lease expires; job becomes reclaimable; retried up to 3 attempts total with backoff, then dead-letter | `PLAN.md` §17, §18 |
| QC-E11 | Model returns invalid JSON (schema violation) | Output rejected; no partial findings stored | `PLAN.md` §18 |
| QC-E12 | Model finding cites a frame ID that doesn't exist in the asset set | Finding/run completion rejected | `PLAN.md` §18 |
| QC-E13 | OpenRouter unavailable, or no zero-data-retention-compatible route available | Run marked `analysis_failed`; manual review remains available; privacy constraints are never relaxed to compensate | `PLAN.md` §11.2, §18 |
| QC-E14 | Model attempts to output a forbidden field (`pass`, `fail`, `approved`, `shipment_ready`, inferred composition/certification, "complete order conforms") | Output rejected / stripped — never stored or surfaced | `PLAN.md` §9 |
| QC-E15 | Analysis run produces zero findings | Zero findings does **not** imply approval; Ops review is still required | `PLAN.md` §10 |
| QC-E16 | Ops attempts to advance shipment with no published review, or only a non-`approved` review | Guarded RPC fails closed | `PLAN.md` §18 |
| QC-E17 | Buyer requests to see raw/unreviewed QC evidence | Access denied — buyers see only Ops-approved buyer-visible assets/summary | `PLAN.md` §23 |
| QC-E18 | A previously published review is "corrected" | A **new** review version is created; prior version retained, not overwritten | `PLAN.md` §18 |
| QC-E19 | Worker attempts to claim more than 2 inspections in one execution | Claim capped at 2 regardless of queue depth | `PLAN.md` §15.4, §17 |
| QC-E20 | Two finalize calls race for the same asset (double-submit / retry) | Idempotent — only one asset row results | `PLAN.md` §17 |
| QC-E21 | Attempt to send buyer identity, supplier private contact, routing rationale, full original video, or a long-lived signed URL to OpenRouter | Blocked by data-minimization rule before the request is sent | `PLAN.md` §11.2 |
| QC-E22 | Supabase scheduler calls Vercel `/run` without the configured bearer secret, or a browser calls it directly | Request rejected before a job is claimed; no media or user data is returned | `PLAN.md` §11.1 |
| QC-E23 | A Vercel invocation reaches 220 seconds with a stage incomplete | No new work starts; safe stage/cursor/artifact state is checkpointed and the invocation exits by 240 seconds | `PLAN.md` §11.1, §17 |
| QC-E24 | A three-minute video requires multiple invocations | Each segment is idempotent; later invocations resume from the stored cursor without duplicate findings or artifacts | `PLAN.md` §11.1, §11.3, §17 |

---

## 5. Realtime Activity and Notifications

Feature spec: [PRD 05](prd/05-realtime-activity-and-notifications.md).

### 5.1 Functional test cases

| ID | Case | Expected result | Source |
|---|---|---|---|
| RT-F1 | A committed event fires (e.g., `qc_review_published`) | Broadcast payload contains exactly `event_id`, `event_type`, `revision` — nothing else | `PLAN.md` §15.7 |
| RT-F2 | Client receives the broadcast | Client re-fetches the authoritative aggregate RPC rather than trusting the payload as data | `PLAN.md` §15.7 |
| RT-F3 | "Quote published" event fires | Buyer in-app: yes; Admin in-app: yes; Email: buyer action required | `PLAN.md` §16 |
| RT-F4 | "RFQ submitted" event fires | Buyer in-app: yes; Admin in-app: yes; Email: no | `PLAN.md` §16 |
| RT-F5 | "QC analysis ready" event fires | Buyer in-app: no; Admin in-app: yes; Email: Ops action required | `PLAN.md` §16 |
| RT-F6 | Notification generated for any event | Uses a deterministic idempotency key and a canonical deep link (`/dashboard/requests/<id>` or `/intools/requests/<id>`) | `PLAN.md` §16 |

### 5.2 Edge cases

| ID | Case | Expected result | Source |
|---|---|---|---|
| RT-E1 | Same underlying event delivered twice (e.g., retried webhook → duplicate lifecycle write) | No duplicate notification or duplicate list row is produced | `PLAN.md` §23 |
| RT-E2 | Client receives 5 invalidation signals in rapid succession | Debounced; at most one aggregate request in flight, at most one trailing refresh queued | `PLAN.md` §15.7 |
| RT-E3 | Realtime connection drops and reconnects | Client shows last-known saved state while disconnected; performs exactly one authoritative refresh on reconnect | `PLAN.md` §18 |
| RT-E4 | Client changes route/case | Client unsubscribes from the previous `rfq:<case_id>:activity` topic | `PLAN.md` §15.7 |
| RT-E5 | Notification delivery (e.g., email send) fails | Committed event is preserved; delivery is retried independently of the event itself | `PLAN.md` §18 |
| RT-E6 | A broadcast payload is inspected for supplier data, commercial terms, storage paths, signed URLs, or finding content | None present — payload is invalidation-only | `PLAN.md` §15.7 |
| RT-E7 | Client logic is checked for any polling loop | None found — realtime invalidation must never degrade into polling | `PLAN.md` §17 |

---

## 6. Personas and Agent Authority (cross-cutting authorization tests)

Feature spec: [PRD 06](prd/06-personas-and-agent-authority.md).

| ID | Case | Expected result | Source |
|---|---|---|---|
| AUTH-E1 | Buyer (browser) attempts to call any admin-only or service-role-only RPC directly (outreach, quote publish, QC review, worker claim/context/complete) | Rejected by role check | `PLAN.md` §15.1–§15.5, §23 |
| AUTH-E2 | Any agent output (Intake, Match Analyst, Outreach Draft, Quote Normalizer, Production Summarizer, QC Vision Triage, Risk Monitor, Notification Composer) is checked for writing directly to an authoritative table without going through a guarded RPC/human step | Never occurs — every agent output is a draft/recommendation/observation, not a write of truth | `PLAN.md` §2.1, §3.3 |
| AUTH-E3 | A model or browser action attempts to approve a supplier, publish a quote, settle payment, approve QC, or advance shipment | Structurally blocked at the authority layer | `PLAN.md` §23 |
| AUTH-E4 | Every consequential action (approval, publish, contact, review) is inspected in the audit log | Actor, time, source state, resulting state, and target record are all present | `PLAN.md` §23 |
| AUTH-E5 | An attempt is made to edit an already-applied migration | Rejected by process/review — migrations are additive only | `AGENTS.md`; `PLAN.md` §2.4, §23 |
| AUTH-E6 | Two concurrent writes to the same record use the same starting revision | Second write fails as a conflict; does not silently overwrite the first | `PLAN.md` §23 |

---

## 7. Cross-cutting non-functional / workload-safety tests

Derived from `PLAN.md` §17 and reaffirmed baseline rules in `PRODUCT.md`/`AGENTS.md`.

| ID | Case | Expected result | Source |
|---|---|---|---|
| PERF-1 | Load a Requests/Timeline surface for a case with many suppliers/frames/findings/notifications | One aggregate RPC call per surface load — never one call per supplier/frame/finding/recipient/event | `PLAN.md` §17 |
| PERF-2 | Load a long activity history | Stable cursor pagination is used, not offset-based or full-table reads | `PLAN.md` §17 |
| PERF-3 | Simulate a large QC queue backlog | Database claim remains capped at 2; the Vercel Hobby worker requests only 1 job per invocation; queue depth and oldest-job age remain observable | `PLAN.md` §11.1, §17 |
| PERF-4 | Simulate 3 consecutive job failures for the same analysis job | Job moves to dead-letter state after 3 attempts with exponential backoff; expired leases are reclaimable | `PLAN.md` §17 |
| PERF-5 | Retry an already-completed upload finalize or worker completion call | Idempotent — no duplicate asset/finding/event is created | `PLAN.md` §17 |
| PERF-6 | Any newly added script, migration, backfill, or automation touching Supabase | Reviewed for PostgREST call volume before release; bounded/batched/idempotent; the review is recorded in verification evidence | `PRODUCT.md`; `AGENTS.md`; `PLAN.md` §2.4 |
| PERF-7 | Two scheduled `/run` invocations overlap | Leased `FOR UPDATE SKIP LOCKED` claim prevents duplicate ownership; each invocation makes one claim, one context, and one checkpoint-or-complete RPC | `PLAN.md` §11.1, §17 |

---

## 8. Verification gates (must all pass before this wave is considered shippable)

(`PLAN.md` §23 "Verification gates" — see [`TRD.md` §II.6](TRD.md#ii6-testing-strategy) for the full list). Evidence for source/build, local database, linked database, authenticated browser, deployed application, Supabase Storage, OpenRouter, email provider, and Stripe must be reported **separately** — a task must never claim an untested layer. (`PLAN.md` §23; `CLAUDE.md`)

## 9. Accessibility test cases (WCAG 2.2 AA, per `PLAN.md` §2.4, §23)

| ID | Case | Expected result |
|---|---|---|
| A11Y-1 | Operate Master settings, the outreach modal, QC upload, and QC review entirely via keyboard | All controls reachable and operable; no mouse-only interaction |
| A11Y-2 | Tab through the outreach modal and QC review drawer | Focus is visible and never obscured |
| A11Y-3 | Trigger a busy/loading state during upload or save | Programmatic busy/status/error messaging is exposed (e.g., `aria-busy`) |
| A11Y-4 | Enable OS-level reduced motion | Any progress/shimmer animation has a reduced-motion alternative |
| A11Y-5 | Resize text to 200% / reflow at 400% | No task content is lost; no horizontal scrolling is introduced on narrow screens |

## 10. Not specified in source docs

- Specific automated test framework/runner names beyond the `npm run qa:*` script names already given.
- Load-test target numbers (concurrent users, requests/sec) — `PLAN.md` describes safety *rules* (bounded, idempotent, capped), not target throughput.
