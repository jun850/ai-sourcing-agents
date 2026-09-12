export type IntakeRoute = "finished_goods" | "production_or_materials" | "unclassified";
export type ProcurementMode = "wholesale" | "blank" | "private_label" | "white_label" | "oem" | "odm" | "cmt" | "unspecified";
export type IntakeCategory = "apparel" | "footwear" | "bags_accessories" | "jewelry" | "beauty_personal_care" | "home_textiles" | "fibre_yarn" | "fabric" | "leather" | "interlining" | "trims_labels" | "packaging" | "other" | "unclassified";
export type IntakeSubtype = Exclude<ProcurementMode, "unspecified"> | Exclude<IntakeCategory, "unclassified"> | "unclassified";
export type IntakeFieldState = "provided" | "missing" | "not_applicable";
export type IntakeField = { key: string; label: string; state: IntakeFieldState; value: string };
export type RfqIntakeItem = { id: string; subtype: IntakeSubtype; category: IntakeCategory; procurementMode: ProcurementMode; fields: IntakeField[] };
export type RfqIntake = { route: IntakeRoute; subtype: IntakeSubtype; confidence: "high" | "medium" | "low"; items: RfqIntakeItem[] };

/**
 * The RFQ copilot's server-side classifier has a smaller internal shape than
 * the workspace's editable intake model. Never let that internal response
 * replace the UI model unless it has the complete, renderable workspace shape.
 */
export function isRfqIntake(value: unknown): value is RfqIntake {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const intake = value as Partial<RfqIntake>;
  return (
    typeof intake.route === "string" &&
    typeof intake.subtype === "string" &&
    typeof intake.confidence === "string" &&
    Array.isArray(intake.items) &&
    intake.items.every(
      (item) =>
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof item.id === "string" &&
        typeof item.subtype === "string" &&
        typeof item.category === "string" &&
        typeof item.procurementMode === "string" &&
        Array.isArray(item.fields) &&
        item.fields.every(
          (field) =>
            field &&
            typeof field === "object" &&
            !Array.isArray(field) &&
            typeof field.key === "string" &&
            typeof field.label === "string" &&
            typeof field.state === "string" &&
            typeof field.value === "string",
        ),
    )
  );
}

type ProfileField = readonly [key: string, label: string, optional?: boolean];
const COMMON: ProfileField[] = [["item", "Item"], ["quantity", "Quantity"], ["timeline", "Timeline", true]];
const PROFILES: Record<Exclude<IntakeSubtype, "unclassified">, ProfileField[]> = {
  wholesale: [...COMMON, ["destination", "Delivery destination"], ["brand_requirement", "Branding requirement", true]], blank: [...COMMON, ["color", "Color", true], ["size_range", "Size range", true], ["brand_requirement", "Branding requirement", true]],
  private_label: [...COMMON, ["reference", "Reference or product direction"], ["material_construction", "Material or construction"], ["branding", "Branding"], ["size_color_scope", "Sizes and colors", true], ["technical_requirements", "Technical requirements", true], ["packaging", "Packaging", true], ["incoterm", "Incoterm", true], ["payment_terms", "Payment terms", true]], white_label: [...COMMON, ["reference", "Reference or product direction"], ["branding", "Branding"], ["size_color_scope", "Sizes and colors", true], ["incoterm", "Incoterm", true], ["payment_terms", "Payment terms", true]],
  oem: [...COMMON, ["reference", "Reference or product direction"], ["tech_pack", "Tech pack or pattern status", true], ["material_construction", "Material or construction"], ["branding", "Branding", true], ["technical_requirements", "Technical requirements", true], ["packaging", "Packaging", true], ["incoterm", "Incoterm", true], ["payment_terms", "Payment terms", true]], odm: [...COMMON, ["product_direction", "Product direction"], ["customisation", "Requested customisation"], ["branding", "Branding", true], ["technical_requirements", "Technical requirements", true], ["incoterm", "Incoterm", true], ["payment_terms", "Payment terms", true]], cmt: [...COMMON, ["tech_pack", "Tech pack or pattern status"], ["materials_supply", "Materials supplied or to procure"], ["stage", "Sample or bulk stage"], ["incoterm", "Incoterm", true], ["payment_terms", "Payment terms", true]],
  apparel: [...COMMON, ["material_construction", "Material or construction", true], ["size_color_scope", "Sizes and colors", true]], footwear: [...COMMON, ["material_construction", "Material or construction"], ["size_range", "Size range"], ["reference", "Reference", true]], bags_accessories: [...COMMON, ["material_construction", "Material or construction"], ["dimensions", "Dimensions", true], ["reference", "Reference", true]], jewelry: [...COMMON, ["material", "Material"], ["finish", "Finish", true], ["dimensions", "Dimensions", true]], beauty_personal_care: [...COMMON, ["formula_or_product", "Formula or product direction"], ["packaging", "Packaging", true], ["compliance_requirement", "Compliance requirement", true]], home_textiles: [...COMMON, ["material_construction", "Material or construction"], ["dimensions", "Dimensions"], ["reference", "Reference", true]],
  fibre_yarn: [["material", "Fibre or composition"], ["yarn_type", "Yarn type or count"], ["finish", "Finish", true], ["quantity", "Quantity and unit"], ["intended_use", "Intended use"]], fabric: [["material", "Fibre or material"], ["construction", "Knit or woven construction"], ["weight", "Weight", true], ["width", "Width", true], ["finish", "Finish", true], ["color_print", "Color or print", true], ["quantity", "Quantity and unit"], ["intended_use", "Intended use"]], leather: [["material", "Leather or material type"], ["thickness", "Thickness", true], ["finish", "Finish", true], ["color", "Color", true], ["dimensions", "Dimensions", true], ["quantity", "Quantity and unit"], ["intended_use", "Intended use"]], interlining: [["material", "Material"], ["construction", "Construction"], ["weight", "Weight", true], ["width", "Width", true], ["adhesive", "Fusible or sew-in", true], ["quantity", "Quantity and unit"]], trims_labels: [["component", "Component type"], ["material", "Material"], ["dimensions", "Dimensions", true], ["finish_color", "Finish or color", true], ["function", "Function or attachment", true], ["quantity", "Quantity and unit"], ["reference", "Reference", true]], packaging: [["component", "Packaging component"], ["material", "Material"], ["dimensions", "Dimensions", true], ["finish_color", "Finish or print", true], ["quantity", "Quantity and unit"], ["branding", "Branding", true]], other: [...COMMON, ["specification", "Specification or intended use", true]],
};
const INCO_TERMS = /\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b/i;
const PAYMENT_TERMS = /\b(?:T\/?T|L\/?C|LC|CAD|open account|cash against documents|net\s*\d+|\d{1,3}\s*\/\s*\d{1,3}|\d+%\s*(?:deposit|advance|upfront|balance))\b/i;
function statedIntakeValue(key: string, prompt: string): string {
  const source = prompt.replace(/\s+/g, " ").trim();
  const quantity = source.match(/\b(\d[\d,.]*)\s*(?:total\s+)?(pieces?|pcs?|units?|meters?|metres?|yards?|yd|kg|kgs|kilograms?)\b/i);
  const sizeRange = source.match(/\b(?:XS|S|M|L|XL|XXL|XXXL)\s*(?:to|[-–])\s*(?:XS|S|M|L|XL|XXL|XXXL)\b/i)?.[0];
  const colorAllocations = [...source.matchAll(/\b(\d[\d,.]*)\s*(?:pieces?|pcs?|units?)\s+in\s+(black|white|navy|blue|red|green|grey|gray|beige|brown|pink|yellow|orange|purple)\b/gi)];
  const colors = colorAllocations.map((match) => `${match[2]} (${match[1]} pcs)`).join(", ");
  const material = source.match(/\b(?:constructed|made|fabricated)\s+from\s+(?:an?\s+|the\s+)?(.+?)(?=\s+and\s+(?:require|include)|\s*,\s*(?:EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP|\d+%\s*(?:deposit|advance|upfront)|T\/?T|L\/?C)|[.;]|$)/i)?.[1]?.trim();
  const technical = source.match(/\b(?:waterproof|water[- ]?resistant|windproof|breathable|moisture[- ]?wicking|stretch|recovery|compression|seamless|UPF|flame[- ]?retardant)[^.;]*?(?=\s*,\s*(?:EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP|\d+%\s*(?:deposit|advance|upfront)|T\/?T|L\/?C)|[.;]|$)/i)?.[0]?.trim();
  const branding = source.match(/\b(?:full\s+)?(?:private|white)\s+label(?:\s+customi[sz]ation(?:,\s*including\s*[^.;]+)?)?/i)?.[0]?.trim() || source.match(/\b(?:custom\s+(?:neck|care|content|woven|printed)\s+labels?|branding|logo)\b/i)?.[0]?.trim();
  const packaging = source.match(/\b(?:individual\s+)?(?:polybag|carton|box|tissue paper|mailer|packaging)\b/i)?.[0]?.trim();
  const incoterm = source.match(INCO_TERMS)?.[0] || "";
  const payment = source.match(PAYMENT_TERMS)?.[0] || "";
  if (key === "item" || key === "product_direction" || key === "formula_or_product") return extractProductPhrase(source) || "";
  if (key === "quantity") return quantity ? `${quantity[1]} ${quantity[2]}` : "";
  if (key === "material" || key === "material_construction" || key === "materials_supply") return material || "";
  if (key === "size_color_scope" || key === "size_range") return [sizeRange, colors].filter(Boolean).join(" · ");
  if (key === "branding" || key === "brand_requirement" || key === "customisation") return branding || "";
  if (key === "technical_requirements") return technical || "";
  if (key === "packaging") return packaging || "";
  if (key === "incoterm") return incoterm;
  if (key === "payment_terms") return payment;
  return "";
}
function modeFor(text: string): ProcurementMode { return /\b(private label|private-label)\b/.test(text) ? "private_label" : /\b(white label|white-label)\b/.test(text) ? "white_label" : /\b(oem|original equipment manufacturer)\b/.test(text) ? "oem" : /\b(odm|original design manufacturer)\b/.test(text) ? "odm" : /\b(cmt|cut[ -]?make[ -]?trim)\b/.test(text) ? "cmt" : /\b(blank|unbranded)\b/.test(text) ? "blank" : /\b(wholesale|stock product|ready made|ready-made)\b/.test(text) ? "wholesale" : "unspecified"; }
const NON_EN_MODE: [ProcurementMode, RegExp][] = [
  ["private_label", /プライベートブランド|自社ブランド|贴牌|貼牌|私牌|merek sendiri|label pribadi/i],
  ["white_label", /ホワイトレーベル|白牌|white label/i],
  ["oem", /oem|相手先ブランド|委託製造|受託製造|代工|代加工|贴牌代工|jasa maklon|maklon/i],
  ["odm", /odm|設計製造|設計から|原始設計|jasa odm/i],
  ["cmt", /cmt|裁断縫製|縫製のみ|加工のみ|来料加工|jahit potong|cut make trim/i],
  ["wholesale", /卸売|既製品|在庫品|現貨|成品批发|grosir|barang jadi|siap kirim/i],
];
const NON_EN_CATEGORY: [IntakeCategory, RegExp][] = [
  ["apparel", /パーカー|フーディ|スウェット|Tシャツ|シャツ|ブラウス|ズボン|パンツ|スカート|ワンピース|ドレス|ジャケット|コート|ニット|セーター|カーディガン|衣類|アパレル|服|卫衣|连帽衫|衬衫|裤子|裙子|连衣裙|夹克|外套|毛衣|针织衫|服装|成衣|kaos|kemeja|celana|rok|gaun|dress|jaket|hoodie|sweater|pakaian|busana/i],
  ["footwear", /靴|シューズ|スニーカー|ブーツ|サンダル|鞋|运动鞋|靴子|凉鞋|sepatu|sandal/i],
  ["bags_accessories", /バッグ|かばん|リュック|財布|ベルト|帽子|スカーフ|包|背包|钱包|腰带|帽子|围巾|tas|ransel|dompet|ikat pinggang|topi|syal/i],
  ["jewelry", /ジュエリー|アクセサリー|指輪|ネックレス|ブレスレット|イヤリング|首饰|珠宝|戒指|项链|手链|耳环|perhiasan|cincin|kalung|gelang|anting/i],
  ["beauty_personal_care", /化粧品|スキンケア|コスメ|化妆品|护肤|香水|kosmetik|perawatan kulit|parfum/i],
  ["home_textiles", /寝具|カーテン|クッション|タオル|テーブルリネン|床品|窗帘|抱枕|毛巾|桌布|seprai|gorden|bantal|handuk/i],
  ["trims_labels", /ボタン|ファスナー|ジッパー|織ネーム|下げ札|ラベル|タグ|纽扣|拉链|织唛|吊牌|标签|kancing|ritsleting|label|hangtag/i],
  ["packaging", /パッケージ|ポリ袋|化粧箱|カートン|包装|폴리백|包装盒|纸箱|kemasan|polybag|kardus|kotak/i],
  ["leather", /レザー|革|皮革|真皮|kulit/i],
  ["fibre_yarn", /繊維|糸|紡績|フィラメント|纤维|纱线|纱|benang|serat/i],
  ["fabric", /生地|布地|ファブリック|織物|編み地|ニット地|面料|布料|坯布|梭织|针织面料|kain|bahan kain|tekstil/i],
];
function categoryFor(text: string): IntakeCategory {
  const lower = text.toLowerCase();
  const finishedCategory: IntakeCategory = /\b(shirts?|t-?shirts?|tees?|blouses?|tunics?|henleys?|trousers?|pants?|slacks?|chinos?|jeans|joggers?|sweatpants?|leggings?|jeggings?|shorts?|skirts?|skorts?|culottes?|dress(?:es)?|gowns?|jumpsuits?|playsuits?|rompers?|overalls?|dungarees?|jackets?|blazers?|coats?|parkas?|hoodies?|sweatshirts?|sweaters?|jumpers?|pullovers?|cardigans?|knitwear|vests?|waistcoats?|garments?|apparel|clothing|uniforms?|scrubs?|coveralls?|polos?|tank ?tops?|crop ?tops?|activewear|sportswear|loungewear|sleepwear|pyjamas?|pajamas?|swimwear|swimsuits?|bikinis?|lingerie|underwear|socks?)\b/.test(lower) ? "apparel"
    : /\b(shoes?|footwear|sneakers?|boots?|sandals?)\b/.test(lower) ? "footwear"
      : /\b(bags?|handbags?|backpacks?|wallets?|belts?|hats?|caps?|scar(?:f|ves)|accessor(?:y|ies))\b/.test(lower) ? "bags_accessories"
        : /\b(jewell?ry|rings?|bracelets?|necklaces?|earrings?)\b/.test(lower) ? "jewelry"
          : /\b(cosmetics?|skincare|beauty|personal care|fragrances?)\b/.test(lower) ? "beauty_personal_care"
            : /\b(home textiles?|bedding|curtains?|cushions?|towels?|table linens?)\b/.test(lower) ? "home_textiles"
              : "unclassified";
  const componentCategory: IntakeCategory = /\b(interlining|fusible|fusing)\b/.test(lower) ? "interlining"
    : /\b(buttons?|zippers?|zip|trims?|labels?|hangtags?)\b/.test(lower) ? "trims_labels"
      : /\b(packaging|polybag|carton|box|tissue paper|mailer)\b/.test(lower) ? "packaging"
        : "unclassified";
  const componentForFinished = /\b(interlining|fusible|fusing|buttons?|zippers?|zip|trims?|labels?|hangtags?|packaging|polybag|carton|box|tissue paper|mailer)\b[^.!?]{0,48}\bfor\b/.test(lower);
  const englishCategory: IntakeCategory = componentCategory !== "unclassified" && (finishedCategory === "unclassified" || componentForFinished) ? componentCategory
    : finishedCategory !== "unclassified" ? finishedCategory
      : /\b(leather|suede|nubuck)\b/.test(lower) ? "leather"
        : /\b(fibre|fiber|yarn|spun|filament)\b/.test(lower) ? "fibre_yarn"
          : /\b(fabric|textile|yardage|meters?|metres?|gsm|oz\b|woven|knit|cotton|silk|linen|wool|cashmere|viscose|rayon|polyester|nylon|denim|twill|satin|chiffon|jersey)\b/.test(lower) ? "fabric"
            : "unclassified";
  if (englishCategory !== "unclassified") return englishCategory;
  for (const [category, re] of NON_EN_CATEGORY) if (re.test(text)) return category;
  return "unclassified";
}
export function classifyRfqIntake(prompt: string): RfqIntake { const englishMode = modeFor(prompt.toLowerCase()); const procurementMode = englishMode !== "unspecified" ? englishMode : NON_EN_MODE.find(([, re]) => re.test(prompt))?.[0] ?? "unspecified"; const category = categoryFor(prompt); const subtype: IntakeSubtype = procurementMode !== "unspecified" ? procurementMode : category; const route: IntakeRoute = procurementMode !== "unspecified" ? (["wholesale", "blank", "private_label", "white_label", "oem", "odm"].includes(procurementMode) ? "finished_goods" : "production_or_materials") : category === "unclassified" ? "unclassified" : ["apparel", "footwear", "bags_accessories", "jewelry", "beauty_personal_care", "home_textiles"].includes(category) ? "finished_goods" : "production_or_materials"; const fields = subtype === "unclassified" ? [] : PROFILES[subtype].map(([key, label, optional]) => { const value = statedIntakeValue(key, prompt); return { key, label, state: value ? "provided" as const : optional ? "not_applicable" as const : "missing" as const, value }; }); return { route, subtype, confidence: subtype === "unclassified" ? "low" : procurementMode === "unspecified" ? "medium" : "high", items: fields.length ? [{ id: "item-1", subtype, category, procurementMode, fields }] : [] }; }
export function intakeFromBrief(brief: Record<string, unknown>): RfqIntake | null { const value = brief.intake; return isRfqIntake(value) ? value : null; }

// Buyers name a product as a noun phrase: a head noun ("pants", "blouse",
// "hoodie") that is usually qualified by style descriptors ("short",
// "short-sleeve", "oversized") and sometimes a material word ("denim",
// "cotton"). Capturing only the head noun silently drops the buyer's intent --
// "short pants" collapsed to "pants", "short-sleeve blouse" to "blouse". This
// keeps the whole descriptor + head-noun phrase exactly as the buyer wrote it.
// It never invents a product the buyer did not name (returns null when there is
// no head noun). Kept in sync with supabase/functions/_shared/rfq-intake.ts.
const PRODUCT_DESCRIPTOR = "short|long|extra[- ]?long|three[- ]?quarter|3\\/4|quarter|full[- ]?length|sleeveless|short[- ]?sleeved?|long[- ]?sleeved?|half[- ]?sleeved?|cap[- ]?sleeved?|puff[- ]?sleeved?|cropped|crop|longline|oversized|boxy|relaxed|relaxed[- ]?fit|loose|loose[- ]?fit|slim|slim[- ]?fit|skinny|regular[- ]?fit|classic[- ]?fit|athletic[- ]?fit|muscle|tapered|straight|straight[- ]?leg|wide[- ]?leg|wide|flared|bootcut|boot[- ]?cut|baggy|carpenter|cargo|utility|combat|pleated|flat[- ]?front|high[- ]?waisted|high[- ]?rise|high[- ]?waist|mid[- ]?rise|low[- ]?rise|drop[- ]?crotch|paperbag|hooded|zip[- ]?up|zip[- ]?through|quarter[- ]?zip|half[- ]?zip|full[- ]?zip|button[- ]?down|button[- ]?up|open[- ]?front|wrap|belted|double[- ]?breasted|single[- ]?breasted|collarless|collared|mock[- ]?neck|turtle[- ]?neck|turtleneck|roll[- ]?neck|funnel[- ]?neck|cowl[- ]?neck|crew[- ]?neck|round[- ]?neck|scoop[- ]?neck|v[- ]?neck|boat[- ]?neck|square[- ]?neck|halter|halter[- ]?neck|off[- ]?shoulder|one[- ]?shoulder|strapless|backless|racerback|racer[- ]?back|spaghetti[- ]?strap|midi|mini|maxi|knee[- ]?length|ankle[- ]?length|floor[- ]?length|a[- ]?line|pencil|bodycon|tiered|pinafore|puffer|quilted|padded|down|shearling|fleece[- ]?lined|sherpa|thermal|insulated|water[- ]?resistant|waterproof|windproof|breathable|moisture[- ]?wicking|compression|seamless|ribbed|cable[- ]?knit|chunky[- ]?knit|waffle[- ]?knit|jacquard|graphic|printed|embroidered|plain|solid|basic|essential|premium|heavyweight|midweight|lightweight|light[- ]?weight|heavy[- ]?weight|garment[- ]?dyed|acid[- ]?washed?|stone[- ]?washed?|distressed|ripped|raw|selvedge|selvage|brushed|enzyme[- ]?washed|pigment[- ]?dyed|tie[- ]?dyed?|colou?r[- ]?blocked?|reversible|packable|convertible|maternity|nursing|adaptive|petite|tall|plus[- ]?size|unisex|men'?s|mens|women'?s|womens|ladies'?|kids'?|kids|children'?s|childrens|boys'?|boys|girls'?|girls|youth|junior|toddler|infant|baby|newborn|resort|beach|holiday|party|evening|cocktail|formal|casual|smart|office|workwear|work|school|sports|performance|gym|running|training|yoga|hiking|outdoor|winter|summer|ski|cotton|organic[- ]?cotton|pima[- ]?cotton|supima|denim|chambray|linen|wool|merino|lambswool|cashmere|alpaca|mohair|silk|satin|velvet|velour|corduroy|cord|twill|chino|canvas|fleece|jersey|terry|french[- ]?terry|pique|poplin|oxford|flannel|seersucker|leather|suede|nubuck|faux[- ]?leather|vegan[- ]?leather|nylon|polyester|spandex|elastane|modal|viscose|rayon|bamboo|hemp|tencel|lyocell|acrylic|ponte|scuba|softshell|ripstop|knit|woven|waxed[- ]?cotton";
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
