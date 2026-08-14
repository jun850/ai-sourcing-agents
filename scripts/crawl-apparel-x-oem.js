#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const BASE_URL = new URL("https://www.apparel-x.com/");
const LIST_ENDPOINT = new URL("php/GetApparelXBusinessList.php", BASE_URL);
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "data/apparel-x-oem");
const DEFAULT_DELAY_MS = 750;
const DEFAULT_PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const USER_AGENT = "AtelixApparelXDataCrawler/1.0 (+https://www.apparel-x.com/businesssearch.html)";

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    delayMs: DEFAULT_DELAY_MS,
    businessType: "OEM/ODM",
    downloadImages: true,
    refresh: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      options.outputDir = path.resolve(argv[++index]);
    } else if (argument === "--delay-ms") {
      options.delayMs = Number(argv[++index]);
    } else if (argument === "--business-type") {
      options.businessType = argv[++index];
    } else if (argument === "--skip-images") {
      options.downloadImages = false;
    } else if (argument === "--refresh") {
      options.refresh = true;
    } else if (argument === "--help" || argument === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new Error("--delay-ms must be a non-negative number");
  }
  if (!options.businessType) {
    throw new Error("--business-type cannot be empty");
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/crawl-apparel-x-oem.js [options]

Options:
  --output <directory>       Output directory (default: data/apparel-x-oem)
  --business-type <value>    ApparelX business tag (default: OEM/ODM)
  --delay-ms <milliseconds>  Delay between network requests (default: 750)
  --skip-images              Collect image URLs without downloading files
  --refresh                  Refetch cached profile HTML and existing images
  -h, --help                 Show this help
`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeSegment(value, fallback = "unknown") {
  const normalized = String(value || "")
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return normalized || fallback;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(value) {
  return decodeHtml(
    String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstClassContent(html, className) {
  const pattern = new RegExp(
    `<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    "i",
  );
  const match = html.match(pattern);
  return match ? htmlToText(match[1]) : "";
}

function firstClassAttribute(html, className, attribute) {
  const pattern = new RegExp(
    `<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*\\b${attribute}=["']([^"']*)["'][^>]*>`,
    "i",
  );
  return decodeHtml(html.match(pattern)?.[1] || "").trim();
}

function extractDetailFields(html) {
  const labelToField = new Map([
    ["事業内容", "businessDescription"],
    ["セールスポイント", "sellingPoints"],
    ["年商", "annualSales"],
    ["資本金", "capital"],
    ["設立日", "establishedDate"],
    ["代表者", "representative"],
    ["従業員数", "employeeCount"],
    ["沿革", "history"],
    ["主要取引銀行", "banks"],
    ["主要取引先", "majorCustomers"],
    ["Eメールアドレス", "email"],
    ["TEL", "phone"],
    ["FAX", "fax"],
    ["公式サイトアドレス", "website"],
  ]);
  const fields = {};
  const pattern = /<div[^>]+class=["'][^"']*axsite_bodyarea_itemtitle[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]+class=["'][^"']*axsite_bodyarea_itemcontent[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const label = htmlToText(match[1]);
    const field = labelToField.get(label);
    if (field) fields[field] = htmlToText(match[2]);
  }
  return fields;
}

function extractAttributeUrls(fragment, elementPattern, attribute) {
  const urls = [];
  const tagPattern = new RegExp(`<${elementPattern}\\b[^>]*>`, "gi");
  let tagMatch;
  while ((tagMatch = tagPattern.exec(fragment))) {
    const attributePattern = new RegExp(`\\b${attribute}=["']([^"']+)["']`, "i");
    const value = decodeHtml(tagMatch[0].match(attributePattern)?.[1] || "").trim();
    if (value) urls.push(value);
  }
  return urls;
}

function resolveSameDomainUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value, BASE_URL);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== BASE_URL.hostname) return null;
  url.hash = "";
  return url.href;
}

function isLikelyImageUrl(value) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    return /\.(?:avif|bmp|gif|jpe?g|png|webp|svg)$/.test(pathname);
  } catch {
    return false;
  }
}

function parseProfile(html, apiRecord) {
  const details = extractDetailFields(html);
  const logoPath = firstClassAttribute(html, "axsite_corporateicon", "src");
  const topPhotoPath = firstClassAttribute(html, "axsite_topphoto", "src");
  const profileBusinessPhotos = extractAttributeUrls(html, "img", "src").filter((value) => {
    const tagPattern = new RegExp(
      `<img\\b[^>]*class=["'][^"']*\\bbusinessphoto\\b[^"']*["'][^>]*\\bsrc=["']${escapeRegExp(value)}["'][^>]*>`,
      "i",
    );
    return tagPattern.test(html);
  });
  const attachedImageUrls = [
    ...extractAttributeUrls(apiRecord.BusinessPhotoAttachedFiles || "", "a", "href"),
    ...extractAttributeUrls(apiRecord.BusinessPhotoAttachedFiles || "", "img", "src"),
  ];

  const candidates = [
    { kind: "logo", value: logoPath },
    { kind: "top_photo", value: topPhotoPath },
    ...profileBusinessPhotos.map((value) => ({ kind: "business_photo", value })),
    ...attachedImageUrls.map((value) => ({ kind: "attached_photo", value })),
  ];
  const seen = new Set();
  const images = [];
  for (const candidate of candidates) {
    const sourceUrl = resolveSameDomainUrl(candidate.value);
    if (!sourceUrl || !isLikelyImageUrl(sourceUrl) || seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    images.push({ kind: candidate.kind, sourceUrl, localPath: null, status: "pending" });
  }

  return {
    companyName: firstClassContent(html, "axsite_headerarea_infoarea_companyname") || apiRecord.CompanyFormalName || "",
    businessOutline:
      firstClassContent(html, "axsite_headerarea_infoarea_businessoutline") || apiRecord.BusinessOutline || "",
    address: firstClassContent(html, "axsite_headerarea_infoarea_companyaddress"),
    ...details,
    images,
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildProfileUrl(apiRecord) {
  const address = String(apiRecord.ApparelXHomePageAddress || "").trim();
  const safeAddress = address && !address.includes("://") && !address.startsWith("/") ? address : "";
  const slug = safeAddress || apiRecord.CompanyAbbreviation || apiRecord.Company;
  return new URL(`business/${encodeURIComponent(String(slug || ""))}`, BASE_URL).href;
}

function tags(value) {
  return [...new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean))];
}

function normalizeApiRecord(apiRecord, profile, profileUrl) {
  return {
    companyId: apiRecord.Company || "",
    companyAbbreviation: apiRecord.CompanyAbbreviation || "",
    companyName: profile.companyName || apiRecord.CompanyFormalName || "",
    businessType: apiRecord.BusinessType || "",
    businessOutline: profile.businessOutline || apiRecord.BusinessOutline || "",
    businessDescription: profile.businessDescription || htmlToText(apiRecord.BusinessDescription || ""),
    sellingPoints: profile.sellingPoints || htmlToText(apiRecord.BusinessSellingPoint || ""),
    businessTags: tags(apiRecord.BusinessTags),
    partnerTags: tags(apiRecord.PartnerTags),
    address: profile.address || "",
    annualSales: profile.annualSales || apiRecord.AnnualSalesType || "",
    capital: profile.capital || "",
    establishedDate: profile.establishedDate || "",
    representative: profile.representative || "",
    employeeCount: profile.employeeCount || "",
    history: profile.history || "",
    banks: profile.banks || "",
    majorCustomers: profile.majorCustomers || "",
    email: profile.email || "",
    phone: profile.phone || "",
    fax: profile.fax || "",
    website: profile.website || "",
    apparelXProfileAddress: apiRecord.ApparelXHomePageAddress || "",
    sourceUrl: profileUrl,
    images: profile.images || [],
  };
}

function csvEscape(value) {
  const normalized = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return `"${normalized.replace(/"/g, '""')}"`;
}

function recordsToCsv(records) {
  const columns = [
    "companyId",
    "companyAbbreviation",
    "companyName",
    "businessType",
    "businessOutline",
    "businessDescription",
    "sellingPoints",
    "businessTags",
    "partnerTags",
    "address",
    "annualSales",
    "capital",
    "establishedDate",
    "representative",
    "employeeCount",
    "history",
    "banks",
    "majorCustomers",
    "email",
    "phone",
    "fax",
    "website",
    "sourceUrl",
    "imageSourceUrls",
    "imageLocalPaths",
  ];
  const lines = [columns.map(csvEscape).join(",")];
  for (const record of records) {
    const row = {
      ...record,
      imageSourceUrls: record.images.map((image) => image.sourceUrl),
      imageLocalPaths: record.images.map((image) => image.localPath).filter(Boolean),
    };
    lines.push(columns.map((column) => csvEscape(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

async function writeJson(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
}

function contentExtension(contentType) {
  const normalized = String(contentType || "").split(";")[0].trim().toLowerCase();
  return {
    "image/avif": ".avif",
    "image/bmp": ".bmp",
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
  }[normalized] || "";
}

function imageFileName(image, index, contentType) {
  const url = new URL(image.sourceUrl);
  const decodedBaseName = decodeURIComponent(path.basename(url.pathname));
  const sourceExtension = path.extname(decodedBaseName).toLowerCase();
  const extension = sourceExtension || contentExtension(contentType) || ".img";
  const stem = safeSegment(path.basename(decodedBaseName, sourceExtension), image.kind);
  return `${String(index + 1).padStart(2, "0")}-${safeSegment(image.kind)}-${stem}${extension}`;
}

class SameDomainClient {
  constructor(delayMs) {
    this.delayMs = delayMs;
    this.lastRequestAt = 0;
  }

  assertAllowedUrl(value) {
    const url = new URL(value, BASE_URL);
    if (url.protocol !== "https:" || url.hostname !== BASE_URL.hostname) {
      throw new Error(`Refusing off-domain request: ${url.href}`);
    }
    return url;
  }

  async fetch(value, options = {}) {
    let url = this.assertAllowedUrl(value);
    for (let redirect = 0; redirect <= 5; redirect += 1) {
      const elapsed = Date.now() - this.lastRequestAt;
      if (elapsed < this.delayMs) await sleep(this.delayMs - elapsed);
      this.lastRequestAt = Date.now();

      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: options.accept || "*/*",
          "User-Agent": USER_AGENT,
          ...(options.headers || {}),
        },
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`Redirect without Location from ${url.href}`);
        url = this.assertAllowedUrl(new URL(location, url));
        continue;
      }
      return response;
    }
    throw new Error(`Too many redirects for ${url.href}`);
  }

  async fetchWithRetries(value, options = {}) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const response = await this.fetch(value, options);
        if (response.ok) return response;
        const error = new Error(`HTTP ${response.status} ${response.statusText} for ${response.url}`);
        error.status = response.status;
        if (response.status < 500 && response.status !== 429) throw error;
        lastError = error;
      } catch (error) {
        lastError = error;
        if (error.status && error.status < 500 && error.status !== 429) throw error;
      }
      if (attempt < MAX_RETRIES) await sleep(attempt * 1_000);
    }
    throw lastError;
  }
}

async function crawlList(client, outputDir, businessType) {
  const rawListDir = path.join(outputDir, "raw", "list");
  await fs.mkdir(rawListDir, { recursive: true });
  const records = [];
  const seenIds = new Set();

  for (let page = 1; ; page += 1) {
    const url = new URL(LIST_ENDPOINT);
    url.searchParams.set("loginid", "");
    url.searchParams.set("businesstype", businessType);
    url.searchParams.set("pageno", String(page));
    url.searchParams.set("onepagecount", String(DEFAULT_PAGE_SIZE));
    url.searchParams.set("datatype", "json2");
    const response = await client.fetchWithRetries(url, { accept: "application/json" });
    const text = await response.text();
    const payload = JSON.parse(text);
    await fs.writeFile(path.join(rawListDir, `page-${String(page).padStart(3, "0")}.json`), `${JSON.stringify(payload, null, 2)}\n`);

    const pageRecords = payload.filter((item) => item && item.Company);
    for (const record of pageRecords) {
      if (!seenIds.has(record.Company)) {
        seenIds.add(record.Company);
        records.push(record);
      }
    }
    console.log(`List page ${page}: ${pageRecords.length} records`);
    if (pageRecords.length < DEFAULT_PAGE_SIZE) break;
  }

  return records;
}

async function readCachedProfile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function crawlProfiles(client, outputDir, apiRecords, refresh) {
  const profileDir = path.join(outputDir, "raw", "profiles");
  await fs.mkdir(profileDir, { recursive: true });
  const records = [];
  const failures = [];

  for (let index = 0; index < apiRecords.length; index += 1) {
    const apiRecord = apiRecords[index];
    const key = safeSegment(apiRecord.Company || apiRecord.CompanyAbbreviation, `record-${index + 1}`);
    const profilePath = path.join(profileDir, `${key}.html`);
    const profileUrl = buildProfileUrl(apiRecord);
    let html = refresh ? null : await readCachedProfile(profilePath);

    try {
      if (html === null) {
        const response = await client.fetchWithRetries(profileUrl, { accept: "text/html" });
        html = await response.text();
        await fs.writeFile(profilePath, html, "utf8");
      }
      const profile = parseProfile(html, apiRecord);
      records.push(normalizeApiRecord(apiRecord, profile, profileUrl));
      console.log(`Profile ${index + 1}/${apiRecords.length}: ${apiRecord.CompanyFormalName}`);
    } catch (error) {
      failures.push({
        stage: "profile",
        companyId: apiRecord.Company || "",
        companyName: apiRecord.CompanyFormalName || "",
        sourceUrl: profileUrl,
        error: error.message,
      });
      records.push(normalizeApiRecord(apiRecord, { images: [] }, profileUrl));
      console.warn(`Profile failed ${index + 1}/${apiRecords.length}: ${apiRecord.CompanyFormalName} (${error.message})`);
    }
  }

  return { records, failures };
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadImages(client, outputDir, records, refresh) {
  const failures = [];
  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    const companyDirName = safeSegment(record.companyId || record.companyAbbreviation, `record-${recordIndex + 1}`);
    const companyImageDir = path.join(outputDir, "images", companyDirName);
    if (record.images.length) await fs.mkdir(companyImageDir, { recursive: true });

    for (let imageIndex = 0; imageIndex < record.images.length; imageIndex += 1) {
      const image = record.images[imageIndex];
      try {
        const response = await client.fetchWithRetries(image.sourceUrl, { accept: "image/*" });
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.toLowerCase().startsWith("image/")) {
          throw new Error(`Unexpected content type: ${contentType || "unknown"}`);
        }
        const fileName = imageFileName(image, imageIndex, contentType);
        const absolutePath = path.join(companyImageDir, fileName);
        const relativePath = path.relative(outputDir, absolutePath).split(path.sep).join("/");
        if (refresh || !(await pathExists(absolutePath))) {
          const buffer = Buffer.from(await response.arrayBuffer());
          await fs.writeFile(absolutePath, buffer);
          image.bytes = buffer.length;
        } else {
          image.bytes = (await fs.stat(absolutePath)).size;
        }
        image.localPath = relativePath;
        image.contentType = contentType.split(";")[0];
        image.status = "downloaded";
      } catch (error) {
        image.status = "failed";
        image.error = error.message;
        failures.push({
          stage: "image",
          companyId: record.companyId,
          companyName: record.companyName,
          sourceUrl: image.sourceUrl,
          error: error.message,
        });
      }
    }
    if (record.images.length) {
      const downloaded = record.images.filter((image) => image.status === "downloaded").length;
      console.log(`Images ${recordIndex + 1}/${records.length}: ${record.companyName} (${downloaded}/${record.images.length})`);
    }
  }
  return failures;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = new SameDomainClient(options.delayMs);
  const startedAt = new Date();
  await fs.mkdir(options.outputDir, { recursive: true });

  const apiRecords = await crawlList(client, options.outputDir, options.businessType);
  const tagFilteredRecords = apiRecords.filter((record) => tags(record.BusinessTags).includes(options.businessType));
  const { records, failures: profileFailures } = await crawlProfiles(
    client,
    options.outputDir,
    tagFilteredRecords,
    options.refresh,
  );
  const imageFailures = options.downloadImages
    ? await downloadImages(client, options.outputDir, records, options.refresh)
    : [];

  const finishedAt = new Date();
  const report = {
    source: "https://www.apparel-x.com/businesssearch.html",
    sourceHost: BASE_URL.hostname,
    businessType: options.businessType,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSeconds: Math.round((finishedAt - startedAt) / 1000),
    recordsFromApi: apiRecords.length,
    recordsMatchingTag: records.length,
    profilesSucceeded: records.length - profileFailures.length,
    profilesFailed: profileFailures.length,
    imageUrlsFound: records.reduce((sum, record) => sum + record.images.length, 0),
    imagesDownloaded: records.reduce(
      (sum, record) => sum + record.images.filter((image) => image.status === "downloaded").length,
      0,
    ),
    imagesFailed: imageFailures.length,
    failures: [...profileFailures, ...imageFailures],
  };
  const dataset = {
    metadata: {
      source: report.source,
      sourceHost: report.sourceHost,
      businessType: report.businessType,
      crawledAt: report.finishedAt,
      recordCount: records.length,
      note: "Public ApparelX business-directory data. Verify usage rights before republishing text or images.",
    },
    records,
  };

  await writeJson(path.join(options.outputDir, "factories.json"), dataset);
  await fs.writeFile(path.join(options.outputDir, "factories.csv"), recordsToCsv(records), "utf8");
  await writeJson(path.join(options.outputDir, "crawl-report.json"), report);
  console.log(`Done: ${records.length} records written to ${options.outputDir}`);
  if (report.failures.length) console.log(`Completed with ${report.failures.length} recorded failures; see crawl-report.json`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
