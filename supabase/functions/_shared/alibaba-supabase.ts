// Central Supabase auth helpers for Alibaba Edge Functions.
// See docs/tasks/alibaba-integration-phase-1-impl/tech_spec.md §4.5a.
//
// Rule: Every Alibaba Edge Function MUST use these helpers — do NOT inline createClient
// calls or service-role comparisons per function. This is the single audited surface for
// all trust decisions in the integration.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (SUPABASE_URL === "" || SUPABASE_ANON_KEY === "" || SUPABASE_SERVICE_ROLE_KEY === "") {
  throw new Error(
    "[alibaba-supabase] SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY must all be set.",
  );
}

export class UnauthorizedError extends Error {
  constructor(reason: string) {
    super(`Unauthorized: ${reason}`);
    this.name = "UnauthorizedError";
  }
}

/**
 * User-scoped Supabase client. Forwards the incoming Authorization header so
 * Row Level Security policies evaluate under the caller's auth.uid().
 * Safe to use anywhere that has a trusted user JWT on the request.
 */
export function getUserClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
}

/**
 * Verify the request has a valid user JWT and return both the user record
 * and a user-scoped client. Throws UnauthorizedError if no user.
 */
export async function requireUser(
  req: Request,
): Promise<{ user: User; client: SupabaseClient }> {
  const client = getUserClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    throw new UnauthorizedError("missing_or_invalid_jwt");
  }
  return { user: data.user, client };
}

/**
 * Service-role Supabase client. Bypasses RLS.
 *
 * Safe to use from user-facing endpoints ONLY after explicit authentication.
 * Valid safeguards (in order of preference):
 *   (a) requireUser() return value's user.id (JWT-verified)
 *   (b) HMAC-signed state payload's user_id after verifyState() success
 *       (used by alibaba-oauth-callback)
 *
 * Never write to rows without scoping by the authenticated user_id.
 * Do NOT use from endpoints that accept neither a JWT nor a signed state.
 */
export function getServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Constant-time comparison of the Authorization: Bearer <token> header against
 * the service-role key. Used by alibaba-refresh-token (cron-invoked).
 * Throws UnauthorizedError on mismatch.
 */
export function requireServiceRoleBearer(req: Request): void {
  const header = req.headers.get("Authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    throw new UnauthorizedError("missing_bearer");
  }
  const presented = header.slice(prefix.length);
  if (!constantTimeEqual(presented, SUPABASE_SERVICE_ROLE_KEY)) {
    throw new UnauthorizedError("invalid_service_role_bearer");
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
