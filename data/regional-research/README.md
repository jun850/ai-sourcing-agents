# Regional supplier research

Target: 10,000 unique companies across Indonesia, Vietnam, Malaysia, and Thailand, covering the categories represented by the existing normalized supplier cards.

The queue allocates 50 research targets per country/category combination. Records are deduplicated globally by canonical company identity and remain in tiered evidence states until review.

The reviewed input for the normalizer is `raw_suppliers.cleaned.jsonl`. The original crawler output remains in `raw_suppliers.jsonl` for audit only and must not be imported. Each reviewed line must contain a supplier object plus at least one HTTPS source URL. Blank facts are allowed; invented facts are not.

The reviewed import currently contains five explicitly allowlisted fashion and textile companies. Cosmetics, food, pharmaceutical and unrelated packaging suppliers, search-result titles, directory pages, generic articles, wrong-country matches, and the Indonesia power-tools listing remain audit-only and are not converted into importable supplier identities.
