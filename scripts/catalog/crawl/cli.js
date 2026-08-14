#!/usr/bin/env node
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { ApparelXAdapter, SCOPES } = require("../adapters/apparelx");
const { EvidenceStore } = require("./evidence-store");
const { RateLimitedHttpClient } = require("./http-client");
const { runCrawlOnly } = require("./pipeline");
const { RunLedger } = require("./run-ledger");

function parseArgs(argv) {
  const options = { scope: "oem", output: null, runId: null, resume: false, delayMs: 750, maxRetries: 3, pageSize: 100, maxItems: null, seedUrls: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--scope" || value === "--type") options.scope = argv[++index];
    else if (value === "--output") options.output = path.resolve(argv[++index]);
    else if (value === "--run-id") options.runId = argv[++index];
    else if (value === "--resume") options.resume = true;
    else if (value === "--delay-ms") options.delayMs = Number(argv[++index]);
    else if (value === "--max-retries") options.maxRetries = Number(argv[++index]);
    else if (value === "--page-size") options.pageSize = Number(argv[++index]);
    else if (value === "--max-items") options.maxItems = Number(argv[++index]);
    else if (value === "--seed-url") options.seedUrls.push(argv[++index]);
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!SCOPES.includes(options.scope)) throw new Error(`--scope must be one of: ${SCOPES.join(", ")}`);
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) throw new Error("--delay-ms must be non-negative");
  if (!Number.isInteger(options.maxRetries) || options.maxRetries < 1) throw new Error("--max-retries must be a positive integer");
  if (!Number.isInteger(options.pageSize) || options.pageSize < 1 || options.pageSize > 100) throw new Error("--page-size must be between 1 and 100");
  if (options.maxItems !== null && (!Number.isInteger(options.maxItems) || options.maxItems < 1)) throw new Error("--max-items must be a positive integer");
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/catalog/crawl/cli.js [options]\n\nThis command is crawl-only and never writes to Supabase, Algolia, Git, or production.\n\nOptions:\n  --scope <scope>       suppliers, oem, fabrics, or interlining\n  --output <directory>  Run folder (default: data/catalog-runs/<run-id>)\n  --run-id <id>         Stable run ID for resume\n  --resume              Resume an existing ledger\n  --seed-url <url>      Optional matching official listing seed; repeatable\n  --delay-ms <number>   Minimum delay between requests (default: 750)\n  --max-retries <n>     Retry count (default: 3)\n  --page-size <n>       API page size, maximum 100\n  --max-items <n>       Hard maximum entities for this run\n`);
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) { printHelp(); return; }
  const adapter = new ApparelXAdapter();
  const runId = options.runId || `${adapter.id}-${options.scope}-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;
  const output = options.output || path.resolve(process.cwd(), "data", "catalog-runs", runId);
  await fs.mkdir(output, { recursive: true });
  const ledger = new RunLedger(path.join(output, "run.sqlite"));
  try {
    let run = ledger.getRun(runId);
    if (!run) run = ledger.createRun({ id: runId, source: adapter.id, scope: options.scope, options: { ...options, output } });
    else if (!options.resume) throw new Error(`Run ${runId} already exists; pass --resume`);
    ledger.releaseExpired(runId);
    const client = new RateLimitedHttpClient({ canonicalizeUrl: (url) => adapter.canonicalizeUrl(url), delayMs: options.delayMs, maxRetries: options.maxRetries });
    const result = await runCrawlOnly({ adapter, client, ledger, evidenceStore: new EvidenceStore(output), scope: options.scope, runId, seedUrls: options.seedUrls, pageSize: options.pageSize, maxItems: options.maxItems || Infinity });
    await fs.writeFile(path.join(output, "crawl-report.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(`Crawl-only run ${runId}: ${JSON.stringify(result.counts)}`);
  } finally {
    ledger.close();
  }
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = { main, parseArgs, printHelp };
