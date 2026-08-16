# Source-free fabric catalogue rollout

## Scope and non-negotiable gates

The local fabric archive is an input, not a production payload. Public records,
Storage paths, search objects, APIs, logs committed to Git, and rendered pages
must contain no provider identity, provider URL or ID, source price or cost,
source contact, or provenance. Videos are excluded.

Public prices use the existing `catalog_prices` contract. When a valid USD input
exists locally, apply the existing 20% minimum markup and rounding. Otherwise,
assign a deterministic Atelix band from material, construction, finish, and GSM.
Estimated JPY prices are rounded to ¥100 and constrained to ¥900–¥6,000, with
premium wool and luxury fibres above basic synthetics. Every product receives
JPY and USD catalogue rows tied to the named compatibility FX snapshot.

Release eligibility requires exactly 4,736 active, public, image-backed fabric
products. Discontinued, scheduled-for-discontinuation, image-less, unnamed,
maker-less, or conflicting records are excluded and replaced with additional
crawl candidates. Every active product and verified supplier requires complete
English, Japanese, and Chinese copy. English is the default and fallback.

## Data sequence

1. Normalize maker names and match an existing supplier by exact normalized
   identity. Create one verified `fabric_mill` only when no exact supplier
   exists. Reuse the existing VANCET factory and map `yamamoto-excy` to the
   existing `Yamamoto Co., Ltd.` record; never create duplicate mills. A
   supplier stays out of public lists until it owns an active product.
2. Assign a neutral `FAB-XXXXXXXXXX` Atelix SKU and construction-based L3.
3. Select up to three still images for each release. The first is a flat swatch
   or sample card. Generate and store 640 px and 1600 px WebP variants, strip
   metadata, use sRGB, and deduplicate by SHA-256 under
   `products/{uuid}/{hash}-{size}.webp`. Do not enable paid on-the-fly image
   transformations. Estimate first; raw downloads and crawl evidence are never
   uploaded to Storage.
4. Retain only product-relevant care, colour, lot, finish, test, print, dye, or
   application FAQ. Reject platform support, payment, refund, fee, stock,
   shipping, unrelated-maker, trademark, and unsupported claims. Store all FAQ
   copy in three languages.
5. Publish suppliers first, then products in immutable batches of at most 50.
   Build each manifest against the production Supabase URL so its signed hash
   covers the exact public media URLs written to the database.
   Each product batch follows Storage upload and hash verification, one database
   transaction, search sync, public API read-back, PDP smoke, cart/checkout
   smoke, and batch receipt. Stop on the first failed batch. After all batches,
   run the paginated Algolia public reindex and verify every eligible product
   and verified factory is present before declaring search complete.

## Touch points

- Buyer catalogue uses paginated public reads, construction L3 filters, ordered
  media, exact supplier links, and the localized `Important to read` PDP FAQ.
- Existing homepage supplier lists, factories directory, and supplier pages
  surface new suppliers; no new homepage content block is introduced.
- Intools and supplier dashboard share the localized copy, ordered four-image
  gallery, image-role, and scoped FAQ contracts. Supplier ownership cannot be
  reassigned from the supplier dashboard.
- Cart and checkout continue to resolve the first ordered image and server-side
  price/MOQ. Order insertion rejects inactive, private, archived, ownership-
  changed, unverified-supplier, or archived-supplier products atomically.

## Production evidence and rollback

Record source tests, Git revision, applied migration, deployed revision, Storage
hashes, database batch IDs, search counts, public API counts, visual/browser QA,
keyboard checks, and checkout/order read-back separately. A failing batch is
rolled back before the next batch starts. Do not describe a code commit or a
deployed migration as proof that 4,736 products are live.

Build only after the target Git revision and production project are known:

```sh
npm run catalog:fabrics:prepare -- --build \
  --translations /absolute/path/to/translations.json \
  --factories /absolute/path/to/factories.json \
  --git-commit-sha DEPLOYED_40_CHARACTER_SHA \
  --supabase-url https://PROJECT_REF.supabase.co \
  --max-images 3 \
  --storage-budget-mb APPROVED_BUDGET_MB
```

Before build, compare the storage budget with a deterministic sample that does
not persist optimized files:

```sh
npm run catalog:fabrics:storage-estimate -- --sample-size 100 --max-images 3
```

## Local retention

After a production receipt proves exactly 4,736 active products plus live,
privacy, translation, price, media, supplier, search, PDP, cart, and checkout
gates, remove the local product archive, raw downloads, databases, CSV exports,
logs, generated translations, and optimized media. Retain the reusable scripts
and this tracked rollout guide only; never commit source archives or generated
catalogue data.
