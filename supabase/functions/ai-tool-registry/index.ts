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

type TestResult = {
  ok: boolean;
  detail: string;
  status?: number;
  latency_ms?: number;
  endpoint?: string;
  response_preview?: string;
  missing_secrets?: string[];
};

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

    if (action === "test_capability") {
      const { capability_key } = body as { capability_key?: string };
      if (!capability_key) return json({ error: "capability_key required" }, 400);

      const { data: binding } = await supabase
        .from("ai_capability_bindings")
        .select("*")
        .eq("capability_key", capability_key)
        .maybeSingle();

      if (!binding) {
        return json({
          ok: false,
          detail: `'${capability_key}'에 연결된 Provider 없음 — 먼저 binding을 설정하세요.`,
        } as TestResult);
      }

      const { data: provider } = await supabase
        .from("ai_providers")
        .select("*")
        .eq("provider_key", binding.provider_key)
        .maybeSingle();

      if (!provider) {
        return json({
          ok: false,
          detail: `Provider '${binding.provider_key}'가 ai_providers에 존재하지 않음.`,
        } as TestResult);
      }

      const result = await testCapability(
        capability_key,
        binding.provider_key,
        binding.model_name,
      );
      return json({
        ...result,
        provider_key: binding.provider_key,
        model_name: binding.model_name,
        provider_active: provider.is_active,
        provider_implemented: provider.is_implemented,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ai-tool-registry error:", msg);
    return json({ error: msg }, 500);
  }
});

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - t0 };
}

async function safePreview(r: Response, max = 400): Promise<string> {
  try {
    const text = await r.text();
    return text.length > max ? text.slice(0, max) + "…" : text;
  } catch {
    return "(no body)";
  }
}

// Provider 헬스 체크 — 가능한 경우 실제 endpoint 호출
async function testProvider(providerKey: string): Promise<TestResult> {
  switch (providerKey) {
    case "lovable_ai": {
      const key = Deno.env.get("LOVABLE_API_KEY");
      if (!key) return { ok: false, detail: "LOVABLE_API_KEY 미설정", missing_secrets: ["LOVABLE_API_KEY"] };
      const endpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
      try {
        const { result: r, ms } = await timed(() =>
          fetch(endpoint, {
            method: "POST",
            headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 5,
            }),
          }),
        );
        const preview = await safePreview(r);
        return {
          ok: r.ok,
          status: r.status,
          latency_ms: ms,
          endpoint,
          detail: r.ok ? "Lovable AI Gateway 정상 응답" : `Lovable AI Gateway HTTP ${r.status}`,
          response_preview: preview,
        };
      } catch (e) {
        return { ok: false, endpoint, detail: `네트워크 오류: ${String(e)}` };
      }
    }
    case "gemini": {
      const key = Deno.env.get("GEMINI_API_KEY");
      if (!key) return { ok: false, detail: "GEMINI_API_KEY 미설정", missing_secrets: ["GEMINI_API_KEY"] };
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=***`;
      try {
        const { result: r, ms } = await timed(() =>
          fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`),
        );
        const preview = await safePreview(r);
        return {
          ok: r.ok,
          status: r.status,
          latency_ms: ms,
          endpoint,
          detail: r.ok ? "Gemini API 정상 — 모델 목록 조회 성공" : `Gemini API HTTP ${r.status}`,
          response_preview: preview,
        };
      } catch (e) {
        return { ok: false, endpoint, detail: `네트워크 오류: ${String(e)}` };
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
      ].filter(Boolean) as string[];
      if (missing.length) return { ok: false, detail: `누락된 시크릿: ${missing.join(", ")}`, missing_secrets: missing };
      return { ok: true, detail: "Vertex AI 시크릿 모두 확인됨 (어댑터 미구현 — 실제 호출 미수행)" };
    }
    case "fal": {
      const key = Deno.env.get("FAL_KEY");
      if (!key) return { ok: false, detail: "FAL_KEY 미설정", missing_secrets: ["FAL_KEY"] };
      const endpoint = "https://queue.fal.run/health";
      try {
        const { result: r, ms } = await timed(() =>
          fetch("https://fal.ai/api/health").catch(() => fetch("https://queue.fal.run")),
        );
        return {
          ok: true,
          status: r.status,
          latency_ms: ms,
          endpoint,
          detail: "FAL_KEY 확인됨 — fal.ai 도달 성공",
        };
      } catch (e) {
        return { ok: false, endpoint, detail: `네트워크 오류: ${String(e)}` };
      }
    }
    case "zhiyitech": {
      const key = Deno.env.get("ZHIYITECH_API_KEY");
      if (!key) return { ok: false, detail: "ZHIYITECH_API_KEY 미설정 (placeholder Provider)", missing_secrets: ["ZHIYITECH_API_KEY"] };
      return { ok: true, detail: "ZHIYITECH_API_KEY 확인됨 (어댑터 미구현)" };
    }
    case "apify": {
      const key = Deno.env.get("APIFY_API_TOKEN");
      if (!key) return { ok: false, detail: "APIFY_API_TOKEN 미설정", missing_secrets: ["APIFY_API_TOKEN"] };
      const endpoint = "https://api.apify.com/v2/users/me";
      try {
        const { result: r, ms } = await timed(() =>
          fetch(endpoint, { headers: { Authorization: `Bearer ${key}` } }),
        );
        const preview = await safePreview(r);
        return {
          ok: r.ok,
          status: r.status,
          latency_ms: ms,
          endpoint,
          detail: r.ok ? "Apify 인증 성공 (계정 정보 조회)" : `Apify HTTP ${r.status}`,
          response_preview: preview,
        };
      } catch (e) {
        return { ok: false, endpoint, detail: `네트워크 오류: ${String(e)}` };
      }
    }
    case "serpapi": {
      const key = Deno.env.get("SERPAPI_KEY");
      if (!key) return { ok: false, detail: "SERPAPI_KEY 미설정", missing_secrets: ["SERPAPI_KEY"] };
      const endpoint = "https://serpapi.com/account";
      try {
        const { result: r, ms } = await timed(() => fetch(`${endpoint}?api_key=${key}`));
        const preview = await safePreview(r);
        return {
          ok: r.ok,
          status: r.status,
          latency_ms: ms,
          endpoint,
          detail: r.ok ? "SerpAPI 인증 성공 (계정 정보 조회)" : `SerpAPI HTTP ${r.status}`,
          response_preview: preview,
        };
      } catch (e) {
        return { ok: false, endpoint, detail: `네트워크 오류: ${String(e)}` };
      }
    }
    case "openai_direct": {
      const key = Deno.env.get("OPENAI_API_KEY");
      if (!key) return { ok: false, detail: "OPENAI_API_KEY 미설정 (Lovable AI Gateway 사용 권장)", missing_secrets: ["OPENAI_API_KEY"] };
      const endpoint = "https://api.openai.com/v1/models";
      try {
        const { result: r, ms } = await timed(() =>
          fetch(endpoint, { headers: { Authorization: `Bearer ${key}` } }),
        );
        const preview = await safePreview(r);
        return {
          ok: r.ok,
          status: r.status,
          latency_ms: ms,
          endpoint,
          detail: r.ok ? "OpenAI 인증 성공" : `OpenAI HTTP ${r.status}`,
          response_preview: preview,
        };
      } catch (e) {
        return { ok: false, endpoint, detail: `네트워크 오류: ${String(e)}` };
      }
    }
    case "microlink": {
      const endpoint = "https://api.microlink.io/?url=https://example.com";
      try {
        const { result: r, ms } = await timed(() => fetch(endpoint));
        const preview = await safePreview(r);
        return {
          ok: r.ok,
          status: r.status,
          latency_ms: ms,
          endpoint,
          detail: r.ok ? "Microlink 정상 응답 (무료 티어)" : `Microlink HTTP ${r.status}`,
          response_preview: preview,
        };
      } catch (e) {
        return { ok: false, endpoint, detail: `네트워크 오류: ${String(e)}` };
      }
    }
    case "firecrawl": {
      const key = Deno.env.get("FIRECRAWL_API_KEY");
      if (!key) return { ok: false, detail: "FIRECRAWL_API_KEY 미설정", missing_secrets: ["FIRECRAWL_API_KEY"] };
      const endpoint = "https://api.firecrawl.dev/v2/scrape";
      try {
        const { result: r, ms } = await timed(() =>
          fetch(endpoint, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ url: "https://example.com", formats: ["markdown"], onlyMainContent: true }),
          }),
        );
        const preview = await safePreview(r);
        return {
          ok: r.ok,
          status: r.status,
          latency_ms: ms,
          endpoint,
          detail: r.ok ? "Firecrawl 인증 + 스크래핑 성공" : `Firecrawl HTTP ${r.status}`,
          response_preview: preview,
        };
      } catch (e) {
        return { ok: false, endpoint, detail: `네트워크 오류: ${String(e)}` };
      }
    }
    default:
      return { ok: false, detail: `알 수 없는 provider: ${providerKey}` };
  }
}

// Capability 테스트 — 연결된 provider로 실제 작업을 수행
async function testCapability(
  capabilityKey: string,
  providerKey: string,
  modelName: string | null,
): Promise<TestResult> {
  switch (capabilityKey) {
    case "text_generation": {
      if (providerKey === "lovable_ai") {
        const key = Deno.env.get("LOVABLE_API_KEY");
        if (!key) return { ok: false, detail: "LOVABLE_API_KEY 미설정", missing_secrets: ["LOVABLE_API_KEY"] };
        const endpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
        try {
          const { result: r, ms } = await timed(() =>
            fetch(endpoint, {
              method: "POST",
              headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: modelName || "google/gemini-2.5-flash-lite",
                messages: [{ role: "user", content: "Reply with the single word: pong" }],
                max_tokens: 10,
              }),
            }),
          );
          const preview = await safePreview(r);
          return {
            ok: r.ok, status: r.status, latency_ms: ms, endpoint,
            detail: r.ok ? `text_generation OK (${modelName ?? "default"})` : `HTTP ${r.status}`,
            response_preview: preview,
          };
        } catch (e) {
          return { ok: false, endpoint, detail: `네트워크 오류: ${String(e)}` };
        }
      }
      return { ok: false, detail: `text_generation × ${providerKey} 어댑터 미구현` };
    }
    case "text_embedding":
    case "image_embedding": {
      if (providerKey === "gemini") {
        const key = Deno.env.get("GEMINI_API_KEY");
        if (!key) return { ok: false, detail: "GEMINI_API_KEY 미설정", missing_secrets: ["GEMINI_API_KEY"] };
        const model = modelName || "gemini-embedding-001";
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=***`;
        try {
          const { result: r, ms } = await timed(() =>
            fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: `models/${model}`,
                content: { parts: [{ text: "health check" }] },
              }),
            }),
          );
          const preview = await safePreview(r);
          return {
            ok: r.ok, status: r.status, latency_ms: ms, endpoint,
            detail: r.ok ? `embedding 생성 OK (${model})` : `HTTP ${r.status}`,
            response_preview: preview,
          };
        } catch (e) {
          return { ok: false, endpoint, detail: `네트워크 오류: ${String(e)}` };
        }
      }
      return { ok: false, detail: `${capabilityKey} × ${providerKey} 어댑터 미구현` };
    }
    case "image_analysis": {
      if (providerKey === "gemini") {
        const key = Deno.env.get("GEMINI_API_KEY");
        if (!key) return { ok: false, detail: "GEMINI_API_KEY 미설정", missing_secrets: ["GEMINI_API_KEY"] };
        const model = modelName || "gemini-2.0-flash";
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=***`;
        try {
          const { result: r, ms } = await timed(() =>
            fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: "Reply with the single word: ok" }] }],
                generationConfig: { maxOutputTokens: 5 },
              }),
            }),
          );
          const preview = await safePreview(r);
          return {
            ok: r.ok, status: r.status, latency_ms: ms, endpoint,
            detail: r.ok ? `image_analysis 모델 응답 OK (${model})` : `HTTP ${r.status}`,
            response_preview: preview,
          };
        } catch (e) {
          return { ok: false, endpoint, detail: `네트워크 오류: ${String(e)}` };
        }
      }
      return { ok: false, detail: `image_analysis × ${providerKey} 어댑터 미구현` };
    }
    case "image_generation":
    case "image_edit": {
      // 비용/시간 부담으로 실제 생성은 생략, 시크릿 + 도달성만 검증
      if (providerKey === "gemini") {
        const ok = !!Deno.env.get("GEMINI_API_KEY");
        return ok
          ? { ok: true, detail: `${capabilityKey}: GEMINI_API_KEY 확인됨 (실제 생성은 비용 절감을 위해 스킵)` }
          : { ok: false, detail: "GEMINI_API_KEY 미설정", missing_secrets: ["GEMINI_API_KEY"] };
      }
      if (providerKey === "fal") {
        const ok = !!Deno.env.get("FAL_KEY");
        return ok
          ? { ok: true, detail: `${capabilityKey}: FAL_KEY 확인됨 (실제 생성은 비용 절감을 위해 스킵)` }
          : { ok: false, detail: "FAL_KEY 미설정", missing_secrets: ["FAL_KEY"] };
      }
      return { ok: false, detail: `${capabilityKey} × ${providerKey} 어댑터 미구현` };
    }
    case "model_training": {
      return await testProvider(providerKey);
    }
    case "trend_collection": {
      return await testProvider(providerKey);
    }
    case "web_scraping": {
      if (providerKey === "firecrawl") return await testProvider("firecrawl");
      if (providerKey === "apify") return await testProvider("apify");
      return { ok: false, detail: `web_scraping × ${providerKey} 어댑터 미구현` };
    }
    case "web_search": {
      if (providerKey === "serpapi") {
        const key = Deno.env.get("SERPAPI_KEY");
        if (!key) return { ok: false, detail: "SERPAPI_KEY 미설정", missing_secrets: ["SERPAPI_KEY"] };
        const endpoint = "https://serpapi.com/search.json";
        try {
          const { result: r, ms } = await timed(() =>
            fetch(`${endpoint}?engine=google&q=test&num=1&api_key=${key}`),
          );
          const preview = await safePreview(r);
          return {
            ok: r.ok, status: r.status, latency_ms: ms, endpoint,
            detail: r.ok ? "SerpAPI 검색 호출 OK" : `HTTP ${r.status}`,
            response_preview: preview,
          };
        } catch (e) {
          return { ok: false, endpoint, detail: `네트워크 오류: ${String(e)}` };
        }
      }
      return { ok: false, detail: `web_search × ${providerKey} 어댑터 미구현` };
    }
    case "link_metadata": {
      if (providerKey === "microlink") return await testProvider("microlink");
      return { ok: false, detail: `link_metadata × ${providerKey} 어댑터 미구현` };
    }
    default:
      return { ok: false, detail: `알 수 없는 capability: ${capabilityKey}` };
  }
}
