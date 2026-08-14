# ApparelX OEM supplier normalization

This offline stage reads the existing ApparelX OEM crawl and creates separate
public and private manifests. It performs no network requests and no production
writes.

Dry-run and print the report:

```sh
node scripts/catalog/oem/cli.js --dry-run --report
```

Write a new set of manifests to an empty directory:

```sh
node scripts/catalog/oem/cli.js --output-dir /path/to/new-output --report
```

The writer uses exclusive file creation and will not overwrite an existing
manifest. The public manifest contains the central `info@arcanawangsa.com`
Contact supplier destination, never source supplier email addresses. Source
contacts, classification evidence, source URLs, and media download paths exist
only in `private-supplier-sources.json`.

Empty factual values remain JSON `null`. A supplier with contradictory evidence
or no matching current L3 is marked `review_required` and is not eligible for
automatic publication.
