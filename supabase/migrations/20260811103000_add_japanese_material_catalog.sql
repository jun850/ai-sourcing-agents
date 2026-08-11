-- ============================================================================
-- Atelix — Japanese material-source catalog
-- The managed Supabase catalog is the storefront source of truth. This
-- migration adds the supplier profiles and all 21 swatch-backed listings
-- introduced in the August 2026 catalogue update.
-- ============================================================================

INSERT INTO public.factories
  (slug, name, type, region, loc, verify_state, years, moq, lead, rating,
   orders_label, capacity, certs, tags, web, founded, employees, bio, img)
VALUES
  ('F-14','TAKISADA-NAGOYA Co., Ltd.','textile_trading_company','Japan','Nagoya, Aichi','verified',162,'From 40 m','Quote on request',4.9,'New','4,000+ fabric styles',ARRAY[]::text[],ARRAY['Woven','Knits','Wool'],'www.takisada-nagoya.jp/en',1864,'521','Japanese textile and garment specialist founded in 1864. Its fabric divisions source and develop menswear and womenswear textiles through a global supply chain.','factory-interior'),
  ('F-15','SUNWELL Co., Ltd.','textile_trading_company','Japan','Osaka','verified',60,'Quote on request','Quote on request',4.8,'New','20M m annual textile sales',ARRAY[]::text[],ARRAY['Woven','Linen','Cotton'],'www.sunwell.jp/en',1966,'209','Japanese textile supplier with about 2,000 stocked items and 20,000 colors. SUNWELL develops and supplies apparel textiles through its Japan, China, and Thailand network.','factory-interior'),
  ('F-16','Sojitz Fashion Co., Ltd. (VANCET)','textile_trading_company','Japan','Tokyo','verified',66,'From 1 m sample cut','Stock status on request',4.8,'New','1,600 stocked originals',ARRAY[]::text[],ARRAY['Cotton','Denim','Stock Service'],'www.sojitz-fashion.com/en',1960,NULL,'Textile specialist behind VANCET-NET, with in-house fabric development, partner production in Japan and Asia, and stocked original materials for small-lot and quick-response orders.','factory-interior'),
  ('F-17','ROKAL Co., Ltd.','textile_trading_company','Japan','Harajuku, Tokyo','verified',NULL,'From 1 m','Stock status on request',4.7,'New','300 stocked styles',ARRAY[]::text[],ARRAY['Woven','Wool-Like','Banshu'],'www.rokal-tex.com',NULL,NULL,'Japanese textile maker with offices in Tokyo, Nishiwaki, and Kojima. ROKAL stocks roughly 300 styles spanning yarn-dyed, synthetic, wool, denim, military, and workwear fabrics.','factory-interior'),
  ('F-18','Miyuki Keori Co., Ltd.','fabric_mill','Japan','Nagoya, Aichi','verified',121,'Quote on request','Quote on request',4.9,'New','Integrated textile to apparel',ARRAY[]::text[],ARRAY['Wool','Suiting','Formal'],'www.miyukikeori.co.jp/english',1905,NULL,'Japanese luxury menswear textile manufacturer established in 1905, integrating textile and apparel production with a Yokkaichi mill and formalwear collections.','factory-interior'),
  ('F-19','Toray Industries, Inc.','material_innovator','Japan','Tokyo','verified',100,'Quote on request','Quote on request',4.9,'New','Global material network',ARRAY[]::text[],ARRAY['Performance','Polyester','Stretch'],'www.toray.com',1926,NULL,'Japanese materials company supplying performance textiles, including PRIMEFLEX® stretch fabrics engineered for rebound, easy care, and moisture management.','factory-interior'),
  ('F-20','Kaihara Corporation','fabric_mill','Japan','Fukuyama, Hiroshima','verified',133,'Quote on request','Quote on request',4.9,'New','Integrated denim production',ARRAY[]::text[],ARRAY['Denim','Indigo','Woven'],'www.kaihara-denim.com',1893,'587','Japanese denim producer with integrated spinning, dyeing, weaving, finishing, and quality-control operations in Hiroshima, as well as a Thailand production site.','factory-interior'),
  ('F-21','IRIS Co., Ltd.','accessories_supplier','Japan','Ota, Gunma','verified',80,'Quote on request','Quote on request',4.8,'New','70 partner factories',ARRAY[]::text[],ARRAY['Buttons','Buckles','Accessories'],'www.iris.co.jp/english',1946,'442','Japanese garment-trimmings manufacturer supplying buttons, accessories, buckles, and related components across a global production and sales network.','factory-interior'),
  ('F-22','YKK Corporation','accessories_supplier','Japan','Kurobe, Toyama','verified',92,'Quote on request','Quote on request',4.9,'New','142 companies in 70 countries',ARRAY[]::text[],ARRAY['Zippers','Fasteners','Hardware'],'www.ykk.com/english',1934,'56,899 group','Global fastening manufacturer founded in 1934. YKK produces zippers and other fastening products through a network operating in approximately 70 countries and regions.','factory-interior')
ON CONFLICT (slug) DO UPDATE SET
  name=EXCLUDED.name, type=EXCLUDED.type, region=EXCLUDED.region, loc=EXCLUDED.loc,
  verify_state=EXCLUDED.verify_state, years=EXCLUDED.years, moq=EXCLUDED.moq,
  lead=EXCLUDED.lead, rating=EXCLUDED.rating, orders_label=EXCLUDED.orders_label,
  capacity=EXCLUDED.capacity, certs=EXCLUDED.certs, tags=EXCLUDED.tags,
  web=EXCLUDED.web, founded=EXCLUDED.founded, employees=EXCLUDED.employees,
  bio=EXCLUDED.bio, img=EXCLUDED.img;

INSERT INTO public.products
  (sku, name, comp, spec, price, pricing_mode, unit_type, moq, factory_id,
   category, badge, img, loc, listing_status)
SELECT v.sku, v.name, v.comp, v.spec, v.price, v.pricing_mode::public.pricing_mode,
  v.unit_type::public.unit_type, v.moq, factory.id, v.category::public.product_category,
  NULLIF(v.badge,''), v.img, v.loc, 'active'::public.listing_status
FROM (VALUES
  ('FAB-137','Albini Sea Island Cotton','100% Cotton','170 GSM · 150 cm · 40 m roll · Style 1078420',0,'quote','m',40,'F-14','fabrics','','takisada-sea-island-cotton.jpg','Nagoya, Aichi, Japan'),
  ('FAB-138','21-Wale Indigo Washed Corduroy Stretch','97% Cotton 3% Polyurethane','136–138 cm · 25 m roll · Style 13477',0,'quote','m',25,'F-15','fabrics','','sunwell-indigo-corduroy-stretch.jpg','Osaka, Japan'),
  ('FAB-139','TC Weather Cloth NANO-WING Water Repellent','65% Polyester 35% Cotton','170 GSM · 112 cm · 54 m roll · Style 10611',0,'quote','m',1,'F-16','fabrics','','vancet-tc-weather-nano-wing.jpg','Tokyo, Japan'),
  ('FAB-140','RR8811 Summer Wool-Like Trousers','100% Polyester','145 cm · 50 m roll · ROKAL RR8811',0,'quote','m',1,'F-17','fabrics','','rokal-rr8811.jpg','Harajuku, Tokyo, Japan'),
  ('FAB-141','RE:NEWOOL® Beaver Glen Check','70% Polyester 26% Nylon 4% Acrylic','358 GSM · 145 cm · 50 m roll · Style 1015291',0,'quote','m',50,'F-14','fabrics','recycle','takisada-renewool-beaver-glencheck.jpg','Nagoya, Aichi, Japan'),
  ('FAB-142','Cotton & Wool Yarn-Dyed Twill','55% Cotton 45% Wool','154–156 cm · 60 m roll · Style 14346',0,'quote','m',60,'F-15','fabrics','','sunwell-cotton-wool-twill.jpg','Osaka, Japan'),
  ('FAB-143','MINOVA British-Made Irregular Twill','100% Wool','280 GSM · Made in England · Style 9BU0175',0,'quote','m',NULL,'F-18','fabrics','','miyuki-irregular-twill.jpg','Nagoya, Aichi, Japan'),
  ('FAB-144','SUPIMA-Like Denim Look Jersey','63% Cotton 37% Polyester','210 GSM · 126 cm · 50 m roll · Style 1099520',0,'quote','m',50,'F-14','fabrics','','takisada-supima-like-jersey.jpg','Nagoya, Aichi, Japan'),
  ('FAB-145','60s French Linen Canvas Wash Finish','100% Linen','133–135 cm · 50 m roll · Style 22448',0,'quote','m',50,'F-15','fabrics','','sunwell-french-linen-canvas-60.jpg','Osaka, Japan'),
  ('FAB-146','24-Gauge Worsted TW Mocrody','85% Polyester 15% Elastane','185 GSM · 158 cm · 40 m roll · Style 1010352',0,'quote','m',40,'F-14','fabrics','','takisada-24g-mocrody.jpg','Nagoya, Aichi, Japan'),
  ('FAB-147','NEW DotAir® Ultra-Lightweight Double Weave','100% Polyester','76 GSM · 151 cm · 47 m roll · Style 1038400',0,'quote','m',47,'F-14','fabrics','','takisada-new-dotair.jpg','Nagoya, Aichi, Japan'),
  ('FAB-148','Indigo Washed Velveteen Stretch','97% Cotton 3% Polyurethane','129–131 cm · 25 m roll · Style 13476',0,'quote','m',25,'F-15','fabrics','','sunwell-indigo-velveteen.jpg','Osaka, Japan'),
  ('FAB-149','RE:NEWOOL® Cashmere Dobby','49% Wool 36% Polyester 12% Cashmere 2% Nylon 1% Acrylic','310 GSM · 140 cm · 50 m roll · Style 1022192',0,'quote','m',50,'F-14','fabrics','recycle','takisada-renewool-cashmere-dobby.jpg','Nagoya, Aichi, Japan'),
  ('FAB-150','Formal Essentials Anti-Static Tuxedo Cloth','99% Wool 1% Nylon','340 GSM · 146 cm · Style 9MR0145',0,'quote','m',NULL,'F-18','fabrics','','miyuki-formal-tuxedo.jpg','Nagoya, Aichi, Japan'),
  ('FAB-151','40s French Linen Brushed Canvas Wash Finish','100% Linen','132–134 cm · 50 m roll · Style 13466',0,'quote','m',50,'F-15','fabrics','','sunwell-french-linen-brushed-canvas.jpg','Osaka, Japan'),
  ('FAB-152','Primeflex® Stretch Fabric T1870P','100% Polyester','102 GSM · 147 cm · 47 m roll · T1870P',0,'quote','m',47,'F-19','fabrics','','toray-primeflex-t1870p.jpg','Tokyo, Japan'),
  ('FAB-153','LANAVITA Super 100’s Medium Gray Herringbone','100% Wool · Super 100’s · 2-ply','280 GSM · Style 3ML0075 · Made in Japan',0,'quote','m',NULL,'F-18','fabrics','','miyuki-lanavita-herringbone.jpg','Nagoya, Aichi, Japan'),
  ('FAB-154','Kaihara 12 oz Cotton Yarn-Dyed Denim','100% Cotton','363.3 GSM · 148–149 cm · 50 m roll · VANCET 512',0,'quote','m',1,'F-20','fabrics','','kaihara-12oz-denim.jpg','Fukuyama, Hiroshima, Japan'),
  ('BUT-155','Buffalo Horn Four-Hole Button','Natural Buffalo Horn','Four-hole · black sample · size on request',0,'quote','pc',NULL,'F-21','accessories','','iris-buffalo-horn-button.jpg','Ota, Gunma, Japan'),
  ('ZIP-156','YKK Metal Zipper — Style 1007903','Metal Chain / Polyester Tape','Navy sample · length and finish on request',0,'quote','pc',NULL,'F-22','accessories','','ykk-metal-zipper-1007903.jpg','Kurobe, Toyama, Japan'),
  ('ZIP-157','YKK 25FK Black Coil Zipper','Polyester Coil / Polyester Tape','25FK · black sample · length on request',0,'quote','pc',NULL,'F-22','accessories','','ykk-25fk-coil-zipper.jpg','Kurobe, Toyama, Japan')
) AS v(sku,name,comp,spec,price,pricing_mode,unit_type,moq,factory_slug,category,badge,img,loc)
JOIN public.factories AS factory ON factory.slug=v.factory_slug
ON CONFLICT (sku) DO UPDATE SET
  name=EXCLUDED.name, comp=EXCLUDED.comp, spec=EXCLUDED.spec, price=EXCLUDED.price,
  pricing_mode=EXCLUDED.pricing_mode, unit_type=EXCLUDED.unit_type, moq=EXCLUDED.moq,
  factory_id=EXCLUDED.factory_id, category=EXCLUDED.category, badge=EXCLUDED.badge,
  img=EXCLUDED.img, loc=EXCLUDED.loc, listing_status=EXCLUDED.listing_status;
