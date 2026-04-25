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
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2, Settings2,
  PlayCircle, ChevronDown, ChevronUp, Clock, Zap,
} from "lucide-react";

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

type TestResult = {
  ok: boolean;
  detail: string;
  status?: number;
  latency_ms?: number;
  endpoint?: string;
  response_preview?: string;
  missing_secrets?: string[];
  provider_key?: string;
  model_name?: string | null;
  provider_active?: boolean;
  provider_implemented?: boolean;
  ran_at?: string;
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

function ResultPanel({ result }: { result: TestResult }) {
  const [showRaw, setShowRaw] = useState(false);
  const tone = result.ok
    ? "border-emerald-200 bg-emerald-50/60"
    : "border-red-200 bg-red-50/60";
  const Icon = result.ok ? CheckCircle2 : XCircle;
  const iconTone = result.ok ? "text-emerald-600" : "text-red-600";

  return (
    <div className={`mt-3 border rounded-md p-3 text-xs space-y-2 ${tone}`}>
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconTone}`} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground">{result.detail}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-muted-foreground">
            {result.ran_at && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {new Date(result.ran_at).toLocaleTimeString()}
              </span>
            )}
            {typeof result.status === "number" && (
              <span className="font-mono">HTTP {result.status}</span>
            )}
            {typeof result.latency_ms === "number" && (
              <span className="font-mono">{result.latency_ms} ms</span>
            )}
            {result.provider_key && (
              <span>provider: <span className="font-mono">{result.provider_key}</span></span>
            )}
            {result.model_name && (
              <span>model: <span className="font-mono">{result.model_name}</span></span>
            )}
            {result.provider_active === false && (
              <span className="text-amber-700">⚠ provider 비활성</span>
            )}
            {result.provider_implemented === false && (
              <span className="text-amber-700">⚠ 어댑터 미구현</span>
            )}
          </div>
          {result.endpoint && (
            <div className="mt-1 text-[10px] text-muted-foreground font-mono break-all">
              → {result.endpoint}
            </div>
          )}
          {result.missing_secrets && result.missing_secrets.length > 0 && (
            <div className="mt-1 text-[10px] text-red-700">
              누락된 시크릿: {result.missing_secrets.join(", ")}
            </div>
          )}
        </div>
      </div>

      {(result.response_preview || true) && (
        <div>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground underline"
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            raw response
          </button>
          {showRaw && (
            <pre className="mt-1 max-h-60 overflow-auto rounded bg-background border p-2 text-[10px] font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function AIToolSettings() {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testingCapability, setTestingCapability] = useState<string | null>(null);
  const [providerResults, setProviderResults] = useState<Record<string, TestResult>>({});
  const [capabilityResults, setCapabilityResults] = useState<Record<string, TestResult>>({});
  const [modelDraft, setModelDraft] = useState<Record<string, string>>({});
  const [runAll, setRunAll] = useState<{
    running: boolean;
    phase: "idle" | "providers" | "capabilities" | "done";
    current: string | null;
    done: number;
    total: number;
    startedAt: string | null;
    finishedAt: string | null;
  }>({ running: false, phase: "idle", current: null, done: 0, total: 0, startedAt: null, finishedAt: null });
  const [showRunAllRaw, setShowRunAllRaw] = useState(false);

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

  const handleTestProvider = async (provider_key: string) => {
    setTestingProvider(provider_key);
    const { data: res, error } = await supabase.functions.invoke("ai-tool-registry", {
      body: { action: "test_provider", provider_key },
    });
    setTestingProvider(null);
    if (error) {
      setProviderResults((m) => ({
        ...m,
        [provider_key]: { ok: false, detail: error.message, ran_at: new Date().toISOString() },
      }));
      return;
    }
    setProviderResults((m) => ({
      ...m,
      [provider_key]: { ...(res as TestResult), ran_at: new Date().toISOString() },
    }));
  };

  const handleTestCapability = async (capability_key: string) => {
    setTestingCapability(capability_key);
    const { data: res, error } = await supabase.functions.invoke("ai-tool-registry", {
      body: { action: "test_capability", capability_key },
    });
    setTestingCapability(null);
    if (error) {
      setCapabilityResults((m) => ({
        ...m,
        [capability_key]: { ok: false, detail: error.message, ran_at: new Date().toISOString() },
      }));
      return;
    }
    setCapabilityResults((m) => ({
      ...m,
      [capability_key]: { ...(res as TestResult), ran_at: new Date().toISOString() },
    }));
  };

  const handleTestAllProviders = async () => {
    if (!data) return;
    for (const p of data.providers) {
      await handleTestProvider(p.provider_key);
    }
  };

  const handleTestAllCapabilities = async () => {
    if (!data) return;
    for (const c of data.capabilities) {
      await handleTestCapability(c.capability_key);
    }
  };

  const handleRunAll = async () => {
    if (!data) return;
    const total = data.providers.length + data.capabilities.length;
    setProviderResults({});
    setCapabilityResults({});
    setRunAll({
      running: true, phase: "providers", current: null,
      done: 0, total, startedAt: new Date().toISOString(), finishedAt: null,
    });
    let done = 0;
    for (const p of data.providers) {
      setRunAll((s) => ({ ...s, phase: "providers", current: p.provider_key }));
      await handleTestProvider(p.provider_key);
      done += 1;
      setRunAll((s) => ({ ...s, done }));
    }
    for (const c of data.capabilities) {
      setRunAll((s) => ({ ...s, phase: "capabilities", current: c.capability_key }));
      await handleTestCapability(c.capability_key);
      done += 1;
      setRunAll((s) => ({ ...s, done }));
    }
    setRunAll((s) => ({ ...s, running: false, phase: "done", current: null, finishedAt: new Date().toISOString() }));
    toast({ title: "전체 테스트 완료", description: `${total}건 실행 완료` });
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
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> AI Provider 목록
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestAllProviders}
            disabled={!!testingProvider}
          >
            <PlayCircle className="w-3.5 h-3.5 mr-1" />
            전체 헬스체크
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {providers.map((p) => {
            const missingSecrets = p.required_secrets.filter((s) => !data.secret_status[s]);
            const result = providerResults[p.provider_key];
            return (
              <div key={p.provider_key} className="border rounded-lg p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{p.display_name}</span>
                      <Badge variant="outline" className="text-[10px]">{CATEGORY_LABEL[p.category] ?? p.category}</Badge>
                      {p.is_implemented ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">구현됨</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">어댑터 미구현</Badge>
                      )}
                      <code className="text-[10px] text-muted-foreground">{p.provider_key}</code>
                    </div>
                    {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {p.required_secrets.length === 0 && (
                        <span className="text-[10px] text-muted-foreground">시크릿 불필요</span>
                      )}
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
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={testingProvider === p.provider_key}
                      onClick={() => handleTestProvider(p.provider_key)}
                    >
                      {testingProvider === p.provider_key ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <><PlayCircle className="w-3.5 h-3.5 mr-1" /> 테스트</>
                      )}
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
                {result && <ResultPanel result={result} />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Capabilities */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">기능별 Provider 연결 & 테스트</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestAllCapabilities}
            disabled={!!testingCapability}
          >
            <PlayCircle className="w-3.5 h-3.5 mr-1" />
            전체 기능 테스트
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-xs text-muted-foreground -mt-2">
            각 기능에 대해 <strong>현재 binding된 Provider로 실제 호출</strong>을 시도합니다.
            응답 코드/지연/원시 응답을 확인한 뒤 운영에 사용하세요.
          </p>
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
                  const result = capabilityResults[cap.capability_key];
                  return (
                    <div key={cap.capability_key} className="border rounded-lg p-3">
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start">
                        <div className="min-w-0">
                          <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                            {cap.display_name}
                            <code className="text-[10px] text-muted-foreground">{cap.capability_key}</code>
                          </div>
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
                            <SelectTrigger className="w-[200px]">
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
                            className="w-[180px] text-xs font-mono"
                            placeholder="model name"
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
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!binding || testingCapability === cap.capability_key}
                            onClick={() => handleTestCapability(cap.capability_key)}
                          >
                            {testingCapability === cap.capability_key ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <><PlayCircle className="w-3.5 h-3.5 mr-1" /> 테스트</>
                            )}
                          </Button>
                          {savingKey === cap.capability_key && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                        </div>
                      </div>
                      {result && <ResultPanel result={result} />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        ⓘ 테스트는 시크릿 확인 + 가능한 경우 실제 endpoint 호출(저비용)을 수행합니다.
        이미지 생성/편집은 비용 절감을 위해 시크릿 확인까지만 진행합니다.
      </p>
    </div>
  );
}
