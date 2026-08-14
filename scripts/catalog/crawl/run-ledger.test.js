"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { RunLedger } = require("./run-ledger");

test("leases queue records, resumes expired work, and completes a drained run", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "atelix-ledger-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  let now = Date.parse("2026-08-14T00:00:00Z");
  const ledger = new RunLedger(path.join(directory, "run.sqlite"), { now: () => now });
  context.after(() => ledger.close());
  ledger.createRun({ id: "run-1", source: "apparelx", scope: "fabrics" });
  ledger.enqueue("run-1", [{ kind: "product", sourceId: "P1", url: "https://www.apparel-x.com/product/P1" }]);
  ledger.enqueue("run-1", [{ kind: "product", sourceId: "P1", url: "https://www.apparel-x.com/product/P1", marker: "new" }]);
  const first = ledger.claimNext("run-1", "worker-a", { leaseMs: 1000 });
  assert.equal(first.payload.marker, "new");
  assert.equal(first.attempt_count, 1);
  assert.equal(ledger.claimNext("run-1", "worker-b"), null);
  now += 1001;
  assert.equal(ledger.releaseExpired("run-1"), 1);
  const resumed = ledger.claimNext("run-1", "worker-b");
  assert.equal(resumed.attempt_count, 2);
  assert.throws(() => ledger.complete(resumed.id, "worker-a"), /unowned/);
  ledger.complete(resumed.id, "worker-b", { outputPath: "canonical.ndjson", outputHash: "abc" });
  ledger.closeDiscovery("run-1");
  assert.equal(ledger.finishRunIfDrained("run-1"), true);
  assert.equal(ledger.getRun("run-1").state, "completed");
  assert.deepEqual(ledger.stats("run-1"), { completed: 1 });
});

test("rejects production-capable run modes", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "atelix-ledger-mode-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const ledger = new RunLedger(path.join(directory, "run.sqlite"));
  context.after(() => ledger.close());
  assert.throws(() => ledger.createRun({ source: "apparelx", scope: "oem", mode: "publish" }), /only supports crawl-only/);
});
