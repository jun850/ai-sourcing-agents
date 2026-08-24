import { Check, CirclePlus, ArrowRight } from "lucide-react";
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
type FaqEntry = { q: string; a: string };

const sourcingFaqs: FaqEntry[] = [
  {
    q: "Where does Atelix's network actually come from?",
    a: "Our network comes from Atelix's business operations and partnerships with existing suppliers across China, Vietnam, Japan, Malaysia, and Indonesia. It is rooted in more than 30 years of family and business relationships in Asian manufacturing, including the founder's apparel business, and strengthened through long-standing supplier partnerships across the region. We continue to expand through trusted introductions and factory-to-factory relationships, while our team manages local compliance, quality control, and communication.",
  },
  {
    q: "Why does Atelix source from five countries instead of one?",
    a: "Most sourcing brokers specialize in a single country because that's where their founders have relationships. That's a real advantage inside that one country, and a real limit outside it: your product might be a better fit for Vietnam's price point, Indonesia or Malaysia's MOQ flexibility, China's category depth, or Japan's precision manufacturing. Atelix's AI sourcing agent evaluates your product category, target price, MOQ, and timeline against a network that spans all five, built on relationships that predate the company, and recommends the market and factory combination that actually fits your order, not whichever country the broker happens to specialize in.",
  },
  {
    q: "How does the AI sourcing agent actually decide where to route my order?",
    a: "It matches your requirements (category, target unit cost, MOQ, certifications needed, timeline) against our vetted supplier database across all five countries, benchmarks quotes against market data so you're not overpaying, and locks specifications before production starts so nothing drifts mid-run. A person on our team reviews every match before it goes to you. The AI does the comparison work across five markets at once; a human still signs off on the trust-sensitive parts.",
  },
  {
    q: "What does it cost?",
    a: "Atelix charges a fee on your production order value that starts at 13% for a new relationship or any order under $10,000, and steps down as your total spend with us grows across a rolling 12 months: 10% on the next portion up to $50,000, 7% up to $150,000, and 5% beyond that. It's a graduated rate, each slice of your spend is priced at its own tier, so your blended cost falls smoothly as you grow with us instead of hitting a wall or a sudden discount cliff. A brand sourcing $200,000 a year through Atelix pays a blended rate of roughly 7.4%, not the 13% headline figure. This fee covers factory matching, quality control at every production stage, and full logistics coordination, there's no separate invoice for any of it.",
  },
  {
    q: "What products can I source through Atelix?",
    a: "Fashion is where we're strongest, including raw materials, across Japan, China, Indonesia, and Vietnam, alongside a growing beauty and skincare category. We also source electronics and furniture out of China and Indonesia. Sourcing across five countries and multiple categories generally means a wider range of products and order sizes fit somewhere in the network than a single-category, single-country broker could offer.",
  },
  {
    q: "What's the minimum order quantity?",
    a: "MOQs vary by country and factory. Vietnam, Malaysia, and Indonesia generally offer more flexibility on small first orders than typical Chinese or Japanese manufacturers, part of why we route across all five rather than defaulting to one. As you scale, you can grow volume without switching factories.",
  },
  {
    q: "How long does a typical order take, start to delivery?",
    a: "Around 1 to 2 months from sourcing samples through to full production. Exact timing depends on your product complexity and destination market, factory matching is typically fast, sampling and approval take the next chunk, then production and shipping fill out the rest.",
  },
  {
    q: "How are factories vetted before they're added to the network?",
    a: "Every factory goes through a review before it's added: production capacity, certifications, export history, and quality management practices. We're building toward on-the-ground verification as our standard as the network scales.",
  },
  {
    q: "If something goes wrong with an order, what happens?",
    a: "If an issue is caught during production, our team works with the factory immediately to identify the root cause and correct it while the run is still in progress, catching a problem mid-production is far cheaper and faster to fix than discovering it after the full order is complete. If an issue is only caught at final inspection, before shipment, we negotiate rework or replacement with the factory on your behalf before anything ships to you. You are not the one negotiating with the factory when something goes wrong, we are, because that's the entire point of using a sourcing partner instead of going direct.",
  },
  {
    q: "Does Atelix handle logistics and customs?",
    a: "Yes, export documentation and customs clearance are coordinated for you, so you're not managing freight forwarders across five different countries' processes on your own.",
  },
];

const privateLabelFaqs: FaqEntry[] = [
  {
    q: "What does \"private label\" mean through Atelix?",
    a: "You bring the brand, the packaging design, and the product spec. Atelix's network, built on decades of relationships across Asian manufacturing and grown through warm introductions across China, Vietnam, Japan, Malaysia, and Indonesia, manufactures it under your label, not theirs, with your branding, your packaging, and your product ready to ship directly to your customer or your fulfillment center. You're not buying a factory's existing catalog item with your logo slapped on, you're getting a product built to your spec, sourced from whichever of our five countries fits that spec best.",
  },
  {
    q: "How is private label different from standard sourcing with Atelix?",
    a: "Standard sourcing finds and manages a factory for a product you've already speced. Private label adds two things on top: brand and packaging execution (your logo, your packaging design, your inserts, your barcode placement) and market-readiness (getting the finished product compliant and correctly labeled for wherever it's actually going to sell, whether that's a US Amazon FBA warehouse, a UK retailer, an EU marketplace, or an Australian distributor). The sourcing and QC process underneath is the same, five-country network, same fee structure, private label is the layer on top.",
  },
  {
    q: "What's the minimum order quantity for a private label run?",
    a: "MOQs for private label are typically higher than for a standard sourced order, because custom packaging and branded tooling carry their own minimum runs regardless of product MOQ. We don't publish a single floor because it depends on your product, packaging complexity, and which of our five countries fits best, we'll give you the real number as part of your quotation, not a generic figure that doesn't match your actual order. As a starting point, Vietnam, Malaysia, and Indonesia tend to offer more flexibility on smaller private label runs than China or Japan.",
  },
  {
    q: "Can Atelix help design my packaging, or do I need to bring my own?",
    a: "Both options are available. If you already have finished packaging artwork, we manage production and correct application across your run. If you need design support, we offer packaging and branding design starting from $30, scaling with the complexity of your project, separate from the sourcing commission, so you're not paying a percentage of your order value for a design service that has nothing to do with production.",
  },
  {
    q: "Do your factories understand Amazon FBA requirements?",
    a: "Yes. Suppliers across all five countries in our network are experienced with FBA-specific requirements: correct barcode (FNSKU) placement, poly-bagging and prep standards, carton labeling, and packaging that meets Amazon's dimensional and safety requirements before it ever reaches an FBA warehouse. We coordinate this as part of the private label process so your inventory doesn't get flagged or rejected at receiving, one of the most common and most expensive mistakes brands make sourcing for FBA on their own.",
  },
  {
    q: "What do I need to know about selling into the UK market?",
    a: "UK apparel compliance centers on textile composition, flammability, and chemical safety, and we build it into your production plan rather than leaving it as an export-day surprise. Under the Textile Products (Indication of Fibre Content) Regulations, garments need permanent, legible English-language labels stating the exact percentage of every constituent fiber. Children's nightwear and other high-risk garments must meet BS 5722 flammability standards under the Nightwear (Safety) Regulations. Materials must also clear GB REACH and UK POPs restrictions on azo dyes, restricted metals, and formaldehyde. The General Product Safety Regulations require physical traceability details on the garment or packaging too: manufacturer name, UK address or importer details, and batch or style numbers.",
  },
  {
    q: "What do I need to know about selling into the EU?",
    a: "EU compliance runs on a split model, the technical work, fiber content, restricted chemicals, product durability, gets engineered directly into our factory agreements and production, while the formal legal validation, certification, and registry filings get handled through accredited third-party labs and EU Notified Bodies. For apparel, that means REACH-compliant materials sourced at the mill level, verified through independent labs like SGS, Intertek, or TÜV, plus GOTS, OCS, and OEKO-TEX certification where relevant, and the newer Digital Product Passport requirements under ESPR built into product design. If your line touches electronics or beauty, the same split applies: CE marking, RoHS, and WEEE compliance for electronics, engineered into the build with Notified Body sign-off where required, and full safety assessments plus CPNP registration for beauty, handled through qualified third-party assessors. You don't manage any of these labs or registries yourself, we coordinate them as part of your production plan.",
  },
  {
    q: "What do I need to know about selling into Australia?",
    a: "Australia enforces this closely for apparel, and we build it into your production plan rather than leaving it as a last-minute checklist. Garments require permanent, legible English-language care labeling, or standardized ISO 3758 care symbols, under the Consumer Goods (Care Labelling) Information Standard 2023 (AS/NZS 1957). Country of origin labeling is required under the Commerce (Trade Descriptions) Act, with permanent attachment for textile, leather, and footwear items. Children's nightwear carries the strictest requirement in Australian apparel: AS/NZS 1249 governs low-flammability rating labels, which must be physically and correctly attached, and raw materials must clear chemical restrictions on azo dyes, restricted heavy metals, and formaldehyde under AICIS guidelines. If your product falls into children's sleepwear, treat this as the single most important compliance line item in your production plan, it's the category Australian authorities audit most aggressively.",
  },
  {
    q: "Does Atelix guarantee my product will pass customs and compliance checks in these markets?",
    a: "We make sure your product is built to follow the compliance requirements of your destination market, labeling, fiber content, flammability, chemical restrictions, and documentation are built into your production plan from the start, not discovered after your goods are already on a ship. We also support multiple incoterms, including DDP, so we can take on more of the customs and delivery burden for you rather than handing you a container and a set of paperwork at the port. Customs authorities make their own determinations at the border, no sourcing partner can override that, but we do everything on our side to get your product compliant and documented correctly, and we'll flag it clearly if your product falls into a higher-risk category where an extra compliance check before your first commercial shipment is worth the time.",
  },
  {
    q: "How long does a private label order take, start to delivery?",
    a: "Private label typically takes longer than standard sourcing because of the added packaging design approval, branded tooling setup, and market-specific labeling steps. As a general range, samples usually take 1 to 2 weeks, and full production runs take up to about a month, but your exact lead time depends on your product, order size, and destination market, so we confirm the real timeline as part of your quotation.",
  },
  {
    q: "What does private label cost?",
    a: "Private label runs on the same graduated commission structure as standard sourcing, 13% on your first $10,000 with us, stepping down to 10%, then 7%, then 5% as your cumulative spend grows across a rolling 12 months. Packaging materials, branded tooling, and any third-party compliance certification costs are separate line items specific to your product and destination market, not part of the sourcing commission, we quote those transparently as part of your production plan rather than folding them into a single opaque number.",
  },
  {
    q: "How do I know a factory won't reuse my design or sell to someone else?",
    a: "We only work with design partners who sign a non-disclosure agreement before your project starts, and that same protection extends to the factories we use for your private label production, so your design stays private through design and manufacturing, not just while it sits with a designer.",
  },
];

const qualityControlFaqs: FaqEntry[] = [
  {
    q: "What quality control does Atelix run on every order?",
    a: "Every order goes through checks at three points in the production cycle: before production begins (materials and specification confirmation), during production (an in-line check partway through the run, catching problems while they're still cheap and fast to fix), and before shipment (a final inspection against your agreed specification and quality standard). This is the same three-stage inspection standard used by the most rigorous sourcing brokers in this category, we matched the bar and applied it across five countries instead of one.",
  },
  {
    q: "Why does catching a defect mid-production matter more than catching it at the end?",
    a: "Because the fix is completely different. Caught mid-production, our team works with the factory to identify the root cause and correct it while the run is still going, the rest of the order comes out right. Caught only at final inspection, the options shrink to negotiating rework or replacement on goods that are already finished, which costs more and takes longer. Catching problems early is the entire reason a three-stage process exists instead of a single pre-shipment check.",
  },
  {
    q: "What happens if a defect is found?",
    a: "If it's found during the in-line check, we work with the factory immediately on a root-cause fix while production is still running. If it's found at final inspection, we negotiate rework or replacement with the factory before anything ships to you, you are not the one negotiating that, we are. Either way, you are not the one discovering the problem after it lands at your warehouse.",
  },
  {
    q: "What's your defect rate?",
    a: "We're a young platform and won't publish a number we haven't earned yet. Our target is to perform at or below the industry range for orders without independent QC (5% to 15%), the standard our three-stage AQL inspection is built to beat, and we're working toward matching the strongest documented track records in this category as we complete more orders. We'll publish our own real numbers, by country, as soon as we have the order history to back them up honestly.",
  },
  {
    q: "What inspection standard do you use?",
    a: "AQL (Acceptable Quality Level), the same statistical sampling methodology used industry-wide for pre-shipment inspection. A random sample from the production run is inspected, and the lot is accepted only if defects fall below the threshold for that sample size, giving statistically reliable quality assurance without inspecting every single unit.",
  },
  {
    q: "What certifications do you check for in a factory?",
    a: "It depends on your product and destination market. In fashion, that includes GOTS, OEKO-TEX Standard 100, USDA Organic, and Fair Trade Certified for the US; GOTS, OEKO-TEX, EU Ecolabel, and Woolmark for the EU and UK; and Ethical Clothing Australia, ACO, and GOTS for Australia. For electronics, that's FCC and UL in the US, CE, RoHS, and WEEE in the EU, UKCA in the UK, and RCM in Australia. For beauty, that's USDA Organic and Leaping Bunny in the US, COSMOS Organic and EU Ecolabel in Europe, and ACO or Safe Cosmetics Australia locally. Across every category and market, we also check for the operational basics, ISO 9001 for quality management and factory-level social compliance like BSCI or SA8000, before a factory earns a place in our network.",
  },
  {
    q: "Does quality control cost extra?",
    a: "No. Three-stage inspection is included in Atelix's standard fee, there's no separate invoice for it. For context, independent third-party inspection companies typically charge $200 to $500 per visit, so three inspection stages purchased separately would run $600 to $1,500. Bundling this into the core fee, rather than charging for it as an add-on, is the same principle the most trusted brokers in this category use, and we hold to it for the same reason: a brand shouldn't have to choose between paying for QC and skipping it to save money.",
  },
  {
    q: "How is Atelix's QC different from hiring an independent inspector myself?",
    a: "An independent inspector typically does one visit, a pre-shipment check, after most of your money is already committed and most of the production is already done. Our three-stage process catches problems 4 to 6 weeks earlier in the production cycle on average, when they're still correctable rather than just documentable. We also have a direct working relationship with the factory, which means a corrective action can happen in hours, not through a formal dispute process with a factory that has no ongoing relationship with your inspector.",
  },
  {
    q: "Does this work the same way across all five countries you source from?",
    a: "Yes. The three-stage process is the standard applied to every order regardless of which of our five countries, China, Vietnam, Japan, Malaysia, or Indonesia, the order is produced in. A single-country broker's QC process only ever gets tested against one manufacturing environment. Ours is being proven across five, which is a harder bar to hold consistently, and it's the bar we're holding.",
  },
  {
    q: "Can I get inspection reports and photos?",
    a: "Yes, by default. Photo and video documentation from each inspection stage is part of the standard service already included in your fixed sourcing fee, not a paid add-on, so you're not paying extra to see what's actually happening on the production floor.",
  },
];

const alibabaAlternativeFaqs: FaqEntry[] = [
  {
    q: "Isn't Alibaba free? Why would I pay Atelix instead?",
    a: "Alibaba is free to browse, but it isn't free to use safely. You pay in a different currency: your own time vetting factories with no reliable way to verify who's real, your own risk when a supplier that looked legitimate turns out to cut corners or disappear after a deposit, and your own cost when a bad batch reaches your customers. Atelix charges a commission because we absorb that risk and that vetting work for you, factory verification, quality control at three production stages, and a working relationship with the factory that means problems get fixed in hours, not through a dispute you're managing alone.",
  },
  {
    q: "What can Atelix reach that Alibaba can't?",
    a: "Some of the strongest suppliers in our Japanese network are not on Alibaba, do not maintain English-language storefronts, and do not respond to cold outreach or unsolicited RFQs from brands they don't already have a relationship with. This isn't unique to Japan, it's common across the highest-quality tier of manufacturers in several of our markets, but it's most pronounced there. If a factory isn't listed anywhere searchable and doesn't answer emails from strangers, no amount of time spent searching Alibaba, Google, or a trade directory gets you access to it. That access only exists through an existing relationship, which is what Atelix's network provides and a directory, by definition, cannot.",
  },
  {
    q: "Is Alibaba unreliable, or is it just harder to use well?",
    a: "Alibaba isn't unreliable so much as unfiltered. It's a directory, not a vetting service, anyone can list a storefront, and the platform's Trade Assurance protects a slice of a transaction, not the full relationship: quality consistency, ongoing communication, honoring an agreed timeline, and honesty about capacity at the volume you actually need. A factory that's great at 500 units can still fail at 50,000, and a listing doesn't tell you which one you're looking at. That gap is exactly what a vetting and relationship-management layer exists to close.",
  },
  {
    q: "What happens with the classic Alibaba risks, quality drift, missed deadlines, and communication gaps?",
    a: "These are the three most common ways an Alibaba-sourced order goes wrong, and they're the three things Atelix's process is built around directly: quality drift is caught by three-stage inspection rather than discovered at delivery, missed deadlines are managed through active production tracking and a direct factory relationship rather than hoping a supplier proactively flags a delay, and communication gaps are closed by a team that speaks the factory's language and has an existing working relationship, not a translated chat thread with someone you've never worked with before.",
  },
  {
    q: "Do I lose price competitiveness by not sourcing directly on Alibaba?",
    a: "Not meaningfully, and often the opposite. Alibaba's headline prices don't include the cost of a failed order, a quality dispute, or the time spent vetting a factory that turns out not to be viable at your volume. Once you account for that real cost, a vetted, managed sourcing relationship is frequently cheaper on a landed-cost basis, not just safer.",
  },
  {
    q: "What if I already have a supplier relationship on Alibaba I want to keep?",
    a: "Atelix isn't asking you to abandon a working relationship you already trust. Where we add value is everywhere that relationship doesn't exist yet, a new product category, a new country you haven't sourced from before, or a supplier tier, like parts of our Japanese network, that was never reachable through Alibaba in the first place.",
  },
  {
    q: "How is this different from just hiring a sourcing agent?",
    a: "A traditional sourcing agent typically works one country or one region, and their access is limited to their own personal network. Atelix's network spans five countries, China, Vietnam, Japan, Malaysia, and Indonesia, so the question isn't \"does my agent happen to know someone in the right country for this product,\" it's \"which of five markets actually fits this order,\" decided by matching your requirements against the full network rather than whatever one person's Rolodex happens to contain.",
  },
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
function Faqs({
  title = "Frequently asked questions",
  items,
}: {
  title?: string;
  items: FaqEntry[];
}) {
  return (
    <section className="resource-section">
      <div className="resource-wrap resource-faq">
        <h2>{title}</h2>
        {items.map(({ q, a }) => (
          <details key={q}>
            <summary>
              <span>{q}</span>
              <CirclePlus size={24} aria-hidden="true" />
            </summary>
            <p>{a}</p>
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
      <Faqs items={sourcingFaqs} />
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
      <Faqs title="Private Label FAQ" items={privateLabelFaqs} />
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
      <Faqs title="Quality Control FAQ" items={qualityControlFaqs} />
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
          <h2>Listing-led sourcing vs. Atelix workflow</h2>
          <div className="comparison-table">
            <div>
              <b>Listing-led sourcing</b>
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
      <Faqs title="Alibaba Alternative FAQ" items={alibabaAlternativeFaqs} />
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
      <section className="resource-section resource-muted">
        <div className="resource-wrap">
          <h2>The team behind Atelix</h2>
          <p className="about-team-lede">
            Jun and Celina met in Australia during their Master's studies—one
            building marketplace product across Southeast Asia, the other
            native to the China and Japan markets that anchor global textile
            manufacturing. That meeting became a decision to build together,
            starting with{" "}
            <a
              href="https://arcanawangsa.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              ARCANA
            </a>
            , a fabric-led brand born in Melbourne. ARCANA taught us exactly
            how fragmented fashion sourcing looks from every side of the
            supply chain—design, sourcing, production, and market operations.
            Atelix is what we built next to fix it.
          </p>
          <div className="about-team-grid">
            <article>
              <figure className="about-team-photo about-team-photo--jun">
                <img
                  src="/assets/team/jun-arcana.jpg"
                  alt="Jun Arcana, Co-Founder and CEO of Atelix"
                  width={900}
                  height={1200}
                  loading="lazy"
                />
              </figure>
              <div>
                <h3>Jun Arcana</h3>
                <p className="about-team-role">Co-Founder &amp; CEO</p>
                <p>
                  A technical product manager with six years across
                  Southeast Asia's marketplace and fintech leaders, including
                  ByteDance Shop/Tokopedia, Blibli, and BukuWarung, plus
                  martech at Melbourne-based IntelligenceBank. Jun founded
                  Anakost, a local quick-commerce startup, in 2018 during his
                  first year at university, and leads product and
                  engineering at Atelix.
                </p>
              </div>
            </article>
            <article>
              <figure className="about-team-photo about-team-photo--celina">
                <img
                  src="/assets/team/celina.jpg"
                  alt="Celina Yang, Co-Founder, COO and Creative Director of Atelix"
                  width={800}
                  height={1200}
                  loading="lazy"
                />
              </figure>
              <div>
                <h3>Celina Yang</h3>
                <p className="about-team-role">
                  Co-Founder, COO &amp; Creative Director
                </p>
                <p>
                  A finance analyst with a master's degree in Accounting
                  &amp; Finance, reading financial models and economic
                  conditions across Greater China and Japan, native to
                  both markets, which anchor global manufacturing across
                  fashion, electronics, and IoT hardware. Celina runs
                  Atelix's financial operations
                  and leads supplier-facing quality and creative direction
                  across two of the industry's most important sourcing
                  regions. She's also building a skincare brand, drawn in
                  by an active interest in beauty and fashion.
                </p>
              </div>
            </article>
          </div>
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
