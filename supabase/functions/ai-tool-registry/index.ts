import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface JwtPayload {
  sub?: string;
}

function getUserIdFromJwt(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const payload = JSON.parse(atob(token.split(".")[1])) as JwtPayload;
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const userId = getUserIdFromJwt(req.headers.get("Authorization"));
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!roleRow;

    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "list";

    if (action === "list") {
      const [{ data: providers }, { data: capabilities }, { data: bindings }] = await Promise.all([
        supabase.from("ai_providers").select("*").order("category").order("display_name"),
        supabase.from("ai_capabilities").select("*").order("category").order("display_name"),
        supabase.from("ai_capability_bindings").select("*"),
      ]);

      // 시크릿 존재 여부 체크
      const allSecretNames = new Set<string>();
      for (const p of providers ?? []) {
        for (const s of (p.required_secrets ?? []) as string[]) allSecretNames.add(s);
      }
      const secretStatus: Record<string, boolean> = {};
      for (const name of allSecretNames) {
        secretStatus[name] = !!Deno.env.get(name);
      }

      return json({
        providers: providers ?? [],
        capabilities: capabilities ?? [],
        bindings: bindings ?? [],
        secret_status: secretStatus,
        is_admin: isAdmin,
      });
    }

    if (!isAdmin) return json({ error: "Admin only" }, 403);

    if (action === "set_binding") {
      const { capability_key, provider_key, model_name } = body as {
        capability_key?: string; provider_key?: string; model_name?: string | null;
      };
      if (!capability_key || !provider_key) return json({ error: "capability_key/provider_key required" }, 400);

      const { error } = await supabase
        .from("ai_capability_bindings")
        .upsert({
          capability_key,
          provider_key,
          model_name: model_name ?? null,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "capability_key" });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action === "set_provider_active") {
      const { provider_key, is_active } = body as { provider_key?: string; is_active?: boolean };
      if (!provider_key) return json({ error: "provider_key required" }, 400);
      const { error } = await supabase
        .from("ai_providers")
        .update({ is_active: !!is_active })
        .eq("provider_key", provider_key);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    if (action === "test_provider") {
      const { provider_key } = body as { provider_key?: string };
      if (!provider_key) return json({ error: "provider_key required" }, 400);
      const result = await testProvider(provider_key);
      return json(result);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ai-tool-registry error:", msg);
    return json({ error: msg }, 500);
  }
});

// 매우 가벼운 헬스 체크 — 실제 호출 없이 시크릿/엔드포인트 도달성만 확인
async function testProvider(providerKey: string): Promise<{ ok: boolean; detail: string }> {
  switch (providerKey) {
    case "lovable_ai": {
      const key = Deno.env.get("LOVABLE_API_KEY");
      if (!key) return { ok: false, detail: "LOVABLE_API_KEY 미설정" };
      return { ok: true, detail: "LOVABLE_API_KEY 확인됨" };
    }
    case "gemini": {
      const key = Deno.env.get("GEMINI_API_KEY");
      if (!key) return { ok: false, detail: "GEMINI_API_KEY 미설정" };
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
        );
        return r.ok
          ? { ok: true, detail: "Gemini API 도달 성공" }
          : { ok: false, detail: `Gemini API ${r.status}` };
      } catch (e) {
        return { ok: false, detail: `네트워크 오류: ${String(e)}` };
      }
    }
    case "vertex_ai": {
      const sa = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
      const proj = Deno.env.get("GOOGLE_CLOUD_PROJECT");
      const loc = Deno.env.get("GOOGLE_CLOUD_LOCATION");
      const missing = [
        !sa && "GOOGLE_SERVICE_ACCOUNT_KEY",
        !proj && "GOOGLE_CLOUD_PROJECT",
        !loc && "GOOGLE_CLOUD_LOCATION",
      ].filter(Boolean);
      if (missing.length) return { ok: false, detail: `누락: ${missing.join(", ")}` };
      return { ok: true, detail: "Vertex AI 시크릿 확인됨 (어댑터 미구현)" };
    }
    case "fal": {
      const key = Deno.env.get("FAL_KEY");
      if (!key) return { ok: false, detail: "FAL_KEY 미설정" };
      return { ok: true, detail: "FAL_KEY 확인됨" };
    }
    case "zhiyitech": {
      const key = Deno.env.get("ZHIYITECH_API_KEY");
      if (!key) return { ok: false, detail: "ZHIYITECH_API_KEY 미설정 (placeholder)" };
      return { ok: true, detail: "ZHIYITECH_API_KEY 확인됨 (어댑터 미구현)" };
    }
    default:
      return { ok: false, detail: `알 수 없는 provider: ${providerKey}` };
  }
}
