# China — Supplier Research TODO

## Status: COMPLETE — 50 verified companies

### Coverage by category:
- **Zippers (4)**: SBS Zipper, YCC Zippers, RHF Zipper, SWS/Shanghai Manxuan
- **Buttons (5)**: Buttons International, Jiahua Button, KUNSHUO, Hongcheng, Yibei Button
- **Trims/Accessories (7)**: Jiamei Labels, Acctrims, ClothingLabels.cn, YiLang, Aisha Lace, BH Interlining, Paiho Group
- **OEM Garment (7)**: Shenzhou International, Guangzhou Garment, Hangzhou Garment, GROOVECOLOR, Sidi Fashion, XinYuan Fashion, Youngor Group
- **Fabric Mills (27)**: Luthai, Texhong, Weiqiao, Tongkun, Jiangsu Sunshine, Esquel, Jiaxin Silk, King Fabric, Suerte, Guangzhou Selvedge Denim, Shengrun, Richman Cashmere, Zhisheng, Suze, Jingang, Xinhe, Taihu Snow Silk, Linens China, Inner Mongolia Field, North Land Cashmere, Shanning, Foshan Mattella, Hongyang Woolen, Keqiao Real, Hongmao, Delantex, (+ fixed originals)

### URL rule (decided):
- Main company URL = company-owned domain only. Marketplace listings (made-in-china.com, goldsupplier.com) do NOT count.
- Marketplace listing pages CAN be used as product catalog scraping targets.

### Next:
1. Add site-specific selectors in `scraper_template.py` SITE_CONFIGS for each target website
2. For companies without browsable product catalogs on their owned site, use their marketplace listing pages as catalog_url for scraping
3. Run scraper to extract itemised product data
