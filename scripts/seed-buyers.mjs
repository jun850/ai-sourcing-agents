// Seed buyer accounts from a CSV into Supabase Auth.
//
// Each row becomes an auth user with a password set and email pre-confirmed
// (no invitation email, no confirmation step). The public.profiles row is
// created by the existing on_auth_user_created trigger with role = 'buyer'.
// Re-running is safe: existing emails are skipped, not modified.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/seed-buyers.mjs [path/to/buyers.csv] [--password 123456] [--dry-run]
//
// Defaults: CSV = scripts/fixtures/buyer-seed.csv, password = 123456
//
// The service-role key is required and must never be committed. Get it from
// the Supabase dashboard: Project settings -> API -> service_role secret.

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const positionals = [];
let password = "123456";
let dryRun = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--password") { password = args[i + 1]; i += 1; }
  else if (args[i] === "--dry-run") { dryRun = true; }
  else positionals.push(args[i]);
}
const csvPath = positionals[0] || new URL("./fixtures/buyer-seed.csv", import.meta.url).pathname;

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!url || !serviceKey)) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

// Minimal RFC-4180 CSV parser: handles quoted fields, embedded commas, and "" escapes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  return rows;
}

const raw = await readFile(csvPath, "utf8");
const [header, ...dataRows] = parseCsv(raw);
const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
const idx = {
  name: col("Name"),
  email: col("Work Email"),
  phone: col("Phone"),
  company: col("Company Name"),
  sourcing: col("What Are you sourcing"),
  revenue: col("Annual Revenue"),
};
if (idx.name === -1 || idx.email === -1 || idx.company === -1) {
  throw new Error("CSV must have Name, Work Email, and Company Name columns.");
}

const buyers = dataRows
  .map((r) => ({
    full_name: (r[idx.name] || "").trim(),
    email: (r[idx.email] || "").trim().toLowerCase(),
    phone: idx.phone === -1 ? "" : (r[idx.phone] || "").trim(),
    company_name: (r[idx.company] || "").trim(),
    sourcing: idx.sourcing === -1 ? "" : (r[idx.sourcing] || "").trim(),
    annual_revenue: idx.revenue === -1 ? "" : (r[idx.revenue] || "").trim(),
  }))
  .filter((b) => b.email);

console.log(`${buyers.length} buyer rows from ${csvPath}`);
console.log(`Target: ${dryRun ? "(dry run, no connection)" : url}`);

const db = dryRun ? null : createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

// Existing emails, paged.
const existing = new Set();
if (!dryRun) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email) existing.add(u.email.toLowerCase());
    if (data.users.length < 1000) break;
  }
}

let created = 0;
let skipped = 0;
const failed = [];
for (const b of buyers) {
  if (existing.has(b.email)) {
    skipped += 1;
    console.log(`skip   ${b.email} (already exists)`);
    continue;
  }
  if (dryRun) {
    created += 1;
    console.log(`would create ${b.email}  ${b.full_name} / ${b.company_name}`);
    continue;
  }
  const { error } = await db.auth.admin.createUser({
    email: b.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: b.full_name,
      company_name: b.company_name,
      ...(b.phone ? { phone: b.phone } : {}),
      ...(b.sourcing ? { sourcing: b.sourcing } : {}),
      ...(b.annual_revenue ? { annual_revenue: b.annual_revenue } : {}),
      seeded: true,
    },
  });
  if (error) {
    failed.push({ email: b.email, message: error.message });
    console.log(`FAIL   ${b.email}: ${error.message}`);
  } else {
    created += 1;
    console.log(`create ${b.email}  ${b.full_name} / ${b.company_name}`);
  }
}

console.log(`\nDone. created=${created} skipped=${skipped} failed=${failed.length}`);
if (failed.length) process.exit(1);
