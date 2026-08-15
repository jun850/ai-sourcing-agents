"use strict";

const { SourceAdapter } = require("./source-adapter");

const SOURCE_ID = "apparelx";
const CANONICAL_ORIGIN = "https://www.apparel-x.com";
const CANONICAL_HOST = "www.apparel-x.com";
const VIETNAM_HOST = "vn.apparelx.com";
const SCOPES = Object.freeze(["suppliers", "oem", "fabrics", "interlining"]);
const LIST_ENDPOINT = `${CANONICAL_ORIGIN}/php/GetApparelXBusinessList.php`;
const ITEM_LIST_ENDPOINT = `${CANONICAL_ORIGIN}/php/GetApparelXItemList.php`;
const PRODUCT_SCOPE_CONFIG = Object.freeze({
  fabrics: Object.freeze({ category: "FABRIC", seedUrl: `${CANONICAL_ORIGIN}/search.php?category=FABRIC` }),
  interlining: Object.freeze({ category: "INTERLINING", seedUrl: `${CANONICAL_ORIGIN}/search.php?category=INTERLINING` }),
});

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function htmlToText(value) {
  return decodeHtml(String(value || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p\s*>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function canonicalizeApparelXUrl(value) {
  const url = new URL(value, `${CANONICAL_ORIGIN}/`);
  if (url.protocol !== "https:") throw new Error(`ApparelX URL must use HTTPS: ${url.href}`);
  if (url.hostname === VIETNAM_HOST) url.hostname = CANONICAL_HOST;
  if (url.hostname !== CANONICAL_HOST || url.port || url.username || url.password) {
    throw new Error(`Refusing non-ApparelX URL: ${url.href}`);
  }
  url.hash = "";
  return url.href;
}

function safeSourceId(value, fallback) {
  const result = String(value || "").normalize("NFKC").replace(/[^\p{Letter}\p{Number}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 160);
  return result || fallback;
}

function tags(value) {
  return [...new Set(String(value || "").split(",").map((part) => part.trim()).filter(Boolean))];
}

function profileUrl(record) {
  const address = String(record.ApparelXHomePageAddress || "").trim();
  const slug = address && !address.includes("://") && !address.startsWith("/")
    ? address : record.CompanyAbbreviation || record.Company;
  return canonicalizeApparelXUrl(`/business/${encodeURIComponent(String(slug || ""))}`);
}

function extractMeta(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    if (match) return decodeHtml(match[1]).trim();
  }
  return "";
}

function extractJsonLdProducts(html) {
  const products = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(String(html || "")))) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1]).trim());
      const values = Array.isArray(parsed) ? parsed : parsed?.["@graph"] || [parsed];
      for (const value of values) {
        const types = Array.isArray(value?.["@type"]) ? value["@type"] : [value?.["@type"]];
        if (types.includes("Product")) products.push(value);
      }
    } catch {
      // Invalid third-party JSON-LD is retained in raw evidence and ignored here.
    }
  }
  return products;
}

function extractProductLinks(html, pageUrl) {
  const links = [];
  const seen = new Set();
  const pattern = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = pattern.exec(String(html || "")))) {
    let url;
    try { url = canonicalizeApparelXUrl(new URL(decodeHtml(match[1]), pageUrl)); } catch { continue; }
    const parsed = new URL(url);
    const isProduct = /\/(?:item|items|product|products)\//i.test(parsed.pathname)
      || /(?:item|product)(?:id|code)=/i.test(parsed.search);
    if (!isProduct || seen.has(url)) continue;
    seen.add(url);
    links.push({ kind: "product", sourceId: safeSourceId(parsed.searchParams.get("itemid") || parsed.searchParams.get("productid") || parsed.pathname.split("/").filter(Boolean).pop(), `product-${links.length + 1}`), url });
  }
  return links;
}

function extractNextPageUrl(html, pageUrl) {
  const pattern = /<a\b[^>]*>/gi;
  let match;
  while ((match = pattern.exec(String(html || "")))) {
    const rel = match[0].match(/\brel=["']([^"']+)["']/i)?.[1] || "";
    if (!rel.split(/\s+/).some((token) => token.toLowerCase() === "next")) continue;
    const href = match[0].match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try { return canonicalizeApparelXUrl(new URL(decodeHtml(href), pageUrl)); } catch { return null; }
  }
  return null;
}

function firstText(html, className) {
  const pattern = new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\/[^>]+>`, "i");
  return htmlToText(String(html || "").match(pattern)?.[1] || "");
}

function extractAttribute(html, id, attribute) {
  const escapedId = String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = String(html || "").match(new RegExp(`<[^>]+\\bid=["']${escapedId}["'][^>]*>`, "i"))?.[0] || "";
  return decodeHtml(tag.match(new RegExp(`\\b${attribute}=["']([^"']*)["']`, "i"))?.[1] || "").trim();
}

function extractDetailTable(html) {
  const fields = {};
  const rows = String(html || "").match(/<tr\b[^>]*class=["'][^"']*\bdetailinfobox\b[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const label = htmlToText(row.match(/<th\b[^>]*class=["'][^"']*\bdetailinfo_caption\b[^"']*["'][^>]*>([\s\S]*?)<\/th>/i)?.[1] || "");
    const value = htmlToText(row.match(/<td\b[^>]*class=["'][^"']*\bdetailinfo_value\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1] || "");
    const type = row.match(/\btype=["']([^"']+)["']/i)?.[1] || "";
    if (!label || !value) continue;
    const key = ({
      Category: "category", Subcategory: "subcategory", Gender: "gender",
      "Use Applications": "useApplications", Season: "season", Organization: "organization",
      "Color Pattern": "colorPattern", Style: "style", Specification: "specification",
      Material: "material", Handling: "handling", Maker: "maker",
    })[label] || type || label;
    fields[key] = value;
  }
  return fields;
}

function extractCodeNamePairs(html, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `class=["'][^"']*\\b${escaped}box_${escaped === "itemcolor" ? "color" : escaped.replace(/^item/, "")}code\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>[\\s\\S]*?class=["'][^"']*\\b${escaped}box_${escaped === "itemcolor" ? "color" : escaped.replace(/^item/, "")}name\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`,
    "gi",
  );
  const values = [];
  let match;
  while ((match = pattern.exec(String(html || "")))) {
    values.push({ code: htmlToText(match[1]), name: htmlToText(match[2]) });
  }
  return values;
}

function extractSimpleOptions(html, type) {
  const values = [];
  const pattern = new RegExp(
    `<div[^>]+class=["'][^"']*\\bitem${type}box\\b[^"']*\\bskubox\\b[^"']*["'][^>]*>([\\s\\S]*?)(?=<div[^>]+class=["'][^"']*\\bitem${type}box\\b|<\\/div>\\s*<\\/div>)`,
    "gi",
  );
  let match;
  while ((match = pattern.exec(String(html || "")))) {
    const text = htmlToText(match[1]);
    if (text) values.push(text);
  }
  return [...new Set(values)];
}

function extractCodes(html, attribute) {
  const values = [];
  const pattern = new RegExp(`\\b${attribute}=["']([^"']+)["']`, "gi");
  let match;
  while ((match = pattern.exec(String(html || "")))) values.push(decodeHtml(match[1]).trim());
  return [...new Set(values.filter(Boolean))];
}

function extractFaqs(html) {
  const values = [];
  const pattern = /<div[^>]+itemprop=["']name["'][^>]*>([\s\S]*?)<\/div>[\s\S]*?<div[^>]+itemprop=["']text["'][^>]*>([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = pattern.exec(String(html || "")))) {
    const question = htmlToText(match[1]);
    const answer = htmlToText(match[2]);
    if (question && answer) values.push({ question, answer });
  }
  return values;
}

function extractProfileDetails(html) {
  const labels = new Map([
    ["事業内容", "businessDescription"], ["セールスポイント", "sellingPoints"],
    ["年商", "annualSales"], ["資本金", "capital"], ["設立日", "establishedDate"],
    ["代表者", "representative"], ["従業員数", "employeeCount"], ["沿革", "history"],
    ["主要取引銀行", "banks"], ["主要取引先", "majorCustomers"], ["Eメールアドレス", "email"],
    ["TEL", "phone"], ["FAX", "fax"], ["公式サイトアドレス", "website"],
  ]);
  const details = {};
  const pattern = /<div[^>]+class=["'][^"']*axsite_bodyarea_itemtitle[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]+class=["'][^"']*axsite_bodyarea_itemcontent[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = pattern.exec(String(html || "")))) {
    const field = labels.get(htmlToText(match[1]));
    if (field) details[field] = htmlToText(match[2]);
  }
  return details;
}

function fullSizeProductImageUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace("/img/item/thumb/", "/img/item/").replace(/_t2(?=\.[^.]+$)/i, "");
  return url.href;
}

function extractImages(html, pageUrl, { entityType = "supplier" } = {}) {
  const images = [];
  const seen = new Set();
  const pattern = /<img\b[^>]*>/gi;
  let match;
  while ((match = pattern.exec(String(html || "")))) {
    const source = match[0].match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!source) continue;
    let url;
    try { url = canonicalizeApparelXUrl(new URL(decodeHtml(source), pageUrl)); } catch { continue; }
    if (!/\.(?:avif|gif|jpe?g|png|webp|svg)(?:\?|$)/i.test(url) || seen.has(url)) continue;
    if (entityType === "product") {
      const className = match[0].match(/\bclass=["']([^"']*)["']/i)?.[1] || "";
      const id = match[0].match(/\bid=["']([^"']*)["']/i)?.[1] || "";
      if (!/(?:^|\s)item(?:main|sub)photo(?:\s|$)/i.test(className) && !/^item(?:main|sub)photo$/i.test(id)) continue;
      url = fullSizeProductImageUrl(url);
    } else if (!/\/img\/(?:profile|system)\//i.test(new URL(url).pathname)) {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    images.push({ sourceUrl: url, kind: /\/profile\/[^/]+\/company\./i.test(url) ? "logo" : entityType === "product" ? "product" : "source_image" });
  }
  return images;
}

class ApparelXAdapter extends SourceAdapter {
  constructor() {
    super({ id: SOURCE_ID, allowedScopes: SCOPES });
  }

  canonicalizeUrl(value) { return canonicalizeApparelXUrl(value); }

  async *discover(client, { scope, pageSize = 100, maxItems = Infinity, seedUrls = [], onEvidence = async () => {} } = {}) {
    this.assertScope(scope);
    if (!(maxItems === Infinity || (Number.isInteger(maxItems) && maxItems > 0))) {
      throw new Error("maxItems must be a positive integer or Infinity");
    }
    if (scope === "suppliers" || scope === "oem") {
      let yielded = 0;
      for (let page = 1; ; page += 1) {
        const url = new URL(LIST_ENDPOINT);
        url.searchParams.set("loginid", "");
        url.searchParams.set("businesstype", scope === "oem" ? "OEM/ODM" : "");
        url.searchParams.set("pageno", String(page));
        url.searchParams.set("onepagecount", String(pageSize));
        url.searchParams.set("datatype", "json2");
        const response = await client.get(url, { accept: "application/json" });
        const body = await response.text();
        await onEvidence({ kind: "discovery", sourceId: `${scope}-page-${page}`, url: response.url || url.href, body, contentType: response.headers?.get?.("content-type") || "application/json" });
        const payload = JSON.parse(body);
        if (!Array.isArray(payload)) throw new Error("ApparelX supplier endpoint did not return an array");
        const records = scope === "oem" ? payload.filter((record) => tags(record?.BusinessTags).includes("OEM/ODM")) : payload;
        for (const record of records) {
          if (!record?.Company) continue;
          yield { kind: "supplier", sourceId: String(record.Company), url: profileUrl(record), discovery: record };
          yielded += 1;
          if (yielded >= maxItems) return;
        }
        if (payload.filter((record) => record?.Company).length < pageSize) break;
      }
      return;
    }

    const config = PRODUCT_SCOPE_CONFIG[scope];
    for (const seedUrl of seedUrls) {
      if (this.canonicalizeUrl(seedUrl) !== config.seedUrl) {
        throw new Error(`Unverified ${scope} seed URL: ${seedUrl}`);
      }
    }
    let yielded = 0;
    let totalCount = Infinity;
    for (let page = 1; yielded < Math.min(totalCount, maxItems); page += 1) {
      const requestSize = Math.min(pageSize, maxItems === Infinity ? pageSize : maxItems - yielded);
      const url = new URL(ITEM_LIST_ENDPOINT);
      url.searchParams.set("loginid", "");
      url.searchParams.set("category", config.category);
      url.searchParams.set("sortorder", "");
      url.searchParams.set("pageno", String(page));
      url.searchParams.set("onepagecount", String(requestSize));
      url.searchParams.set("onloaded", "true");
      url.searchParams.set("aspectlanguagecode", "en");
      url.searchParams.set("aspectcurrencycode", "USD");
      url.searchParams.set("aspectcountrycode", "US");
      const response = await client.get(url, { accept: "application/json" });
      const body = await response.text();
      await onEvidence({ kind: "discovery", sourceId: `${scope}-page-${page}`, url: response.url || url.href, body, contentType: response.headers?.get?.("content-type") || "application/json" });
      const payload = JSON.parse(body);
      if (!Array.isArray(payload)) throw new Error("ApparelX product endpoint did not return an array");
      const countRecord = payload.find((record) => record?.DataType === "TotalCount");
      if (countRecord) totalCount = Number.parseInt(countRecord.TotalCount, 10);
      const items = payload.filter((record) => record?.ItemId && record?.DataType !== "TotalCount");
      for (const record of items) {
        yield {
          kind: "product",
          sourceId: String(record.ItemId),
          url: canonicalizeApparelXUrl(`/item.php?itemid=${encodeURIComponent(String(record.ItemId))}`),
          discovery: record,
          discoverySeedUrl: config.seedUrl,
        };
        yielded += 1;
        if (yielded >= maxItems || yielded >= totalCount) return;
      }
      if (items.length < requestSize) return;
    }
  }

  async fetchSupplier(client, candidate, { onEvidence = async () => {} } = {}) {
    const url = this.canonicalizeUrl(candidate.url);
    const response = await client.get(url, { accept: "text/html" });
    const body = await response.text();
    const raw = { ...candidate, url, html: body };
    await onEvidence({ kind: "supplier", sourceId: candidate.sourceId, url: response.url || url, body, contentType: response.headers?.get?.("content-type") || "text/html" });
    return raw;
  }

  async fetchProducts(client, candidate, { onEvidence = async () => {} } = {}) {
    const url = this.canonicalizeUrl(candidate.url);
    const response = await client.get(url, { accept: "text/html" });
    const body = await response.text();
    const raw = { ...candidate, url, html: body };
    await onEvidence({ kind: "product", sourceId: candidate.sourceId, url: response.url || url, body, contentType: response.headers?.get?.("content-type") || "text/html" });
    return [raw];
  }

  async fetchMedia(_client, entity) {
    return Array.isArray(entity?.images) ? entity.images : [];
  }

  mapToCanonical(raw, { scope } = {}) {
    this.assertScope(scope);
    if (raw.kind === "supplier") {
      const source = raw.discovery || {};
      const details = extractProfileDetails(raw.html);
      return {
        entityType: "supplier", source: SOURCE_ID, sourceId: raw.sourceId, sourceUrl: this.canonicalizeUrl(raw.url),
        sourceLocale: "ja", scope,
        name: firstText(raw.html, "axsite_headerarea_infoarea_companyname") || source.CompanyFormalName || "",
        businessType: source.BusinessType || "",
        businessOutline: firstText(raw.html, "axsite_headerarea_infoarea_businessoutline") || source.BusinessOutline || "",
        businessDescription: details.businessDescription || htmlToText(source.BusinessDescription || ""),
        sellingPoints: details.sellingPoints || htmlToText(source.BusinessSellingPoint || ""),
        businessTags: tags(source.BusinessTags), partnerTags: tags(source.PartnerTags),
        address: firstText(raw.html, "axsite_headerarea_infoarea_companyaddress"),
        privateSourceContact: details.email ? { email: details.email, usageStatus: "documented_only", outreachAllowed: false, publicVisibility: false } : null,
        phone: details.phone || "", website: details.website || "", images: extractImages(raw.html, raw.url, { entityType: "supplier" }),
      };
    }

    const jsonLd = extractJsonLdProducts(raw.html)[0] || {};
    const discovery = raw.discovery || {};
    const detailFields = extractDetailTable(raw.html);
    const lifecycleTag = String(detailFields.tags || "").trim();
    const discontinued = /\bdiscontinuedinfoarea\b/i.test(raw.html) || /^discontinued(?:\s+products?)?$/i.test(lifecycleTag);
    const scheduledForDiscontinuation = !discontinued && /\bdiscontinued\b/i.test(lifecycleTag);
    const title = jsonLd.name || discovery.ECommerceItemName || discovery.ItemName || extractMeta(raw.html, "og:title") || htmlToText(raw.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
    const imageValues = Array.isArray(jsonLd.image) ? jsonLd.image : jsonLd.image ? [jsonLd.image] : [];
    const images = [...imageValues.map((value) => { try { return { sourceUrl: this.canonicalizeUrl(value), kind: "product" }; } catch { return null; } }).filter(Boolean), ...extractImages(raw.html, raw.url, { entityType: "product" })];
    return {
      entityType: "product", source: SOURCE_ID, sourceId: raw.sourceId, sourceUrl: this.canonicalizeUrl(raw.url), sourceLocale: "en", scope,
      name: firstText(raw.html, "itemheadarea_itemname") || title,
      sourceItemName: discovery.ItemName || "",
      description: firstText(raw.html, "itemheadarea_itemheaddescription") || jsonLd.description || extractMeta(raw.html, "description"),
      sku: jsonLd.sku || discovery.ItemCode || jsonLd.productID || raw.sourceId,
      supplierSourceId: discovery.Company || "",
      supplierCode: discovery.CompanyCode || "",
      sourceCategory: discovery.ECommerceItemCategoryCode || PRODUCT_SCOPE_CONFIG[scope]?.category || "",
      sourceUnit: discovery.StandardUnitCode || "",
      sourcePrice: jsonLd.offers?.price || discovery.Price1 ? { amount: String(jsonLd.offers?.price || discovery.Price1), currency: jsonLd.offers?.priceCurrency || "USD" } : null,
      makerId: extractAttribute(raw.html, "itemcontainer", "maker"),
      makerName: firstText(raw.html, "itemheadarea_makerarea_value") || detailFields.maker || "",
      supplierName: firstText(raw.html, "itemheadarea_supplierarea_value"),
      category: detailFields.category || "",
      subcategory: detailFields.subcategory || "",
      gender: detailFields.gender || "",
      useApplications: detailFields.useApplications || "",
      season: detailFields.season || "",
      organization: detailFields.organization || "",
      colorPattern: detailFields.colorPattern || "",
      style: detailFields.style || "",
      specification: detailFields.specification || "",
      material: detailFields.material || "",
      handling: detailFields.handling || "",
      styleTags: extractCodes(raw.html, "searchitemtagcode"),
      materialTags: extractCodes(raw.html, "materialtagcode"),
      colors: extractCodeNamePairs(raw.html, "itemcolor"),
      units: extractSimpleOptions(raw.html, "unit"),
      sizes: extractSimpleOptions(raw.html, "spec"),
      extensionKeys: extractSimpleOptions(raw.html, "extensionkey"),
      faqs: extractFaqs(raw.html),
      detailFields,
      lifecycle: {
        status: discontinued ? "discontinued" : scheduledForDiscontinuation ? "scheduled_for_discontinuation" : "active",
        sourceTag: lifecycleTag,
        excludeAfterCrawl: discontinued || scheduledForDiscontinuation,
      },
      images: [...new Map(images.map((image) => [image.sourceUrl, image])).values()],
      rawStructuredData: jsonLd,
      sourceListingMetadata: discovery,
      crawledAt: new Date().toISOString(),
    };
  }
}

module.exports = {
  ApparelXAdapter, CANONICAL_HOST, CANONICAL_ORIGIN, ITEM_LIST_ENDPOINT, PRODUCT_SCOPE_CONFIG, SCOPES, SOURCE_ID,
  canonicalizeApparelXUrl, extractDetailTable, extractJsonLdProducts, extractNextPageUrl, extractProductLinks,
};
