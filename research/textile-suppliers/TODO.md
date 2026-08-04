# Textile Supplier Sourcing — Overview

## Source files (as dropped in by user, unmodified)
- `textile_suppliers.csv` — original list: 57 China rows, 25 Japan rows. All are fabric/yarn mills; zero buttons, trim, or zipper suppliers, zero dedicated OEM garment (cut-and-sew) manufacturers.
- `scraper_template.py` — Playwright scraper rewritten to match ARCANA PDP/supplier-profile schema. Outputs one row per product with fields: company_name, business_type, region, country, years_in_business, factory_area, employees, certifications, website, product_name, composition, specification, category, moq, unit_price, lead_time (default 30 days), product_url.
- `setup.sh` — `pip install playwright beautifulsoup4 pandas` + `playwright install chromium`. **Done — packages installed.**

## URL Rules (confirmed with user)
- **Main company URL**: must be the company's OWN domain (even free-tier Jimdo/Wix counts). B2B marketplace listings (made-in-china.com, goldsupplier.com, alibaba.com) do NOT count.
- **Product catalog scraping**: marketplace listing pages CAN be used as scraping targets for product data extraction.
- **No Wikipedia**: not as `website`, not as `source_url`.
- **Itemized products**: each row in the final output should be a product (e.g. "Company A, linen woven 124 gsm"), not just a company. The scraper needs to extract product-level data.

## ARCANA Data Model (from PDP/supplier screenshots)
Per-product row fields:
- `product_name` — e.g. "Denim"
- `composition` — e.g. "Cotton / Elastane"
- `specification` — e.g. "8-14 oz"
- `moq` — e.g. "500 m"
- `lead_time` — e.g. "7-14 days" (default "30 days" if unavailable)
- `category` — "Fabrics", "Buttons", "Trims", "Zippers", "OEM"
- `unit_price` — e.g. "US$7.40 /m"

Company-level fields (repeated per row):
- `company_name`, `business_type`, `region`, `country`
- `years_in_business`, `factory_area`, `employees`, `certifications`, `website`

## Research Status

### Japan (priority) — COMPLETE
- **Existing rows fixed**: 8 of 11 bad URLs now have owned-domain URLs. 3 dropped (Izumi Textile, Nippon Textile Co., Tsujimura Dyeing).
- **Net-new companies verified**: 31 companies across all categories (see `japan/verified_targets.csv`):
  - Zippers: 1 (YKK)
  - Buttons: 3 (TOMOI, IRIS, Kanase)
  - Trims/Accessories: 5 (Morito, Shimada Shoji, SHINDO, Sankei, Nittobo)
  - OEM Garment: 8 (Nippon Thread Works, Ogura Meriyasu, MARUCHO, Wakoh, Andoh, Fukuoka Knit, Yonetomi Seni, Marusho Knit Factory)
  - Fabric mills: 14 (KANEMASA, Tatsumura, Takisada-Nagoya, Nikke, Oharayaseni, Fujisaki, Ueyama, KOWA, Koyama, Nitta, Abekichi, Maruyasu, IKEUCHI ORGANIC, Senshu Towel)
- **Projected total after merge**: 22 existing good + 31 new = **53 Japan suppliers** (clears 50).

### China — COMPLETE
- **Existing rows fixed**: 7 owned-domain URLs found. ~18 dropped (marketplace-only), ~10 borderline.
- **Net-new companies verified**: 50 total companies in `china/verified_targets.csv`:
  - Zippers: 4 (SBS, YCC, RHF, SWS/Shanghai Manxuan)
  - Buttons: 5 (Buttons International, Jiahua, KUNSHUO, Hongcheng, Yibei)
  - Trims/Accessories: 6 (Jiamei Labels, Acctrims, ClothingLabels.cn, YiLang, Aisha Lace, BH Interlining, Paiho)
  - OEM Garment: 6 (Shenzhou International, Guangzhou Garment, Hangzhou Garment, GROOVECOLOR, Sidi Fashion, XinYuan, Youngor)
  - Fabric mills: ~29 (Luthai, Texhong, Weiqiao, Tongkun, Jiangsu Sunshine, Esquel, Jiaxin Silk, King Fabric, Suerte, Selvedge Denim, Shengrun, Richman Cashmere, Zhisheng, Suze, Jingang, Xinhe, Taihu Snow Silk, Linens China, Inner Mongolia Field, North Land Cashmere, Shanning, Mattella/Selvedge Denim, Hongyang Woolen, Keqiao Real, Hongmao, Delantex)
- **Total: 50 China suppliers** (clears target).

## Next steps
1. **Scraper customization**: For each target company, add site-specific CSS selectors to `SITE_CONFIGS` in `scraper_template.py`. Each site has different HTML structure.
2. **Run scraper**: Execute product-level extraction against each company's catalog pages. Output: `arcana_products.csv` / `arcana_products.jsonl`.
3. **Merge**: Build final clean CSV combining all product-level data from scraper runs.

## Reference
User pointed to https://www.apparel-x.com/makerlist.php as a planning resource for Japan manufacturer discovery (ApparelX is Japan's largest B2B apparel materials platform).
