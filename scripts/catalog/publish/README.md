# Catalog batch publisher

This directory contains the production publication boundary for catalog crawl
artifacts. It accepts immutable batches of 1–50 suppliers or products. Running
the publisher without `--apply` performs local validation only.

```sh
node scripts/catalog/publish/build-manifest.js --input batch-input.json --output batch-manifest.json --private-output data/catalog-runs/RUN_ID/batch-private.json
node scripts/catalog/publish/publisher.js --manifest batch-manifest.json --private-input data/catalog-runs/RUN_ID/batch-private.json
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/catalog/publish/publisher.js --manifest batch-manifest.json --private-input data/catalog-runs/RUN_ID/batch-private.json --apply
```

Add `--delete-local-after-verify` only to the apply command to remove media after
upload, public byte/hash checks, database publication, production read-back, and
the live-verification RPC all succeed. Supplier emails belong only in
`payload.private_contacts`; the public `payload.supplier` object rejects every
email-named field. Public Contact Supplier behavior is intentionally outside the
publisher and must remain routed to `info@arcanawangsa.com` by the frontend.

The commit-safe manifest contains final-price previews but no supplier emails or
source costs. Those values are written to the separate mode-0600 private sidecar,
whose per-entity SHA-256 is pinned by the public manifest. Never commit the
private sidecar. The tools enforce that private sidecars stay under the
gitignored `data/catalog-runs/` tree.

Production apply also requires the manifest `git_commit_sha` to equal the local
HEAD and `ATELIX_DEPLOYED_GIT_SHA`. Generate the final batch only after the
supporting commit is deployed; this prevents catalog rows from going live ahead
of the code that renders and verifies them.

The manifest builder uses a canonical JSON representation to derive the batch
UUID, idempotency key, entity hashes, and manifest SHA-256. It refuses to
overwrite an existing output file.

## Prepare the ApparelX OEM supplier batch

The preparer consumes the normalized public/private OEM artifacts, optionally
merges translations, validates every source and media URL, and creates batches
of at most 50 without contacting Supabase:

```sh
node scripts/catalog/publish/prepare-oem-batches.js --dry-run
node scripts/catalog/publish/prepare-oem-batches.js --build \
  --run-dir data/catalog-runs/apparelx-oem-20260814 \
  --media-cache data/apparel-x-oem \
  --translations data/catalog-runs/apparelx-oem-20260814/translations.json \
  --supabase-url https://bobwfxvxzjovpgmmqsew.supabase.co \
  --git-commit-sha "$(git rev-parse HEAD)"
```

Optional translations can be passed with `--translations FILE`. Supported
documents are an array, `{ "translations": [...] }`, `{ "suppliers": [...] }`,
or an object keyed by supplier ID. Translation rows may use direct `{id,en,ja,zh}`
fields or a nested `locales` object. Localized content is stored in
`supplier.copy_i18n`; an English translated name becomes the primary catalog
name, otherwise the source Japanese name remains the fallback.

Build mode uses cached crawl media when present and downloads a missing object
only from exact HTTPS host `www.apparel-x.com`, including redirect validation.
Sharp auto-orients, strips metadata, converts to sRGB WebP, preserves alpha,
limits logos to 1024 px and other images to 2000 px, and retries quality from 84
to 78 when needed. Output uses content-addressed Storage paths. Generated files
remain under the gitignored run directory; no upload, database write, Git
operation, deployment, email use, or production publication occurs.
Use `--replace-generated` only when intentionally regenerating an existing
offline batch after its preparation contract changes; it still performs no
network upload or production operation.
