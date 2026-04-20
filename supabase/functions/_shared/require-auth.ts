// Lightweight auth gate shared by edge functions that don't already use _shared/edge-utils.
// Validates the caller's JWT in code (since these functions deploy with verify_jwt=false).
//
// Usage:
//   const auth = await requireUserAuth(req, corsHeaders);
//   if (auth instanceof Response) return auth; // 401 short-circuit
//   const { userId } = auth;

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface AuthOk {
  userId: string;
  authHeader: string;
}

export async function requireUserAuth(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<AuthOk | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return new Response(
      JSON.stringify({ error: "Server auth misconfigured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.slice("Bearer ".length);
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return { userId: data.claims.sub as string, authHeader };
}
