// Shared utilities for Alibaba Edge Functions.
// Follows the same pattern as google-auth.ts — pure exports, no serve().

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ---------------------------------------------------------------------------
// Vault helpers
// ---------------------------------------------------------------------------

export interface VaultSecret {
  access_token: string;
  refresh_token: string;
}

/** Read and parse a JSON secret from Supabase Vault by secret name. */
export async function readVaultSecret(
  supabase: SupabaseClient,
  secretName: string,
): Promise<VaultSecret> {
  const { data, error } = await supabase.rpc("vault_read_secret", {
    secret_name: secretName,
  });
  if (error || !data) {
    throw new Error(`Failed to read Vault secret '${secretName}': ${error?.message}`);
  }
  return JSON.parse(data) as VaultSecret;
}

/** Write updated tokens back to Vault. */
export async function writeVaultSecret(
  supabase: SupabaseClient,
  secretName: string,
  payload: VaultSecret,
): Promise<void> {
  const { error } = await supabase.rpc("vault_update_secret", {
    secret_name: secretName,
    new_secret: JSON.stringify(payload),
  });
  if (error) {
    throw new Error(`Failed to update Vault secret '${secretName}': ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Return a JSON response with CORS headers applied. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

interface AuthResult {
  supabase: SupabaseClient;        // service-role client for DB / Vault writes
  user: { id: string };
}

/**
 * Resolve the calling user from the request's Authorization header.
 * Returns a service-role Supabase client and the authenticated user.
 * Throws a JSON 401 Response if auth fails.
 */
export async function requireAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw jsonResponse({ error: "Missing authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const userSupabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userSupabase.auth.getUser();

  if (userError || !user) {
    throw jsonResponse({ error: "Unauthorized" }, 401);
  }

  return { supabase, user };
}
