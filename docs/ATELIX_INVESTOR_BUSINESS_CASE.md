# Atelix Investor Business Case

Status: Investor-ready narrative draft; all claims marked "verify" must be reconciled before external use<br>
Date: 2026-09-13<br>
Audience: YC, Iterative, seed investors, and prospective lead investors

## 1. The company in one sentence

Atelix analyzes what a fashion brand needs, helps it choose the right factory with evidence, and fulfills the order through production, quality control, and delivery. Every completed order improves the next decision.

Short version:

> Atelix is an end-to-end sourcing service that gets better with every order it fulfills.

Internal analogy:

> Harvey's case intelligence applied to sourcing, combined with real-world order fulfillment.

Do not lead an investor pitch with the Harvey analogy. Harvey explains the software architecture, not the customer promise. The customer buys a successfully fulfilled order, not an operating system.

## 2. Executive investment thesis

Independent and emerging fashion brands do not primarily fail because factories are impossible to find. They struggle because choosing a factory and getting the order delivered are separated across search tools, brokers, inboxes, spreadsheets, inspectors, and freight partners. The people recommending a factory rarely retain a structured record of whether its price, lead time, quality, and capacity claims proved true in production.

Supplier discovery, AI-generated briefs, automated RFQs, quote comparison, and managed production are already crowded capabilities. SourcererAI, Saudara.ai, Inflow, Sourcy, Pietra, Sourcify, and Sourcio each cover meaningful parts of that journey. Atelix therefore cannot win by combining the same features under another "AI sourcing agent" label.

Atelix should own one continuous outcome:

1. Analyze the brief, references, specifications, constraints, and missing information.
2. Find or evaluate suppliers, including factories the brand already knows.
3. Compare supplier-confirmed quotes and recommend a choice with the reason and evidence attached.
4. Fulfill the selected order through samples, payment, production, quality control, logistics, and exception handling.
5. Record what was promised and what actually happened, including price changes, sample revisions, defects, delays, rework, and delivery.
6. Use that completed-order history to make the next recommendation and execution plan better.

The initial wedge should be narrow but complete: take a repeat fashion order from a messy brief to a delivered outcome, regardless of whether the chosen supplier came from the brand or Atelix. Atelix should not stop at a recommendation. It earns its fee and its data advantage by remaining accountable through fulfillment.

If Atelix succeeds, it becomes the accountable sourcing partner and operating record for the brand. The service wins the order; the software makes the service more reliable, more transparent, and less labor-intensive with every completed order.

## 3. The non-obvious insight

The sourcing market does not need another supplier search box, named agent, or automated RFQ tool.

The hard problem is closing the loop between analysis, decision, and fulfillment. A supplier recommendation is only valuable if the resulting order arrives at the agreed quality, price, and time.

The product insight is:

> Atelix can compare what each factory promised with what it actually delivered because Atelix stays responsible through the order.

The Harvey lesson is useful internally: models are replaceable, while case history, trusted workflows, and reviewed decisions endure. But sourcing adds a physical requirement that legal software does not have. Atelix must also coordinate people, money, factories, quality, and movement of goods. The defensible result is not memory alone; it is verified order history created through fulfillment.

## 4. Beachhead customer

### Core ICP

The first economically attractive customer is an emerging fashion or lifestyle brand that:

- Has a real product and recurring production needs.
- Spends approximately $100,000 to $2 million per year on externally manufactured goods.
- Has a team of roughly 3 to 30 people.
- Lacks a scaled in-house sourcing office in Asia.
- Sources apparel, fabrics, trims, labels, accessories, or cut-and-sew production.
- Values speed and reliability enough to pay for managed execution.

The spend and team ranges are proposed ICP boundaries, not currently verified customer-distribution facts.

### Buyer

The day-to-day user is a founder, product developer, production manager, or sourcing lead. The economic buyer is the founder, COO, head of operations, or head of production.

### Deliberate non-ICP

- Consumers searching for finished products.
- Hobby projects with no credible production budget.
- Buyers who only want a public supplier directory.
- Large global enterprises requiring a multi-year implementation before the initial product proves repeatable.
- Categories outside Atelix's operating knowledge before category-specific evidence and QC playbooks exist.

Small first-time brands can remain a low-touch acquisition channel, but they should not define the core unit economics.

## 5. The institutional problem Atelix owns

A sourcing team currently has to:

1. Convert references and product ideas into specifications.
2. Identify what is missing or contradictory.
3. Search and screen factories across fragmented sources.
4. Translate requirements into supplier-ready outreach.
5. Chase responses through email and messaging apps.
6. Compare quotes with different assumptions, currencies, MOQs, incoterms, and lead times.
7. Coordinate samples, revisions, and approvals.
8. Manage payment gates and production milestones.
9. Collect and interpret inspection evidence.
10. Resolve delays, defects, documentation, freight, and customs issues.
11. Reconstruct the same context when a team member, broker, supplier, or season changes.

The customer is buying better decisions and successful production outcomes. The durable product is not access to a database; it is the organization's accumulated sourcing intelligence.

## 6. Initial product wedge

### The fulfilled sourcing case

Atelix's first repeatable product should take responsibility for one persistent sourcing case from analysis through delivery:

- A buyer-approved, structured RFQ.
- An explicit list of missing or unresolved requirements.
- Up to three eligible supplier options approved by Atelix Operations.
- Supplier-confirmed price, MOQ, lead time, validity, payment terms, and material assumptions.
- A normalized comparison using the same commercial fields.
- Evidence links showing where each material fact came from.
- Atelix's recommendation, risks, and next actions.
- A decision ledger recording what changed, why, who approved it, and the resulting outcome.
- A fulfillment plan covering samples, payment gates, production milestones, inspection, logistics, and exception ownership.
- A final scorecard comparing quoted price with final price, promised with actual lead time, approved sample with delivered quality, and expected with actual rework.

This is stronger than promising "one quote" and more useful than returning a supplier list. The case remains useful when the buyer brings an existing supplier because Atelix can evaluate, manage, and measure that supplier through fulfillment. This reduces disintermediation risk: the ongoing value is successful execution and verified history, not secrecy around a factory introduction.

### The five product layers

| Layer | Atelix product | Durable value |
|---|---|---|
| End-to-end order case | One accountable flow from brief and decision through samples, production, QC, payment, and delivery | Replaces fragmented tools, brokers, and handoffs |
| Sourcing Memory | Brand rules, preferred materials, tolerances, approved terms, supplier history, and human corrections | Institutional knowledge compounds across seasons |
| Evidence Graph | Source, date, owner, confidence, revision, and authority for each consequential fact | Makes AI and human work reviewable |
| Governed Workflows | Specialized agents plus explicit commercial, quality, and shipment approval gates | Automation without surrendering accountability |
| Fulfillment operations | Existing suppliers, Atelix suppliers, payments, production follow-up, QC, logistics, and exception resolution | Produces the successful customer outcome and verified performance record |

### Product architecture

The product should preserve five truth layers:

| Layer | Meaning | Authority |
|---|---|---|
| Buyer-stated | Brief, files, quantity, target budget, requirements | Buyer source |
| AI-extracted | Structured interpretation, questions, risk observations | Draft only |
| Supplier-confirmed | MOQ, price, lead time, availability, quote validity | Recorded supplier evidence |
| Ops-verified | Supplier release, quote publication, QC decision | Atelix Operations |
| Server-authoritative | Identity, invoice totals, payment and lifecycle state | Guarded backend and verified webhooks |

AI may structure, compare, summarize, and recommend. It may not invent commercial facts or autonomously authorize supplier contact, publish a quote, settle payment, approve QC, or unlock shipment.

## 7. Expansion path

Atelix should expand along the same sourcing transaction, not by adding unrelated tools.

### Phase 1: Brief to verified quote

- RFQ creation from prompt, image, or technical reference.
- Requirement completeness and contradiction checks.
- Private supplier matching.
- Human-approved supplier outreach.
- Supplier-response extraction and quote normalization.
- Decision-ready quote comparison.

### Phase 2: Quote to production

- Sampling invoices and approvals.
- Versioned sample feedback.
- Bulk-production payment gate.
- Production milestones and exception management.
- Buyer and Ops activity history.

### Phase 3: Production to delivered outcome

- Evidence-linked visual QC triage.
- Human-published quality decisions.
- Freight, customs, shipment, and delivery coordination.
- Repeat-order creation from prior evidence.

### Phase 4: Professional sourcing platform

- Brand-specific sourcing playbooks and memory.
- Team permissions, audit logs, and data-retention controls.
- Approved integrations with email, file storage, ERP, PLM, and accounting tools.
- Portfolio benchmarking and supplier-performance intelligence.
- Enterprise subscription plans alongside managed transactions.

## 8. Why now

Five shifts make this possible now:

1. Multimodal models can interpret product references, technical documents, messages, tables, images, and video at a useful cost.
2. Agentic software can execute bounded, repeatable workflows instead of merely answering questions.
3. Cross-border goods trade remains enormous and operationally fragmented. UNCTAD estimated global trade at approximately $33 trillion in 2024, including approximately $25 trillion in goods.
4. Supply-chain volatility increases the value of multi-region sourcing, explicit evidence, and faster exception handling.
5. Foundation models and surface-level agent features are becoming interchangeable, shifting durable value toward proprietary context, embedded workflows, permissions, and outcome data.

The timing argument is not "AI is popular." It is that the previously manual coordination layer can now be productized, while the collapse in model differentiation makes it urgent to own the customer context and workflow before incumbents do.

## 9. Business model

### Stage 1: Managed deployment and transaction revenue

Primary revenue:

- A clearly defined percentage of ex-factory merchandise value for orders managed through Atelix.
- The current deck proposes a starting commission of 13%; the actual blended take rate must be measured from paid orders.
- A minimum transaction or success fee should protect the economics of smaller orders.
- Paid implementation or managed-sourcing service for customers that need Atelix operators to establish their first sourcing cases and playbooks.

Third-party costs such as freight, duties, independent inspection, insurance, and financing should be itemized. Atelix should not count pass-through amounts as net revenue.

### Stage 2: Sourcing OS revenue

For repeat and team customers:

- Monthly or annual workspace subscription priced to the value of retained sourcing intelligence and labor saved.
- Brand playbooks, sourcing memory, approval workflows, team permissions, reporting, and integrations.
- A lower negotiated transaction rate for committed annual volume.

This creates recurring software revenue without abandoning the managed-execution advantage. The land-and-expand motion is: Atelix executes the first cases, the brand adopts the workspace, existing suppliers enter the system, and Atelix becomes the default operating layer for future orders.

### Trust constraints

- Do not sell supplier priority in matching or RFQ routing. It conflicts with Atelix's claim that recommendations serve the buyer.
- Do not include credit, insurance, or trade-finance revenue in the base case until delivered through compliant partners with proven economics.
- Do not recognize GMV as revenue.
- Do not hide sourcing margin inside supplier quotations.

## 10. Unit economics that investors can underwrite

The current deck's $2,000 average order and 13% commission imply only $260 of revenue per order before payment costs, direct Ops labor, AI usage, inspection, support, refunds, and disputes. That can work only if the workflow is highly standardized or carries a minimum fee.

Illustrative comparison, not actual Atelix performance:

| Per-order assumption | Small order | Core order |
|---|---:|---:|
| Merchandise GMV | $2,000 | $10,000 |
| Revenue at 13% | $260 | $1,300 |
| Payment cost at 2.9% of GMV | ($58) | ($290) |
| Direct Ops: 4 hours at $25 | ($100) | ($100) |
| AI and communications | ($20) | ($20) |
| Issue reserve: 1% of GMV | ($20) | ($100) |
| Illustrative contribution profit | $62 | $790 |
| Illustrative contribution margin | 24% | 61% |

Payment method, fee incidence, labor time, loss rate, and reserve requirements must be replaced with observed data. The example demonstrates why Atelix needs larger repeat orders, lower payment costs, a minimum fee, or materially lower Ops time.

### Required operating metrics

- Paid GMV, excluding cancelled or merely quoted value.
- Net revenue and realized take rate.
- Gross profit after payment, AI, direct sourcing, QC, support, refunds, and dispute costs.
- Contribution profit per completed order.
- Ops minutes per RFQ, quote pack, sample, and completed order.
- Median time from submitted brief to first comparable supplier-confirmed quote.
- Quote-to-order conversion.
- 90-, 180-, and 365-day repeat GMV by customer cohort.
- Supplier response, quote-completeness, on-time delivery, and defect rates.
- Customer and supplier concentration.

## 11. Bottom-up market case

Do not reuse the current `$2,000 x 2.55 million transactions = $5.1 billion` slide. It calculates assumed transaction volume, not Atelix revenue, and does not identify the customers Atelix can reach.

### Venture-scale outcome equation

At a 10% blended take rate, $100 million of net revenue requires $1 billion of annual managed GMV.

One possible path:

| Driver | Illustrative value |
|---|---:|
| Active repeat brand customers | 4,000 |
| Average annual managed spend per brand | $250,000 |
| Annual managed GMV | $1.0 billion |
| Blended transaction take rate | 10% |
| Transaction revenue | $100 million |
| Optional workspace revenue at $6,000 ACV | $24 million |
| Illustrative total net revenue | $124 million |

This is an underwriting model, not a current forecast. The investor version needs a verified count of brands matching the ICP in the initial geographies, their annual addressable production spend, Atelix's realistic wallet share, and observed retention.

### Market proof plan

Build the defensible market slide from:

1. A deduplicated list of target brands in the US, UK, Australia, Japan, and selected European markets.
2. Verified revenue or sourcing-spend bands, labeled by evidence quality.
3. The share of spend addressable by Atelix's initial categories and supplier regions.
4. The number of accounts realistically reachable through proven channels.
5. Expansion from emerging brands into mid-market sourcing teams.

Use WTO and UNCTAD trade data only as macro context. The bottom-up customer model must carry the investment argument.

## 12. Go-to-market

### Initial acquisition motion

1. Founder-led sales to brands already experiencing an active sourcing problem.
2. A fast, concrete offer: receive a decision-ready, supplier-confirmed quote comparison.
3. Close the first transaction before selling a broad platform vision.
4. Convert successful buyers into repeat seasonal and replenishment workflows.
5. Capture structured referrals from brand operators, designers, consultants, freight partners, and supplier relationships.

### Channel sequence

- Warm fashion and cross-border retail network.
- High-intent inbound from sourcing problems and product briefs.
- Partnerships with brand studios, accelerators, designers, and specialist communities.
- Carefully measured outbound to ICP accounts.
- Later, team and enterprise sales based on proven ROI.

Embassies, trade shows, workshops, social media, and broad partnerships are tactics, not a GTM strategy. Each channel must be reported using qualified pipeline, conversion, payback, repeat GMV, and contribution profit.

### The growth loop

Completed orders create verified supplier-performance data. Better evidence improves matching and quote reliability. Better outcomes increase repeat GMV and referrals. More qualified demand improves supplier responsiveness and commercial terms. The loop is valuable only if Atelix measures each link.

## 13. Competition and differentiation

The current competitive slide should explicitly include the strongest direct alternatives. This audit uses each competitor's current public positioning; it does not claim unobservable product limitations.

| Competitor | Current public position | Why the old Atelix story loses | Defensible Atelix position |
|---|---|---|---|
| SourcererAI | Horizontal, fully managed procurement; one all-in quote; buyer purchases directly from Sourcerer; freight and credit included | Already combines agents with operational infrastructure and end-to-end fulfillment | Fashion-specific multi-factory analysis plus transparent decision evidence, followed by fulfillment and supplier performance measured against the original quote |
| Saudara.ai | YC-backed AI-native sourcing broker connecting US brands to overseas factories, with human brokers, quotes, QC, logistics, financing, and deep Indonesian relationships | Nearly identical to "AI + human broker + vetted factories" | Do not claim a moat yet. Prove a tighter fashion category, use with customer-owned suppliers, and a structured promise-versus-outcome record across completed orders |
| Inflow | Vietnam-centered fashion production layer with AI production, sourcing, buying, and quality agents; factory network, sampling, replenishment, and enterprise integrations | Already owns the fashion-agent and production-OS narrative | Work across countries and the brand's existing factory base while keeping one comparable analysis, fulfillment record, and outcome scorecard |
| Sourcy | AI-guided, human-led custom product development from brief through production, QC, and delivery; broad category and supplier coverage | Has a mature end-to-end and scale narrative that Atelix should not try to outclaim broadly | Go narrower in repeat fashion production and prove that completed-order history improves factory choice, execution, and repeat-order economics |
| Sourcio | Self-serve fashion sourcing OS for RFQs, quote normalization, supplier invitations, samples, POs, and production | Already claims the exact "AI fashion sourcing OS" category | Atelix fulfills the order and owns exception resolution; the software records whether the recommendation succeeded in the physical world |
| Pietra | Creator platform plus AI sourcing, supplier network, tech packs, outreach, and negotiation | Already covers the obvious AI sourcing-agent feature set | Serve professional sourcing teams and their full supplier estate, not only marketplace discovery or creator enablement |
| Sourcify and sourcing agencies | Relationship-based factory sourcing and human expertise | Compete directly on service and relationships | Make the workflow, evidence, learning curve, and operating leverage visible and measurable |
| Alibaba, FOURSOURCE, and Sqetch | Large supplier discovery or fashion-network surfaces | Compete on supply breadth and direct connection | Remain useful supply inputs; Atelix owns the decision record and execution context above them |
| ERP, PLM, and procurement suites | Internal records, product data, POs, and enterprise controls | Can extend into AI workflows | Begin where they are weakest: unstructured pre-order decisions across external parties, then integrate rather than replace every system |
| Generic AI | Cheap drafting and analysis | Makes surface-level agent features commodities | Ground agents in permissioned memory, authoritative state, evidence, and measured physical outcomes |

Atelix cannot credibly claim that competitors lack AI, matching, supplier networks, quote collection, human experts, production tools, an OS narrative, or fulfillment. The proposed difference is the closed loop: analyze, decide, fulfill, and measure the result in one accountable system, including when the customer brings the factory. This is a strategy to prove, not a present moat.

## 14. Defensibility

The moat is not the model, prompt, interface, named agents, an "OS" label, or the number of supplier records.

The defensible asset is the completed-order history and operating capability created by owning the full loop.

### Private brand memory

Each customer retains a permissioned institutional record of:

- Product specifications, BOMs, measurement rules, tolerances, and approved materials.
- Preferred commercial terms, incoterms, order patterns, and decision criteria.
- Existing and newly sourced supplier relationships.
- Quote, negotiation, sample, QC, production, and exception history.
- Team approvals and human corrections to AI work.

This creates switching cost because leaving Atelix means losing a working sourcing brain, not merely changing an RFQ tool.

### Permissioned network intelligence

Where rights and confidentiality allow, Atelix can aggregate non-customer-specific outcome signals into an outcome-linked sourcing graph containing:

- Which verified suppliers were eligible for each requirement set.
- Which suppliers responded, declined, or failed to complete a quote.
- How supplier-confirmed terms changed through clarification and negotiation.
- Which quote the buyer selected and why.
- Sample revisions and approval outcomes.
- Production milestone reliability.
- Evidence-linked defects, rework, delays, disputes, and delivery outcomes.
- Brand-specific preferences and repeat-order behavior.
- Human corrections to agent drafts and recommendations.

This data improves workflow quality only if it has provenance, permission, consistent schemas, and enough repeated outcomes per category. Supplier count alone is not a moat. Customer-confidential pricing, designs, communications, and strategy must not leak into cross-customer recommendations.

### The compounding loop

Atelix records a factory's claim at quotation, makes a documented recommendation, fulfills the order, and measures the outcome. More completed orders reveal which factories quote accurately, pass samples quickly, avoid rework, communicate early, and deliver on time for specific product types. That history improves future factory choice and execution plans. Better outcomes create repeat orders, and repeat orders deepen the evidence. The loop must be measured, not asserted.

### Proof investors should expect

- Matching precision: approved recommendations that reach a complete quotation.
- Quote reliability: final commercial terms versus the first normalized quote.
- Time advantage: median brief-to-comparable-quote versus the buyer's prior process.
- Execution quality: on-time, defect, rework, and dispute outcomes.
- Retention: repeat paid GMV by cohort.
- Automation: falling Ops minutes per successful transaction.
- Network strength: faster responses or better terms as qualified demand grows.

## 15. Current traction: what can and cannot be said

The current 15-slide deck contains the following claims on its traction slide:

- 129 active customers five weeks after launch.
- 2.4x average week-over-week active-customer growth.
- $50,000 GMV generated in month one with zero paid acquisition spend.
- 209 suppliers onboarded.
- 62 RFQs generated.
- 3.1 RFQs per customer.

These figures must be reconciled before the deck is sent:

| Claim | Investor question | Required evidence |
|---|---|---|
| 129 active customers | What action makes a customer active? | Deduplicated user IDs and qualifying event definition |
| 2.4x weekly growth | Is the same definition used each week? | Cohort table with dates and calculation |
| $50K GMV | Quoted, ordered, invoiced, paid, shipped, or delivered? | Order-level reconciliation and payment state |
| 209 suppliers | Applied, imported, reviewed, verified, contactable, or transacted? | Supplier-state funnel |
| 62 RFQs | Drafted, submitted, routed, quoted, or paid? | RFQ lifecycle funnel |
| 3.1 RFQs/customer | 62 divided by 129 is 0.48, not 3.1 | Correct numerator, denominator, and cohort |

The metric hierarchy for external use should be:

1. Paid and delivered orders.
2. Paid GMV.
3. Net revenue and contribution profit.
4. Repeat paid GMV.
5. Supplier-confirmed quote packs.
6. Submitted RFQs.
7. Qualified or activated buyers.
8. Accounts or sign-ups.

Do not call an account a customer unless it has performed the specifically defined customer action.

## 16. Claims to remove or prove

Remove these from the pitch until supported by primary evidence:

- "3 in 5 independent brand owners waste $15,000 per season."
- "$10,000 per derailed launch."
- Any claim that named factories produce for Nike, Arc'teryx, Lululemon, or another brand without documented authorization and supply-chain evidence.
- "No other sourcing platform" claims.
- A 2.1% Atelix defect rate or a 5-8% industry benchmark without a defined order cohort, inspection methodology, period, and source.
- "10x faster," "five times lower cost," fixed 48-hour delivery, and universal certification verification unless the measured scope and denominator are shown.
- Claims that every transaction "trains the engine" unless the product actually records consented outcome data and uses it in a measured improvement loop.

Replace broad claims with customer-specific proof:

> A brand submitted [defined brief] on [date]. Atelix returned [number] supplier-confirmed comparable quotes in [time]. The buyer selected [one], paid [amount], and reached [current order state]. Atelix used [Ops hours], compared with [documented prior baseline].

## 17. Eighteen-month capital plan

### Financing strategy

- If accepted by YC or Iterative, use their standard financing structure rather than negotiating the deck around a minimum check size.
- For a standalone pre-seed, target $500,000 to $750,000 on a standard post-money SAFE, subject to actual runway and founder constraints.
- Remove "minimum institutional" and "$2,000 angel" check sizes from the deck.

### Proposed use of a $500,000 round

| Use | Amount | Purpose |
|---|---:|---|
| Product, engineering, and data | $225,000 | Quote workflow, evidence, automation, measurement, reliability |
| Sourcing Operations and supplier quality | $150,000 | Execute orders, codify playbooks, verify outcomes |
| Repeatable demand acquisition | $75,000 | Founder-led sales experiments and measured channels |
| Security, legal, finance, and contingency | $50,000 | Cross-border contracts, controls, compliance, reserve |

These allocations are proposed and must be reconciled with founder salaries, current burn, jurisdiction, and hiring plan.

### Milestones, not promises

#### First 90 days

- Reconcile the full baseline funnel from account to delivered order.
- Complete 25 end-to-end sourcing cycles in the initial category wedge.
- Establish measured brief-to-quote time and Ops minutes per stage.
- Publish three evidence-backed customer case studies with permission.
- Demonstrate positive contribution profit on the target order band.

#### By month 9

- Reach $250,000 monthly paid GMV.
- Demonstrate repeat paid GMV from at least two customer cohorts.
- Reduce median Ops time per decision-ready quote pack by at least 50% from baseline.
- Maintain positive contribution margin after direct Ops and issue costs.
- Show a supplier-performance dataset with enough repeated outcomes to affect routing.

#### By month 18

- Reach $1 million monthly paid GMV.
- Reach $1.2 million to $1.56 million annualized transaction revenue at a 10-13% realized take rate.
- Generate at least half of paid GMV from repeat customers.
- Sustain contribution margin above 50% on the core order cohort.
- Show that transaction throughput grows faster than sourcing-operations headcount.

These are management targets for underwriting. They are not current performance claims or guaranteed forecasts.

## 18. Investor-specific framing

### YC

YC needs immediate clarity, founder intensity, a non-obvious insight, rapid progress, and honesty about obstacles.

Lead with:

> Atelix gives fashion sourcing teams one permanent record for every product, supplier decision, and manufacturing outcome. AI prepares and monitors the work; the brand and optional Atelix operators retain control over suppliers, money, quality, and shipment.

Then prove:

- What the founders personally built and operated.
- What changed each week since launch.
- How many customers paid and returned.
- Why this team learned that supplier discovery is not the missing layer; institutional sourcing memory and decision accountability are.
- How Ops work becomes software rather than permanent labor.
- Why customers use Atelix even when they already know the supplier.

Do not use inflated language, unsupported TAM, or a long autonomous-agent roadmap in the application.

### Iterative

Iterative explicitly evaluates market, evidence, and founders, with a Southeast Asia nexus.

Lead with:

- Important problem: fragmented cross-border sourcing prevents brands from retaining institutional knowledge, comparing decisions, and learning from manufacturing outcomes.
- Evidence: paid transactions, repeat GMV, supplier responses, and documented cycle-time improvements.
- Founder-market fit: product/software, fashion-brand, and cross-border operating experience, stated with specific examples.
- Regional advantage: supplier operations and relationship density in Southeast and East Asia, while demand can be global.
- Venture path: a network-neutral technology system whose workflow coverage, recurring revenue, and transaction throughput outgrow headcount.

### a16z

a16z is the stretch case at this stage. Its strongest framing is a vertical context and control plane combining institutional memory, governed AI workflows, transactions, and eventually financial infrastructure.

Prove:

- The category can support $100 million or more in net revenue.
- Atelix captures the workflow where proprietary data enters the system.
- Customer-owned context and permissioned outcome intelligence compound without leaking confidential information across brands.
- The human service layer creates a repeatable product spine rather than bespoke projects.
- Contribution margin improves with volume and automation.
- Network intelligence produces better response, conversion, risk detection, or terms even when customers bring existing suppliers.
- The product becomes difficult to remove because teams, evidence, payments, and repeat-order history live inside it.

## 19. The twelve-slide investor narrative

### Slide 1 - Company

**Atelix**<br>
The evidence and decision system for fashion sourcing.<br>
Every product, supplier, decision, and outcome - in one sourcing memory.

### Slide 2 - Problem

**Your company does not own its sourcing intelligence. People and fragmented tools do.**

Show one real customer workflow: the same requirement reconstructed across files, supplier conversations, quote inconsistencies, approvals, and production evidence. Use customer evidence, not generic loss statistics.

### Slide 3 - Product

**One persistent sourcing case becomes the shared memory for the order.**

Show the actual product retaining brief, structured RFQ, supplier evidence, comparable quotes, decisions, invoice, production, QC, and outcome - including an existing supplier brought by the brand.

### Slide 4 - Wedge

**Messy brief to an evidence-backed supplier decision.**

Show the output, time to result, human approval points, and what the customer receives.

### Slide 5 - Why now

Multimodal AI can structure the unstructured work, but models and surface-level agents are commoditizing. The durable opportunity is to capture institutional context, decisions, permissions, and outcomes before incumbents do.

### Slide 6 - Traction

Use a verified funnel:

Qualified buyers -> submitted RFQs -> comparable quote packs -> selected quotes -> paid orders -> delivered orders -> repeat paid orders.

Feature paid GMV, net revenue, repeat GMV, and cycle time. Avoid vanity counts.

### Slide 7 - Business model

Managed transaction fee now; professional workspace subscription for repeat teams later. Show realized take rate, direct cost, contribution profit, and the target order band.

### Slide 8 - Market

Show verified ICP account count x annual addressable sourcing spend x expected wallet share x realized take rate. Show the credible path to $100 million revenue.

### Slide 9 - Competition

Compare directories, fashion networks, AI sourcing agents, agencies, and procurement systems. Acknowledge Pietra, Sourcify, FOURSOURCE, Sqetch, Alibaba, and generic AI directly.

### Slide 10 - Compounding advantage

Each completed order strengthens private brand memory and permissioned network intelligence. Show how that improves decision quality, response, quote reliability, cycle time, execution, repeat rate, and contribution margin.

### Slide 11 - Team

Use specific achievements proving the founders can build the software, earn supplier trust, operate across languages and borders, and sell to brands. Remove generic biography language.

### Slide 12 - Raise

Raising $500,000 to prove repeat paid demand and software-scalable execution. Tie the money to month-18 paid GMV, net revenue, repeat rate, contribution margin, and Ops-leverage gates.

## 20. Partner-meeting objections

### "Is this just a sourcing agency?"

Today, human operators protect quality and create training evidence. The test is whether Ops minutes per successful transaction fall while transaction throughput and gross profit rise. Atelix will report that curve directly.

### "Why will brands not go direct after the introduction?"

Atelix must provide ongoing value beyond discovery: structured requirements, comparable terms, controlled payments, production evidence, QC, issue resolution, repeat-order memory, and accountability. Contract restrictions alone are not a moat.

### "Why cannot Alibaba or Pietra do this?"

They can build similar AI features. Atelix must win through a focused category, regional execution, verified outcomes, trusted human accountability, and proprietary longitudinal production data. Product claims are insufficient; the metrics must demonstrate it.

### "How do you prevent hallucinated prices or suppliers?"

Every commercial fact is buyer-stated, supplier-confirmed, Ops-verified, or server-authoritative. AI output is a cited draft until the required owner approves it.

### "Can this become venture scale?"

The path is managed GMV plus recurring workflow revenue. At a 10% take rate, $1 billion managed GMV creates $100 million net revenue before subscriptions. The near-term proof is repeat GMV and increasing transactions per operator.

### "Is the supplier network really defensible?"

A contact list is not. Response history, quote reliability, category fit, production outcomes, defect evidence, and repeat performance can be, if collected with permission and used to produce measurable improvements.

### "Why this team?"

Answer with specific operating examples: software shipped, sourcing problems personally experienced, supplier relationships activated, orders executed, failures resolved, and the speed from insight to product. Do not rely on titles.

## 21. Weekly investor dashboard

Until the round closes, the founders should maintain one weekly table:

| Metric | This week | Prior week | Four-week cohort | Definition |
|---|---:|---:|---:|---|
| Qualified buyers | | | | |
| Submitted RFQs | | | | |
| Comparable quote packs | | | | |
| Paid orders | | | | |
| Paid GMV | | | | |
| Net revenue | | | | |
| Contribution profit | | | | |
| Repeat paid GMV | | | | |
| Median brief-to-quote time | | | | |
| Median Ops minutes per quote pack | | | | |
| On-time delivery rate | | | | |
| Defect/rework rate | | | | |

Every metric must have one durable definition and an auditable source.

## 22. Go/no-go diligence gates before applying

Do not send the current deck until:

- The 62 RFQs versus 3.1 RFQs/customer contradiction is resolved.
- Customer, active, RFQ, supplier, GMV, revenue, order, and delivered are each defined.
- The $50,000 GMV claim is reconciled to order and payment state.
- The supplier funnel distinguishes imported, applied, reviewed, verified, contactable, quoted, and transacted.
- At least three customer outcomes are documented and permissioned.
- Direct transaction costs and Ops time are measured.
- The competition slide includes direct AI sourcing products.
- The market slide is rebuilt bottom-up.
- The founders can explain why a 13% take rate is durable and aligned.
- The use of funds maps to measurable seed-readiness milestones.
- Every logo, customer, factory, certification, and performance claim has written evidence.

## 23. Sources informing this rebuild

- Y Combinator, "How to Apply to Y Combinator": https://www.ycombinator.com/howtoapply
- Y Combinator, seed fundraising guide: https://www.ycombinator.com/blog/this-brief-guide-is-a-summary-of-what-startup-founders-need-to-know-about-raising-the-seed-funds-critical-to-getting-their-company-off-the-ground
- Iterative, "Getting into Iterative": https://www.iterative.vc/getting-into-iterative
- Iterative FAQ: https://www.iterative.vc/frequently-asked-questions
- Andreessen Horowitz, "Vertical SaaS: Now with AI Inside": https://a16z.com/vertical-saas-now-with-ai-inside/
- Andreessen Horowitz, "Trading Margin for Moat": https://a16z.com/services-led-growth/
- Andreessen Horowitz, "Marketplaces in the Age of AI, Take Two": https://a16z.com/marketplaces-in-the-age-of-ai-take-two-graveyard-to-greenfield/
- Andreessen Horowitz, "The Palantirization of Everything": https://a16z.com/the-palantirization-of-everything/
- Harvey platform overview: https://www.harvey.ai/platform
- Harvey Memory: https://www.harvey.ai/platform/memory
- SourcererAI: https://sourcererai.com/
- Saudara.ai: https://saudara.ai/
- Saudara.ai YC profile: https://www.ycombinator.com/companies/saudara-ai
- Inflow AI agents: https://inflow-global.com/en/agents/
- Inflow pricing and production model: https://inflow-global.com/en/pricing/
- Sourcy: https://www.sourcy.ai/
- Sourcio: https://getsourcio.com/
- Pietra Sourcing AI overview: https://help.pietrastudio.com/en/articles/11002781-pietra-sourcing-ai-overview
- FOURSOURCE: https://www.foursource.com/
- Sqetch: https://sqetch.co/platform/for-manufacturers-suppliers
- Sourcify apparel sourcing: https://sourcify.com/apparel-sourcing/
- UNCTAD, "Key statistics and trends in international trade 2024": https://unctad.org/publication/key-statistics-and-trends-international-trade-2024
- WTO merchandise-trade statistics: https://www.wto.org/english/res_e/statis_e/merch_trade_stat_e.htm

## 24. Final positioning

The credible business is not "an autonomous agent that finds any factory," "AI plus human brokers," or another "fashion sourcing OS."

It is:

> Atelix gives fashion sourcing organizations a memory they own and an evidence-controlled system for every product, supplier, decision, and outcome. Governed AI performs the repeatable work; the customer's team and optional Atelix brokers retain judgment. Each completed sourcing case makes future decisions faster, more consistent, and more defensible.

That claim can earn an accelerator interview. Paid orders, repeat GMV, contribution margin, and declining Ops effort are what can earn the investment.
