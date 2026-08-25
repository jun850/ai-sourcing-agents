# Atelix agentic AI PRD

**Tags:** `ai-sourcing` `agentic-ai` `openrouter` `supabase` `rfq` `fashion-sourcing`

**Status:** implementation contract for the existing RFQ workspace

**AI runtime:** OpenRouter preset `@preset/marketplace-copilot`

**Orchestrator:** Sol (tech lead)

## 1. Product intent

Atelix is a broker-led fashion-sourcing workspace. A buyer starts with a prompt,
reference, or technical brief. The existing dashboard creates one durable RFQ
case and its buyer/assistant conversation together. The agent helps the buyer
turn that brief into a clear RFQ, checks recorded facts, and keeps the next
human or operational handoff understandable.

The agent must be gentle, supportive, patient, and willing to solve the next
issue. It asks one useful clarification at a time, explains uncertainty plainly,
and never shames a buyer for an incomplete brief. It is a drafting and checking
aid, not a source of commercial truth.

The implementation extends the current split conversation + live RFQ document.
It does not add a parallel chat product, catalogue shopping, seller storefront,
cart, wishlist, or public supplier directory.

## 2. Existing RFQ UI contract

The conversation and live RFQ document remain the acceptance surface. The agent
may propose or save only these existing draft fields:

| Field | Meaning | Missing/ambiguous behavior |
| --- | --- | --- |
| `product` | Requested garment, fabric, trim, label, accessory, or OEM/cut-and-sew item | Ask for the product; do not infer it from a supplier |
| `quantity` | Buyer-requested quantity | Keep blank until a quantity is stated clearly |
| `material` | Requested material or composition | Preserve the buyer wording; do not claim a certification |
| `certifications` | Buyer requirement, not supplier proof | Treat as a requirement only |
| `colors` | Requested color(s) | Keep the stated names; do not map to an unrequested color |
| `sizes` | Requested size range or list | Preserve the buyer's range/list |
| `budget` | Buyer target budget and unit basis when stated | Ask for currency/unit when ambiguous |
| `timeline` | Requested delivery or production timing | Preserve the stated date/period; do not promise availability |

Explicit facts populate the corresponding fields. Missing fields stay blank.
Ambiguous text produces a focused clarification and saves only unambiguous fields.
The agent must not silently add fields outside this allowlist.

Examples required by the UI contract:

- “Change the quantity to 800 units” changes `quantity` only.
- “Remove the budget for now” clears `budget` only.
- “Can you double-check my RFQ?” reads and summarizes the saved RFQ without a
  patch.
- A successful draft patch updates the live document, identifies changed fields,
  persists after refresh/deep-link reopening, and provides an undo token.
- A submitted RFQ receives a proposed patch or review explanation; it is never
  silently mutated by the conversation agent.

Composer behavior is part of acceptance: Enter sends, Shift+Enter inserts a
newline, IME composition never submits, replayed client IDs are idempotent, and
loading/saved/clarification/conflict/unavailable/limit/support states have
accessible text status.

## 3. Authority, safety, and tone

- Supabase records and guarded server operations are authoritative for users,
  roles, RFQs, supplier records, quotes, orders, invoices, and permissions.
- Verified Stripe webhooks are the only payment-settlement authority. The browser
  and model cannot set invoice totals, Checkout eligibility, or settlement state.
- The model may structure or summarize supplied facts, but may not invent supplier
  identity, MOQ, pricing, certification, capacity, availability, order progress,
  invoice state, or payment state.
- Supplier outreach, vetted matching release, RFQ submission, supplier selection,
  order creation, invoice changes, and payment actions remain server- or
  human-gated.
- Buyer text and uploaded documents are untrusted input. Prompt injection cannot
  change tool permissions, reveal secrets, or override authoritative records.
- If an order or payment answer cannot be verified from an authoritative record
  or approved buyer-safe knowledge, the assistant says so gently and asks the
  buyer to contact **info@arcanawangsa.com**. It must not guess or claim that an
  email was sent.

## 4. OpenRouter contract

Every production generative request uses exactly:

```json
{ "model": "@preset/marketplace-copilot" }
```

`OPENROUTER_MODEL` must equal `@preset/marketplace-copilot`; production fails
closed if it is absent or differs. The preset owns the underlying model,
provider routing, provider fallback, generation settings, and model selection.
Application code must not select a direct model slug, `openrouter/auto`, or a
second paid provider. Server code still owns authentication, tool permissions,
structured-output validation, RFQ mutation, and budget admission.

The authenticated conversational endpoint accepts:

```json
{
  "rfqCaseId": "uuid",
  "message": "string",
  "clientMessageId": "idempotency-key",
  "expectedRevision": 7
}
```

It returns a validated shape:

```json
{
  "kind": "answer | clarifying_question | draft_updated | support_handoff | unavailable",
  "reply": "string",
  "savedPatch": {},
  "changedFields": [],
  "revision": 8,
  "undoToken": "string or null",
  "verificationStatus": "verified | partial | unknown",
  "supportHandoff": false,
  "budgetState": { "remainingTurns": 4 }
}
```

The server only ever reads the model's five allowed raw-output keys (`kind`,
`reply`, `patch`, `verificationStatus`, `supportHandoff`) and any `patch` key
outside the eight RFQ fields; it discards everything else the model returns,
including a `savedPatch`, `revision`, `undoToken`, or `budgetState` the model
might echo back. Those five endpoint-computed fields are always derived
server-side and can never be influenced by model output, so unrecognized keys
are ignored rather than failing the whole turn closed. A transactional patch
operation requires buyer ownership, `draft` status, an optimistic revision
match, server validation, and an idempotent turn binding. Before/after
snapshots support undo and audit.

## 5. Internal knowledge and upload instructions

Operators upload internal context through the guarded Intools knowledge workflow
to the **private** Supabase Storage bucket `agent-knowledge`.

Use this path exactly:

```text
global/{buyer-safe|operator-only}/{domain}/{document-id}/{version-id}/{safe-filename}
```

Supported domains are `rfq`, `sourcing`, `operations`, `payments-orders`,
`policies`, and `support`. Use `buyer-safe` for facts the buyer may receive and
`operator-only` for internal procedures, credentials metadata, or sensitive
operational notes. Buyer retrieval can use only published `buyer-safe` versions.

V1 accepts Markdown or plain text up to 25 MB. PDF and DOCX remain future
formats until server-side extraction is implemented and tested; ingestion
rejects them truthfully today. Do not upload secrets, service-role keys,
Stripe/OpenRouter credentials, or executable files. Buyer-owned RFQ images and
tech packs remain attached to the RFQ; standalone OCR is not a v1 promise.

Each upload is immutable and follows:

`uploaded → processing → ready → published` (or `failed`)

Replacements create a new version and archive the old version. Store document
metadata, extracted chunks, embeddings, status, and retrieval/audit references
in additive RLS-protected tables. V1 retrieval uses indexed full-text search;
`gte-small` embeddings are stored for a separately tested semantic-retrieval
upgrade. Conversational generation is exclusively the OpenRouter preset.
Retrieval returns at most six compact chunks and never exposes private Storage
paths to buyers.

## 6. Cost ceiling and deterministic fallback

The hard OpenRouter inference ceiling is **USD 50 per 1,000 AI-active users per
UTC calendar month**, equal to **USD 0.05 per AI-active user per month**. An
AI-active user is an authenticated user who submits at least one eligible agent
request in that month.

Per user:

- At most USD 0.05 admitted spend per month.
- At most USD 0.01 conservative reservation per turn.

Per RFQ case:

- At most five paid OpenRouter-generated turns. This is scoped to the RFQ,
  not the buyer's calendar month — a buyer working multiple RFQs, or picking
  one back up next month, is not limited by turns spent on a different RFQ.

Before a call, the server deduplicates `clientMessageId`, calculates the bounded
worst-case reservation, and atomically reserves against both the user allowance
and the fleet allowance (`activeUsers × $0.05`). After completion, actual cost
settles and unused reservation releases. Unknown provider cost remains reserved
and is not retried.

The invariant is:

```text
settled_cost + active_reservations + unknown_cost
  <= active_users * 0.05 USD
```

At 80% usage, optional context and summaries are reduced. At 90%, nonessential
questions use deterministic responses. When a paid call cannot be admitted, the
message is preserved and the RFQ UI continues with deterministic form edits,
authoritative reads, and the payment/order support handoff. No paid fallback
outside `@preset/marketplace-copilot` is allowed.

A turn is reserved against the case's five-turn allowance before its outcome is
known, since the outcome depends on the model's response. If that response
turns out to be a `clarifying_question` — the agent asking about a still-missing
optional field such as colors, sizes, or certifications, rather than delivering
a saved answer — or the deterministic "could not interpret" fallback, the
reservation's real provider cost is still settled and counted against the
dollar ceiling above, but the turn is not counted against the RFQ's five paid
turns. This keeps a short back-and-forth to fill in optional details from
costing the buyer usable turns.

## 7. Technical team and ownership

Sol is the tech lead and orchestrator. Sol freezes contracts, assigns work,
integrates changes, resolves authority/cost conflicts, reviews migrations and
security, and gives the release decision. No subagent commits, deploys, applies
migrations, or changes the OpenRouter preset without Sol's authorization.

### Terra — backend and AI specialist

Skills: Supabase schema/RLS, Edge Functions, OpenRouter, structured output,
retrieval, idempotency, auditability, and concurrency-safe cost accounting.

Requirements: additive migrations only; private knowledge pipeline; guarded
retrieval tools; exact preset enforcement; draft-only RFQ patch/undo RPCs;
monthly reservations and reconciliation; deterministic outage/budget fallback;
and preservation of Stripe/server authority. Handoff evidence includes schema,
RLS, endpoint, concurrency, cost, and authority tests.

### Terra — frontend and product specialist

Skills: `design-system-frontend`, `impeccable`, existing component reuse,
WCAG 2.2, responsive behavior, keyboard/IME interaction, and browser QA.

Requirements: extend the existing conversation/live RFQ document; render
changed fields, undo, clarification, conflict, budget, unavailable, and support
states; preserve one clear next action; and update product/design contracts with
the implemented behavior. Handoff evidence includes keyboard, screen-reader,
focus, contrast, reduced-motion, zoom/reflow, and mobile checks.

### Luna — RFQ conversation specialist

Skills: prompt fixture design, RFQ field extraction, conversation-state analysis,
golden test corpus, ambiguity handling, and bounded fixture/build work.

Requirements: cover garments, fabrics, trims/labels, accessories, and OEM or
cut-and-sew; assert complete/partial/refinement/correction/removal/double-check
and non-mutation behavior; ensure only buyer-supplied facts enter the eight
fields; and document expected patches and clarifications.

### Luna — QA, security, and cost specialist

Skills: offline Node assertions, adversarial prompt testing, RLS/authorization
review, replay/stale revision checks, browser QA, accessibility, and cost
simulation.

Requirements: verify prompt injection cannot gain authority; operator-only
knowledge cannot leak; submitted RFQs cannot mutate; payment/order unknowns use
the support fallback; exact preset usage is asserted; and 1,000 active users
cannot exceed USD 50. Independent review reports severity, evidence, and a
pass/block recommendation to Sol.

## 8. Required QA and release gates

The offline suite is `node scripts/qa-agent-rfq.mjs`. It must make no network
request or paid OpenRouter call and must run with only Node's standard library.
The golden fixtures live in `scripts/fixtures/agent-rfq/`.

The suite must assert:

1. Complete prompt extraction into all supported RFQ fields.
2. Partial prompt extraction and one focused clarification.
3. Multi-turn refinement and correction of one field only.
4. Explicit removal/clearing of one field only.
5. Double-check prompt produces a read-only/no-mutation result.
6. Submitted RFQ produces a proposal without saving.
7. Prompt injection cannot create supplier/payment/commercial fields.
8. Unknown payment/order state returns `info@arcanawangsa.com` fallback.
9. Exact eight-field schema allowlist rejects unknown keys.
10. Replay of a client message is idempotent.
11. Budget arithmetic, five-turn/user limit, $0.01 reservation, and the
    $50-per-1,000-user invariant.

Separate preview tests use an isolated OpenRouter key and bounded golden sample
to verify the live preset response, structured output, latency, and cost. They
must never use production RFQs or production budget. Before production, run
lint/build, migration-history and RLS checks, route/keyboard/responsive/accessibility
checks, RFQ conversation and filling browser tests, and invoice/Checkout/webhook
regressions. Preset changes repeat the golden conversation and worst-case cost
suite before promotion.

## 9. Rollout and observability

Ship behind `AGENTIC_RFQ_ENABLED`, beginning with operators and designated test
buyers. Persist agent-turn ID, preset name, resolved provider/model metadata,
retrieved evidence IDs, validated patch, revision, token/cost data, latency,
budget reservation state, and fallback reason. Alerts cover unknown-cost
reservations, budget threshold crossings, structured-output rejection, retrieval
failures, and unauthorized mutation attempts. Production release requires all
authority, privacy, prompt, RFQ UI, and cost gates to pass.
