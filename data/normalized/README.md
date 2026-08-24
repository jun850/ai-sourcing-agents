# Normalized supplier CSVs

Generated 2026-08-24 from the four supplied China Insider Sourcing PDFs and a targeted public-website check.

- suppliers_factories_import.csv: core public.factories fields plus explicit city/name_local/provenance columns; map city to public.factories.loc during import. All rows are pending and must pass admin review before publication.
- supplier_contacts_channels.csv: separate public contact/channel enrichment because public.factories has no email, shop, or source URL columns.
- supplier_source_evidence.csv: provenance per supplier.

There are 53 named supplier cards. Cluster-only recommendations are excluded. Blank contact/shop values mean no value was asserted in the checked source set; do not fill them from unverified directories. The PDFs' OFFICIAL/REPORTED labels describe the PDF authors' evidence for customer relationships, not Atelix verification.
