#!/usr/bin/env node

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const source = await readFile(join(root, "src/supabase.ts"), "utf8");
const server = await readFile(join(root, "server/index.mjs"), "utf8");
const copilotApi = await readFile(join(root, "api/rfq-copilot.js"), "utf8");
const migrationDirectory = join(root, "supabase/migrations");
const functionDirectory = join(root, "supabase/functions");
const migrations = await Promise.all(
  (await readdir(migrationDirectory))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => readFile(join(migrationDirectory, name), "utf8")),
);
const migrationSql = migrations.join("\n");
const functionNames = new Set(
  (await readdir(functionDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name),
);

const clientRpcs = new Set(
  [...source.matchAll(/(?:\.rpc|intoolsRpc)(?:<[^>]+>)?\(\s*["']([a-z0-9_]+)["']/g)]
    .map((match) => match[1]),
);
for (const rpc of clientRpcs) {
  assert.match(
    migrationSql,
    new RegExp(`(?:CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION|GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION)\\s+public\\.${rpc}\\b`, "i"),
    `client RPC ${rpc} must be defined by an additive migration`,
  );
}

const browserFunctions = new Set([
  ...[...source.matchAll(/functions\.invoke(?:<[^>]+>)?\(\s*["']([a-z0-9-]+)["']/g)].map((match) => match[1]),
  ...[...source.matchAll(/functions\/v1\/([a-z0-9-]+)/g)].map((match) => match[1]),
  "copilot-agent",
]);
for (const name of browserFunctions) {
  assert.ok(functionNames.has(name), `browser function ${name} must have an Edge Function entrypoint`);
}

for (const route of ["rfq-copilot.js", "visitor-country.js"]) {
  await readFile(join(root, "api", route), "utf8");
}
assert.match(copilotApi, /functions\/v1\/copilot-agent/);
assert.match(copilotApi, /authorization/i);
assert.match(server, /app\.get\("\/health"/);
assert.match(server, /new Set\(\[/);
assert.match(server, /"intools_notification_center"/);
assert.match(server, /"intools_list_agent_knowledge"/);

const stripeWebhook = await readFile(join(functionDirectory, "stripe-webhook/index.ts"), "utf8");
const stripeCheckout = await readFile(join(functionDirectory, "stripe-checkout/index.ts"), "utf8");
assert.match(stripeWebhook, /Invalid webhook signature/);
assert.match(stripeWebhook, /stripe_claim_webhook_event/);
assert.match(stripeCheckout, /invoice_checkout_create_attempt/);
assert.match(stripeCheckout, /p_environment: mode\(\)/);

assert.doesNotMatch(source, /VITE_(?:SUPABASE_SERVICE_ROLE|STRIPE_SECRET|STRIPE_WEBHOOK|OPENROUTER)/);
console.log(`endpoint contracts passed (${clientRpcs.size} RPCs, ${browserFunctions.size} browser functions)`);
