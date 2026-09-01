import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Theme = "decision" | "execution" | "network" | "intelligence";
type Horizon = "Now" | "Next" | "Later";

type Priority = {
  id: string; theme: Theme; horizon: Horizon; shortTitle: string; title: string;
  need: string; problem: string; solution: string; outcome: string; metrics: string[];
  evidence: string; authority: string; validation: string;
};

const priorities: Priority[] = [
  {
    id: "rfq-clarity", theme: "decision", horizon: "Now", shortTitle: "Make the brief decision-ready",
    title: "Turn an ambiguous brief into a reviewable sourcing decision",
    need: "When I bring a creative brief or reference, I need to see what is known, unknown, and needed next so I can approve the right RFQ with confidence.",
    problem: "Requirements arrive across messages, references, and documents; missing or conflicting details create rework before matching starts.",
    solution: "Extract only supplied facts, make gaps explicit, and assemble an editable RFQ packet with source labels for every field.",
    outcome: "Fewer clarification loops before matching and a faster, more faithful review handoff.",
    metrics: ["Reviewed-RFQ cycle time", "Clarification loops before matching"],
    evidence: "Strong signal — sourcing teams need speed without losing calendar discipline or requirement fidelity.",
    authority: "Atelix Ops approves the RFQ; the agent never fills a commercial, supplier, or certification fact.",
    validation: "Baseline RFQ completeness and reviewer correction reasons across the next 20 reviewed cases.",
  },
  {
    id: "match-dossier", theme: "decision", horizon: "Now", shortTitle: "Trust the shortlist",
    title: "Make each potential supplier match explainable",
    need: "When I am asked to consider a supplier, I need comparable proof of fit and visible open questions—not an opaque recommendation.",
    problem: "Supplier records, capability evidence, and case constraints are difficult to compare consistently across a private network.",
    solution: "Prepare one evidence-backed dossier per potential match: stated requirements, known fit, conflicts, provenance, freshness, and unknowns.",
    outcome: "Buyers and Ops can make a faster shortlist decision without mistaking inference for verified capability.",
    metrics: ["Shortlist release time", "Buyer-visible claims with attribution"],
    evidence: "Strong signal — resilient sourcing increasingly depends on trusted, deeper supplier relationships rather than transactional selection.",
    authority: "Ops releases every shortlist; no model score may assert capacity, MOQ, availability, or commercial viability.",
    validation: "Compare decision time and reviewer edits against the current matching workflow.",
  },
  {
    id: "quote-packet", theme: "decision", horizon: "Next", shortTitle: "Compare commercial options fairly",
    title: "Make supplier quotes comparable without concealing assumptions",
    need: "When suppliers reply, I need to understand price, MOQ, lead time, exclusions, and missing terms side by side before deciding.",
    problem: "Quote terms arrive in different formats and revisions; important differences can be hidden in attachments or message context.",
    solution: "Normalize supplier-stated terms into a comparable packet, preserve originals, flag incomparable fields, and show revision deltas.",
    outcome: "A buyer decision is based on like-for-like assumptions instead of a misleading lowest-price comparison.",
    metrics: ["Quote comparability coverage", "Quote-to-decision cycle time"],
    evidence: "Strong signal — cost competitiveness must be weighed with speed, flexibility, and supplier reliability.",
    authority: "Supplier and Ops validate the canonical packet before buyer review; unknown terms stay unknown.",
    validation: "Test a required-term template on 10 live-style quote packets and measure missing-field resolution.",
  },
  {
    id: "supplier-evidence", theme: "network", horizon: "Next", shortTitle: "Know the private network is trustworthy",
    title: "Build a supplier evidence passport for private qualification",
    need: "When a supplier shares documents or updates, I need conflicting, stale, and incomplete facts surfaced with the originals so I can approve reliable records.",
    problem: "Supplier data is fragmented and decays; a document extraction alone can look more certain than the underlying evidence.",
    solution: "Maintain a private, source-backed record for legal entity, sites, capabilities, documents, expiry dates, and verification state.",
    outcome: "Atelix builds a trustworthy matching foundation without exposing suppliers as public storefronts.",
    metrics: ["Verified-record completeness", "Qualification review cycle time"],
    evidence: "Strong signal — transparency and traceability need consistent terms, provenance, and data freshness across tiers.",
    authority: "Suppliers may submit or amend; only authorized Ops may verify, approve, or make a record match-eligible.",
    validation: "Audit ten existing supplier records for source coverage, expiry state, and reviewer confidence.",
  },
  {
    id: "change-control", theme: "execution", horizon: "Later", shortTitle: "Resolve material changes before surprises",
    title: "Make production changes visible, attributable, and decision-ready",
    need: "When a material, quality, capacity, or timing change occurs, I need the impact, options, owner, and decision record before it becomes a buyer surprise.",
    problem: "Updates can fragment across supplier messages, inspections, and internal coordination, hiding the true cost or timeline impact.",
    solution: "Create a fact-based change-control brief that assembles evidence, impact, dependencies, and proposed options without selecting one.",
    outcome: "Faster, fairer exception resolution with fewer silent replans and clearer accountability.",
    metrics: ["Exception detection-to-decision time", "Material changes with recorded approval"],
    evidence: "Directional signal — sourcing changes and rush requests create downstream execution and workforce risk when impact is not explicit.",
    authority: "Ops chooses the response; buyers approve material commercial or timeline changes; every decision is append-only.",
    validation: "First establish durable supplier-update, QC, and timing records plus a material-change approval policy.",
  },
  roadmap({ id: "brief-conflicts", theme: "decision", horizon: "Now", shortTitle: "Expose requirement conflicts", title: "Find contradictions before an RFQ reaches a supplier", need: "When a brief contains conflicting material, quantity, quality, or timing requirements, I need the conflict visible before we ask suppliers to solve an impossible request.", solution: "Compare supplied sources and propose a clear clarification set.", metrics: ["Conflict resolution time", "Avoided rework"] }),
  roadmap({ id: "dfm", theme: "decision", horizon: "Next", shortTitle: "Prepare for manufacturability review", title: "Make technical uncertainty visible early", need: "When a concept reaches sourcing, I need design and construction questions surfaced early enough to protect the sampling calendar.", solution: "Organize supplied tech-pack and reference details into an Ops review checklist; never certify manufacturability.", metrics: ["Questions resolved before sampling", "Sample revision count"] }),
  roadmap({ id: "feasibility", theme: "decision", horizon: "Next", shortTitle: "Ask the feasibility questions", title: "Build a supplier-ready clarification plan", need: "When requirements are incomplete, I need to know the few questions that will unlock a realistic supplier response.", solution: "Prioritize clarification questions from missing case context and keep answers attributable.", metrics: ["Supplier-ready RFQ rate", "Clarification response time"] }),
  roadmap({ id: "path-planner", theme: "decision", horizon: "Next", shortTitle: "Choose a manufacturing path", title: "Compare viable sourcing paths before outreach", need: "When there are different construction, material, or region paths, I need their stated trade-offs visible before committing outreach.", solution: "Frame comparable route options from reviewed constraints and verified network evidence.", metrics: ["Path decision time", "Reopened RFQs"] }),
  roadmap({ id: "cost-assumptions", theme: "decision", horizon: "Later", shortTitle: "Reveal cost assumptions", title: "Make a commercial comparison explainable", need: "When costs differ, I need to understand stated assumptions rather than infer why one option appears cheaper.", solution: "Capture supplier-stated cost drivers, exclusions, and revision history without calculating or asserting a price.", metrics: ["Assumption coverage", "Commercial comparison rework"] }),
  roadmap({ id: "decision-record", theme: "decision", horizon: "Next", shortTitle: "Preserve the decision record", title: "Keep the rationale behind each sourcing choice", need: "When a sourcing choice is approved, I need the reviewed evidence and owner recorded so the case can be understood later.", solution: "Create an append-only decision summary from approved case facts and reviewer notes.", metrics: ["Decisions with rationale", "Reconstruction time"] }),
  roadmap({ id: "outreach-copilot", theme: "execution", horizon: "Next", shortTitle: "Draft a grounded supplier message", title: "Prepare outreach without losing source context", need: "When I contact a supplier, I need a coherent draft with the exact approved case context and attachments.", solution: "Draft RFQs, follow-ups, and reply summaries from approved records only.", metrics: ["Draft acceptance rate", "Operator minutes per send"] }),
  roadmap({ id: "follow-up", theme: "execution", horizon: "Next", shortTitle: "Protect response follow-through", title: "Keep supplier follow-ups owned and timely", need: "When a supplier response is due, I need a visible owner and next step so promising cases do not go quiet.", solution: "Create reviewable follow-up tasks from approved outreach and response dates.", metrics: ["Missed follow-up rate", "Supplier response time"] }),
  roadmap({ id: "sample-control", theme: "execution", horizon: "Next", shortTitle: "Control sample decisions", title: "Keep sample feedback and approvals coherent", need: "When samples move through review, I need feedback, revisions, and approval status tied to the same case evidence.", solution: "Structure sample feedback and review checkpoints; a human approves every next production step.", metrics: ["Sample cycle time", "Unresolved feedback"] }),
  roadmap({ id: "critical-path", theme: "execution", horizon: "Next", shortTitle: "Coordinate the critical path", title: "Make delivery dependencies visible across a case", need: "When a case progresses, I need to see which approved milestones and dependencies threaten the agreed plan.", solution: "Assemble a human-maintained milestone view from supplier-stated updates and internal approvals.", metrics: ["Milestone adherence", "Late risk detection"] }),
  roadmap({ id: "po-change", theme: "execution", horizon: "Later", shortTitle: "Assess a purchase-order change", title: "Show the impact before changing scope", need: "When quantity, specifications, or delivery timing changes, I need the impact captured before the change is accepted.", solution: "Prepare a change-impact brief with supplied cost, timing, capacity, and quality implications.", metrics: ["Changes with impact review", "Change-decision time"] }),
  roadmap({ id: "qc-readiness", theme: "execution", horizon: "Later", shortTitle: "Prepare quality-control handoff", title: "Make quality expectations reviewable before inspection", need: "When quality review is planned, I need the approved specifications and open risks assembled for the case owner.", solution: "Create an evidence-bound QC readiness brief from the approved case record.", metrics: ["Inspection readiness", "Repeat quality issues"] }),
  roadmap({ id: "logistics-handoff", theme: "execution", horizon: "Next", shortTitle: "Make logistics handoff explicit", title: "Carry approved case facts into delivery coordination", need: "When production is ready to ship, I need the approved terms, documents, and unresolved dependencies visible to the coordinator.", solution: "Compile a handoff packet from authoritative order and case records.", metrics: ["Handoff completeness", "Delivery coordination rework"] }),
  roadmap({ id: "supplier-intake", theme: "network", horizon: "Next", shortTitle: "Guide supplier qualification", title: "Reduce re-entry during private supplier onboarding", need: "When a supplier joins the private network, I need documents and capabilities captured once, with gaps and expiry clearly visible.", solution: "Extract candidate fields from submissions while preserving originals and verification status.", metrics: ["Qualification completion", "Evidence reuse rate"] }),
  roadmap({ id: "document-freshness", theme: "network", horizon: "Next", shortTitle: "Keep evidence current", title: "Surface stale supplier records before they mislead a case", need: "When I use supplier evidence, I need to know if it is expired, superseded, or awaiting review.", solution: "Track document scope, owner, verification date, and expiry as first-class supplier facts.", metrics: ["Stale evidence rate", "Refresh completion time"] }),
  roadmap({ id: "specialisation", theme: "network", horizon: "Next", shortTitle: "Map network specialisation", title: "Find private capability coverage without creating a marketplace", need: "When demand appears in a category, I need to understand which reviewed network capabilities are relevant and where evidence is thin.", solution: "Aggregate reviewed capability categories into a private network coverage view.", metrics: ["Coverage gaps identified", "Match research time"] }),
  roadmap({ id: "relationship-health", theme: "network", horizon: "Later", shortTitle: "Protect relationship health", title: "Make partnership commitments and friction visible", need: "When a supplier relationship changes, I need a factual view of agreed commitments, response patterns, and unresolved issues.", solution: "Summarize reviewed relationship events without creating a hidden supplier score.", metrics: ["Open relationship issues", "Repeat coordination failures"] }),
  roadmap({ id: "capacity-attestation", theme: "network", horizon: "Later", shortTitle: "Request capacity attestation", title: "Keep availability supplier-stated and time-bound", need: "When a case may require capacity, I need a clear supplier attestation rather than an inferred availability claim.", solution: "Request and preserve supplier-stated capacity context with a date and scope.", metrics: ["Attestation coverage", "Expired availability claims"] }),
  roadmap({ id: "network-gaps", theme: "network", horizon: "Later", shortTitle: "Reveal capability gaps", title: "Turn repeated unmet demand into network development work", need: "When cases cannot be served confidently, I need recurring evidence gaps visible so network building is deliberate.", solution: "Cluster reviewed unmet requirements and missing capability evidence for Supplier Ops review.", metrics: ["Recurring unmet needs", "Qualification pipeline quality"] }),
  roadmap({ id: "claims-ledger", theme: "intelligence", horizon: "Later", shortTitle: "Preserve claims evidence", title: "Build a private traceability and claims ledger", need: "When a material or compliance claim is used in a case, I need its source, scope, date, and gaps preserved for review.", solution: "Link claim evidence to case and supplier records; label unknown or unverified states explicitly.", metrics: ["Claims with source coverage", "Claim verification time"] }),
  roadmap({ id: "case-learning", theme: "intelligence", horizon: "Next", shortTitle: "Learn from completed cases", title: "Turn reviewed outcomes into better operating patterns", need: "When cases close, I need to understand repeated sources of delay, rework, and uncertainty without exposing sensitive commercial data.", solution: "Summarize approved operational signals into aggregate learning themes for Ops review.", metrics: ["Repeat issue rate", "Insight-to-process change"] }),
  roadmap({ id: "risk-watchlist", theme: "intelligence", horizon: "Later", shortTitle: "Maintain a case risk watchlist", title: "Surface reviewed risk signals before they become escalation", need: "When evidence changes across a case, I need clear risk signals and the responsible human owner—not automated intervention.", solution: "Flag missing updates, expired evidence, and unresolved dependencies for human triage.", metrics: ["Risks triaged on time", "Escalations without prior signal"] }),
  roadmap({ id: "purchasing-practices", theme: "intelligence", horizon: "Later", shortTitle: "Review purchasing practice", title: "Make planning pressure visible to the broker", need: "When requests or changes strain a supplier, I need the operational impact visible before it becomes an unfair commitment.", solution: "Frame buyer-driven changes, lead-time pressure, and approval delays as a reviewable case signal.", metrics: ["Impact-reviewed changes", "Avoidable rush events"] }),
];

function roadmap(input: Omit<Priority, "problem" | "outcome" | "evidence" | "authority" | "validation"> & Partial<Pick<Priority, "problem" | "outcome" | "evidence" | "authority" | "validation">>): Priority {
  return { problem: "The current workflow depends on fragmented case context and manual coordination.", outcome: "A clearer, reviewable next step without replacing human judgment.", evidence: "Hypothesis — validate with observed case work before commitment.", authority: "A named human reviews every external, commercial, supplier-status, or material-change decision.", validation: "Test with representative cases, measure the stated outcome, and record reviewer corrections.", ...input };
}

const filters: Array<{ id: Theme | "all"; label: string }> = [
  { id: "all", label: "All priorities" },
  { id: "decision", label: "Decision confidence" },
  { id: "execution", label: "Collaborative delivery" },
  { id: "network", label: "Network trust" },
  { id: "intelligence", label: "Learning & intelligence" },
];

function App() {
  const [theme, setTheme] = useState<Theme | "all">("all");
  const [selectedId, setSelectedId] = useState("rfq-clarity");
  const selected = priorities.find((priority) => priority.id === selectedId) ?? priorities[0];
  const visible = priorities.filter((priority) => theme === "all" || priority.theme === theme);
  function changeTheme(next: Theme | "all") {
    setTheme(next);
    const firstVisible = priorities.find((priority) => next === "all" || priority.theme === next);
    if (firstVisible) setSelectedId(firstVisible.id);
  }
  return <main className="lab-shell">
    <header className="topbar"><div className="wordmark" aria-label="Agent Lab">agent<span>lab</span></div><p>Local executive roadmap</p><span className="local-mark"><i aria-hidden="true" />Local only</span></header>
    <section className="intro" aria-labelledby="lab-title"><div><h1 id="lab-title">Make sourcing decisions faster, without weakening the truth behind them.</h1><p>Atelix should reduce the decision cost and execution risk of broker-led fashion sourcing—while keeping evidence attached and commercial authority with named people.</p></div><div className="rule" aria-label="Operating sequence: agent prepares, evidence stays attached, human decides"><span>Agent prepares</span><b aria-hidden="true">→</b><span>Evidence attached</span><b aria-hidden="true">→</b><strong>Human decides</strong></div></section>
    <div className="workspace">
      <aside className="rail" aria-label="Roadmap filters and maturity"><p className="rail-label">Strategic theme</p><div className="filter-list" role="tablist" aria-label="Strategic theme">{filters.map((filter) => <button key={filter.id} role="tab" aria-selected={theme === filter.id} className={theme === filter.id ? "active" : ""} onClick={() => changeTheme(filter.id)}>{filter.label}</button>)}</div><div className="maturity-note"><p className="rail-label">Horizon means</p><dl><div><dt>Now</dt><dd>Build and baseline</dd></div><div><dt>Next</dt><dd>Validate prerequisites</dd></div><div><dt>Later</dt><dd>Discovery and policy</dd></div></dl></div><div className="rail-note"><span>{priorities.length}</span><p>priority user needs<br />for executive review</p></div></aside>
      <section className="agent-list" aria-label="Priority user needs"><div className="list-heading"><p>{visible.length} priorities</p><span>Select a need to inspect the problem, solution, and proof.</span></div>{visible.map((priority) => <button key={priority.id} className={`agent-row ${selected.id === priority.id ? "selected" : ""}`} onClick={() => setSelectedId(priority.id)} aria-pressed={selected.id === priority.id}><span className={`horizon horizon--${priority.horizon.toLowerCase()}`}>{priority.horizon}</span><span className="agent-copy"><strong>{priority.shortTitle}</strong><small>{priority.need}</small></span><span className="row-arrow" aria-hidden="true">↗</span></button>)}</section>
      <aside className="detail" aria-live="polite"><p className="detail-kicker">Decision brief</p><h2>{selected.title}</h2><dl><div><dt>Problem signal</dt><dd>{selected.problem}</dd></div><div><dt>How we solve it</dt><dd>{selected.solution}</dd></div><div><dt>Expected outcome</dt><dd>{selected.outcome}</dd></div><div><dt>Success measure</dt><dd className="metric-list">{selected.metrics.map((metric) => <span key={metric}>{metric}</span>)}</dd></div><div><dt>Evidence signal</dt><dd>{selected.evidence}</dd></div><div><dt>Human authority</dt><dd>{selected.authority}</dd></div></dl><div className="handoff"><span>Validation next</span><strong>{selected.validation}</strong></div></aside>
    </div>
    <footer><span>Prototype boundary</span><p>No login · No network request · No production data</p></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
