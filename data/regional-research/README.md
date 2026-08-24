# Regional supplier research

Target: 10,000 unique companies across Indonesia, Vietnam, Malaysia, and Thailand, covering the categories represented by the existing normalized supplier cards.

The queue allocates 50 research targets per country/category combination. Records are deduplicated globally by canonical company identity and remain in tiered evidence states until review.

Input for the normalizer: raw_suppliers.jsonl. Each line must contain a supplier object plus at least one https source URL. Blank facts are allowed; invented facts are not.
