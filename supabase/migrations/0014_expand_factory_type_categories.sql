-- ============================================================================
-- ARCANA — 0013 expand supplier categories
-- Rename oem_factory -> garment_manufacturer and add accessories_supplier /
-- yarn_supplier so factory_type lines up 1:1 with product_category
-- (fabrics/accessories/trims/yarns/oem).
-- ============================================================================

ALTER TYPE public.factory_type RENAME VALUE 'oem_factory' TO 'garment_manufacturer';
ALTER TYPE public.factory_type ADD VALUE IF NOT EXISTS 'accessories_supplier';
ALTER TYPE public.factory_type ADD VALUE IF NOT EXISTS 'yarn_supplier';
