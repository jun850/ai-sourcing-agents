import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const root = process.cwd();
const cli = (args) => execFileSync("supabase", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function parseEnv(output) {
  return Object.fromEntries(output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    return match ? [[match[1], match[2].replace(/^['\"]|['\"]$/g, "")]] : [];
  }));
}

function upsertEnv(path, values) {
  const original = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = original.split(/\r?\n/).filter((line) => line && !Object.hasOwn(values, line.split("=", 1)[0]));
  writeFileSync(path, `${lines.join("\n")}\n${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, { mode: 0o600 });
}

console.log("Starting local Supabase services...");
cli(["start"]);
const status = parseEnv(cli(["status", "-o", "env"]));
const url = status.API_URL || "http://127.0.0.1:54321";
const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
if (!key) throw new Error("Supabase CLI did not return a local publishable key.");

const adminEmail = process.env.ATELIX_LOCAL_ADMIN_EMAIL || "admin@local.test";
const adminPassword = process.env.ATELIX_LOCAL_ADMIN_SUPABASE_PASSWORD || "change-me-local-only";
const serviceKey = status.SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error("Supabase CLI did not return a local service-role key.");

async function localAdminUser() {
  const adminResponse = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword, email_confirm: true, user_metadata: { full_name: "Local administrator" } }),
  });
  if (adminResponse.ok) return (await adminResponse.json()).id;
  const loginResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  if (!loginResponse.ok) throw new Error(`Could not create or sign in local admin (${adminResponse.status}).`);
  return (await loginResponse.json()).user.id;
}

const profileId = process.env.ATELIX_LOCAL_ADMIN_PROFILE_ID || await localAdminUser();
await new Promise((resolve) => setTimeout(resolve, 250));
if (!/^[0-9a-f-]{36}$/i.test(profileId)) throw new Error("Local admin profile id is not a UUID.");
execFileSync("docker", ["exec", "supabase_db_marketplace", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `alter table public.profiles disable trigger user; update public.profiles set role = 'admin', full_name = 'Local administrator' where id = '${profileId}'::uuid; alter table public.profiles enable trigger user;`], { cwd: root, stdio: "ignore" });
upsertEnv(`${root}/.env.local`, {
  VITE_SUPABASE_URL: url,
  VITE_SUPABASE_PUBLISHABLE_KEY: key,
  ATELIX_LOCAL_INTOOLS: "1",
  ATELIX_LOCAL_SUPABASE_URL: url,
  ATELIX_LOCAL_SUPABASE_PUBLISHABLE_KEY: key,
  ATELIX_LOCAL_ADMIN_EMAIL: adminEmail,
  ATELIX_LOCAL_ADMIN_PROFILE_ID: profileId,
  ATELIX_LOCAL_ADMIN_SUPABASE_PASSWORD: adminPassword,
  ATELIX_LOCAL_INTOOLS_COOKIE_SECRET: process.env.ATELIX_LOCAL_INTOOLS_COOKIE_SECRET || randomBytes(32).toString("hex"),
});

const functionEnv = `${root}/supabase/functions/.env.local`;
upsertEnv(functionEnv, {
  ATELIX_LOCAL_EDGE: "1",
  SITE_URL: "http://localhost:3000",
  STRIPE_MODE: "local",
  AGENTIC_RFQ_ENABLED: "0",
});

const authHealth = await fetch(`${url}/auth/v1/health`);
if (!authHealth.ok) throw new Error(`Local Auth is not healthy (${authHealth.status}).`);
console.log(`Local Supabase is ready at ${url}.`);
console.log("Mailpit: http://127.0.0.1:54324 | Studio: http://127.0.0.1:54323");
console.log(`Local login: ${adminEmail} / ${adminPassword}`);
