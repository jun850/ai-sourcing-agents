# SE Asia OEM/ODM supplier research — Sep 2026

Indonesia / Thailand / Malaysia. 30 garment + 30 skincare/beauty makers, researched
from company sites and industry directories. Nothing here is contacted or verified —
every row is a lead to qualify. `verify_state` is `unverified` on every row.

## Files

| File | Rows | Shape | Load path |
|---|---|---|---|
| `import-garment-suppliers.json` | 30 | `intools_supplier_import_dry_run` rows | Paste into intools → Suppliers → **Review supplier import**, or `npm run suppliers:import` |
| `import-skincare-suppliers.json` | 30 | same | same |
| `atelix-sea-garment-suppliers.csv` | 30 | importer CSV columns | `npm run suppliers:import -- <path>.csv` |
| `atelix-sea-skincare-oem-research.csv` | 30 | human-readable (not importer columns) | reference only |

Both JSON files pass the dry-run normalize with 0 rejections.

## Skincare category

Skincare/beauty makers use `type: "material_innovator"`. That is the existing
`factory_type` value the routing engine already maps `beauty_personal_care` demand onto
(`supabase/functions/_shared/supplier-routing.ts`, `20260901130000_country_routing_recommendations.sql`),
so no migration is needed. The intools supplier type picker now lists all seven
`factory_type` values and labels `material_innovator` as **"Skincare / beauty (material innovator)"**
(`src/intools-suppliers.tsx`, `src/intools.tsx`).

Note: `material_innovator` is a dual-use bucket — it also holds textile material innovators
(e.g. Toray). If you want skincare fully separated from textile innovators, that needs a new
`factory_type` enum value (additive migration) plus a routing-map update; say the word.

## How to load via the admin UI

**Works today (no deploy needed) — the "Review import" JSON box:**

1. intools → Suppliers → **Review import**.
2. Paste the entire contents of `import-garment-suppliers.json` (or the skincare file).
3. **Run dry-run** — every row should come back `accepted`.
4. Tick the rows, **Promote reviewed**. Promoted records land as `pending` / `review`;
   not public until an admin approves + verifies each one.

**Do NOT use the "Bulk upload suppliers" file picker for these files** unless the
frontend fix below is deployed — the old code stamped every row `source_system:
"bulk_upload"` (an untrusted value the DB rejects) and, for JSON, read the name from
the wrong nesting level, so every row was rejected ("0 imported").

### Frontend fix (needs deploy)

`src/intools.tsx` `UploadModal` now:
- parses CSV properly (quoted fields / embedded commas),
- accepts the nested `{ source_system, source_record_id, source_url, supplier: {...} }`
  JSON shape and maps every supplier field,
- derives a valid `source_system` (`regional_web` when there's an https `source_url`,
  else `manual`) instead of the rejected `bulk_upload`,
- surfaces the rejection reason instead of a silent "0 imported".

After deploy, the "Bulk upload suppliers" picker also accepts both the JSON files and
`atelix-sea-garment-suppliers.csv` directly.

## Field notes

- MOQ / lead time: only filled where the factory publishes a figure. `null` = not published;
  use the site's contact form. Not estimated.
- Contact email / phone: in the `bio` text (the import RPC has no dedicated contact column;
  structured contacts go through the separate contacts step or manual entry later).
- `tags` carry supported items (t-shirt, canvas-tote-bags, serum, sunscreen, …).
- Bag/tote specialists are typed `accessories_supplier`; apparel makers `garment_manufacturer`.
- Chinese middleman sites that rank for these searches were excluded — every row is a
  factory in ID / TH / MY.

## Regeneration

`to-json.mjs` (in the session scratchpad) converts the two CSVs to the JSON import shape.
