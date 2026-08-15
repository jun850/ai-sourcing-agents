"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");
const { EvidenceStore, safeSegment } = require("./evidence-store");

function csvCell(value) {
  const text = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(columns, rows) {
  return `${[columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n")}\n`;
}

async function atomicWrite(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, contents);
  await fs.rename(temporaryPath, filePath);
}

async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")); } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function sha256File(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function imageCountFromDiscovery(discovery = {}) {
  const subphotos = String(discovery.SubPhotoInfo || "").split(",").map((value) => value.trim()).filter(Boolean);
  return (String(discovery.PhotoType || "") === "1" ? 1 : 0) + subphotos.length;
}

function productFolderName(record) {
  return `${safeSegment(record.sourceId)}-${safeSegment(record.sku, "no-sku")}`;
}

function imageFilename(image, index) {
  const basename = decodeURIComponent(new URL(image.sourceUrl).pathname.split("/").pop() || `image-${index + 1}`);
  return `${String(index + 1).padStart(2, "0")}-${safeSegment(basename, `image-${index + 1}`)}`;
}

function checkpointStatus(row, selected, downloadedImages) {
  if (!selected) return "inventory_only";
  if (!row) return "queued";
  if (row.state === "completed") return "retrieved";
  if (row.state === "crawling") return "retrieving";
  if (row.state === "permanent_error") return downloadedImages > 0 ? "partial" : "failed";
  return "queued";
}

function discontinuationReason(record) {
  if (record?.lifecycle?.excludeAfterCrawl) return record.lifecycle.status || "discontinued";
  const sourceTag = String(record?.detailFields?.tags || "").trim();
  return /\bdiscontinued\b/i.test(sourceTag) ? sourceTag : null;
}

class ProductArchiveStore extends EvidenceStore {
  constructor(rootDir, { checkpointEvery = 100 } = {}) {
    super(rootDir);
    this.productsDir = path.join(this.rootDir, "products");
    this.inventoryPath = path.join(this.rootDir, "inventory.json");
    this.historyPath = path.join(this.rootDir, "CRAWL_HISTORY.md");
    this.instructionsPath = path.join(this.rootDir, "CRAWL_INSTRUCTIONS.md");
    this.removedDiscontinuedPath = path.join(this.rootDir, "discontinued-products-removed.json");
    this.removedDiscontinuedCsvPath = path.join(this.rootDir, "discontinued-products-removed.csv");
    this.checkpointEvery = checkpointEvery;
  }

  async initialize() {
    await super.initialize();
    await fs.mkdir(this.productsDir, { recursive: true });
  }

  async writeInventory(records, metadata = {}) {
    await atomicWrite(this.inventoryPath, `${JSON.stringify({ metadata, records }, null, 2)}\n`);
    return { path: path.relative(this.rootDir, this.inventoryPath), recordCount: records.length };
  }

  async readInventory() {
    return readJson(this.inventoryPath, { metadata: {}, records: [] });
  }

  async startHistory({ runId, sourceUrl, selectionLimit, resume = false }) {
    let existing = "";
    try { existing = await fs.readFile(this.historyPath, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const timestamp = new Date().toISOString();
    if (!existing) {
      existing = `# ApparelX FABRIC Crawl History\n\n- Run ID: \`${runId}\`\n- Source: ${sourceUrl}\n- Product selection limit: ${selectionLimit}\n- Media policy: original product images only; videos excluded\n- Started: ${timestamp}\n`;
    } else if (resume) {
      existing += `\n- Resumed: ${timestamp}\n`;
    }
    await atomicWrite(this.historyPath, existing);
  }

  async appendHistory(message) {
    await fs.appendFile(this.historyPath, `- ${new Date().toISOString()}: ${message}\n`, "utf8");
  }

  async archiveProduct(record, client, { onProgress = async () => {} } = {}) {
    const folder = productFolderName(record);
    const directory = path.join(this.productsDir, folder);
    const imagesDirectory = path.join(directory, "images");
    const manifestPath = path.join(directory, "media-manifest.json");
    await fs.mkdir(imagesDirectory, { recursive: true });
    const existing = await readJson(manifestPath, { images: [] });
    const existingByUrl = new Map((existing.images || []).map((image) => [image.sourceUrl, image]));
    const existingFailuresByUrl = new Map((existing.imageFailures || []).map((image) => [image.sourceUrl, image]));
    const archivedImages = [];
    const imageFailures = [];

    for (let index = 0; index < (record.images || []).length; index += 1) {
      const image = record.images[index];
      const prior = existingByUrl.get(image.sourceUrl);
      const priorFailure = existingFailuresByUrl.get(image.sourceUrl);
      if (priorFailure?.status === "source_missing") {
        imageFailures.push(priorFailure);
        await onProgress({ index, image: priorFailure, resumed: true });
        continue;
      }
      if (prior?.localPath) {
        const priorPath = path.join(this.rootDir, prior.localPath);
        try {
          const stat = await fs.stat(priorPath);
          if (stat.size === prior.bytes && await sha256File(priorPath) === prior.sha256) {
            archivedImages.push(prior);
            await onProgress({ index, image: prior, resumed: true });
            continue;
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }

      try {
        const response = await client.get(image.sourceUrl, { accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml" });
        const mimeType = String(response.headers?.get?.("content-type") || "").split(";", 1)[0].trim().toLowerCase();
        if (!mimeType.startsWith("image/")) throw new Error(`Non-image media response for ${image.sourceUrl}: ${mimeType || "unknown MIME"}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (!buffer.length) throw new Error(`Empty image response for ${image.sourceUrl}`);
        let metadata;
        try { metadata = await sharp(buffer, { animated: true }).metadata(); } catch (error) {
          throw new Error(`Image decode failed for ${image.sourceUrl}: ${error.message}`);
        }
        const filename = imageFilename(image, index);
        const absolutePath = path.join(imagesDirectory, filename);
        await atomicWrite(absolutePath, buffer);
        const archived = {
          kind: image.kind || "product", sourceUrl: image.sourceUrl,
          localPath: path.relative(this.rootDir, absolutePath).split(path.sep).join("/"),
          filename, mimeType, bytes: buffer.length,
          sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
          width: metadata.width || null, height: metadata.height || null, format: metadata.format || null,
          downloadedAt: new Date().toISOString(),
        };
        archivedImages.push(archived);
        await atomicWrite(manifestPath, `${JSON.stringify({ sourceId: record.sourceId, images: archivedImages, imageFailures }, null, 2)}\n`);
        await onProgress({ index, image: archived, resumed: false });
      } catch (error) {
        if (![404, 410].includes(error.status)) throw error;
        const failure = {
          kind: image.kind || "product", sourceUrl: image.sourceUrl, status: "source_missing",
          httpStatus: error.status, error: error.message, checkedAt: new Date().toISOString(),
        };
        imageFailures.push(failure);
        await atomicWrite(manifestPath, `${JSON.stringify({ sourceId: record.sourceId, images: archivedImages, imageFailures }, null, 2)}\n`);
        await onProgress({ index, image: failure, resumed: false });
      }
    }

    const archivedRecord = { ...record, images: archivedImages, imageFailures, imageCount: archivedImages.length };
    const productPath = path.join(directory, "product.json");
    await atomicWrite(productPath, `${JSON.stringify(archivedRecord, null, 2)}\n`);
    await atomicWrite(manifestPath, `${JSON.stringify({ sourceId: record.sourceId, images: archivedImages, imageFailures }, null, 2)}\n`);
    const contents = await fs.readFile(productPath);
    return {
      record: archivedRecord,
      path: path.relative(this.rootDir, productPath).split(path.sep).join("/"),
      sha256: crypto.createHash("sha256").update(contents).digest("hex"),
    };
  }

  async loadProduct(relativePath) {
    if (!relativePath) return null;
    return readJson(path.join(this.rootDir, relativePath), null);
  }

  async readRemovedDiscontinued() {
    return readJson(this.removedDiscontinuedPath, { metadata: {}, records: [] });
  }

  async removeDiscontinuedProducts({ run, queueRows }) {
    if (run.state !== "completed") throw new Error("Discontinued cleanup requires a completed crawl");
    const existing = await this.readRemovedDiscontinued();
    const existingById = new Map((existing.records || []).map((record) => [String(record.sourceId), record]));
    const removals = [];

    for (const row of queueRows.filter((value) => value.state === "completed" && value.output_path)) {
      if (existingById.has(String(row.source_id))) continue;
      const product = await this.loadProduct(row.output_path);
      const reason = discontinuationReason(product);
      if (!product || !reason) continue;
      removals.push({
        sourceId: String(product.sourceId), sku: product.sku || "", name: product.name || "",
        supplierId: product.supplierSourceId || "", supplierCode: product.supplierCode || "",
        sourceUrl: product.sourceUrl || row.url, sourceTag: product.detailFields?.tags || "",
        lifecycleStatus: product.lifecycle?.status || "source_tagged_for_discontinuation",
        reason, productPath: row.output_path,
        imageCount: product.images?.length || 0,
        deletedBytes: (product.images || []).reduce((total, image) => total + Number(image.bytes || 0), 0),
        removedAt: new Date().toISOString(),
      });
    }

    const records = [...existingById.values(), ...removals].sort((a, b) => String(a.sourceId).localeCompare(String(b.sourceId), "en", { numeric: true }));
    const metadata = {
      runId: run.id, generatedAt: new Date().toISOString(), policy: "source lifecycle tag contains Discontinued",
      removedCount: records.length, removedImages: records.reduce((total, record) => total + Number(record.imageCount || 0), 0),
      deletedBytes: records.reduce((total, record) => total + Number(record.deletedBytes || 0), 0),
    };
    await atomicWrite(this.removedDiscontinuedPath, `${JSON.stringify({ metadata, records }, null, 2)}\n`);
    const auditColumns = ["sourceId", "sku", "name", "supplierId", "supplierCode", "sourceUrl", "sourceTag", "lifecycleStatus", "reason", "imageCount", "deletedBytes", "removedAt"];
    await atomicWrite(this.removedDiscontinuedCsvPath, toCsv(auditColumns, records));

    const removedIds = new Set(records.map((record) => String(record.sourceId)));
    let evidenceRecords = [];
    try { evidenceRecords = (await fs.readFile(this.evidenceManifestPath, "utf8")).split("\n").filter(Boolean).map(JSON.parse); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const retainedEvidence = [];
    for (const evidence of evidenceRecords) {
      if (evidence.kind === "product" && removedIds.has(String(evidence.sourceId))) {
        const rawPath = path.resolve(this.rootDir, evidence.path);
        const rawRoot = `${path.resolve(this.rawDir)}${path.sep}`;
        if (!rawPath.startsWith(rawRoot)) throw new Error(`Refusing to delete raw evidence outside run directory: ${rawPath}`);
        await fs.rm(rawPath, { force: true });
      } else {
        retainedEvidence.push(evidence);
      }
    }
    await atomicWrite(this.evidenceManifestPath, retainedEvidence.length ? `${retainedEvidence.map((record) => JSON.stringify(record)).join("\n")}\n` : "");

    for (const removal of removals) {
      const productDirectory = path.resolve(this.rootDir, path.dirname(removal.productPath));
      const productsRoot = `${path.resolve(this.productsDir)}${path.sep}`;
      if (!productDirectory.startsWith(productsRoot)) throw new Error(`Refusing to delete product outside products directory: ${productDirectory}`);
      await fs.rm(productDirectory, { recursive: true, force: true });
    }

    let canonicalLines = [];
    try { canonicalLines = (await fs.readFile(this.canonicalPath, "utf8")).split("\n").filter(Boolean); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const retainedCanonical = canonicalLines.filter((line) => !removedIds.has(String(JSON.parse(line).sourceId)));
    await atomicWrite(this.canonicalPath, retainedCanonical.length ? `${retainedCanonical.join("\n")}\n` : "");
    const canonical = await this.materializeCanonicalJson({
      source: run.source, scope: run.scope, runId: run.id, mode: "crawl-only",
      discontinuedRemoved: records.length,
    });
    const report = { ...metadata, newlyRemoved: removals.length, canonicalRecordCount: canonical.recordCount };
    await atomicWrite(path.join(this.rootDir, "discontinued-cleanup-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    return { ...report, records };
  }

  async mediaCountForInventoryRecord(record) {
    const discovery = record.discovery || {};
    const folder = `${safeSegment(record.sourceId)}-${safeSegment(discovery.ItemCode, "no-sku")}`;
    const manifest = await readJson(path.join(this.productsDir, folder, "media-manifest.json"), { images: [] });
    return {
      downloaded: (manifest.images || []).length,
      sourceMissing: (manifest.imageFailures || []).filter((image) => image.status === "source_missing").length,
    };
  }

  async buildCheckpointRows(queueRows) {
    const inventory = await this.readInventory();
    const removed = await this.readRemovedDiscontinued();
    const removedById = new Map((removed.records || []).map((record) => [String(record.sourceId), record]));
    const queueById = new Map(queueRows.map((row) => [String(row.source_id), row]));
    const rows = [];
    for (const inventoryRecord of inventory.records) {
      const queue = queueById.get(String(inventoryRecord.sourceId));
      const removal = removedById.get(String(inventoryRecord.sourceId));
      const product = queue?.output_path ? await this.loadProduct(queue.output_path) : null;
      const mediaCounts = removal
        ? { downloaded: 0, sourceMissing: 0 }
        : product
        ? { downloaded: product.images?.length || 0, sourceMissing: product.imageFailures?.length || 0 }
        : await this.mediaCountForInventoryRecord(inventoryRecord);
      const downloadedImages = mediaCounts.downloaded;
      const discovery = inventoryRecord.discovery || {};
      rows.push({
        source_id: inventoryRecord.sourceId,
        sku: product?.sku || discovery.ItemCode || "",
        name: product?.name || discovery.ECommerceItemName || discovery.ItemName || "",
        supplier_id: product?.supplierSourceId || discovery.Company || "",
        supplier_code: product?.supplierCode || discovery.CompanyCode || "",
        supplier_name: product?.supplierName || "",
        maker_name: product?.makerName || "",
        category: product?.category || discovery.ECommerceItemCategoryCode || "",
        subcategory: product?.subcategory || (inventoryRecord.selected ? "pending_or_unavailable" : "not_crawled"),
        selected: inventoryRecord.selected,
        status: removal ? "removed_discontinued" : checkpointStatus(queue, inventoryRecord.selected, downloadedImages),
        expected_images: removal ? removal.imageCount : product ? (product.images?.length || 0) + (product.imageFailures?.length || 0) : imageCountFromDiscovery(discovery),
        downloaded_images: downloadedImages,
        source_missing_images: mediaCounts.sourceMissing,
        product_path: removal ? "" : queue?.output_path || "",
        removal_reason: removal?.reason || "",
        removed_at: removal?.removedAt || "",
        source_url: inventoryRecord.url,
        updated_at: queue?.updated_at || inventory.metadata.discoveredAt || "",
        failure_reason: queue?.last_error || "",
      });
    }
    return rows;
  }

  async writeCheckpoints({ run, queueRows, reason = "checkpoint" }) {
    const rows = await this.buildCheckpointRows(queueRows);
    const productColumns = ["source_id", "sku", "name", "supplier_id", "supplier_code", "supplier_name", "maker_name", "category", "subcategory", "selected", "status", "expected_images", "downloaded_images", "source_missing_images", "product_path", "removal_reason", "removed_at", "source_url", "updated_at", "failure_reason"];
    await atomicWrite(path.join(this.rootDir, "checkpoint-products.csv"), toCsv(productColumns, rows));

    const supplierMap = new Map();
    for (const row of rows) {
      const key = `${row.supplier_id}\u0000${row.supplier_code}`;
      const supplier = supplierMap.get(key) || {
        supplier_id: row.supplier_id, supplier_code: row.supplier_code, supplier_name: row.supplier_name,
        discovered: 0, selected: 0, retrieved: 0, partial: 0, failed: 0, queued: 0, retrieving: 0, inventory_only: 0, removed_discontinued: 0,
        subcategories: new Set(),
      };
      supplier.discovered += 1;
      if (row.selected) supplier.selected += 1;
      if (Object.hasOwn(supplier, row.status)) supplier[row.status] += 1;
      if (row.subcategory && !["not_crawled", "pending_or_unavailable"].includes(row.subcategory)) supplier.subcategories.add(row.subcategory);
      if (!supplier.supplier_name && row.supplier_name) supplier.supplier_name = row.supplier_name;
      supplierMap.set(key, supplier);
    }
    const supplierRows = [...supplierMap.values()].map((supplier) => ({ ...supplier, subcategories: [...supplier.subcategories].sort() }));
    const supplierColumns = ["supplier_id", "supplier_code", "supplier_name", "discovered", "selected", "retrieved", "partial", "failed", "queued", "retrieving", "inventory_only", "removed_discontinued", "subcategories"];
    await atomicWrite(path.join(this.rootDir, "checkpoint-suppliers.csv"), toCsv(supplierColumns, supplierRows));

    const statusCounts = {};
    let downloadedImages = 0;
    let sourceMissingImages = 0;
    for (const row of rows) {
      statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
      downloadedImages += Number(row.downloaded_images || 0);
      sourceMissingImages += Number(row.source_missing_images || 0);
    }
    const checkpoint = {
      runId: run.id, source: run.source, scope: run.scope, mode: run.mode,
      reason, generatedAt: new Date().toISOString(), startedAt: run.started_at,
      completedAt: run.completed_at || null, selectionLimit: run.options?.maxItems || null,
      discovered: rows.length, selected: rows.filter((row) => row.selected).length,
      statusCounts, downloadedImages, sourceMissingImages,
      removedDiscontinued: statusCounts.removed_discontinued || 0,
      lastProcessedSourceId: [...rows].reverse().find((row) => ["retrieved", "partial", "failed", "removed_discontinued"].includes(row.status))?.source_id || null,
      suppliers: supplierRows,
    };
    await atomicWrite(path.join(this.rootDir, "checkpoint.json"), `${JSON.stringify(checkpoint, null, 2)}\n`);
    return { checkpoint, productRows: rows, supplierRows };
  }

  async writeProductsCsv(queueRows) {
    const products = [];
    for (const row of queueRows.filter((value) => value.state === "completed" && value.output_path)) {
      const product = await this.loadProduct(row.output_path);
      if (product) products.push(product);
    }
    products.sort((a, b) => String(a.sourceId).localeCompare(String(b.sourceId), "en", { numeric: true }));
    const rows = products.map((product) => ({
      source_id: product.sourceId, sku: product.sku, name: product.name, source_item_name: product.sourceItemName,
      supplier_id: product.supplierSourceId, supplier_code: product.supplierCode, supplier_name: product.supplierName,
      maker_id: product.makerId, maker_name: product.makerName, source_category: product.sourceCategory,
      category: product.category, subcategory: product.subcategory, unit: product.sourceUnit,
      description: product.description, gender: product.gender, use_applications: product.useApplications,
      season: product.season, organization: product.organization, color_pattern: product.colorPattern,
      style: product.style, specification: product.specification, material: product.material, handling: product.handling,
      source_price_json: product.sourcePrice, colors_json: product.colors, units_json: product.units,
      sizes_json: product.sizes, extension_keys_json: product.extensionKeys, style_tags_json: product.styleTags,
      material_tags_json: product.materialTags, faqs_json: product.faqs, detail_fields_json: product.detailFields,
      image_count: product.images?.length || 0, image_filenames_json: (product.images || []).map((image) => image.filename),
      image_source_urls_json: (product.images || []).map((image) => image.sourceUrl),
      image_metadata_json: product.images, source_missing_images_json: product.imageFailures,
      source_listing_metadata_json: product.sourceListingMetadata,
      source_structured_data_json: product.rawStructuredData, source_url: product.sourceUrl, crawled_at: product.crawledAt,
    }));
    const columns = rows.length ? Object.keys(rows[0]) : ["source_id", "sku", "name"];
    await atomicWrite(path.join(this.rootDir, "products.csv"), toCsv(columns, rows));
    return { recordCount: rows.length, products };
  }

  async validateArchive({ run, queueRows }) {
    const errors = [];
    const seenIds = new Set();
    let imageCount = 0;
    let sourceMissingImages = 0;
    const removed = await this.readRemovedDiscontinued();
    const removedIds = new Set((removed.records || []).map((record) => String(record.sourceId)));
    const completed = queueRows.filter((row) => row.state === "completed" && !removedIds.has(String(row.source_id)));
    for (const row of completed) {
      if (seenIds.has(row.source_id)) errors.push(`Duplicate completed product ${row.source_id}`);
      seenIds.add(row.source_id);
      const product = await this.loadProduct(row.output_path);
      if (!product) { errors.push(`Missing product JSON for ${row.source_id}`); continue; }
      sourceMissingImages += (product.imageFailures || []).filter((image) => image.status === "source_missing").length;
      for (const image of product.images || []) {
        if (/\.(?:mp4|webm|mov)(?:$|\?)/i.test(image.sourceUrl) || !image.mimeType?.startsWith("image/")) {
          errors.push(`Non-image media recorded for ${row.source_id}: ${image.sourceUrl}`);
          continue;
        }
        const absolutePath = path.join(this.rootDir, image.localPath);
        try {
          const stat = await fs.stat(absolutePath);
          if (!stat.size || stat.size !== image.bytes) errors.push(`Image size mismatch: ${image.localPath}`);
          if (await sha256File(absolutePath) !== image.sha256) errors.push(`Image hash mismatch: ${image.localPath}`);
          await sharp(absolutePath, { animated: true }).metadata();
          imageCount += 1;
        } catch (error) { errors.push(`Invalid image ${image.localPath}: ${error.message}`); }
      }
    }
    const selected = (await this.readInventory()).records.filter((record) => record.selected).length;
    const permanentErrors = queueRows.filter((row) => row.state === "permanent_error").length;
    if (completed.length + removedIds.size !== selected) errors.push(`Retained ${completed.length} and removed ${removedIds.size} discontinued products from ${selected} selected products`);
    if (permanentErrors) errors.push(`${permanentErrors} products ended in permanent_error`);
    const report = {
      runId: run.id, verifiedAt: new Date().toISOString(), success: errors.length === 0,
      selected, completed: completed.length, removedDiscontinued: removedIds.size, imageCount, sourceMissingImages, permanentErrors, errors,
    };
    await atomicWrite(path.join(this.rootDir, "validation-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  }

  async writeInstructions({ run, validation }) {
    if (!validation.success) return false;
    const output = this.rootDir;
    const command = `npm run catalog:crawl-only -- --scope fabrics --output ${JSON.stringify(output)} --run-id ${JSON.stringify(run.id)} --resume --retry-failed --inventory-all --max-items ${run.options.maxItems}`;
    const document = `# ApparelX FABRIC Crawl Instructions\n\nThis is a crawl-only local archive. It does not publish to the Atelix catalogue, Supabase, Algolia, Git, or production. Videos are excluded.\n\n## Verified snapshot\n\n- Run ID: \`${run.id}\`\n- Active products retained: ${validation.completed}\n- Discontinued or scheduled-for-discontinuation products removed: ${validation.removedDiscontinued}\n- Original images verified: ${validation.imageCount}\n- Source-declared images unavailable (404/410): ${validation.sourceMissingImages}\n- Verified: ${validation.verifiedAt}\n\n## Files\n\n- \`products/\`: one directory per retained ApparelX product, with \`product.json\` and original files in \`images/\`.\n- \`products.csv\`: consolidated retained product data.\n- \`discontinued-products-removed.csv\`: minimal deletion audit.\n- \`checkpoint-products.csv\`: per-product retrieval and removal state.\n- \`checkpoint-suppliers.csv\`: supplier and product-type coverage.\n- \`checkpoint.json\`: machine-readable progress totals.\n- \`CRAWL_HISTORY.md\`: append-only run history.\n- \`validation-report.json\`: final integrity result.\n\n## Resume or repair\n\nRun from the repository root:\n\n\`\`\`sh\n${command}\n\`\`\`\n\nThe run ledger skips completed products. Existing images are reused only when their recorded byte size and SHA-256 hash match. Source image URLs returning 404/410 are recorded as unavailable without downloading substitutes. Failed products are requeued without selecting products outside the original 10,000-product set. Finalization deletes products whose source lifecycle tag contains \`Discontinued\`, including scheduled-for-discontinuation products, while retaining a minimal audit row.\n\nTo inspect progress, open \`checkpoint.json\` or the checkpoint CSV files. Do not run any \`catalog:publish\` command for this archive.\n`;
    await atomicWrite(this.instructionsPath, document);
    return true;
  }
}

module.exports = {
  ProductArchiveStore, atomicWrite, checkpointStatus, csvCell, discontinuationReason, imageCountFromDiscovery,
  productFolderName, toCsv,
};
