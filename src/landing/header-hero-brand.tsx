import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { SupplierIntakeModal } from "../supplier-intake";
import { atelixContent, type AtelixLandingContent, type BrandRecord, type NavigationLink } from "../content/atelix";
import { ActionButton, SkipLink } from "./primitives";
import "./header-hero-brand.css";

export type AtelixNavigationLink = NavigationLink;

export type AtelixBrandRecord = BrandRecord;

export type HeaderHeroBrandContent = Pick<AtelixLandingContent, "brandName" | "skipLinkLabel" | "header" | "hero" | "brandRail">;

export const defaultHeaderHeroBrandContent: HeaderHeroBrandContent = {
  brandName: atelixContent.brandName,
  skipLinkLabel: atelixContent.skipLinkLabel,
  header: atelixContent.header,
  hero: atelixContent.hero,
  brandRail: atelixContent.brandRail,
};

type AtelixHeaderProps = {
  content?: HeaderHeroBrandContent["header"];
};

type AtelixHeroProps = {
  content?: HeaderHeroBrandContent["hero"];
};

type AtelixBrandRailProps = {
  content?: HeaderHeroBrandContent["brandRail"];
};

type HeaderHeroBrandProps = {
  content?: HeaderHeroBrandContent;
  includeSkipLink?: boolean;
};

type FocusRef = RefObject<HTMLButtonElement | null>;

function Wordmark({ wordmark, suffix }: { wordmark: string; suffix: string }) {
  return <span className="atelix-header-wordmark" aria-label={`${wordmark}${suffix}`}>
    {wordmark}<span aria-hidden="true">{suffix}</span>
  </span>;
}

function useHeaderMenu(menuOpen: boolean, menuButtonRef: FocusRef, closeButtonRef: FocusRef, navRef: RefObject<HTMLElement | null>, setMenuOpen: (open: boolean) => void) {
  const wasOpen = useRef(false);

  useEffect(() => {
    document.body.classList.toggle("atelix-nav-is-open", menuOpen);
    return () => document.body.classList.remove("atelix-nav-is-open");
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) {
      window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    } else if (wasOpen.current) {
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    }
    wasOpen.current = menuOpen;
  }, [closeButtonRef, menuButtonRef, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(
        navRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [],
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen, navRef, setMenuOpen]);
}

export function AtelixHeader({ content = defaultHeaderHeroBrandContent.header }: AtelixHeaderProps) {
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const modalReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const setMenuOpenStable = useCallback((open: boolean) => setMenuOpen(open), []);

  useHeaderMenu(menuOpen, menuButtonRef, closeButtonRef, navRef, setMenuOpenStable);

  useEffect(() => {
    function updateCompactState() {
      setCompact(window.scrollY > 80);
    }

    updateCompactState();
    window.addEventListener("scroll", updateCompactState, { passive: true });
    return () => window.removeEventListener("scroll", updateCompactState);
  }, []);

  function openSupplierIntake(event: MouseEvent<HTMLButtonElement>, fromDrawer = false) {
    modalReturnFocusRef.current = fromDrawer ? menuButtonRef.current : event.currentTarget;
    if (fromDrawer) setMenuOpen(false);
    setSupplierOpen(true);
  }

  function closeSupplierIntake() {
    setSupplierOpen(false);
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return <>
    <header className={`atelix-header${compact ? " is-compact" : ""}${menuOpen ? " is-menu-open" : ""}`}>
      <a className="atelix-header-wordmark-link" href={content.wordmarkHref} aria-label={`${content.wordmark}${content.wordmarkPunctuation} home`}>
        <Wordmark wordmark={content.wordmark} suffix={content.wordmarkPunctuation} />
      </a>

      <button
        className="atelix-header-scrim"
        type="button"
        aria-label={content.closeNavigationLabel}
        aria-hidden={!menuOpen}
        tabIndex={menuOpen ? 0 : -1}
        onClick={closeMenu}
      />

      <nav id="atelix-primary-navigation" ref={navRef} className={`atelix-header-nav${menuOpen ? " is-open" : ""}`} aria-label={content.navigationAriaLabel}>
        <button ref={closeButtonRef} className="atelix-header-close" type="button" tabIndex={menuOpen ? 0 : -1} aria-label={content.closeNavigationLabel} onClick={closeMenu}>
          <X size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
        {content.links.map((item) => <a key={item.id} href={item.href} onClick={closeMenu}>{item.label}</a>)}
        <div className="atelix-header-drawer-actions">
          <button className="atelix-header-join" type="button" onClick={(event) => openSupplierIntake(event, true)}>{content.joinLabel}</button>
          <a className="atelix-header-login" href={content.signInHref} onClick={closeMenu}>{content.mobileSignInLabel}</a>
        </div>
      </nav>

      <div className="atelix-header-desktop-actions">
        <button className="atelix-header-join" type="button" onClick={(event) => openSupplierIntake(event)}>{content.joinLabel}</button>
        <a className="atelix-header-login" href={content.signInHref}>{content.desktopSignInLabel}</a>
      </div>

      <button ref={menuButtonRef} className="atelix-header-menu" type="button" aria-controls="atelix-primary-navigation" aria-expanded={menuOpen} aria-label={menuOpen ? content.closeNavigationLabel : content.openNavigationLabel} onClick={() => setMenuOpen((open) => !open)}>
        {menuOpen ? <X size={21} strokeWidth={1.8} aria-hidden="true" /> : <Menu size={21} strokeWidth={1.8} aria-hidden="true" />}
      </button>
    </header>
    <SupplierIntakeModal open={supplierOpen} onClose={closeSupplierIntake} returnFocusRef={modalReturnFocusRef} />
  </>;
}

export function AtelixHero({ content = defaultHeaderHeroBrandContent.hero }: AtelixHeroProps) {
  const reduced = useReducedMotion();
  const revealTransition = reduced ? { duration: 0 } : { duration: 0.68, ease: [0.22, 1, 0.36, 1] as const };

  return <motion.section
    className="atelix-hero"
    aria-labelledby="atelix-hero-title"
    initial={reduced ? false : { opacity: 0, y: 18 }}
    animate={{ opacity: 1, y: 0 }}
    transition={revealTransition}
  >
    <div className="atelix-hero-copy">
      <h1 id="atelix-hero-title"><span>{content.title}</span><em>{content.emphasis}</em></h1>
      <p>{content.description}</p>
      <ActionButton className="atelix-hero-cta" href={content.ctaHref}>
        <span>{content.cta}</span>
        <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true" />
      </ActionButton>
    </div>
    <motion.div
      className="atelix-hero-art"
      initial={reduced ? false : { opacity: 0, scale: 0.97, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { ...revealTransition, delay: 0.08 }}
    >
      <img src={content.imageSrc} alt={content.imageAlt} width="760" height="620" fetchPriority="high" />
    </motion.div>
  </motion.section>;
}

export function AtelixBrandRail({ content = defaultHeaderHeroBrandContent.brandRail }: AtelixBrandRailProps) {
  const items = [...content.brands, ...content.brands];

  return <section className="atelix-brand-rail" aria-label={content.sectionAriaLabel}>
    <div className="atelix-brand-rail-inner">
      <p className="atelix-brand-rail-label">{content.label}</p>
      <div className="atelix-brand-rail-window" role="region" tabIndex={0} aria-label={content.sectionAriaLabel}>
        <div className="atelix-brand-rail-track">
          {items.map((brand, index) => {
            const duplicate = index >= content.brands.length;
            return <span key={`${brand.id}-${duplicate ? "duplicate" : "original"}`} className={`atelix-brand-rail-item is-${brand.id}`} aria-hidden={duplicate || undefined}>
              <img src={brand.src} alt={duplicate ? "" : brand.name} width={brand.width} height={brand.height} />
            </span>;
          })}
        </div>
      </div>
    </div>
  </section>;
}

export function AtelixHeaderHeroBrand({ content = defaultHeaderHeroBrandContent, includeSkipLink = true }: HeaderHeroBrandProps) {
  return <div className="atelix-header-hero-brand">
    {includeSkipLink && <SkipLink>{content.skipLinkLabel}</SkipLink>}
    <AtelixHeader content={content.header} />
    <main id="main-content" className="atelix-header-hero-brand-main">
      <AtelixHero content={content.hero} />
      <AtelixBrandRail content={content.brandRail} />
    </main>
  </div>;
}
