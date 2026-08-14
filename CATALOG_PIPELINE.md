# Atelix catalog ingestion

This pipeline updates the existing Atelix catalog, supplier directory, category
filters/counts, search index, and homepage supplier list. It does not create new
storefront sections. The default source in this implementation is exactly
`https://www.apparel-x.com`; regional hosts are never emitted or crawled.

## Default workflow

```text
source adapter -> crawl-only evidence + SQLite ledger -> offline normalization
  -> source-backed Codex translations -> image optimization -> immutable batch (<=50)
  -> Git/release gate -> Supabase Storage + transactional catalog publish
  -> Algolia outbox -> existing storefront surfaces -> live verification
  -> delete verified local optimized images
```

An explicit **crawl only** request stops after the offline evidence and canonical
records are written. It never writes Supabase, Storage, Algolia, Git, Vercel, or
the live storefront.

## Storage and privacy boundaries

- Raw HTML/JSON, the resumable SQLite ledger, source media, private contacts,
  source prices, and temporary optimized images live under gitignored `data/`
  while a batch is being prepared and verified.
- Public manifests may contain normalized catalog values, provenance hashes,
  public Storage URLs, and the central CTA `info@arcanawangsa.com`.
- Supplier source emails are `documented_only`, with outreach and public
  visibility disabled. They are allowed only in mode-0600 private sidecars and
  the RLS-protected `supplier_source_contacts` table.
- Missing facts remain `null`. Storefront decision points render localized
  Contact supplier copy; Codex may translate or condense source-backed text but
  may not invent facts, specifications, prices, certifications, MOQ, lead time,
  or capacity.

## Pricing and images

- Source price is multiplied by 1.20, then rounded upward: USD and CNY to 0.10,
  JPY to 100. Locked examples: USD 5.31 -> 6.40; JPY 1008 -> 1300; JPY 1120 ->
  1400. Missing source prices stay quote-only.
- Sharp auto-orients, strips metadata, converts to sRGB WebP, preserves alpha,
  limits logos to 1024 px and other media to 2000 px, and targets high-quality
  files before upload. Content hashes determine Storage paths and deduplicate
  repeat media.
- Local source and optimized image files are deleted only after upload
  byte/hash/type checks,
  transactional publication, production read-back, live-image checks, and the
  batch `live_verified` marker all succeed. URLs, hashes, dimensions, and raw
  page/API evidence remain offline so the crawl is still auditable.

## Taxonomy, batching, and archival

- Each supplier has exactly one primary L2/L3 membership and may have multiple
  evidence-backed secondary memberships. The first OEM release uses
  `oem/clothing`, `oem/accessories`, `oem/socks`, plus material categories such
  as `trims/simple-trims` and `yarns/viscose` where the source supports them.
- Publication batches contain at most 50 suppliers or products and use stable
  hashes/idempotency keys, so a publisher can release one batch while another
  worker continues crawling.
- A source entity is eligible for archival only after a complete discovery run
  closes and the entity is absent from three consecutive successful complete
  runs. Partial, failed, or batch-limited crawls never increment that counter.

## Release gate after every batch

1. Validate schema, canonical domain, provenance, taxonomy, missing fields,
   price calculations, translations, and private/public separation.
2. Decode every optimized image and verify dimensions, MIME, size, and hash.
3. Run focused crawler/normalizer/publisher tests, repository static QA, syntax,
   migration dry-run/lint where available, and `git diff --check`.
4. Commit and push only public code/migrations/manifests; scan staged content for
   source contacts and costs.
5. Apply migrations, upload media, publish transactionally, process Algolia,
   deploy the storefront, and verify production rows, counts, category routes,
   localized copy, image HTTP responses, and broken-image fallbacks.
6. Confirm no worker is stuck and retain retryable non-image evidence. Delete
   only local source/optimized media belonging to a fully live-verified batch.

## Commands

```sh
npm run catalog:crawl-only -- --scope fabrics --max-items 50 \
  --seed-url 'https://www.apparel-x.com/search.php?category=FABRIC'
npm run catalog:oem-normalize -- --dry-run --report
npm run catalog:prepare-oem -- --dry-run
npm run catalog:publish -- --manifest MANIFEST --private-input PRIVATE_SIDECAR
```

Omit `--apply` from the publisher for validation. Production use requires the
Supabase URL and service-role key in environment variables, a manifest generated
with `--git-commit-sha`, and `ATELIX_DEPLOYED_GIT_SHA` matching that commit. It
must follow the release gate above.
