/**
 * FGConversionDialog (Modal C — 패션고 변환 작업창)
 * ─────────────────────────────────────────────────────────────────────
 * Modal B 의 [패션고 변환으로 →] 클릭 시 자동 오픈.
 * - active (벤더 배분 완료) 매칭 리스트
 * - 각 매칭의 FG 등록 데이터 자동 채움 (FGDataConvertDialog 의 FG_FIELDS 동일)
 * - 행 펼치기 → FG 필드 13개 편집 (자동 채움값 기반)
 * - [저장] draft 보관 / [확정] confirmed (FG 등록 대기)
 * - 상단 통계: 변환 대기 / 변환 완료
 *
 * Phase 1 (MVP): FG 필드 편집 + 저장/확정.
 * Phase 2 (나중): 중→영 SEO 번역, 가격 룰, 이미지 처리.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Palette, CheckCircle2, ChevronDown, ChevronRight, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import NoImagePlaceholder from '@/components/common/NoImagePlaceholder';
import {
  useFgConversionDrafts,
  useFgConfirmedCount,
  useFgDraftMutations,
  type FgDraftInput,
} from '@/hooks/useFgConversion';
import { useMatchAllocationsBatch } from '@/hooks/useMatchAllocations';
import { useResolvedVendors } from '@/integrations/va-api/use-resolved-vendors';

// ── FG 등록 필드 정의 (FGDataConvertDialog 와 동일) ────────────────
const FG_FIELDS: Array<{ key: keyof FgDraftInput; label: string; type?: 'number'; options?: string[] }> = [
  { key: 'item_name',  label: '상품명 (Item Name)' },
  { key: 'style_no',   label: '스타일번호 (Style#)' },
  { key: 'category',   label: '카테고리 (Category)' },
  { key: 'unit_price', label: '판매가 (Unit Price $)', type: 'number' },
  { key: 'msrp',       label: 'MSRP ($)', type: 'number' },
  { key: 'color_size', label: '컬러/사이즈 (Color/Size)' },
  { key: 'material',   label: '소재 (Material)' },
  { key: 'weight_kg',  label: '중량 (Weight kg)', type: 'number' },
  { key: 'made_in',    label: '원산지 (Made In)' },
  { key: 'pack',       label: '팩 (Pack)', options: ['Open-pack', 'Pre-pack'] },
  { key: 'min_qty',    label: '최소주문 (Min Qty)', type: 'number' },
  { key: 'fg_status',  label: '상태 (Status)', options: ['Active', 'Inactive', 'Discontinued'] },
];

interface ActiveMatch {
  id: string;
  match_score: number;
  trend_analysis_id: string;
  sourceable_product: {
    id: string;
    item_name: string | null;
    item_name_en: string | null;
    image_url: string | null;
    images: string[] | null;
    unit_price_usd: number | null;
    category: string | null;
    fg_category: string | null;
    material: string | null;
    color_size: string | null;
    weight_kg: number | null;
    style_no: string | null;
    product_no: string | null;
    detected_material: string | null;
    detected_colors: string[] | null;
  } | null;
  trend: {
    id: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    source_data: Record<string, any> | null;
    trend_keywords: string[] | null;
  } | null;
}

const PRODUCT_SELECT = `
  id, item_name, item_name_en, image_url, images,
  unit_price_usd, category, fg_category, material, color_size,
  weight_kg, style_no, product_no, detected_material, detected_colors
`.trim();

const TREND_SELECT = `id, source_data, trend_keywords`.trim();

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onBackToVendor?: () => void;
}

// ── 매칭 → FG 필드 자동 채움 (sourceable_product 필드 + 기본값) ────
// ai_analysis 는 sourceable_products 컬럼이 아님 (transient). 따라서 여기선
// 저장된 필드 + detected_* 폴백만 사용하고, 부족분은 runAIAnalyze 가 채움.
function buildDefaults(m: ActiveMatch): FgDraftInput {
  const sp = m.sourceable_product;
  return {
    match_id: m.id,
    item_name:  sp?.item_name_en ?? sp?.item_name ?? '',
    style_no:   sp?.style_no ?? sp?.product_no ?? '',
    category:   sp?.fg_category ?? sp?.category ?? '',
    unit_price: sp?.unit_price_usd ?? null,
    msrp:       null,
    color_size: sp?.color_size ?? (sp?.detected_colors?.join(', ') || ''),
    material:   sp?.material ?? sp?.detected_material ?? '',
    weight_kg:  sp?.weight_kg ?? null,
    made_in:    'China',
    pack:       'Open-pack',
    min_qty:    6,
    description: '',
    fg_status:  'Active',
  };
}

// ─────────────────────────────────────────────────────────────────────
export function FGConversionDialog({ open, onOpenChange, onBackToVendor }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { active: vendors } = useResolvedVendors();

  const [page, setPage] = useState(0);
  const pageSize = 8;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 행별 편집 버퍼: match_id -> FG 필드 값
  const [edits, setEdits] = useState<Record<string, FgDraftInput>>({});
  // AI 분석 상태: match_id -> 상태
  const [analyzeStatus, setAnalyzeStatus] = useState<Record<string, 'idle' | 'analyzing' | 'done' | 'error'>>({});
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);

  const { saveDraft, confirmDraft, unconfirmDraft } = useFgDraftMutations();

  useEffect(() => {
    if (open) { setPage(0); setExpandedId(null); setAnalyzeStatus({}); }
  }, [open]);

  // ── AI 이미지 분석 → FG 필드 자동 채움 (데모 analyze-product-image 동일) ──
  // 반환 analysis: { suggested_item_name, suggested_category, material_guess, color, product_type }
  const runAIAnalyze = useCallback(async (m: ActiveMatch): Promise<boolean> => {
    const sp = m.sourceable_product;
    if (!sp?.image_url) {
      setAnalyzeStatus((s) => ({ ...s, [m.id]: 'error' }));
      return false;
    }
    setAnalyzeStatus((s) => ({ ...s, [m.id]: 'analyzing' }));
    try {
      const { data, error } = await supabase.functions.invoke('analyze-product-image', {
        body: { image_url: sp.image_url },
      });
      if (error) throw new Error(error.message);
      if (data?.skipped || !data?.analysis) {
        setAnalyzeStatus((s) => ({ ...s, [m.id]: 'error' }));
        return false;
      }
      const a = data.analysis;
      setEdits((prev) => {
        const base = prev[m.id] ?? buildDefaults(m);
        return {
          ...prev,
          [m.id]: {
            ...base,
            match_id: m.id,
            item_name:  a.suggested_item_name || base.item_name || '',
            category:   a.suggested_category  || base.category  || '',
            material:   a.material_guess       || base.material  || '',
            color_size: a.color                || base.color_size || '',
          },
        };
      });
      setAnalyzeStatus((s) => ({ ...s, [m.id]: 'done' }));
      return true;
    } catch (err) {
      console.error('[FGConversionDialog] AI analyze failed', err);
      setAnalyzeStatus((s) => ({ ...s, [m.id]: 'error' }));
      return false;
    }
  }, []);

  // ── 변환 대기 (active 매칭 수) ────────────────────────────────────
  const { data: activeCount = 0 } = useQuery({
    queryKey: ['fg-active-count'],
    enabled: open,
    refetchInterval: open ? 15000 : false,
    queryFn: async () => {
      const { count } = await supabase
        .from('trend_sourceable_matches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      return count ?? 0;
    },
  });

  // ── 변환 완료 카운트 ─────────────────────────────────────────────
  const { data: confirmedCount = 0 } = useFgConfirmedCount(open);

  // ── 페이지 단위 active 매칭 ───────────────────────────────────────
  const { data: matches = [], isFetching } = useQuery<ActiveMatch[]>({
    queryKey: ['fg-active-list', page, pageSize],
    enabled: open,
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from('trend_sourceable_matches')
        .select(
          `id, match_score, trend_analysis_id,
           sourceable_product:sourceable_products(${PRODUCT_SELECT}),
           trend:trend_analyses(${TREND_SELECT})`,
        )
        .eq('status', 'active')
        .order('match_score', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as unknown as ActiveMatch[];
    },
  });

  const matchIds = useMemo(() => matches.map((m) => m.id), [matches]);
  const { data: draftMap } = useFgConversionDrafts(matchIds);
  const { data: allocMap } = useMatchAllocationsBatch(matchIds);

  const totalPages = Math.max(1, Math.ceil(activeCount / pageSize));

  useEffect(() => {
    if (page > 0 && page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  // 행 펼칠 때 편집 버퍼 초기화 (draft 있으면 draft 값, 없으면 자동 채움)
  // + 채워진 값이 비어있으면 AI 이미지 분석 자동 트리거 (한 번만).
  const toggleExpand = useCallback((m: ActiveMatch) => {
    if (expandedId === m.id) { setExpandedId(null); return; }
    setExpandedId(m.id);

    const existing = draftMap?.get(m.id);
    let buf: FgDraftInput;
    if (edits[m.id]) {
      buf = edits[m.id];
    } else if (existing) {
      buf = { ...existing, match_id: m.id } as FgDraftInput;
      setEdits((prev) => ({ ...prev, [m.id]: buf }));
    } else {
      buf = buildDefaults(m);
      setEdits((prev) => ({ ...prev, [m.id]: buf }));
    }

    // 자동 AI 분석 조건: draft 없음 + 아직 분석 안 함 + item_name 비어있음 + 이미지 있음
    const needsAnalyze =
      !existing &&
      !analyzeStatus[m.id] &&
      (!buf.item_name || String(buf.item_name).trim() === '') &&
      !!m.sourceable_product?.image_url;
    if (needsAnalyze) {
      void runAIAnalyze(m);
    }
  }, [expandedId, edits, draftMap, analyzeStatus, runAIAnalyze]);

  // 표시된 전체 행 AI 일괄 분석
  const handleBulkAnalyze = useCallback(async () => {
    setBulkAnalyzing(true);
    try {
      // 순차 (Edge Function 부하 분산) — draft 없고 분석 안 한 것만
      for (const m of matches) {
        const existing = draftMap?.get(m.id);
        if (existing) continue;
        if (analyzeStatus[m.id] === 'done' || analyzeStatus[m.id] === 'analyzing') continue;
        if (!m.sourceable_product?.image_url) continue;
        // eslint-disable-next-line no-await-in-loop
        await runAIAnalyze(m);
      }
      toast.success('표시된 항목 AI 분석 완료.');
    } finally {
      setBulkAnalyzing(false);
    }
  }, [matches, draftMap, analyzeStatus, runAIAnalyze]);

  const updateField = (matchId: string, key: keyof FgDraftInput, value: any) => {
    setEdits((prev) => ({ ...prev, [matchId]: { ...prev[matchId], match_id: matchId, [key]: value } }));
  };

  const handleSave = async (matchId: string) => {
    const input = edits[matchId];
    if (!input) return;
    await saveDraft.mutateAsync(input);
    toast.success('변환 데이터가 저장되었습니다.');
  };

  const handleConfirm = async (matchId: string) => {
    const input = edits[matchId];
    if (!input) return;
    await confirmDraft.mutateAsync(input);
    toast.success('변환 확정 — FG 등록 대기 상태가 되었습니다.');
    setExpandedId(null);
  };

  const allDone = !isFetching && activeCount === 0;
  const busy = saveDraft.isPending || confirmDraft.isPending || unconfirmDraft.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            패션고 변환
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            벤더 배분 완료된 매칭을 FashionGo 등록 데이터로 변환합니다.
            행 ▶ 클릭으로 펼쳐서 자동 채워진 필드를 검토·수정한 뒤 [확정] 하세요.
            확정된 항목은 FG 등록(다음 단계) 대기 상태가 됩니다.
          </p>
        </DialogHeader>

        {/* ── 상단 통계 ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 px-6 pt-4">
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground">변환 대기 (활성 매칭)</div>
            <div className="text-2xl font-bold tabular-nums">{activeCount.toLocaleString()}</div>
          </Card>
          <Card className="p-3 bg-green-50/50 border-green-100">
            <div className="text-[10px] text-green-700">✓ 변환 확정 (FG 등록 대기)</div>
            <div className="text-2xl font-bold tabular-nums text-green-700">{confirmedCount.toLocaleString()}</div>
          </Card>
        </div>

        {/* ── AI 일괄 분석 버튼 ───────────────────────────────────── */}
        {!allDone && matches.length > 0 && (
          <div className="px-6 pt-3">
            <div className="rounded-md border border-dashed bg-purple-50/40 px-3 py-2 flex items-center gap-2">
              <Wand2 className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
              <span className="text-[11px] text-muted-foreground flex-1">
                상품 이미지를 AI 로 분석해서 상품명·카테고리·소재·컬러를 자동으로 채웁니다.
              </span>
              <Button
                size="sm" variant="outline"
                className="h-7 text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
                disabled={bulkAnalyzing}
                onClick={handleBulkAnalyze}
              >
                {bulkAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                표시된 {matches.length}건 AI 자동 분석
              </Button>
            </div>
          </div>
        )}

        {/* ── 본문 ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {allDone ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <h3 className="text-base font-semibold">변환할 활성 매칭이 없습니다</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                벤더 배분(활성화) 된 매칭이 여기에 나타납니다. 먼저 벤더 배분을 진행하세요.
              </p>
              <Button onClick={() => onOpenChange(false)} size="sm" variant="outline" className="mt-2">닫기</Button>
            </div>
          ) : isFetching && matches.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} className="p-3"><Skeleton className="h-12 w-full" /></Card>
              ))}
            </div>
          ) : (
            matches.map((m) => {
              const sp = m.sourceable_product;
              const sd = (m.trend?.source_data ?? {}) as Record<string, string>;
              const tName = (sd.trend_name ?? sd.article_title ?? '—') as string;
              const spName = sp?.item_name_en ?? sp?.item_name ?? '—';
              const draft = draftMap?.get(m.id);
              const allocs = allocMap?.get(m.id) ?? [];
              const isExpanded = expandedId === m.id;
              const buf = edits[m.id];

              return (
                <Card key={m.id} className="p-0 overflow-hidden">
                  {/* 요약 행 */}
                  <div className="flex items-center gap-3 p-3">
                    {sp?.image_url ? (
                      <img src={sp.image_url} alt={spName} className="w-12 h-14 object-cover rounded border flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-14 flex-shrink-0"><NoImagePlaceholder size="sm" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground truncate">{tName}</p>
                      <p className="text-xs font-semibold truncate" title={spName}>{spName}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {allocs.length > 0 ? allocs.map((a) => {
                          const v = vendors.find((vv) => vv.id === a.vendor_id);
                          return (
                            <span key={a.vendor_id} className="inline-flex items-center text-[9px] text-white rounded-full px-1.5 py-0.5"
                                  style={{ backgroundColor: v?.color ?? '#94a3b8' }}>
                              {a.vendor_name ?? v?.name ?? a.vendor_id}
                            </span>
                          );
                        }) : (
                          <span className="text-[10px] text-amber-600">벤더 미배분</span>
                        )}
                      </div>
                    </div>
                    {/* 변환 상태 배지 */}
                    {draft?.status === 'confirmed' ? (
                      <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] gap-1">
                        <CheckCircle2 className="w-3 h-3" /> 확정됨
                      </Badge>
                    ) : draft?.status === 'draft' ? (
                      <Badge variant="outline" className="text-[10px]">임시저장</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">미변환</Badge>
                    )}
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 gap-1 text-xs"
                      onClick={() => toggleExpand(m)}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      {isExpanded ? '접기' : '변환 편집'}
                    </Button>
                  </div>

                  {/* 펼침: FG 필드 편집 */}
                  {isExpanded && buf && (
                    <div className="border-t bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {analyzeStatus[m.id] === 'analyzing' ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" /> AI 이미지 분석 중...</>
                          ) : (
                            <><Sparkles className="w-3.5 h-3.5 text-primary" /> 자동 채워진 FashionGo 등록 데이터 — 검토 후 수정하세요</>
                          )}
                        </div>
                        {sp?.image_url && (
                          <Button
                            size="sm" variant="outline"
                            className="h-7 text-[10px] gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
                            disabled={analyzeStatus[m.id] === 'analyzing'}
                            onClick={() => runAIAnalyze(m)}
                          >
                            <Wand2 className="w-3 h-3" />
                            {analyzeStatus[m.id] === 'done' ? 'AI 재분석' : 'AI 분석'}
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {FG_FIELDS.map((f) => {
                          const val = (buf as any)[f.key] ?? '';
                          return (
                            <div key={f.key as string} className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
                              {f.options ? (
                                <Select
                                  value={String(val || f.options[0])}
                                  onValueChange={(v) => updateField(m.id, f.key, v)}
                                >
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {f.options.map((opt) => (
                                      <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  className="h-8 text-xs"
                                  type={f.type === 'number' ? 'number' : 'text'}
                                  value={val}
                                  onChange={(e) => updateField(
                                    m.id, f.key,
                                    f.type === 'number'
                                      ? (e.target.value === '' ? null : Number(e.target.value))
                                      : e.target.value,
                                  )}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {/* description (전체폭) */}
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">상품설명 (Description)</Label>
                        <Input
                          className="h-8 text-xs"
                          value={(buf as any).description ?? ''}
                          onChange={(e) => updateField(m.id, 'description', e.target.value)}
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy}
                          onClick={() => handleSave(m.id)}>
                          {saveDraft.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '임시 저장'}
                        </Button>
                        {draft?.status === 'confirmed' ? (
                          <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={busy}
                            onClick={() => unconfirmDraft.mutate(m.id)}>
                            확정 취소
                          </Button>
                        ) : (
                          <Button size="sm" variant="default" className="h-8 text-xs gap-1" disabled={busy}
                            onClick={() => handleConfirm(m.id)}>
                            {confirmDraft.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            확정
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          )}

          {/* 페이지네이션 */}
          {!allDone && activeCount > pageSize && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-xs text-muted-foreground tabular-nums">
                {(page * pageSize + 1).toLocaleString()}–{Math.min((page + 1) * pageSize, activeCount).toLocaleString()} / {activeCount.toLocaleString()}건
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 0 || isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))}>◀ 이전</Button>
                <span className="text-xs tabular-nums px-2">{page + 1} / {totalPages}</span>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page >= totalPages - 1 || isFetching} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>다음 ▶</Button>
              </div>
            </div>
          )}
        </div>

        {/* ── 푸터 ───────────────────────────────────────────────── */}
        <DialogFooter className="px-6 py-3 border-t bg-muted/30 gap-2 sm:gap-2 flex-row items-center">
          {onBackToVendor && (
            <Button size="sm" variant="ghost" onClick={onBackToVendor} className="gap-1.5 mr-auto">
              <ArrowLeft className="w-3.5 h-3.5" />
              벤더 배분으로
            </Button>
          )}
          <Button
            size="sm" variant="outline"
            disabled
            title="FG dev 서버 이관 후 활성화 예정"
            className={onBackToVendor ? undefined : 'ml-auto'}
          >
            FG 등록으로 → (준비 중)
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
