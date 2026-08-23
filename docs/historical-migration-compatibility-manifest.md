# Historical migration compatibility manifest

Generated during Phase 1 on 2026-08-23. The current Atelix Vite surface is broker-led sourcing, but the linked Supabase history includes prior marketplace, catalogue, cart, seller, Athelia, and business-email terms. Applied migration files are immutable and were deliberately not edited in this phase.

## Scope

- Preservation target: every file in `supabase/migrations/`, plus the existing Supabase functions, configuration, `api/visitor-country.js`, and historical order/payment schema.
- Search: `rg -i -l 'athelia|catalog|cart|wishlist|seller|business.?email|factory.?directory|product' supabase/migrations`.
- Result: 58 files. Per-term file counts are Athelia 5, catalog 27, cart 13, wishlist 2, seller 14, business-email 2, factory-directory 0, product 36; files may match more than one term.
- Action: retain unchanged through Phase 7B. Phase 7C may remove obsolete schema only after a fresh-snapshot rehearsal, payment-history verification, and an explicit post-cutover baseline gate.

## Matched immutable migrations

- `0001_enums_and_schema.sql`
- `0003_rls_policies.sql`
- `0004_rpcs.sql`
- `0005_seed.sql`
- `0007_optimize_rls_and_indexes.sql`
- `0008_profile_uploads.sql`
- `0009_addresses_and_chat.sql`
- `0014_expand_factory_type_categories.sql`
- `0015_auto_provision_supplier_factory.sql`
- `0016_saved_items_qty.sql`
- `0018_admin_supplier_audit.sql`
- `20260801112613_remote_history_baseline.sql`
- `20260811102500_add_material_supplier_types.sql`
- `20260811103000_add_japanese_material_catalog.sql`
- `20260811113000_add_unique_factory_images.sql`
- `20260811133000_shared_athelia_usage_limit.sql`
- `20260812154000_require_business_email.sql`
- `20260812170000_private_atelix_sourcing_catalog.sql`
- `20260812183000_product_information_fields.sql`
- `20260812184500_seed_product_information_copy.sql`
- `20260812193000_structured_product_specifications.sql`
- `20260812201000_algolia_search_outbox.sql`
- `20260812203000_algolia_factory_delete_payload.sql`
- `20260812214500_standardize_product_applications_and_taxonomy.sql`
- `20260813150000_disable_placeholder_bank_account.sql`
- `20260813153000_enforce_order_moq.sql`
- `20260813170000_atelix_intools.sql`
- `20260814110000_product_options_and_fabric_catalog.sql`
- `20260814123000_catalog_import_pipeline.sql`
- `20260814195000_catalog_email_validator_fix.sql`
- `20260814203000_standardize_supplier_locations.sql`
- `20260814204500_remove_cottontime_supplier.sql`
- `20260814210000_remove_south_asia_suppliers.sql`
- `20260814220000_country_shipping_and_product_media.sql`
- `20260814223000_item_level_order_notes.sql`
- `20260815100000_source_free_fabric_catalog.sql`
- `20260815203500_reactivate_retried_catalog_suppliers.sql`
- `20260815214500_reactivate_retried_catalog_products.sql`
- `20260816090000_public_factory_directory_without_products.sql`
- `20260816100000_scrub_supplier_directory_source_references.sql`
- `20260816113000_transformed_catalog_thumbnails.sql`
- `20260816114000_public_verified_fabric_mills.sql`
- `20260816120000_fabric_swatch_cart_and_specifications.sql`
- `20260816130001_remove_business_email_signup_requirement.sql`
- `20260816140000_intools_transactions.sql`
- `20260816170000_stripe_payments.sql`
- `20260817100000_fabric_material_taxonomy.sql`
- `20260818090000_agentpoc_usage.sql`
- `20260818103000_hosted_stripe_checkout_and_address_snapshot.sql`
- `20260818140000_drop_agentpoc_usage.sql`
- `20260819090000_widen_factories_verified_region_check_europe.sql`
- `20260820100000_chat_rpc_and_realtime.sql`
- `20260820120000_chat_unread_tracking.sql`
- `20260820130000_notification_center.sql`
- `20260820150000_athelia_rfq_workspace.sql`
- `20260820170000_athelia_thread_turn_metadata.sql`
- `20260820180000_secure_advisor_flagged_tables.sql`
- `20260820181000_restore_catalog_construction_reads.sql`
