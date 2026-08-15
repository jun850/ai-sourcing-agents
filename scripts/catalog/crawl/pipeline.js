"use strict";

async function runCrawlOnly({ adapter, client, ledger, evidenceStore, scope, runId, owner = `crawler-${process.pid}`, seedUrls = [], pageSize = 100, maxItems = Infinity, inventoryAll = false, maxAttempts = 3, retryFailed = false, maxRepairPasses = 2, completedLimit = null, logger = console, shouldStop = () => false }) {
  adapter.assertContract().assertScope(scope);
  await evidenceStore.initialize();
  const saveEvidence = (record) => evidenceStore.storeRaw(record);
  const runBeforeDiscovery = ledger.getRun(runId);

  if (!runBeforeDiscovery.discovery_closed_at) {
    const inventory = [];
    let discovered = 0;
    const discoveryLimit = inventoryAll ? Infinity : maxItems;
    for await (const candidate of adapter.discover(client, { scope, seedUrls, pageSize, maxItems: discoveryLimit, onEvidence: saveEvidence })) {
      discovered += 1;
      const selected = maxItems === Infinity || discovered <= maxItems;
      inventory.push({ ...candidate, selected, inventoryIndex: discovered });
      if (selected) ledger.enqueue(runId, [candidate]);
    }
    if (typeof evidenceStore.writeInventory === "function") {
      await evidenceStore.writeInventory(inventory, {
        source: adapter.id, scope, runId, selectionLimit: maxItems === Infinity ? null : maxItems,
        discoveredAt: new Date().toISOString(), discoveredCount: inventory.length,
      });
    }
    ledger.closeDiscovery(runId);
  }

  let processed = 0;
  let repairPasses = 0;
  let item;
  do {
    while (!shouldStop() && (item = ledger.claimNext(runId, owner, { completedLimit }))) {
      try {
        const candidate = item.payload;
        const rawRecords = item.entity_kind === "supplier"
          ? [await adapter.fetchSupplier(client, candidate, { onEvidence: saveEvidence })]
          : await adapter.fetchProducts(client, candidate, { onEvidence: saveEvidence });
        let output;
        for (const raw of rawRecords) {
          const canonical = adapter.mapToCanonical(raw, { scope });
          if (typeof evidenceStore.archiveProduct === "function" && canonical.entityType === "product") {
            const archived = await evidenceStore.archiveProduct(canonical, client, {
              onProgress: async () => ledger.heartbeat(item.id, owner, { leaseMs: 30 * 60_000 }),
            });
            output = { path: archived.path, sha256: archived.sha256 };
            await evidenceStore.appendCanonical(archived.record);
          } else {
            output = await evidenceStore.appendCanonical(canonical);
          }
        }
        ledger.complete(item.id, owner, { outputPath: output?.path, outputHash: output?.sha256 });
      } catch (error) {
        const retryable = item.attempt_count < maxAttempts;
        ledger.fail(item.id, owner, error, { retryable });
        logger.warn?.(`Crawl failed for ${item.source_id}: ${error.message}`);
      }
      processed += 1;
      if (typeof evidenceStore.writeCheckpoints === "function" && processed % evidenceStore.checkpointEvery === 0) {
        const run = ledger.getRun(runId);
        const queueRows = ledger.items(runId);
        const result = await evidenceStore.writeCheckpoints({ run, queueRows, reason: `processed-${processed}` });
        await evidenceStore.appendHistory(`Checkpoint after ${processed} attempts: ${JSON.stringify(result.checkpoint.statusCounts)}, ${result.checkpoint.downloadedImages} images stored.`);
      }
    }
    if (shouldStop() || !retryFailed || repairPasses >= maxRepairPasses) break;
    const requeued = ledger.retryPermanentErrors(runId);
    if (!requeued) break;
    repairPasses += 1;
    if (typeof evidenceStore.appendHistory === "function") await evidenceStore.appendHistory(`Repair pass ${repairPasses}: requeued ${requeued} failed products.`);
  } while (true);

  ledger.finishRunIfDrained(runId);
  const run = ledger.getRun(runId);
  const queueRows = ledger.items(runId);
  let discontinuedCleanup = null;
  if (run.state === "completed" && typeof evidenceStore.removeDiscontinuedProducts === "function") {
    discontinuedCleanup = await evidenceStore.removeDiscontinuedProducts({ run, queueRows });
    await evidenceStore.appendHistory(`Removed ${discontinuedCleanup.removedCount} source-tagged discontinued or scheduled-for-discontinuation products from local storage.`);
  }
  const canonical = await evidenceStore.materializeCanonicalJson({
    source: adapter.id, scope, runId, mode: "crawl-only",
    discontinuedRemoved: discontinuedCleanup?.removedCount || 0,
  });
  const counts = ledger.stats(runId);
  let checkpoint = null;
  let products = null;
  let validation = null;
  if (typeof evidenceStore.writeCheckpoints === "function") {
    checkpoint = await evidenceStore.writeCheckpoints({ run, queueRows, reason: "final" });
    products = await evidenceStore.writeProductsCsv(queueRows);
    if (run.state === "completed") {
      validation = await evidenceStore.validateArchive({ run, queueRows });
      await evidenceStore.appendHistory(`Final state: ${JSON.stringify(checkpoint.checkpoint.statusCounts)}, ${validation.imageCount} verified images. Integrity ${validation.success ? "passed" : "failed"}.`);
      await evidenceStore.writeInstructions({ run, validation });
    } else {
      await evidenceStore.appendHistory(`Paused state: ${JSON.stringify(checkpoint.checkpoint.statusCounts)}. Resume is required before final integrity verification.`);
    }
  }
  return { run, counts, canonical, checkpoint: checkpoint?.checkpoint || null, products: products ? { recordCount: products.recordCount } : null, validation, repairPasses, discontinuedCleanup };
}

module.exports = { runCrawlOnly };
