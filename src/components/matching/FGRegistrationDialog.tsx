/**
 * FGRegistrationDialog (Modal D — FG 등록 대기 화면)
 * ─────────────────────────────────────────────────────────────────────
 * 패션고 변환에서 status='confirmed' 처리된 draft 들을 모아 보여줌.
 *  - 상단: Angel 워크플로우 단계 진행 표시 (현재 Stage = FG 등록)
 *  - 본문: 확정 상품 리스트 + 행 펼치기로 FG 필드 세부 보기
 *  - 푸터:
 *      [Excel 다운로드]  → confirmed drafts 를 xlsx 로 export
 *      [FG dev 서버 등록 (준비 중)]  → 비활성화
 *
 * FG dev 서버 연동 전 임시 화면. 실제 등록 로직 미구현.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, ChevronDown, ChevronRight, Download, CheckCircle2,
  Circle, Loader2, Package, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import NoImagePlaceholder from '@/components/common/NoImagePlaceholder';
import * as XLSX from 'xlsx';

interface ConfirmedRow {
  id: string;
  match_id: string;
  item_name: string | null;
  style_no: string | null;
  category: string | null;
  unit_price: number | null;
  msrp: number | null;
  color_size: string | null;
  material: string | null;
  weight_kg: number | null;
  made_in: string | null;
  pack: string | null;
  min_qty: number | null;
  description: string | null;
  fg_status: string | null;
  converted_image_url: string | null;
  status: string;
  updated_at: string;
  match: {
    id: string;
    match_score: number | null;
    sourceable_product: {
      id: string;
      item_name: string | null;
      item_name_en: string | null;
      image_url: string | null;
      source_url: string | null;
      unit_price_cny: number | null;
      unit_price_usd: number | null;
    } | null;
  } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onBackToConvert?: () => void;
}

const STAGES = [
  { key: 'trend',   label: '트렌드 분석' },
  { key: 'target',  label: '타겟상품 리스팅' },
  { key: 'source',  label: '소싱가능 상품과 매칭' },
  { key: 'confirm', label: '상품 컨펌' },
  { key: 'vendor',  label: '벤더 배분' },
  { key: 'convert', label: 'FG 변환' },
  { key: 'fg',      label: 'FG 등록' },
] as const;

const CURRENT_STAGE_INDEX = 6; // FG 등록

const FG_FIELD_LABELS: Array<{ key: keyof ConfirmedRow; label: string }> = [
  { key: 'item_name',  label: '상품명 (Item Name)' },
  { key: 'style_no',   label: '스타일번호 (Style#)' },
  { key: 'category',   label: '카테고리' },
  { key: 'unit_price', label: '판매가 ($)' },
  { key: 'msrp',       label: 'MSRP ($)' },
  { key: 'color_size', label: '컬러/사이즈' },
  { key: 'material',   label: '소재' },
  { key: 'weight_kg',  label: '중량 (kg)' },
  { key: 'made_in',    label: '원산지' },
  { key: 'pack',       label: '팩' },
  { key: 'min_qty',    label: '최소주문' },
  { key: 'fg_status',  label: '상태' },
];

export function FGRegistrationDialog({ open, onOpenChange, onBackToConvert }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: rows = [], isLoading, error: rowsError } = useQuery<ConfirmedRow[]>({
    queryKey: ['fg-confirmed-list'],
    enabled: open,
    refetchInterval: open ? 20000 : false,
    queryFn: async () => {
      // 1) draft 본체 (embed 없이 안전하게)
      const { data: drafts, error } = await supabase
        .from('fg_conversion_drafts' as any)
        .select(`
          id, match_id, item_name, style_no, category, unit_price, msrp,
          color_size, material, weight_kg, made_in, pack, min_qty,
          description, fg_status, converted_image_url, status, updated_at
        `)
        .eq('status', 'confirmed')
        .order('updated_at', { ascending: false });
      if (error) {
        console.error('[FGRegistrationDialog] drafts fetch failed', error);
        throw error;
      }
      const draftsArr = (drafts ?? []) as any[];
      if (draftsArr.length === 0) return [];

      // 2) 매칭 + 소싱 상품 정보를 별도로 조회 (embed 실패 회피)
      const matchIds = Array.from(new Set(draftsArr.map((d) => d.match_id).filter(Boolean)));
      const matchMap = new Map<string, ConfirmedRow['match']>();
      if (matchIds.length > 0) {
        const { data: matches, error: mErr } = await supabase
          .from('trend_sourceable_matches')
          .select(`
            id, match_score,
            sourceable_product:sourceable_products(
              id, item_name, item_name_en, image_url, product_url,
              unit_price_cny, unit_price_usd
            )
          `)
          .in('id', matchIds);
        if (mErr) {
          console.warn('[FGRegistrationDialog] matches fetch failed (continuing without)', mErr);
        } else {
          for (const m of (matches ?? []) as any[]) matchMap.set(m.id, m);
        }
      }
      return draftsArr.map((d) => ({ ...d, match: matchMap.get(d.match_id) ?? null })) as ConfirmedRow[];
    },
  });

  if (rowsError) console.error('[FGRegistrationDialog]', rowsError);

  const count = rows.length;

  const handleExcelDownload = () => {
    if (!rows.length) {
      toast.error('다운로드할 확정 상품이 없습니다.');
      return;
    }
    try {
      const sheetRows = rows.map((r, idx) => ({
        '#': idx + 1,
        'Item Name':   r.item_name ?? '',
        'Style#':      r.style_no ?? '',
        'Category':    r.category ?? '',
        'Unit Price ($)': r.unit_price ?? '',
        'MSRP ($)':    r.msrp ?? '',
        'Color/Size':  r.color_size ?? '',
        'Material':    r.material ?? '',
        'Weight (kg)': r.weight_kg ?? '',
        'Made In':     r.made_in ?? '',
        'Pack':        r.pack ?? '',
        'Min Qty':     r.min_qty ?? '',
        'Status':      r.fg_status ?? '',
        'Description': r.description ?? '',
        'Image URL':   r.converted_image_url ?? r.match?.sourceable_product?.image_url ?? '',
        'Source URL':  r.match?.sourceable_product?.product_url ?? '',
        'Match Score': r.match?.match_score ?? '',
        'Confirmed At': r.updated_at,
      }));
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'FG Confirmed');
      const ts = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `fg-confirmed-products_${ts}.xlsx`);
      toast.success(`엑셀 다운로드 완료 (${count}건)`);
    } catch (e: any) {
      toast.error(`엑셀 생성 실패: ${e?.message ?? String(e)}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="w-4 h-4" />
            FG 등록 대기 — 확정 상품 리스트
            <Badge variant="secondary" className="ml-2 tabular-nums">{count}건</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* ── 단계 진행 표시 ─────────────────────────────────────── */}
        <div className="px-6 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-1 overflow-x-auto">
            {STAGES.map((s, i) => {
              const done = i < CURRENT_STAGE_INDEX;
              const current = i === CURRENT_STAGE_INDEX;
              return (
                <div key={s.key} className="flex items-center gap-1 shrink-0">
                  <div
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap',
                      done && 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30',
                      current && 'text-primary bg-primary/10 font-semibold ring-1 ring-primary/30',
                      !done && !current && 'text-muted-foreground',
                    )}
                  >
                    {done ? <CheckCircle2 className="w-3.5 h-3.5" />
                          : current ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Circle className="w-3.5 h-3.5" />}
                    <span>{i + 1}. {s.label}</span>
                  </div>
                  {i < STAGES.length - 1 && (
                    <div className="w-4 h-px bg-border shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 상품 리스트 ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))
          ) : count === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              확정된 상품이 없습니다.
              <br />
              <span className="text-xs">패션고 변환 단계에서 상품을 확정해주세요.</span>
            </div>
          ) : (
            rows.map((r, idx) => {
              const expanded = expandedId === r.id;
              const img = r.converted_image_url ?? r.match?.sourceable_product?.image_url ?? null;
              return (
                <Card key={r.id} className="overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors"
                    onClick={() => setExpandedId(expanded ? null : r.id)}
                  >
                    <div className="text-xs text-muted-foreground tabular-nums w-6 shrink-0">
                      {idx + 1}
                    </div>
                    <div className="w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0">
                      {img ? (
                        <img
                          src={img}
                          alt={r.item_name ?? ''}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <NoImagePlaceholder className="w-full h-full" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {r.item_name || '(상품명 없음)'}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span className="font-mono">{r.style_no || '-'}</span>
                        <span>·</span>
                        <span>{r.category || '-'}</span>
                        {r.unit_price != null && (
                          <>
                            <span>·</span>
                            <span className="tabular-nums">${r.unit_price}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                      확정
                    </Badge>
                    {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </button>

                  {expanded && (
                    <div className="border-t bg-muted/20 px-4 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
                        {FG_FIELD_LABELS.map(({ key, label }) => {
                          const v = r[key];
                          return (
                            <div key={String(key)} className="text-xs">
                              <div className="text-muted-foreground">{label}</div>
                              <div className="font-medium truncate">
                                {v == null || v === '' ? <span className="text-muted-foreground">-</span> : String(v)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {r.description && (
                        <div className="mt-3 text-xs">
                          <div className="text-muted-foreground mb-1">설명</div>
                          <div className="whitespace-pre-wrap">{r.description}</div>
                        </div>
                      )}
                      {r.match?.sourceable_product?.product_url && (
                        <div className="mt-3 text-xs">
                          <a
                            href={r.match.sourceable_product.product_url}
                            target="_blank" rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            원본 상품 보기 →
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>

        {/* ── 푸터 ──────────────────────────────────────────────── */}
        <DialogFooter className="px-6 py-3 border-t bg-muted/30 gap-2 sm:gap-2 flex-row items-center">
          {onBackToConvert && (
            <Button size="sm" variant="ghost" onClick={onBackToConvert} className="gap-1.5 mr-auto">
              <ArrowLeft className="w-3.5 h-3.5" />
              패션고 변환으로
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleExcelDownload}
            disabled={count === 0}
            className="gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Excel 다운로드
          </Button>
          <Button
            size="sm"
            variant="default"
            disabled
            title="FG dev 서버 이관 후 활성화 예정"
            className="gap-1.5 opacity-60 cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
            FG dev 서버 등록 (준비 중)
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
