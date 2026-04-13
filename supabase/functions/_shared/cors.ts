// Shared CORS headers for Edge Functions.
// Origin is permissive for now — tighten to a specific domain allowlist in production.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * Handle browser preflight requests. Call at the top of every handler.
 * Returns a Response if it was a preflight, otherwise null.
 */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export function errorResponse(
  message: string,
  status = 400,
  extras: Record<string, unknown> = {},
): Response {
  return jsonResponse({ error: message, ...extras }, { status });
}
