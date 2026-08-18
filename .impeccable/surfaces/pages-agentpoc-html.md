---
version: 1
slug: "pages-agentpoc-html"
primary_target: "pages/agentpoc.html"
related_targets: []
---

## Scope & mode
`pages/agentpoc.html`, served at `/agentpoc`. Persuade-mode pitch/demo, deliberately outside ARCANA's DESIGN.md system — its own visual world, pinned directly by the user's Palisade reference screenshots.

## Audience, job, action, proof
Audience: Jun pitching "an AI shopping agent for Atelix" to prospects/investors — a live, clickable artifact, not a deck. Job: prove an agent can search real inventory, draft real outreach, and hold for human approval before any external or financial action. Action: type a sourcing brief, review 5 real matches + 5 drafted RFQs, edit/revise, approve, then try simulated cart/wishlist/payment commands. Proof: real ARCANA catalog data (`js/data.js` via `js/copilot.js`'s deterministic matcher) and a real OpenRouter-backed Edge Function (`agentpoc-ask`) for the drafted prose — never invented facts, only real ones. All resulting actions (send/cart/wishlist/pay) are simulated client-side state, disclosed in the page's own footer copy.

## Chosen direction & memorable moment
Sage-green ambient ground, warm paper panel, ink-black pill controls and badges, hairline-bordered agent replies; Space Grotesk (voice) + Space Mono (every fact: price, status, product code). No fake browser-chrome/tab device — this is a real page, not a marketing screenshot. Memorable moment: an "Agent" badge landing on real product cards while drafted RFQ messages appear below, editable, with an explicit approval gate before "sending."

## Unresolved / follow-up
- Full round-trip against the real `agentpoc-ask` Edge Function + its migration has not been exercised live (verified locally against the deterministic fallback path only, since local Supabase wasn't running and the Chrome extension was disconnected this session) — needs one live pass after the migration and function are deployed.
- No concept-seed direction round was run: the aesthetic was pinned by the user's own reference images per the skill's "brief-pinned direction beats the roll" rule.
