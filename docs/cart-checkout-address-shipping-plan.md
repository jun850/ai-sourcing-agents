# Cart, checkout, addresses, and country shipping

## Goal

Make Atelix's buyer purchase flow feel as clear and familiar as the supplied
Tokopedia references while keeping Atelix's own restrained B2B design system,
real payment model, and server-authoritative totals.

## Affected surfaces

- `/pages/cart.html`: group lines by supplier, clarify variants, quantity,
  removal, totals, and the checkout action.
- `/pages/checkout.html`: use saved addresses, support add/edit/select in
  accessible dialogs, show a configured shipping quote, group order lines by
  supplier, capture buyer notes, and place the order from one review surface.
- `/pages/brand-owner.html#address`: use the same saved-address list and editor
  as checkout for add, edit, default, and delete operations.
- `/intools/dashboard`: add a desktop-only Shipping view for one destination
  rate per country, including USD flat rate, service label, ETA range, and
  active/inactive state.
- Intools product editor: replace the gallery textarea with an ordered image
  list. The first item is explicitly the main image and drives catalog cards,
  the PDP hero, and the first PDP thumbnail.

## Shared contracts

- `js/address-book.js` owns address formatting, list rendering, accessible
  selection/edit dialogs, validation, loading, error, and focus behavior.
- `js/api.js` exposes country-rate listing/quoting plus Intools shipping CRUD.
- A new migration stores country rates and snapshots the selected service,
  charge, and ETA onto each order. `place_order` resolves shipping server-side;
  the client never supplies a price.
- The same migration keeps `products.images` ordered and synchronizes
  `products.img` to the first item whenever Intools saves a product.

## Compatibility and non-goals

- Keep the current service fee, product MOQ enforcement, product-option cart
  keys, quote-only product boundary, post-order verified payment instructions,
  and existing order status flow.
- Do not add promotions, coupons, fake payment providers, geocoding, maps, or
  pinpoint controls.
- Existing free-text address countries remain readable. Checkout matches them
  case-insensitively to configured country code or name.
- Intools stays desktop-only and uses its existing navigation, table, drawer,
  optimistic-update, audit, and authorization patterns.

## Acceptance gates

- WCAG target: repository-defined WCAG 2.1 AAA for text contrast, with WCAG 2.2
  AA interaction semantics as the minimum.
- Cart and checkout reflow at 390 px without horizontal overflow; primary
  actions remain reachable and controls use 44 px touch targets where practical.
- Address dialogs trap focus, close with Escape, restore focus, expose names and
  errors, and require no pointer-only interaction.
- An unsupported destination disables order placement with a clear recovery
  path. An active rate updates the visible shipping and final total.
- Static QA, syntax checks, Intools role/access QA, desktop/mobile browser
  regression, and visual checks pass before handoff.
