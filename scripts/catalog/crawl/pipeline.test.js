"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { SourceAdapter } = require("../adapters/source-adapter");
const { EvidenceStore } = require("./evidence-store");
const { runCrawlOnly } = require("./pipeline");
const { RunLedger } = require("./run-ledger");

class FixtureAdapter extends SourceAdapter {
  constructor() { super({ id: "fixture", allowedScopes: ["fabrics"] }); }
  async *discover(_client, { onEvidence }) {
    await onEvidence({ kind: "discovery", sourceId: "page-1", url: "https://www.apparel-x.com/search", body: "fixture" });
    yield { kind: "product", sourceId: "P1", url: "https://www.apparel-x.com/product/P1" };
  }
  async fetchSupplier() { throw new Error("not expected"); }
  async fetchProducts(_client, candidate, { onEvidence }) {
    await onEvidence({ kind: "product", sourceId: candidate.sourceId, url: candidate.url, body: "detail" });
    return [{ ...candidate, html: "detail" }];
  }
  async fetchMedia() { return []; }
  mapToCanonical(raw, { scope }) { return { source: this.id, sourceId: raw.sourceId, scope }; }
}

test("crawl-only pipeline persists evidence and canonical JSON without a publisher", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "atelix-pipeline-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const ledger = new RunLedger(path.join(directory, "run.sqlite"));
  context.after(() => ledger.close());
  ledger.createRun({ id: "run-1", source: "fixture", scope: "fabrics" });
  const result = await runCrawlOnly({
    adapter: new FixtureAdapter(), client: {}, ledger, evidenceStore: new EvidenceStore(directory),
    scope: "fabrics", runId: "run-1", logger: { warn() {} },
  });
  assert.equal(result.run.mode, "crawl-only");
  assert.equal(result.run.state, "completed");
  assert.deepEqual(result.counts, { completed: 1 });
  const output = JSON.parse(await fs.readFile(path.join(directory, "canonical.json"), "utf8"));
  assert.deepEqual(output.records, [{ source: "fixture", sourceId: "P1", scope: "fabrics" }]);
  await assert.rejects(fs.access(path.join(directory, "publish.json")));
});

test("inventory-all records excluded products without crawling beyond the selection limit", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "atelix-pipeline-inventory-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const ledger = new RunLedger(path.join(directory, "run.sqlite"));
  context.after(() => ledger.close());
  ledger.createRun({ id: "run-inventory", source: "fixture", scope: "fabrics", options: { maxItems: 2 } });
  const stored = new EvidenceStore(directory);
  let inventory = null;
  stored.writeInventory = async (records) => { inventory = records; };
  const adapter = new FixtureAdapter();
  adapter.discover = async function* (_client, { onEvidence }) {
    await onEvidence({ kind: "discovery", sourceId: "page-1", url: "https://www.apparel-x.com/search", body: "fixture" });
    for (const sourceId of ["P1", "P2", "P3"]) yield { kind: "product", sourceId, url: `https://www.apparel-x.com/product/${sourceId}` };
  };
  const result = await runCrawlOnly({
    adapter, client: {}, ledger, evidenceStore: stored, scope: "fabrics", runId: "run-inventory",
    maxItems: 2, inventoryAll: true, logger: { warn() {} },
  });
  assert.equal(result.canonical.recordCount, 2);
  assert.deepEqual(inventory.map((record) => [record.sourceId, record.selected]), [["P1", true], ["P2", true], ["P3", false]]);
  assert.equal(ledger.items("run-inventory").length, 2);
});
