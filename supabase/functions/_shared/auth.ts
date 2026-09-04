import { createClient } from "jsr:@supabase/supabase-js@2";

export const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

export async function userFrom(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
}

export async function requireAdmin(req: Request) {
  const user = await userFrom(req);
  if (!user.email_confirmed_at) throw new Error("Forbidden");
  const { data } = await admin().from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (data?.role !== "admin") throw new Error("Forbidden");
  return user;
}
