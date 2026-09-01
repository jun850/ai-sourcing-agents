import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dashboard = await readFile("src/dashboard.tsx", "utf8");
const client = await readFile("src/supabase.ts", "utf8");
const extractor = await readFile("supabase/functions/rfq-attachment-extract/index.ts", "utf8");
const migration = await readFile("supabase/migrations/20260901170000_rfq_attachment_document_support.sql", "utf8");

for (const value of ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "application/json", "text/markdown"]) {
  assert.ok(dashboard.includes(value), `dashboard must accept ${value}`);
  assert.ok(client.includes(value), `client upload must accept ${value}`);
  assert.ok(extractor.includes(value), `extractor must accept ${value}`);
  assert.ok(migration.includes(value), `private bucket migration must allow ${value}`);
}
assert.match(dashboard, /Skeleton animation="wave"/);
assert.match(dashboard, /isImageUpload\(file\) && previewUrl/);
assert.match(dashboard, /navigateToDraft\([\s\S]*Promise\.allSettled\(validFiles/);
assert.match(extractor, /google\/gemini-3\.5-flash-lite/);
assert.doesNotMatch(extractor, /VITE_OPENROUTER|OPENROUTER_API_KEY.*VITE/);
console.log("ok - private RFQ attachment previews, async routing, document extraction, and Gemini 3.5 Flash Lite coordinator contracts");
