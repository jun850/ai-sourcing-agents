import { createClient, type Session, type User } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
export const isSupabaseConfigured = Boolean(url && publishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // AuthCallback exchanges the code manually; auto-detection would race it and consume the single-use code first.
        detectSessionInUrl: false,
      },
    })
  : null;

export type WorkspaceRfq = {
  id: string;
  case_no: string;
  title: string;
  brief: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  last_saved_at: string;
};
export type LegacyWorkspaceRfqQuote = {
  id: string;
  factory_id: string | null;
  supplier_name: string;
  supplier_region: string | null;
  unit_price_cents: number;
  quote_total_cents: number | null;
  quantity: number | null;
  moq: number | null;
  lead_days: number | null;
  certifications: string[];
  quote_notes: string | null;
  status: "suggested" | "selected" | "approved" | "rejected";
  recommended: boolean;
  verified: boolean;
  updated_at: string;
};
export type WorkspaceRfqDecision = {
  case: WorkspaceRfq & { selected_match_id: string | null; accepted_at: string | null };
  quotes: LegacyWorkspaceRfqQuote[];
  invoice_id: string | null;
  invoice_no: string | null;
  order_no: string | null;
  invoice_status: WorkspaceInvoiceStatus | null;
};
export type WorkspaceChatMessage = {
  id: string;
  role: "buyer" | "agent" | "system";
  content: string;
  created_at: string;
};
export type WorkspaceProduct = {
  id: string;
  sku: string;
  name: string;
  supplier: string;
  unit_price: number;
  units: number;
  line_total: number;
  order_id: string;
  order_no: string;
  order_status: string;
  placed_at: string | null;
  rfq_case_id: string | null;
};
export type WorkspaceInvoiceStatus = "draft" | "sent" | "paid" | "cancelled" | "overdue";
export type WorkspaceInvoice = {
  id: string;
  invoice_no: string;
  status: "draft" | "sent" | "paid" | "cancelled";
  effective_status: WorkspaceInvoiceStatus;
  currency: "usd";
  total_cents: number;
  balance_cents: number;
  due_date: string | null;
  created_at: string;
  rfq_case_id: string | null;
};
export type WorkspaceInvoiceItem = {
  id?: string;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  tax_amount_cents: number;
  line_total_cents: number;
};
export type WorkspaceInvoicePayment = {
  id?: string;
  provider: string;
  reference: string | null;
  amount_cents: number;
  recorded_at: string;
};
export type WorkspaceInvoiceDetail = WorkspaceInvoice & {
  notes: string | null;
  items: WorkspaceInvoiceItem[];
  payments: WorkspaceInvoicePayment[];
};
export type RfqAttachment = {
  id: string;
  rfq_case_id: string;
  storage_path: string;
  original_name: string;
  content_type: string;
  byte_size: number;
  created_at: string;
};
export type WorkspaceRfqQuote = {
  id: string;
  status: "published" | "selected" | "declined";
  unit_price_cents: number;
  moq: number;
  lead_time_days: number;
  certifications: string[];
  certification_note: string | null;
  recommended: boolean;
  selected_at: string | null;
  factory_id: string;
  factory_name: string;
  factory_region: string | null;
  factory_years: number | null;
};
export type WorkspaceRfqProduction = {
  quote: { id: string; unit_price_cents: number; moq: number; lead_time_days: number; selected_at: string | null; factory_name: string; factory_region: string | null } | null;
  order: { id: string; order_no: string; status: string; total: number; placed_at: string | null; production_stage: string | null } | null;
  invoice: { id: string; invoice_no: string; status: string; effective_status: string; total_cents: number; balance_cents: number; due_date: string | null } | null;
};
export type IntoolsInvoiceStatus =
  "draft" | "sent" | "paid" | "cancelled" | "overdue";
export type IntoolsInvoice = {
  id: string;
  invoice_no: string;
  status: "draft" | "sent" | "paid" | "cancelled";
  effective_status: IntoolsInvoiceStatus;
  currency: "usd";
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  balance_cents: number;
  due_date: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  rfq_case_no: string | null;
  order_no: string | null;
  created_at: string;
  updated_at: string;
};
export type IntoolsInvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  tax_amount_cents: number;
  line_total_cents: number;
};
export type IntoolsInvoiceAudit = {
  id: string;
  action: string;
  summary: string | null;
  admin_name: string | null;
  created_at: string;
};
export type IntoolsInvoicePayment = {
  id: string;
  amount_cents: number;
  provider: string;
  reference: string | null;
  recorded_at: string;
};
export type IntoolsInvoiceDetail = IntoolsInvoice & {
  notes: string | null;
  items: IntoolsInvoiceItem[];
  payments: IntoolsInvoicePayment[];
  audit: IntoolsInvoiceAudit[];
};
export type IntoolsRegistrationRequest = {
  id: string;
  name: string;
  email: string;
  company_name: string;
  sourcing: string;
  annual_revenue: string;
  phone: string | null;
  country_code: string | null;
  status: "pending_review" | "approved" | "declined" | "invited";
  reviewed_by: string | null;
  reviewed_at: string | null;
  invitation_requested_at: string | null;
  created_at: string;
  updated_at: string;
};
export type IntoolsRfq = {
  id: string;
  case_no: string;
  title: string;
  status: string;
  buyer_name: string | null;
  buyer_email: string | null;
  quote_count: number;
  selected_supplier: string | null;
  invoice_no: string | null;
  updated_at: string;
  created_at: string;
};
export type IntoolsRfqDetail = WorkspaceRfqDecision & {
  buyer_name: string | null;
  buyer_email: string | null;
};
export type LegacyIntoolsRfqQuotePayload = {
  factoryId?: string | null;
  supplierName: string;
  supplierRegion?: string | null;
  unitPriceCents: number;
  quoteTotalCents?: number | null;
  quantity?: number | null;
  moq?: number | null;
  leadDays?: number | null;
  certifications?: string[];
  quoteNotes?: string | null;
  recommended?: boolean;
};
export type IntoolsOrder = {
  id: string;
  order_no: string;
  status: string;
  buyer_name: string | null;
  buyer_email: string | null;
  item_count: number;
  total: number;
  placed_at: string | null;
  payment_declared_at?: string | null;
  payment_verified_at?: string | null;
};
export type IntoolsOrderItem = {
  name: string | null;
  seller: string | null;
  sku: string | null;
  unit_price: number | null;
  qty: number | null;
  line_total: number | null;
  option_selection: string | null;
  buyer_note: string | null;
};
export type IntoolsOrderFulfillment = {
  factory_name: string | null;
  fulfillment_status: string | null;
  tracking: string | null;
};
export type IntoolsOrderEvent = {
  status: string;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
};
export type IntoolsOrderDetail = {
  id: string;
  order_no: string;
  status: string;
  subtotal: number | null;
  fee: number | null;
  ship: number | null;
  qc_fee: number | null;
  ins_fee: number | null;
  total: number | null;
  ship_country: string | null;
  ship_address: string | null;
  shipping_service: string | null;
  shipping_eta_min_days: number | null;
  shipping_eta_max_days: number | null;
  incoterms: string | null;
  notes: string | null;
  placed_at: string | null;
  payment_declared_at: string | null;
  payment_verified_at: string | null;
  buyer: {
    full_name: string | null;
    email: string | null;
    company_name: string | null;
    country: string | null;
  };
  items: IntoolsOrderItem[];
  fulfillments: IntoolsOrderFulfillment[];
  events: IntoolsOrderEvent[];
};
export type IntoolsSupplier = {
  id: string;
  slug: string;
  name: string;
  type: string;
  region: string | null;
  loc: string | null;
  verify_state: "unverified" | "pending" | "verified";
  years: number | null;
  moq: string | null;
  lead: string | null;
  capacity: string | null;
  certs: string[] | null;
  tags: string[] | null;
  sales: string | null;
  phone: string | null;
  web: string | null;
  founded: number | null;
  employees: string | null;
  area: string | null;
  port: string | null;
  bio: string | null;
  img: string | null;
  logo_img?: string | null;
  page_img?: string | null;
  copy_i18n?: Record<string, unknown>;
  owner_profile_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  product_count?: number;
  source_system?: string | null;
  source_record_id?: string | null;
  source_reference?: string | null;
  provenance_url?: string | null;
  provenance_sha256?: string | null;
  provenance_captured_at?: string | null;
  source_payload?: Record<string, unknown>;
  broker_status?: "review" | "approved" | "rejected" | "archived";
  curation_locked?: boolean;
  broker_reviewed_by?: string | null;
  broker_reviewed_at?: string | null;
  imported_at?: string | null;
};
export type IntoolsSupplierProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  listing_status: string;
  is_private?: boolean;
};
export type IntoolsSupplierRfq = {
  id: string;
  rfq_case_id: string;
  case_no?: string | null;
  title?: string | null;
  product_id?: string | null;
  status: string;
  sent_at: string;
  last_activity_at: string;
};
export type IntoolsSupplierProvenance = {
  field_name: string;
  source_url: string | null;
  value_origin: string;
  observed_at: string;
};
export type IntoolsSupplierSourceContact = {
  contact_type: string;
  normalized_value: string;
  source_url: string | null;
  validation_status: string;
  usage_status?: string;
  outreach_allowed?: boolean;
};
export type IntoolsSupplierDetail = IntoolsSupplier & {
  products: IntoolsSupplierProduct[];
  rfq_associations: IntoolsSupplierRfq[];
  provenance: IntoolsSupplierProvenance[];
  source_contacts: IntoolsSupplierSourceContact[];
  audit: IntoolsInvoiceAudit[];
  intake?: Record<string, unknown> | null;
};
export type IntoolsSupplierPayload = Partial<
  Pick<
    IntoolsSupplier,
    | "slug"
    | "name"
    | "type"
    | "region"
    | "loc"
    | "verify_state"
    | "years"
    | "moq"
    | "lead"
    | "capacity"
    | "certs"
    | "tags"
    | "sales"
    | "phone"
    | "web"
    | "founded"
    | "employees"
    | "area"
    | "port"
    | "bio"
    | "img"
    | "logo_img"
    | "page_img"
    | "owner_profile_id"
  >
> & { copy_i18n?: Record<string, unknown> };
export type IntoolsSupplierImportInput = {
  source_system: string;
  source_record_id: string;
  source_url?: string | null;
  supplier: IntoolsSupplierPayload;
  provenance?: Array<Record<string, unknown>>;
};
export type IntoolsSupplierImportRow = IntoolsSupplierImportInput & {
  row_number: number;
};
export type IntoolsSupplierImportResult = {
  run_id: string;
  status: string;
  rows: Array<{
    row_number: number;
    status: "accepted" | "rejected" | "ambiguous" | "promoted" | "failed";
    source_record_id: string;
    supplier_id?: string | null;
    candidate_ids?: string[];
    errors?: Array<{ path: string; message: string }>;
  }>;
};
export type IntoolsInvoiceItemPayload = {
  description: string;
  quantity: number;
  unitAmountCents: number;
  taxAmountCents: number;
};
export type IntoolsCreateInvoicePayload = {
  buyerProfileId: string;
  rfqCaseId?: string | null;
  orderId?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  items: IntoolsInvoiceItemPayload[];
};
export type IntoolsUpdateInvoicePayload = Omit<
  IntoolsCreateInvoicePayload,
  "buyerProfileId"
> & { buyerProfileId?: string };
export type IntoolsManualPaymentPayload = {
  amountCents: number;
  reference?: string | null;
};
type RegistrationPayload = {
  name: string;
  email: string;
  companyName: string;
  sourcing: string;
  annualRevenue: string;
  phone?: string;
  countryCode?: string;
};
type SupplierIntakePayload = Record<string, unknown>;

function client() {
  if (!supabase)
    throw new Error("Supabase is not configured for this environment.");
  return supabase;
}
function rpcError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await client().auth.getSession();
  rpcError(error);
  return data.session;
}
export async function getUserDisplayName(user: User): Promise<string> {
  const { data } = await client()
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const profileName = typeof data?.full_name === "string" ? data.full_name.trim() : "";
  if (profileName) return profileName;
  const metadata = user.user_metadata;
  const metadataName = [metadata.full_name, metadata.name, metadata.preferred_username]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (metadataName) return metadataName.trim();
  return user.email?.split("@")[0] || "Administrator";
}
export async function signInWithMagicLink(email: string, redirectTo: string) {
  const { error } = await client().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  rpcError(error);
}
export async function signOut() {
  const { error } = await client().auth.signOut();
  rpcError(error);
}
export async function signUpForReview(payload: RegistrationPayload) {
  const { data, error } = await client().rpc("submit_registration_request", {
    p_payload: payload,
  });
  rpcError(error);
  return data as string;
}
export async function submitSupplierIntake(payload: SupplierIntakePayload) {
  const { data, error } = await client().rpc("submit_supplier_intake", {
    p_payload: payload,
  });
  rpcError(error);
  return data as string;
}
export async function listRfqCases() {
  const { data, error } = await client()
    .from("atelix_rfq_workspace")
    .select("*")
    .order("updated_at", { ascending: false });
  rpcError(error);
  return (data ?? []) as WorkspaceRfq[];
}
export async function createRfqCase(input: {
  title: string;
  brief: Record<string, unknown>;
}) {
  const { data, error } = await client().rpc("create_workspace_rfq", {
    p_title: input.title,
    p_brief: input.brief,
  });
  rpcError(error);
  return data as WorkspaceRfq;
}
export async function updateRfqCase(
  id: string,
  input: { title: string; brief: Record<string, unknown>; status?: string },
) {
  const { data, error } = await client().rpc("update_workspace_rfq", {
    p_case_id: id,
    p_title: input.title,
    p_brief: input.brief,
    p_status: input.status ?? null,
  });
  rpcError(error);
  return data as WorkspaceRfq;
}
export async function listRfqAttachments(caseId: string) {
  const { data, error } = await client()
    .from("rfq_attachments")
    .select("*")
    .eq("rfq_case_id", caseId)
    .order("created_at");
  rpcError(error);
  return (data ?? []) as RfqAttachment[];
}
export async function listRfqMessages(caseId: string) {
  const { data, error } = await client().rpc("workspace_list_rfq_messages", {
    p_case_id: caseId,
  });
  rpcError(error);
  return (data ?? []) as WorkspaceChatMessage[];
}
export async function addRfqMessage(caseId: string, content: string) {
  const { data, error } = await client().rpc("workspace_add_rfq_message", {
    p_case_id: caseId,
    p_content: content,
  });
  rpcError(error);
  return (data ?? []) as WorkspaceChatMessage[];
}
export async function listWorkspaceProducts() {
  const { data, error } = await client().rpc("workspace_list_products");
  rpcError(error);
  return (data ?? []) as WorkspaceProduct[];
}
export async function getWorkspaceProduct(itemId: string) {
  const { data, error } = await client().rpc("workspace_get_product", {
    p_item_id: itemId,
  });
  rpcError(error);
  return data as WorkspaceProduct | null;
}
export async function uploadRfqAttachment(caseId: string, file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
      file.type,
    ) ||
    file.size > 25 * 1024 * 1024
  )
    throw new Error("Use a JPG, PNG, WebP, or PDF up to 25 MB.");
  const session = await getSession();
  if (!session) throw new Error("Sign in to attach files to an RFQ.");
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
  const path = `${session.user.id}/${caseId}/${crypto.randomUUID()}/${safeName}`;
  const storage = client().storage.from("rfq-attachments");
  const { error: uploadError } = await storage.upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  rpcError(uploadError);
  const { data, error } = await client().rpc("record_rfq_attachment", {
    p_case_id: caseId,
    p_storage_path: path,
    p_original_name: file.name,
    p_content_type: file.type,
    p_byte_size: file.size,
  });
  if (error) {
    await storage.remove([path]);
    rpcError(error);
  }
  return data as RfqAttachment;
}

export async function listWorkspaceInvoices() {
  const { data, error } = await client().rpc("workspace_list_invoices");
  rpcError(error);
  return (data ?? []) as WorkspaceInvoice[];
}
export async function getWorkspaceRfqDecision(caseId: string) {
  const { data, error } = await client().rpc("workspace_get_rfq_decision", {
    p_case_id: caseId,
  });
  rpcError(error);
  return data as WorkspaceRfqDecision;
}
export async function selectWorkspaceRfqSupplier(caseId: string, matchId: string) {
  const { data, error } = await client().rpc("workspace_select_rfq_supplier", {
    p_case_id: caseId,
    p_match_id: matchId,
  });
  rpcError(error);
  return data as WorkspaceRfqDecision;
}
export async function getWorkspaceInvoiceDetail(invoiceId: string) {
  const { data, error } = await client().rpc("workspace_get_invoice_detail", {
    p_invoice_id: invoiceId,
  });
  rpcError(error);
  return data as WorkspaceInvoiceDetail;
}
export async function startWorkspaceInvoiceCheckout(invoiceIds: string[]) {
  if (!invoiceIds.length) throw new Error("Select at least one invoice to pay.");
  const { data, error } = await client().functions.invoke("stripe-checkout", {
    body: { kind: "invoices", invoiceIds },
  });
  rpcError(error);
  if (!data || typeof data.url !== "string" || !data.url) {
    throw new Error("The payment page could not be created.");
  }
  return data as { url: string; environment?: string; amountCents?: number; discountCents?: number };
}

export async function listWorkspaceRfqQuotes(caseId: string) {
  const { data, error } = await client().rpc("workspace_list_rfq_quotes", { p_case_id: caseId });
  rpcError(error);
  return (data ?? []) as WorkspaceRfqQuote[];
}
export async function selectWorkspaceRfqQuote(quoteId: string) {
  const { data, error } = await client().rpc("workspace_select_rfq_quote", { p_quote_id: quoteId });
  rpcError(error);
  return data as WorkspaceRfqQuote;
}
export async function getWorkspaceRfqProduction(caseId: string) {
  const { data, error } = await client().rpc("workspace_get_rfq_production", { p_case_id: caseId });
  rpcError(error);
  return (data ?? { quote: null, order: null, invoice: null }) as WorkspaceRfqProduction;
}
export type WorkspaceSelectedSupplier = { rfq_case_id: string; factory_name: string; factory_region: string | null };
export async function listWorkspaceSelectedSuppliers() {
  const { data, error } = await client().rpc("workspace_list_selected_suppliers");
  rpcError(error);
  return (data ?? []) as WorkspaceSelectedSupplier[];
}

async function intoolsRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (localIntoolsAdmin) {
    const response = await fetch("/api/intools/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ name, args }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        typeof payload?.error === "string"
          ? payload.error
          : "Intools unavailable.",
      );
    return payload as T;
  }
  const { data, error } = await client().rpc(name, args);
  rpcError(error);
  return data as T;
}

let localIntoolsAdmin = false;
export async function getLocalIntoolsSession() {
  try {
    const response = await fetch("/api/intools/session", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.status === 404)
      return { available: false, authenticated: false };
    const payload = await response.json().catch(() => ({}));
    localIntoolsAdmin = response.ok && payload.localAdmin === true;
    return { available: true, authenticated: localIntoolsAdmin };
  } catch {
    return { available: false, authenticated: false };
  }
}
export async function loginLocalIntools(username: string, password: string) {
  const response = await fetch("/api/intools/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ username, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.localAdmin !== true)
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : "Local administrator sign-in failed.",
    );
  localIntoolsAdmin = true;
}

export async function listIntoolsInvoices(status: string | null = null) {
  return intoolsRpc<IntoolsInvoice[]>("intools_list_invoices", {
    p_status: status,
  });
}
export async function listIntoolsRfqs(status: string | null = null) {
  return intoolsRpc<IntoolsRfq[]>("intools_list_rfq_cases", {
    p_status: status,
  });
}
export async function getIntoolsRfqDetail(caseId: string) {
  return intoolsRpc<IntoolsRfqDetail>("intools_get_rfq_case_detail", {
    p_case_id: caseId,
  });
}
export async function updateIntoolsRfqStatus(caseId: string, status: string, note: string | null) {
  return intoolsRpc<IntoolsRfqDetail>("intools_update_rfq_status", {
    p_case_id: caseId,
    p_status: status,
    p_note: note,
  });
}
export async function saveIntoolsRfqQuote(caseId: string, matchId: string | null, payload: LegacyIntoolsRfqQuotePayload) {
  return intoolsRpc<IntoolsRfqDetail>("intools_upsert_rfq_quote", {
    p_case_id: caseId,
    p_match_id: matchId,
    p_payload: payload,
  });
}
export async function listIntoolsRegistrationRequests(status: string | null = "pending_review") {
  return intoolsRpc<IntoolsRegistrationRequest[]>("intools_list_registration_requests", {
    p_status: status,
  });
}
export async function assertIntoolsAdmin() {
  const { error } = await client().rpc("intools_assert_admin");
  rpcError(error);
}
export async function approveRegistrationRequest(requestId: string) {
  return intoolsRpc<IntoolsRegistrationRequest>("approve_registration_request", {
    p_request_id: requestId,
  });
}
export async function listIntoolsSuppliers() {
  return intoolsRpc<IntoolsSupplier[]>("intools_list_suppliers");
}
export async function getIntoolsSupplierDetail(supplierId: string) {
  return intoolsRpc<IntoolsSupplierDetail>("intools_get_supplier_detail", {
    p_supplier_id: supplierId,
  });
}
export async function saveIntoolsSupplier(
  supplierId: string | null,
  payload: IntoolsSupplierPayload,
  expectedUpdatedAt: string | null = null,
) {
  const hasImages = "logo_img" in payload || "page_img" in payload;
  return intoolsRpc<IntoolsSupplier>(
    hasImages ? "intools_save_supplier_with_images" : "intools_save_supplier",
    {
      p_supplier_id: supplierId,
      p_payload: payload,
      p_expected_updated_at: expectedUpdatedAt,
    },
  );
}
export async function archiveIntoolsSupplier(
  supplierId: string,
  expectedUpdatedAt: string,
  restore = false,
) {
  return intoolsRpc<IntoolsSupplier>("intools_archive_supplier", {
    p_supplier_id: supplierId,
    p_expected_updated_at: expectedUpdatedAt,
    p_restore: restore,
  });
}
export async function setIntoolsSupplierBrokerStatus(
  supplierId: string,
  status: "review" | "approved" | "rejected" | "archived",
  curationLocked: boolean | null = null,
) {
  return intoolsRpc<IntoolsSupplier>("intools_set_supplier_broker_status", {
    p_supplier_id: supplierId,
    p_status: status,
    p_curation_locked: curationLocked,
  });
}
export type IntoolsRfqCase = {
  id: string;
  case_no: string;
  title: string;
  brief: Record<string, unknown>;
  status: string;
  buyer_profile_id: string;
  buyer_name: string;
  buyer_email: string;
  match_count: number;
  quote_count: number;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};
export type IntoolsRfqSupplierMatch = {
  id: string;
  factory_id: string;
  status: "suggested" | "selected" | "approved" | "rejected";
  eligibility: Record<string, unknown>;
  score: number;
};
export type IntoolsRfqQuote = {
  id: string;
  status: "draft" | "published" | "selected" | "declined" | "withdrawn";
  unit_price_cents: number;
  moq: number;
  lead_time_days: number;
  certifications: string[];
  certification_note: string | null;
  recommended: boolean;
  notes: string | null;
  selected_at: string | null;
  factory_id: string;
  factory_name: string;
  factory_region: string | null;
};
export type IntoolsRfqQuotePayload = {
  rfqCaseId: string;
  factoryId: string;
  unitPriceCents: number;
  moq: number;
  leadTimeDays: number;
  certifications: string[];
  certificationNote?: string | null;
  recommended?: boolean;
  notes?: string | null;
};
export async function listIntoolsRfqCases(status: string | null = null) {
  return intoolsRpc<IntoolsRfqCase[]>("intools_list_rfq_cases", { p_status: status });
}
export async function generateIntoolsRfqSupplierMatches(rfqCaseId: string) {
  return intoolsRpc<IntoolsRfqSupplierMatch[]>("intools_generate_rfq_supplier_matches", {
    p_case_id: rfqCaseId,
  });
}
export async function setIntoolsRfqSupplierMatchStatus(matchId: string, status: "suggested" | "selected" | "approved" | "rejected") {
  return intoolsRpc<IntoolsRfqSupplierMatch>("intools_set_rfq_supplier_match_status", {
    p_match_id: matchId,
    p_status: status,
  });
}
export async function listIntoolsRfqQuotes(caseId: string) {
  return intoolsRpc<IntoolsRfqQuote[]>("intools_list_rfq_quotes", { p_case_id: caseId });
}
export async function upsertIntoolsRfqQuote(quoteId: string | null, payload: IntoolsRfqQuotePayload) {
  return intoolsRpc<IntoolsRfqQuote>("intools_upsert_rfq_quote", {
    p_quote_id: quoteId,
    p_payload: {
      rfq_case_id: payload.rfqCaseId,
      factory_id: payload.factoryId,
      unit_price_cents: payload.unitPriceCents,
      moq: payload.moq,
      lead_time_days: payload.leadTimeDays,
      certifications: payload.certifications,
      certification_note: payload.certificationNote ?? null,
      recommended: payload.recommended ?? false,
      notes: payload.notes ?? null,
    },
  });
}
export async function publishIntoolsRfqQuote(quoteId: string) {
  return intoolsRpc<IntoolsRfqQuote>("intools_publish_rfq_quote", { p_quote_id: quoteId });
}
export async function declineIntoolsRfqQuote(quoteId: string) {
  return intoolsRpc<IntoolsRfqQuote>("intools_decline_rfq_quote", { p_quote_id: quoteId });
}
export async function confirmIntoolsRfqOrder(input: { caseId: string; quoteId: string; qty: number; shipCountry?: string | null; shipAddress?: string | null; incoterms?: string | null }) {
  return intoolsRpc<{ order_id: string; order_no: string; total: number }>("intools_confirm_rfq_order", {
    p_case_id: input.caseId,
    p_quote_id: input.quoteId,
    p_qty: input.qty,
    p_ship_country: input.shipCountry ?? null,
    p_ship_address: input.shipAddress ?? null,
    p_incoterms: input.incoterms ?? null,
  });
}
export async function getIntoolsRfqOrder(caseId: string) {
  return intoolsRpc<{ id: string; order_no: string; status: string; total: number; placed_at: string | null; production_stage: string | null } | null>("intools_get_rfq_order", { p_case_id: caseId });
}
export async function updateIntoolsOrderProductionStage(orderId: string, stage: string, note?: string | null) {
  return intoolsRpc<{ production_stage: string }>("intools_update_order_production_stage", {
    p_order_id: orderId,
    p_stage: stage,
    p_note: note ?? null,
  });
}
export async function runIntoolsSupplierImportDryRun(
  rows: IntoolsSupplierImportRow[],
  overwrite = false,
) {
  return intoolsRpc<IntoolsSupplierImportResult>(
    "intools_supplier_import_dry_run",
    { p_rows: rows, p_overwrite: overwrite },
  );
}
export async function promoteIntoolsSupplierImportRows(
  runId: string,
  rowNumbers: number[],
  overwrite = false,
) {
  return intoolsRpc<IntoolsSupplierImportResult>(
    "intools_promote_supplier_import_rows",
    { p_run_id: runId, p_row_numbers: rowNumbers, p_overwrite: overwrite },
  );
}
export async function promoteIntoolsSupplierIntake(intakeId: string) {
  return intoolsRpc<IntoolsSupplier>("intools_promote_supplier_intake", {
    p_intake_id: intakeId,
  });
}
export async function getIntoolsInvoiceDetail(invoiceId: string) {
  return intoolsRpc<IntoolsInvoiceDetail>("intools_get_invoice_detail", {
    p_invoice_id: invoiceId,
  });
}
export async function createIntoolsInvoice(
  payload: IntoolsCreateInvoicePayload,
) {
  return intoolsRpc<IntoolsInvoiceDetail>("intools_create_invoice", {
    p_payload: payload,
  });
}
export async function updateIntoolsInvoice(
  invoiceId: string,
  payload: IntoolsUpdateInvoicePayload,
) {
  return intoolsRpc<IntoolsInvoiceDetail>("intools_update_invoice", {
    p_invoice_id: invoiceId,
    p_payload: payload,
  });
}
export async function sendIntoolsInvoice(invoiceId: string) {
  return intoolsRpc<IntoolsInvoiceDetail>("intools_send_invoice", {
    p_invoice_id: invoiceId,
  });
}
export async function cancelIntoolsInvoice(invoiceId: string, reason: string) {
  return intoolsRpc<IntoolsInvoiceDetail>("intools_cancel_invoice", {
    p_invoice_id: invoiceId,
    p_reason: reason,
  });
}
export async function recordIntoolsManualPayment(
  invoiceId: string,
  payload: IntoolsManualPaymentPayload,
) {
  return intoolsRpc<IntoolsInvoiceDetail>("intools_record_manual_payment", {
    p_invoice_id: invoiceId,
    p_payload: payload,
  });
}
export async function listIntoolsOrders() {
  return intoolsRpc<IntoolsOrder[]>("intools_list_orders");
}
export async function getIntoolsOrderDetail(orderNo: string) {
  return intoolsRpc<IntoolsOrderDetail>("intools_get_order_detail", {
    p_order_no: orderNo,
  });
}
export async function updateIntoolsOrderStatus(
  orderNo: string,
  status: string,
  note: string | null,
) {
  return intoolsRpc("admin_update_order_status", {
    p_order_no: orderNo,
    p_status: status,
    p_note: note,
  });
}
export async function listIntoolsAudit(
  targetType: string | null = null,
  targetId: string | null = null,
  limit = 100,
) {
  return intoolsRpc<IntoolsInvoiceAudit[]>("intools_list_audit", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_limit: limit,
  });
}
