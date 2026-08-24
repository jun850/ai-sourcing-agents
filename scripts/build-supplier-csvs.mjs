import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('data/normalized');
fs.mkdirSync(outDir, { recursive: true });

// These are the named company cards in the four supplied PDFs. Cluster-only
// recommendations are intentionally excluded from the supplier import.
const cards = [
  // volume, name, alias, region, city, category, type, website, shop, email, phone, contact URL, web status
  [1,'Shenzhou International','申洲国际','China','Ningbo','Knit sportswear and apparel','oem_factory','https://www.shenzhouintl.com/','','','','','pdf-listed'],
  [1,'Crystal International','晶苑国际','China','Guangdong / Southeast Asia','Garments and apparel','oem_factory','https://www.crystalgroup.com/','','','','','pdf-listed'],
  [1,'Regina Miracle','维珍妮','China','Shenzhen / Vietnam','Molded bras, seamless intimates, sports bras','oem_factory','https://www.reginamiracle.com/','','','','','pdf-listed'],
  [1,'Lever Style','利华成衣','Hong Kong / China','Hong Kong / China and Asia','Premium woven and casualwear','oem_factory','https://www.leverstyle.com/','','','','','pdf-listed'],
  [1,'Haers','哈尔斯','China','Yongkang, Zhejiang','Stainless and titanium drinkware','oem_factory','https://www.haers.com/','','','','','pdf-listed'],
  [1,'Zhejiang Jiayi','嘉益股份','China','Wuyi, Zhejiang','Insulated tumblers and travel mugs','oem_factory','','Alibaba International','','','','pdf-only-channel'],
  [1,'Feijian Technology','飞剑科技','China','Yongkang, Zhejiang','Titanium and stainless drinkware','oem_factory','','Alibaba storefront','','','','pdf-only-channel'],
  [1,'Nanlong Group','南龙集团','China','Yongkang, Zhejiang','Vacuum bottles and cookware','oem_factory','https://www.nanlong.com/','Alibaba','','','','pdf-listed'],
  [1,'Early Light Industrial','旭日实业','Hong Kong / China','Shaoguan / Heyuan, Guangdong','Die-cast vehicles and toys','oem_factory','https://www.earlylight.com.hk/','','','','','pdf-listed'],
  [1,'Alpha Group','奥飞娱乐','China','Shantou / Chenghai, Guangdong','Action figures, transforming toys and IP merchandise','oem_factory','','','','','','pdf-only-channel'],
  [1,'Luxshare Precision','立讯精密','China','Dongguan, Guangdong','Consumer-electronics components and assembly','oem_factory','https://www.luxshare-ict.com/','','Public@luxshare-ict.com','+86-769-38800888','https://www.luxshare-ict.com/about/contact.html','web-verified'],
  [1,'Goertek','歌尔股份','China','Weifang, Shandong','Acoustics, smart hardware and consumer electronics','oem_factory','https://www.goertek.com/','','goertek@goertek.com','+86-536-3051234','https://www.goertek.com/en/index.html','web-verified'],
  [1,'Xinbao Electrical','新宝电器','China','Foshan, Guangdong','Small appliances and kitchen appliances','oem_factory','https://www.donlim.com/','','investor@donlim.com','+86-757-25333888','https://www.donlim.com/jbqk.jhtml','web-verified'],
  [1,'Biyi Electric','比依股份','China','Zhejiang','Air fryers and small kitchen appliances','oem_factory','','','','','','pdf-only-channel'],
  [1,'Tianxi Holding','天喜控股','China','Zhejiang','Cookware and kitchen appliances','oem_factory','','','','','','pdf-only-channel'],
  [1,'Ningbo Jiale','宁波嘉乐','China','Ningbo, Zhejiang','Small appliances and appliance OEM','oem_factory','','','','','','pdf-only-channel'],
  [1,'Tianyuan Pet','天元宠物','China','Hangzhou, Zhejiang','Pet products and accessories','oem_factory','https://www.tianyuanpet.com/','https://tianyuanpet.com/','hello@tianyuanpet.com','+86-571-28887580','https://www.tianyuanpet.com/','web-verified'],
  [1,'Guaibao Pet','乖宝宠物','China','Shandong','Pet food and products','oem_factory','','','','','','pdf-only-channel'],
  [1,'China Pet Foods','中宠股份','China','Yantai, Shandong','Pet food','oem_factory','','','','','','pdf-only-channel'],
  [1,'Yiyi Hygiene','依依股份','China','Tianjin','Pet pads, diapers and wipes','oem_factory','https://www.yiyipad.com/','','enquiry@tjyiyi.com','+86-22-23833395','https://www.yiyipad.com/','web-verified'],
  [1,'Cosmax China','科丝美诗','China','Shanghai','Cosmetics ODM and personal care','material_innovator','https://www.cosmax.com.cn/','','j.ni@cosmax.com','+86-21-67108705','https://www.cosmax.com.cn/contact/partner/','web-verified'],
  [1,'Intercos China','莹特丽','Italy / China','Suzhou / Shanghai / Guangzhou','Cosmetics ODM and personal care','material_innovator','https://www.intercos.com/','','','+86-512-6260020','https://www.intercos.com/offices/china-mainland/','web-verified'],
  [1,'Yue Yuen','裕元集团','Hong Kong / China','Dongguan and Asia','Footwear manufacturing','oem_factory','https://www.yueyuen.com/','','','','','pdf-listed'],
  [1,'Huali Group','华利集团','China / Vietnam','Zhongshan and overseas plants','Athletic footwear','oem_factory','https://www.huali-group.com/','','','','','pdf-listed'],
  [1,'Stella International','九兴控股','Hong Kong / China','Hong Kong and Asia','Footwear manufacturing','oem_factory','https://www.stella.com.hk/','','stella@stella.com.hk','+852-29561339','https://www.stella.com.hk/enquiries','web-verified'],
  [2,'Lixuan Sports','力玄运动','China','Ningbo / Shanghai','Exercise bikes, rowers, treadmills','oem_factory','','Canton Fair sporting-goods halls','','','','pdf-only-channel'],
  [2,'Impulse Health Tech','英派斯','China','Qingdao, Shandong','Gym equipment','oem_factory','https://www.impulsehealthtech.com/','Alibaba International','','','','pdf-listed'],
  [2,'Rotai Health','荣泰健康','China','Shanghai','Massage chairs and recovery devices','oem_factory','https://www.rotai.com/','','','','','pdf-listed'],
  [2,'Mobi Garden','牧高笛','China','Ningbo, Zhejiang','Tents and camping gear','oem_factory','https://www.mobigarden.com/','Alibaba International','','','','pdf-listed'],
  [2,'Zhejiang Natural','浙江自然','China','Tiantai, Zhejiang','Inflatable outdoor gear','oem_factory','https://www.zjnatural.com/','Alibaba International','','','','pdf-listed'],
  [2,'Yangzhou Jinquan','扬州金泉','China','Yangzhou, Jiangsu','Sleeping bags, tents and outdoor apparel','oem_factory','https://www.jinquan.com/','Alibaba International','','','','pdf-listed'],
  [2,'Jasan Group','健盛集团','China','Hangzhou, Zhejiang','Socks and seamless knitwear','oem_factory','https://www.jasan.com/','Alibaba International','','','','pdf-listed'],
  [2,'Weixing','伟星股份','China','Linhai, Zhejiang','Zippers, buttons and trims','trim_supplier','https://www.weixing.com/','','','','','pdf-listed'],
  [2,'Luthai Textile','鲁泰纺织','China','Zibo, Shandong','Shirting fabric and dress shirts','fabric_mill','https://www.lutai.com/','','','','','pdf-listed'],
  [2,'Henglin Home','恒林股份','China','Anji, Zhejiang','Office and gaming chairs','oem_factory','https://www.henglin.com/','Alibaba International','','','','pdf-listed'],
  [2,'Loctek Ergonomic','乐歌股份','China','Ningbo, Zhejiang','Standing desks and ergonomic accessories','oem_factory','https://www.loctek.com/','Alibaba International','','','','pdf-listed'],
  [2,'Mlily / Healthcare Co.','梦百合','China','Nantong, Jiangsu','Memory-foam mattresses and pillows','oem_factory','https://www.mlily.com/','Alibaba International','','','','pdf-listed'],
  [2,'Great Star Industrial','巨星科技','China','Hangzhou, Zhejiang','Hand tools and storage','oem_factory','https://www.greatstar.com.cn/','','','','','pdf-listed'],
  [2,'Ningbo Dechang','德昌股份','China','Ningbo, Zhejiang','Vacuum cleaners and motors','oem_factory','https://www.dechang.com.cn/','','','','','pdf-listed'],
  [2,'Chervon Holdings','泉峰控股','China','Nanjing, Jiangsu','Power tools and outdoor power equipment','oem_factory','https://www.chervongroup.com/','','','','','pdf-listed'],
  [3,'Dream International','德林国际','Hong Kong / China / Vietnam','Hong Kong and plants in China / Vietnam','Plush and vinyl figures','oem_factory','https://www.dream-intl.com/','','','','','pdf-listed'],
  [3,'Bloomage Biotech','华熙生物','China','Jinan, Shandong','Hyaluronic acid and bioactives','material_innovator','https://www.bloomagebiotech.com/','','customer@bloomagebioactive.com','+86-531-82685996','https://www.bloomagebiotech.com/contact.html','web-verified'],
  [3,'Jinbo Bio','锦波生物','China','Taiyuan, Shanxi','Recombinant collagen and bioactive materials','material_innovator','https://www.jinbobiotech.com/','','','','','pdf-listed'],
  [3,'Shenzhen Vicky Biotech','维琪科技','China','Shenzhen, Guangdong','Cosmetic ingredients and skincare ODM','material_innovator','https://www.vickybio.com/','','','','','pdf-listed'],
  [3,'Supor','苏泊尔','China','Hangzhou / Yuhuan, Zhejiang','Cookware and kitchen appliances','oem_factory','https://www.supor.com/','','002032@supor.com','+86-571-86858878','https://www.supor.com/Culture/MailBox','web-verified'],
  [3,'Bafang Electric','八方股份','China','Suzhou, Jiangsu','E-bike motors and drive systems','oem_factory','https://www.bafang-e.com/','','','','https://www.bafang-e.com/','pdf-listed'],
  [3,'Conant Optical','康耐特光学','China','Shanghai / Qidong, Jiangsu','Resin spectacle lenses','oem_factory','https://www.conantoptical.com/','','sales@conantoptical.com','+86-21-58375339','https://www.conantoptical.com/services','web-verified'],
  [4,'Guangbo Group','广博股份','China','Ningbo, Zhejiang','Paper stationery and office supplies','oem_factory','https://www.guangbogroup.com/','Tmall; JD.com','', '+86-574-88266500','https://www.guangbogroup.com/en/','web-verified'],
  [4,'Kingking','青岛金王','China','Qingdao, Shandong','Candles and home fragrance','oem_factory','https://www.kingking.com.cn/','Alibaba International','','','','pdf-listed'],
  [4,'Power Diamond','力量钻石','China','Zhecheng, Henan','Lab-grown diamonds','material_innovator','https://www.powerdiamond.com/','','','','','pdf-listed'],
  [4,'LongPack Games','龙包印务','China','Shanghai','Board-game manufacturing','oem_factory','https://www.longpackgames.com/','','','','','pdf-listed'],
  [4,'WinGo Games','万国印刷','China','Shenzhen / Huizhou, Guangdong','Board games and card manufacturing','oem_factory','https://wingogames.com/','','info@wingogames.com','+852-63611622; +86-752-8999585','https://wingogames.com/?m=link','web-verified'],
  [4,'Rebecca','瑞贝卡','China','Xuchang, Henan','Wigs and hair products','oem_factory','https://www.rebeccafashion.com/','Alibaba International','','','','pdf-listed'],
];

const slugify = (s) => s.toLowerCase().replace(/[/&]/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const csv = (rows) => rows.map((row) => row.map((v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}).join(',')).join('\n') + '\n';
const sourceFile = (v) => `data/suppliervol${v}.pdf`;

const baseHeaders = ['slug','name','name_local','type','region','city','loc','verify_state','years','moq','lead','rating','orders_label','capacity','certs','tags','sales','phone','web','founded','employees','area','port','bio','source_volume','source_file','source_claim_status'];
const baseRows = cards.map(([volume, name, alias, region, city, category, type, web, shop, email, phone, contactUrl, webStatus]) => [
  slugify(name), name, alias, type === 'oem_factory' ? 'garment_manufacturer' : type, region, city.split(' / ')[0].split(',')[0].trim(), city.split(' / ')[0].split(',')[0].trim(), 'pending', '', '', '', '', '', '', '{}', `{${category.replaceAll(',', '')}}`, '', phone, web, '', '', '', '', `${category}. Named supplier card in the China Insider Sourcing directory; public-edition claims require independent review before publication.`, volume, sourceFile(volume), 'documented_in_source_pdf'
]);

const contactHeaders = ['supplier_slug','supplier_name','name_local','country','city','sector','email','phone','website_url','website_status','shop_or_platform','contact_url','contact_status','contact_source','notes'];
const contactRows = cards.map(([volume, name, alias, region, city, category, type, web, shop, email, phone, contactUrl, webStatus]) => [slugify(name), name, alias, region.split(' / ')[0], city.split(' / ')[0].split(',')[0].trim(), category, email, phone, web, webStatus, shop, contactUrl || web, email || phone ? 'public_contact_found' : 'not_found_in_checked_sources', webStatus === 'web-verified' ? 'official_website_search' : 'supplier_pdf', shop ? 'Platform/channel named by source; storefront URL was not asserted unless explicitly verified.' : 'No public shop URL captured; corporate/B2B contact is preferred for broker-led sourcing.']);

const sourceHeaders = ['supplier_slug','supplier_name','source_kind','source_url','source_locator','source_claim','evidence_status','checked_at'];
const sourceRows = cards.map(([volume, name]) => [slugify(name), name, 'pdf', sourceFile(volume), `volume_${volume}_named_company_card`, 'Named supplier card and category/location/How to Reach text', 'source_present_not_independently_verified', '2026-08-24']);
for (const [i, row] of cards.entries()) {
  const [volume, name, , , , , , , , , , contactUrl, webStatus] = row;
  if (webStatus === 'web-verified') sourceRows.push([slugify(name), name, 'official_website', contactUrl || row[7], 'public_contact_page_or_official_site', 'Public website/contact details found during web search', 'web_checked', '2026-08-24']);
}

fs.writeFileSync(path.join(outDir, 'suppliers_factories_import.csv'), csv([baseHeaders, ...baseRows]));
fs.writeFileSync(path.join(outDir, 'supplier_contacts_channels.csv'), csv([contactHeaders, ...contactRows]));
fs.writeFileSync(path.join(outDir, 'supplier_source_evidence.csv'), csv([sourceHeaders, ...sourceRows]));
fs.writeFileSync(path.join(outDir, 'README.md'), `# Normalized supplier CSVs\n\nGenerated 2026-08-24 from the four supplied China Insider Sourcing PDFs and a targeted public-website check.\n\n- suppliers_factories_import.csv: core public.factories fields plus explicit city/name_local/provenance columns; map city to public.factories.loc during import. All rows are pending and must pass admin review before publication.\n- supplier_contacts_channels.csv: separate public contact/channel enrichment because public.factories has no email, shop, or source URL columns.\n- supplier_source_evidence.csv: provenance per supplier.\n\nThere are 53 named supplier cards. Cluster-only recommendations are excluded. Blank contact/shop values mean no value was asserted in the checked source set; do not fill them from unverified directories. The PDFs' OFFICIAL/REPORTED labels describe the PDF authors' evidence for customer relationships, not Atelix verification.\n`);

console.log(`Wrote ${cards.length} supplier rows to ${outDir}`);
