import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Mail } from "lucide-react";
import { SupplierIntakeModal } from "./supplier-intake";
import "./skip-link.css";

const COPY_GUARD_EXEMPT = new Set(["INPUT", "TEXTAREA", "SELECT"]);
function isCopyGuardExempt(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return COPY_GUARD_EXEMPT.has(target.tagName) || target.isContentEditable;
}

export function CopyGuard({ children }: { children: ReactNode }) {
  useEffect(() => {
    function blockClipboardEvent(event: ClipboardEvent) {
      if (isCopyGuardExempt(event.target)) return;
      event.preventDefault();
    }
    function blockContextMenu(event: MouseEvent) {
      if (isCopyGuardExempt(event.target)) return;
      event.preventDefault();
    }
    document.addEventListener("copy", blockClipboardEvent);
    document.addEventListener("cut", blockClipboardEvent);
    document.addEventListener("contextmenu", blockContextMenu);
    return () => {
      document.removeEventListener("copy", blockClipboardEvent);
      document.removeEventListener("cut", blockClipboardEvent);
      document.removeEventListener("contextmenu", blockContextMenu);
    };
  }, []);

  return <div className="copy-guard">{children}</div>;
}

export function SkipLink() {
  function focusMainContent() {
    const target = document.getElementById("main-content");
    if (!target) return;
    target.setAttribute("tabindex", "-1");
    requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }

  return <a className="skip-link" href="#main-content" onClick={focusMainContent}>Skip to main content</a>;
}

type ButtonProps = {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  kind?: "primary" | "secondary";
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  ariaBusy?: boolean;
};

export function Button({ children, href, onClick, kind = "primary", disabled = false, type = "button", ariaBusy }: ButtonProps) {
  const className = `button ${kind}`;
  if (href) return <a className={className} href={disabled ? undefined : href} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined}>{children}</a>;
  return <button className={className} type={type} onClick={onClick} disabled={disabled} aria-busy={ariaBusy || undefined}>{children}</button>;
}

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const supplierTriggerRef = useRef<HTMLButtonElement>(null);
  const returnSupplierFocusToMenu = useRef(false);
  const wasMenuOpen = useRef(false);

  useEffect(() => {
    if (!menuOpen && wasMenuOpen.current) menuButtonRef.current?.focus();
    wasMenuOpen.current = menuOpen;
  }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);
  function openSupplierIntake(event: React.MouseEvent<HTMLButtonElement>) {
    supplierTriggerRef.current = event.currentTarget;
    returnSupplierFocusToMenu.current = menuOpen;
    setMenuOpen(false);
    setSupplierOpen(true);
  }
  function closeSupplierIntake() {
    setSupplierOpen(false);
    window.setTimeout(() => {
      if (returnSupplierFocusToMenu.current) menuButtonRef.current?.focus();
      else if (supplierTriggerRef.current?.isConnected) supplierTriggerRef.current.focus();
      else menuButtonRef.current?.focus();
    }, 240);
  }

  return <>
    <header className={`site-header ${menuOpen ? "nav-open" : ""}`}>
      <a className="wordmark" href="/">atelix<span>.</span></a>
      <nav id="site-navigation" className={`site-nav ${menuOpen ? "is-open" : ""}`} aria-label="Primary navigation">
        <a href="/#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
        <div className="nav-actions"><button className="supplier-link" type="button" onClick={openSupplierIntake}>Join Us</button><a className="button header-cta" href="/sign-in">Log in</a></div>
      </nav>
      <div className="header-actions"><button className="supplier-link" type="button" onClick={openSupplierIntake}>Join Us</button><a className="button header-cta" href="/sign-in">Log in</a><button ref={menuButtonRef} className="menu-toggle" type="button" aria-controls="site-navigation" aria-expanded={menuOpen} aria-label={menuOpen ? "Close navigation" : "Open navigation"} onClick={() => setMenuOpen((open) => !open)}><span aria-hidden="true">{menuOpen ? "×" : "☰"}</span></button></div>
    </header>
    <SupplierIntakeModal open={supplierOpen} onClose={closeSupplierIntake} returnFocusRef={supplierTriggerRef} />
  </>;
}

export function Footer() {
  const [email, setEmail] = useState("");
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  function requestUpdates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    location.href = `mailto:info@arcanawangsa.com?subject=${encodeURIComponent("Atelix newsletter updates")}&body=${encodeURIComponent(`Please add ${email} to the Atelix newsletter.`)}`;
  }
  return <footer className="landing-footer" aria-labelledby="footer-title"><h2 id="footer-title" className="sr-only">Atelix footer</h2><div className="footer-grid"><section className="footer-intro"><a className="footer-wordmark" href="/">atelix<span>.</span></a><p>Sourcing intelligence for better supplier decisions.</p><p className="footer-region">Across Asia-Pacific manufacturing</p></section><nav className="footer-links" aria-label="Sourcing"><h3>Sourcing</h3><a href="/sourcing-guide">Sourcing Guide</a><a href="/private-label">Private Label</a><a href="/quality-control">Quality Control</a><a href="/alibaba-alternative">Alibaba Alternative</a></nav><nav className="footer-links" aria-label="Company"><h3>Company</h3><a href="/about">About</a><a href="/supplier-guide">Supplier Guide</a><a href="/privacy-policy">Privacy Policy</a><a href="/terms-of-service">Terms of Service</a></nav><section className="footer-newsletter" aria-labelledby="updates-title"><h3 id="updates-title">Stay Updated</h3><p>Get sourcing tips & industry updates.</p><form onSubmit={requestUpdates}><label className="sr-only" htmlFor="newsletter-email">Work email</label><div className="newsletter-form"><div className="newsletter-field"><Mail size={18} aria-hidden="true" /><input id="newsletter-email" name="email" type="email" autoComplete="email" placeholder="Your work email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><button type="submit" disabled={!isValid}>Subscribe</button></div></form><small>Work email only.</small></section></div><div className="footer-bottom"><p>© Atelix, 2026. All rights reserved.</p><a href="mailto:info@arcanawangsa.com">info@arcanawangsa.com</a></div></footer>;
}
