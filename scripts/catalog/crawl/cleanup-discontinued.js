#!/usr/bin/env node
"use strict";

const path = require("node:path");
const fs = require("node:fs/promises");
const { ProductArchiveStore, atomicWrite } = require("./product-archive-store");
const { RunLedger } = require("./run-ledger");

function parseArgs(argv) {
  const options = { output: null, runId: null, wait: false, pollMs: 30_000 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--output") options.output = path.resolve(argv[++index]);
    else if (value === "--run-id") options.runId = argv[++index];
    else if (value === "--wait") options.wait = true;
    else if (value === "--poll-ms") options.pollMs = Number(argv[++index]);
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!options.help && (!options.output || !options.runId)) throw new Error("--output and --run-id are required");
  if (!Number.isFinite(options.pollMs) || options.pollMs < 1_000) throw new Error("--poll-ms must be at least 1000");
  return options;
}

function printHelp() {
  console.log("Usage: node scripts/catalog/crawl/cleanup-discontinued.js --output <run-directory> --run-id <id> [--wait] [--poll-ms 30000]");
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { printHelp(); return; }
  const ledger = new RunLedger(path.join(options.output, "run.sqlite"));
  let stopRequested = false;
  const requestStop = () => { stopRequested = true; };
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);
  try {
    let run = ledger.getRun(options.runId);
    if (!run) throw new Error(`Unknown crawl run: ${options.runId}`);
    while (run.state !== "completed" && options.wait && !stopRequested) {
      await sleep(options.pollMs);
      run = ledger.getRun(options.runId);
    }
    if (stopRequested) return;
    if (run.state !== "completed") throw new Error(`Crawl run is not complete: ${run.state}`);
    const store = new ProductArchiveStore(options.output);
    await store.initialize();
    const queueRows = ledger.items(options.runId);
    const cleanup = await store.removeDiscontinuedProducts({ run, queueRows });
    const checkpoint = await store.writeCheckpoints({ run, queueRows, reason: "post-crawl-discontinued-cleanup" });
    const products = await store.writeProductsCsv(queueRows);
    const validation = await store.validateArchive({ run, queueRows });
    await store.appendHistory(`Post-crawl cleanup retained ${products.recordCount} active products and removed ${cleanup.removedCount} source-tagged discontinued products. Integrity ${validation.success ? "passed" : "failed"}.`);
    await store.writeInstructions({ run, validation });
    const reportPath = path.join(options.output, "crawl-report.json");
    let report = {};
    try { report = JSON.parse(await fs.readFile(reportPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
    report.postCrawlCleanup = cleanup;
    report.products = { recordCount: products.recordCount };
    report.checkpoint = checkpoint.checkpoint;
    report.validation = validation;
    await atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ cleanup, checkpoint: checkpoint.checkpoint.statusCounts, products: products.recordCount, validation }, null, 2));
  } finally {
    process.removeListener("SIGINT", requestStop);
    process.removeListener("SIGTERM", requestStop);
    ledger.close();
  }
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = { main, parseArgs };
