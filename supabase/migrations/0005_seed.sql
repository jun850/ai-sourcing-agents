-- ============================================================================
-- ARCANA — 0005 catalog seed (idempotent)
-- Source of truth: js/data.js (ARCANA_PRODUCTS, ARCANA_FACTORIES).
--
-- FK integrity: every distinct product `seller` name gets a factory row, plus
-- the 3 directory-only factories that have no products. Products are FK'd to
-- factories by deterministic slug via subquery (never by hardcoded UUID).
--
-- Slug rule: lower(name) with runs of non-alphanumerics collapsed to a single
-- hyphen, trimmed. e.g. 'Shandong Linentex Co., Ltd.' -> 'shandong-linentex-co-ltd'.
--
-- Factory set (18 total):
--   * 8 rich directory factories from ARCANA_FACTORIES (F-GRN, F-LIN, F-IND,
--     F-MX, F-LZ, F-SYN, F-TXL, F-TKY) — includes the 3 orphans with no products
--     (Zhejiang Greenknit, Textilia Global Mills, Tokyo Senshoku).
--   * 10 synthesized factories for product-only sellers with no directory entry.
--     'Guangzhou Greenknit' is DISTINCT from directory 'Zhejiang Greenknit'.
-- Directory factory fields incorporate the JS profile-default enrichment
-- (sales/phone/web/founded/employees/area/port/bio) so the seed matches the app.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Factories — ON CONFLICT (slug) DO NOTHING
-- ---------------------------------------------------------------------------
INSERT INTO public.factories
  (slug, name, type, region, loc, verify_state, years, moq, lead, rating,
   orders_label, capacity, certs, tags, sales, phone, web, founded, employees,
   area, port, bio, img)
VALUES
-- ===== Directory factories (rich, from ARCANA_FACTORIES) =====
('zhejiang-greenknit-co-ltd', 'Zhejiang Greenknit Co.,Ltd.', 'fabric_mill', 'China', 'Shaoxing, Zhejiang', 'verified',
  20, '300 yd', '15–25 days', 4.9, '520+', '1.5M m/mo',
  ARRAY['ISO 9001','Oeko-Tex','GRS'], ARRAY['Woven','Knit','Yarn-dyed'],
  'Sales Team', '+86 138 0000 0000', 'www.fgrn.com', 2006, '200+', '20,000 m²', 'Ningbo Port 150 km',
  'A verified fabric mill in Shaoxing, Zhejiang with 20 years of experience supplying global apparel brands. Specialties: Woven, Knit, Yarn-dyed.', 'factory1'),

('shandong-linentex-co-ltd', 'Shandong Linentex Co., Ltd.', 'fabric_mill', 'China', 'Shandong', 'verified',
  15, '200 m', '10–14 days', 4.8, '410+', '900K m/mo',
  ARRAY['Oeko-Tex','GOTS'], ARRAY['Linen','Cotton','Yarn'],
  'Sales Team', '+86 138 0000 0000', 'www.flin.com', 2011, '200+', '20,000 m²', 'Ningbo Port 150 km',
  'A verified fabric mill in Shandong with 15 years of experience supplying global apparel brands. Specialties: Linen, Cotton, Yarn.', 'factory2'),

('foshan-indigo-mills', 'Foshan Indigo Mills', 'fabric_mill', 'China', 'Guangdong', 'verified',
  12, '500 m', '14–21 days', 4.7, '260+', '700K m/mo',
  ARRAY['ISO 9001'], ARRAY['Denim','Chambray'],
  'Sales Team', '+86 138 0000 0000', 'www.find.com', 2014, '200+', '20,000 m²', 'Ningbo Port 150 km',
  'A verified fabric mill in Guangdong with 12 years of experience supplying global apparel brands. Specialties: Denim, Chambray.', 'factory-interior'),

('dongguan-mx-garment-co-ltd', 'Dongguan MX Garment Co., Ltd.', 'oem_factory', 'China', 'Guangdong', 'verified',
  18, '300 pcs', '25–30 days', 4.9, '880+', '400K pcs/mo',
  ARRAY['ISO 9001','WRAP'], ARRAY['Cut & Sew','Full Package','Private Label'],
  'Sales Team', '+86 138 0000 0000', 'www.fmx.com', 2008, '200+', '20,000 m²', 'Ningbo Port 150 km',
  'A verified oem factory in Guangdong with 18 years of experience supplying global apparel brands. Specialties: Cut & Sew, Full Package, Private Label.', 'cutsew'),

('ningbo-longzhou-accessories-co', 'Ningbo Longzhou Accessories Co.', 'trim_supplier', 'China', 'Zhejiang', 'verified',
  10, '1000 pcs', '7–12 days', 4.6, '340+', '5M pcs/mo',
  ARRAY['Oeko-Tex'], ARRAY['Zippers','Buttons','Labels'],
  'Sales Team', '+86 138 0000 0000', 'www.flz.com', 2016, '200+', '20,000 m²', 'Ningbo Port 150 km',
  'A verified trim supplier in Zhejiang with 10 years of experience supplying global apparel brands. Specialties: Zippers, Buttons, Labels.', 'sewing-machine'),

('suzhou-synthetics', 'Suzhou Synthetics', 'fabric_mill', 'China', 'Jiangsu', 'verified',
  14, '500 m', '7–10 days', 4.5, '190+', '1.1M m/mo',
  ARRAY['GRS'], ARRAY['Polyester','Recycled'],
  'Sales Team', '+86 138 0000 0000', 'www.fsyn.com', 2012, '200+', '20,000 m²', 'Ningbo Port 150 km',
  'A verified fabric mill in Jiangsu with 14 years of experience supplying global apparel brands. Specialties: Polyester, Recycled.', 'dyeing'),

('textilia-global-mills', 'Textilia Global Mills', 'oem_factory', 'India', 'Tirupur, Tamil Nadu', 'verified',
  16, '500 m/color', '3–30 days', 4.8, '520+', '1.2M m/mo',
  ARRAY['Oeko-Tex','ISO 9001'], ARRAY['Yarn to Finish','Knits','Full Package'],
  'Sales Team', '+86 138 0000 0000', 'www.ftxl.com', 2010, '200+', '20,000 m²', 'Ningbo Port 150 km',
  'A verified oem factory in Tirupur, Tamil Nadu with 16 years of experience supplying global apparel brands. Specialties: Yarn to Finish, Knits, Full Package.', 'factory1'),

('tokyo-senshoku-co', 'Tokyo Senshoku Co.', 'fabric_mill', 'Japan', 'Tokyo, Japan', 'verified',
  35, '150 m', '18–28 days', 5.0, '140+', '300K m/mo',
  ARRAY['Oeko-Tex','bluesign®'], ARRAY['Premium','Technical','Dyeing'],
  'Kenji Sato', '+81 3 5544 2210', 'www.tokyosenshoku.jp', 2001, '120+', '9,000 m²', 'Yokohama 40 km',
  'A premium Tokyo mill specializing in technical and naturally dyed fabrics for advanced apparel, trusted by Japanese and European designers.', 'factory2'),

-- ===== Synthesized factories (product-only sellers, no directory entry) =====
('guangzhou-greenknit-co-ltd', 'Guangzhou Greenknit Co., Ltd.', 'fabric_mill', 'China', 'Guangdong', 'verified',
  12, '300 m', '15–25 days', 4.7, '200+', '800K m/mo',
  ARRAY['Oeko-Tex'], ARRAY['Knit','Jersey','Organic'],
  'Sales Team', '+86 138 0000 0000', 'www.guangzhougreenknit.com', 2014, '200+', '20,000 m²', 'Nansha Port 60 km',
  'A verified fabric mill in Guangdong with 12 years of experience supplying global apparel brands. Specialties: Knit, Jersey, Organic.', 'factory1'),

('zhejiang-techtex', 'Zhejiang Techtex', 'fabric_mill', 'China', 'Zhejiang', 'verified',
  11, '300 m', '10–15 days', 4.6, '180+', '900K m/mo',
  ARRAY['Oeko-Tex'], ARRAY['Nylon','Technical','Yarn'],
  'Sales Team', '+86 138 0000 0000', 'www.zhejiangtechtex.com', 2015, '200+', '20,000 m²', 'Ningbo Port 120 km',
  'A verified fabric mill in Zhejiang with 11 years of experience supplying global apparel brands. Specialties: Nylon, Technical, Yarn.', 'factory2'),

('jiangsu-woolen-co', 'Jiangsu Woolen Co.', 'fabric_mill', 'China', 'Jiangsu', 'verified',
  15, '200 m', '18–28 days', 4.7, '150+', '400K m/mo',
  ARRAY['Oeko-Tex'], ARRAY['Wool','Flannel','Yarn'],
  'Sales Team', '+86 138 0000 0000', 'www.jiangsuwoolen.com', 2011, '200+', '20,000 m²', 'Shanghai Port 200 km',
  'A verified fabric mill in Jiangsu with 15 years of experience supplying global apparel brands. Specialties: Wool, Flannel, Yarn.', 'factory-interior'),

('ningbo-ecofiber', 'Ningbo EcoFiber', 'fabric_mill', 'China', 'Zhejiang', 'verified',
  9, '500 m', '12–18 days', 4.5, '160+', '1M m/mo',
  ARRAY['GRS','Oeko-Tex'], ARRAY['Recycled','Polyester','Sustainable'],
  'Sales Team', '+86 138 0000 0000', 'www.ningboecofiber.com', 2017, '200+', '20,000 m²', 'Ningbo Port 30 km',
  'A verified fabric mill in Zhejiang with 9 years of experience supplying global apparel brands. Specialties: Recycled, Polyester, Sustainable.', 'dyeing'),

('hangzhou-silk-house', 'Hangzhou Silk House', 'fabric_mill', 'China', 'Zhejiang', 'verified',
  13, '300 m', '12–20 days', 4.7, '210+', '600K m/mo',
  ARRAY['Oeko-Tex'], ARRAY['Satin','Silk','Lace'],
  'Sales Team', '+86 138 0000 0000', 'www.hangzhousilkhouse.com', 2013, '200+', '20,000 m²', 'Ningbo Port 180 km',
  'A verified fabric mill in Zhejiang with 13 years of experience supplying global apparel brands. Specialties: Satin, Silk, Lace.', 'satin'),

('shandong-warmtex', 'Shandong Warmtex', 'fabric_mill', 'China', 'Shandong', 'verified',
  10, '500 m', '10–15 days', 4.5, '170+', '1.2M m/mo',
  ARRAY['Oeko-Tex'], ARRAY['Fleece','Polyester','Knit'],
  'Sales Team', '+86 138 0000 0000', 'www.shandongwarmtex.com', 2016, '200+', '20,000 m²', 'Qingdao Port 120 km',
  'A verified fabric mill in Shandong with 10 years of experience supplying global apparel brands. Specialties: Fleece, Polyester, Knit.', 'fleece'),

('nantong-heavy-cloth', 'Nantong Heavy Cloth', 'fabric_mill', 'China', 'Jiangsu', 'verified',
  14, '300 m', '14–21 days', 4.6, '140+', '700K m/mo',
  ARRAY['ISO 9001'], ARRAY['Canvas','Cotton','Heavy'],
  'Sales Team', '+86 138 0000 0000', 'www.nantongheavycloth.com', 2012, '200+', '20,000 m²', 'Shanghai Port 130 km',
  'A verified fabric mill in Jiangsu with 14 years of experience supplying global apparel brands. Specialties: Canvas, Cotton, Heavy.', 'cotton-twill'),

('dongguan-trim-studio', 'Dongguan Trim Studio', 'trim_supplier', 'China', 'Guangdong', 'verified',
  8, '2000 pcs', '7–12 days', 4.6, '190+', '3M pcs/mo',
  ARRAY['Oeko-Tex'], ARRAY['Labels','Woven','Custom'],
  'Sales Team', '+86 138 0000 0000', 'www.dongguantrimstudio.com', 2018, '200+', '20,000 m²', 'Shenzhen Port 90 km',
  'A verified trim supplier in Guangdong with 8 years of experience supplying global apparel brands. Specialties: Labels, Woven, Custom.', 'labels'),

('suzhou-ribbon-house-co-ltd', 'Suzhou Ribbon House Co., Ltd.', 'trim_supplier', 'China', 'Jiangsu', 'verified',
  10, '1000 m', '7–12 days', 4.5, '220+', '4M m/mo',
  ARRAY['Oeko-Tex'], ARRAY['Ribbon','Elastic','Tape'],
  'Sales Team', '+86 138 0000 0000', 'www.suzhouribbonhouse.com', 2016, '200+', '20,000 m²', 'Shanghai Port 100 km',
  'A verified trim supplier in Jiangsu with 10 years of experience supplying global apparel brands. Specialties: Ribbon, Elastic, Tape.', 'ribbon'),

('shaoxing-dye-works', 'Shaoxing Dye Works', 'oem_factory', 'China', 'Zhejiang', 'verified',
  12, '1 color', '10–14 days', 4.7, '130+', '500 colors/mo',
  ARRAY['Oeko-Tex','GOTS'], ARRAY['Dyeing','Color Matching','Lab Dip'],
  'Sales Team', '+86 138 0000 0000', 'www.shaoxingdyeworks.com', 2014, '200+', '20,000 m²', 'Ningbo Port 140 km',
  'A verified oem factory in Zhejiang with 12 years of experience supplying global apparel brands. Specialties: Dyeing, Color Matching, Lab Dip.', 'dyeing')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Products — factory_id resolved by slug subquery (JOIN). ON CONFLICT (sku).
-- badge '' -> NULL; pricing_mode 'quote' where price = 0 (OEM-403) else 'fixed';
-- moq numeric = leading number of the moq string; unit/category mapped to enums.
-- ---------------------------------------------------------------------------
INSERT INTO public.products
  (sku, name, comp, spec, price, pricing_mode, unit_type, moq, factory_id,
   category, badge, img, loc)
SELECT
  v.sku, v.name, v.comp, v.spec, v.price,
  v.pricing_mode::public.pricing_mode,
  v.unit_type::public.unit_type,
  v.moq,
  f.id,
  v.category::public.product_category,
  v.badge, v.img, v.loc
FROM (VALUES
  ('CTW-001','Cotton Twill','100% Cotton','250–350 GSM',3.20,'fixed','m',500,'shandong-linentex-co-ltd','fabrics','oem','cotton-twill','Shandong, China'),
  ('LNW-001','Linen Blend Woven','55% Linen 45% Viscose','150cm',5.20,'fixed','m',200,'shandong-linentex-co-ltd','fabrics','best','linen','Shandong, China'),
  ('OCJ-002','Organic Cotton Jersey','95% Organic Cotton 5% Spandex','180gsm',6.80,'fixed','kg',150,'guangzhou-greenknit-co-ltd','fabrics','new','cotton-jersey','Guangdong, China'),
  ('DNM-003','Denim','Cotton / Elastane','8–14 oz',7.40,'fixed','m',500,'foshan-indigo-mills','fabrics','oem','denim','Guangdong, China'),
  ('JSK-004','Jersey Knit','Cotton / Spandex','160–220 GSM',5.90,'fixed','m',400,'guangzhou-greenknit-co-ltd','fabrics','oem','jersey-knit','Guangdong, China'),
  ('NYT-005','Nylon Taslan','100% Nylon','110–160 GSM',4.10,'fixed','m',300,'zhejiang-techtex','fabrics','oem','nylon-taslan','Zhejiang, China'),
  ('WLF-006','Wool Flannel','100% Wool','240–320 GSM',12.50,'fixed','m',200,'jiangsu-woolen-co','fabrics','nonoem','wool-flannel','Jiangsu, China'),
  ('PYT-007','Polyester Twill','100% Polyester','150–250 GSM',2.80,'fixed','m',500,'suzhou-synthetics','fabrics','oem','poly-twill','Jiangsu, China'),
  ('RCP-008','Recycled Polyester','Recycled Polyester','120–200 GSM',3.60,'fixed','m',500,'ningbo-ecofiber','fabrics','recycle','recycled-poly','Zhejiang, China'),
  ('STN-009','Satin','Polyester / Viscose','90–150 GSM',4.90,'fixed','m',300,'hangzhou-silk-house','fabrics','oem','satin','Zhejiang, China'),
  ('FLC-010','Fleece','Polyester','200–300 GSM',4.30,'fixed','m',500,'shandong-warmtex','fabrics','oem','fleece','Shandong, China'),
  ('CHB-011','Chambray','Cotton','120–180 GSM',3.90,'fixed','m',400,'foshan-indigo-mills','fabrics','oem','chambray','Guangdong, China'),
  ('CNV-012','Canvas','Cotton','300–450 GSM',4.60,'fixed','m',300,'nantong-heavy-cloth','fabrics','nonoem','cotton-twill','Jiangsu, China'),
  ('ZIP-101','Metal Zipper YKK #5','Antique Brass','Closed End',0.35,'fixed','pc',500,'ningbo-longzhou-accessories-co','accessories','oem','zipper','Zhejiang, China'),
  ('BTN-102','Corozo & Brass Buttons','Corozo / Metal','15–24 L',0.08,'fixed','pc',1000,'ningbo-longzhou-accessories-co','accessories','oem','buttons','Zhejiang, China'),
  ('LBL-103','Custom Woven Labels','Damask Weave','Custom size',0.05,'fixed','pc',2000,'dongguan-trim-studio','accessories','oem','labels','Guangdong, China'),
  ('RBN-201','Grosgrain Ribbon 25mm','100% Polyester','25mm',0.12,'fixed','m',1000,'suzhou-ribbon-house-co-ltd','trims','oem','ribbon','Jiangsu, China'),
  ('ELA-202','Knitted Elastic Band 30mm','Polyester / Rubber','30mm',0.09,'fixed','m',1000,'suzhou-ribbon-house-co-ltd','trims',NULL,'elastic','Jiangsu, China'),
  ('TAP-203','Cotton Twill Tape 20mm','100% Cotton','20mm',0.10,'fixed','m',1000,'ningbo-longzhou-accessories-co','trims',NULL,'twilltape','Zhejiang, China'),
  ('LAC-204','Floral Lace Trim 40mm','Nylon / Cotton','40mm',0.30,'fixed','m',500,'hangzhou-silk-house','trims','oem','lace','Zhejiang, China'),
  ('YRN-301','Combed Cotton Yarn 30s','100% Cotton','Ne 30/1',3.20,'fixed','kg',500,'shandong-linentex-co-ltd','yarns','oem','yarn-cones','Shandong, China'),
  ('YRN-302','Polyester Sewing Thread 40/2','100% Polyester','Tex 30',1.80,'fixed','kg',300,'suzhou-synthetics','yarns',NULL,'thread','Jiangsu, China'),
  ('YRN-303','Merino Wool Yarn 2/28','100% Merino Wool','Nm 2/28',9.50,'fixed','kg',200,'jiangsu-woolen-co','yarns','nonoem','woolyarn','Jiangsu, China'),
  ('YRN-304','Nylon Filament Yarn 70D','100% Nylon','70D/24F',2.60,'fixed','kg',400,'zhejiang-techtex','yarns',NULL,'thread','Zhejiang, China'),
  ('OEM-401','Sampling Package','Up to 3 samples','5–7 days',45.00,'fixed','package',1,'dongguan-mx-garment-co-ltd','oem','oem','oemsample','Guangdong, China'),
  ('OEM-402','Private Label Package','Labels + packaging','10–14 days',180.00,'fixed','style',1,'dongguan-mx-garment-co-ltd','oem','oem','oemlabel','Guangdong, China'),
  ('OEM-403','Cut & Sew — Full Package','T-shirt, Hoodie, Polo','25–30 days',0.00,'quote','order',300,'dongguan-mx-garment-co-ltd','oem','oem','cutsew','Guangdong, China'),
  ('OEM-404','Color Matching & Dyeing','Lab dip + approval','10–14 days',120.00,'fixed','color',1,'shaoxing-dye-works','oem','oem','dyeing','Zhejiang, China')
) AS v(sku, name, comp, spec, price, pricing_mode, unit_type, moq, slug, category, badge, img, loc)
JOIN public.factories f ON f.slug = v.slug
ON CONFLICT (sku) DO NOTHING;

-- ---------------------------------------------------------------------------
-- price_breaks — one base tier per product (min_qty = product MOQ,
-- unit_price = product price). ON CONFLICT (product_id, min_qty).
-- ---------------------------------------------------------------------------
INSERT INTO public.price_breaks (product_id, min_qty, unit_price)
SELECT p.id, p.moq, p.price
FROM public.products p
WHERE p.moq IS NOT NULL
ON CONFLICT (product_id, min_qty) DO NOTHING;

-- ---------------------------------------------------------------------------
-- product_variants — one 'Default' colorway per product.
-- No unique constraint on (product_id, colorway), so guard with NOT EXISTS.
-- ---------------------------------------------------------------------------
INSERT INTO public.product_variants (product_id, colorway)
SELECT p.id, 'Default'
FROM public.products p
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_variants v
  WHERE v.product_id = p.id AND v.colorway = 'Default'
);

-- ---------------------------------------------------------------------------
-- platform_bank_accounts — single active ARCANA escrow account (placeholder).
-- Insert only if no active account exists (idempotent guard).
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_bank_accounts
  (bank_name, account_name, account_number, swift, currency, is_active)
SELECT 'DBS Bank Ltd', 'ARCANA Wangsa Pte. Ltd.', '000-XXXXXX-0', 'DBSSSGSG', 'USD', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_bank_accounts WHERE is_active
);
