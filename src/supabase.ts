import { createClient, type Session } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
export const isSupabaseConfigured = Boolean(url && publishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
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
  return intoolsRpc<Record<string, unknown>>("intools_get_order_detail", {
    p_order_no: orderNo,
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
