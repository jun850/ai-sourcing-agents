import {
  createClient,
  type RealtimeChannel,
  type Session,
  type User,
} from "@supabase/supabase-js";

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
  /** Optimistic-concurrency revision used only by the conversational RFQ agent. */
  agent_revision?: number;
};
export type CopilotRfqField =
  | "product"
  | "quantity"
  | "material"
  | "certifications"
  | "colors"
  | "sizes"
  | "budget"
  | "timeline";
export type CopilotAgentResponse = {
  kind:
    | "answer"
    | "clarifying_question"
    | "draft_updated"
    | "support_handoff"
    | "unavailable";
  reply: string;
  savedPatch: Partial<Record<CopilotRfqField, string>> | null;
  changedFields: CopilotRfqField[];
  revision: number;
  undoToken: string | null;
  verificationStatus: string | null;
  supportHandoff: boolean | { email?: string; reason?: string } | null;
  budgetState: { remainingTurns?: number | null } | number | null;
  options: string[] | null;
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
/**
 * A human-to-human conversation about one RFQ. This is deliberately separate
 * from `WorkspaceChatMessage`, which is the buyer's AI drafting conversation.
 */
export type RfqOpsConversation = {
  id: string;
  rfq_case_id: string;
  case_no: string;
  rfq_title: string;
  rfq_status: string;
  buyer_profile_id: string | null;
  buyer_name: string;
  buyer_email: string | null;
  created_at: string;
  updated_at: string;
  last_message_id?: string | null;
  last_message_body?: string | null;
  last_message_sender_role?: "buyer" | "ops" | null;
  last_message_at?: string | null;
  buyer_unread_count?: number;
  ops_unread_count?: number;
};
export type RfqOpsMessageAttachment = {
  id: string;
  storage_path: string;
  original_name: string;
  content_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  byte_size: number;
  created_at: string;
};
export type RfqOpsMessage = {
  id: string;
  conversation_id: string;
  client_message_id: string;
  sender_profile_id: string | null;
  /** Read RPCs expose this stable display role; table inserts use sender_kind. */
  sender_role: "buyer" | "ops";
  sender_label: string;
  body: string;
  attachments: RfqOpsMessageAttachment[];
  created_at: string;
};
/** The INSERT shape delivered by Realtime; attachments must be hydrated by RPC. */
export type RfqOpsMessageInsert = {
  id: string;
  conversation_id: string;
  client_message_id: string;
  sender_profile_id: string | null;
  sender_kind: "buyer" | "atelix_ops";
  sender_label: string;
  body: string;
  created_at: string;
};
/** A stable, exclusive upper bound for the next RPC page. */
export type RfqOpsCursor = Readonly<{ created_at: string; id: string }>;
export type RfqOpsListOptions = {
  before?: RfqOpsCursor | null;
  limit?: number;
};
/** Client-side descriptor validated against the immutable private upload path by the send RPC. */
export type RfqOpsAttachmentUpload = {
  id: string;
  storage_path: string;
  original_name: string;
  content_type: RfqOpsMessageAttachment["content_type"];
  byte_size: number;
};
/** Server-authorized private path for one upload, valid only until `expires_at`. */
export type RfqOpsUploadReservation = {
  id: string;
  conversation_id: string;
  rfq_case_id: string;
  client_message_id: string;
  storage_path: string;
  original_name: string;
  expires_at: string;
};
export type RfqOpsSendMessageInput = {
  /** Generated client-side so attachment paths can be immutable before send. */
  client_message_id: string;
  body?: string;
  attachments?: RfqOpsAttachmentUpload[];
};
export type RfqOpsMessageSubscription = {
  channel: RealtimeChannel;
  unsubscribe: () => void;
};
export type RfqOpsConversationPage = {
  conversations: RfqOpsConversation[];
  next_before: RfqOpsCursor | null;
};
export type RfqOpsMessagePage = {
  conversation: RfqOpsConversation;
  messages: RfqOpsMessage[];
  next_before: RfqOpsCursor | null;
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
  buyer_profile_id: string;
  rfq_case_id: string | null;
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
  const { error } = await client().functions.invoke("request-magic-link", {
    body: { email, redirectTo },
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
export type WorkspaceListCursor = { updatedAt: string; id: string };
export async function listRfqCasesPage({
  cursor = null,
  limit = 40,
}: { cursor?: WorkspaceListCursor | null; limit?: number } = {}) {
  let query = client()
    .from("atelix_rfq_workspace")
    .select("*")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (cursor)
    query = query.or(
      `updated_at.lt.${encodeURIComponent(cursor.updatedAt)},and(updated_at.eq.${encodeURIComponent(cursor.updatedAt)},id.lt.${encodeURIComponent(cursor.id)})`,
    );
  const { data, error } = await query;
  rpcError(error);
  const items = (data ?? []) as WorkspaceRfq[];
  const last = items.at(-1);
  return {
    items,
    nextCursor: items.length === Math.min(Math.max(limit, 1), 100) && last
      ? { updatedAt: last.updated_at, id: last.id }
      : null,
    hasMore: items.length === Math.min(Math.max(limit, 1), 100),
  };
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
export async function invokeRfqCopilot(input: {
  rfqCaseId: string;
  message?: string;
  clientMessageId: string;
  expectedRevision: number;
  action?: "undo";
  undoToken?: string;
}) {
  const { data, error } = await client().functions.invoke("copilot-agent", {
    body: input,
  });
  rpcError(error);
  if (!data || typeof data !== "object") {
    throw new Error("Atelix AI could not return a response. Please try again shortly.");
  }
  const response = data as Partial<CopilotAgentResponse>;
  if (
    typeof response.kind !== "string" ||
    typeof response.reply !== "string" ||
    typeof response.revision !== "number"
  ) {
    throw new Error("Atelix AI returned an incomplete response. Please try again shortly.");
  }
  return {
    kind: response.kind,
    reply: response.reply,
    savedPatch: response.savedPatch ?? null,
    changedFields: Array.isArray(response.changedFields)
      ? response.changedFields.filter(
          (field): field is CopilotRfqField =>
            typeof field === "string" &&
            [
              "product",
              "quantity",
              "material",
              "certifications",
              "colors",
              "sizes",
              "budget",
              "timeline",
            ].includes(field),
        )
      : [],
    revision: response.revision,
    undoToken: typeof response.undoToken === "string" ? response.undoToken : null,
    verificationStatus:
      typeof response.verificationStatus === "string"
        ? response.verificationStatus
        : null,
    supportHandoff:
      response.supportHandoff === true ||
      (response.supportHandoff && typeof response.supportHandoff === "object")
        ? response.supportHandoff
        : null,
    budgetState:
      typeof response.budgetState === "number" ||
      (response.budgetState && typeof response.budgetState === "object")
        ? response.budgetState
        : null,
    options: Array.isArray(response.options)
      ? response.options.filter(
          (option): option is string =>
            typeof option === "string" && option.trim().length > 0,
        ).slice(0, 3)
      : null,
  } as CopilotAgentResponse;
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

const RFQ_OPS_ATTACHMENT_BUCKET = "rfq-message-attachments";
const RFQ_OPS_ATTACHMENT_TYPES = new Set<RfqOpsMessageAttachment["content_type"]>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const RFQ_OPS_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

function normalizeRfqOpsPageOptions(options: RfqOpsListOptions = {}) {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Message pages must contain between 1 and 100 items.");
  return { p_before: options.before ?? null, p_limit: limit };
}

/** Build a cursor for a message page. Conversation pages must use server `next_before`. */
export function getRfqOpsMessageCursor(
  message: Pick<RfqOpsMessage, "created_at" | "id">,
): RfqOpsCursor {
  return { created_at: message.created_at, id: message.id };
}

function normalizeRfqOpsSendInput(input: RfqOpsSendMessageInput) {
  if (!input.client_message_id) throw new Error("A message ID is required.");
  const body = input.body?.trim() ?? "";
  const attachments = input.attachments ?? [];
  if (!body && !attachments.length)
    throw new Error("Write a message or attach a file before sending.");
  if (body.length > 12000) throw new Error("Messages can contain up to 12,000 characters.");
  if (new Set(attachments.map((attachment) => attachment.id)).size !== attachments.length)
    throw new Error("Each attachment can be included only once.");
  return { body, attachments };
}

/** Generate the immutable message ID used to reserve attachments and send an idempotent message. */
export function createRfqOpsMessageId() {
  return crypto.randomUUID();
}

function normalizeRfqOpsOriginalName(originalName: string) {
  const name = originalName.trim();
  if (!name || name.length > 255 || /[\\/]/.test(name))
    throw new Error("Attachment names must be 1–255 characters and cannot contain slashes.");
  return name;
}

async function reserveRfqOpsUpload(
  reserve: (args: Record<string, unknown>) => Promise<RfqOpsUploadReservation>,
  input: {
    conversationId: string;
    clientMessageId: string;
    originalName: string;
    attachmentId?: string;
  },
) {
  if (!input.conversationId || !input.clientMessageId)
    throw new Error("A conversation and message ID are required.");
  const originalName = normalizeRfqOpsOriginalName(input.originalName);
  return reserve({
    p_conversation_id: input.conversationId,
    p_client_message_id: input.clientMessageId,
    p_attachment_id: input.attachmentId ?? crypto.randomUUID(),
    p_original_name: originalName,
  });
}

export async function reserveWorkspaceOpsUpload(input: {
  conversationId: string;
  clientMessageId: string;
  originalName: string;
  attachmentId?: string;
}) {
  return reserveRfqOpsUpload(
    async (args) => {
      const { data, error } = await client().rpc("workspace_reserve_ops_upload", args);
      rpcError(error);
      return data as RfqOpsUploadReservation;
    },
    input,
  );
}

export async function reserveIntoolsBuyerUpload(input: {
  conversationId: string;
  clientMessageId: string;
  originalName: string;
  attachmentId?: string;
}) {
  return reserveRfqOpsUpload(
    (args) => intoolsRpc<RfqOpsUploadReservation>("intools_reserve_buyer_upload", args),
    input,
  );
}

/**
 * Uploads exactly to a server-reserved path. The send RPC consumes the
 * reservation atomically with its append-only message record.
 */
export async function uploadRfqOpsAttachment(input: {
  reservation: RfqOpsUploadReservation;
  file: File;
}): Promise<RfqOpsAttachmentUpload> {
  const { reservation, file } = input;
  if (!reservation?.storage_path || !reservation.id)
    throw new Error("Reserve an attachment upload before uploading.");
  if (normalizeRfqOpsOriginalName(file.name || "attachment") !== reservation.original_name)
    throw new Error("The file name no longer matches its upload reservation.");
  if (!RFQ_OPS_ATTACHMENT_TYPES.has(file.type as RfqOpsMessageAttachment["content_type"]) ||
      file.size > RFQ_OPS_ATTACHMENT_MAX_BYTES)
    throw new Error("Use a JPG, PNG, WebP, or PDF up to 25 MB.");
  const session = await getSession();
  if (!session) throw new Error("Sign in to attach files to an Ops message.");
  const { error } = await client().storage.from(RFQ_OPS_ATTACHMENT_BUCKET).upload(reservation.storage_path, file, {
    contentType: file.type,
    upsert: false,
  });
  rpcError(error);
  return {
    id: reservation.id,
    storage_path: reservation.storage_path,
    original_name: reservation.original_name,
    content_type: file.type as RfqOpsMessageAttachment["content_type"],
    byte_size: file.size,
  };
}

/** Cancels an unconsumed reservation by removing its private Storage object. */
export async function cancelRfqOpsAttachmentUpload(
  reservation: Pick<RfqOpsUploadReservation, "storage_path">,
) {
  if (!reservation.storage_path) throw new Error("Upload reservation storage path is required.");
  const { error } = await client().storage
    .from(RFQ_OPS_ATTACHMENT_BUCKET)
    .remove([reservation.storage_path]);
  rpcError(error);
}

/** Returns a short-lived URL only after Storage RLS authorizes the reader. */
export async function createRfqOpsAttachmentSignedUrl(
  attachment: Pick<RfqOpsMessageAttachment, "storage_path"> | string,
  expiresIn = 60 * 60,
) {
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 24 * 60 * 60)
    throw new Error("Attachment links can be valid for between 1 second and 24 hours.");
  const storagePath = typeof attachment === "string" ? attachment : attachment.storage_path;
  if (!storagePath) throw new Error("Attachment storage path is required.");
  const { data, error } = await client().storage
    .from(RFQ_OPS_ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  rpcError(error);
  if (!data?.signedUrl) throw new Error("The attachment link could not be created.");
  return data.signedUrl;
}

export async function listWorkspaceOpsConversations(options: RfqOpsListOptions = {}) {
  const { data, error } = await client().rpc("workspace_list_ops_conversations", {
    ...normalizeRfqOpsPageOptions(options),
  });
  rpcError(error);
  return (data ?? { conversations: [], next_before: null }) as RfqOpsConversationPage;
}

/** Retrieves the buyer-owned Ops thread for a specific RFQ. */
export async function getWorkspaceOpsConversation(rfqCaseId: string) {
  const { data, error } = await client().rpc("rfq_ops_get_buyer_conversation", {
    p_rfq_case_id: rfqCaseId,
  });
  rpcError(error);
  return data as RfqOpsConversation;
}

export async function getWorkspaceOpsUnreadCount() {
  const { data, error } = await client().rpc("rfq_ops_get_buyer_unread_count");
  rpcError(error);
  return data as { unread_count: number };
}

export async function listWorkspaceOpsMessages(
  conversationId: string,
  options: RfqOpsListOptions = {},
) {
  const { data, error } = await client().rpc("workspace_list_ops_messages", {
    p_conversation_id: conversationId,
    ...normalizeRfqOpsPageOptions(options),
  });
  rpcError(error);
  return (data ?? { conversation: null, messages: [], next_before: null }) as RfqOpsMessagePage;
}

export async function sendWorkspaceOpsMessage(
  conversationId: string,
  input: RfqOpsSendMessageInput,
) {
  const { body, attachments } = normalizeRfqOpsSendInput(input);
  const { data, error } = await client().rpc("workspace_send_ops_message", {
    p_conversation_id: conversationId,
    p_client_message_id: input.client_message_id,
    p_body: body,
    p_attachments: attachments,
  });
  rpcError(error);
  return data as RfqOpsMessage;
}

/** Read one just-broadcast message without reloading the active conversation. */
export async function getRfqOpsMessage(messageId: string) {
  if (!messageId) throw new Error("A message ID is required.");
  if (localIntoolsAdmin)
    return intoolsRpc<RfqOpsMessage>("rfq_ops_get_message", { p_message_id: messageId });
  const { data, error } = await client().rpc("rfq_ops_get_message", { p_message_id: messageId });
  rpcError(error);
  return data as RfqOpsMessage;
}

export async function markWorkspaceOpsConversationRead(
  conversationId: string,
  throughMessageId: string | null = null,
) {
  const { data, error } = await client().rpc("workspace_mark_ops_conversation_read", {
    p_conversation_id: conversationId,
    p_through_message_id: throughMessageId,
  });
  rpcError(error);
  return data as {
    conversation_id: string;
    reader_kind: "buyer";
    last_read_message_id: string | null;
    last_read_at: string;
  };
}

async function getRfqOpsRealtimeAccessToken() {
  if (localIntoolsAdmin) {
    const response = await fetch("/api/intools/realtime-token", {
      credentials: "same-origin",
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.accessToken !== "string")
      throw new Error(typeof payload.error === "string" ? payload.error : "Live updates are unavailable.");
    return payload.accessToken;
  }
  const session = await getSession();
  if (!session?.access_token) throw new Error("Sign in to receive live messages.");
  return session.access_token;
}

/** Subscribe to a private Broadcast topic for one RFQ conversation. */
export async function subscribeToRfqOpsMessages(
  conversationId: string,
  onInsert: (message: RfqOpsMessageInsert) => void,
): Promise<RfqOpsMessageSubscription> {
  if (!conversationId) throw new Error("A conversation ID is required.");
  const db = client();
  await db.realtime.setAuth(await getRfqOpsRealtimeAccessToken());
  const channel = db
    .channel(`rfq-ops:${conversationId}:messages`, { config: { private: true } })
    .on(
      "broadcast",
      { event: "INSERT" },
      (payload) => onInsert(payload.payload.record as RfqOpsMessageInsert),
    )
    .on(
      "broadcast",
      { event: "UPDATE" },
      (payload) => onInsert(payload.payload.record as RfqOpsMessageInsert),
    )
    .subscribe();
  const { data: { subscription: authSubscription } } = db.auth.onAuthStateChange((_, session) => {
    if (!localIntoolsAdmin && session?.access_token) void db.realtime.setAuth(session.access_token);
  });
  return {
    channel,
    unsubscribe: () => {
      authSubscription.unsubscribe();
      void db.removeChannel(channel);
    },
  };
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
export type IntoolsOpsConversationOptions = RfqOpsListOptions & {
  query?: string | null;
  status?: string | null;
};
export async function listIntoolsBuyerConversations(
  options: IntoolsOpsConversationOptions = {},
) {
  return intoolsRpc<RfqOpsConversationPage>("intools_list_buyer_conversations", {
    p_query: options.query?.trim() || null,
    p_status: options.status ?? null,
    ...normalizeRfqOpsPageOptions(options),
  });
}
/** Retrieves (or initializes) the admin-visible Ops thread for a specific RFQ. */
export async function getIntoolsBuyerConversation(rfqCaseId: string) {
  return intoolsRpc<RfqOpsConversation>("intools_get_buyer_conversation", {
    p_rfq_case_id: rfqCaseId,
  });
}
export async function getIntoolsBuyerUnreadCount() {
  return intoolsRpc<{ unread_count: number }>("intools_get_buyer_unread_count");
}
export async function listIntoolsBuyerMessages(
  conversationId: string,
  options: RfqOpsListOptions = {},
) {
  return intoolsRpc<RfqOpsMessagePage>("intools_list_buyer_messages", {
    p_conversation_id: conversationId,
    ...normalizeRfqOpsPageOptions(options),
  });
}
export async function sendIntoolsBuyerMessage(
  conversationId: string,
  input: RfqOpsSendMessageInput,
) {
  const { body, attachments } = normalizeRfqOpsSendInput(input);
  return intoolsRpc<RfqOpsMessage>("intools_send_buyer_message", {
    p_conversation_id: conversationId,
    p_client_message_id: input.client_message_id,
    p_body: body,
    p_attachments: attachments,
  });
}
export async function markIntoolsBuyerConversationRead(
  conversationId: string,
  throughMessageId: string | null = null,
) {
  return intoolsRpc<{
    conversation_id: string;
    reader_kind: "atelix_ops";
    last_read_message_id: string | null;
    last_read_at: string;
  }>(
    "intools_mark_buyer_conversation_read",
    {
      p_conversation_id: conversationId,
      p_through_message_id: throughMessageId,
    },
  );
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

export type IntoolsAgentKnowledgeDocument = {
  id: string;
  title: string;
  domain: string;
  visibility: "buyer-safe" | "operator-only";
  status: "uploaded" | "processing" | "ready" | "published" | "failed" | "archived";
  current_version_id: string | null;
  original_name: string | null;
  mime_type: string | null;
  byte_size: number | null;
  updated_at: string;
  extraction_error?: string | null;
};

type IntoolsAgentKnowledgeRow = {
  documentId: string;
  title: string;
  domain: string;
  visibility: "buyer-safe" | "operator-only";
  archivedAt: string | null;
  versionId: string | null;
  originalName: string | null;
  contentType: string | null;
  byteSize: number | null;
  status: IntoolsAgentKnowledgeDocument["status"] | null;
  extractionError: string | null;
  createdAt: string;
};

function mapIntoolsAgentKnowledge(row: IntoolsAgentKnowledgeRow): IntoolsAgentKnowledgeDocument {
  return {
    id: row.documentId,
    title: row.title,
    domain: row.domain,
    visibility: row.visibility,
    status: row.archivedAt ? "archived" : row.status ?? "uploaded",
    current_version_id: row.versionId,
    original_name: row.originalName,
    mime_type: row.contentType,
    byte_size: row.byteSize,
    updated_at: row.createdAt,
    extraction_error: row.extractionError,
  };
}

export async function listIntoolsAgentKnowledge(
  status: string | null = null,
  visibility: string | null = null,
) {
  const rows = await intoolsRpc<IntoolsAgentKnowledgeRow[]>(
    "intools_list_agent_knowledge",
    { p_status: status, p_visibility: visibility },
  );
  return (rows ?? []).map(mapIntoolsAgentKnowledge);
}

export async function uploadIntoolsAgentKnowledge(
  file: File,
  input: { title: string; domain: string; visibility: string },
) {
  if (localIntoolsAdmin)
    throw new Error("Knowledge uploads require a signed-in Supabase administrator session.");
  const extension = file.name.toLowerCase().split(".").pop();
  const inferredContentType =
    extension === "pdf"
      ? "application/pdf"
      : extension === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : extension === "md"
          ? "text/markdown"
          : "text/plain";
  const contentType = file.type || inferredContentType;
  const created = await intoolsRpc<{
    documentId: string;
    versionId: string;
    storagePath: string;
    status: string;
  }>("intools_create_agent_knowledge_version", {
    p_payload: {
      title: input.title,
      domain: input.domain,
      visibility: input.visibility,
      originalName: file.name,
      contentType,
      byteSize: file.size,
    },
  });
  const storage = client().storage.from("agent-knowledge");
  const { error: uploadError } = await storage.upload(created.storagePath, file, {
    contentType,
    upsert: false,
  });
  if (uploadError) {
    await intoolsRpc("intools_archive_agent_knowledge_document", {
      p_document_id: created.documentId,
    }).catch(() => undefined);
    rpcError(uploadError);
  }
  // Extraction is server-side so private source content never enters another
  // browser contract. A failed invocation leaves the immutable upload visible
  // as `uploaded` for an operator retry instead of falsely marking it ready.
  const { error: ingestError } = await client().functions.invoke(
    "agent-knowledge-ingest",
    { body: { versionId: created.versionId } },
  );
  if (ingestError && import.meta.env.DEV)
    console.warn("Knowledge upload is waiting for ingestion.");
  return created;
}

export async function publishIntoolsAgentKnowledge(versionId: string) {
  return intoolsRpc("intools_publish_agent_knowledge_version", {
    p_version_id: versionId,
  });
}

export async function archiveIntoolsAgentKnowledge(documentId: string) {
  return intoolsRpc("intools_archive_agent_knowledge_document", {
    p_document_id: documentId,
  });
}
