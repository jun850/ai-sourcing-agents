import { Check, ChevronDown, ArrowRight } from "lucide-react";
import { Footer, Header } from "./components";

const routes = [
  "/sourcing-guide",
  "/private-label",
  "/quality-control",
  "/alibaba-alternative",
  "/about",
  "/supplier-guide",
  "/privacy-policy",
  "/terms-of-service",
] as const;
export function isFooterPage(path: string): path is (typeof routes)[number] {
  return (routes as readonly string[]).includes(path);
}

const learn = [
  ["Sourcing Guide", "/sourcing-guide"],
  ["Private Label", "/private-label"],
  ["Quality Control", "/quality-control"],
  ["Alibaba Alternative", "/alibaba-alternative"],
] as const;
const faqs = [
  "What information should I include in a brief?",
  "How are supplier claims handled?",
  "Can I start before my specification is complete?",
  "When are commercial terms confirmed?",
];

function PageHero({
  eyebrow,
  title,
  intro,
  action = "Start sourcing",
}: {
  eyebrow: string;
  title: string;
  intro: string;
  action?: string;
}) {
  return (
    <section className="resource-hero">
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <div>{intro}</div>
      <div className="resource-actions">
        <a className="button" href="/sign-in">
          {action}
          <ArrowRight size={16} aria-hidden="true" />
        </a>
        <a className="resource-link" href="/about">
          Learn about Atelix
        </a>
      </div>
    </section>
  );
}
function LearnMore() {
  return (
    <section className="resource-section resource-muted">
      <div className="resource-wrap">
        <h2>Learn more</h2>
        <div className="learn-grid">
          {learn.map(([name, href]) => (
            <a key={href} href={href}>
              <b>{name}</b>
              <span>
                Explore the Atelix guide <ArrowRight size={15} aria-hidden="true" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
function RelatedReading({
  items = [
    "How to write a production-ready RFQ",
    "What supplier evidence can confirm",
    "How to review a quote without assumptions",
  ],
}: {
  items?: string[];
}) {
  return (
    <section className="resource-section related-reading">
      <div className="resource-wrap">
        <h2>Related reading</h2>
        <div className="reading-grid">
          {items.map((title, index) => (
            <a href="/sourcing-guide" key={title}>
              <span>Atelix guide · {String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>
                Practical context for preparing your next sourcing decision.
              </p>
              <b>
                Read guide <ArrowRight size={15} aria-hidden="true" />
              </b>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
function ClosingCta() {
  return (
    <section className="resource-closing">
      <div>
        <h2>Ready to put the brief to work?</h2>
        <p>
          Begin with the product references and constraints you have now. Atelix
          helps make the next decision clear.
        </p>
      </div>
      <a className="button" href="/sign-in">
        Start sourcing <ArrowRight size={16} aria-hidden="true" />
      </a>
    </section>
  );
}
function Faqs({ title = "Frequently asked questions" }: { title?: string }) {
  return (
    <section className="resource-section">
      <div className="resource-wrap resource-faq">
        <h2>{title}</h2>
        {faqs.map((question) => (
          <details key={question}>
            <summary>
              {question}
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <p>
              Atelix keeps this decision in the structured brief and confirms
              supplier-specific facts, availability, and commercial terms in the
              relevant sourcing conversation.
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
function Timeline({ steps }: { steps: [string, string, string][] }) {
  return (
    <div className="process-list">
      {steps.map(([number, title, text]) => (
        <article key={number}>
          <span>{number}</span>
          <div>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
function Cards({ cards }: { cards: [string, string][] }) {
  return (
    <div className="resource-card-grid">
      {cards.map(([title, text]) => (
        <article key={title}>
          <Check size={19} aria-hidden="true" />
          <h3>{title}</h3>
          <p>{text}</p>
        </article>
      ))}
    </div>
  );
}

function SourcingGuide() {
  return (
    <>
      <PageHero
        eyebrow="Sourcing Guide"
        title="A clear path from product brief to supplier decision."
        intro="Atelix helps you turn the references, product requirements, and practical constraints you have today into a structured sourcing brief."
      />
      <section className="resource-section resource-muted">
        <div className="resource-wrap">
          <h2>Why work from a structured brief?</h2>
          <Cards
            cards={[
              [
                "Clearer requirements",
                "Bring product references, materials, quantities, destination, and timing into one working record.",
              ],
              [
                "Supplier-fit context",
                "Assess a supplier against the actual brief, not only a broad category label.",
              ],
              [
                "Traceable decisions",
                "Keep the approved specification, quote context, and next update visible.",
              ],
              [
                "Flexible starting point",
                "Begin with plain language, images, or a detailed tech pack.",
              ],
            ]}
          />
        </div>
      </section>
      <section className="resource-section">
        <div className="resource-wrap">
          <h2>How sourcing works with Atelix</h2>
          <Timeline
            steps={[
              [
                "01",
                "Share what you have",
                "Start with a product description, images, or a technical reference.",
              ],
              [
                "02",
                "Prepare the RFQ",
                "Structure the non-negotiables and questions that need supplier input.",
              ],
              [
                "03",
                "Review fit and sample context",
                "Evaluate candidates and clarify the decisions before a commercial commitment.",
              ],
              [
                "04",
                "Keep production context visible",
                "Follow the next reported order or production milestone in the workspace.",
              ],
              [
                "05",
                "Document the handoff",
                "Keep specifications, quality evidence, and delivery information connected to the record.",
              ],
            ]}
          />
        </div>
      </section>
      <section className="resource-section resource-muted">
        <div className="resource-wrap">
          <h2>What you can source</h2>
          <Cards
            cards={[
              [
                "Apparel & uniforms",
                "Reference-led garments, workwear, and private-label development.",
              ],
              [
                "Fabric & textiles",
                "Material-led briefs with composition, finish, and performance requirements.",
              ],
              [
                "Accessories",
                "Bags, trims, packaging, and complementary product details.",
              ],
              [
                "Home & lifestyle",
                "Textile and soft-goods requests with documented specifications.",
              ],
              [
                "Outdoor & technical goods",
                "Use-case and performance-led product requirements.",
              ],
              [
                "OEM development",
                "Custom projects that require a clearer brief before supplier review.",
              ],
            ]}
          />
        </div>
      </section>
      <section className="resource-section">
        <div className="resource-wrap">
          <h2>More than a supplier directory</h2>
          <div className="comparison-grid">
            <article>
              <h3>Searching alone</h3>
              <p>
                Product claims, identity, terms, and correspondence can remain
                scattered across listings and messages.
              </p>
            </article>
            <article className="comparison-accent">
              <h3>With Atelix</h3>
              <p>
                Start from a structured RFQ, preserve evidence and decision
                context, and confirm supplier-specific facts explicitly.
              </p>
            </article>
          </div>
        </div>
      </section>
      <LearnMore />
      <RelatedReading />
      <Faqs />
    </>
  );
}
function PrivateLabel() {
  return (
    <>
      <PageHero
        eyebrow="Private Label"
        title="Develop a private-label brief with the details production needs."
        intro="Atelix gives brand, material, construction, and packaging decisions one clear place before supplier discussions begin."
        action="Start your private-label brief"
      />
      <section className="resource-section resource-muted">
        <div className="resource-wrap">
          <h2>Why use a dedicated private-label brief?</h2>
          <Cards
            cards={[
              [
                "Product identity",
                "Keep label, trim, packaging, colour, and reference requirements together.",
              ],
              [
                "Customisation context",
                "Separate must-have brand details from items that still require supplier confirmation.",
              ],
              [
                "Sampling clarity",
                "Define the sample objective and feedback record before bulk production is considered.",
              ],
              [
                "One approved version",
                "Lock the reviewed specification for the sourcing handoff.",
              ],
            ]}
          />
        </div>
      </section>
      <section className="resource-section">
        <div className="resource-wrap">
          <h2>Popular private-label scopes</h2>
          <div className="category-grid">
            <article>
              <h3>Apparel & fashion</h3>
              <p>
                Tees, outerwear, activewear, uniforms, and reference-led product
                development.
              </p>
            </article>
            <article>
              <h3>Home & lifestyle</h3>
              <p>
                Textiles, soft goods, packaging, and product-specific
                specifications.
              </p>
            </article>
            <article>
              <h3>Accessories & bags</h3>
              <p>
                Construction, hardware, material, and branding requirements in
                one brief.
              </p>
            </article>
            <article>
              <h3>Outdoor & technical</h3>
              <p>
                Use cases, performance criteria, and production constraints
                documented clearly.
              </p>
            </article>
          </div>
        </div>
      </section>
      <section className="resource-section resource-muted">
        <div className="resource-wrap">
          <h2>Your private-label journey</h2>
          <Timeline
            steps={[
              [
                "01",
                "Share your direction",
                "Add product references, brand details, and the decisions already made.",
              ],
              [
                "02",
                "Prepare the sourcing brief",
                "Make quantity, material, construction, and destination requirements explicit.",
              ],
              [
                "03",
                "Review sampling context",
                "Record what the sample needs to prove and how feedback will be handled.",
              ],
              [
                "04",
                "Confirm production readiness",
                "Lock the version that the sourcing conversation should work from.",
              ],
              [
                "05",
                "Keep the record visible",
                "Follow approved details, updates, and next decisions in one workspace.",
              ],
            ]}
          />
        </div>
      </section>
      <section className="resource-section">
        <div className="resource-wrap">
          <h2>Quote-first commercial context</h2>
          <div className="callout">
            <b>
              Atelix does not publish universal production fees, MOQ, or
              lead-time promises.
            </b>
            <p>
              Commercial terms are supplier- and brief-specific. The workspace
              keeps the approved quote context and the next decision visible
              once confirmed.
            </p>
          </div>
        </div>
      </section>
      <LearnMore />
      <RelatedReading
        items={[
          "Building a private-label brief",
          "What a sample should prove",
          "Preparing artwork, labels, and packaging",
        ]}
      />
      <Faqs title="Private Label FAQ" />
    </>
  );
}
function QualityControl() {
  return (
    <>
      <PageHero
        eyebrow="Quality Control"
        title="Make quality requirements visible before production begins."
        intro="Atelix keeps the buyer-approved brief, evidence requests, and reported milestones together so quality conversations stay traceable."
        action="Start a QC-ready brief"
      />
      <section className="resource-section resource-muted">
        <div className="resource-wrap">
          <div className="evidence-strip">
            <article>
              <b>Before production</b>
              <span>Approved requirements</span>
            </article>
            <article>
              <b>During production</b>
              <span>Reported milestones</span>
            </article>
            <article>
              <b>Before dispatch</b>
              <span>Evidence review</span>
            </article>
          </div>
        </div>
      </section>
      <section className="resource-section">
        <div className="resource-wrap">
          <h2>A three-stage quality workflow</h2>
          <Timeline
            steps={[
              [
                "01",
                "Before production",
                "Confirm the approved specification, material requirements, tolerances, packaging details, and evidence needed for the project.",
              ],
              [
                "02",
                "During production",
                "Keep reported progress, quantity checks, issue notes, and buyer questions attached to the working record.",
              ],
              [
                "03",
                "Before dispatch",
                "Review the final quantity, labels, packaging, buyer acceptance points, and shipping documentation requested for the order.",
              ],
            ]}
          />
        </div>
      </section>
      <section className="resource-section resource-muted">
        <div className="resource-wrap">
          <h2>What happens when an issue is found?</h2>
          <Cards
            cards={[
              [
                "Make the issue explicit",
                "Log the discrepancy against the approved brief rather than relying on informal memory.",
              ],
              [
                "Clarify the response",
                "Record the supplier response, proposed rework, replacement, or escalation path.",
              ],
              [
                "Keep approval visible",
                "Buyer acceptance remains a clear decision point before the next handoff.",
              ],
              [
                "Preserve the evidence",
                "Photos, supplier responses, and milestone notes remain connected to the RFQ record.",
              ],
            ]}
          />
        </div>
      </section>
      <section className="resource-section">
        <div className="resource-wrap">
          <h2>Complete documentation, when requested</h2>
          <div className="category-grid">
            <article>
              <h3>Inspection checklist</h3>
              <p>Buyer-defined checks tied to the approved specification.</p>
            </article>
            <article>
              <h3>Evidence photos</h3>
              <p>
                Project evidence attached to the relevant milestone or issue.
              </p>
            </article>
            <article>
              <h3>Supplier response</h3>
              <p>
                Clarifications and resolution context retained with the record.
              </p>
            </article>
            <article>
              <h3>Resolution status</h3>
              <p>
                A visible record of what remains open, approved, or needs
                attention.
              </p>
            </article>
          </div>
        </div>
      </section>
      <LearnMore />
      <RelatedReading
        items={[
          "What to define before production",
          "Keeping inspection evidence usable",
          "How to document a quality issue",
        ]}
      />
      <Faqs title="Quality Control FAQ" />
      <ClosingCta />
    </>
  );
}
function Alternative() {
  return (
    <>
      <PageHero
        eyebrow="Alibaba Alternative"
        title="A sourcing workspace for decisions, not just listings."
        intro="Atelix is built for buyers who need a structured RFQ, supplier-specific evidence, and a visible record of what still needs confirmation."
      />
      <section className="resource-section resource-muted">
        <div className="resource-wrap">
          <h2>Why listing-led sourcing breaks down</h2>
          <Cards
            cards={[
              [
                "Identity can be unclear",
                "A profile may not establish the legal entity, factory role, or current production capability.",
              ],
              [
                "Product pages lack context",
                "A listed item rarely captures the actual material, quantity, timing, and quality constraints of your brief.",
              ],
              [
                "Terms are hard to compare",
                "Quote details, MOQ, and lead time can live across disconnected conversations.",
              ],
              [
                "Evidence becomes fragmented",
                "Images, documents, and decisions are difficult to preserve as one working record.",
              ],
            ]}
          />
        </div>
      </section>
      <section className="resource-section">
        <div className="resource-wrap">
          <h2>Marketplace listing vs. Atelix record</h2>
          <div className="comparison-table">
            <div>
              <b>Marketplace listing</b>
              <span>Self-described profile</span>
              <span>One-off enquiry</span>
              <span>Scattered chat history</span>
              <span>Unclear verification status</span>
            </div>
            <div>
              <b>Atelix workspace</b>
              <span>Supplier-specific evidence where available</span>
              <span>Structured RFQ</span>
              <span>Central decision record</span>
              <span>Explicit confirmation boundaries</span>
            </div>
          </div>
        </div>
      </section>
      <section className="resource-section resource-muted">
        <div className="resource-wrap">
          <h2>The Atelix workflow</h2>
          <Timeline
            steps={[
              [
                "01",
                "Define hard requirements",
                "Separate the constraints that cannot change from questions that need supplier input.",
              ],
              [
                "02",
                "Filter incompatible candidates",
                "Keep unsuitable options out of the sourcing conversation before comparison begins.",
              ],
              [
                "03",
                "Review evidence and quote context",
                "Assess supplier-specific information against the actual brief.",
              ],
              [
                "04",
                "Coordinate the next decision",
                "Use the RFQ record for sample, quality, commercial, and delivery questions.",
              ],
            ]}
          />
        </div>
      </section>
      <section className="resource-section">
        <div className="resource-wrap">
          <h2>What Atelix does not claim</h2>
          <Cards
            cards={[
              [
                "No invented prices",
                "Commercial figures are not inferred from a public listing.",
              ],
              [
                "No assumed ownership",
                "Factory and supplier identity require evidence, not a logo or name match.",
              ],
              [
                "No hidden performance score",
                "Supplier claims and verified evidence are kept distinct.",
              ],
              [
                "No false match",
                "Hard constraints should exclude incompatible candidates before comparison.",
              ],
            ]}
          />
        </div>
      </section>
      <LearnMore />
      <RelatedReading
        items={[
          "A brief-led sourcing process",
          "Understanding verification boundaries",
          "What to confirm before you commit",
        ]}
      />
      <Faqs title="Alibaba Alternative FAQ" />
    </>
  );
}
function About() {
  return (
    <>
      <PageHero
        eyebrow="About Atelix"
        title="A clearer way to move from product idea to factory conversation."
        intro="Atelix is a sourcing workspace for fashion and textile teams that need a protected, decision-ready brief before they approach a production partner."
        action="Start your brief"
      />
      <section className="resource-section resource-muted">
        <div className="resource-wrap about-intro">
          <h2>Start with the actual product question.</h2>
          <p>
            Most sourcing projects begin with incomplete information: a product
            reference, a material direction, a target quantity, an unconfirmed
            specification. Atelix helps turn that starting point into a
            structured record that a sourcing team can evaluate.
          </p>
        </div>
      </section>
      <section className="resource-section">
        <div className="resource-wrap">
          <h2>What the workspace is designed to make visible</h2>
          <Cards
            cards={[
              [
                "The approved brief",
                "Keep product references, requirements, and open questions in one place.",
              ],
              [
                "Supplier-fit context",
                "Assess a supplier against the actual requirement rather than a broad directory category.",
              ],
              [
                "Commercial boundaries",
                "Treat pricing, MOQ, timing, payment, and availability as explicit, supplier-specific confirmations.",
              ],
              [
                "A traceable handoff",
                "Preserve decisions, evidence, and the next operational step across sourcing and production.",
              ],
            ]}
          />
        </div>
      </section>
      <section className="resource-section resource-muted">
        <div className="resource-wrap">
          <h2>How Atelix works</h2>
          <Timeline
            steps={[
              [
                "01",
                "Describe the need",
                "Share your product goal in plain language, with images, a tech pack, or whatever reference material is available.",
              ],
              [
                "02",
                "Structure the RFQ",
                "Make constraints and questions visible before a supplier conversation begins.",
              ],
              [
                "03",
                "Evaluate the decision",
                "Use supplier-specific evidence and quote context where available—without inventing what has not been confirmed.",
              ],
              [
                "04",
                "Keep progress legible",
                "Follow the approved record, reported milestone, and next decision from one workspace.",
              ],
            ]}
          />
        </div>
      </section>
      <ClosingCta />
    </>
  );
}
function SupplierGuide() {
  const prepared = [
    [
      "Company identity",
      "Registered name, operating role, contact, location, and legal/company documents.",
    ],
    [
      "Capabilities",
      "Product categories, materials, facilities, capacity, MOQ, lead-time range, and export experience.",
    ],
    [
      "Evidence",
      "Actual product media, certifications with dates, test reports, and quality-process documentation.",
    ],
    [
      "Commercial context",
      "Supplier-provided payment, sampling, shipping, and service information—clearly labelled as such.",
    ],
  ];
  return (
    <div className="supplier-guide-page">
      <div className="guide-utility">
        <a href="/">← Back to home</a>
        <button onClick={() => print()}>Print / Save as PDF</button>
      </div>
      <header>
        <a className="footer-wordmark" href="/">
          atelix<span>.</span>
        </a>
        <h1>Supplier Verification & Listing Guide</h1>
        <p>
          Prepare a complete, evidence-led profile for a clearer sourcing
          conversation with buyers.
        </p>
      </header>
      <nav className="guide-toc">
        <b>In this guide</b>
        <a href="#supplier-benefits">01 Welcome & benefits</a>
        <a href="#supplier-prepare">02 What to prepare</a>
        <a href="#supplier-steps">03 Step-by-step walkthrough</a>
        <a href="#supplier-tips">04 Tips for success</a>
      </nav>
      <section id="supplier-benefits">
        <h2>Welcome & benefits</h2>
        <Cards
          cards={[
            [
              "Get discovered",
              "Present relevant capabilities against structured buyer requirements.",
            ],
            [
              "Build trust",
              "Keep verified evidence distinct from supplier-provided claims.",
            ],
            [
              "Clearer communication",
              "Receive product requirements in a structured RFQ rather than an incomplete message.",
            ],
            [
              "Maintain a record",
              "Update evidence and capability information as it changes.",
            ],
          ]}
        />
      </section>
      <section id="supplier-prepare">
        <h2>What you’ll need to prepare</h2>
        <div className="supplier-prepare-grid">
          {prepared.map(([title, text]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="supplier-steps">
        <h2>Step-by-step walkthrough</h2>
        <Timeline
          steps={[
            [
              "01",
              "Submit your profile",
              "Share company identity and the scope of the capabilities you want reviewed.",
            ],
            [
              "02",
              "Upload evidence",
              "Attach product, facility, certification, and quality-process information.",
            ],
            [
              "03",
              "Atelix review",
              "The team reviews completeness and may request clarification or supporting documents.",
            ],
            [
              "04",
              "Clarify status",
              "Fields can be approved, supplier-provided, limited, or awaiting evidence.",
            ],
            [
              "05",
              "Publish and maintain",
              "Keep the profile current as capabilities, documents, and commercial information change.",
            ],
          ]}
        />
      </section>
      <section id="supplier-tips">
        <h2>Tips for success</h2>
        <Cards
          cards={[
            [
              "Complete every field",
              "A clear profile reduces avoidable clarification cycles.",
            ],
            [
              "Use real evidence",
              "Only upload media and documents tied to your actual operation or products.",
            ],
            [
              "Date your records",
              "Certifications and capability evidence need an issuing source and current date.",
            ],
            [
              "Respond precisely",
              "Separate confirmed information from estimates or items still under review.",
            ],
          ]}
        />
      </section>
      <section className="supplier-help">
        <h2>Need help preparing your profile?</h2>
        <p>
          Send your company materials to info@arcanawangsa.com and the Atelix
          team can explain the evidence required for review.
        </p>
        <a className="button" href="/sign-in">
          Start supplier access <ArrowRight size={16} aria-hidden="true" />
        </a>
      </section>
    </div>
  );
}
function LegalPage({ terms = false }: { terms?: boolean }) {
  const title = terms ? "Terms of Service" : "Privacy Policy";
  const sections = terms
    ? [
        [
          "Our services",
          "Atelix provides a sourcing workspace and does not itself create a supplier contract, quote, payment obligation, or production commitment in this MVP.",
        ],
        [
          "Accounts and acceptable use",
          "Use the workspace lawfully, protect access credentials, and provide information you have the right to share.",
        ],
        [
          "RFQs, suppliers, and commercial terms",
          "Supplier identity, availability, pricing, MOQ, lead time, payment, shipping, and quality terms require explicit confirmation for each engagement.",
        ],
        [
          "Uploaded material and intellectual property",
          "You retain responsibility for the material you upload and must have the rights needed to share it for sourcing purposes.",
        ],
        [
          "Contact and updates",
          "These MVP terms require legal review before production use. Contact info@arcanawangsa.com with questions.",
        ],
      ]
    : [
        [
          "Information used in this MVP",
          "The demo may use information you enter to show the RFQ and workspace flow. It does not automatically send supplier enquiries or process payments.",
        ],
        [
          "How information is used",
          "Information is used to structure the requested sourcing workflow and to show the associated demo screens.",
        ],
        [
          "Newsletter requests",
          "Subscribe opens your email client with a prepared request; this preview does not silently store your address.",
        ],
        [
          "Sharing and retention",
          "Supplier sharing, retention periods, analytics, and processor arrangements must be defined in the production privacy notice before launch.",
        ],
        [
          "Your choices and contact",
          "For a privacy question or data request, contact info@arcanawangsa.com. This page requires legal review before production use.",
        ],
      ];
  return (
    <div className="legal-page">
      <div className="legal-utility">
        <a href="/">← Back to home</a>
      </div>
      <header>
        <p>{terms ? "TERMS OF SERVICE" : "PRIVACY POLICY"}</p>
        <h1>{title}</h1>
        <span>Last updated: August 21, 2026</span>
      </header>
      <div className="legal-layout">
        <nav>
          <b>In this policy</b>
          {sections.map(([heading], i) => (
            <a key={heading} href={`#legal-${i + 1}`}>
              {String(i + 1).padStart(2, "0")} {heading}
            </a>
          ))}
        </nav>
        <article>
          {sections.map(([heading, text], i) => (
            <section id={`legal-${i + 1}`} key={heading}>
              <h2>{heading}</h2>
              <p>{text}</p>
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}

export function FooterPage({ path }: { path: (typeof routes)[number] }) {
  const content =
    path === "/sourcing-guide" ? (
      <SourcingGuide />
    ) : path === "/private-label" ? (
      <PrivateLabel />
    ) : path === "/quality-control" ? (
      <QualityControl />
    ) : path === "/alibaba-alternative" ? (
      <Alternative />
    ) : path === "/about" ? (
      <About />
    ) : path === "/supplier-guide" ? (
      <SupplierGuide />
    ) : (
      <LegalPage terms={path === "/terms-of-service"} />
    );
  return (
    <>
      <Header />
      <main id="main-content" className="footer-page-main">{content}</main>
      <Footer />
    </>
  );
}
