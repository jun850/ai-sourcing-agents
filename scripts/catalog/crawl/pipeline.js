"use strict";

async function runCrawlOnly({ adapter, client, ledger, evidenceStore, scope, runId, owner = `crawler-${process.pid}`, seedUrls = [], pageSize = 100, maxItems = Infinity, maxAttempts = 3, logger = console }) {
  adapter.assertContract().assertScope(scope);
  await evidenceStore.initialize();
  const saveEvidence = (record) => evidenceStore.storeRaw(record);

  for await (const candidate of adapter.discover(client, { scope, seedUrls, pageSize, maxItems, onEvidence: saveEvidence })) {
    ledger.enqueue(runId, [candidate]);
  }
  ledger.closeDiscovery(runId);

  let item;
  while ((item = ledger.claimNext(runId, owner))) {
    try {
      const candidate = item.payload;
      const rawRecords = item.entity_kind === "supplier"
        ? [await adapter.fetchSupplier(client, candidate, { onEvidence: saveEvidence })]
        : await adapter.fetchProducts(client, candidate, { onEvidence: saveEvidence });
      let output;
      for (const raw of rawRecords) {
        const canonical = adapter.mapToCanonical(raw, { scope });
        output = await evidenceStore.appendCanonical(canonical);
      }
      ledger.complete(item.id, owner, { outputPath: output?.path, outputHash: output?.sha256 });
    } catch (error) {
      const retryable = item.attempt_count < maxAttempts;
      ledger.fail(item.id, owner, error, { retryable });
      logger.warn?.(`Crawl failed for ${item.source_id}: ${error.message}`);
    }
  }

  ledger.finishRunIfDrained(runId);
  const canonical = await evidenceStore.materializeCanonicalJson({ source: adapter.id, scope, runId, mode: "crawl-only" });
  return { run: ledger.getRun(runId), counts: ledger.stats(runId), canonical };
}

module.exports = { runCrawlOnly };
