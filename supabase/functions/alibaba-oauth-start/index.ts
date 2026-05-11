import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/edge-utils.ts";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Extract JWT from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create client with user's JWT to verify auth
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const platform = body.platform as string | undefined;

    const validPlatforms = ["alibaba_com", "1688", "taobao"];
    if (!platform || !validPlatforms.includes(platform)) {
      return new Response(JSON.stringify({ error: "Invalid platform value" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appKey = Deno.env.get("ALIBABA_APP_KEY");
    const appSecret = Deno.env.get("ALIBABA_APP_SECRET");
    if (!appKey) {
      return new Response(JSON.stringify({ error: "ALIBABA_APP_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!appSecret) {
      return new Response(JSON.stringify({ error: "ALIBABA_APP_SECRET not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build redirect URI pointing back to the callback function
    const redirectUri = `${supabaseUrl}/functions/v1/alibaba-oauth-callback`;

    // Generate HMAC-signed CSRF state: base64(JSON({ user_id, nonce, platform, ts })) + "." + HMAC-SHA256
    const statePayload = {
      user_id: user.id,
      nonce: crypto.randomUUID(),
      platform,
      ts: Date.now(),
    };
    const payloadB64 = btoa(JSON.stringify(statePayload));

    // Sign payload with HMAC-SHA256 using ALIBABA_APP_SECRET
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
    const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
    const state = `${payloadB64}.${sig}`;

    // Build Alibaba.com Open Platform (GGS) authorization URL.
    //
    // This uses the NEW openapi-auth.alibaba.com endpoint, which is the
    // authorization service for apps registered on openapi.alibaba.com.
    //
    // The legacy oauth.alibaba.com endpoint (with sp/view parameters) is
    // for the OLD Alibaba.com Open Platform and rejects GGS app keys with
    // `param-appkey.not.exists`. GGS apps must use this endpoint instead.
    //
    // Spec: https://openapi.alibaba.com/doc/doc.htm  (Seller authorization)
    //   https://openapi-auth.alibaba.com/oauth/authorize
    //     ?response_type=code
    //     &client_id=<app_key>
    //     &redirect_uri=<callback>
    //     &state=<HMAC-signed CSRF state>
    //
    // The `platform` field is preserved on the state payload so the callback
    // can record which platform variant the seller authorized on, but the new
    // platform no longer requires platform-specific `sp` / `view` query params.
    void platform;
    const authUrl = new URL("https://openapi-auth.alibaba.com/oauth/authorize");
    authUrl.searchParams.set("client_id", appKey);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);

    return new Response(
      JSON.stringify({ authorization_url: authUrl.toString(), state }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("alibaba-oauth-start error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
