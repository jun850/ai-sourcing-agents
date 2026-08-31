import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Archive,
  ArrowBack,
  Check,
  Clear,
  DoneAll,
  Edit,
  FileUpload,
  Refresh,
  Restore,
  Save,
} from "@mui/icons-material";
import {
  archiveIntoolsSupplier,
  documentIntoolsSupplierImportContacts,
  getIntoolsSupplierDetail,
  listIntoolsSuppliers,
  promoteIntoolsSupplierImportRows,
  promoteIntoolsSupplierIntake,
  runIntoolsSupplierImportDryRun,
  saveIntoolsSupplier,
  setIntoolsSupplierBrokerStatus,
  setIntoolsSupplierBrokerStatusBulk,
  type IntoolsSupplier,
  type IntoolsSupplierDetail,
  type IntoolsSupplierImportRow,
  type IntoolsSupplierPayload,
} from "./supabase";

type SupplierWorkspaceProps = {
  supplierId: string | null;
  onOpen: (supplierId: string) => void;
  onBack: () => void;
};
type SupplierFilter = "all" | "verified" | "pending" | "unverified" | "archived";
type SupplierDraft = {
  slug: string;
  name: string;
  type: string;
  region: string;
  loc: string;
  verify_state: "unverified" | "pending" | "verified";
  moq: string;
  lead: string;
  capacity: string;
  web: string;
  bio: string;
  certs: string;
  tags: string;
};

const factoryTypes = [
  "fabric_mill",
  "garment_manufacturer",
  "trim_supplier",
];

function supplierSurface(children: ReactNode, sx: Record<string, unknown> = {}) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: "1px solid #dfe4eb",
        borderRadius: 1.75,
        backgroundColor: "#fff",
        ...sx,
      }}
    >
      {children}
    </Paper>
  );
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusColor(value: string): "success" | "warning" | "default" | "info" {
  if (value === "verified") return "success";
  if (value === "pending") return "warning";
  if (value === "unverified") return "info";
  return "default";
}

function supplierDraft(supplier?: IntoolsSupplier | null): SupplierDraft {
  return {
    slug: supplier?.slug || "",
    name: supplier?.name || "",
    type: supplier?.type || "garment_manufacturer",
    region: supplier?.region || "",
    loc: supplier?.loc || "",
    verify_state: supplier?.verify_state || "unverified",
    moq: supplier?.moq || "",
    lead: supplier?.lead || "",
    capacity: supplier?.capacity || "",
    web: supplier?.web || "",
    bio: supplier?.bio || "",
    certs: (supplier?.certs || []).join(", "),
    tags: (supplier?.tags || []).join(", "),
  };
}

function payloadFromDraft(draft: SupplierDraft): IntoolsSupplierPayload {
  return {
    slug: draft.slug.trim(),
    name: draft.name.trim(),
    type: draft.type,
    region: draft.region.trim() || null,
    loc: draft.loc.trim() || null,
    verify_state: draft.verify_state,
    moq: draft.moq.trim() || null,
    lead: draft.lead.trim() || null,
    capacity: draft.capacity.trim() || null,
    web: draft.web.trim() || null,
    bio: draft.bio.trim() || null,
    certs: draft.certs.split(",").map((value) => value.trim()).filter(Boolean),
    tags: draft.tags.split(",").map((value) => value.trim()).filter(Boolean),
  };
}

function ImportPanel({ onComplete }: { onComplete: () => void }) {
  const [source, setSource] = useState("[\n  {\n    \"source_system\": \"manual\",\n    \"source_record_id\": \"example-1\",\n    \"supplier\": {\"name\": \"Example supplier\", \"region\": \"Indonesia\", \"type\": \"garment_manufacturer\"}\n  }\n]");
  const [overwrite, setOverwrite] = useState(false);
  const [run, setRun] = useState<Awaited<ReturnType<typeof runIntoolsSupplierImportDryRun>> | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function parseRows(): IntoolsSupplierImportRow[] {
    const parsed: unknown = JSON.parse(source);
    const rows = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown })?.rows;
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 50) throw new Error("Provide 1–50 JSON rows.");
    return rows.map((item, index) => {
      if (!item || typeof item !== "object") throw new Error(`Row ${index + 1} must be an object.`);
      const row = item as Record<string, unknown>;
      if (typeof row.source_system !== "string" || !row.source_system.trim()) throw new Error(`Row ${index + 1} needs source_system.`);
      if (typeof row.source_record_id !== "string" || !row.source_record_id.trim()) throw new Error(`Row ${index + 1} needs source_record_id.`);
      if (!row.supplier || typeof row.supplier !== "object") throw new Error(`Row ${index + 1} needs a supplier object.`);
      return { ...row, row_number: index + 1 } as IntoolsSupplierImportRow;
    });
  }
  async function dryRun(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setRun(null); setSelected([]);
    try { setRun(await runIntoolsSupplierImportDryRun(parseRows(), overwrite)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not validate import."); }
    finally { setBusy(false); }
  }
  async function promote() {
    if (!run || !selected.length) return;
    setBusy(true); setError("");
    try {
      const rowNumbers = selected;
      const promoted = await promoteIntoolsSupplierImportRows(run.run_id, rowNumbers, overwrite);
      await documentIntoolsSupplierImportContacts(run.run_id, rowNumbers);
      setRun(promoted); setSelected([]); onComplete();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not promote reviewed rows."); }
    finally { setBusy(false); }
  }
  return supplierSurface(
    <Box component="form" onSubmit={dryRun} sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="h2" sx={{ fontSize: 20 }}>Review supplier import</Typography>
          <Typography sx={{ mt: .5, color: "text.secondary", fontSize: 13 }}>Dry-run validates up to 50 rows and records every match, rejection, or ambiguity before promotion.</Typography>
        </Box>
        <TextField label="JSON rows" value={source} onChange={(event) => setSource(event.target.value)} multiline minRows={8} fullWidth slotProps={{ htmlInput: { "aria-label": "Supplier import JSON rows" } }} />
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", gap: 1 }}>
          <Box component="label" sx={{ display: "flex", alignItems: "center", minHeight: 40 }}>
            <Checkbox checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} disabled={busy} />
            <Typography sx={{ fontSize: 13 }}>Explicit overwrite curated fields</Typography>
          </Box>
          <Button type="submit" variant="contained" startIcon={<FileUpload />} disabled={busy}>{busy ? "Checking…" : "Run dry-run"}</Button>
        </Stack>
        {error && <Alert severity="error" role="alert">{error}</Alert>}
        {run && <Stack spacing={1} aria-live="polite">
          <Alert severity={run.rows.some((row) => row.status === "rejected" || row.status === "ambiguous") ? "warning" : "success"}>Run {run.run_id}: {run.rows.length} row(s) checked. Nothing is promoted until reviewed.</Alert>
          {run.rows.map((row) => <Box key={row.row_number} sx={{ display: "flex", alignItems: "flex-start", gap: 1, p: 1.25, border: "1px solid #e1e6ec", borderRadius: 2, minWidth: 0 }}>
            <Checkbox checked={selected.includes(row.row_number)} onChange={() => setSelected((current) => current.includes(row.row_number) ? current.filter((item) => item !== row.row_number) : [...current, row.row_number])} disabled={busy || row.status !== "accepted"} slotProps={{ input: { "aria-label": `Review import row ${row.row_number}` } }} sx={{ p: .25 }} />
            <Box sx={{ minWidth: 0, flex: 1 }}><Typography sx={{ fontSize: 13, fontWeight: 700 }}>Row {row.row_number} · {statusLabel(row.status)}</Typography><Typography sx={{ color: "text.secondary", fontSize: 12, overflowWrap: "anywhere" }}>{row.errors?.map((item) => `${item.path}: ${item.message}`).join(" · ") || (row.candidate_ids?.length ? `Candidates: ${row.candidate_ids.join(", ")}` : row.supplier_id || "Ready for review")}</Typography></Box>
            <Chip size="small" label={statusLabel(row.status)} color={row.status === "accepted" ? "success" : row.status === "ambiguous" ? "warning" : "default"} />
          </Box>)}
          <Button variant="contained" onClick={() => void promote()} disabled={busy || !selected.length} startIcon={<Check />}>{busy ? "Promoting…" : `Promote reviewed (${selected.length})`}</Button>
        </Stack>}
      </Stack>
    </Box>,
  );
}

function SupplierEditor({ supplier, onSaved, onCancel }: { supplier: IntoolsSupplier | null; onSaved: (saved: IntoolsSupplier) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(() => supplierDraft(supplier));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function set<K extends keyof SupplierDraft>(key: K, value: SupplierDraft[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.slug.trim()) { setError("Name and slug are required."); return; }
    setBusy(true); setError("");
    try { onSaved(await saveIntoolsSupplier(supplier?.id || null, payloadFromDraft(draft), supplier?.updated_at || null)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save supplier."); }
    finally { setBusy(false); }
  }
  return supplierSurface(<Box component="form" onSubmit={save} sx={{ p: { xs: 2, sm: 3 } }}>
    <Stack spacing={1.5}>
      <Typography variant="h2" sx={{ fontSize: 20 }}>{supplier ? "Edit supplier" : "New supplier"}</Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}><TextField label="Supplier name" value={draft.name} onChange={(event) => set("name", event.target.value)} required fullWidth autoFocus /><TextField label="Slug" value={draft.slug} onChange={(event) => set("slug", event.target.value)} required fullWidth /></Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}><FormControl fullWidth size="small"><InputLabel id="supplier-type-label">Type</InputLabel><Select labelId="supplier-type-label" label="Type" value={draft.type} onChange={(event) => set("type", event.target.value)}>{factoryTypes.map((type) => <MenuItem key={type} value={type}>{statusLabel(type)}</MenuItem>)}</Select></FormControl><TextField label="Region" value={draft.region} onChange={(event) => set("region", event.target.value)} fullWidth /></Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}><TextField label="Location" value={draft.loc} onChange={(event) => set("loc", event.target.value)} fullWidth /><FormControl fullWidth size="small"><InputLabel id="supplier-state-label">Review state</InputLabel><Select labelId="supplier-state-label" label="Review state" value={draft.verify_state} disabled slotProps={{ input: { "aria-label": "Review state is managed by broker status" } }}>{["unverified", "pending", "verified"].map((state) => <MenuItem key={state} value={state}>{statusLabel(state)}</MenuItem>)}</Select></FormControl></Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}><TextField label="MOQ" value={draft.moq} onChange={(event) => set("moq", event.target.value)} fullWidth /><TextField label="Lead time" value={draft.lead} onChange={(event) => set("lead", event.target.value)} fullWidth /><TextField label="Capacity" value={draft.capacity} onChange={(event) => set("capacity", event.target.value)} fullWidth /></Stack>
      <TextField label="Website" value={draft.web} onChange={(event) => set("web", event.target.value)} fullWidth /><TextField label="Certifications (comma separated)" value={draft.certs} onChange={(event) => set("certs", event.target.value)} fullWidth /><TextField label="Tags (comma separated)" value={draft.tags} onChange={(event) => set("tags", event.target.value)} fullWidth /><TextField label="Internal bio" value={draft.bio} onChange={(event) => set("bio", event.target.value)} multiline minRows={3} fullWidth />
      {error && <Alert severity="error" role="alert">{error}</Alert>}
      <Stack direction="row" sx={{ justifyContent: "flex-end", gap: 1, flexWrap: "wrap" }}><Button onClick={onCancel} disabled={busy}>Cancel</Button><Button type="submit" variant="contained" startIcon={<Save />} disabled={busy}>Save supplier</Button></Stack>
    </Stack>
  </Box>);
}

function SupplierDetail({ supplierId, onBack }: { supplierId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<IntoolsSupplierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => { setLoading(true); setError(""); try { setDetail(await getIntoolsSupplierDetail(supplierId)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load supplier detail."); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [supplierId]);
  if (loading) return <Stack spacing={1}><Skeleton variant="rounded" height={120} /><Skeleton variant="rounded" height={220} /><Skeleton variant="rounded" height={160} /></Stack>;
  if (error || !detail) return <Alert severity="error" action={<Button onClick={() => void load()} startIcon={<Refresh />}>Retry</Button>}>{error || "Supplier not found."}</Alert>;
  const currentDetail = detail;
  const currentBrokerStatus: "review" | "approved" | "rejected" = currentDetail.broker_status === "approved" || currentDetail.broker_status === "rejected" ? currentDetail.broker_status : "review";
  async function archive(restore: boolean) { setBusy(true); setError(""); try { const saved = await archiveIntoolsSupplier(currentDetail.id, currentDetail.updated_at, restore); setDetail((value) => value ? { ...value, ...saved } : value); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update supplier archive state."); } finally { setBusy(false); } }
  async function promoteIntake() { const id = typeof currentDetail.intake?.id === "string" ? currentDetail.intake.id : ""; if (!id) return; setBusy(true); setError(""); try { const saved = await promoteIntoolsSupplierIntake(id); setDetail((value) => value ? { ...value, ...saved } : value); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not promote intake."); } finally { setBusy(false); } }
  async function brokerStatus(status: "review" | "approved" | "rejected", lock: boolean | null = null) { setBusy(true); setError(""); try { const saved = await setIntoolsSupplierBrokerStatus(currentDetail.id, status, lock); setDetail((value) => value ? { ...value, ...saved } : value); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update broker status."); } finally { setBusy(false); } }
  return <Stack spacing={2}>
    <Button onClick={onBack} startIcon={<ArrowBack />} sx={{ alignSelf: "flex-start", px: 0 }}>Back to suppliers</Button>
    {editing ? <SupplierEditor supplier={currentDetail} onCancel={() => setEditing(false)} onSaved={(saved) => { setDetail((value) => value ? { ...value, ...saved } : value); setEditing(false); }} /> : <>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, gap: 1 }}><Box><Typography variant="h2" sx={{ fontSize: { xs: 25, sm: 30 }, overflowWrap: "anywhere" }}>{detail.name}</Typography><Typography sx={{ mt: .4, color: "text.secondary", fontSize: 13 }}>{detail.slug} · {detail.region || "Region not recorded"}</Typography></Box><Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}><Chip label={detail.archived_at ? "Archived" : statusLabel(detail.broker_status || detail.verify_state)} color={detail.archived_at ? "default" : statusColor(detail.verify_state)} /><Button variant="outlined" onClick={() => void brokerStatus("approved")} disabled={busy || detail.archived_at !== null}>Approve</Button><Button variant="outlined" onClick={() => void brokerStatus("rejected")} disabled={busy || detail.archived_at !== null}>Reject</Button><Button variant="outlined" onClick={() => void brokerStatus("review")} disabled={busy || detail.archived_at !== null}>Review</Button><Button variant="outlined" startIcon={<Edit />} onClick={() => setEditing(true)} disabled={busy}>Edit</Button>{detail.archived_at ? <Button variant="outlined" startIcon={<Restore />} onClick={() => void archive(true)} disabled={busy}>Restore</Button> : <Button variant="outlined" startIcon={<Archive />} onClick={() => void archive(false)} disabled={busy}>Archive</Button>}</Stack></Stack>
      {error && <Alert severity="error" role="alert">{error}</Alert>}
      {supplierSurface(<Stack spacing={1.25} sx={{ p: { xs: 2, sm: 3 } }}><Typography sx={{ fontWeight: 800 }}>Supplier record</Typography><Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1.25, flexWrap: "wrap" }}>{[["Type", statusLabel(detail.type)], ["Broker status", statusLabel(currentBrokerStatus)], ["Curation", detail.curation_locked ? "Locked" : "Editable"], ["Location", detail.loc || "—"], ["MOQ", detail.moq || "—"], ["Lead time", detail.lead || "—"], ["Capacity", detail.capacity || "—"], ["Products", String(detail.product_count ?? detail.products.length)]].map(([label, value]) => <Box key={label} sx={{ minWidth: { xs: "45%", sm: 130 } }}><Typography sx={{ color: "text.secondary", fontSize: 11 }}>{label}</Typography><Typography sx={{ mt: .25, fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>{value}</Typography></Box>)}</Stack>{detail.bio && <Typography sx={{ color: "text.secondary", fontSize: 13, lineHeight: 1.55 }}>{detail.bio}</Typography>}{detail.source_reference && <Typography sx={{ color: "text.secondary", fontSize: 12, overflowWrap: "anywhere" }}>Source reference: {detail.source_reference}</Typography>}<Button variant="text" onClick={() => void brokerStatus(currentBrokerStatus, !detail.curation_locked)} disabled={busy} sx={{ alignSelf: "flex-start", px: 0 }}>{detail.curation_locked ? "Unlock curated fields" : "Lock curated fields"}</Button></Stack>)}
      {detail.intake && <Alert severity="info" action={<Button onClick={() => void promoteIntake()} disabled={busy || typeof detail.intake.id !== "string"}>Promote reviewed intake</Button>}>This supplier has a reviewed intake awaiting explicit promotion.</Alert>}
      {supplierSurface(<Stack spacing={1.25} sx={{ p: { xs: 2, sm: 3 } }}><Typography sx={{ fontWeight: 800 }}>Products and RFQ associations</Typography>{detail.products.length ? detail.products.map((product) => <Box key={product.id} sx={{ display: "flex", justifyContent: "space-between", gap: 1, borderBottom: "1px solid #edf0f3", pb: 1, minWidth: 0 }}><Typography sx={{ fontSize: 13, overflowWrap: "anywhere" }}>{product.name} · {product.sku}</Typography><Typography sx={{ color: "text.secondary", fontSize: 12 }}>{statusLabel(product.listing_status)}</Typography></Box>) : <Typography sx={{ color: "text.secondary", fontSize: 13 }}>No products associated.</Typography>}{detail.rfq_associations.length ? <Stack spacing={.75} sx={{ pt: 1 }}>{detail.rfq_associations.map((rfq) => <Typography key={rfq.id} sx={{ fontSize: 13, overflowWrap: "anywhere" }}>{rfq.case_no || rfq.rfq_case_id} · {statusLabel(rfq.status)}</Typography>)}</Stack> : <Typography sx={{ color: "text.secondary", fontSize: 13 }}>No RFQ associations.</Typography>}</Stack>)}
      {supplierSurface(<Stack spacing={1.25} sx={{ p: { xs: 2, sm: 3 } }}><Typography sx={{ fontWeight: 800 }}>Provenance and private contacts</Typography>{detail.provenance.length ? detail.provenance.map((item) => <Typography key={`${item.field_name}-${item.observed_at}`} sx={{ fontSize: 12, overflowWrap: "anywhere" }}>{item.field_name} · {item.value_origin} · {item.source_url || "Source not recorded"}</Typography>) : <Typography sx={{ color: "text.secondary", fontSize: 13 }}>No field provenance returned.</Typography>}{detail.source_contacts.length ? <Stack spacing={.5} sx={{ pt: 1 }}>{detail.source_contacts.map((contact, index) => <Typography key={`${contact.normalized_value}-${index}`} sx={{ fontSize: 12, overflowWrap: "anywhere" }}>{contact.contact_type}: {contact.normalized_value} · {contact.validation_status} · documented only</Typography>)}</Stack> : <Typography sx={{ color: "text.secondary", fontSize: 13 }}>No private source contacts returned.</Typography>}</Stack>)}
      {supplierSurface(<Stack spacing={1} sx={{ p: { xs: 2, sm: 3 } }}><Typography sx={{ fontWeight: 800 }}>Audit history</Typography>{detail.audit.length ? detail.audit.map((item) => <Box key={item.id}><Typography sx={{ fontSize: 13, fontWeight: 700 }}>{statusLabel(item.action)}</Typography><Typography sx={{ color: "text.secondary", fontSize: 12 }}>{item.summary || "No summary"} · {new Date(item.created_at).toLocaleString()}</Typography></Box>) : <Typography sx={{ color: "text.secondary", fontSize: 13 }}>No audit events returned.</Typography>}</Stack>)}
    </>}
  </Stack>;
}

function SupplierList({ onOpen }: { onOpen: (supplierId: string) => void }) {
  const [suppliers, setSuppliers] = useState<IntoolsSupplier[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SupplierFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<{ status: "approved" | "rejected"; ids: string[]; label: string } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState("");
  async function load() { setLoading(true); setError(""); try { setSuppliers(await listIntoolsSuppliers()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load suppliers."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => suppliers.filter((supplier) => {
    const text = `${supplier.name} ${supplier.slug} ${supplier.region || ""} ${supplier.type}`.toLowerCase();
    const matchesQuery = !query.trim() || text.includes(query.trim().toLowerCase());
    const matchesFilter = filter === "all" ? !supplier.archived_at : filter === "archived" ? Boolean(supplier.archived_at) : supplier.verify_state === filter && !supplier.archived_at;
    return matchesQuery && matchesFilter;
  }), [filter, query, suppliers]);
  const actionable = useMemo(() => filtered.filter((supplier) => !supplier.archived_at), [filtered]);
  const selectedActionable = useMemo(() => actionable.filter((supplier) => selectedIds.includes(supplier.id)), [actionable, selectedIds]);
  const allVisibleSelected = actionable.length > 0 && actionable.every((supplier) => selectedIds.includes(supplier.id));
  function toggleSupplier(supplierId: string) { setSelectedIds((current) => current.includes(supplierId) ? current.filter((id) => id !== supplierId) : [...current, supplierId]); }
  function toggleVisible() { setSelectedIds((current) => allVisibleSelected ? current.filter((id) => !actionable.some((supplier) => supplier.id === id)) : [...new Set([...current, ...actionable.map((supplier) => supplier.id)])]); }
  async function applyBulkAction() {
    if (!bulkAction) return;
    setBulkBusy(true); setError("");
    try {
      const result = await setIntoolsSupplierBrokerStatusBulk(bulkAction.ids, bulkAction.status);
      setSelectedIds((current) => current.filter((id) => !bulkAction.ids.includes(id)));
      setBulkResult(result.skipped_region_count
        ? `${result.updated_count} supplier(s) approved. ${result.skipped_region_count} left pending because their region needs broker review.`
        : `${result.updated_count} supplier(s) ${bulkAction.status === "approved" ? "approved" : "rejected"}.`);
      setBulkAction(null);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update supplier review status."); }
    finally { setBulkBusy(false); }
  }
  if (loading) return <Stack spacing={1}><Skeleton variant="rounded" height={56} /><Skeleton variant="rounded" height={78} /><Skeleton variant="rounded" height={78} /><Skeleton variant="rounded" height={78} /></Stack>;
  return <Stack spacing={2}>
    <Stack direction={{ xs: "column", sm: "row" }} sx={{ justifyContent: "space-between", gap: 1 }}><Box><Typography variant="h2" sx={{ fontSize: { xs: 25, sm: 30 } }}>Suppliers</Typography><Typography sx={{ mt: .4, color: "text.secondary", fontSize: 13 }}>Private reviewed records. Nothing here is exposed publicly.</Typography></Box><Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}><Button variant="outlined" startIcon={<FileUpload />} onClick={() => setImporting((value) => !value)}>{importing ? "Close import" : "Review import"}</Button><Button variant="contained" startIcon={<Check />} onClick={() => setCreating((value) => !value)}>{creating ? "Close new supplier" : "New supplier"}</Button></Stack></Stack>
    {error && <Alert severity="error" action={<Button onClick={() => void load()} startIcon={<Refresh />}>Retry</Button>} role="alert">{error}</Alert>}
    {bulkResult && <Alert severity="success" onClose={() => setBulkResult("")}>{bulkResult}</Alert>}
    {importing && <ImportPanel onComplete={() => { void load(); }} />}
    {creating && <SupplierEditor supplier={null} onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); void load(); }} />}
    <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1 }}><TextField label="Search suppliers" value={query} onChange={(event) => setQuery(event.target.value)} fullWidth slotProps={{ htmlInput: { "aria-label": "Search suppliers" } }} /><FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 170 } }}><InputLabel id="supplier-filter-label">Filter</InputLabel><Select labelId="supplier-filter-label" label="Filter" value={filter} onChange={(event) => setFilter(event.target.value as SupplierFilter)}><MenuItem value="all">Active suppliers</MenuItem><MenuItem value="verified">Verified</MenuItem><MenuItem value="pending">Pending review</MenuItem><MenuItem value="unverified">Unverified</MenuItem><MenuItem value="archived">Archived</MenuItem></Select></FormControl></Stack>
    {actionable.length > 0 && <Stack spacing={1} aria-live="polite" aria-busy={bulkBusy}>{bulkAction ? <Alert severity={bulkAction.status === "approved" ? "warning" : "error"} action={<Stack direction="row" spacing={.5}><Button color="inherit" onClick={() => setBulkAction(null)} disabled={bulkBusy}>Cancel</Button><Button color="inherit" onClick={() => void applyBulkAction()} disabled={bulkBusy}>{bulkBusy ? "Applying…" : "Confirm"}</Button></Stack>}>{bulkAction.status === "approved" ? `Approve ${bulkAction.ids.length} ${bulkAction.label}? This marks them verified for broker use.` : `Reject ${bulkAction.ids.length} ${bulkAction.label}? They remain private and pending.`}</Alert> : <Stack direction={{ xs: "column", md: "row" }} sx={{ alignItems: { md: "center" }, justifyContent: "space-between", gap: 1 }}><Box component="label" sx={{ display: "flex", alignItems: "center", minHeight: 36 }}><Checkbox checked={allVisibleSelected} indeterminate={selectedActionable.length > 0 && !allVisibleSelected} onChange={toggleVisible} slotProps={{ input: { "aria-label": `Select ${actionable.length} visible suppliers` } }} /><Typography sx={{ fontSize: 13 }}>{selectedActionable.length ? `${selectedActionable.length} selected` : `${actionable.length} visible`}</Typography></Box><Stack direction="row" sx={{ gap: .75, flexWrap: "wrap" }}><Button size="small" variant="outlined" startIcon={<DoneAll />} onClick={() => setBulkAction({ status: "approved", ids: actionable.map((supplier) => supplier.id), label: "visible suppliers" })}>Approve all visible</Button><Button size="small" variant="outlined" color="error" startIcon={<Clear />} onClick={() => setBulkAction({ status: "rejected", ids: actionable.map((supplier) => supplier.id), label: "visible suppliers" })}>Reject all visible</Button><Button size="small" variant="contained" startIcon={<Check />} disabled={!selectedActionable.length} onClick={() => setBulkAction({ status: "approved", ids: selectedActionable.map((supplier) => supplier.id), label: "selected suppliers" })}>Approve selected</Button><Button size="small" variant="outlined" color="error" startIcon={<Clear />} disabled={!selectedActionable.length} onClick={() => setBulkAction({ status: "rejected", ids: selectedActionable.map((supplier) => supplier.id), label: "selected suppliers" })}>Reject selected</Button></Stack></Stack>}</Stack>}
    {filtered.length ? <Stack component="ul" spacing={1} sx={{ listStyle: "none", p: 0, m: 0 }}>{filtered.map((supplier) => <Box component="li" key={supplier.id}>{supplierSurface(<Box sx={{ display: "grid", gridTemplateColumns: supplier.archived_at ? { xs: "minmax(0,1fr)", sm: "1.5fr 1fr .8fr .8fr" } : { xs: "auto minmax(0,1fr) auto", sm: "auto 1.5fr 1fr .8fr .8fr" }, alignItems: "center", gap: 1.5, p: { xs: 1.5, sm: 2 } }}>{!supplier.archived_at && <Checkbox checked={selectedIds.includes(supplier.id)} onChange={() => toggleSupplier(supplier.id)} slotProps={{ input: { "aria-label": `Select ${supplier.name}` } }} sx={{ p: .25 }} />}<Box component="button" onClick={() => onOpen(supplier.id)} sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr) auto", sm: "minmax(0,1fr)" }, alignItems: "center", gap: 1.5, width: "100%", p: 0, border: 0, textAlign: "left", color: "inherit", background: "transparent", cursor: "pointer", "&:focus-visible": { outline: "3px solid #88b863", outlineOffset: 3 } }}><Box sx={{ minWidth: 0 }}><Typography sx={{ fontSize: 14, fontWeight: 800, overflowWrap: "anywhere" }}>{supplier.name}</Typography><Typography sx={{ color: "text.secondary", fontSize: 12, overflowWrap: "anywhere" }}>{supplier.slug} · {supplier.region || "Region not recorded"}</Typography></Box><Box sx={{ display: { xs: "block", sm: "none" } }}><Chip size="small" label={supplier.archived_at ? "Archived" : statusLabel(supplier.verify_state)} color={supplier.archived_at ? "default" : statusColor(supplier.verify_state)} /></Box></Box><Typography sx={{ display: { xs: "none", sm: "block" }, color: "text.secondary", fontSize: 12 }}>{statusLabel(supplier.type)}</Typography><Typography sx={{ display: { xs: "none", sm: "block" }, color: "text.secondary", fontSize: 12 }}>{supplier.product_count ?? 0} products</Typography><Chip sx={{ display: { xs: "none", sm: "inline-flex" } }} size="small" label={supplier.archived_at ? "Archived" : statusLabel(supplier.verify_state)} color={supplier.archived_at ? "default" : statusColor(supplier.verify_state)} /></Box>)}</Box>)}</Stack> : <>{!error && supplierSurface(<Box sx={{ p: { xs: 2.5, sm: 4 }, textAlign: "center" }}><Typography sx={{ fontWeight: 700 }}>{suppliers.length ? "No matching suppliers" : "No suppliers returned"}</Typography><Typography sx={{ mt: .7, color: "text.secondary", fontSize: 13 }}>{suppliers.length ? "Try another search or filter." : "Reviewed supplier records will appear here."}</Typography></Box>)}</>}
  </Stack>;
}

export function IntoolsSuppliers({ supplierId, onOpen, onBack }: SupplierWorkspaceProps) {
  return supplierId ? <SupplierDetail supplierId={supplierId} onBack={onBack} /> : <SupplierList onOpen={onOpen} />;
}
