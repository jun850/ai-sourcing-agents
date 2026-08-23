/*
 * Development-only handoff seam. Phase 2 replaces this with authenticated
 * Supabase operations; this loopback server is never production authority.
 */
export function supabaseIsConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function insertSupabaseRecord(table, payload) {
  if (!supabaseIsConfigured()) return { persisted: false, mode: "memory" };
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Supabase could not record the ${table} request.`);
  return { persisted: true, mode: "supabase" };
}

export async function sendInvitationPlaceholder(email) {
  // Replace this seam with supabase.auth.admin.inviteUserByEmail(email) once
  // the approval action is connected to an authenticated admin workflow.
  return { email, sent: false, mode: "manual-review" };
}
