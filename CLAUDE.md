# ARCANA

## Design Context

Before any UI work, read **PRODUCT.md** (strategy) and **DESIGN.md** (visual system) at the project root. The `.impeccable/design.json` sidecar carries tonal ramps, shadow/motion tokens, and drop-in component snippets.

- **Register:** product · **Platform:** web
- **What it is:** Tokopedia-for-fashion-sourcing — a two-sided B2B marketplace where apparel brand owners (primary, buy-side) source fabrics, trims, accessories, and OEM packages from verified factories (sell-side) and pay directly. 7 pages: home, category, product, supplier profile, supplier dashboard, OEM cart, brand-owner profile.
- **Personality:** modern, minimal, precise — emotion is *calm control*.
- **Core principles:** trust is the interface · specs before persuasion · seamless path to purchase · calm under complexity · serve both sides without confusing either.
- **Visual system ("The Material Archive"):** forest-green `#2e4a3a` (buyer/trust) + brass `#b0863c` (money action/seller) on warm off-white `#f7f6f3`; Playfair Display titles + Inter UI; hairline borders, flat-by-default, macro fabric photography as hero.
- **Two-Signal Rule:** green = buyer/trust, brass = money action/seller. Blue/red are status-only, never CTAs.
- **Anti-references:** not a cheap bulk-wholesale portal, not a generic SaaS dashboard, not trend-chasing consumer fashion.
- **Accessibility:** target WCAG 2.1 AAA (≥7:1 body) — audit `muted` #6e6e68 and `brass` on white; darken toward ink where they miss.

Stack: vanilla HTML/CSS/JS. Shared header/footer + interactivity injected by `js/components.js`; tokens in `css/styles.css`, layouts in `css/pages.css`. Assets in `assets/` (Diffui-generated, not hotlinked).
