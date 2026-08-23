import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const MAX_ROWS = 50;
const FACTORY_TYPES = [
  "fabric_mill",
  "garment_manufacturer",
  "trim_supplier",
] as const;
const VerifyState = z.enum(["unverified", "pending", "verified"]);
const SupplierPayload = z.object({
  slug: z.string().trim().min(1).max(160).optional(),
  name: z.string().trim().min(1).max(200),
  type: z.enum(FACTORY_TYPES),
  region: z.string().trim().max(160).nullable().optional(),
  loc: z.string().trim().max(240).nullable().optional(),
  verify_state: VerifyState.optional(),
  years: z.number().int().min(0).max(500).nullable().optional(),
  moq: z.string().trim().max(240).nullable().optional(),
  lead: z.string().trim().max(240).nullable().optional(),
  capacity: z.string().trim().max(240).nullable().optional(),
  certs: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
  tags: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
  sales: z.string().trim().max(240).nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  web: z.string().trim().max(500).nullable().optional(),
  founded: z.number().int().min(1500).max(2200).nullable().optional(),
  employees: z.string().trim().max(160).nullable().optional(),
  area: z.string().trim().max(160).nullable().optional(),
  port: z.string().trim().max(160).nullable().optional(),
  bio: z.string().trim().max(4000).nullable().optional(),
  img: z.string().trim().max(1000).nullable().optional(),
  logo_img: z.string().trim().max(1000).nullable().optional(),
  page_img: z.string().trim().max(1000).nullable().optional(),
  copy_i18n: z.record(z.unknown()).optional(),
});
const ImportRow = z.object({
  source_system: z.enum(["manual", "apparelx"]),
  source_record_id: z.string().trim().min(1).max(240),
  source_url: z.string().url().nullable().optional(),
  supplier: SupplierPayload,
  provenance: z.array(z.record(z.unknown())).optional(),
});

type NormalizedRow = z.infer<typeof ImportRow> & { row_number: number; input_sha256: string };
type RowError = { row_number: number; source_record_id?: string; errors: Array<{ path: string; message: string }> };
type DryRunRow = {
  row_number: number;
  status: "accepted" | "rejected" | "ambiguous" | "promoted" | "failed";
  source_record_id: string;
  supplier_id?: string | null;
  candidate_ids?: string[];
  errors?: Array<{ path: string; message: string }>;
};
type DryRunResult = { run_id: string; status: string; rows: DryRunRow[] };

function usage(): never {
  console.error("Usage: npm run suppliers:import -- <file.csv|file.json> [--dry-run|--apply] [--overwrite] [--out path] [--rows 1,2]");
  process.exit(2);
}

function flag(name: string) {
  return process.argv.includes(name);
}
function option(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] || usage();
}
function splitList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return typeof value === "string" ? value.split(/[|;]/).map((item) => item.trim()).filter(Boolean) : [];
}
function numberOrNull(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : value;
}
function optionalString(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : value;
  return normalized === "" || normalized === undefined ? null : normalized;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === "," && !quoted) { row.push(cell); cell = ""; continue; }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...data] = rows;
  if (!header?.length) throw new Error("CSV must include a header row.");
  return data.map((values) => Object.fromEntries(header.map((key, index) => [key.trim(), values[index] ?? ""])));
}

function sourceRows(text: string, extension: string): unknown[] {
  if (extension === ".csv") return parseCsv(text);
  const parsed: unknown = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown }).rows)) return (parsed as { rows: unknown[] }).rows;
  throw new Error("JSON must be an array or an object with a rows array.");
}

function normalizeRow(raw: unknown, rowNumber: number) {
  if (!raw || typeof raw !== "object") throw new Error("Row must be an object.");
  const value = raw as Record<string, unknown>;
  const rawSupplier = value.supplier && typeof value.supplier === "object" ? value.supplier as Record<string, unknown> : value;
  const supplier = {
    ...rawSupplier,
    type: rawSupplier.type,
    region: optionalString(rawSupplier.region),
    loc: optionalString(rawSupplier.loc),
    verify_state: rawSupplier.verify_state || "pending",
    years: numberOrNull(rawSupplier.years),
    founded: numberOrNull(rawSupplier.founded),
    moq: optionalString(rawSupplier.moq),
    lead: optionalString(rawSupplier.lead),
    capacity: optionalString(rawSupplier.capacity),
    sales: optionalString(rawSupplier.sales),
    phone: optionalString(rawSupplier.phone),
    web: optionalString(rawSupplier.web),
    employees: optionalString(rawSupplier.employees),
    area: optionalString(rawSupplier.area),
    port: optionalString(rawSupplier.port),
    bio: optionalString(rawSupplier.bio),
    img: optionalString(rawSupplier.img),
    logo_img: optionalString(rawSupplier.logo_img),
    page_img: optionalString(rawSupplier.page_img),
    certs: splitList(rawSupplier.certs),
    tags: splitList(rawSupplier.tags),
  };
  const candidate = {
    source_system: typeof value.source_system === "string" ? value.source_system.trim().toLowerCase() : value.source_system,
    source_record_id: value.source_record_id,
    source_url: optionalString(value.source_url),
    supplier,
    provenance: Array.isArray(value.provenance) ? value.provenance : undefined,
  };
  const parsed = ImportRow.parse(candidate);
  if (parsed.source_system === "manual" && parsed.source_url) throw new Error("manual rows must not include a source URL");
  if (parsed.source_system === "apparelx" && !/^https:\/\/(www\.)?apparel-x\.com\//.test(parsed.source_url || "")) throw new Error("apparelx rows require an approved https://apparel-x.com/ source URL");
  const input_sha256 = createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
  return { ...parsed, row_number: rowNumber, input_sha256 } satisfies NormalizedRow;
}

function errorsFor(error: unknown): Array<{ path: string; message: string }> {
  if (error instanceof z.ZodError) return error.issues.map((issue) => ({ path: issue.path.join(".") || "row", message: issue.message }));
  return [{ path: "row", message: error instanceof Error ? error.message : "Invalid row." }];
}

async function writeArtifact(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n", "utf8");
}
async function writeJsonl(path: string, rows: unknown[]) {
  await writeArtifact(path, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
}

type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
async function rpc<T>(supabase: RpcClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}

async function main() {
  const input = process.argv[2];
  if (!input || input.startsWith("--")) usage();
  const apply = flag("--apply");
  if (apply && flag("--dry-run")) throw new Error("Choose either --dry-run or --apply.");
  const overwrite = flag("--overwrite");
  const output = resolve(option("--out") || `artifacts/supplier-import-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const selectedRows = option("--rows")?.split(",").map((value) => Number(value.trim())).filter(Number.isInteger) || null;
  const extension = input.toLowerCase().endsWith(".csv") ? ".csv" : ".json";
  const rawRows = sourceRows(await readFile(resolve(input), "utf8"), extension);
  if (rawRows.length < 1 || rawRows.length > MAX_ROWS) throw new Error(`Import must contain 1–${MAX_ROWS} rows; received ${rawRows.length}.`);
  const normalized: NormalizedRow[] = [];
  const rejected: RowError[] = [];
  rawRows.forEach((row, index) => {
    try { normalized.push(normalizeRow(row, index + 1)); }
    catch (error) { rejected.push({ row_number: index + 1, source_record_id: row && typeof row === "object" && typeof (row as Record<string, unknown>).source_record_id === "string" ? String((row as Record<string, unknown>).source_record_id) : undefined, errors: errorsFor(error) }); }
  });
  await writeJsonl(resolve(output, "rejected.jsonl"), rejected);
  await writeJsonl(resolve(output, "provenance.jsonl"), normalized.flatMap((row) => (row.provenance || []).map((item) => ({ ...item, row_number: row.row_number, source_system: row.source_system, source_record_id: row.source_record_id, input_sha256: row.input_sha256 }))));
  if (!normalized.length) { await writeArtifact(resolve(output, "run.json"), { status: "rejected", rows: 0, output }); return; }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.SUPPLIER_IMPORT_EMAIL;
  const password = process.env.SUPPLIER_IMPORT_PASSWORD;
  if (!url || !key || !email || !password) throw new Error("Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPPLIER_IMPORT_EMAIL, and SUPPLIER_IMPORT_PASSWORD.");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) throw new Error(`Admin sign-in failed: ${authError.message}`);
  const rpcClient = supabase as unknown as RpcClient;
  const dryRun = await rpc<DryRunResult>(rpcClient, "intools_supplier_import_dry_run", { p_rows: normalized, p_overwrite: overwrite });
  await writeArtifact(resolve(output, "run.json"), { ...dryRun, input_file: resolve(input), apply_requested: apply, overwrite_requested: overwrite, identity_precedence: ["source_system + source_record_id", "normalized company name + region"], source_url_role: "provenance_only" });
  await writeJsonl(resolve(output, "accepted.jsonl"), dryRun.rows.filter((row) => row.status === "accepted"));
  await writeJsonl(resolve(output, "ambiguous.jsonl"), dryRun.rows.filter((row) => row.status === "ambiguous"));
  if (apply) {
    const rowNumbers = dryRun.rows.filter((row) => row.status === "accepted" && (!selectedRows || selectedRows.includes(row.row_number))).map((row) => row.row_number);
    if (!rowNumbers.length) throw new Error("No accepted rows selected for promotion.");
    const promoted = await rpc<DryRunResult>(rpcClient, "intools_promote_supplier_import_rows", { p_run_id: dryRun.run_id, p_row_numbers: rowNumbers, p_overwrite: overwrite });
    await writeArtifact(resolve(output, "promotion.json"), promoted);
  }
  console.log(JSON.stringify({ output, run_id: dryRun.run_id, status: dryRun.status, accepted: dryRun.rows.filter((row) => row.status === "accepted").length, rejected: rejected.length + dryRun.rows.filter((row) => row.status === "rejected").length, ambiguous: dryRun.rows.filter((row) => row.status === "ambiguous").length, promoted: apply }), null, 2);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
