"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { RateLimitedHttpClient } = require("./http-client");
const { canonicalizeApparelXUrl } = require("../adapters/apparelx");

test("retries transient failures and canonicalizes redirects", async () => {
  const calls = [];
  const waits = [];
  const responses = [
    { ok: false, status: 503, statusText: "Unavailable", headers: new Headers(), url: "https://www.apparel-x.com/start" },
    { ok: false, status: 302, statusText: "Found", headers: new Headers({ location: "https://vn.apparelx.com/final" }), url: "https://www.apparel-x.com/start" },
    { ok: true, status: 200, statusText: "OK", headers: new Headers(), url: "https://www.apparel-x.com/final" },
  ];
  const client = new RateLimitedHttpClient({
    canonicalizeUrl: canonicalizeApparelXUrl,
    delayMs: 0,
    maxRetries: 2,
    fetchImpl: async (url) => { calls.push(url); return responses.shift(); },
    sleepImpl: async (ms) => waits.push(ms),
  });
  const result = await client.get("https://www.apparel-x.com/start");
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    "https://www.apparel-x.com/start",
    "https://www.apparel-x.com/start",
    "https://www.apparel-x.com/final",
  ]);
  assert.deepEqual(waits, [1000]);
});

test("does not retry permanent client errors", async () => {
  let calls = 0;
  const client = new RateLimitedHttpClient({
    canonicalizeUrl: canonicalizeApparelXUrl,
    delayMs: 0,
    maxRetries: 3,
    fetchImpl: async () => { calls += 1; return { ok: false, status: 404, statusText: "Not Found", headers: new Headers() }; },
    sleepImpl: async () => {},
  });
  await assert.rejects(client.get("https://www.apparel-x.com/missing"), /HTTP 404/);
  assert.equal(calls, 1);
});
