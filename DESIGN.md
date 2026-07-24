---
name: ARCANA
description: The Material Archive — a calm, editorial B2B marketplace for fabrics and OEM sourcing.
colors:
  green: "#2e4a3a"
  green-deep: "#25402f"
  green-wash: "#eef2ee"
  brass: "#96702b"
  brass-deep: "#785a20"
  brass-wash: "#f6eede"
  ink: "#1c1c1a"
  muted: "#54534e"
  faint: "#6e6e68"
  bg: "#f7f6f3"
  panel: "#fbfaf8"
  card: "#ffffff"
  line: "#e7e3db"
  line-soft: "#efece5"
  info-blue: "#3a5a8c"
  danger: "#c0492f"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(2rem, 4vw, 2.75rem)"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 5vw, 3.25rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  sm: "10px"
  md: "16px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "40px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.card}"
    rounded: "{rounded.sm}"
    padding: "13px 22px"
  button-primary-hover:
    backgroundColor: "{colors.green-deep}"
    textColor: "{colors.card}"
  button-cta:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.card}"
    rounded: "{rounded.sm}"
    padding: "13px 22px"
  button-cta-hover:
    backgroundColor: "{colors.brass-deep}"
    textColor: "{colors.card}"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "13px 22px"
  chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "9px 16px"
  chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    rounded: "{rounded.pill}"
    padding: "9px 16px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "9px 11px"
---

# Design System: ARCANA

## 1. Overview

**Creative North Star: "The Material Archive"**

ARCANA reads like a calm editorial catalog of textiles, not a transactional wholesale portal. Macro fabric photography does the persuading; the chrome around it stays quiet. A forest-green and brass palette on a warm off-white ground gives the system the composure of a well-kept reference collection — every fabric card, supplier profile, and spec table feels curated and auditable rather than sold. The register is product: design serves the sourcing job, and the dominant feeling is calm control over a complex, high-stakes procurement decision.

The system is deliberately restrained. Serif display type (Playfair) carries page and product titles with editorial weight; a neutral sans (Inter) does all the functional work. Surfaces are white panels on a soft ground, separated by hairline borders rather than heavy shadow. Space is generous; density is earned only where comparison demands it (spec grids, filter rows, cart tables). Color is used as signal — green for the brand-owner/buyer path and trust, brass for the primary money action and factory/seller accents — never as decoration.

What this system explicitly rejects: the cluttered, red-bannered density of a cheap bulk-wholesale portal; the purple/blue gradients, glassmorphism, and identical stat-card grids of a generic SaaS dashboard; and the hype-drop, influencer energy of trend-chasing consumer fashion. ARCANA is a professional sourcing tool with editorial craft.

**Key Characteristics:**
- Macro material photography as the primary visual, framed in quiet chrome
- Serif display + neutral sans, split cleanly by role (editorial vs functional)
- Warm off-white ground, white panels, hairline borders; shadow appears only on hover
- Two-signal color system: green (buyer/trust) and brass (money action/seller)
- Generous space; density only where comparison requires it

## 2. Colors

A composed, low-chroma palette: two saturated brand signals over warm neutrals, with color reserved for meaning.

### Primary
- **Forest Green** (`#2e4a3a`): The brand-owner/buyer voice and the trust signal. Primary buttons ("Log in as Brand Owner", "Contact Supplier"), verification badges, OEM-available markers, category accents. Green means "safe to commit."
- **Deep Forest** (`#25402f`): Hover/pressed state for green surfaces only.
- **Green Wash** (`#eef2ee`): Soft green-tinted fill behind verified/OEM badges, avatar rings, and icon chips.

### Secondary
- **Brass** (`#96702b`): The money action and the factory/seller accent. Primary CTAs that move toward purchase (Request for Quote, Proceed to Checkout), factory-path buttons, selected-package borders. Deepened from the original `#b0863c` so white CTA text clears AA large-text contrast. Brass appears where value or a decision is at stake.
- **Deep Brass** (`#785a20`): Hover/pressed for brass surfaces; also the accessible link-text shade on light backgrounds (~6:1 on white).
- **Brass Wash** (`#f6eede`): Total box background, factory hero tint, "Built for Your Brand" badge.

### Tertiary
- **Info Blue** (`#3a5a8c`): Reserved, non-brand accent for neutral status only — the "Premium" package tag, dyeing capability icon, highlighted action card. Never a CTA.
- **Danger** (`#c0492f`): Verification-pending alerts, required-field markers, error status. Alerts only.

### Neutral
- **Ink** (`#1c1c1a`): Primary text, the "Sign up" pill, active filter chips. The near-black workhorse.
- **Muted** (`#54534e`): Secondary text, meta, captions, spec labels (~7:1 on white — AAA).
- **Faint** (`#6e6e68`): Placeholder text, chevrons, de-emphasized icons (~4.6:1 — AA).
- **Ground** (`#f7f6f3`): The warm off-white body background.
- **Panel** (`#fbfaf8`): Slightly lifted neutral for hero and trust strips.
- **Card** (`#ffffff`): The surface fabric — every panel, card, and input.
- **Line** (`#e7e3db`) / **Line Soft** (`#efece5`): Hairline borders and internal dividers.

### Named Rules
**The Two-Signal Rule.** Green and brass each mean one thing. Green = buyer path + trust. Brass = money action + seller. Never swap them, never use either decoratively, and never introduce a third brand color; blue and red are status-only and never act as CTAs.

**The Hairline Rule.** Structure is drawn with 1px `line` borders and tonal panels, not shadow. Color separates meaning; borders separate space.

## 3. Typography

**Display Font:** Playfair Display (with Georgia, serif fallback)
**Body Font:** Inter (with system-ui, sans-serif fallback)

**Character:** A high-contrast editorial serif paired with a neutral, highly legible grotesque. The pairing is split strictly by role — Playfair signals "this is a titled thing worth reading" (page titles, product names, panel headings); Inter does every functional job (nav, specs, labels, data). The contrast axis (serif vs sans) keeps them from competing.

### Hierarchy
- **Display** (Playfair 600, clamp 2–2.75rem, 1.12): Hero lead, product/page titles ("Cotton Twill", "Order Summary"), panel section headings. Editorial, calm.
- **Headline** (Inter 800, clamp 2.5–3.25rem, 1.05): The one heavy grotesque moment — big category titles ("Fabric Categories"). Used sparingly for wayfinding weight.
- **Title** (Playfair 600, 1.5rem, 1.2): Sub-section headings inside panels.
- **Body** (Inter 400, 0.9375rem/15px, 1.5): All running text; cap prose at 65–75ch.
- **Label** (Inter 600, 0.75rem): Meta, spec labels, badges, chip text. Not tracked/uppercased by default.

### Named Rules
**The Split-Role Rule.** Playfair is for titled, editorial moments only; Inter carries all UI and data. A fabric spec, a price, a nav item, a button — always Inter. Never set functional UI in the serif.

**The No-Eyebrow Rule.** No tiny uppercase tracked kickers above sections, and no numbered section markers (01 / 02). Section rhythm comes from serif headings and space, not scaffold labels.

## 4. Elevation

Refined and restrained. The system is flat at rest: white panels sit on the warm ground, separated by hairline borders and tonal contrast, not shadow. Depth is a response to state, not a default coat.

### Shadow Vocabulary
- **Panel rest** (`box-shadow: 0 1px 3px rgba(28,28,26,0.06)`): The barely-there lift on cards and panels; reads as a crisp edge, not a float.
- **Card hover** (`box-shadow: 0 1px 2px rgba(28,28,26,0.04), 0 8px 24px rgba(28,28,26,0.05)`): Product/fabric cards lift on hover (with a −2px translateY) to signal interactivity.
- **Selected package** (`box-shadow: 0 6px 20px rgba(176,134,60,0.13)`): The one tinted shadow — a soft brass glow on the chosen OEM package, paired with a 2px brass border.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadow appears only as a response to state — hover on a card, selection on a package. A resting screen should read as paper and hairlines, not a stack of floating cards. If it looks like it's hovering before you touch it, the shadow is wrong.

## 5. Components

### Buttons
- **Shape:** Gently rounded (10px radius); pill (999px) only for the header "Sign up" and search field.
- **Primary (green):** `green` fill, white text, 13×22px padding — the buyer path and confirming actions.
- **CTA (brass):** `brass` fill, white text — actions that move toward purchase (Request for Quote, Proceed to Checkout). One brass CTA per view; it is the money action.
- **Outline:** White fill, 1px `line` border, ink text — secondary actions (Request Sample, Save, Share). Hover shifts border toward `muted`.
- **Hover / Focus:** Green→Deep Forest, Brass→Deep Brass, 0.15s transition. Focus must show a visible ring (AAA).

### Chips
- **Style:** White fill, 1px `line` border, pill shape, ink text — filter and sort controls.
- **State:** Selected = `ink` fill, white text (with an inline × to clear). An OEM-availability chip carries a small green dot. Filter chips and dropdown chips share the shape; dropdowns add a chevron.

### Cards / Containers
- **Corner Style:** 16px (`md`) for panels, 14px for product/fabric cards.
- **Background:** White (`card`) on the warm ground.
- **Shadow Strategy:** Flat at rest; hover lift per Elevation. Never nest a card inside a card.
- **Border:** 1px `line`.
- **Internal Padding:** 16–30px depending on density (product cards 16px; hero/profile panels 26–30px).

### Inputs / Fields
- **Style:** White fill, 1px `line` border, 10px radius (search field is a pill).
- **Focus:** Border shifts to `muted` / brand; must include a visible focus ring for AAA keyboard use.
- **Error:** `danger` text + marker (e.g. "Required" under an unfilled upload).

### Navigation
- **Style:** Sticky white header, 1px bottom border. Two variants sharing one system: (A) full marketplace nav with "Marketplace | Fabrics · Accessories · Trims · OEM Services · Factories · Resources" for buyer/home/profile surfaces; (B) condensed "Categories · OEM Services · Suppliers · Resources" with dual "For Brand Owners / For Sellers" logins for listing/product/cart surfaces.
- **Type:** Inter, ~14px, medium. Active/brand item in brass.
- **States:** Hover shifts links toward green. Search field flexes; actions never overlap it (min-width guard).

### Signature Component — Fabric Product Card
The system's hero primitive: square macro-fabric image with a top-left status badge (OEM / Non-OEM), a top-right favorite heart, serif or bold title, spec pills (composition, GSM), and a divided footer showing MOQ + lead time or seller name + location with a verified mark. This card is the marketplace; keep its photography sharp and its chrome quiet.

## 6. Do's and Don'ts

### Do:
- **Do** lead with macro material photography; the fabric is the hero, the chrome is quiet.
- **Do** keep the Two-Signal Rule: green for buyer/trust, brass for the money action, one brass CTA per view.
- **Do** draw structure with 1px `line` borders and tonal panels (the Hairline Rule); reserve shadow for hover/selection state.
- **Do** set titles in Playfair and everything functional in Inter (the Split-Role Rule).
- **Do** surface trust at the decision point — verification badges, specs, secure-payment signals are load-bearing UI.
- **Do** keep secondary text on `muted` (#54534e ≈ 7:1, AAA) and reserve `faint` (#6e6e68 ≈ 4.6:1, AA) for placeholders and decorative icons only. Brass small text on white still misses 4.5:1 — use it as a fill/border, not as body copy.

### Don't:
- **Don't** build a cheap bulk-wholesale portal — no cluttered Alibaba/DHgate density, loud red banners, or low-trust visual noise.
- **Don't** build a generic SaaS dashboard — no purple/blue gradients, no glassmorphism, no identical stat-card grids, no hero-metric template.
- **Don't** chase consumer-fashion trends — no hype-drop streetwear energy, aggressive marketing, or influencer aesthetics; this is a sourcing tool.
- **Don't** use gradient text, `background-clip: text`, or side-stripe (`border-left` > 1px) accents.
- **Don't** nest cards inside cards, or let resting surfaces float on shadow.
- **Don't** add tiny uppercase tracked eyebrows or numbered section markers (01 / 02) as section scaffolding.
- **Don't** use brass or info-blue as body text on white; brass is for fills/links (as `brass-deep`), blue is status-only.
