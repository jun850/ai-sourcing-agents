import { createClient, type Session } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
export const isSupabaseConfigured = Boolean(url && publishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(url!, publishableKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export type WorkspaceRfq = { id: string; case_no: string; title: string; brief: Record<string, unknown>; status: string; created_at: string; updated_at: string; submitted_at: string | null; last_saved_at: string };
export type RfqAttachment = { id: string; rfq_case_id: string; storage_path: string; original_name: string; content_type: string; byte_size: number; created_at: string };
type RegistrationPayload = { name: string; email: string; companyName: string; sourcing: string; annualRevenue: string; phone?: string; countryCode?: string };
type SupplierIntakePayload = Record<string, unknown>;

function client() { if (!supabase) throw new Error("Supabase is not configured for this environment."); return supabase; }
function rpcError(error: { message: string } | null) { if (error) throw new Error(error.message); }

export async function getSession(): Promise<Session | null> { const { data, error } = await client().auth.getSession(); rpcError(error); return data.session; }
export async function signInWithMagicLink(email: string, redirectTo: string) { const { error } = await client().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } }); rpcError(error); }
export async function signOut() { const { error } = await client().auth.signOut(); rpcError(error); }
export async function signUpForReview(payload: RegistrationPayload) { const { data, error } = await client().rpc("submit_registration_request", { p_payload: payload }); rpcError(error); return data as string; }
export async function submitSupplierIntake(payload: SupplierIntakePayload) { const { data, error } = await client().rpc("submit_supplier_intake", { p_payload: payload }); rpcError(error); return data as string; }
export async function listRfqCases() { const { data, error } = await client().from("atelix_rfq_workspace").select("*").order("updated_at", { ascending: false }); rpcError(error); return (data ?? []) as WorkspaceRfq[]; }
export async function createRfqCase(input: { title: string; brief: Record<string, unknown> }) { const { data, error } = await client().rpc("create_workspace_rfq", { p_title: input.title, p_brief: input.brief }); rpcError(error); return data as WorkspaceRfq; }
export async function updateRfqCase(id: string, input: { title: string; brief: Record<string, unknown>; status?: string }) { const { data, error } = await client().rpc("update_workspace_rfq", { p_case_id: id, p_title: input.title, p_brief: input.brief, p_status: input.status ?? null }); rpcError(error); return data as WorkspaceRfq; }
export async function listRfqAttachments(caseId: string) { const { data, error } = await client().from("rfq_attachments").select("*").eq("rfq_case_id", caseId).order("created_at"); rpcError(error); return (data ?? []) as RfqAttachment[]; }
export async function uploadRfqAttachment(caseId: string, file: File) {
  if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type) || file.size > 25 * 1024 * 1024) throw new Error("Use a JPG, PNG, WebP, or PDF up to 25 MB.");
  const session = await getSession(); if (!session) throw new Error("Sign in to attach files to an RFQ.");
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_"); const path = `${session.user.id}/${caseId}/${crypto.randomUUID()}/${safeName}`;
  const storage = client().storage.from("rfq-attachments"); const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, upsert: false }); rpcError(uploadError);
  const { data, error } = await client().rpc("record_rfq_attachment", { p_case_id: caseId, p_storage_path: path, p_original_name: file.name, p_content_type: file.type, p_byte_size: file.size });
  if (error) { await storage.remove([path]); rpcError(error); }
  return data as RfqAttachment;
}
