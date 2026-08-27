import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Activity, ArrowRight, BarChart3, Check, CirclePlus, Instagram, Linkedin, Mail, Paperclip, Send, ShieldCheck, Sparkles, X as XLogo } from "lucide-react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { SupplierIntakeModal } from "../supplier-intake";
import { atelixContent, type FeatureCardContent, type JourneyPreviewKind, type SupplierContent } from "../content/atelix";
import { ActionButton, DemoUnavailableButton } from "./primitives";
import { chatPromptMotion, featureRevealMotion, sectionRevealMotion, supplierRowMotion, journeyMotion } from "./motion";
import Journey from "./journey";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const supplierTriggerRef = useRef<HTMLButtonElement>(null);
  const wasMenuOpen = useRef(false);
  const returnSupplierFocusToMenu = useRef(false);

  useEffect(() => {
    if (!menuOpen && wasMenuOpen.current) menuButtonRef.current?.focus();
    wasMenuOpen.current = menuOpen;
  }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const navigation = navigationRef.current;
    const getFocusable = () => Array.from(navigation?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') || []).filter((item) => !item.hasAttribute("hidden"));
    const focusable = getFocusable();
    focusable[0]?.focus();
    document.body.classList.add("nav-is-open");
    const containNavigationFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); return; }
      if (event.key !== "Tab") return;
      const items = getFocusable();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", containNavigationFocus);
    return () => { document.body.classList.remove("nav-is-open"); window.removeEventListener("keydown", containNavigationFocus); };
  }, [menuOpen]);
  function openSupplier(event: React.MouseEvent<HTMLButtonElement>) {
    supplierTriggerRef.current = event.currentTarget;
    returnSupplierFocusToMenu.current = menuOpen;
    setMenuOpen(false);
    setSupplierOpen(true);
  }
  function closeSupplier() {
    setSupplierOpen(false);
    window.setTimeout(() => {
      if (returnSupplierFocusToMenu.current) menuButtonRef.current?.focus();
      else supplierTriggerRef.current?.focus();
    }, 240);
  }
  const nav = atelixContent.navigation;
  return <>
    <header className={`site-header ${menuOpen ? "nav-open" : ""}`}>
      <a className="wordmark" href="/">atelix<span>.</span></a>
      <nav ref={navigationRef} id="site-navigation" className={`site-nav ${menuOpen ? "is-open" : ""}`} aria-label="Primary navigation">
        {nav.primary.map((item) => <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a>)}
        <div className="nav-actions"><button className="supplier-link" type="button" onClick={openSupplier}>{nav.join}</button><a className="button header-cta" href="/sign-in">Login</a></div>
      </nav>
      <div className="header-actions"><button className="supplier-link" type="button" onClick={openSupplier}>{nav.join}</button><a className="button header-cta" href="/sign-in">{nav.login}</a><button ref={menuButtonRef} className="menu-toggle" type="button" aria-controls="site-navigation" aria-expanded={menuOpen} aria-label={menuOpen ? "Close navigation" : "Open navigation"} onClick={() => setMenuOpen((open) => !open)}><span aria-hidden="true">{menuOpen ? "×" : "☰"}</span></button></div>
    </header>
    <SupplierIntakeModal open={supplierOpen} onClose={closeSupplier} returnFocusRef={supplierTriggerRef} />
  </>;
}

export function HeroSection() {
  const copy = atelixContent.hero;
  return <section className="hero" aria-labelledby="hero-title"><div><p className="hero-eyebrow">{copy.eyebrow}</p><h1 id="hero-title">{copy.title} <em>{copy.emphasis}</em></h1><p className="lede">{copy.description}</p><ActionButton href="/sign-in">{copy.cta} <ArrowRight size={16} aria-hidden="true" /></ActionButton></div><div className="hero-art"><img src="/assets/generated/sourcing-agent.svg" alt={copy.imageAlt} /></div></section>;
}

export function BrandRail() {
  const { label, brands } = atelixContent.brandRail;
  const cycleSeconds = 12;
  const stepSeconds = cycleSeconds / brands.length;
  const slots = brands.slice(0, 5);
  return <section className="brand-rail" aria-label="Retail destinations"><div className="brand-rail-inner"><p className="brand-rail-label">{label}</p><div className="brand-rail-window" tabIndex={0} aria-label={`${label}: ${brands.map((brand) => brand.name).join(", ")}`}><div className="brand-blur-grid" aria-hidden="true">{slots.map((slot, slotIndex) => <span className="brand-blur-slot" key={slot.id}>{brands.map((brand, brandIndex) => <img className={`brand-blur-logo brand-blur-logo--${brand.id}`} src={brand.src} alt="" width={brand.width} height={brand.height} key={brand.id} style={{ animationDelay: `${-(brandIndex + slotIndex) * stepSeconds}s` }} />)}</span>)}</div></div></div></section>;
}

function BriefPreview() { return <div className="preview"><p><Sparkles size={14} aria-hidden="true" /> Looking for 1,000 heavyweight jersey tees. Washed finish, relaxed fit, delivery to Melbourne.</p><div className="input-sim">Upload a tech pack or describe your item <Paperclip size={16} aria-hidden="true" /><Send size={16} aria-hidden="true" /></div></div>; }
function DraftPreview() { return <div className="preview rows"><b>RFQ draft <em>Ready to review</em></b><p>Product <strong>Heavyweight jersey tee</strong></p><p>Quantity <strong>1,000 units</strong></p><p>Must-have <strong>Washed finish</strong></p></div>; }
function ProgressPreview() { return <div className="preview rows">{["Brief locked", "Sourcing fit", "Quote context", "Invoice due"].map((item, index) => <p key={item}><i className={index < 2 ? "done" : ""}>{index < 2 ? <Check size={11} aria-hidden="true" /> : ""}</i><strong>{item}</strong><em>{index < 2 ? "Updated" : "Upcoming"}</em></p>)}</div>; }
function NegotiationPreview() { return <div className="preview rows"><b>Negotiation support <em>Illustrative</em></b>{[["Payment terms", "100% upfront", "30 / 70"], ["MOQ", "5,000 units", "2,500 units"], ["Unit price", "$4.85", "$4.40"]].map(([label, oldValue, value]) => <p key={label}>{label}<s>{oldValue}</s><strong>{value}</strong></p>)}</div>; }
function ProductionPreview() { return <div className="preview production"><b>Order #PO-1847 <em>Week 3 of 6</em></b><p><i className="pulse" aria-hidden="true" />Production update received <span>Latest</span></p><div className="dots" aria-label="Production progress"><i className="done" /><i /><i /><i /></div></div>; }

const previewMap: Record<JourneyPreviewKind, () => ReactNode> = { brief: BriefPreview, draft: DraftPreview, quotes: ProgressPreview, negotiation: NegotiationPreview, production: ProductionPreview };

function JourneyCard({ step, index, reduced, journeyProgress }: { step: typeof atelixContent.journey.steps[number]; index: number; reduced: boolean | null; journeyProgress: MotionValue<number> }) {
  const cardRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: cardRef, offset: ["start 94%", "end 30%"] });
  const cardOpacity = useTransform(scrollYProgress, [0, .18, .78, 1], [.2, 1, 1, .2]);
  const checkpointCenter = (index + .5) / atelixContent.journey.steps.length;
  const checkpointProgress = useTransform(journeyProgress, [Math.max(0, checkpointCenter - .1), Math.min(1, checkpointCenter + .1)], [0, 1]);
  const dotStyle = { borderColor: reduced ? "#7fb879" : useTransform(checkpointProgress, [0, 1], ["#c8d0ca", "#7fb879"]) };
  const dotFillStyle = { backgroundColor: reduced ? "#7fb879" : useTransform(checkpointProgress, [0, 1], ["#e1e6e2", "#7fb879"]), scale: reduced ? 1 : useTransform(checkpointProgress, [0, 1], [.62, 1]) };
  const Preview = previewMap[step.preview];
  return <><motion.article ref={cardRef} className={`journey-card ${index % 2 === 1 ? "right" : "left"}`} style={{ gridRow: index + 1, opacity: reduced ? 1 : cardOpacity }}><motion.span className="journey-dot journey-dot-mobile" aria-hidden="true" style={dotStyle}><motion.i style={dotFillStyle} /></motion.span><small>{step.label}</small><h3>{step.title}</h3><p>{step.description}</p><Preview /></motion.article><motion.span className="journey-dot journey-dot-desktop" aria-hidden="true" style={{ ...dotStyle, gridColumn: 2, gridRow: index + 1 }}><motion.i style={dotFillStyle} /></motion.span></>;
}

export function JourneySection() {
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: stageRef, offset: ["start 87%", "end 47%"] });
  const journeyProgress = useSpring(scrollYProgress, journeyMotion.railSpring);
  const copy = atelixContent.journey;
  return <section id="how" className="journey" aria-labelledby="how-title"><div className="journey-head"><h2 id="how-title">{copy.title} <em>{copy.emphasis}</em></h2><p>{copy.description}</p></div><div ref={stageRef} className="journey-stage"><div className="journey-rail" aria-hidden="true"><motion.i style={{ scaleY: reduced ? 1 : journeyProgress }} /></div>{copy.steps.map((step, index) => <JourneyCard key={step.id} step={step} index={index} reduced={reduced} journeyProgress={journeyProgress} />)}</div></section>;
}

function SupplierRow({ supplier, index, reduced }: { supplier: SupplierContent; index: number; reduced: boolean | null }) {
  const chat = atelixContent.sourcing.chat;
  return <motion.article className="atelix-supplier" {...supplierRowMotion(index, !!reduced)}><div><div className="atelix-supplier-name"><strong>{supplier.name}</strong><span>{supplier.score}</span></div><p>{supplier.category} · {supplier.location}</p><small>{supplier.orders} · Est. {supplier.price}</small></div><DemoUnavailableButton aria-label={`${chat.quoteLabel} for ${supplier.name} (${chat.quoteUnavailable})`} reason={chat.quoteUnavailable}>{chat.quoteLabel}</DemoUnavailableButton></motion.article>;
}

function SupplierMatchingDemo({ reduced }: { reduced: boolean | null }) {
  const chat = atelixContent.sourcing.chat;
  return <div className="atelix-chat" aria-label="Atelix AI supplier matching demo"><div className="atelix-chat-bar"><strong>{chat.name}</strong><i aria-hidden="true" /><span className="sr-only">{chat.status}</span></div><div className="atelix-chat-body"><motion.div className="atelix-user-bubble" {...(reduced ? { initial: false } : chatPromptMotion.prompt)}>{chat.prompt}</motion.div><motion.div className="atelix-results" {...(reduced ? { initial: false } : chatPromptMotion.results)}><p className="atelix-results-title">{chat.resultsTitle}</p>{atelixContent.sourcing.suppliers.map((supplier, index) => <SupplierRow key={supplier.id} supplier={supplier} index={index} reduced={reduced} />)}</motion.div></div></div>;
}

function TrackingArtwork({ label }: { label: string }) { return <div className="atelix-tracking-visual" tabIndex={0} aria-label={label}><div className="atelix-mini-badge"><span className="atelix-supplier-signal"><Activity size={15} aria-hidden="true" /></span><strong><b>5 Active</b><span>Suppliers</span></strong></div><div className="atelix-bars"><i /><i /><i /></div><span>Performance Overview</span></div>; }
function NetworkArtwork({ label }: { label: string }) {
  const bars = [
    { height: 30, segments: [45, 35, 20] },
    { height: 42, segments: [42, 35, 23] },
    { height: 50, segments: [38, 37, 25] },
    { height: 61, segments: [35, 37, 28] },
    { height: 68, segments: [32, 38, 30] },
    { height: 78, segments: [30, 38, 32] },
    { height: 88, segments: [28, 38, 34] },
  ];

  return <div className="atelix-chart" tabIndex={0} aria-label={label}>
    <svg className="atelix-chart-line" viewBox="0 0 420 150" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="18,120 82,108 146,96 210,82 274,68 338,48 402,28" />
    </svg>
    <div className="atelix-chart-area">
      {bars.map(({ height, segments }, index) => <motion.i key={index} style={{ height: `${height}%`, transformOrigin: "bottom" }}>
        {segments.map((segment, segmentIndex) => <b key={segmentIndex} style={{ height: `${segment}%` }} />)}
      </motion.i>)}
    </div>
  </div>;
}
function QualityArtwork({ label }: { label: string }) { return <div className="atelix-quality-visual" aria-label={label}><ShieldCheck size={21} aria-hidden="true" /><p>Quality verification in progress for PT…</p><div><span>Verification Status</span><small><i />Certified <i />In Review</small><DemoUnavailableButton aria-label="View Report (demo only; unavailable in preview)" reason="Demo only; unavailable in preview.">View Report</DemoUnavailableButton></div></div>; }
const artworkMap: Record<FeatureCardContent["visual"], ({ label }: { label: string }) => ReactNode> = { tracking: TrackingArtwork, network: NetworkArtwork, quality: QualityArtwork };
const iconMap = { activity: Activity, chart: BarChart3, quality: ShieldCheck } as const;

function FeatureCard({ content, index, reduced }: { content: FeatureCardContent; index: number; reduced: boolean | null }) {
  const Icon = iconMap[content.icon];
  const Artwork = artworkMap[content.visual];
  return <motion.article className="atelix-feature" {...featureRevealMotion(index, !!reduced)}><div className="atelix-feature-copy"><Icon size={19} aria-hidden="true" /><h3>{content.title}</h3><p>{content.description}</p></div><Artwork label={content.artworkLabel} /></motion.article>;
}

export function SourcingIntelligenceSection() {
  const reduced = useReducedMotion();
  const copy = atelixContent.sourcing;
  return <section id="sourcing-intelligence" className="atelix-section" aria-labelledby="atelix-title"><motion.header className="atelix-heading" initial={reduced ? false : sectionRevealMotion.initial} whileInView={reduced ? undefined : sectionRevealMotion.whileInView} viewport={sectionRevealMotion.viewport} transition={reduced ? { duration: 0 } : sectionRevealMotion.transition}><p className="atelix-kicker">{copy.eyebrow}</p><h2 id="atelix-title">{copy.title} <em>{copy.emphasis}</em></h2><p>{copy.description}</p></motion.header><div className="atelix-matching"><div className="atelix-copy"><span className="atelix-label">{copy.label}</span><h3>{copy.matchingTitle}</h3><p>{copy.matchingDescription}</p></div><SupplierMatchingDemo reduced={reduced} /></div><div className="atelix-feature-grid">{copy.features.map((feature, index) => <FeatureCard key={feature.id} content={feature} index={index} reduced={reduced} />)}</div></section>;
}

export function FaqSection() {
  const copy = atelixContent.faq;
  return <section id="faq" className="faq" aria-labelledby="faq-title"><h2 id="faq-title">{copy.title} <em>{copy.emphasis}</em></h2>{copy.items.map((item) => <details key={item.id}><summary><span>{item.question}</span><CirclePlus size={24} aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</section>;
}

export function SiteFooter() {
  const [email, setEmail] = useState("");
  const copy = atelixContent.footer;
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  function requestUpdates(event: FormEvent<HTMLFormElement>) { event.preventDefault(); window.location.href = `mailto:${copy.contact}?subject=${encodeURIComponent(copy.newsletterSubject)}&body=${encodeURIComponent(copy.newsletterBody.replace("{email}", email))}`; }
  const socialIcons = { linkedin: Linkedin, x: XLogo, instagram: Instagram } as const;

  return <footer className="landing-footer" aria-labelledby="footer-title"><h2 id="footer-title" className="sr-only">Atelix footer</h2><div className="footer-grid"><section className="footer-intro"><a className="footer-wordmark" href="/">atelix<span>.</span></a><p>{copy.intro}</p><address className="footer-address"><strong className="footer-company-name">{copy.companyName}</strong><div className="footer-address-list">{copy.addressGroups.map((group) => <div className="footer-address-group" key={group.country}><span className="footer-address-country">{group.country}</span><div className="footer-address-lines">{group.lines.map((line) => <span key={line}>{line}</span>)}</div></div>)}</div><a href={`mailto:${copy.addressEmail}`}>{copy.addressEmail}</a></address></section><nav className="footer-links" aria-label={copy.sourcingLabel}><h3>{copy.sourcingLabel}</h3>{copy.sourcingLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}</nav><nav className="footer-links" aria-label={copy.companyLabel}><h3>{copy.companyLabel}</h3>{copy.companyLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}</nav><section className="footer-newsletter" aria-labelledby="updates-title"><h3 id="updates-title">{copy.newsletterTitle}</h3><p>{copy.newsletterDescription}</p><form onSubmit={requestUpdates}><label className="sr-only" htmlFor="newsletter-email">{copy.newsletterLabel}</label><div className="newsletter-form"><div className="newsletter-field"><Mail size={18} aria-hidden="true" /><input id="newsletter-email" name="email" type="email" autoComplete="email" placeholder={copy.newsletterPlaceholder} value={email} onChange={(event) => setEmail(event.target.value)} required /></div><button type="submit" disabled={!isValid}>{copy.subscribe}</button></div></form><small>{copy.newsletterNote}</small></section></div><div className="footer-bottom"><p>{copy.copyright}</p><div className="footer-bottom-right"><nav className="footer-social" aria-label="Social media">{copy.socialLinks.map((link) => { const Icon = socialIcons[link.id]; return <a key={link.id} href={link.href} target="_blank" rel="noreferrer noopener" aria-label={link.label}><Icon size={16} aria-hidden="true" /></a>; })}</nav><a href={`mailto:${copy.contact}`}>{copy.contact}</a></div></div></footer>;
}

export function AtelixLandingPage() {
  return <><SiteHeader /><main id="main-content"><HeroSection /><BrandRail /><Journey /><SourcingIntelligenceSection /><FaqSection /></main><SiteFooter /></>;
}
