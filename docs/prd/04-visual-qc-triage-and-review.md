# PRD 04 — Visual QC: AI Triage and Human Review

**Source of truth:** `docs/AI_NATIVE_HUMAN_LOOP_PLATFORM_PLAN.md` ("PLAN.md") §8–§12, §2.3, §3.2–3.3, §4.2 (gate rows "QC analysis", "QC review"), §15.3–15.5, §16–§18, §22 (Waves 4–5, 7), §23. No detail below is invented; engine/architecture and data-contract field lists are summarized at product-behavior level — full technical detail is in [`TRD.md`](../TRD.md).

## 1. Overview & use cases

### 1.1 Problem statement

Atelix needs to catch visible production risk from photos/video of goods before shipment, without ever letting a model — or the absence of a model finding — stand in for a pass/fail decision. Buyers must never see unreviewed findings or raw QC evidence. (`PLAN.md` §2.3, §10)

### 1.2 Use cases

- As an **Ops user**, I want to upload production photos/video and get AI-flagged risks with exact evidence citations (which image, which frame, which timestamp), so that I can review a summarized list instead of scrubbing raw footage myself. (`PLAN.md` §9)
- As an **Ops user**, I want the AI to be forbidden from ever saying "pass" or "fail" — I decide `approved`, `rework_required`, `reinspection_required`, or `insufficient_evidence`, and that decision is what's authoritative. (`PLAN.md` §10)
- As a **buyer**, I want to see only the evidence and summary Ops explicitly approved for me — never raw QC originals or unreviewed AI findings. (`PLAN.md` §2.3, §23)
- As a **beauty/skincare Ops reviewer**, I want every AI observation about product substance labeled "Visual observation only," so nobody mistakes it for a lab result. (`PLAN.md` §8.2)
- As the **QC Vision Triage Agent**, I take an approved specification, checklist, and derived images, and I return evidence-linked visible-risk findings — I cannot pass QC or unlock shipment. (`PLAN.md` §3.3)

### 1.3 Non-goals — what computer vision must never claim

(`PLAN.md` §8.3) The system must never claim visual proof of: chemical composition or ingredient identity; microbiological safety, stability, or contamination not visibly observable; fiber composition or material authenticity; certification or regulatory compliance; exact viscosity or other laboratory measurements; durability, strength, colorfastness, waterproofing, or long-term function; exact dimensions without a clearly readable scale; exact color without controlled light, camera calibration, and a known reference; complete order quantity from a partial view; hidden construction or defects not captured by the evidence.

Forbidden model-output fields: `pass`, `fail`, `approved`, `shipment_ready`, inferred composition, inferred certification, or a claim that the complete order is conforming. (`PLAN.md` §9)

### 1.4 Users and access

- **Ops (admin)**: uploads/records evidence-linked context, reviews AI visual-risk findings, publishes the authoritative QC decision. (`PLAN.md` §3.2)
- **Buyers**: see only Ops-approved buyer-visible summaries/assets after a published review; cannot see unreviewed findings or raw evidence. (`PLAN.md` §3.1, §23)
- **QC Vision Triage Agent**: input = approved specification, checklist, derived images; output = evidence-linked visible-risk findings; forbidden authority = cannot pass QC or unlock shipment. (`PLAN.md` §3.3)

## 2. Functional requirements

### 2.1 Supported categories and capture protocols (`PLAN.md` §8.1–§8.2)

Separate versioned checklists for: finished apparel and cut-and-sew goods; fabrics and materials; trims/buttons/labels/closures/hardware; fashion accessories; skincare packaging and visible product condition; beauty packaging (color, texture, shape, fill appearance, visible condition).

| Category | Required views/checks |
|---|---|
| Apparel & finished goods | Front, back, sides, interior; seams/stitching/hems/joins/closures/hardware; labels/branding/print/embroidery/placement; measurements with readable scale; surface finish/stains/holes/scratches/deformation/damage; repeated-unit view; packing and carton markings |
| Fabrics & materials | Full-width/full-piece view; roll/lot identity when provided; face, reverse, selvedge; weave/knit and surface close-ups; defect close-up with scale and context; shade comparison under controlled lighting with reference target; packing condition |
| Trims/buttons/labels/closures/hardware | Front/back/side; dimensions with readable scale; finish/coating/color/edges/holes/teeth/puller/fastening surface; branding/artwork alignment; attachment/operation demonstration where applicable; repeated batch view; packing and damage |
| Fashion accessories | All exterior sides and interior; construction/joins/lining/straps/hardware; dimensions and silhouette; branding/print/finish/function; packing and damage |
| Skincare/beauty packaging | Every panel; label/artwork alignment; batch/lot code when supplied; seal/cap/closure/pump/applicator; fill appearance and level; leakage/dents/scratches/print defects/deformation/packing |
| Visible skincare/beauty substance | Controlled-light color view; transparent-container view where possible; texture spread/movement demonstration; homogeneity/separation/sediment/bubbles/foreign visible matter/fill level/shape. **Every output labeled `Visual observation only`.** |

### 2.2 Visual-risk taxonomy (findings)

Allowlisted `category` values: `evidence_quality`, `reference_mismatch`, `construction_or_workmanship`, `surface_damage`, `contamination_or_foreign_matter`, `color_or_finish_variation`, `measurement_evidence`, `label_or_packaging`, `seal_or_leakage`, `quantity_or_coverage`, `process_or_safety_observation`, `unknown`. (`PLAN.md` §9)

Each finding: `category`, `severity` (`low`/`medium`/`high`/`unknown` — priority only), `confidence`, `asset_id`, `frame_id`, `timestamp_ms`, `contact_sheet_cell`, `bounding_box`, `observation`, `requirement_reference`, `why_it_matters`, `uncertainty`, `recommended_follow_up`. Full JSON shape in [`TRD.md` §II.4](../TRD.md#ii4-visual-risk-finding-schema-planmd-9).

### 2.3 Human QC decisions

Ops may publish exactly one of: `approved`, `rework_required`, `reinspection_required`, `insufficient_evidence`. (`PLAN.md` §10)

Each review records: exact analysis run and checklist version; exact asset set reviewed; accepted/dismissed/amended findings; Ops decision and rationale; buyer-visible summary; buyer-visible asset IDs; reviewer and timestamp; expected next update when the decision is not `approved`. **An AI analysis failure, low risk score, or absence of findings never implies approval.** (`PLAN.md` §10)

### 2.4 Media policy (product-level)

Accepted originals: `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/quicktime`, `video/webm`. Limits: ≤10 images/update; ≤1 video/update; ≤250 MB/video; ≤3 min/video; no-overwrite, immutable paths. An unusable/incomplete/blurred/dark/corrupt/duplicated/checklist-incomplete evidence set → `evidence_quality` risk, never a product-defect verdict. Full validation/frame-selection detail: [`TRD.md` §II.5](../TRD.md#ii5-qc-media-pipeline-specification-planmd-113). (`PLAN.md` §11.3)

### 2.5 Gate-table framing (`PLAN.md` §4.2)

| Gate | Starting state | AI work | Human action | Server guard | Resulting event |
|---|---|---|---|---|---|
| QC analysis | Quality-inspection evidence received | Detect visible risks and missing views | None yet | Immutable assets; valid checklist; idempotent run | `qc_analysis_ready` |
| QC review | Analysis ready | Present risks and evidence | Ops approves, requests rework/reinspection, or rejects evidence | Reviewer is admin; analysis/evidence revision matches | `qc_review_published` |

### 2.6 Data this feature depends on / produces

See [`TRD.md` §I.5](../TRD.md#i5-data-models-conceptual): `rfq_qc_checklist_versions`, `rfq_qc_inspections`, `rfq_qc_assets`, `rfq_qc_analysis_jobs`, `rfq_qc_analysis_runs`, `rfq_qc_findings`, `rfq_qc_reviews`. Private Storage bucket `rfq-qc-evidence`. (`PLAN.md` §11.3, §12)

## 3. Non-functional requirements

- The database claim boundary remains capped at **two**, but the Vercel Hobby worker claims exactly **one** inspection per invocation and advances one durable stage before checkpointing or completing. (`PLAN.md` §11.1, §17)
- Each claimed batch uses one context RPC and one completion RPC; maximum **three attempts** with exponential backoff and dead-letter state; expired leases reclaimable. (`PLAN.md` §17)
- Upload finalization and worker completion are idempotent. (`PLAN.md` §17)
- Only derived analysis images and required checklist/reference context go to the model — never original full videos, buyer identity/contact, supplier private contacts, routing rationale, non-visual-inspection commercial terms, or long-lived signed URLs. (`PLAN.md` §11.2)

## 4. Wireframes / mockups

No visual mockup exists in the source; this schematic lays out the Ops QC review surface using only the fields `PLAN.md` §10 specifies.

```text
┌─ RFQ <case_no> — QC review ────────────────────────────────────┐
│ Inspection: bulk / apparel        Checklist v3       Run #128    │
│ Asset set: 8 images, 1 video (contact sheets: 6)                  │
│                                                                     │
│ Findings (AI-suggested, evidence-linked — not authoritative)      │
│  ⚠ construction_or_workmanship  severity: medium  conf 0.82        │
│     "Visible seam waviness along the lower edge." → frame-0042    │
│     [Accept] [Dismiss] [Amend]                                     │
│  ⚠ evidence_quality  severity: low                                 │
│     "Interior view missing for 2 of 8 units."                     │
│     [Accept] [Dismiss] [Amend]                                     │
│                                                                     │
│ Ops decision:  ○ approved  ○ rework_required                       │
│                ○ reinspection_required  ○ insufficient_evidence    │
│ Rationale: [ ..................................................]  │
│ Buyer-visible summary: [ ........................................]│
│ Buyer-visible assets: [x] frame-0042  [ ] frame-0091               │
│                                                                     │
│                                     [ Publish QC review ]          │
└─────────────────────────────────────────────────────────────────┘
```

## 5. Acceptance criteria

(`PLAN.md` §23 "QC")
- Image and video uploads are private, resumable, bounded, and immutable.
- Findings cite valid evidence and checklist references.
- Model/provider failure cannot produce approval.
- Buyers cannot see unreviewed findings or raw evidence.
- Ops can amend/dismiss findings and publish a versioned review.
- Shipment fails closed without a current approved QC review.
- Beauty/skincare findings are explicitly limited to visual observations.

## 6. States and error handling

| Condition | Required behavior | Source |
|---|---|---|
| Upload interrupted | Resume via TUS; do not create asset until finalized | `PLAN.md` §18 |
| Invalid/corrupt media | Mark evidence unusable and request replacement | `PLAN.md` §18 |
| Worker timeout or 240-second application budget reached | Persist the latest safe checkpoint when possible; otherwise release after lease expiry and retry within limit; after the cap, require explicit human review | `PLAN.md` §11.1, §18 |
| OpenRouter unavailable / no privacy-compatible route | Mark `analysis_failed`; manual review remains available; never silently relax privacy constraints | `PLAN.md` §11.2, §18 |
| Invalid model JSON | Reject output; do not store partial findings | `PLAN.md` §18 |
| Finding cites unknown frame | Reject the finding/run completion | `PLAN.md` §18 |
| QC evidence corrected | Create a new asset/review version; retain prior history | `PLAN.md` §18 |
| QC not approved | Guarded shipment RPC fails closed | `PLAN.md` §18 |

## 7. Dependencies & milestones

- **Depends on:** [PRD 03 Production monitoring](03-production-monitoring.md) (QC evidence is uploaded against the `quality_inspection` substate of a production record). (`PLAN.md` §7.3)
- **Blocks:** shipment advancement in [PRD 03](03-production-monitoring.md) and the shipment/delivery notifications in [PRD 05](05-realtime-activity-and-notifications.md).
- **Delivery placement:** Wave 4 — Production and QC foundation (contracts, bucket, checklists, Ops review controls, shipment guard); Wave 5 — Vision engine (worker, OpenRouter analysis, evidence-citation validation, internal shadow mode); Wave 7 — Hardening and controlled rollout (one sampled image inspection and one short sampled video before broader rollout; enable buyer-visible reviewed QC evidence only after the human workflow is reliable). (`PLAN.md` §22)
- **Rollout flags:** `qc_evidence_upload_enabled`, `qc_ai_shadow_enabled`, `qc_buyer_visibility_enabled`. (`PLAN.md` §25)
- **Launch mode:** internal shadow mode — no structured labeled QC dataset exists today; every run requires Ops review; category/checklist/prompt/analyzer/frame-selection/model versions preserved for held-out per-category evaluation sets. Do not train a custom detector until a specific recurring defect has consistent human-reviewed positive/negative examples and a held-out evaluation set; any future detector remains triage-only until a separately approved authority change. (`PLAN.md` §20)
- **Infrastructure boundary:** Supabase Pro owns the private evidence, job checkpoints, leases, scheduler, and authoritative review. A separate native Vercel Hobby Python Function performs resumable OpenCV stages. GCP, AWS, and Tencent are excluded. (`PLAN.md` §11.1)

## 8. Open questions / not specified in source docs

- Exact per-category checklist item text (only capture protocols are given; literal checklist criteria strings are not enumerated in `PLAN.md`).
- Numeric confidence threshold, if any, that changes review priority beyond the stated `low/medium/high/unknown` severity levels.
