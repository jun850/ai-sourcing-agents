"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");
const { promisify } = require("node:util");
const { EvidenceStore } = require("./evidence-store");

const gunzip = promisify(zlib.gunzip);

test("stores compressed raw evidence and newline-delimited canonical data", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "atelix-evidence-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new EvidenceStore(directory);
  await store.initialize();
  const evidence = await store.storeRaw({ kind: "product", sourceId: "ABC/123", url: "https://www.apparel-x.com/product/ABC", body: "<html>evidence</html>", contentType: "text/html" });
  assert.equal(String(await gunzip(await fs.readFile(path.join(directory, evidence.path)))), "<html>evidence</html>");
  await store.appendCanonical({ source: "apparelx", sourceId: "ABC" });
  const canonical = await fs.readFile(path.join(directory, "canonical.ndjson"), "utf8");
  assert.deepEqual(canonical.trim().split("\n").map(JSON.parse), [{ source: "apparelx", sourceId: "ABC" }]);
  const manifest = (await fs.readFile(path.join(directory, "evidence.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(manifest[0].encoding, "gzip");
  assert.equal(manifest[0].sha256.length, 64);
  const result = await store.materializeCanonicalJson({ runId: "run-1" });
  const json = JSON.parse(await fs.readFile(path.join(directory, result.path), "utf8"));
  assert.equal(json.metadata.recordCount, 1);
  assert.deepEqual(json.records, [{ source: "apparelx", sourceId: "ABC" }]);
});
