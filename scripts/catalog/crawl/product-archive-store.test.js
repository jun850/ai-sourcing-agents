"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const sharp = require("sharp");
const { ProductArchiveStore } = require("./product-archive-store");
const { RunLedger } = require("./run-ledger");

test("archives original product images and writes reconciled checkpoints and instructions", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "atelix-product-archive-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new ProductArchiveStore(directory, { checkpointEvery: 1 });
  await store.initialize();
  await store.startHistory({ runId: "fabric-run", sourceUrl: "https://www.apparel-x.com/search.php?category=FABRIC", selectionLimit: 1 });
  const inventory = [
    { kind: "product", sourceId: "101", url: "https://www.apparel-x.com/item.php?itemid=101", selected: true, discovery: { ItemCode: "FAB-1", ECommerceItemName: "Fabric One", Company: "SUP", CompanyCode: "S1", ECommerceItemCategoryCode: "FABRIC", PhotoType: "1" } },
    { kind: "product", sourceId: "102", url: "https://www.apparel-x.com/item.php?itemid=102", selected: false, discovery: { ItemCode: "FAB-2", ECommerceItemName: "Fabric Two", Company: "SUP", CompanyCode: "S1", ECommerceItemCategoryCode: "FABRIC", PhotoType: "1" } },
  ];
  await store.writeInventory(inventory, { runId: "fabric-run", discoveredAt: "2026-08-15T00:00:00.000Z" });

  const ledger = new RunLedger(path.join(directory, "run.sqlite"));
  context.after(() => ledger.close());
  ledger.createRun({ id: "fabric-run", source: "apparelx", scope: "fabrics", options: { maxItems: 1 } });
  ledger.enqueue("fabric-run", [inventory[0]]);
  ledger.closeDiscovery("fabric-run");
  const item = ledger.claimNext("fabric-run", "test-worker");
  const jpeg = await sharp({ create: { width: 2, height: 3, channels: 3, background: "red" } }).jpeg().toBuffer();
  let requests = 0;
  const client = { get: async (url) => {
    requests += 1;
    if (String(url).endsWith("-missing.jpg")) {
      const error = new Error("HTTP 404 Not Found");
      error.status = 404;
      throw error;
    }
    return { headers: new Headers({ "content-type": "image/jpeg" }), arrayBuffer: async () => jpeg };
  } };
  const archived = await store.archiveProduct({
    entityType: "product", source: "apparelx", sourceId: "101", sourceUrl: inventory[0].url,
    sourceLocale: "en", scope: "fabrics", sku: "FAB-1", name: "Fabric One", supplierSourceId: "SUP",
    supplierCode: "S1", category: "Textile / Fabric", subcategory: "Twill", crawledAt: new Date().toISOString(),
    images: [
      { kind: "product", sourceUrl: "https://www.apparel-x.com/img/item/SUP/101.jpg" },
      { kind: "product", sourceUrl: "https://www.apparel-x.com/img/item/SUP/101-missing.jpg" },
    ],
  }, client);
  ledger.complete(item.id, "test-worker", { outputPath: archived.path, outputHash: archived.sha256 });
  ledger.finishRunIfDrained("fabric-run");

  const run = ledger.getRun("fabric-run");
  const rows = ledger.items("fabric-run");
  const checkpoint = await store.writeCheckpoints({ run, queueRows: rows });
  const products = await store.writeProductsCsv(rows);
  const validation = await store.validateArchive({ run, queueRows: rows });
  assert.equal(await store.writeInstructions({ run, validation }), true);

  assert.equal(requests, 2);
  assert.equal(products.recordCount, 1);
  assert.equal(validation.success, true);
  assert.equal(validation.sourceMissingImages, 1);
  assert.deepEqual(checkpoint.checkpoint.statusCounts, { retrieved: 1, inventory_only: 1 });
  assert.equal(checkpoint.supplierRows[0].retrieved, 1);
  assert.equal(checkpoint.supplierRows[0].inventory_only, 1);
  assert.match(await fs.readFile(path.join(directory, "products.csv"), "utf8"), /Fabric One/);
  assert.match(await fs.readFile(path.join(directory, "checkpoint-products.csv"), "utf8"), /inventory_only/);
  assert.match(await fs.readFile(path.join(directory, "checkpoint-products.csv"), "utf8"), /source_missing_images/);
  assert.match(await fs.readFile(path.join(directory, "CRAWL_INSTRUCTIONS.md"), "utf8"), /Videos are excluded/);
  const product = JSON.parse(await fs.readFile(path.join(directory, archived.path), "utf8"));
  assert.equal(product.images[0].bytes, jpeg.length);
  assert.equal(product.images[0].width, 2);
  assert.equal(product.images[0].height, 3);
  assert.equal(product.images[0].mimeType, "image/jpeg");
  assert.equal(product.imageFailures[0].status, "source_missing");
});

test("post-crawl cleanup deletes source-tagged discontinued products and retains a minimal audit", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "atelix-discontinued-cleanup-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new ProductArchiveStore(directory);
  await store.initialize();
  const candidate = {
    kind: "product", sourceId: "201", url: "https://www.apparel-x.com/item.php?itemid=201", selected: true,
    discovery: { ItemCode: "OLD-1", ECommerceItemName: "Old Fabric", Company: "SUP", CompanyCode: "S1", ECommerceItemCategoryCode: "FABRIC" },
  };
  await store.writeInventory([candidate], { runId: "cleanup-run", discoveredAt: "2026-08-15T00:00:00.000Z" });
  const ledger = new RunLedger(path.join(directory, "run.sqlite"));
  context.after(() => ledger.close());
  ledger.createRun({ id: "cleanup-run", source: "apparelx", scope: "fabrics", options: { maxItems: 1 } });
  ledger.enqueue("cleanup-run", [candidate]);
  ledger.closeDiscovery("cleanup-run");
  const item = ledger.claimNext("cleanup-run", "cleanup-worker");
  await store.storeRaw({ kind: "product", sourceId: "201", url: candidate.url, body: "discontinued detail" });
  const archived = await store.archiveProduct({
    entityType: "product", source: "apparelx", sourceId: "201", sourceUrl: candidate.url,
    sourceLocale: "en", scope: "fabrics", sku: "OLD-1", name: "Old Fabric", supplierSourceId: "SUP",
    supplierCode: "S1", detailFields: { tags: "Scheduled To Be Discontinued" }, images: [],
  }, { get: async () => { throw new Error("No image request expected"); } });
  await store.appendCanonical(archived.record);
  ledger.complete(item.id, "cleanup-worker", { outputPath: archived.path, outputHash: archived.sha256 });
  assert.equal(ledger.finishRunIfDrained("cleanup-run"), true);

  const run = ledger.getRun("cleanup-run");
  const queueRows = ledger.items("cleanup-run");
  const cleanup = await store.removeDiscontinuedProducts({ run, queueRows });
  const checkpoint = await store.writeCheckpoints({ run, queueRows, reason: "cleanup-test" });
  const products = await store.writeProductsCsv(queueRows);
  const validation = await store.validateArchive({ run, queueRows });

  assert.equal(cleanup.removedCount, 1);
  assert.equal(cleanup.newlyRemoved, 1);
  assert.equal(products.recordCount, 0);
  assert.equal(validation.success, true);
  assert.equal(validation.removedDiscontinued, 1);
  assert.deepEqual(checkpoint.checkpoint.statusCounts, { removed_discontinued: 1 });
  await assert.rejects(fs.access(path.join(directory, archived.path)));
  const canonical = JSON.parse(await fs.readFile(path.join(directory, "canonical.json"), "utf8"));
  assert.equal(canonical.records.length, 0);
  const evidence = await fs.readFile(path.join(directory, "evidence.ndjson"), "utf8");
  assert.equal(evidence.includes('"sourceId":"201"'), false);
  const audit = JSON.parse(await fs.readFile(path.join(directory, "discontinued-products-removed.json"), "utf8"));
  assert.deepEqual(Object.keys(audit.records[0]).sort(), [
    "deletedBytes", "imageCount", "lifecycleStatus", "name", "productPath", "reason", "removedAt",
    "sku", "sourceId", "sourceTag", "sourceUrl", "supplierCode", "supplierId",
  ].sort());
});
