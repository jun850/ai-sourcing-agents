"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseArgs } = require("./cli");

test("CLI remains explicitly crawl-only and validates scope without making requests", () => {
  assert.deepEqual(parseArgs(["--scope", "fabrics", "--max-items", "50", "--seed-url", "https://www.apparel-x.com/search.php?category=FABRIC"]), {
    scope: "fabrics", output: null, runId: null, resume: false, delayMs: 750, maxRetries: 3, pageSize: 100, maxItems: 50,
    seedUrls: ["https://www.apparel-x.com/search.php?category=FABRIC"],
  });
  assert.throws(() => parseArgs(["--scope", "products"]), /must be one of/);
  assert.throws(() => parseArgs(["--publish"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--max-items", "0"]), /positive integer/);
});
