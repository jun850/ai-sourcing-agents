# PRD 01 — Supplier Outreach Drafting

**Source of truth:** `docs/AI_NATIVE_HUMAN_LOOP_PLATFORM_PLAN.md` ("PLAN.md") §5, plus §2.4, §3.2–3.3, §4.2 (gate rows "Outreach draft", "Supplier contacted"), §15.1, §17, §18, §23. No detail below is invented; anything not stated in `PLAN.md` is marked **Not specified in source docs**.

**Stakeholders:** Product Manager, Tech Lead, Architect, UI/UX, QA (per the BRD's stakeholder framing) — plus the Intools administrator and Ops persona directly.

## 1. Overview & use cases

### 1.1 Problem statement

Ops must contact eligible, approved suppliers with a consistent, reviewable email, without the platform ever claiming an email was sent or advancing RFQ state based on clipboard activity alone. Drafting must not invent supplier or buyer facts, and template governance must be auditable. (`PLAN.md` §5, §2.4)

### 1.2 Use cases (user stories, grounded only in stated capabilities)

- As an **Intools administrator**, I want to author, version, preview, and activate one English supplier-outreach template in Master settings, so that every RFQ outreach email is consistent and I can restore the last active version if a new one is wrong. (`PLAN.md` §5.1)
- As an **Ops user**, I want to open "Prepare supplier email" on an approved match and get an editable draft pre-filled from the active template and the real RFQ/supplier record, so that I don't retype the same email by hand. (`PLAN.md` §5.2)
- As an **Ops user**, I want to copy the subject, body, or both without the system assuming I've sent anything, so that I can paste into my real email client and still control when the RFQ actually advances. (`PLAN.md` §5.2)
- As an **Ops user**, I want to explicitly mark a supplier "contacted" as its own action, so that the audit trail shows exactly when outreach happened and by whom. (`PLAN.md` §5.2, §4.2)
- As a **buyer**, I want to see that outreach started on my case (without seeing supplier-level detail), so that I know my request is moving. (`PLAN.md` §16 "Supplier outreach started")

### 1.3 Non-goals

- Sending email from within Atelix — the platform never sends the email itself. (`PLAN.md` §5.2: "Copying content is not sending email.")
- Non-English templates — `locale` is `en` in v1. (`PLAN.md` §5.4)
- Storing the template in `platform_settings` (publicly readable; no structured validation or immutable version history). (`PLAN.md` §5.1)
- Any placeholder not on the allowlist. (`PLAN.md` §5.3)

### 1.4 Users and access

- **Intools administrators**: author/version/activate/restore templates from Master settings (`/intools/settings`, the tenth Intools section). (`PLAN.md` §5.1)
- **Ops (admin) users**: prepare, edit, copy, and mark-contacted an outreach draft from the Request drawer. (`PLAN.md` §5.2)
- **Buyers**: no direct interaction; buyer-visible effect is limited to the case-level "Supplier outreach started" notification (see [PRD 05](05-realtime-activity-and-notifications.md)). (`PLAN.md` §16)
- **Runtime agent** (Outreach Draft Agent): renders an editable English subject/body from the active template and allowlisted resolved fields; **cannot** send email or add supplier/commercial facts. (`PLAN.md` §3.3)

## 2. Functional requirements

### 2.1 Master settings — Supplier outreach email group

Location: `/intools/settings`, titled **Master settings**, the tenth Intools navigation section. (`PLAN.md` §5.1)

The surface also shows the seven controlled-rollout flags as attributed on/off controls. Database guards enforce dependency order; secrets and worker credentials never appear in this UI.

The group contains: English subject template; English body template; supported-placeholder reference; preview with clearly labeled non-production sample values; save as a new version; activate version; restore the last active version; creator, activator, and timestamps; read-only template audit history. (`PLAN.md` §5.1)

Rules:
- Activated versions are **immutable**; editing always creates a new version. (`PLAN.md` §5.4)
- Only one English version may be **active** at a time. (`PLAN.md` §5.4)
- Unknown placeholders **block activation** with the exact offending token list surfaced to the admin. (`PLAN.md` §5.3, §18)

### 2.2 Request-drawer interaction

Within each **approved** supplier match in the existing Request drawer, show one CTA: **Prepare supplier email**. (`PLAN.md` §5.2)

- The button stays **disabled** for suggested, rejected, or otherwise ineligible matches.
- Opens a centered modal containing: supplier name and RFQ number; editable subject input; editable body textarea; `Copy subject`, `Copy body`, `Copy all` actions; `Reset from latest master template` action; `Mark supplier as contacted` (the single consequential action); saved-draft status, template version, last editor, revision; loading, validation, stale-revision, save-error, copy-success, and permission-denied states.
- Copying is never conflated with sending: the platform must not show `sent` or advance supplier-outreach state merely because clipboard access succeeded. Ops explicitly records external contact only after sending the email outside Atelix. (`PLAN.md` §5.2)

### 2.3 Placeholder contract

Allowed placeholders (`PLAN.md` §5.3):

```text
[.case_no] [.product] [.quantity] [.material] [.certifications]
[.colors] [.sizes] [.budget] [.timeline] [.supplier_name]
```

Required settings-note and modal-tooltip copy (verbatim):

> Use placeholders such as `[.product]` and `[.budget]`. Values are inserted from the submitted RFQ and approved supplier record. Missing RFQ values appear as `Not provided by buyer`.

Resolution is deterministic and server-side, using the submitted RFQ snapshot and current approved supplier record only — never buyer revenue, private routing rationale, or other profile context. Default subject/body templates are specified verbatim in `PLAN.md` §5.3 and must be used as the shipped default content.

### 2.4 Lifecycle interaction

- A copied/saved draft does not by itself change RFQ state (event `outreach_draft_copied`). (`PLAN.md` §4.2)
- Marking a supplier contacted: Ops explicitly marks contacted; server guard requires an approved match and current draft revision; event `supplier_contacted`; advances the RFQ to `awaiting_supplier` when appropriate. (`PLAN.md` §4.2, §5.4)

### 2.5 Data this feature depends on / produces

See [`TRD.md` §I.5](../TRD.md#i5-data-models-conceptual): `rfq_outreach_template_versions`, `rfq_supplier_outreach_drafts`, `rfq_supplier_outreach_events` (append-only), `rfq_outreach_generation_runs`.

## 3. Non-functional requirements

- Guarded, admin-only RPCs for every write (see [`TRD.md` §II.2.1](../TRD.md#ii21-outreach-rpcs-planmd-151)). (`PLAN.md` §15.1)
- No per-supplier or per-frame PostgREST loops; outreach reads/writes are bounded per-case operations. (`PLAN.md` §17)
- Immutable audit trail for creation, edit, reset, copy, contact, and supersession events. (`PLAN.md` §5.4, §2.4)

## 4. Wireframes / mockups

No visual mockups exist in the source documents; the schematics below are a literal layout of the elements `PLAN.md` §5.1–§5.2 specifies, in the stated order — not a new design.

**Master settings — Supplier outreach email group** (`/intools/settings`):

```text
┌─ Master settings ─────────────────────────────────────────┐
│ Sidebar: Analytics ... Audit history | ▸ Master settings   │
├─────────────────────────────────────────────────────────────┤
│  Supplier outreach email                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Subject template   [.....................................]│
│  │ Body template       [ multi-line .......................]│
│  │ Placeholder reference: [.case_no] [.product] ... (list)│  │
│  │ Preview (sample values — clearly labeled non-production)│  │
│  │                                                          │
│  │ [Save as new version]  [Activate version]  [Restore last]│
│  │ Created by • Activated by • timestamps                  │
│  │ ── Read-only template audit history ──                  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Request drawer → approved match → outreach modal:**

```text
┌─ Prepare supplier email ───────────────────────────────────┐
│ Supplier: <name>        RFQ: <case_no>                      │
│ Subject: [ editable input                                 ] │
│ Body:    [ editable textarea                               ] │
│                                                               │
│ [Copy subject] [Copy body] [Copy all]  [Reset from template] │
│ Draft status: draft/copied/contacted • v<template_version>   │
│ Last editor: <name>         Revision: <n>                    │
│                                                               │
│                          [ Mark supplier as contacted ]      │
└───────────────────────────────────────────────────────────────┘
```

## 5. Acceptance criteria

(`PLAN.md` §23 "Outreach")
- Master settings accepts only the placeholder allowlist.
- `[.product]` and `[.budget]` render from the submitted RFQ.
- Missing fields render `Not provided by buyer`.
- Subject/body are editable and independently copyable.
- Copy never means sent.
- Only an approved, currently eligible supplier can be marked contacted.
- Reset uses the latest active template without overwriting another operator's newer edit.
- A supplier response requires an evidence reference and does not publish commercial terms.

## 6. States and error handling

| Condition                                        | Required behavior                                     | Source        |
| ------------------------------------------------ | ----------------------------------------------------- | ------------- |
| No active outreach template                      | Disable draft CTA and link Ops to Master settings     | `PLAN.md` §18 |
| Unknown placeholder                              | Block template activation with exact token list       | `PLAN.md` §18 |
| Stale outreach edit (concurrent editors)         | Preserve server version; show compare/reload conflict | `PLAN.md` §18 |
| Clipboard denied                                 | Keep draft visible and allow normal text selection    | `PLAN.md` §18 |
| Copy succeeded but email not sent                | Remain `copied`; do not advance RFQ                   | `PLAN.md` §18 |
| Supplier eligibility changed after draft created | Block contact/quote publication and require re-review | `PLAN.md` §18 |

## 7. Dependencies & milestones

- **Depends on:** an approved supplier match already existing (upstream of this feature; not itself part of this wave's scope). (`PLAN.md` §4.2 "Supplier routing" gate)
- **Blocks:** [PRD 02 Quote approval atomicity](02-quote-approval-atomicity.md) is gated on an approved, currently-eligible, contacted supplier relationship existing first (`PLAN.md` §4.2 "Supplier response" → "Quote publication").
- **Delivery wave:** Wave 2 — Supplier outreach: private template/draft/event/generation tables; guarded outreach RPCs; Master settings; approved-match outreach modal; copy and contact kept as separate audited actions. (`PLAN.md` §22)
- **Rollout flag:** `outreach_templates_enabled`. (`PLAN.md` §25)
- **Infrastructure boundary:** authoritative template, draft, and event state stays in Supabase Pro; the UI remains in the existing Vercel application. No additional cloud service is introduced. (`PLAN.md` §11.1)

## 8. Open questions / not specified in source docs

- Exact copy for the "permission-denied" state text.
- Whether template preview sample values are configurable per-admin or fixed globally.
- Non-English locale timeline (v1 is English-only; no future date given).
