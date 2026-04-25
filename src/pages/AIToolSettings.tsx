import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Settings2 } from "lucide-react";

type Provider = {
  provider_key: string;
  display_name: string;
  description: string | null;
  category: string;
  required_secrets: string[];
  is_active: boolean;
  is_implemented: boolean;
};

type Capability = {
  capability_key: string;
  display_name: string;
  description: string | null;
  category: string;
  used_by: string[];
};

type Binding = {
  capability_key: string;
  provider_key: string;
  model_name: string | null;
  updated_at: string;
};

type RegistryResponse = {
  providers: Provider[];
  capabilities: Capability[];
  bindings: Binding[];
  secret_status: Record<string, boolean>;
  is_admin: boolean;
};

const CATEGORY_ORDER = ["image", "embedding", "text", "training", "data_collection"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  image: "이미지",
  embedding: "임베딩 (Vector)",
  text: "텍스트 / LLM",
  training: "학습 / 파인튜닝",
  data_collection: "데이터 수집",
  llm: "텍스트 / LLM",
};

export default function AIToolSettings() {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [modelDraft, setModelDraft] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("ai-tool-registry", {
      body: { action: "list" },
    });
    if (error) {
      toast({ title: "로드 실패", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    setData(res as RegistryResponse);
    const draft: Record<string, string> = {};
    for (const b of (res as RegistryResponse).bindings ?? []) {
      draft[b.capability_key] = b.model_name ?? "";
    }
    setModelDraft(draft);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const bindingMap = useMemo(() => {
    const map = new Map<string, Binding>();
    for (const b of data?.bindings ?? []) map.set(b.capability_key, b);
    return map;
  }, [data]);

  const groupedCapabilities = useMemo(() => {
    const map: Record<string, Capability[]> = {};
    for (const c of data?.capabilities ?? []) {
      (map[c.category] ??= []).push(c);
    }
    return map;
  }, [data]);

  const handleBindingSave = async (capability_key: string, provider_key: string) => {
    setSavingKey(capability_key);
    const model_name = modelDraft[capability_key]?.trim() || null;
    const { data: res, error } = await supabase.functions.invoke("ai-tool-registry", {
      body: { action: "set_binding", capability_key, provider_key, model_name },
    });
    setSavingKey(null);
    if (error || (res as { error?: string })?.error) {
      toast({ title: "저장 실패", description: error?.message ?? (res as { error?: string }).error, variant: "destructive" });
      return;
    }
    toast({ title: "저장됨", description: `${capability_key} → ${provider_key}` });
    void load();
  };

  const handleProviderToggle = async (provider_key: string, is_active: boolean) => {
    const { error } = await supabase.functions.invoke("ai-tool-registry", {
      body: { action: "set_provider_active", provider_key, is_active },
    });
    if (error) {
      toast({ title: "변경 실패", description: error.message, variant: "destructive" });
      return;
    }
    void load();
  };

  const handleTest = async (provider_key: string) => {
    setTesting(provider_key);
    const { data: res, error } = await supabase.functions.invoke("ai-tool-registry", {
      body: { action: "test_provider", provider_key },
    });
    setTesting(null);
    if (error) {
      toast({ title: "테스트 실패", description: error.message, variant: "destructive" });
      return;
    }
    const r = res as { ok: boolean; detail: string };
    toast({
      title: r.ok ? "✅ 정상" : "⚠ 문제 있음",
      description: r.detail,
      variant: r.ok ? "default" : "destructive",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> 로딩 중...
      </div>
    );
  }
  if (!data) return null;

  const providers = data.providers;
  const activeProviders = providers.filter((p) => p.is_active);

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4 flex items-center gap-2 text-sm text-amber-900">
            <AlertTriangle className="w-4 h-4" />
            읽기 전용 모드 — 변경하려면 관리자 권한이 필요합니다.
          </CardContent>
        </Card>
      )}

      {/* Providers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> AI Provider 목록
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {providers.map((p) => {
            const missingSecrets = p.required_secrets.filter((s) => !data.secret_status[s]);
            return (
              <div key={p.provider_key} className="border rounded-lg p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{p.display_name}</span>
                    <Badge variant="outline" className="text-[10px]">{CATEGORY_LABEL[p.category] ?? p.category}</Badge>
                    {p.is_implemented ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">구현됨</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">어댑터 미구현</Badge>
                    )}
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {p.required_secrets.map((s) => {
                      const ok = data.secret_status[s];
                      return (
                        <span key={s} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border ${ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                          {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {s}
                        </span>
                      );
                    })}
                  </div>
                  {missingSecrets.length > 0 && (
                    <p className="text-[11px] text-red-600 mt-1.5">누락된 시크릿이 있어 호출 시 실패합니다.</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" disabled={testing === p.provider_key} onClick={() => handleTest(p.provider_key)}>
                    {testing === p.provider_key ? <Loader2 className="w-3 h-3 animate-spin" /> : "테스트"}
                  </Button>
                  <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md">
                    <span className="text-xs text-muted-foreground">활성화</span>
                    <Switch
                      checked={p.is_active}
                      disabled={!isAdmin}
                      onCheckedChange={(v) => handleProviderToggle(p.provider_key, v)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기능별 Provider 연결</CardTitle>
          <p className="text-xs text-muted-foreground">
            각 기능이 어떤 Provider를 사용할지 지정합니다. 변경 사항은 즉시 저장되지만, 실제 코드 적용은 다음 단계에서 어댑터 연동을 통해 반영됩니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {CATEGORY_ORDER.map((cat) => {
            const items = groupedCapabilities[cat];
            if (!items?.length) return null;
            return (
              <div key={cat} className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">{CATEGORY_LABEL[cat] ?? cat}</h3>
                <Separator />
                {items.map((cap) => {
                  const binding = bindingMap.get(cap.capability_key);
                  const eligible = activeProviders;
                  return (
                    <div key={cap.capability_key} className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start py-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{cap.display_name}</div>
                        {cap.description && <p className="text-xs text-muted-foreground mt-0.5">{cap.description}</p>}
                        {cap.used_by.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {cap.used_by.map((u) => (
                              <Badge key={u} variant="outline" className="text-[9px] font-mono">{u}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                        <Select
                          value={binding?.provider_key}
                          disabled={!isAdmin}
                          onValueChange={(v) => handleBindingSave(cap.capability_key, v)}
                        >
                          <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="Provider 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {eligible.map((p) => (
                              <SelectItem key={p.provider_key} value={p.provider_key}>
                                {p.display_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          className="w-[200px] text-xs font-mono"
                          placeholder="model name (선택)"
                          value={modelDraft[cap.capability_key] ?? ""}
                          disabled={!isAdmin}
                          onChange={(e) => setModelDraft((d) => ({ ...d, [cap.capability_key]: e.target.value }))}
                          onBlur={() => {
                            if (!binding) return;
                            const next = modelDraft[cap.capability_key]?.trim() || "";
                            if ((binding.model_name ?? "") !== next) {
                              void handleBindingSave(cap.capability_key, binding.provider_key);
                            }
                          }}
                        />
                        {savingKey === cap.capability_key && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        ⓘ 1단계: 레지스트리 기반 구축. 2단계에서 각 Edge Function이 이 설정을 읽도록 어댑터를 연결합니다.
      </p>
    </div>
  );
}
