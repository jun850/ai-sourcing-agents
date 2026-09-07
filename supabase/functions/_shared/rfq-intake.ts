export type IntakeSubtype = "wholesale" | "blank" | "private_label" | "white_label" | "oem" | "odm" | "cmt" | "apparel" | "footwear" | "bags_accessories" | "jewelry" | "beauty_personal_care" | "home_textiles" | "fibre_yarn" | "fabric" | "leather" | "interlining" | "trims_labels" | "packaging" | "other" | "unclassified";
export type ProcurementMode = "wholesale" | "blank" | "private_label" | "white_label" | "oem" | "odm" | "cmt" | "unspecified";
export type IntakeCategory = "apparel" | "footwear" | "bags_accessories" | "jewelry" | "beauty_personal_care" | "home_textiles" | "fibre_yarn" | "fabric" | "leather" | "interlining" | "trims_labels" | "packaging" | "other" | "unclassified";
const finished = new Set(["apparel", "footwear", "bags_accessories", "jewelry", "beauty_personal_care", "home_textiles"]);

// Buyers write RFQs in their own language. Deterministic classification stays
// English-first (its regexes are English), but these compact non-English keyword
// sets keep a Japanese / Chinese / Indonesian prompt on the right category and
// procurement route before the multilingual model pass runs. Values here are the
// terms that most reliably disambiguate; they are not exhaustive glossaries.
const NON_EN_MODE: [ProcurementMode, RegExp][] = [
  ["private_label", /プライベートブランド|自社ブランド|贴牌|貼牌|私牌|merek sendiri|label pribadi/i],
  ["white_label", /ホワイトレーベル|白牌|white label/i],
  ["oem", /oem|相手先ブランド|委託製造|受託製造|代工|代加工|贴牌代工|jasa maklon|maklon/i],
  ["odm", /odm|設計製造|設計から|原始設計|jasa odm/i],
  ["cmt", /cmt|裁断縫製|縫製のみ|加工のみ|来料加工|jahit potong|cut make trim/i],
  ["wholesale", /卸売|既製品|在庫品|現貨|成品批发|grosir|barang jadi|siap kirim/i],
];
const NON_EN_CATEGORY: [IntakeCategory, RegExp][] = [
  ["leather", /レザー|革|皮革|真皮|kulit/i],
  ["trims_labels", /ボタン|ファスナー|ジッパー|織ネーム|下げ札|ラベル|タグ|纽扣|拉链|织唛|吊牌|标签|kancing|ritsleting|label|hangtag/i],
  ["packaging", /パッケージ|ポリ袋|化粧箱|カートン|包装|폴리백|包装盒|纸箱|kemasan|polybag|kardus|kotak/i],
  ["fibre_yarn", /繊維|糸|紡績|フィラメント|纤维|纱线|纱|benang|serat/i],
  ["fabric", /生地|布地|ファブリック|織物|編み地|ニット地|面料|布料|坯布|梭织|针织面料|kain|bahan kain|tekstil/i],
  ["apparel", /パーカー|フーディ|スウェット|Tシャツ|シャツ|ブラウス|ズボン|パンツ|スカート|ワンピース|ドレス|ジャケット|コート|ニット|セーター|カーディガン|衣類|アパレル|服|卫衣|连帽衫|衬衫|裤子|裙子|连衣裙|夹克|外套|毛衣|针织衫|服装|成衣|kaos|kemeja|celana|rok|gaun|dress|jaket|hoodie|sweater|pakaian|busana/i],
  ["footwear", /靴|シューズ|スニーカー|ブーツ|サンダル|鞋|运动鞋|靴子|凉鞋|sepatu|sandal/i],
  ["bags_accessories", /バッグ|かばん|リュック|財布|ベルト|帽子|スカーフ|包|背包|钱包|腰带|帽子|围巾|tas|ransel|dompet|ikat pinggang|topi|syal/i],
  ["jewelry", /ジュエリー|アクセサリー|指輪|ネックレス|ブレスレット|イヤリング|首饰|珠宝|戒指|项链|手链|耳环|perhiasan|cincin|kalung|gelang|anting/i],
  ["beauty_personal_care", /化粧品|スキンケア|コスメ|化妆品|护肤|香水|kosmetik|perawatan kulit|parfum/i],
  ["home_textiles", /寝具|カーテン|クッション|タオル|テーブルリネン|床品|窗帘|抱枕|毛巾|桌布|seprai|gorden|bantal|handuk/i],
];
function nonEnglishMode(message: string): ProcurementMode {
  for (const [mode, re] of NON_EN_MODE) if (re.test(message)) return mode;
  return "unspecified";
}
function nonEnglishCategory(message: string): IntakeCategory {
  for (const [category, re] of NON_EN_CATEGORY) if (re.test(message)) return category;
  return "unclassified";
}
export function classifyIntake(message: string) { const text = message.toLowerCase(); const englishMode: ProcurementMode = /\b(private label|private-label)\b/.test(text) ? "private_label" : /\b(white label|white-label)\b/.test(text) ? "white_label" : /\b(oem|original equipment manufacturer)\b/.test(text) ? "oem" : /\b(odm|original design manufacturer)\b/.test(text) ? "odm" : /\b(cmt|cut[ -]?make[ -]?trim)\b/.test(text) ? "cmt" : /\b(blank|unbranded)\b/.test(text) ? "blank" : /\b(wholesale|stock product|ready made|ready-made)\b/.test(text) ? "wholesale" : "unspecified"; const procurementMode: ProcurementMode = englishMode !== "unspecified" ? englishMode : nonEnglishMode(message); const englishCategory: IntakeCategory = /\b(leather|suede|nubuck)\b/.test(text) ? "leather" : /\b(interlining|fusible|fusing)\b/.test(text) ? "interlining" : /\b(buttons?|zippers?|zip|trims?|labels?|hangtags?)\b/.test(text) ? "trims_labels" : /\b(packaging|polybag|carton|box|tissue paper|mailer)\b/.test(text) ? "packaging" : /\b(fibre|fiber|yarn|spun|filament)\b/.test(text) ? "fibre_yarn" : /\b(shirts?|t-?shirts?|tees?|blouses?|tunics?|henleys?|trousers?|pants?|slacks?|chinos?|jeans|joggers?|sweatpants?|leggings?|jeggings?|shorts?|skirts?|skorts?|culottes?|dress(?:es)?|gowns?|jumpsuits?|playsuits?|rompers?|overalls?|dungarees?|jackets?|blazers?|coats?|parkas?|hoodies?|sweatshirts?|sweaters?|jumpers?|pullovers?|cardigans?|knitwear|vests?|waistcoats?|garments?|apparel|clothing|uniforms?|scrubs?|coveralls?|polos?|tank ?tops?|crop ?tops?|activewear|sportswear|loungewear|sleepwear|pyjamas?|pajamas?|swimwear|swimsuits?|bikinis?|lingerie|underwear|socks?)\b/.test(text) ? "apparel" : /\b(fabric|textile|yardage|meters?|metres?|gsm|oz\b|woven|knit|cotton|silk|linen|wool|cashmere|viscose|rayon|polyester|nylon|denim|twill|satin|chiffon|jersey)\b/.test(text) ? "fabric" : /\b(shoe|shoes|footwear|sneaker|boot|sandal)\b/.test(text) ? "footwear" : /\b(bag|bags|handbag|backpack|wallet|belt|hat|cap|scarf|accessor)\b/.test(text) ? "bags_accessories" : /\b(jewell?ry|ring|bracelet|necklace|earring)\b/.test(text) ? "jewelry" : /\b(cosmetic|skincare|beauty|personal care|fragrance)\b/.test(text) ? "beauty_personal_care" : /\b(home textile|bedding|curtain|cushion|towel|table linen)\b/.test(text) ? "home_textiles" : "unclassified"; const category: IntakeCategory = englishCategory !== "unclassified" ? englishCategory : nonEnglishCategory(message); const subtype: IntakeSubtype = procurementMode === "unspecified" ? category : procurementMode; const route = procurementMode !== "unspecified" ? (["wholesale", "blank", "private_label", "white_label", "oem", "odm"].includes(procurementMode) ? "finished_goods" : "production_or_materials") : category === "unclassified" ? "unclassified" : finished.has(category) ? "finished_goods" : "production_or_materials"; return { route, subtype, category, procurementMode, confidence: subtype === "unclassified" ? "low" : procurementMode === "unspecified" ? "medium" : "high" }; }

export type Lang = "en" | "ja" | "zh" | "id";
export const LANGS: Lang[] = ["en", "ja", "zh", "id"];
// Per-message language so the assistant can follow the buyer when they switch
// languages inside one RFQ. Script presence settles JA/ZH; Latin script is EN
// unless enough Indonesian function words are present. Returns null when a short
// reply ("black", "ok") carries no signal, so the caller keeps the RFQ's
// established language instead of snapping back to English.
export function detectLanguage(message: string): Lang | null {
  const s = String(message || "").trim();
  if (!s) return null;
  if (/[\u3040-\u30ff\uff66-\uff9f]/.test(s)) return "ja";
  if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(s)) return "zh";
  const lower = s.toLowerCase();
  const idHits = (lower.match(/\b(yang|dan|untuk|atau|dengan|kami|saya|kita|ingin|mau|pesan|memesan|butuh|perlu|buah|potong|lusin|kodi|kain|bahan|celana|kemeja|kaos|jaket|baju|pakaian|pengiriman|kirim|dalam|maksimal|minimal|harga|per\s|produksi|sampel|contoh|warna|ukuran|sekitar|paling|lambat|minggu|bulan|hari|tolong|mohon|terima kasih)\b/g) || []).length;
  if (idHits >= 2) return "id";
  if (/[a-z]/i.test(s) && s.split(/\s+/).length >= 3) return "en";
  return null;
}

const IMMEDIATE_QUESTIONS: Record<Lang, { unclassified: string; make: string; material: string; component: string; generic: string }> = {
  en: {
    unclassified: "What are you sourcing: a finished product, raw material, component, packaging, or production service?",
    make: "What item are you making, do you have a reference or tech pack, and is this for samples or bulk production?",
    material: "What material or construction, quantity and unit, and intended use should we record?",
    component: "What component, material, quantity and unit, dimensions or finish should we record?",
    generic: "What item, quantity, and delivery timeline should we record?",
  },
  ja: {
    unclassified: "調達されるのは、完成品、原材料、部材、包装資材、生産サービスのどれでしょうか？",
    make: "製作されるアイテム、参考資料やテックパックの有無、サンプルと量産のどちらかをお知らせください。",
    material: "素材または編み・織りの仕様、数量と単位、用途を記録したいのでお教えください。",
    component: "部材の種類、素材、数量と単位、寸法または仕上げをお知らせください。",
    generic: "アイテム、数量、納品希望時期を記録したいのでお教えください。",
  },
  zh: {
    unclassified: "您要采购的是成品、原材料、辅料部件、包装还是生产服务？",
    make: "您要生产什么产品？是否有参考样或技术包？此次是打样还是批量生产？",
    material: "请告知材料或织造结构、数量与单位，以及用途，便于我们记录。",
    component: "请告知部件类型、材料、数量与单位、尺寸或工艺，便于我们记录。",
    generic: "请告知产品、数量和交货时间，便于我们记录。",
  },
  id: {
    unclassified: "Anda mencari apa: produk jadi, bahan baku, komponen, kemasan, atau jasa produksi?",
    make: "Produk apa yang akan dibuat, apakah ada referensi atau tech pack, dan ini untuk sampel atau produksi massal?",
    material: "Material atau konstruksi apa, jumlah dan satuannya, serta penggunaannya untuk kami catat?",
    component: "Komponen, material, jumlah dan satuan, dimensi atau finishing apa yang perlu kami catat?",
    generic: "Produk, jumlah, dan tenggat pengiriman apa yang perlu kami catat?",
  },
};
export function immediateQuestion(subtype: IntakeSubtype, lang: Lang = "en") {
  const set = IMMEDIATE_QUESTIONS[lang] || IMMEDIATE_QUESTIONS.en;
  if (subtype === "unclassified") return set.unclassified;
  if (["oem", "odm", "cmt"].includes(subtype)) return set.make;
  if (["fabric", "fibre_yarn", "interlining", "leather"].includes(subtype)) return set.material;
  if (["trims_labels", "packaging"].includes(subtype)) return set.component;
  return set.generic;
}

// Buyers name a product as a noun phrase: a head noun ("pants", "blouse",
// "hoodie") that is usually qualified by style descriptors ("short",
// "short-sleeve", "oversized") and sometimes a material word ("denim",
// "cotton"). Capturing only the head noun silently drops the buyer's intent --
// "short pants" collapsed to "pants", "short-sleeve blouse" to "blouse". This
// keeps the whole descriptor + head-noun phrase exactly as the buyer wrote it,
// so downstream review and matching see the real item. It never invents a
// product the buyer did not name (returns null when no head noun is present).
const PRODUCT_DESCRIPTOR = "short|long|extra[- ]?long|three[- ]?quarter|3\\/4|quarter|full[- ]?length|sleeveless|short[- ]?sleeved?|long[- ]?sleeved?|half[- ]?sleeved?|cap[- ]?sleeved?|puff[- ]?sleeved?|cropped|crop|longline|oversized|boxy|relaxed|relaxed[- ]?fit|loose|loose[- ]?fit|slim|slim[- ]?fit|skinny|regular[- ]?fit|classic[- ]?fit|athletic[- ]?fit|muscle|tapered|straight|straight[- ]?leg|wide[- ]?leg|wide|flared|bootcut|boot[- ]?cut|baggy|carpenter|cargo|utility|combat|pleated|flat[- ]?front|high[- ]?waisted|high[- ]?rise|high[- ]?waist|mid[- ]?rise|low[- ]?rise|drop[- ]?crotch|paperbag|hooded|zip[- ]?up|zip[- ]?through|quarter[- ]?zip|half[- ]?zip|full[- ]?zip|button[- ]?down|button[- ]?up|open[- ]?front|wrap|belted|double[- ]?breasted|single[- ]?breasted|collarless|collared|mock[- ]?neck|turtle[- ]?neck|turtleneck|roll[- ]?neck|funnel[- ]?neck|cowl[- ]?neck|crew[- ]?neck|round[- ]?neck|scoop[- ]?neck|v[- ]?neck|boat[- ]?neck|square[- ]?neck|halter|halter[- ]?neck|off[- ]?shoulder|one[- ]?shoulder|strapless|backless|racerback|racer[- ]?back|spaghetti[- ]?strap|midi|mini|maxi|knee[- ]?length|ankle[- ]?length|floor[- ]?length|a[- ]?line|pencil|bodycon|tiered|pinafore|puffer|quilted|padded|down|shearling|fleece[- ]?lined|sherpa|thermal|insulated|water[- ]?resistant|waterproof|windproof|breathable|moisture[- ]?wicking|compression|seamless|ribbed|cable[- ]?knit|chunky[- ]?knit|waffle[- ]?knit|jacquard|graphic|printed|embroidered|plain|solid|basic|essential|premium|heavyweight|midweight|lightweight|light[- ]?weight|heavy[- ]?weight|garment[- ]?dyed|acid[- ]?washed?|stone[- ]?washed?|distressed|ripped|raw|selvedge|selvage|brushed|enzyme[- ]?washed|pigment[- ]?dyed|tie[- ]?dyed?|colou?r[- ]?blocked?|reversible|packable|convertible|maternity|nursing|adaptive|petite|tall|plus[- ]?size|unisex|men'?s|mens|women'?s|womens|ladies'?|kids'?|kids|children'?s|childrens|boys'?|boys|girls'?|girls|youth|junior|toddler|infant|baby|newborn|resort|beach|holiday|party|evening|cocktail|formal|casual|smart|office|workwear|work|school|sports|gym|running|training|yoga|hiking|outdoor|winter|summer|ski|cotton|organic[- ]?cotton|pima[- ]?cotton|supima|denim|chambray|linen|wool|merino|lambswool|cashmere|alpaca|mohair|silk|satin|velvet|velour|corduroy|cord|twill|chino|canvas|fleece|jersey|terry|french[- ]?terry|pique|poplin|oxford|flannel|seersucker|leather|suede|nubuck|faux[- ]?leather|vegan[- ]?leather|nylon|polyester|spandex|elastane|modal|viscose|rayon|bamboo|hemp|tencel|lyocell|acrylic|ponte|scuba|softshell|ripstop|knit|woven|waxed[- ]?cotton";
const PRODUCT_HEAD_NOUN = "t[- ]?shirts?|tees?|singlets?|polo[- ]?shirts?|polos?|rugby[- ]?shirts?|henleys?|sweatshirts?|hoodies?|overshirts?|shirts?|blouses?|tunics?|tank[- ]?tops?|camisoles?|tube[- ]?tops?|crop[- ]?tops?|halter[- ]?tops?|bralettes?|trousers?|pants?|slacks?|chinos?|jeans|joggers?|sweatpants?|track[- ]?pants?|leggings?|jeggings?|shorts?|boardshorts?|bermudas?|culottes?|skorts?|skirts?|kilts?|dresses?|gowns?|sundresses?|jumpsuits?|playsuits?|rompers?|overalls?|dungarees?|boilersuits?|jackets?|blazers?|coats?|overcoats?|parkas?|anoraks?|windbreakers?|raincoats?|trench[- ]?coats?|gilets?|bodywarmers?|puffers?|cardigans?|sweaters?|jumpers?|pullovers?|ponchos?|capes?|vests?|waistcoats?|suits?|tuxedos?|uniforms?|scrubs?|coveralls?|aprons?|smocks?|robes?|bathrobes?|dressing[- ]?gowns?|kimonos?|kaftans?|caftans?|abayas?|kurtas?|sarongs?|activewear|sportswear|tracksuits?|loungewear|pyjamas?|pajamas?|nightwear|nightgowns?|nightdresses?|nighties|sleepwear|underwear|boxer[- ]?briefs?|panties|knickers?|thongs?|bras?|lingerie|shapewear|bodysuits?|leotards?|unitards?|corsets?|bustiers?|swimwear|swimsuits?|swim[- ]?trunks?|bikinis?|tankinis?|one[- ]?pieces?|rash[- ]?guards?|wetsuits?|base[- ]?layers?|socks?|stockings?|tights?|pantyhose|hosiery|leg[- ]?warmers?|gloves?|mittens?|scarves|scarfs?|shawls?|snoods?|hats?|caps?|beanies?|berets?|bucket[- ]?hats?|visors?|headbands?|bandanas?|balaclavas?|neckties?|bow[- ]?ties?|cravats?|pocket[- ]?squares?|cummerbunds?|belts?|sneakers?|trainers?|shoes?|boots?|sandals?|loafers?|espadrilles?|mules?|clogs?|slippers?|moccasins?|tops";
const PRODUCT_PHRASE_RE = new RegExp("\\b((?:(?:performance|" + PRODUCT_DESCRIPTOR + ")[- ]+){0,4}(?:" + PRODUCT_HEAD_NOUN + "))\\b", "gi");
export function extractProductPhrase(message: string): string | null {
  return extractProductPhrases(message).sort((left, right) => right.length - left.length)[0] || null;
}
export function extractProductPhrases(message: string): string[] {
  const source = String(message || "").replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  const candidates = [...source.matchAll(PRODUCT_PHRASE_RE)]
    .map((match) => match[1].replace(/\s+/g, " ").trim().toLowerCase())
    .filter((phrase) => phrase !== "tops" && phrase !== "top");
  return [...new Set(candidates.filter((phrase) => !["activewear", "sportswear", "loungewear"].includes(phrase)))];
}
