import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { ThemeProvider, createTheme } from "@mui/material";
import {
  approveRegistrationRequest,
  addIntoolsRfqSupplierMatch,
  activateIntoolsRfqOutreachTemplate,
  archiveIntoolsAgentKnowledge,
  archiveIntoolsSupplier,
  assertIntoolsAdmin,
  cancelIntoolsInvoice,
  createIntoolsRfqPhaseInvoice,
  createIntoolsInvoice,
  declineRegistrationRequest,
  generateIntoolsRfqSupplierMatches,
  getIntoolsRfqOperations,
  getIntoolsRfqOutreachSettings,
  getIntoolsHumanLoopFeatureFlags,
  getIntoolsBuyerUnreadCount,
  getIntoolsInvoiceDetail,
  getIntoolsOrderDetail,
  getIntoolsSupplierDetail,
  getLocalIntoolsSession,
  getSession,
  getUserDisplayName,
  listIntoolsAgentKnowledge,
  listIntoolsAudit,
  listIntoolsInvoices,
  listIntoolsOrders,
  listIntoolsRegistrationRequests,
  listIntoolsRfqCases,
  listIntoolsRfqQuotes,
  listIntoolsSuppliers,
  loginLocalIntools,
  promoteIntoolsSupplierImportRows,
  prepareIntoolsRfqOutreachDraft,
  publishIntoolsAgentKnowledge,
  publishIntoolsRfqQuoteReviewed,
  publishIntoolsRfqProductionUpdate,
  publishIntoolsRfqSample,
  recordIntoolsManualPayment,
  recordIntoolsRfqOutreachCopy,
  recordIntoolsRfqSupplierResponse,
  resetIntoolsRfqOutreachDraft,
  runIntoolsSupplierImportDryRun,
  saveIntoolsSupplier,
  saveIntoolsRfqOutreachTemplate,
  sendIntoolsInvoice,
  setIntoolsRfqSupplierMatchStatus,
  setIntoolsHumanLoopFeatureFlag,
  setIntoolsSupplierBrokerStatus,
  setIntoolsSupplierBrokerStatusBulk,
  subscribeToRfqActivity,
  markIntoolsRfqSupplierContacted,
  updateIntoolsInvoice,
  updateIntoolsOrderProductionStage,
  updateIntoolsOrderStatus,
  updateIntoolsRfqStatus,
  updateIntoolsRfqOutreachDraft,
  beginIntoolsManualQcReview,
  reviewIntoolsQcInspection,
  uploadIntoolsQcEvidence,
  uploadIntoolsAgentKnowledge,
  type IntoolsAgentKnowledgeDocument,
  type IntoolsInvoice,
  type IntoolsInvoiceDetail,
  type IntoolsOrder,
  type IntoolsOrderDetail,
  type IntoolsRegistrationRequest,
  type IntoolsRfqCase,
  type IntoolsOutreachDraft,
  type IntoolsOutreachSettings,
  type HumanLoopFeatureFlag,
  type HumanLoopFeatureFlags,
  type IntoolsRfqQuote,
  type IntoolsRfqSupplierMatch,
  type IntoolsProductionUpdate,
  type IntoolsQcInspection,
  type IntoolsSupplier,
  type IntoolsSupplierDetail,
  type IntoolsSupplierImportRow,
  type IntoolsSupplierPayload,
} from "./supabase";
import { NotificationBell } from "./notification-bell";
import { RfqOpsMessagesWorkspace } from "./rfq-ops-messages";
import { IntoolsAnalytics } from "./intools-analytics";

/* ------------------------------------------------------------------ tokens */

const intoolsTheme = createTheme({
  typography: { fontFamily: "'DM Sans', Arial, sans-serif" },
  palette: {
    background: { default: "#f4f6f9", paper: "#fff" },
    text: { primary: "#202936", secondary: "#758091" },
    primary: { main: "#28704b" },
  },
});

const C = {
  page: "#f4f6f9",
  surface: "#fff",
  border: "#dfe4eb",
  line: "#edf0f3",
  text: "#202936",
  dim: "#758091",
  faint: "#9aa4b2",
  head: "#526176",
  moss: "#28704b",
  mossSoft: "#6fae86",
  ink: "#334256",
  sidebar: "#1c2430",
  danger: "#a33b36",
};

const TONES: Record<string, { bg: string; color: string }> = {
  success: { bg: "#e3f1e8", color: "#1f6b43" },
  warning: { bg: "#fbeed2", color: "#8a5a10" },
  danger: { bg: "#fbe6e4", color: "#a33b36" },
  info: { bg: "#e2edf5", color: "#2c5f7a" },
  neutral: { bg: "#eef1f4", color: "#55606e" },
  primary: { bg: "#e7f0ea", color: "#28704b" },
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  draft: "neutral",
  sent: "info",
  paid: "success",
  overdue: "warning",
  cancelled: "neutral",
  awaiting_payment: "warning",
  payment_declared: "info",
  payment_verified: "primary",
  fulfilling: "info",
  completed: "success",
  disputed: "danger",
  refunded: "neutral",
  buyer_review: "info",
  awaiting_supplier: "warning",
  needs_research: "neutral",
  quote_selected: "success",
  supplier_replied: "info",
  in_production: "info",
  closed: "neutral",
  reviewed: "primary",
  archived: "neutral",
  pending_review: "warning",
  approved: "success",
  declined: "danger",
  invited: "info",
  verified: "success",
  pending: "warning",
  unverified: "neutral",
  review: "warning",
  rejected: "danger",
  published: "success",
  ready: "info",
  processing: "warning",
  failed: "danger",
  uploaded: "neutral",
  suggested: "neutral",
  selected: "primary",
};

const SECTION_ACCENT: Record<string, string> = {
  invoices: "#3d6b96",
  orders: "#2f8a86",
  requests: "#3f7d52",
  registrations: "#a3771c",
  suppliers: "#2f7d5c",
  knowledge: "#6a5a96",
  audit: "#6b7482",
  messages: "#45556b",
};

/* ------------------------------------------------------------------ helpers */

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Trusted supplier-import source systems (see broker_valid_source in the DB).
const SUPPLIER_IMPORT_SOURCE_SYSTEMS = ["manual", "apparelx", "regional_web"];

// RFC 4180-ish CSV reader: honours quoted fields, embedded commas/newlines,
// and "" escapes. Returns objects keyed by lower-cased header.
function parseCsvTable(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    const next = clean[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(cell); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows;
  if (!header?.length) return [];
  const keys = header.map((key) => key.trim().toLowerCase());
  return body.map((values) => Object.fromEntries(keys.map((key, column) => [key, (values[column] ?? "").trim()])));
}

function splitDelimitedList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[;|]/).map((item) => item.trim()).filter(Boolean);
  return [];
}
function optionalText(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const text = typeof candidate === "string" ? candidate.trim() : candidate;
    if (text !== undefined && text !== null && text !== "") return String(text);
  }
  return null;
}
function optionalYear(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

// Normalises one uploaded entry (flat CSV row or nested/flat JSON object) into a
// dry-run import row. Accepts both the importer column set and the research CSV
// column set, and never emits an untrusted source_system.
function supplierImportRowFromEntry(entry: Record<string, unknown>, index: number): IntoolsSupplierImportRow {
  const nested = entry.supplier && typeof entry.supplier === "object" ? entry.supplier as Record<string, unknown> : null;
  const raw = nested ?? entry;
  const sourceUrl = optionalText(entry.source_url, raw.source_url, raw.website, raw.web);
  const declared = typeof entry.source_system === "string" ? entry.source_system.trim().toLowerCase() : "";
  const source_system = SUPPLIER_IMPORT_SOURCE_SYSTEMS.includes(declared)
    ? declared
    : sourceUrl && /^https:\/\/[^\s]+$/.test(sourceUrl) ? "regional_web" : "manual";
  const supplier: IntoolsSupplierPayload = {
    slug: optionalText(raw.slug) ?? undefined,
    name: optionalText(raw.name, raw.factory_name, raw.company, raw.company_name) ?? "",
    type: (optionalText(raw.type) ?? "garment_manufacturer"),
    region: optionalText(raw.region, raw.country),
    loc: optionalText(raw.loc, raw.city, raw.location),
    moq: optionalText(raw.moq),
    lead: optionalText(raw.lead, raw.avg_lead_time, raw.lead_time),
    capacity: optionalText(raw.capacity),
    web: optionalText(raw.web, raw.website),
    sales: optionalText(raw.sales, raw.contact_email, raw.email),
    phone: optionalText(raw.phone, raw.contact_phone),
    bio: optionalText(raw.bio, raw.notes, raw.description),
    years: optionalYear(raw.years),
    founded: optionalYear(raw.founded),
    certs: splitDelimitedList(raw.certs ?? raw.certifications),
    tags: splitDelimitedList(raw.tags ?? raw.items_supported ?? raw.items),
  };
  return {
    row_number: index + 1,
    source_system,
    source_record_id: String(
      entry.source_record_id || raw.source_record_id || supplier.slug || supplier.name || index + 1,
    ).trim(),
    source_url: source_system === "manual" ? null : sourceUrl,
    supplier,
  };
}
function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "A"
  );
}
function usd(cents: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (Number(cents) || 0) / 100,
  );
}
function usdFromNumber(value: number | null | undefined) {
  return usd(Math.round((Number(value) || 0) * 100));
}
function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? String(value)
    : parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function formatBytes(value: number | null | undefined) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}
function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
function navigate(path: string) {
  history.replaceState({}, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

function btnStyle(
  tone: "primary" | "success" | "danger" | "neutral",
  size: "sm" | "md" = "md",
): CSSProperties {
  const height = size === "sm" ? 32 : 36;
  const base: CSSProperties = {
    height,
    padding: "0 13px",
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  if (tone === "danger")
    return { ...base, border: `1px solid ${C.danger}`, background: "#fff", color: C.danger };
  if (tone === "success" || tone === "primary")
    return { ...base, border: `1px solid ${C.moss}`, background: C.moss, color: "#fff" };
  return { ...base, border: `1px solid ${C.border}`, background: "#fff", color: "#45556b" };
}

function statusPill(status: string): CSSProperties {
  const tone = TONES[STATUS_TONE[status] || "neutral"];
  return {
    display: "inline-block",
    fontSize: 11,
    fontWeight: 800,
    padding: "3px 9px",
    borderRadius: 999,
    background: tone.bg,
    color: tone.color,
    whiteSpace: "nowrap",
  };
}

function downloadCsv(filename: string, rows: string[][]) {
  const escape = (cell: string) => `"${String(cell ?? "").replace(/"/g, '""')}"`;
  const body = rows.map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ model */

type Section =
  | "analytics"
  | "invoices"
  | "orders"
  | "requests"
  | "registrations"
  | "suppliers"
  | "knowledge"
  | "messages"
  | "audit"
  | "settings";

type GenericSection = Exclude<Section, "analytics" | "messages" | "settings">;

const NAV_ORDER: Section[] = [
  "analytics",
  "invoices",
  "orders",
  "requests",
  "registrations",
  "suppliers",
  "knowledge",
  "messages",
  "audit",
  "settings",
];

type BulkAction = {
  key: string;
  label: string;
  status: string;
  tone: "primary" | "success" | "danger" | "neutral";
  confirm?: boolean;
  archives?: boolean;
};

type SectionMeta = {
  label: string;
  description: string;
  searchPlaceholder: string;
  emptyText: string;
  selectable: boolean;
  columnLabels: string[];
  filters: string[];
  primaryActions: { key: string; label: string }[];
  bulkActions: BulkAction[];
  uploadAccept?: string;
  uploadAcceptAttr?: string;
};

const SECTIONS: Record<GenericSection, SectionMeta> = {
  invoices: {
    label: "Invoices",
    description:
      "Draft, send, and track commercial invoices. Totals and settlement are server-authoritative.",
    searchPlaceholder: "Search invoices",
    emptyText: "Create a draft invoice when a commercial handoff is ready.",
    selectable: true,
    columnLabels: ["Case", "Total", "Due"],
    filters: ["all", "draft", "sent", "paid", "overdue", "cancelled"],
    primaryActions: [{ key: "new", label: "New invoice" }],
    bulkActions: [
      { key: "send", label: "Send selected", status: "sent", tone: "primary" },
      { key: "markPaid", label: "Mark paid", status: "paid", tone: "success" },
      { key: "cancel", label: "Cancel selected", status: "cancelled", tone: "danger", confirm: true },
    ],
  },
  orders: {
    label: "Orders",
    description:
      "Immutable order items and fulfillment status. Payment settlement is never changed here.",
    searchPlaceholder: "Search orders",
    emptyText: "Orders appear once an invoice is paid.",
    selectable: true,
    columnLabels: ["Items", "Total", "Placed"],
    filters: [
      "all",
      "awaiting_payment",
      "payment_declared",
      "payment_verified",
      "fulfilling",
      "completed",
      "cancelled",
    ],
    primaryActions: [{ key: "export", label: "Export CSV" }],
    bulkActions: [
      { key: "fulfilling", label: "Mark fulfilling", status: "fulfilling", tone: "primary" },
      { key: "completed", label: "Mark completed", status: "completed", tone: "success" },
      { key: "cancel", label: "Cancel selected", status: "cancelled", tone: "danger", confirm: true },
    ],
  },
  requests: {
    label: "Requests / RFQ queue",
    description: "Human review of sourcing cases before supplier outreach or matching.",
    searchPlaceholder: "Search requests",
    emptyText: "New RFQ cases will appear here for review.",
    selectable: true,
    columnLabels: ["Buyer"],
    filters: [
      "all",
      "needs_research",
      "awaiting_supplier",
      "supplier_replied",
      "buyer_review",
      "quote_selected",
      "in_production",
      "reviewed",
    ],
    primaryActions: [],
    bulkActions: [
      { key: "review", label: "Mark reviewed", status: "reviewed", tone: "primary" },
      { key: "archive", label: "Archive selected", status: "archived", tone: "neutral", confirm: true, archives: true },
    ],
  },
  registrations: {
    label: "Sign-up requests",
    description: "Manual approval gate for new accounts. Nothing here is visible to non-admins.",
    searchPlaceholder: "Search sign-up requests",
    emptyText: "Access requests will appear here for review.",
    selectable: true,
    columnLabels: ["Company", "Sourcing", "Requested"],
    filters: ["all", "pending_review", "approved", "invited", "declined"],
    primaryActions: [],
    bulkActions: [
      { key: "approve", label: "Approve selected", status: "approved", tone: "success" },
      { key: "decline", label: "Decline selected", status: "declined", tone: "danger", confirm: true },
    ],
  },
  suppliers: {
    label: "Suppliers",
    description: "Private reviewed supplier records. Nothing here is exposed publicly.",
    searchPlaceholder: "Search suppliers",
    emptyText: "Reviewed supplier records will appear here.",
    selectable: true,
    columnLabels: ["Region", "Type"],
    filters: ["all", "approved", "review", "rejected", "archived"],
    primaryActions: [
      { key: "new", label: "New supplier" },
      { key: "upload", label: "Bulk upload" },
    ],
    bulkActions: [
      { key: "approve", label: "Approve selected", status: "approved", tone: "success" },
      { key: "reject", label: "Reject selected", status: "rejected", tone: "danger" },
      { key: "archive", label: "Archive selected", status: "archived", tone: "neutral", confirm: true, archives: true },
    ],
    uploadAccept: "CSV or JSON · up to 50 rows",
    uploadAcceptAttr: ".csv,.json",
  },
  knowledge: {
    label: "Knowledge documents",
    description: "Approved context for the agent. Files stay private until published.",
    searchPlaceholder: "Search knowledge documents",
    emptyText: "Upload an approved context file to begin processing.",
    selectable: true,
    columnLabels: ["Domain", "Visibility", "Size"],
    filters: ["all", "uploaded", "processing", "ready", "published", "failed", "archived"],
    primaryActions: [{ key: "upload", label: "Upload documents" }],
    bulkActions: [
      { key: "publish", label: "Publish selected", status: "published", tone: "success" },
      { key: "archive", label: "Archive selected", status: "archived", tone: "neutral", confirm: true, archives: true },
    ],
    uploadAccept: "TXT, MD, CSV, PDF, DOC, DOCX, XLS or XLSX · max 25 MB each",
    uploadAcceptAttr: ".txt,.md,.csv,.pdf,.doc,.docx,.xls,.xlsx",
  },
  audit: {
    label: "Audit history",
    description: "Every consequential change, attributable and read-only.",
    searchPlaceholder: "Search audit history",
    emptyText: "Actions taken across Intools will appear here.",
    selectable: false,
    columnLabels: ["Summary", "When"],
    filters: ["all"],
    primaryActions: [{ key: "export", label: "Export CSV" }],
    bulkActions: [],
  },
};

const SECTION_LABEL: Record<Section, string> = {
  analytics: "Analytics",
  invoices: "Invoices",
  orders: "Orders",
  requests: "Requests",
  registrations: "Sign-up requests",
  suppliers: "Suppliers",
  knowledge: "Knowledge",
  messages: "Messages",
  audit: "Audit history",
  settings: "Master settings",
};

type Row = {
  id: string;
  title: string;
  subtitle: string;
  status: string | null;
  cols: string[];
  archived?: boolean;
};

/* ------------------------------------------------------------------ data adapters */

async function loadRows(section: GenericSection): Promise<Row[]> {
  if (section === "invoices") {
    const data = await listIntoolsInvoices(null);
    return data.map((invoice: IntoolsInvoice) => ({
      id: invoice.id,
      title: invoice.invoice_no,
      subtitle: invoice.buyer_name || invoice.buyer_email || "Buyer not named",
      status: invoice.effective_status || invoice.status,
      cols: [
        invoice.rfq_case_no || invoice.order_no || "No linked case",
        usd(invoice.total_cents),
        shortDate(invoice.due_date),
      ],
    }));
  }
  if (section === "orders") {
    const data = await listIntoolsOrders();
    return data.map((order: IntoolsOrder) => ({
      id: order.order_no,
      title: order.order_no,
      subtitle: order.buyer_name || order.buyer_email || "Buyer not named",
      status: order.status,
      cols: [
        `${order.item_count} item${order.item_count === 1 ? "" : "s"}`,
        usdFromNumber(order.total),
        shortDate(order.placed_at),
      ],
    }));
  }
  if (section === "requests") {
    const data = await listIntoolsRfqCases(null);
    return data.map((rfq: IntoolsRfqCase) => ({
      id: rfq.id,
      title: rfq.case_no,
      subtitle: rfq.title || "Untitled request",
      status: rfq.status,
      cols: [rfq.buyer_name || rfq.buyer_email || "—"],
      archived: rfq.status === "archived",
    }));
  }
  if (section === "registrations") {
    const data = await listIntoolsRegistrationRequests(null);
    return data.map((request: IntoolsRegistrationRequest) => ({
      id: request.id,
      title: request.name,
      subtitle: request.email,
      status: request.status,
      cols: [request.company_name, (request.sourcing || "—").slice(0, 48), shortDate(request.created_at)],
    }));
  }
  if (section === "suppliers") {
    const data = await listIntoolsSuppliers();
    return data.map((supplier: IntoolsSupplier) => {
      const brokerStatus =
        supplier.archived_at != null
          ? "archived"
          : supplier.broker_status ||
            (supplier.verify_state === "verified"
              ? "approved"
              : supplier.verify_state === "pending"
                ? "review"
                : "rejected");
      return {
        id: supplier.id,
        title: supplier.name,
        subtitle: `${supplier.slug} · ${supplier.region || supplier.loc || "Region not recorded"}`,
        status: brokerStatus,
        cols: [
          supplier.region || supplier.loc || "—",
          label(supplier.type || "—"),
        ],
        archived: supplier.archived_at != null,
      };
    });
  }
  if (section === "knowledge") {
    const data = await listIntoolsAgentKnowledge(null, null);
    return data.map((doc: IntoolsAgentKnowledgeDocument) => ({
      id: doc.id,
      title: doc.title,
      subtitle: doc.original_name || "Knowledge document",
      status: doc.status,
      cols: [label(doc.domain || "—"), label(doc.visibility || "—"), formatBytes(doc.byte_size)],
      archived: doc.status === "archived",
    }));
  }
  const data = await listIntoolsAudit(null, null, 200);
  return data.map((entry) => ({
    id: entry.id,
    title: label(entry.action),
    subtitle: entry.admin_name || "Admin",
    status: null,
    cols: [entry.summary || "—", shortDate(entry.created_at)],
  }));
}

async function applyRowAction(
  section: GenericSection,
  id: string,
  action: BulkAction,
): Promise<unknown> {
  if (section === "invoices") {
    if (action.key === "send") return sendIntoolsInvoice(id);
    if (action.key === "markPaid") {
      const detail = await getIntoolsInvoiceDetail(id);
      if (detail.balance_cents <= 0) return detail;
      return recordIntoolsManualPayment(id, { amountCents: detail.balance_cents, reference: "Bulk mark paid" });
    }
    if (action.key === "cancel") return cancelIntoolsInvoice(id, "Bulk cancellation");
  }
  if (section === "orders") return updateIntoolsOrderStatus(id, action.status, "Bulk status change");
  if (section === "requests") return updateIntoolsRfqStatus(id, action.status, `Bulk ${action.key}`);
  if (section === "registrations")
    return action.key === "approve" ? approveRegistrationRequest(id) : declineRegistrationRequest(id);
  if (section === "suppliers") {
    if (action.key === "archive") {
      const detail = await getIntoolsSupplierDetail(id);
      return archiveIntoolsSupplier(id, detail.updated_at, false);
    }
    return setIntoolsSupplierBrokerStatusBulk([id], action.key === "approve" ? "approved" : "rejected");
  }
  if (section === "knowledge") {
    if (action.key === "archive") return archiveIntoolsAgentKnowledge(id);
    const doc = (await listIntoolsAgentKnowledge(null, null)).find((entry) => entry.id === id);
    if (!doc?.current_version_id) throw new Error("This document has no ready version to publish.");
    return publishIntoolsAgentKnowledge(doc.current_version_id);
  }
  throw new Error("Unsupported action");
}

/* ------------------------------------------------------------------ generic UI atoms */

function SurfacePanel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, background: C.surface, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div role="status" aria-label="Loading" style={{ display: "grid", gap: 10 }}>
      {[0, 1, 2, 3, 4].map((key) => (
        <div
          key={key}
          style={{
            height: 62,
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            background: "linear-gradient(90deg,#f4f6f9,#eef1f5,#f4f6f9)",
          }}
        />
      ))}
    </div>
  );
}

function Notice({ tone, children }: { tone: "danger" | "success" | "info"; children: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      style={{
        marginTop: 12,
        padding: "9px 12px",
        borderRadius: 8,
        fontSize: 12.5,
        background: TONES[tone].bg,
        color: TONES[tone].color,
      }}
    >
      {children}
    </div>
  );
}

function templatePreview(value: string) {
  const sample: Record<string, string> = {
    "[.case_no]": "ATL-RFQ-SAMPLE",
    "[.product]": "Non-production sample product",
    "[.quantity]": "Not provided by buyer",
    "[.material]": "Not provided by buyer",
    "[.certifications]": "Not provided by buyer",
    "[.colors]": "Not provided by buyer",
    "[.sizes]": "Not provided by buyer",
    "[.budget]": "Non-production sample budget",
    "[.timeline]": "Not provided by buyer",
    "[.supplier_name]": "Non-production sample supplier",
  };
  return Object.entries(sample).reduce((next, [token, replacement]) => next.split(token).join(replacement), value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function templatePreviewDocument(value: string) {
  const rendered = templatePreview(value);
  if (/<(?:!doctype\s+html|html|body|table|div|p|style)\b/i.test(rendered)) return rendered;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="margin:0;padding:32px;background:#ffffff;color:#202936;font-family:Arial,sans-serif;"><pre style="margin:0;white-space:pre-wrap;font:16px/1.6 Arial,sans-serif;">${escapeHtml(rendered)}</pre></body></html>`;
}

function TemplateSourceEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const lineCount = Math.max(1, value.split("\n").length);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "48px minmax(0, 1fr)", minHeight: 420, marginTop: 14, overflow: "hidden", border: `1px solid ${C.border}`, borderRadius: 10, background: "#fbfcfd" }}>
      <div aria-hidden="true" style={{ padding: "16px 10px 16px 0", borderRight: `1px solid ${C.line}`, background: "#f5f7f9", color: C.faint, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12.5, lineHeight: 1.65, textAlign: "right", userSelect: "none" }}>
        {Array.from({ length: lineCount }, (_, index) => <div key={index}>{index + 1}</div>)}
      </div>
      <textarea
        value={value}
        maxLength={12000}
        rows={18}
        aria-label="Body template source"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        style={{ width: "100%", minHeight: 420, border: 0, outline: 0, resize: "vertical", padding: "16px 18px", background: "transparent", color: C.text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12.5, lineHeight: 1.65, boxSizing: "border-box" }}
      />
    </div>
  );
}

const HUMAN_LOOP_FLAG_ORDER: HumanLoopFeatureFlag[] = [
  "outreach_templates_enabled",
  "atomic_quote_publication_enabled",
  "production_updates_enabled",
  "qc_evidence_upload_enabled",
  "qc_ai_shadow_enabled",
  "qc_buyer_visibility_enabled",
  "rfq_activity_realtime_enabled",
];

const HUMAN_LOOP_FLAG_META: Record<HumanLoopFeatureFlag, { title: string; description: string }> = {
  outreach_templates_enabled: {
    title: "Supplier outreach templates",
    description: "Editable supplier drafts are available in Requests.",
  },
  atomic_quote_publication_enabled: {
    title: "Reviewed quote publication",
    description: "Ops can publish a quote after supplier evidence is recorded.",
  },
  production_updates_enabled: {
    title: "Verified production updates",
    description: "Ops can publish attributed production updates to the RFQ timeline.",
  },
  qc_evidence_upload_enabled: {
    title: "QC evidence upload",
    description: "Ops can upload private inspection evidence for human review.",
  },
  qc_ai_shadow_enabled: {
    title: "AI QC shadow mode",
    description: "AI can suggest findings while human review remains authoritative.",
  },
  qc_buyer_visibility_enabled: {
    title: "Buyer QC visibility",
    description: "Reviewed QC evidence can be selected for buyer visibility.",
  },
  rfq_activity_realtime_enabled: {
    title: "RFQ activity realtime",
    description: "Open operator drawers can refresh when RFQ activity changes.",
  },
};

function MasterSettingsView({ onToast }: { onToast: (message: string) => void }) {
  const [settings, setSettings] = useState<IntoolsOutreachSettings | null>(null);
  const [featureFlags, setFeatureFlags] = useState<HumanLoopFeatureFlags | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editorMode, setEditorMode] = useState<"source" | "preview">("source");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (preferredId?: string) => {
    setError("");
    try {
      const [next, flags] = await Promise.all([getIntoolsRfqOutreachSettings(), getIntoolsHumanLoopFeatureFlags()]);
      setSettings(next);
      setFeatureFlags(flags);
      const selected = next.versions.find((item) => item.id === preferredId)
        || next.active_template
        || next.versions[0];
      if (selected) {
        setSelectedId(selected.id);
        setSubject(selected.subject_template);
        setBody(selected.body_template);
      }
    } catch (cause) {
      setError(errorMessage(cause, "Could not load Master settings."));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveVersion() {
    if (!settings) return;
    setBusy(true);
    setError("");
    try {
      const version = await saveIntoolsRfqOutreachTemplate(subject, body, Math.max(0, ...settings.versions.map((item) => item.version)));
      await load(version.id);
      onToast(`Supplier outreach template version ${version.version} saved as draft.`);
    } catch (cause) {
      setError(errorMessage(cause, "Could not save this template version."));
    } finally { setBusy(false); }
  }

  async function activate(templateId: string) {
    setBusy(true);
    setError("");
    try {
      const version = await activateIntoolsRfqOutreachTemplate(templateId);
      await load(version.id);
      onToast(`Supplier outreach template version ${version.version} activated.`);
    } catch (cause) {
      setError(errorMessage(cause, "Could not activate this template version."));
    } finally { setBusy(false); }
  }

  async function toggleFeature(key: HumanLoopFeatureFlag) {
    if (!featureFlags) return;
    setBusy(true); setError("");
    try {
      const next = await setIntoolsHumanLoopFeatureFlag(key, !featureFlags[key]);
      setFeatureFlags(next);
      await load(selectedId);
      onToast(`${label(key)} ${next[key] ? "enabled" : "disabled"}.`);
    } catch (cause) { setError(errorMessage(cause, "Could not update this rollout flag.")); }
    finally { setBusy(false); }
  }

  const selected = settings?.versions.find((item) => item.id === selectedId) || null;
  const restorable = settings?.versions.find((item) => item.status === "retired") || null;
  return (
    <section aria-labelledby="master-settings-title">
      <div style={{ marginBottom: 26 }}>
        <h1 id="master-settings-title" style={{ margin: 0, fontSize: 30, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-0.025em" }}>Master settings</h1>
        <p style={{ margin: "9px 0 0", color: C.dim, fontSize: 14, lineHeight: 1.55, maxWidth: 680 }}>Versioned operational defaults. Activated templates are immutable and every change remains attributable.</p>
      </div>
      {!settings && !error && <SkeletonRows />}
      {settings && (
        <SurfacePanel>
          {featureFlags && <div style={{ padding: "28px 24px 26px", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ color: C.faint, fontSize: 12, fontWeight: 700 }}>Master settings / Operations</div>
                <h2 style={{ margin: "7px 0 0", fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em" }}>Controlled rollout</h2>
                <p style={{ margin: "7px 0 0", color: C.dim, fontSize: 13, lineHeight: 1.55, maxWidth: 680 }}>Manage the capabilities available to the sourcing team. Authority remains in guarded Supabase operations.</p>
              </div>
              <span style={{ ...statusPill("active"), whiteSpace: "nowrap", marginTop: 2 }}>{Object.values(featureFlags).filter(Boolean).length} of {HUMAN_LOOP_FLAG_ORDER.length} enabled</span>
            </div>
            <div style={{ marginTop: 24, overflow: "hidden", border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface }}>
              {HUMAN_LOOP_FLAG_ORDER.map((key) => {
                const enabled = featureFlags[key];
                const meta = HUMAN_LOOP_FLAG_META[key];
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, minHeight: 82, padding: "17px 18px", background: C.surface, borderTop: key === HUMAN_LOOP_FLAG_ORDER[0] ? 0 : `1px solid ${C.line}` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{meta.title}</div>
                      <div style={{ marginTop: 5, color: C.dim, fontSize: 12.5, lineHeight: 1.45 }}>{meta.description}</div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={enabled}
                      aria-label={`${meta.title}: ${enabled ? "On" : "Off"}. Toggle`}
                      onClick={() => void toggleFeature(key)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0, border: 0, borderRadius: 6, padding: 0, background: "transparent", color: enabled ? TONES.success.color : C.dim, fontFamily: "inherit", fontSize: 12, fontWeight: 800, cursor: busy ? "wait" : "pointer" }}
                    >
                      <span aria-hidden="true" style={{ position: "relative", display: "inline-flex", alignItems: "center", width: 28, height: 16, borderRadius: 999, background: enabled ? "#c9dacf" : "#dfe3e7", transition: "background 140ms ease" }}>
                        <span style={{ position: "absolute", left: 3, width: 12, height: 12, borderRadius: "50%", background: enabled ? C.moss : "#89929b", transform: `translateX(${enabled ? 10 : 0}px)`, transition: "transform 140ms ease, background 140ms ease" }} />
                      </span>
                      {enabled ? "On" : "Off"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>}
          <div style={{ padding: "30px 24px 26px", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ color: C.faint, fontSize: 12, fontWeight: 700 }}>Master settings / Outreach</div>
                <h2 style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 800, letterSpacing: "-0.025em" }}>Supplier outreach email</h2>
                <p style={{ margin: "8px 0 0", color: C.dim, fontSize: 13, lineHeight: 1.55 }}>Create an editable English draft for supplier review. Activated versions remain immutable.</p>
              </div>
              <span style={{ ...statusPill(settings.active_template ? "active" : "draft"), marginTop: 2 }}>{settings.active_template ? `Active v${settings.active_template.version}` : "No active version"}</span>
            </div>
          </div>
          <div style={{ padding: "26px 24px 28px" }} aria-busy={busy}>
            <div style={{ maxWidth: 980, display: "grid", gap: 24 }}>
              <Field label="Subject">
                <input value={subject} maxLength={240} aria-label="Subject template" onChange={(event) => setSubject(event.target.value)} style={{ ...inputStyle, height: 44, borderRadius: 9, fontSize: 14 }} />
              </Field>
              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Body</div>
                  <div role="group" aria-label="Template body view" style={{ display: "inline-flex", padding: 3, border: `1px solid ${C.border}`, borderRadius: 9, background: "#f6f8fa" }}>
                    {(["source", "preview"] as const).map((mode) => {
                      const active = editorMode === mode;
                      return <button key={mode} type="button" aria-pressed={active} onClick={() => setEditorMode(mode)} style={{ border: `1px solid ${active ? C.border : "transparent"}`, borderRadius: 6, padding: "7px 12px", background: active ? C.surface : "transparent", color: active ? C.text : C.dim, fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{mode === "source" ? "Source" : "Preview"}</button>;
                    })}
                  </div>
                </div>
                {editorMode === "source" ? (
                  <TemplateSourceEditor value={body} onChange={setBody} />
                ) : (
                  <div aria-label="Non-production template preview" style={{ marginTop: 14, overflow: "hidden", border: `1px solid ${C.border}`, borderRadius: 10, background: "#f5f7f9" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 42, padding: "0 14px", borderBottom: `1px solid ${C.line}`, color: C.dim, fontSize: 12.5 }}>
                      <span style={{ fontWeight: 800, color: C.head }}>Preview</span>
                      <span aria-hidden="true">·</span>
                      <span>Illustrative values only</span>
                    </div>
                    <iframe title="Non-production email preview" sandbox="" srcDoc={templatePreviewDocument(body)} style={{ display: "block", width: "100%", minHeight: 420, border: 0, background: "#fff" }} />
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Template variables</div>
                <p style={{ margin: "6px 0 12px", color: C.dim, fontSize: 12.5, lineHeight: 1.55 }}>{settings.instruction}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {settings.placeholders.map((placeholder) => <code key={placeholder} style={{ display: "inline-flex", alignItems: "center", padding: "6px 9px", border: `1px solid ${C.border}`, borderRadius: 999, background: C.surface, color: C.head, fontSize: 11.5, lineHeight: 1.2 }}>{placeholder}</code>)}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", paddingTop: 20, borderTop: `1px solid ${C.line}` }}>
                <button disabled={busy || !restorable} onClick={() => restorable && void activate(restorable.id)} style={btnStyle("neutral")}>Restore last active version</button>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button disabled={busy || !selected || selected.status === "active"} onClick={() => selected && void activate(selected.id)} style={btnStyle("success")}>Activate selected version</button>
                  <button disabled={busy} onClick={() => void saveVersion()} style={btnStyle("primary")}>Save as new version</button>
                </div>
              </div>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", padding: "14px 20px 10px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.head }}>Template audit history</div>
              <div style={{ color: C.faint, fontSize: 11.5 }}>Immutable versions</div>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {settings.versions.map((version) => (
                <li key={version.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 20px", borderTop: `1px solid ${C.line}` }}>
                  <input type="radio" name="template-version" checked={selectedId === version.id} onChange={() => { setSelectedId(version.id); setSubject(version.subject_template); setBody(version.body_template); }} aria-label={`Select template version ${version.version}`} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>Version {version.version} · {shortDate(version.created_at)}</span>
                  <span style={statusPill(version.status)}>{label(version.status)}</span>
                </li>
              ))}
            </ul>
          </div>
        </SurfacePanel>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  );
}

const inputStyle: CSSProperties = {
  height: 36,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  fontSize: 13,
  color: C.text,
  fontWeight: 400,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

function Field({ label: fieldLabel, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: C.head }}>
      {fieldLabel}
      {children}
    </label>
  );
}

function ReadOnlyQuoteValue({ label: fieldLabel, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.dim }}>{fieldLabel}</div>
      <div style={{ marginTop: 3, fontSize: 13.5, color: C.text, overflowWrap: "anywhere" }}>{value || "—"}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ Sidebar */

function NavGlyph({ section }: { section: Section }) {
  const paths: Record<string, ReactNode> = {
    analytics: (
      <>
        <path d="M4 20V10" />
        <path d="M12 20V4" />
        <path d="M20 20v-7" />
      </>
    ),
    invoices: (
      <>
        <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M9 12h6" />
        <path d="M9 16h6" />
      </>
    ),
    orders: (
      <>
        <path d="M3.5 8 12 4l8.5 4-8.5 4-8.5-4Z" />
        <path d="M3.5 8v8l8.5 4 8.5-4V8" />
        <path d="M12 12v8" />
      </>
    ),
    requests: <path d="M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3H5a1 1 0 0 1-1-1Z" />,
    registrations: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
        <path d="M18 8v4" />
        <path d="M16 10h4" />
      </>
    ),
    suppliers: (
      <>
        <path d="M4 21V7l8-4 8 4v14" />
        <path d="M10 21v-5h4v5" />
      </>
    ),
    knowledge: (
      <>
        <path d="M4 5c2-1 5-1 7 0v14c-2-1-5-1-7 0Z" />
        <path d="M20 5c-2-1-5-1-7 0v14c2-1 5-1 7 0Z" />
      </>
    ),
    messages: <path d="M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 3v-3H5a1 1 0 0 1-1-1Z" />,
    audit: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.09A1.7 1.7 0 0 0 8.55 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1A1.7 1.7 0 0 0 2.5 13.6H2V9.6h.5A1.7 1.7 0 0 0 4.2 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.55 4.6a1.7 1.7 0 0 0 1-.6A1.7 1.7 0 0 0 9.95 3H14v.09A1.7 1.7 0 0 0 15.05 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.13.37.35.7.64.95.3.25.67.39 1.06.4H21v4h-.09a1.7 1.7 0 0 0-1.51.65Z" />
      </>
    ),
  };
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[section]}
    </svg>
  );
}

function Sidebar({
  active,
  collapsed,
  onToggle,
  onSelect,
  operatorName,
  badges,
}: {
  active: Section;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (section: Section) => void;
  operatorName: string;
  badges: Partial<Record<Section, number>>;
}) {
  return (
    <aside
      style={{
        width: collapsed ? 72 : 248,
        flexShrink: 0,
        background: C.sidebar,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        transition: "width 160ms ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "20px 14px 16px",
          borderBottom: "1px solid rgba(255,255,255,.08)",
        }}
      >
        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: "-0.02em" }}>
              atelix<span style={{ color: C.mossSoft }}>.</span>
            </div>
            <div style={{ fontSize: 11, color: "#8b96a8", marginTop: 1 }}>Intools</div>
          </div>
        )}
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggle}
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            border: "1px solid rgba(255,255,255,.14)",
            background: "transparent",
            color: "#8b96a8",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
          >
            <polyline points="15 6 9 12 15 18" />
          </svg>
        </button>
      </div>
      <nav aria-label="Intools sections" style={{ flex: 1, overflowY: "auto", padding: "14px 10px" }}>
        {NAV_ORDER.map((section) => {
          const isActive = section === active;
          const badge = badges[section] || 0;
          return (
            <button
              key={section}
              type="button"
              onClick={() => onSelect(section)}
              aria-current={isActive ? "page" : undefined}
              title={SECTION_LABEL[section]}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                height: collapsed ? 46 : 38,
                padding: collapsed ? 0 : "0 10px 0 8px",
                marginBottom: 2,
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13.5,
                fontWeight: isActive ? 700 : 500,
                background: collapsed
                  ? "transparent"
                  : isActive
                    ? "rgba(111,174,134,.16)"
                    : "transparent",
                color: isActive ? "#fff" : "#aab4c2",
                justifyContent: collapsed ? "center" : "flex-start",
              }}
            >
              {!collapsed && (
                <span
                  style={{
                    width: 3,
                    height: 16,
                    borderRadius: 2,
                    background: isActive ? C.mossSoft : "transparent",
                    flexShrink: 0,
                  }}
                />
              )}
              {collapsed ? (
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    background: isActive ? C.mossSoft : "rgba(255,255,255,.08)",
                    color: isActive ? "#13291d" : "#c7cedb",
                  }}
                >
                  <NavGlyph section={section} />
                </span>
              ) : (
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {SECTION_LABEL[section]}
                </span>
              )}
              {!collapsed && badge > 0 && (
                <span
                  style={{
                    background: "#c94f39",
                    color: "#fff",
                    fontSize: 10.5,
                    fontWeight: 800,
                    borderRadius: 999,
                    padding: "1px 7px",
                    flexShrink: 0,
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div
        style={{
          padding: collapsed ? "14px 0 18px" : "14px 16px 18px",
          borderTop: "1px solid rgba(255,255,255,.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 10,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "#3a4655",
            color: "#e7ebf0",
            fontSize: 12,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {initialsOf(operatorName || "Administrator")}
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: "#eef1f5",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {operatorName || "Administrator"}
            </div>
            <div style={{ fontSize: 11, color: "#8b96a8" }}>Administrator</div>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ SectionList */

function SectionListView({
  section,
  refreshKey,
  onOpenRow,
  onToast,
  onCreateInvoice,
  onPrimaryModal,
  registerReload,
}: {
  section: GenericSection;
  refreshKey: number;
  onOpenRow: (row: Row) => void;
  onToast: (message: string) => void;
  onCreateInvoice: () => void;
  onPrimaryModal: (key: string) => void;
  registerReload: (reload: () => void) => void;
}) {
  const meta = SECTIONS[section];
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [busyBulk, setBusyBulk] = useState(false);
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await loadRows(section));
    } catch (cause) {
      setError(errorMessage(cause, `Could not load ${meta.label.toLowerCase()}.`));
    } finally {
      setLoading(false);
    }
  }, [section, meta.label]);

  useEffect(() => {
    setQuery("");
    setFilter("all");
    setSelected([]);
  }, [section]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  useEffect(() => {
    registerReload(() => void reload());
  }, [registerReload, reload]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesFilter = filter === "all" ? true : row.status === filter;
      const text = `${row.title} ${row.subtitle} ${row.cols.join(" ")}`.toLowerCase();
      return matchesFilter && (!q || text.includes(q));
    }).sort((left, right) => Number(Boolean(left.archived)) - Number(Boolean(right.archived)));
  }, [rows, query, filter]);

  const selectableVisible = visible.filter((row) => !row.archived);
  const allSelected =
    meta.selectable && selectableVisible.length > 0 && selectableVisible.every((row) => selected.includes(row.id));

  async function runBulk(action: BulkAction) {
    const ids = selected.filter((id) => rows.some((row) => row.id === id));
    if (!ids.length) return;
    setBusyBulk(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => applyRowAction(section, id, action)));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - ok;
      onToast(
        `${ok} record${ok === 1 ? "" : "s"} ${action.label.replace(" selected", "").toLowerCase()}${
          failed ? ` · ${failed} failed` : ""
        }.`,
      );
      setSelected([]);
      await reload();
    } finally {
      setBusyBulk(false);
      setConfirmAction(null);
    }
  }

  function onPrimary(key: string) {
    if (key === "new" && section === "invoices") return onCreateInvoice();
    if (key === "export") {
      const header = ["Title", "Subtitle", "Status", ...meta.columnLabels];
      downloadCsv(`${section}-${new Date().toISOString().slice(0, 10)}.csv`, [
        header,
        ...visible.map((row) => [row.title, row.subtitle, row.status || "", ...row.cols]),
      ]);
      onToast(`${visible.length} row${visible.length === 1 ? "" : "s"} exported.`);
      return;
    }
    onPrimaryModal(key);
  }

  return (
    <>
      <PrimaryActionBridge section={section} onPrimary={onPrimary} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={meta.searchPlaceholder}
          aria-label={meta.searchPlaceholder}
          style={{
            flex: 1,
            minWidth: 200,
            height: 38,
            padding: "0 14px",
            borderRadius: 9,
            border: `1px solid ${C.border}`,
            background: "#fff",
            fontSize: 13.5,
            color: C.text,
          }}
        />
        {meta.filters.length > 1 && (
          <div role="tablist" aria-label="Filter" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {meta.filters.map((value) => {
              const isActive = value === filter;
              return (
                <button
                  key={value}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setFilter(value);
                    setSelected([]);
                  }}
                  style={{
                    height: 32,
                    padding: "0 13px",
                    borderRadius: 999,
                    border: `1px solid ${isActive ? C.moss : C.border}`,
                    background: isActive ? C.moss : "#fff",
                    color: isActive ? "#fff" : C.head,
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {value === "all" ? "All" : label(value)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected.length > 0 && meta.selectable && (
        <div
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
            background: "#eef4f0",
            border: "1px solid #cfe3d5",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 10,
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1c4a30" }}>
            {selected.length} selected
            <button
              onClick={() => setSelected([])}
              style={{
                marginLeft: 10,
                fontSize: 12.5,
                color: C.moss,
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Clear
            </button>
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {meta.bulkActions.map((action) => (
              <button
                key={action.key}
                disabled={busyBulk}
                onClick={() => (action.confirm ? setConfirmAction(action) : void runBulk(action))}
                style={btnStyle(action.tone, "sm")}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            borderRadius: 10,
            background: TONES.danger.bg,
            color: TONES.danger.color,
            fontSize: 13,
          }}
        >
          {error}{" "}
          <button
            onClick={() => void reload()}
            style={{ marginLeft: 8, background: "none", border: "none", color: "inherit", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonRows />
      ) : (
        <SurfacePanel>
          {meta.selectable && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                background: "#f6f8fa",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? [] : selectableVisible.map((row) => row.id))}
                aria-label="Select all visible rows"
                style={{ width: 16, height: 16, accentColor: C.moss, cursor: "pointer", flexShrink: 0 }}
              />
              <span aria-hidden="true" style={{ width: 30, flexShrink: 0 }} />
              <span style={{ flex: "1.4 1 110px", minWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: C.head }}>Applicant</span>
              {meta.columnLabels.map((columnLabel) => (
                <span
                  key={columnLabel}
                  className="intools-list-col"
                  style={{
                    flex: "1 1 84px",
                    minWidth: 56,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    color: C.head,
                  }}
                >
                  {columnLabel}
                </span>
              ))}
              <span style={{ flex: "0 0 auto", minWidth: 104, textAlign: "right", fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: C.head }}>Status</span>
            </div>
          )}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label={meta.label}>
            {visible.map((row) => {
              const isSelected = selected.includes(row.id);
              return (
                <li key={row.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      background: isSelected ? "#f4f9f5" : "#fff",
                    }}
                  >
                    {meta.selectable && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={row.archived}
                        onChange={() =>
                          setSelected(
                            isSelected ? selected.filter((id) => id !== row.id) : [...selected, row.id],
                          )
                        }
                        aria-label={`Select ${row.title}`}
                        style={{ width: 16, height: 16, accentColor: C.moss, cursor: "pointer", flexShrink: 0 }}
                      />
                    )}
                    <div
                      aria-hidden="true"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: SECTION_ACCENT[section] || C.head,
                        color: "#fff",
                        fontSize: 11.5,
                        fontWeight: 800,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {initialsOf(row.title)}
                    </div>
                    <button
                      onClick={() => onOpenRow(row)}
                      style={{
                        flex: "1.4 1 110px",
                        minWidth: 64,
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "2px 0",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: C.text,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: C.dim,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginTop: 1,
                        }}
                      >
                        {row.subtitle}
                      </div>
                    </button>
                    {row.cols.map((value, index) => (
                      <span
                        key={index}
                        className="intools-list-col"
                        style={{
                          flex: "1 1 84px",
                          minWidth: 56,
                          fontSize: 12.5,
                          color: "#5a6472",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {value}
                      </span>
                    ))}
                    <span style={{ flex: "0 0 auto", minWidth: 104, display: "flex", justifyContent: "flex-end" }}>
                      {row.status && <span style={statusPill(row.status)}>{label(row.status)}</span>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {visible.length === 0 && (
            <div style={{ padding: "56px 24px", textAlign: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: C.text }}>No matching records</div>
              <div style={{ marginTop: 6, color: C.dim, fontSize: 13 }}>{meta.emptyText}</div>
            </div>
          )}
        </SurfacePanel>
      )}

      {confirmAction && (
        <ModalShell
          title={label(confirmAction.key)}
          hint="Bulk action"
          onClose={() => setConfirmAction(null)}
          footer={
            <>
              <button onClick={() => setConfirmAction(null)} style={btnStyle("neutral")}>
                Cancel
              </button>
              <button
                disabled={busyBulk}
                onClick={() => void runBulk(confirmAction)}
                style={btnStyle(confirmAction.tone === "danger" ? "danger" : "success")}
              >
                {confirmAction.label.replace(" selected", "")}
              </button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 13.5, color: "#3b4453", lineHeight: 1.55 }}>
            {confirmAction.label.replace(" selected", "")} {selected.length} record
            {selected.length === 1 ? "" : "s"}? This is recorded server-side.
          </p>
        </ModalShell>
      )}
    </>
  );
}

function PrimaryActionBridge({
  section,
  onPrimary,
}: {
  section: Section;
  onPrimary: (key: string) => void;
}) {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ section: Section; key: string }>).detail;
      if (detail.section === section) onPrimary(detail.key);
    };
    addEventListener("intools:primary", handler as EventListener);
    return () => removeEventListener("intools:primary", handler as EventListener);
  }, [section, onPrimary]);
  return null;
}

/* ------------------------------------------------------------------ Modal shell */

// Shared Escape-to-close, Tab focus trap, and focus-return for ModalShell and
// DrawerShell, matching the pattern already used in supplier-intake.tsx.
function useDialogAccessibility(onClose: () => void) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => containerRef.current?.focus(), 40);
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", closeOnEscape);
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(containerRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])") || []);
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return { containerRef, onKeyDown };
}

function ModalShell({
  title,
  hint,
  onClose,
  children,
  footer,
  width = 480,
}: {
  title: string;
  hint?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const { containerRef, onKeyDown } = useDialogAccessibility(onClose);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,26,34,.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 20,
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: `min(${width}px, 100%)`,
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(20,26,34,.22)",
          overflow: "hidden",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "20px 22px 4px", flexShrink: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
          {hint && <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>{hint}</div>}
        </div>
        <div style={{ padding: "16px 22px 20px", overflowY: "auto", flex: 1, minHeight: 0 }}>{children}</div>
        {footer && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              padding: "14px 22px",
              background: "#f9fafb",
              borderTop: "1px solid #eef0f3",
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Detail drawer */

function DrawerShell({
  title,
  subtitle,
  status,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  status?: string | null;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { containerRef, onKeyDown } = useDialogAccessibility(onClose);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,26,34,.36)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 40,
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: "min(440px, 94vw)",
          height: "100%",
          background: "#fff",
          boxShadow: "-8px 0 32px rgba(20,26,34,.14)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            padding: "20px 22px",
            borderBottom: "1px solid #e6e9ee",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, overflowWrap: "anywhere" }}>{title}</div>
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3, overflowWrap: "anywhere" }}>{subtitle}</div>
          </div>
          <button
            aria-label="Close detail"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: 8,
              border: "none",
              background: "#fff",
              cursor: "pointer",
              color: "#526176",
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
          {status && <span style={{ ...statusPill(status), marginBottom: 16 }}>{label(status)}</span>}
          {children}
        </div>
        {footer && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "16px 22px", borderTop: "1px solid #e6e9ee" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <>
      {rows.map(([fieldLabel, value]) => (
        <div key={fieldLabel} style={{ padding: "10px 0", borderBottom: "1px solid #f0f2f5" }}>
          <div
            style={{
              fontSize: 11,
              color: C.faint,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".03em",
            }}
          >
            {fieldLabel}
          </div>
          <div style={{ fontSize: 13.5, color: C.text, marginTop: 3, overflowWrap: "anywhere" }}>{value}</div>
        </div>
      ))}
    </>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 14,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".03em",
        color: C.faint,
      }}
    >
      {children}
    </div>
  );
}

/* -- Invoice drawer -- */
function InvoiceDrawerBody({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<IntoolsInvoiceDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payRef, setPayRef] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await getIntoolsInvoiceDetail(id);
      setDetail(next);
      setNotes(next.notes || "");
      setPayAmount(String(next.balance_cents));
    } catch (cause) {
      setError(errorMessage(cause, "Could not load this invoice."));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
      await load();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause, "The action could not be completed."));
    } finally {
      setBusy(false);
      setPayOpen(false);
      setCancelOpen(false);
    }
  }

  if (error && !detail)
    return (
      <DrawerShell title="Invoice" subtitle={id} onClose={onClose}>
        <Notice tone="danger">{error}</Notice>
      </DrawerShell>
    );
  if (!detail)
    return (
      <DrawerShell title="Invoice" subtitle={id} onClose={onClose}>
        <SkeletonRows />
      </DrawerShell>
    );

  const canSend = detail.status === "draft";
  const canCancel = detail.status === "draft" || detail.status === "sent";
  const canPay = detail.status === "sent" && detail.balance_cents > 0;

  return (
    <DrawerShell
      title={detail.invoice_no}
      subtitle={`${detail.buyer_name || detail.buyer_email || "Buyer not named"} · ${shortDate(detail.created_at)}`}
      status={detail.effective_status || detail.status}
      onClose={onClose}
      footer={
        <>
          <button disabled={!canSend || busy} onClick={() => void run(() => sendIntoolsInvoice(detail.id), "Invoice sent.")} style={btnStyle("primary")}>
            Send invoice
          </button>
          <button disabled={!canPay || busy} onClick={() => setPayOpen(true)} style={btnStyle("neutral")}>
            Record payment
          </button>
          <button disabled={!canCancel || busy} onClick={() => setCancelOpen(true)} style={btnStyle("danger")}>
            Cancel invoice
          </button>
        </>
      }
    >
      <FieldRows
        rows={[
          ["Buyer", detail.buyer_email || detail.buyer_name || "—"],
          ["Due date", shortDate(detail.due_date)],
          ["RFQ", detail.rfq_case_no || "—"],
          ["Order", detail.order_no || "—"],
          ["Subtotal", usd(detail.subtotal_cents)],
          ["Tax", usd(detail.tax_cents)],
          ["Total", usd(detail.total_cents)],
          ["Balance", usd(detail.balance_cents)],
        ]}
      />
      <div style={{ marginTop: 14 }}>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: ".03em",
            color: C.faint,
          }}
        >
          Notes (visible to buyer)
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add a note the buyer will see on this invoice…"
            style={{ ...inputStyle, height: "auto", padding: "9px 10px", resize: "vertical", textTransform: "none", letterSpacing: "normal" }}
          />
        </label>
        {detail.status === "draft" && (
          <button
            disabled={busy || notes === (detail.notes || "")}
            onClick={() =>
              void run(
                () =>
                  updateIntoolsInvoice(detail.id, {
                    notes,
                    items: detail.items.map((item) => ({
                      description: item.description,
                      quantity: item.quantity,
                      unitAmountCents: item.unit_amount_cents,
                      taxAmountCents: item.tax_amount_cents,
                    })),
                  }),
                "Draft notes saved.",
              )
            }
            style={{ ...btnStyle("neutral", "sm"), marginTop: 8 }}
          >
            Save notes
          </button>
        )}
      </div>

      <GroupLabel>Line items</GroupLabel>
      {detail.items.map((item) => (
        <div key={item.id} style={{ padding: "9px 0", borderBottom: "1px solid #f0f2f5" }}>
          <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>{item.description}</div>
          <div style={{ fontSize: 12, color: C.dim }}>
            {item.quantity} × {usd(item.unit_amount_cents)} · tax {usd(item.tax_amount_cents)} ·{" "}
            <strong>{usd(item.line_total_cents)}</strong>
          </div>
        </div>
      ))}

      <GroupLabel>Payments</GroupLabel>
      {detail.payments.length ? (
        detail.payments.map((payment) => (
          <div key={payment.id} style={{ padding: "8px 0", borderBottom: "1px solid #f0f2f5", fontSize: 12.5 }}>
            {label(payment.provider)}
            {payment.reference ? ` · ${payment.reference}` : ""} — <strong>{usd(payment.amount_cents)}</strong> ·{" "}
            {shortDate(payment.recorded_at)}
          </div>
        ))
      ) : (
        <div style={{ fontSize: 12.5, color: C.faint, padding: "8px 0" }}>No payments recorded.</div>
      )}

      <GroupLabel>Audit history</GroupLabel>
      {detail.audit.map((entry) => (
        <div key={entry.id} style={{ padding: "8px 0", borderBottom: "1px solid #f0f2f5" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{label(entry.action)}</div>
          <div style={{ fontSize: 11.5, color: C.dim }}>
            {entry.summary || "No summary"} · {entry.admin_name || "Admin"} · {shortDate(entry.created_at)}
          </div>
        </div>
      ))}

      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      {payOpen && (
        <ModalShell
          title="Record manual payment"
          hint="The server validates the balance and allocation. Enter USD cents."
          onClose={() => setPayOpen(false)}
          footer={
            <>
              <button onClick={() => setPayOpen(false)} style={btnStyle("neutral")}>
                Cancel
              </button>
              <button
                disabled={busy || !Number.isInteger(Number(payAmount)) || Number(payAmount) <= 0}
                onClick={() =>
                  void run(
                    () =>
                      recordIntoolsManualPayment(detail.id, {
                        amountCents: Number(payAmount),
                        reference: payRef.trim() || null,
                      }),
                    "Payment recorded.",
                  )
                }
                style={btnStyle("success")}
              >
                Record payment
              </button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Amount (USD cents)">
              <input value={payAmount} inputMode="numeric" onChange={(event) => setPayAmount(event.target.value)} style={inputStyle} />
            </Field>
            <Field label="Reference">
              <input value={payRef} onChange={(event) => setPayRef(event.target.value)} style={inputStyle} />
            </Field>
          </div>
        </ModalShell>
      )}
      {cancelOpen && (
        <ModalShell
          title={`Cancel ${detail.invoice_no}?`}
          hint="This records a server-side cancellation. Paid invoices cannot be cancelled."
          onClose={() => setCancelOpen(false)}
          footer={
            <>
              <button onClick={() => setCancelOpen(false)} style={btnStyle("neutral")}>
                Keep invoice
              </button>
              <button
                disabled={busy || cancelReason.trim().length < 3}
                onClick={() => void run(() => cancelIntoolsInvoice(detail.id, cancelReason.trim()), "Invoice cancelled.")}
                style={btnStyle("danger")}
              >
                Cancel invoice
              </button>
            </>
          }
        >
          <Field label="Reason">
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              style={{ ...inputStyle, height: "auto", padding: "9px 10px", resize: "vertical" }}
            />
          </Field>
        </ModalShell>
      )}
    </DrawerShell>
  );
}

/* -- Order drawer -- */
const ORDER_STATUSES = [
  "awaiting_payment",
  "payment_declared",
  "payment_verified",
  "fulfilling",
  "completed",
  "cancelled",
  "disputed",
  "refunded",
];

function OrderDrawerBody({
  orderNo,
  onClose,
  onChanged,
  onCreateInvoice,
}: {
  orderNo: string;
  onClose: () => void;
  onChanged: () => void;
  onCreateInvoice: (input: { buyerProfileId: string; orderId: string; rfqCaseId: string | null; amount: string; description: string }) => void;
}) {
  const [detail, setDetail] = useState<IntoolsOrderDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [nextStatus, setNextStatus] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await getIntoolsOrderDetail(orderNo);
      setDetail(next);
      setNextStatus(next.status);
    } catch (cause) {
      setError(errorMessage(cause, "Could not load this order."));
    }
  }, [orderNo]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error && !detail)
    return (
      <DrawerShell title="Order" subtitle={orderNo} onClose={onClose}>
        <Notice tone="danger">{error}</Notice>
      </DrawerShell>
    );
  if (!detail)
    return (
      <DrawerShell title="Order" subtitle={orderNo} onClose={onClose}>
        <SkeletonRows />
      </DrawerShell>
    );

  const buyer = detail.buyer;
  return (
    <DrawerShell
      title={detail.order_no}
      subtitle={`Placed ${shortDate(detail.placed_at)} · ${buyer.company_name || buyer.full_name || "Buyer not named"}`}
      status={detail.status}
      onClose={onClose}
      footer={
        <button
          onClick={() =>
            onCreateInvoice({
              buyerProfileId: detail.buyer_profile_id,
              orderId: detail.id,
              rfqCaseId: detail.rfq_case_id,
              amount: String(detail.total ?? 0),
              description: `Order ${detail.order_no}`,
            })
          }
          style={btnStyle("neutral")}
        >
          Create invoice
        </button>
      }
    >
      <FieldRows
        rows={[
          ["Buyer", buyer.email || buyer.full_name || "—"],
          ["Country", buyer.country || "—"],
          ["Total", usdFromNumber(detail.total)],
          ["Shipping", detail.shipping_service || "—"],
          ["Destination", detail.ship_address || detail.ship_country || "—"],
          ["Incoterms", detail.incoterms || "—"],
        ]}
      />

      <GroupLabel>Order items</GroupLabel>
      {detail.items.map((item, index) => (
        <div key={index} style={{ padding: "9px 0", borderBottom: "1px solid #f0f2f5" }}>
          <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>{item.name || "Unnamed item"}</div>
          <div style={{ fontSize: 12, color: C.dim }}>
            {[item.seller, item.sku && `SKU ${item.sku}`, item.qty && `${item.qty} × ${usdFromNumber(item.unit_price)}`]
              .filter(Boolean)
              .join(" · ") || "No item metadata"}{" "}
            · <strong>{usdFromNumber(item.line_total)}</strong>
          </div>
        </div>
      ))}

      {detail.fulfillments.length > 0 && (
        <>
          <GroupLabel>Fulfillment</GroupLabel>
          {detail.fulfillments.map((fulfillment, index) => (
            <div key={index} style={{ padding: "8px 0", borderBottom: "1px solid #f0f2f5", fontSize: 12.5 }}>
              {fulfillment.factory_name || "Supplier not identified"} · {label(fulfillment.fulfillment_status || "pending")}
              {fulfillment.tracking ? ` · ${fulfillment.tracking}` : ""}
            </div>
          ))}
        </>
      )}

      <GroupLabel>Activity</GroupLabel>
      {detail.events.map((event, index) => (
        <div key={index} style={{ padding: "8px 0", borderBottom: "1px solid #f0f2f5" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{label(event.status)}</div>
          <div style={{ fontSize: 11.5, color: C.dim }}>
            {event.note || "No note"} · {event.created_by_name || "System"} · {shortDate(event.created_at)}
          </div>
        </div>
      ))}

      <div style={{ marginTop: 16 }}>
        <Field label="Update status">
          <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)} style={{ ...inputStyle, background: "#fff" }}>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {label(status)}
              </option>
            ))}
          </select>
        </Field>
        <div style={{ marginTop: 8 }}>
          <Field label="Update note (optional)">
            <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} style={{ ...inputStyle, height: "auto", padding: "8px 10px", resize: "vertical" }} />
          </Field>
        </div>
        <button
          disabled={busy || nextStatus === detail.status}
          onClick={async () => {
            setBusy(true);
            setError("");
            setNotice("");
            try {
              await updateIntoolsOrderStatus(detail.order_no, nextStatus, note.trim() || null);
              setNotice("Order status updated and recorded in the activity history.");
              setNote("");
              await load();
              onChanged();
            } catch (cause) {
              setError(errorMessage(cause, "Could not update the order status."));
            } finally {
              setBusy(false);
            }
          }}
          style={{ ...btnStyle("primary", "sm"), marginTop: 10 }}
        >
          Update order
        </button>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
    </DrawerShell>
  );
}

/* -- Request drawer -- */
type MatchRow = {
  match: IntoolsRfqSupplierMatch;
  supplier: IntoolsSupplier | undefined;
  quote: IntoolsRfqQuote | undefined;
};
type QuoteDraft = { unitPrice: string; moq: string; leadTime: string; total: string; recommended: boolean };

function OutreachDraftModal({ initial, onClose, onChanged }: { initial: IntoolsOutreachDraft; onClose: () => void; onChanged: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [contactNote, setContactNote] = useState("");
  const [responseNote, setResponseNote] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = subject !== draft.subject || body !== draft.body;

  async function persist() {
    if (!dirty) return draft;
    const next = await updateIntoolsRfqOutreachDraft(draft.id, subject, body, draft.revision);
    setDraft(next); setSubject(next.subject); setBody(next.body);
    return next;
  }
  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (cause) { setError(errorMessage(cause, fallback)); } finally { setBusy(false); }
  }
  async function copy(part: "subject" | "body" | "all") {
    await run(async () => {
      const saved = await persist();
      const value = part === "subject" ? saved.subject : part === "body" ? saved.body : `${saved.subject}\n\n${saved.body}`;
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable. The draft remains selectable below.");
      await navigator.clipboard.writeText(value);
      const next = await recordIntoolsRfqOutreachCopy(saved.id, part);
      setDraft(next);
      setNotice(part === "all" ? "Subject and body copied. This does not mark the supplier contacted." : `${label(part)} copied. This does not mark the supplier contacted.`);
    }, "Could not copy this draft. You can still select the text manually.");
  }

  return (
    <ModalShell title="Prepare supplier email" hint={`${draft.supplier_name} · ${draft.case_no}`} onClose={onClose} footer={<>
      <button disabled={busy} onClick={onClose} style={btnStyle("neutral")}>Close</button>
      {draft.status !== "contacted" && <button disabled={busy || !dirty} onClick={() => void run(async () => { const next = await persist(); setNotice(`Draft revision ${next.revision} saved.`); }, "Could not save this draft.")} style={btnStyle("primary")}>Save changes</button>}
      {draft.status !== "contacted" && <button disabled={busy} onClick={() => void run(async () => { const saved = await persist(); const next = await markIntoolsRfqSupplierContacted(saved.id, contactNote); setDraft(next); setNotice("Supplier marked contacted. Clipboard copying alone never performs this action."); onChanged(); }, "Could not mark this supplier contacted.")} style={btnStyle("success")}>Mark supplier as contacted</button>}
    </>}>
      <div style={{ display: "grid", gap: 12 }} aria-busy={busy}>
        <Field label="Email subject"><input disabled={draft.status === "contacted"} value={subject} maxLength={240} onChange={(event) => setSubject(event.target.value)} style={inputStyle} /></Field>
        <Field label="Email body"><textarea disabled={draft.status === "contacted"} value={body} maxLength={12000} rows={12} onChange={(event) => setBody(event.target.value)} style={{ ...inputStyle, height: "auto", minHeight: 230, resize: "vertical", padding: 12, lineHeight: 1.5 }} /></Field>
        <p style={{ margin: 0, color: C.dim, fontSize: 12, lineHeight: 1.5 }}>Use placeholders such as <code>[.product]</code> and <code>[.budget]</code>. Values are inserted from the submitted RFQ and approved supplier record. Missing RFQ values appear as <code>Not provided by buyer</code>.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button disabled={busy} onClick={() => void copy("subject")} style={btnStyle("neutral", "sm")}>Copy subject</button>
          <button disabled={busy} onClick={() => void copy("body")} style={btnStyle("neutral", "sm")}>Copy body</button>
          <button disabled={busy} onClick={() => void copy("all")} style={btnStyle("neutral", "sm")}>Copy all</button>
          {draft.status !== "contacted" && <button disabled={busy} onClick={() => void run(async () => { const next = await resetIntoolsRfqOutreachDraft(draft.id, draft.revision); setDraft(next); setSubject(next.subject); setBody(next.body); setNotice(`Reset from active template version ${next.template_version}.`); }, "Could not reset from the active template.")} style={btnStyle("neutral", "sm")}>Reset from latest master template</button>}
        </div>
        {draft.status !== "contacted" && <Field label="External contact note (optional)"><input value={contactNote} maxLength={2000} onChange={(event) => setContactNote(event.target.value)} style={inputStyle} /></Field>}
        {draft.status === "contacted" && <div style={{ display: "grid", gap: 10, paddingTop: 4 }}>
          <Field label="Supplier response evidence reference"><input required value={evidenceReference} maxLength={1000} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Email thread, document, or call-note reference" style={inputStyle} /></Field>
          <Field label="Response note (optional)"><textarea value={responseNote} maxLength={2000} rows={3} onChange={(event) => setResponseNote(event.target.value)} style={{ ...inputStyle, height: "auto", minHeight: 76, resize: "vertical", padding: 10 }} /></Field>
          <div><button disabled={busy || !evidenceReference.trim()} onClick={() => void run(async () => { await recordIntoolsRfqSupplierResponse(draft.id, responseNote, evidenceReference); setNotice("Supplier response recorded with its evidence reference. No quote was published."); onChanged(); }, "Could not record this supplier response.")} style={btnStyle("primary", "sm")}>Record supplier response</button></div>
        </div>}
        <div style={{ color: C.faint, fontSize: 11.5 }}>Status: {label(draft.status)} · Template v{draft.template_version} · Revision {draft.revision} · Last editor {draft.last_editor}</div>
        {error && <Notice tone="danger">{error}</Notice>}
        {notice && <Notice tone="success">{notice}</Notice>}
      </div>
    </ModalShell>
  );
}

function RequestDrawerBody({
  rfq,
  onClose,
  onChanged,
  onGenerateInvoice,
}: {
  rfq: Row;
  onClose: () => void;
  onChanged: () => void;
  onGenerateInvoice: (input: { rfqCaseId: string; buyerProfileId: string; description: string; amount: string; phase: "sample" }) => void;
}) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [supplierDirectory, setSupplierDirectory] = useState<IntoolsSupplier[]>([]);
  const [supplierDirectoryLoading, setSupplierDirectoryLoading] = useState(true);
  const [caseRecord, setCaseRecord] = useState<IntoolsRfqCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, QuoteDraft>>({});
  const [supplierQuery, setSupplierQuery] = useState("");
  const [productionNote, setProductionNote] = useState("");
  const [productionUpdates, setProductionUpdates] = useState<IntoolsProductionUpdate[]>([]);
  const [operationsFeatures, setOperationsFeatures] = useState({ production_updates_enabled: false, qc_evidence_upload_enabled: false, qc_ai_shadow_enabled: false, qc_buyer_visibility_enabled: false });
  const [productionSource, setProductionSource] = useState("");
  const [nextExpectedAt, setNextExpectedAt] = useState("");
  const [productionEvidence, setProductionEvidence] = useState("");
  const [productionException, setProductionException] = useState("");
  const [productionMitigation, setProductionMitigation] = useState("");
  const [productionBuyerAction, setProductionBuyerAction] = useState("");
  const [qcInspection, setQcInspection] = useState<IntoolsQcInspection | null>(null);
  const [qcCategory, setQcCategory] = useState<IntoolsQcInspection["category"]>("apparel");
  const [qcDecision, setQcDecision] = useState<"approved" | "rework_required" | "reinspection_required" | "insufficient_evidence">("approved");
  const [qcNote, setQcNote] = useState("");
  const [qcBuyerSummary, setQcBuyerSummary] = useState("");
  const [qcExpectedNext, setQcExpectedNext] = useState("");
  const [qcFindingDispositions, setQcFindingDispositions] = useState<Record<string, { disposition: "accepted" | "dismissed" | "amended"; note: string }>>({});
  const [qcVisibleAssets, setQcVisibleAssets] = useState<Set<string>>(new Set());
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const operationsLoadRef = useRef<{ inFlight: boolean; trailing: boolean; timer: ReturnType<typeof setTimeout> | null }>({ inFlight: false, trailing: false, timer: null });
  const [outreachDraft, setOutreachDraft] = useState<IntoolsOutreachDraft | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (operationsLoadRef.current.inFlight) { operationsLoadRef.current.trailing = true; return; }
    operationsLoadRef.current.inFlight = true;
    setLoading(true);
    setError("");
    try {
      if (refresh) await generateIntoolsRfqSupplierMatches(rfq.id, true);
      const operations = await getIntoolsRfqOperations(rfq.id);
      setCaseRecord(operations.case);
      setMatches(operations.matches.map((entry) => ({ match: entry, supplier: entry.supplier, quote: entry.quote })));
      setProductionUpdates(operations.production_updates);
      setOperationsFeatures(operations.features);
      setQcInspection(operations.qc_inspection);
      setQcVisibleAssets(new Set(operations.features.qc_buyer_visibility_enabled ? operations.qc_inspection?.review?.buyer_visible_asset_ids || [] : []));
      setQcFindingDispositions((current) => Object.fromEntries((operations.qc_inspection?.findings || []).filter((finding) => current[finding.id]).map((finding) => [finding.id, current[finding.id]])));
    } catch (cause) {
      setError(errorMessage(cause, "Could not load supplier matches for this request."));
    } finally {
      operationsLoadRef.current.inFlight = false;
      setLoading(false);
      if (operationsLoadRef.current.trailing) { operationsLoadRef.current.trailing = false; void load(false); }
    }
  }, [rfq.id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let active = true;
    void listIntoolsSuppliers()
      .then((suppliers) => { if (active) setSupplierDirectory(suppliers); })
      .catch(() => undefined)
      .finally(() => { if (active) setSupplierDirectoryLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | null = null;
    const invalidate = () => {
      if (operationsLoadRef.current.timer) clearTimeout(operationsLoadRef.current.timer);
      operationsLoadRef.current.timer = setTimeout(() => { if (active) void load(false); }, 180);
    };
    void subscribeToRfqActivity(rfq.id, invalidate).then((next) => { if (active) subscription = next; else next.unsubscribe(); }).catch(() => undefined);
    return () => { active = false; if (operationsLoadRef.current.timer) clearTimeout(operationsLoadRef.current.timer); subscription?.unsubscribe(); };
  }, [load, rfq.id]);

  function baseDraft(row: MatchRow): QuoteDraft {
    return {
      unitPrice: row.quote ? (row.quote.unit_price_cents / 100).toFixed(2) : "",
      moq: row.quote ? String(row.quote.moq) : "",
      leadTime: row.quote ? String(row.quote.lead_time_days) : "",
      total: row.quote?.quote_total_cents ? (row.quote.quote_total_cents / 100).toFixed(2) : "",
      recommended: row.quote?.recommended || false,
    };
  }
  function draftFor(row: MatchRow): QuoteDraft {
    return { ...baseDraft(row), ...drafts[row.match.factory_id] };
  }
  function setDraft(row: MatchRow, patch: Partial<QuoteDraft>) {
    setDrafts((current) => ({
      ...current,
      [row.match.factory_id]: { ...baseDraft(row), ...current[row.match.factory_id], ...patch },
    }));
  }

  async function act(matchId: string, fn: () => Promise<unknown>, message: string) {
    setBusyIds((current) => new Set(current).add(matchId));
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
      await load(false);
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause, "The action could not be completed."));
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(matchId);
        return next;
      });
    }
  }

  async function saveQuote(row: MatchRow) {
    const draft = draftFor(row);
    const unitPriceCents = Math.round((parseFloat(draft.unitPrice) || 0) * 100);
    const totalCents = Math.round((parseFloat(draft.total) || 0) * 100);
    await act(
      row.match.id,
      async () => {
        if (!caseRecord || !["awaiting_supplier", "supplier_replied", "buyer_review"].includes(caseRecord.status)) {
          throw new Error("This RFQ is still a draft. Submit it before publishing a reviewed quote.");
        }
        if (totalCents <= 0) throw new Error("Enter a positive total price before publishing this quote.");
        await publishIntoolsRfqQuoteReviewed(row.quote?.id ?? null, {
          rfqCaseId: rfq.id,
          factoryId: row.match.factory_id,
          unitPriceCents,
          quoteTotalCents: totalCents,
          moq: Math.round(Number(draft.moq) || 0),
          leadTimeDays: Math.round(Number(draft.leadTime) || 0),
          certifications: [],
          recommended: draft.recommended,
        }, row.quote?.revision ?? 0);
      },
      "Quote published to the buyer’s Quotes tab.",
    );
  }

  async function addSupplier(supplier: IntoolsSupplier) {
    await act(
      `directory:${supplier.id}`,
      () => addIntoolsRfqSupplierMatch(rfq.id, supplier.id),
      `${supplier.name} added to this RFQ. Review and approve the match before outreach.`,
    );
  }

  async function prepareOutreach(row: MatchRow) {
    setBusyIds((current) => new Set(current).add(row.match.id));
    setError(""); setNotice("");
    try { setOutreachDraft(await prepareIntoolsRfqOutreachDraft(rfq.id, row.match.id)); }
    catch (cause) { setError(errorMessage(cause, "Could not prepare the supplier email.")); }
    finally { setBusyIds((current) => { const next = new Set(current); next.delete(row.match.id); return next; }); }
  }

  const productionAction = (() => {
    if (caseRecord?.lifecycle_state === "sample_in_progress") {
      return { label: "Publish sample ready", stage: null as string | null };
    }
    const current = caseRecord?.order?.production_stage;
    if (current === "bulk_production") return { label: "Move to quality inspection", stage: "quality_inspection" };
    if (current === "quality_inspection") return { label: "Mark as shipped", stage: "shipped" };
    if (current === "shipped") return { label: "Mark as delivered", stage: "delivered" };
    return null;
  })();

  async function advanceProduction() {
    if (!caseRecord || !productionAction) return;
    await act(
      rfq.id,
      () => productionAction.stage
        ? updateIntoolsOrderProductionStage(caseRecord.order!.id, productionAction.stage, productionNote.trim() || null)
        : publishIntoolsRfqSample(rfq.id, productionNote.trim() || null),
      productionAction.stage ? "Production stage updated." : "Sample published for buyer review.",
    );
    setProductionNote("");
  }

  async function publishProductionUpdate() {
    if (!caseRecord?.order || !productionNote.trim() || !productionSource.trim()) return;
    await act(rfq.id, () => publishIntoolsRfqProductionUpdate(rfq.id, {
      phase: caseRecord.lifecycle_state?.startsWith("sample") ? "sample" : "bulk",
      stage: caseRecord.order?.production_stage || "bulk_production",
      note: productionNote.trim(), source: productionSource.trim(),
      nextExpectedAt: nextExpectedAt ? new Date(nextExpectedAt).toISOString() : null,
      evidenceReferences: productionEvidence.split("\n").map((item) => item.trim()).filter(Boolean),
      exceptionSeverity: productionException || null, mitigation: productionMitigation.trim() || null,
      requiredBuyerAction: productionBuyerAction.trim() || null,
    }, productionUpdates[0]?.revision || 0), "Production update published to the buyer timeline.");
    setProductionNote(""); setProductionSource(""); setNextExpectedAt(""); setProductionEvidence(""); setProductionException(""); setProductionMitigation(""); setProductionBuyerAction("");
  }

  async function startQcReview() {
    await act(rfq.id, () => beginIntoolsManualQcReview(rfq.id, qcCategory), "Manual QC inspection opened. AI analysis remains optional.");
  }

  async function uploadQcFile(file: File) {
    if (!qcInspection) return;
    setError(""); setNotice(""); setUploadProgress(0);
    try {
      await uploadIntoolsQcEvidence(rfq.id, qcInspection.id, file, setUploadProgress);
      setNotice("QC evidence uploaded directly to private Supabase Storage.");
      await load(false);
    } catch (cause) { setError(errorMessage(cause, "Could not upload QC evidence.")); }
    finally { setUploadProgress(null); }
  }

  async function publishQcReview() {
    if (!qcInspection || !qcNote.trim()) return;
    const findingDispositions = qcInspection.findings.map((finding) => ({ finding_id: finding.id, ...qcFindingDispositions[finding.id] }));
    await act(qcInspection.id, () => reviewIntoolsQcInspection(qcInspection.id, qcInspection.current_analysis_run_id, qcDecision, qcNote.trim(), [...qcVisibleAssets], qcInspection.revision, findingDispositions, qcBuyerSummary, qcExpectedNext ? new Date(qcExpectedNext).toISOString() : null), "Authoritative human QC review published.");
    setQcNote(""); setQcBuyerSummary(""); setQcExpectedNext(""); setQcFindingDispositions({});
  }

  const qcFindingsComplete = Boolean(qcInspection && qcInspection.findings.every((finding) => qcFindingDispositions[finding.id] && (qcFindingDispositions[finding.id].disposition !== "amended" || qcFindingDispositions[finding.id].note.trim())));

  const selectedRow = matches.find((row) => row.quote?.status === "selected");
  const canGenerate = Boolean(selectedRow?.quote?.quote_total_cents);
  const filtered = matches.filter((row) => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return true;
    const supplier = row.supplier;
    return `${supplier?.name || ""} ${supplier?.region || ""} ${supplier?.loc || ""} ${supplier?.type || ""} ${supplier?.area || ""} ${supplier?.port || ""} ${(supplier?.tags || []).join(" ")}`.toLowerCase().includes(q);
  });
  const query = supplierQuery.trim().toLowerCase();
  const matchedFactoryIds = new Set(matches.map((row) => row.match.factory_id));
  const directoryResults = query
    ? supplierDirectory.filter((supplier) => {
      if (matchedFactoryIds.has(supplier.id)) return false;
      return `${supplier.name} ${supplier.region || ""} ${supplier.loc || ""} ${supplier.type || ""} ${supplier.area || ""} ${supplier.port || ""} ${(supplier.tags || []).join(" ")}`.toLowerCase().includes(query);
    }).slice(0, 50)
    : [];
  const quotePublicationEligible = ["awaiting_supplier", "supplier_replied", "buyer_review"].includes(caseRecord?.status || "");

  return (
    <DrawerShell
      title={rfq.title}
      subtitle={rfq.subtitle}
      status={rfq.status}
      onClose={onClose}
      footer={
        <button
          disabled={!canGenerate}
          onClick={() =>
            onGenerateInvoice({
              rfqCaseId: rfq.id,
              buyerProfileId: caseRecord?.buyer_profile_id || "",
              description: `${rfq.title} — ${rfq.subtitle}`,
              amount: selectedRow?.quote?.quote_total_cents ? (selectedRow.quote.quote_total_cents / 100).toFixed(2) : "",
              phase: "sample",
            })
          }
          style={{
            ...btnStyle(canGenerate ? "success" : "neutral"),
            opacity: canGenerate ? 1 : 0.55,
            cursor: canGenerate ? "pointer" : "not-allowed",
          }}
        >
          {canGenerate ? "Create sampling invoice" : "Await buyer quote selection"}
        </button>
      }
    >
      <FieldRows
        rows={[
          ["Buyer", caseRecord?.buyer_name || rfq.cols[0] || "—"],
          ["Buyer email", caseRecord?.buyer_email || "—"],
          ["Quotes", String(caseRecord?.quote_count ?? 0)],
          ["Lifecycle", caseRecord?.lifecycle_state ? label(caseRecord.lifecycle_state) : "Not started"],
          ["Order", caseRecord?.order?.order_no || "Not created"],
          ["Production stage", caseRecord?.order?.production_stage ? label(caseRecord.order.production_stage) : "Not started"],
        ]}
      />

      {productionAction && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "end", gap: 8, marginTop: 12 }}>
          <Field label="Stage or verified update note">
            <input
              value={productionNote}
              maxLength={2000}
              onChange={(event) => setProductionNote(event.target.value)}
              style={{ ...inputStyle, height: 32, fontSize: 12.5 }}
            />
          </Field>
          <button
            disabled={busyIds.has(rfq.id)}
            aria-busy={busyIds.has(rfq.id)}
            onClick={() => void advanceProduction()}
            style={btnStyle("success", "sm")}
          >
            {productionAction.label}
          </button>
        </div>
      )}

      {caseRecord?.order && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: "#f8faf9", display: "grid", gap: 9 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: C.faint }}>Verified production update</div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
            <Field label="Source"><input value={productionSource} maxLength={500} placeholder="Factory email, call note, inspection" onChange={(event) => setProductionSource(event.target.value)} style={{ ...inputStyle, height: 32, fontSize: 12.5 }} /></Field>
            <Field label="Next expected update"><input type="datetime-local" value={nextExpectedAt} onChange={(event) => setNextExpectedAt(event.target.value)} style={{ ...inputStyle, height: 32, fontSize: 12.5 }} /></Field>
          </div>
          <Field label="Evidence references (one per line)"><textarea value={productionEvidence} maxLength={4000} rows={2} onChange={(event) => setProductionEvidence(event.target.value)} style={{ ...inputStyle, height: "auto", minHeight: 58, resize: "vertical", padding: 9 }} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
            <Field label="Exception severity"><select value={productionException} onChange={(event) => setProductionException(event.target.value)} style={{ ...inputStyle, height: 34 }}><option value="">No exception</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field>
            <Field label="Required buyer action"><input value={productionBuyerAction} maxLength={1000} onChange={(event) => setProductionBuyerAction(event.target.value)} style={{ ...inputStyle, height: 34 }} /></Field>
          </div>
          {productionException && <Field label="Mitigation or follow-up"><input value={productionMitigation} maxLength={2000} onChange={(event) => setProductionMitigation(event.target.value)} style={{ ...inputStyle, height: 34 }} /></Field>}
          <button title={operationsFeatures.production_updates_enabled ? undefined : "Enable production updates in Master settings."} disabled={!operationsFeatures.production_updates_enabled || busyIds.has(rfq.id) || !productionNote.trim() || !productionSource.trim() || Boolean(productionException && !productionMitigation.trim())} onClick={() => void publishProductionUpdate()} style={btnStyle("primary", "sm")}>Publish verified update</button>
          {productionUpdates[0] && <div style={{ fontSize: 11.5, color: C.dim }}>Latest v{productionUpdates[0].revision}: {productionUpdates[0].note}</div>}
        </div>
      )}

      {caseRecord?.order?.production_stage === "quality_inspection" && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: "#f8faf9", display: "grid", gap: 9 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: C.faint }}>Quality evidence and human review</div>
          {!qcInspection ? <>
            <Field label="Checklist category"><select value={qcCategory} onChange={(event) => setQcCategory(event.target.value as IntoolsQcInspection["category"])} style={{ ...inputStyle, height: 34 }}>
              <option value="apparel">Finished apparel</option><option value="fabric">Fabric and materials</option><option value="trim">Trims and hardware</option><option value="fashion_accessory">Fashion accessories</option><option value="skincare">Skincare</option><option value="beauty">Beauty</option>
            </select></Field>
            <button title={operationsFeatures.qc_evidence_upload_enabled ? undefined : "Enable QC evidence upload in Master settings."} disabled={!operationsFeatures.qc_evidence_upload_enabled || busyIds.has(rfq.id)} onClick={() => void startQcReview()} style={btnStyle("primary", "sm")}>Open manual QC inspection</button>
          </> : <>
            <div style={{ fontSize: 12, color: C.dim }}>Checklist v{qcInspection.checklist.version} · {label(qcInspection.category)} · {label(qcInspection.substate)}</div>
            <div style={{ fontSize: 11.5, color: C.faint }}>{qcInspection.checklist.capture_instructions}</div>
            {qcInspection.findings.map((finding) => <div key={finding.id} style={{ padding: 9, borderRadius: 8, background: "#fff", display: "grid", gap: 6 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: C.head }}>{label(finding.category)} · {label(finding.severity)} · AI-suggested</div>
              <div style={{ fontSize: 12, color: C.dim }}>{finding.summary}{finding.evidence.frame_id ? ` · ${finding.evidence.frame_id}` : ""}</div>
              <select aria-label={`Disposition for ${finding.category}`} value={qcFindingDispositions[finding.id]?.disposition || ""} onChange={(event) => setQcFindingDispositions((current) => ({ ...current, [finding.id]: { disposition: event.target.value as "accepted" | "dismissed" | "amended", note: current[finding.id]?.note || "" } }))} style={{ ...inputStyle, height: 32 }}><option value="">Review this finding</option><option value="accepted">Accept observation</option><option value="dismissed">Dismiss observation</option><option value="amended">Amend observation</option></select>
              {qcFindingDispositions[finding.id]?.disposition === "amended" && <input aria-label={`Amendment for ${finding.category}`} value={qcFindingDispositions[finding.id]?.note || ""} maxLength={1000} onChange={(event) => setQcFindingDispositions((current) => ({ ...current, [finding.id]: { disposition: "amended", note: event.target.value } }))} style={{ ...inputStyle, height: 32 }} />}
            </div>)}
            <label style={{ ...btnStyle("neutral", "sm"), width: "fit-content", cursor: uploadProgress === null && operationsFeatures.qc_evidence_upload_enabled ? "pointer" : "not-allowed", opacity: operationsFeatures.qc_evidence_upload_enabled ? 1 : 0.55 }}>
              {uploadProgress === null ? "Upload private QC evidence" : `Uploading ${uploadProgress}%`}
              <input type="file" hidden disabled={uploadProgress !== null || !operationsFeatures.qc_evidence_upload_enabled} accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadQcFile(file); event.currentTarget.value = ""; }} />
            </label>
            {qcInspection.assets.map((asset) => <label key={asset.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.dim }}>
              <input type="checkbox" disabled={!operationsFeatures.qc_buyer_visibility_enabled} checked={qcVisibleAssets.has(asset.id)} onChange={(event) => setQcVisibleAssets((current) => { const next = new Set(current); if (event.target.checked) next.add(asset.id); else next.delete(asset.id); return next; })} />
              Share {asset.original_name} with buyer after review ({Math.ceil(asset.byte_size / 1024)} KB)
            </label>)}
            <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0,1fr)", gap: 8 }}>
              <Field label="Decision"><select value={qcDecision} onChange={(event) => setQcDecision(event.target.value as typeof qcDecision)} style={{ ...inputStyle, height: 34 }}><option value="approved">Approve</option><option value="rework_required">Require rework</option><option value="reinspection_required">Require reinspection</option><option value="insufficient_evidence">Insufficient evidence</option></select></Field>
              <Field label="Internal review rationale"><input value={qcNote} maxLength={4000} onChange={(event) => setQcNote(event.target.value)} style={{ ...inputStyle, height: 34 }} /></Field>
            </div>
            <Field label="Buyer-visible summary"><input value={qcBuyerSummary} maxLength={2000} onChange={(event) => setQcBuyerSummary(event.target.value)} placeholder="Optional; a decision-specific summary is used if blank" style={{ ...inputStyle, height: 34 }} /></Field>
            {qcDecision !== "approved" && <Field label="Next expected update"><input type="datetime-local" value={qcExpectedNext} onChange={(event) => setQcExpectedNext(event.target.value)} style={{ ...inputStyle, height: 34 }} /></Field>}
            <button disabled={busyIds.has(qcInspection.id) || !qcNote.trim() || qcInspection.assets.length === 0 || !qcFindingsComplete || Boolean(qcDecision !== "approved" && !qcExpectedNext)} onClick={() => void publishQcReview()} style={btnStyle("success", "sm")}>Publish human QC review</button>
            <div style={{ fontSize: 11.5, color: C.faint }}>AI findings are triage only. This attributed review is the sole QC authority and an approval is required before shipment.</div>
          </>}
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: C.faint, marginBottom: 6 }}>
        Supplier matches
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button disabled={loading || busyIds.size > 0} onClick={() => void load(true)} style={btnStyle("neutral", "sm")} aria-busy={loading}>
          Refresh recommendations
        </button>
      </div>
      <input
        type="text"
        value={supplierQuery}
        onChange={(event) => setSupplierQuery(event.target.value)}
        placeholder="Search all suppliers by name, region, city or type"
        aria-label="Search all suppliers by name, region, city or type"
        style={{ ...inputStyle, width: "100%", height: 32, fontSize: 12.5, marginBottom: 8 }}
      />
      {loading && <SkeletonRows />}
      {!loading && filtered.length === 0 && !supplierDirectoryLoading && directoryResults.length === 0 && (
        <p style={{ margin: "6px 0 10px", fontSize: 12.5, color: C.faint }}>{query ? "No suppliers found in the directory." : "No supplier matches for this request yet."}</p>
      )}
      {!loading && query && supplierDirectoryLoading && <p style={{ margin: "6px 0 10px", fontSize: 12.5, color: C.faint }}>Searching the supplier directory…</p>}
      {!loading &&
        filtered.map((row) => {
          const status = row.match.status;
          const quoteLocked = Boolean(row.quote && row.quote.status !== "draft");
          const draft = draftFor(row);
          const busy = busyIds.has(row.match.id);
          return (
            <div key={row.match.id} style={{ padding: "9px 0", borderBottom: "1px solid #f0f2f5" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>
                    {row.supplier?.name || "Unknown supplier"}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.dim }}>{row.supplier?.region || "—"}</div>
                </div>
                <span style={statusPill(status)}>{label(status)}</span>
              </div>

              {status === "suggested" && (
                <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                  <button
                    disabled={busy}
                    onClick={() => void act(row.match.id, () => setIntoolsRfqSupplierMatchStatus(row.match.id, "approved"), "Supplier approved for this request.")}
                    style={btnStyle("success", "sm")}
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void act(row.match.id, () => setIntoolsRfqSupplierMatchStatus(row.match.id, "rejected"), "Supplier rejected.")}
                    style={btnStyle("danger", "sm")}
                  >
                    Reject
                  </button>
                </div>
              )}

              {(status === "approved" || status === "selected") && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 8,
                    background: status === "selected" ? "#eef4f0" : "#f9fafb",
                    border: status === "selected" ? "1px solid #cfe3d5" : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                    <button
                      disabled={busy || !caseRecord?.outreach_enabled}
                      title={caseRecord?.outreach_enabled ? undefined : "Enable supplier outreach templates before preparing email."}
                      onClick={() => void prepareOutreach(row)}
                      style={btnStyle("primary", "sm")}
                    >
                      Prepare supplier email
                    </button>
                  </div>
                  {quoteLocked ? (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px 18px" }}>
                        <ReadOnlyQuoteValue label="Unit price (USD)" value={draft.unitPrice} />
                        <ReadOnlyQuoteValue label="MOQ" value={draft.moq} />
                        <ReadOnlyQuoteValue label="Lead time (days)" value={draft.leadTime} />
                        <ReadOnlyQuoteValue label="Total price (USD)" value={draft.total} />
                      </div>
                      <div style={{ marginTop: 12, fontSize: 11.5, fontWeight: 700, color: "#1f6b43" }}>
                        {row.quote?.status === "selected" ? "Selected by buyer · sampling invoice ready" : "Published to buyer · quote terms locked"}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
                        <Field label="Unit price (USD)">
                          <input value={draft.unitPrice} onChange={(event) => setDraft(row, { unitPrice: event.target.value })} style={{ ...inputStyle, height: 30, fontSize: 12.5 }} />
                        </Field>
                        <Field label="MOQ">
                          <input value={draft.moq} onChange={(event) => setDraft(row, { moq: event.target.value })} style={{ ...inputStyle, height: 30, fontSize: 12.5 }} />
                        </Field>
                        <Field label="Lead time (days)">
                          <input value={draft.leadTime} onChange={(event) => setDraft(row, { leadTime: event.target.value })} style={{ ...inputStyle, height: 30, fontSize: 12.5 }} />
                        </Field>
                        <Field label="Total price (USD)">
                          <input value={draft.total} onChange={(event) => setDraft(row, { total: event.target.value })} style={{ ...inputStyle, height: 30, fontSize: 12.5 }} />
                        </Field>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9, fontSize: 12, color: "#3b4453", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={draft.recommended}
                          onChange={(event) => setDraft(row, { recommended: event.target.checked })}
                          style={{ width: 15, height: 15, accentColor: C.moss, cursor: "pointer" }}
                        />
                        Mark as recommended
                      </label>
                      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        <button disabled={busy || !quotePublicationEligible} title={quotePublicationEligible ? undefined : "Submit this RFQ before publishing reviewed supplier quotes."} onClick={() => void saveQuote(row)} style={btnStyle("neutral", "sm")}>
                          {quotePublicationEligible ? "Publish reviewed quote" : "Submit RFQ to publish"}
                        </button>
                      </div>
                    </>
                  )}
                  {status === "selected" && (
                    <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: "#1f6b43" }}>Selected for invoice</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      {!loading && directoryResults.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em", color: C.faint }}>All supplier records</div>
          <div style={{ marginBottom: 8, fontSize: 12, color: C.dim }}>Search results outside the recommendations. Add one to review it for this RFQ.</div>
          {directoryResults.map((supplier) => {
            const eligible = supplier.verify_state === "verified" && supplier.broker_status === "approved" && !supplier.archived_at;
            const supplierBusy = busyIds.has(`directory:${supplier.id}`);
            return (
              <div key={supplier.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #f0f2f5" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>{supplier.name}</div>
                  <div style={{ fontSize: 11.5, color: C.dim }}>{supplier.region || supplier.loc || "Region not recorded"} · {label(supplier.type || "supplier")}</div>
                </div>
                <button disabled={!eligible || supplierBusy} title={eligible ? undefined : "Only verified, approved, and non-archived suppliers can be added."} onClick={() => void addSupplier(supplier)} style={btnStyle(eligible ? "neutral" : "neutral", "sm")}>
                  {supplierBusy ? "Adding…" : eligible ? "Add to RFQ" : "Not eligible"}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {!loading && !quotePublicationEligible && (
        <Notice tone="info">This RFQ is still {label(caseRecord?.status || "draft")}. Submit it before publishing reviewed supplier quotes; adding or approving supplier matches remains available.</Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {outreachDraft && <OutreachDraftModal initial={outreachDraft} onClose={() => setOutreachDraft(null)} onChanged={() => { void load(false); onChanged(); }} />}
    </DrawerShell>
  );
}

/* -- Supplier drawer -- */
type SupplierEditDraft = {
  slug: string; name: string; type: string; region: string; loc: string; years: string; moq: string; lead: string; capacity: string;
  certs: string; tags: string; sales: string; phone: string; web: string; founded: string; employees: string; area: string; port: string; bio: string; img: string; logo_img: string; page_img: string;
};
function supplierEditDraft(supplier: IntoolsSupplier): SupplierEditDraft {
  return {
    slug: supplier.slug || "", name: supplier.name || "", type: supplier.type || "garment_manufacturer", region: supplier.region || "", loc: supplier.loc || "",
    years: supplier.years == null ? "" : String(supplier.years), moq: supplier.moq || "", lead: supplier.lead || "", capacity: supplier.capacity || "",
    certs: (supplier.certs || []).join(", "), tags: (supplier.tags || []).join(", "), sales: supplier.sales || "", phone: supplier.phone || "", web: supplier.web || "",
    founded: supplier.founded == null ? "" : String(supplier.founded), employees: supplier.employees || "", area: supplier.area || "", port: supplier.port || "", bio: supplier.bio || "",
    img: supplier.img || "", logo_img: supplier.logo_img || "", page_img: supplier.page_img || "",
  };
}
function supplierEditPayload(draft: SupplierEditDraft): IntoolsSupplierPayload {
  const text = (value: string) => value.trim() || null;
  const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
  const integer = (value: string) => value.trim() ? Number.parseInt(value, 10) : null;
  return { slug: draft.slug.trim(), name: draft.name.trim(), type: draft.type, region: text(draft.region), loc: text(draft.loc), years: integer(draft.years), moq: text(draft.moq), lead: text(draft.lead), capacity: text(draft.capacity), certs: list(draft.certs), tags: list(draft.tags), sales: text(draft.sales), phone: text(draft.phone), web: text(draft.web), founded: integer(draft.founded), employees: text(draft.employees), area: text(draft.area), port: text(draft.port), bio: text(draft.bio), img: text(draft.img), logo_img: text(draft.logo_img), page_img: text(draft.page_img) };
}
function SupplierDrawerBody({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<IntoolsSupplierDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<SupplierEditDraft | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await getIntoolsSupplierDetail(id));
    } catch (cause) {
      setError(errorMessage(cause, "Could not load this supplier."));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
      await load();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause, "The action could not be completed."));
    } finally {
      setBusy(false);
    }
  }

  async function saveSupplier() {
    if (!detail || !draft) return;
    if (!draft.name.trim() || !draft.slug.trim()) { setError("Supplier name and slug are required."); return; }
    await run(async () => {
      await saveIntoolsSupplier(detail.id, supplierEditPayload(draft), detail.updated_at);
      setDraft(null);
    }, "Supplier information saved.");
  }

  if (error && !detail)
    return (
      <DrawerShell title="Supplier" subtitle={id} onClose={onClose}>
        <Notice tone="danger">{error}</Notice>
      </DrawerShell>
    );
  if (!detail)
    return (
      <DrawerShell title="Supplier" subtitle={id} onClose={onClose}>
        <SkeletonRows />
      </DrawerShell>
    );

  const brokerStatus = detail.archived_at ? "archived" : detail.broker_status || detail.verify_state;
  return (
    <DrawerShell
      title={detail.name}
      subtitle={`${detail.slug} · ${detail.region || detail.loc || "Region not recorded"}`}
      status={brokerStatus}
      onClose={onClose}
      footer={draft ? <><button disabled={busy} onClick={() => setDraft(null)} style={btnStyle("neutral")}>Cancel</button><button disabled={busy} onClick={() => void saveSupplier()} style={btnStyle("success")}>Save changes</button></> :
        <>
          <button disabled={busy || detail.broker_status === "approved"} onClick={() => void run(() => setIntoolsSupplierBrokerStatus(detail.id, "approved"), "Supplier approved.")} style={btnStyle("success")}>
            Approve
          </button>
          <button disabled={busy || detail.broker_status === "rejected"} onClick={() => void run(() => setIntoolsSupplierBrokerStatus(detail.id, "rejected"), "Supplier rejected.")} style={btnStyle("danger")}>
            Reject
          </button>
          <button disabled={busy || Boolean(detail.curation_locked)} onClick={() => setDraft(supplierEditDraft(detail))} style={btnStyle("primary")}>
            Edit
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(
                () => archiveIntoolsSupplier(detail.id, detail.updated_at, detail.archived_at != null),
                detail.archived_at ? "Supplier restored." : "Supplier archived.",
              )
            }
            style={btnStyle("neutral")}
          >
            {detail.archived_at ? "Restore" : "Archive"}
          </button>
        </>
      }
    >
      {detail.curation_locked && <div role="status" style={{ marginBottom: 10, padding: "9px 10px", borderRadius: 8, background: TONES.info.bg, color: TONES.info.color, fontSize: 12.5 }}>Curated fields are locked. Unlock the supplier in the Supplier workspace before editing.</div>}
      {draft ? <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }} aria-busy={busy}>
        {([['Supplier name','name'],['Slug','slug'],['Type','type'],['Country','region'],['City / location','loc'],['Years in business','years'],['MOQ','moq'],['Lead time','lead'],['Monthly capacity','capacity'],['Certifications','certs'],['Capability tags','tags'],['Sales contact','sales'],['Phone','phone'],['Website','web'],['Founded year','founded'],['Employees','employees'],['Factory area','area'],['Port','port'],['Legacy image URL','img'],['Logo URL','logo_img'],['Company image URL','page_img']] as Array<[string,keyof SupplierEditDraft]>).map(([field,key]) => <Field key={key} label={field}><input value={draft[key]} onChange={(event) => setDraft((current) => current ? { ...current, [key]: event.target.value } : current)} style={inputStyle} /></Field>)}
        <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: C.head }}>Internal profile<textarea value={draft.bio} onChange={(event) => setDraft((current) => current ? { ...current, bio: event.target.value } : current)} style={{ ...inputStyle, height: 100, padding: 10, resize: "vertical" }} /></label>
      </div> : <FieldRows
        rows={[
          ["Type", label(detail.type || "—")],
          ["Region", detail.region || detail.loc || "—"],
          ["Contact", detail.phone || "—"],
          ["Website", detail.web || "—"],
          ["Years in business", detail.years != null ? String(detail.years) : "—"],
          ["MOQ", detail.moq || "—"],
          ["Lead time", detail.lead || "—"],
          ["Monthly capacity", detail.capacity || "—"],
          ["Certifications", (detail.certs || []).join(", ") || "—"],
          ["Products", `${detail.product_count ?? detail.products.length}`],
          ["Company overview", detail.bio || "—"],
        ]}
      />}
      {detail.source_contacts.length > 0 && (
        <>
          <GroupLabel>Source contacts</GroupLabel>
          {detail.source_contacts.map((contact, index) => (
            <div key={index} style={{ padding: "8px 0", borderBottom: "1px solid #f0f2f5", fontSize: 12.5 }}>
              {label(contact.contact_type)}: {contact.normalized_value} · {contact.validation_status}
            </div>
          ))}
        </>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
    </DrawerShell>
  );
}

/* -- Registration drawer -- */
function RegistrationDrawerBody({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [request, setRequest] = useState<IntoolsRegistrationRequest | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await listIntoolsRegistrationRequests(null);
      setRequest(all.find((entry) => entry.id === id) || null);
    } catch (cause) {
      setError(errorMessage(cause, "Could not load this request."));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
      await load();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause, "The action could not be completed."));
    } finally {
      setBusy(false);
    }
  }

  if (!request)
    return (
      <DrawerShell title="Sign-up request" subtitle={id} onClose={onClose}>
        {error ? <Notice tone="danger">{error}</Notice> : <SkeletonRows />}
      </DrawerShell>
    );

  const pending = request.status === "pending_review";
  return (
    <DrawerShell
      title={request.name}
      subtitle={request.email}
      status={request.status}
      onClose={onClose}
      footer={
        pending ? (
          <>
            <button disabled={busy} onClick={() => void run(() => approveRegistrationRequest(request.id), "Request approved.")} style={btnStyle("success")}>
              Approve
            </button>
            <button disabled={busy} onClick={() => void run(() => declineRegistrationRequest(request.id), "Request declined.")} style={btnStyle("danger")}>
              Decline
            </button>
          </>
        ) : undefined
      }
    >
      <FieldRows
        rows={[
          ["Company", request.company_name],
          ["Phone", request.phone ? `${request.country_code || ""} ${request.phone}`.trim() : "—"],
          ["Annual revenue", request.annual_revenue],
          ["Sourcing need", request.sourcing],
          ["Submitted", shortDate(request.created_at)],
          ["Reviewed", request.reviewed_at ? shortDate(request.reviewed_at) : "—"],
        ]}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
    </DrawerShell>
  );
}

/* -- Knowledge drawer -- */
function KnowledgeDrawerBody({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [doc, setDoc] = useState<IntoolsAgentKnowledgeDocument | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await listIntoolsAgentKnowledge(null, null);
      setDoc(all.find((entry) => entry.id === id) || null);
    } catch (cause) {
      setError(errorMessage(cause, "Could not load this document."));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
      await load();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause, "The action could not be completed."));
    } finally {
      setBusy(false);
    }
  }

  if (!doc)
    return (
      <DrawerShell title="Knowledge document" subtitle={id} onClose={onClose}>
        {error ? <Notice tone="danger">{error}</Notice> : <SkeletonRows />}
      </DrawerShell>
    );

  return (
    <DrawerShell
      title={doc.title}
      subtitle={doc.original_name || "Knowledge document"}
      status={doc.status}
      onClose={onClose}
      footer={
        <>
          <button
            disabled={busy || !doc.current_version_id || doc.status === "published"}
            onClick={() => void run(() => publishIntoolsAgentKnowledge(doc.current_version_id!), "Document published.")}
            style={btnStyle("success")}
          >
            Publish
          </button>
          <button disabled={busy || doc.status === "archived"} onClick={() => void run(() => archiveIntoolsAgentKnowledge(doc.id), "Document archived.")} style={btnStyle("neutral")}>
            Archive
          </button>
        </>
      }
    >
      <FieldRows
        rows={[
          ["Domain", label(doc.domain || "—")],
          ["Visibility", label(doc.visibility || "—")],
          ["Size", formatBytes(doc.byte_size)],
          ["Type", doc.mime_type || "—"],
          ["Categories", (doc.applies_to.categories || []).join(", ") || "—"],
          ["Procurement modes", (doc.applies_to.procurementModes || []).join(", ") || "—"],
          ["Updated", shortDate(doc.updated_at)],
          ["Extraction error", doc.extraction_error || "—"],
        ]}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
    </DrawerShell>
  );
}

/* -- Audit drawer -- */
function AuditDrawerBody({ row, onClose }: { row: Row; onClose: () => void }) {
  return (
    <DrawerShell title={row.title} subtitle={row.subtitle} onClose={onClose}>
      <FieldRows
        rows={[
          ["Action", row.title],
          ["Actor", row.subtitle],
          ["Summary", row.cols[0] || "—"],
          ["When", row.cols[1] || "—"],
        ]}
      />
    </DrawerShell>
  );
}

/* ------------------------------------------------------------------ Modals owned by shell */

const SUPPLIER_TYPES = [
  "garment_manufacturer",
  "fabric_mill",
  "trim_supplier",
  "accessories_supplier",
  "yarn_supplier",
  "textile_trading_company",
  "material_innovator",
];
// material_innovator is the supplier bucket the routing engine maps
// beauty_personal_care demand onto, so it doubles as the skincare / beauty
// OEM-ODM category.
const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  material_innovator: "Skincare / beauty (material innovator)",
};
function supplierTypeLabel(value: string) {
  return SUPPLIER_TYPE_LABELS[value] || label(value);
}
const KNOWLEDGE_DOMAINS = ["rfq", "sourcing", "operations", "payments-orders", "policies", "support"];

function SupplierFormModal({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const [values, setValues] = useState({
    name: "",
    contactName: "",
    web: "",
    region: "",
    type: "garment_manufacturer",
    years: "",
    moq: "",
    lead: "",
    capacity: "",
    certs: "",
    bio: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = values.name.trim().length > 0;

  function set<K extends keyof typeof values>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const slug = values.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const payload: IntoolsSupplierPayload = {
        slug,
        name: values.name.trim(),
        type: values.type,
        region: values.region.trim() || null,
        verify_state: "unverified",
        years: values.years ? Number(values.years) : null,
        moq: values.moq.trim() || null,
        lead: values.lead.trim() || null,
        capacity: values.capacity.trim() || null,
        certs: values.certs ? values.certs.split(",").map((entry) => entry.trim()).filter(Boolean) : null,
        web: values.web.trim() || null,
        bio: values.bio.trim() || null,
      };
      await saveIntoolsSupplier(null, payload);
      onDone(`${values.name.trim()} added as a new supplier record — pending review.`);
    } catch (cause) {
      setError(errorMessage(cause, "Could not create this supplier."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title="New supplier"
      hint="Fields mirror the public supplier intake form, plus internal MOQ and lead time for review."
      width={600}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} style={btnStyle("neutral")}>
            Cancel
          </button>
          <button disabled={busy || !ready} onClick={() => void submit()} style={btnStyle(ready ? "success" : "neutral")}>
            Add supplier
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
        <Field label="Company name">
          <input value={values.name} onChange={(event) => set("name", event.target.value)} style={inputStyle} />
        </Field>
        <Field label="Contact name">
          <input value={values.contactName} onChange={(event) => set("contactName", event.target.value)} style={inputStyle} />
        </Field>
        <Field label="Website">
          <input value={values.web} onChange={(event) => set("web", event.target.value)} style={inputStyle} />
        </Field>
        <Field label="Region">
          <input value={values.region} onChange={(event) => set("region", event.target.value)} style={inputStyle} />
        </Field>
        <Field label="Supplier type">
          <select value={values.type} onChange={(event) => set("type", event.target.value)} style={{ ...inputStyle, background: "#fff" }}>
            {SUPPLIER_TYPES.map((type) => (
              <option key={type} value={type}>
                {supplierTypeLabel(type)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Years in business">
          <input value={values.years} inputMode="numeric" onChange={(event) => set("years", event.target.value)} style={inputStyle} />
        </Field>
        <Field label="Lead time">
          <input value={values.lead} onChange={(event) => set("lead", event.target.value)} placeholder="e.g. 30 days" style={inputStyle} />
        </Field>
        <Field label="MOQ">
          <input value={values.moq} onChange={(event) => set("moq", event.target.value)} placeholder="e.g. 300 units" style={inputStyle} />
        </Field>
        <Field label="Monthly capacity">
          <input value={values.capacity} onChange={(event) => set("capacity", event.target.value)} style={inputStyle} />
        </Field>
        <Field label="Certifications">
          <input value={values.certs} onChange={(event) => set("certs", event.target.value)} placeholder="Comma separated" style={inputStyle} />
        </Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label="Company overview">
          <textarea rows={2} value={values.bio} onChange={(event) => set("bio", event.target.value)} style={{ ...inputStyle, height: "auto", padding: "8px 10px", resize: "vertical" }} />
        </Field>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </ModalShell>
  );
}

function UploadModal({
  section,
  onClose,
  onDone,
}: {
  section: "suppliers" | "knowledge";
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const meta = SECTIONS[section];
  const [files, setFiles] = useState<File[]>([]);
  const [domain, setDomain] = useState("rfq");
  const [visibility, setVisibility] = useState("operator-only");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function parseSupplierRows(file: File): Promise<IntoolsSupplierImportRow[]> {
    const text = await file.text();
    let entries: Record<string, unknown>[];
    if (file.name.toLowerCase().endsWith(".json")) {
      const parsed: unknown = JSON.parse(text);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown }).rows)
          ? (parsed as { rows: unknown[] }).rows
          : [];
      entries = list.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    } else {
      entries = parseCsvTable(text);
    }
    if (!entries.length) throw new Error("No rows found in this file.");
    if (entries.length > 50) throw new Error(`Import up to 50 rows per file; this file has ${entries.length}.`);
    return entries.map((entry, index) => supplierImportRowFromEntry(entry, index));
  }

  async function submit() {
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      if (section === "suppliers") {
        let accepted = 0;
        let rejected = 0;
        const reasons = new Set<string>();
        for (const file of files) {
          const rows = await parseSupplierRows(file);
          const dryRun = await runIntoolsSupplierImportDryRun(rows, false);
          const promotable = dryRun.rows.filter((row) => row.status === "accepted").map((row) => row.row_number);
          for (const row of dryRun.rows) {
            if (row.status === "accepted") continue;
            rejected += 1;
            for (const issue of row.errors || []) reasons.add(`${issue.path}: ${issue.message}`);
          }
          if (promotable.length) {
            const promoted = await promoteIntoolsSupplierImportRows(dryRun.run_id, promotable, false);
            accepted += promoted.rows.filter((row) => row.status === "promoted").length;
          }
        }
        if (!accepted) {
          throw new Error(
            `No rows imported (${rejected} rejected)${reasons.size ? ` — ${[...reasons].slice(0, 4).join("; ")}` : ""}.`,
          );
        }
        onDone(
          `${accepted} supplier record${accepted === 1 ? "" : "s"} imported — pending review.` +
            (rejected ? ` ${rejected} row${rejected === 1 ? "" : "s"} rejected.` : ""),
        );
        return;
      }
      const results = await Promise.allSettled(
        files.map((file) =>
          uploadIntoolsAgentKnowledge(file, {
            title: file.name.replace(/\.[^.]+$/, ""),
            domain,
            visibility,
          }),
        ),
      );
      const ok = results.filter((result) => result.status === "fulfilled").length;
      const failed = results
        .map((result, index) => (result.status === "rejected" ? { name: files[index].name, reason: errorMessage(result.reason, "unknown error") } : null))
        .filter((entry): entry is { name: string; reason: string } => entry !== null);
      onDone(
        `${ok} document${ok === 1 ? "" : "s"} uploaded and queued for processing.` +
          (failed.length ? ` ${failed.length} failed — ${failed.slice(0, 4).map((entry) => `${entry.name}: ${entry.reason}`).join("; ")}.` : ""),
      );
    } catch (cause) {
      setError(errorMessage(cause, "Could not process these files."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={section === "suppliers" ? "Bulk upload suppliers" : "Upload knowledge documents"}
      hint="Files stay private until reviewed and promoted."
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} style={btnStyle("neutral")}>
            Cancel
          </button>
          <button disabled={busy || !files.length} onClick={() => void submit()} style={btnStyle(files.length ? "success" : "neutral")}>
            {files.length ? `Upload ${files.length} file${files.length === 1 ? "" : "s"}` : "Upload files"}
          </button>
        </>
      }
    >
      {section === "knowledge" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <Field label="Domain">
            <select value={domain} onChange={(event) => setDomain(event.target.value)} style={{ ...inputStyle, background: "#fff" }}>
              {KNOWLEDGE_DOMAINS.map((entry) => (
                <option key={entry} value={entry}>
                  {label(entry)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Visibility">
            <select value={visibility} onChange={(event) => setVisibility(event.target.value)} style={{ ...inputStyle, background: "#fff" }}>
              <option value="operator-only">Operator-only</option>
              <option value="buyer-safe">Buyer-safe</option>
            </select>
          </Field>
        </div>
      )}
      <label
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          border: "1.5px dashed #c9d0da",
          borderRadius: 10,
          padding: "26px 16px",
          cursor: "pointer",
          textAlign: "center",
          background: "#f9fafb",
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Choose files to upload</span>
        <span style={{ fontSize: 12, color: C.faint }}>{meta.uploadAccept}</span>
        <input
          type="file"
          multiple
          accept={meta.uploadAcceptAttr}
          onChange={(event) => setFiles(Array.from(event.target.files || []))}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        />
      </label>
      {files.length > 0 && (
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((file, index) => (
            <li key={index} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, background: "#f6f8fa", borderRadius: 7, padding: "7px 10px" }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
              <span style={{ color: C.faint }}>{formatBytes(file.size)}</span>
              <button
                aria-label="Remove file"
                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                style={{ border: "none", background: "none", color: C.danger, cursor: "pointer" }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </ModalShell>
  );
}

type InvoiceFormSeed = {
  description: string;
  buyerProfileId: string;
  rfqCaseId: string | null;
  orderId: string | null;
  amount: string;
  notes: string;
  phase?: "sample" | "bulk";
};

function InvoiceFormModal({ seed, onClose, onDone }: { seed: InvoiceFormSeed; onClose: () => void; onDone: (message: string) => void }) {
  const [form, setForm] = useState(seed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));

  function set<K extends keyof InvoiceFormSeed>(key: K, value: InvoiceFormSeed[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const unitAmountCents = Math.round((parseFloat(form.amount) || 0) * 100);
      if (!form.phase && !form.buyerProfileId.trim()) throw new Error("A buyer profile ID is required.");
      if (unitAmountCents <= 0) throw new Error("Enter an invoice amount in USD.");
      const items = [{ description: form.description.trim() || "Sourcing services", quantity: 1, unitAmountCents, taxAmountCents: 0 }];
      if (form.phase && form.rfqCaseId) {
        await createIntoolsRfqPhaseInvoice(form.rfqCaseId, form.phase, { dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null, notes: form.notes.trim() || null, items });
      } else {
        await createIntoolsInvoice({ buyerProfileId: form.buyerProfileId.trim(), rfqCaseId: form.rfqCaseId, orderId: form.orderId, dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null, notes: form.notes.trim() || null, items });
      }
      onDone(`${form.phase === "sample" ? "Sampling" : "Invoice"} invoice created — review and send it from the Invoices queue.`);
    } catch (cause) {
      setError(errorMessage(cause, "Could not create this invoice."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={form.phase === "sample" ? "Create sampling invoice" : "Generate invoice"}
      hint={form.phase === "sample" ? "The selected buyer quote is required. Server-side lifecycle checks determine eligibility." : "Prefilled from the linked record — edit anything before creating. Totals and eligibility are server-computed."}
      width={520}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} style={btnStyle("neutral")}>
            Cancel
          </button>
          <button disabled={busy} onClick={(event) => void submit(event)} style={btnStyle("success")}>
            Create {form.phase === "sample" ? "sampling " : ""}invoice
          </button>
        </>
      }
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Description">
          <input value={form.description} onChange={(event) => set("description", event.target.value)} style={inputStyle} />
        </Field>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Buyer profile ID">
              <input value={form.buyerProfileId} readOnly={Boolean(form.phase)} aria-readonly={Boolean(form.phase)} onChange={(event) => set("buyerProfileId", event.target.value)} style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12.5, background: form.phase ? "#f6f8fa" : "#fff", color: form.phase ? C.dim : C.text }} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Due date (YYYY-MM-DD)">
              <input value={dueDate} onChange={(event) => setDueDate(event.target.value)} style={inputStyle} />
            </Field>
          </div>
        </div>
        <Field label="Amount (USD)">
          <input value={form.amount} inputMode="decimal" onChange={(event) => set("amount", event.target.value)} style={inputStyle} />
        </Field>
        <Field label="Notes">
          <textarea rows={2} value={form.notes} onChange={(event) => set("notes", event.target.value)} style={{ ...inputStyle, height: "auto", padding: "8px 10px", resize: "vertical" }} />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
      </form>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ Toast */

function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#202936",
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        padding: "11px 18px",
        borderRadius: 9,
        boxShadow: "0 12px 30px rgba(0,0,0,.22)",
        zIndex: 60,
      }}
    >
      {message}
    </div>
  );
}

/* ------------------------------------------------------------------ Access gate */

function AccessDenied({
  kind = "permission",
  localLogin = false,
  onLoggedIn,
}: {
  kind?: "permission" | "error";
  localLogin?: boolean;
  onLoggedIn?: () => void;
}) {
  const permission = kind === "permission";
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setLoginError("");
    try {
      await loginLocalIntools(credentials.username, credentials.password);
      onLoggedIn?.();
    } catch (cause) {
      setLoginError(errorMessage(cause, "Local administrator sign-in failed."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      id="main-content"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: C.page,
        fontFamily: "'DM Sans', Arial, sans-serif",
      }}
    >
      <div style={{ width: "min(520px, 100%)", padding: 32, textAlign: "center", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>
          {permission ? "Intools access required" : "Intools is unavailable"}
        </h1>
        <p style={{ marginTop: 10, color: C.dim, lineHeight: 1.6 }}>
          {permission
            ? "This private workspace is available to confirmed Atelix administrators only."
            : "The workspace could not load. Try again or return to sign in."}
        </p>
        {localLogin && (
          <form onSubmit={submit} style={{ marginTop: 16, textAlign: "left", display: "grid", gap: 12 }}>
            <Field label="Local admin username">
              <input
                required
                autoComplete="username"
                value={credentials.username}
                onChange={(event) => setCredentials((value) => ({ ...value, username: event.target.value }))}
                style={inputStyle}
              />
            </Field>
            <Field label="Local admin password">
              <input
                required
                type="password"
                autoComplete="current-password"
                value={credentials.password}
                onChange={(event) => setCredentials((value) => ({ ...value, password: event.target.value }))}
                style={inputStyle}
              />
            </Field>
            {loginError && <Notice tone="danger">{loginError}</Notice>}
            <button type="submit" disabled={busy} style={btnStyle("primary")}>
              Sign in locally
            </button>
          </form>
        )}
        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
          {permission && !localLogin && (
            <button onClick={() => navigate("/sign-in?next=%2Fintools")} style={btnStyle("primary")}>
              Sign in
            </button>
          )}
          {!permission && (
            <button onClick={() => location.reload()} style={btnStyle("primary")}>
              Try again
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ routing */

type IntoolsRoute = { section: Section; id: string | null };

function parseIntoolsRoute(pathname = location.pathname): IntoolsRoute {
  if (pathname === "/intools" || pathname === "/intools/") return { section: "analytics", id: null };
  const rfq = /^\/intools\/rfq(?:\/([^/]+))?$/.exec(pathname);
  if (rfq) return { section: "requests", id: rfq[1] ? decodeURIComponent(rfq[1]) : null };
  const match = /^\/intools\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);
  if (match) {
    const raw = match[1];
    const section = (NAV_ORDER as string[]).includes(raw) ? (raw as Section) : "analytics";
    return { section, id: match[2] ? decodeURIComponent(match[2]) : null };
  }
  return { section: "analytics", id: null };
}

function sectionPath(section: Section, id?: string | null) {
  const base = `/intools/${section}`;
  return id ? `${base}/${encodeURIComponent(id)}` : base;
}

/* ------------------------------------------------------------------ detail router */

function DetailRouter({
  section,
  id,
  onClose,
  onChanged,
  onGenerateInvoice,
}: {
  section: GenericSection;
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onGenerateInvoice: (seed: InvoiceFormSeed) => void;
}) {
  const [rowCache, setRowCache] = useState<Row | null>(null);
  useEffect(() => {
    if (section === "requests" || section === "audit") {
      void loadRows(section)
        .then((rows) => setRowCache(rows.find((row) => row.id === id) || null))
        .catch(() => setRowCache(null));
    }
  }, [section, id]);

  if (section === "invoices") return <InvoiceDrawerBody id={id} onClose={onClose} onChanged={onChanged} />;
  if (section === "orders")
    return (
      <OrderDrawerBody
        orderNo={id}
        onClose={onClose}
        onChanged={onChanged}
        onCreateInvoice={(input) =>
          onGenerateInvoice({
            description: input.description,
            buyerProfileId: input.buyerProfileId,
            rfqCaseId: input.rfqCaseId,
            orderId: input.orderId,
            amount: input.amount,
            notes: `Generated from order ${id}`,
          })
        }
      />
    );
  if (section === "suppliers") return <SupplierDrawerBody id={id} onClose={onClose} onChanged={onChanged} />;
  if (section === "registrations") return <RegistrationDrawerBody id={id} onClose={onClose} onChanged={onChanged} />;
  if (section === "knowledge") return <KnowledgeDrawerBody id={id} onClose={onClose} onChanged={onChanged} />;
  if (section === "requests") {
    if (!rowCache)
      return (
        <DrawerShell title="Request" subtitle={id} onClose={onClose}>
          <SkeletonRows />
        </DrawerShell>
      );
    return (
      <RequestDrawerBody
        rfq={rowCache}
        onClose={onClose}
        onChanged={onChanged}
        onGenerateInvoice={(input) =>
          onGenerateInvoice({
            description: input.description,
            buyerProfileId: input.buyerProfileId,
            rfqCaseId: input.rfqCaseId,
            orderId: null,
            amount: input.amount,
            notes: `Generated from ${rowCache.title}`,
            phase: input.phase,
          })
        }
      />
    );
  }
  if (section === "audit") {
    if (!rowCache)
      return (
        <DrawerShell title="Audit entry" subtitle={id} onClose={onClose}>
          <SkeletonRows />
        </DrawerShell>
      );
    return <AuditDrawerBody row={rowCache} onClose={onClose} />;
  }
  return null;
}

/* ------------------------------------------------------------------ shell */

export function Intools() {
  const [, bump] = useState(0);
  const forceRoute = useCallback(() => bump((value) => value + 1), []);
  const route = parseIntoolsRoute();

  const [access, setAccess] = useState<"loading" | "allowed" | "permission" | "error">("loading");
  const [ready, setReady] = useState(false);
  const [localLogin, setLocalLogin] = useState(false);
  const [operatorName, setOperatorName] = useState("");
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth < 960);
  const [toast, setToast] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal] = useState<
    | { kind: "supplierForm" }
    | { kind: "upload"; section: "suppliers" | "knowledge" }
    | { kind: "invoiceForm"; seed: InvoiceFormSeed }
    | null
  >(null);
  const [pendingBadges, setPendingBadges] = useState<Partial<Record<Section, number>>>({});
  const reloadRef = useRef<() => void>(() => {});

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3400);
  }, []);

  useEffect(() => {
    const listener = () => forceRoute();
    addEventListener("popstate", listener);
    return () => removeEventListener("popstate", listener);
  }, [forceRoute]);

  useEffect(() => {
    if (location.pathname === "/intools") { navigate("/intools/analytics"); return; }
    // Retired route: content already renders as Requests via parseIntoolsRoute,
    // but the address bar must also move so reload/share links land on the
    // canonical path per the documented redirect contract.
    const rfqAlias = /^\/intools\/rfq(?:\/([^/]+))?$/.exec(location.pathname);
    if (rfqAlias) navigate(sectionPath("requests", rfqAlias[1] ? decodeURIComponent(rfqAlias[1]) : null));
  }, []);

  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const meta = existing || document.createElement("meta");
    const previous = meta.content;
    meta.name = "robots";
    meta.content = "noindex,nofollow,noarchive";
    if (!existing) document.head.appendChild(meta);
    return () => {
      if (existing) existing.content = previous;
      else meta.remove();
    };
  }, []);

  const refreshBadges = useCallback(() => {
    void listIntoolsRegistrationRequests("pending_review")
      .then((rows) => setPendingBadges((current) => ({ ...current, registrations: rows.length })))
      .catch(() => {});
    void listIntoolsAgentKnowledge("failed", null)
      .then((rows) => setPendingBadges((current) => ({ ...current, knowledge: rows.length })))
      .catch(() => {});
    void getIntoolsBuyerUnreadCount()
      .then((next) => setPendingBadges((current) => ({ ...current, messages: next.unread_count })))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const local = await getLocalIntoolsSession();
      if (!active) return;
      if (local.authenticated) {
        setOperatorName("Local administrator");
        setReady(true);
        setAccess("allowed");
        refreshBadges();
        return;
      }
      if (local.available) {
        setReady(true);
        setLocalLogin(true);
        setAccess("permission");
        return;
      }
      const session = await getSession();
      if (!active) return;
      if (!session) {
        setReady(true);
        setAccess("permission");
        return;
      }
      await assertIntoolsAdmin();
      if (!active) return;
      setOperatorName(await getUserDisplayName(session.user));
      setReady(true);
      setAccess("allowed");
      refreshBadges();
    })().catch(() => {
      if (active) setAccess("error");
    });
    return () => {
      active = false;
    };
  }, [refreshBadges]);

  const selectSection = useCallback((next: Section) => {
    navigate(sectionPath(next));
  }, []);

  const closeDetail = useCallback(() => {
    navigate(sectionPath(route.section));
  }, [route.section]);

  const afterMutation = useCallback(() => {
    setRefreshKey((value) => value + 1);
    reloadRef.current();
    refreshBadges();
  }, [refreshBadges]);

  if (access === "permission")
    return (
      <AccessDenied
        localLogin={localLogin}
        onLoggedIn={() => {
          setLocalLogin(false);
          setReady(true);
          setAccess("allowed");
          refreshBadges();
        }}
      />
    );
  if (access === "error" && !ready) return <AccessDenied kind="error" />;
  if (!ready || access === "loading")
    return (
      <main id="main-content" style={{ minHeight: "100vh", padding: 24, background: C.page }}>
        <SkeletonRows />
      </main>
    );

  const section = route.section;
  const isGeneric = section !== "analytics" && section !== "messages" && section !== "settings";
  const meta = isGeneric ? SECTIONS[section as GenericSection] : null;

  return (
    <ThemeProvider theme={intoolsTheme}>
      <div
        className="intools-root"
        style={{
          display: "flex",
          height: "100dvh",
          width: "100%",
          fontFamily: "'DM Sans', Arial, sans-serif",
          color: C.text,
          background: C.page,
          overflow: "hidden",
        }}
      >
        <Sidebar
          active={section}
          collapsed={collapsed}
          onToggle={() => setCollapsed((value) => !value)}
          onSelect={selectSection}
          operatorName={operatorName}
          badges={pendingBadges}
        />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100%" }}>
          <header
            style={{
              height: 60,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 16,
              padding: "0 24px",
              background: "#fff",
              borderBottom: "1px solid #e6e9ee",
            }}
          >
            <button
              aria-label="Back to dashboard"
              onClick={() => navigate("/dashboard")}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                border: 0,
                background: "transparent",
                cursor: "pointer",
                color: "#45556b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 11.5 12 4l8 7.5" />
                <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
              </svg>
            </button>
            <NotificationBell mode="intools" onNavigate={navigate} />
            <div
              aria-hidden="true"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#e5e7eb",
                color: "#45556b",
                fontSize: 12,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {initialsOf(operatorName || "Administrator")}
            </div>
          </header>

          <main id="main-content" style={{ flex: 1, overflowY: "auto", padding: "24px clamp(14px, 4vw, 32px) 60px" }}>
            <div style={{ maxWidth: 1180, margin: "0 auto" }}>
              <div
                style={{
                  display: meta ? "flex" : "none",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                  marginBottom: 18,
                }}
              >
                <div>
                  <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
                    {meta ? meta.label : SECTION_LABEL[section]}
                  </h1>
                  <p style={{ margin: "6px 0 0", color: C.dim, fontSize: 14, maxWidth: 560 }}>
                    {meta?.description}
                  </p>
                </div>
                {meta && meta.primaryActions.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {meta.primaryActions.map((action) => (
                      <button
                        key={action.key}
                        onClick={() => {
                          if (action.key === "new" && section === "suppliers") setModal({ kind: "supplierForm" });
                          else if (action.key === "upload" && (section === "suppliers" || section === "knowledge"))
                            setModal({ kind: "upload", section });
                          else dispatchEvent(new CustomEvent("intools:primary", { detail: { section, key: action.key } }));
                        }}
                        style={{
                          height: 38,
                          padding: "0 16px",
                          borderRadius: 9,
                          border: "1px solid #334256",
                          background: "#334256",
                          color: "#fff",
                          fontSize: 13.5,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {section === "analytics" && <IntoolsAnalytics />}
              {section === "settings" && <MasterSettingsView onToast={showToast} />}
              {section === "messages" && (
                <RfqOpsMessagesWorkspace
                  mode="intools"
                  selectedCaseId={route.id}
                  onSelectCase={(id) => navigate(sectionPath("messages", id))}
                  unreadCount={pendingBadges.messages ?? null}
                  onUnreadCount={refreshBadges}
                />
              )}
              {isGeneric && (
                <SectionListView
                  key={section}
                  section={section as GenericSection}
                  refreshKey={refreshKey}
                  onOpenRow={(row) => navigate(sectionPath(section, row.id))}
                  onToast={showToast}
                  onCreateInvoice={() =>
                    setModal({
                      kind: "invoiceForm",
                      seed: { description: "Sourcing services", buyerProfileId: "", rfqCaseId: null, orderId: null, amount: "", notes: "" },
                    })
                  }
                  onPrimaryModal={() => {}}
                  registerReload={(reload) => {
                    reloadRef.current = reload;
                  }}
                />
              )}
            </div>
          </main>
        </div>

        {route.id && isGeneric && (
          <DetailRouter
            key={`${section}:${route.id}`}
            section={section as GenericSection}
            id={route.id}
            onClose={closeDetail}
            onChanged={afterMutation}
            onGenerateInvoice={(seed) => {
              closeDetail();
              setModal({ kind: "invoiceForm", seed });
            }}
          />
        )}

        {modal?.kind === "supplierForm" && (
          <SupplierFormModal
            onClose={() => setModal(null)}
            onDone={(message) => {
              setModal(null);
              showToast(message);
              afterMutation();
            }}
          />
        )}
        {modal?.kind === "upload" && (
          <UploadModal
            section={modal.section}
            onClose={() => setModal(null)}
            onDone={(message) => {
              setModal(null);
              showToast(message);
              afterMutation();
            }}
          />
        )}
        {modal?.kind === "invoiceForm" && (
          <InvoiceFormModal
            seed={modal.seed}
            onClose={() => setModal(null)}
            onDone={(message) => {
              setModal(null);
              showToast(message);
              navigate(sectionPath("invoices"));
              afterMutation();
            }}
          />
        )}

        {toast && <Toast message={toast} />}
      </div>
    </ThemeProvider>
  );
}
