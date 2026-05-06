import React, { useState } from 'react';
import { Loader2, ExternalLink, Trash2, Check, X, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface ProductRow {
  id: string;
  product_no?: string;
  image_url?: string | null;
  category?: string | null;
  price?: number | null;
  weight_kg?: number | null;
  material?: string | null;
  color_size?: string | null;
  purchase_link?: string | null;
  source?: string;
  created_at: string;
  images?: string[];
  item_name?: string;
  item_name_en?: string | null;
  style_no?: string | null;
  unit_price?: number | null;
  unit_price_usd?: number | null;
  vendor_name?: string | null;
  source_url?: string | null;
  fg_category?: string | null;
  notes?: string | null;
  options?: any;
  weight?: number | null;
  factory_id?: string | null;
  trend_analysis_id?: string | null;
  status?: string;
  description?: string | null;
  description_source?: string | null;
  archived_at?: string | null;
  archived_reason?: string | null;
}

interface ProductTableProps {
  items: ProductRow[];
  isLoading: boolean;
  emptyText?: string;
  showSource?: boolean;
  tableName?: 'sourceable_products' | 'products';
  queryKey?: string[];
}

const InlineCell: React.FC<{
  value: string;
  editing: boolean;
  field: string;
  onChange: (field: string, val: string) => void;
  type?: 'text' | 'number';
  style?: React.CSSProperties;
}> = ({ value, editing, field, onChange, type = 'text', style }) => {
  if (!editing) return <span style={style}>{value || '—'}</span>;
  return (
    <Input
      type={type}
      defaultValue={value}
      onChange={(e) => onChange(field, e.target.value)}
      className="h-7 text-xs w-full min-w-[60px]"
    />
  );
};

const MAX_CONCURRENT = 3;

const ProductTable: React.FC<ProductTableProps> = ({
  items, isLoading, emptyText = '등록된 상품이 없습니다',
  tableName = 'sourceable_products', queryKey = ['sourceable-products'],
}) => {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);

  // ── 복원 mutation ─────────────────────────────────────────────────
  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from(tableName)
        .update({ status: 'active', archived_at: null, archived_reason: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: '✅ 복원 완료' });
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: any) => {
      toast({ title: '복원 실패', description: err.message, variant: 'destructive' });
    },
  });
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(0);

  // ── AI 상품설명 생성 상태 ──────────────────────────────────────────
  // undefined  = 아직 시도 안 함
  // null       = 실패/빈 응답 (—  표시)
  // string     = 성공한 설명
  const [localDesc, setLocalDesc] = useState<Record<string, string | null>>({});
  const [loadingDescIds, setLoadingDescIds] = useState<Set<string>>(new Set());
  const inFlightRef = React.useRef<Set<string>>(new Set());
  const concurrencyRef = React.useRef<number>(0);
  const queueRef = React.useRef<ProductRow[]>([]);

  const processQueue = React.useCallback(() => {
    while (concurrencyRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const row = queueRef.current.shift()!;
      generateDescription(row); // eslint-disable-line @typescript-eslint/no-use-before-define
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateDescription = React.useCallback(async (row: ProductRow) => {
    if (inFlightRef.current.has(row.id)) return;
    inFlightRef.current.add(row.id);
    concurrencyRef.current++;
    setLoadingDescIds(prev => { const s = new Set(prev); s.add(row.id); return s; });

    try {
      const { data, error } = await supabase.functions.invoke('generate-product-description', {
        body: {
          productId: row.id,
          imageUrl: row.image_url,
          category: row.category,
          material: row.material,
          colorSize: row.color_size,
        },
      });

      if (error) throw error;

      const description: string | undefined = data?.description;
      if (description && description.trim()) {
        // 로컬 즉시 반영
        setLocalDesc(prev => ({ ...prev, [row.id]: description }));
        // react-query 캐시 갱신 (다음 렌더 시 DB 재호출 없이 표시)
        queryClient.setQueryData<ProductRow[]>(queryKey, old =>
          (old ?? []).map(p => p.id === row.id ? { ...p, description } : p)
        );
      } else {
        setLocalDesc(prev => ({ ...prev, [row.id]: null }));
      }
    } catch (err) {
      console.error('[gen-desc]', err, row.id);
      setLocalDesc(prev => ({ ...prev, [row.id]: null }));
    } finally {
      inFlightRef.current.delete(row.id);
      concurrencyRef.current--;
      setLoadingDescIds(prev => { const s = new Set(prev); s.delete(row.id); return s; });
      processQueue();
    }
  }, [queryClient, queryKey, processQueue]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const isDragging = React.useRef(false);
  const startX = React.useRef(0);
  const scrollLeft = React.useRef(0);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pagedItems = items.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  React.useEffect(() => { setCurrentPage(0); }, [items.length, pageSize]);

  // description 없는 행 감지 → 생성 큐에 추가
  React.useEffect(() => {
    const needs = pagedItems.filter(p =>
      !p.description &&
      !inFlightRef.current.has(p.id) &&
      !(p.id in localDesc)
    );
    for (const row of needs) {
      if (!queueRef.current.some(q => q.id === row.id)) {
        queueRef.current.push(row);
      }
    }
    if (needs.length > 0) processQueue();
  // localDesc는 의존성에서 제외 — 생성 완료 후 재트리거 방지
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagedItems, processQueue]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    isDragging.current = true;
    startX.current = e.pageX - el.offsetLeft;
    scrollLeft.current = el.scrollLeft;
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    scrollRef.current.scrollLeft = scrollLeft.current - (x - startX.current);
  };
  const handleMouseUp = () => {
    isDragging.current = false;
    if (scrollRef.current) {
      scrollRef.current.style.cursor = 'grab';
      scrollRef.current.style.userSelect = '';
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    setEditDraft(prev => ({ ...prev, [field]: value }));
  };

  const startEdit = (row: ProductRow) => {
    setEditingId(row.id);
    setEditDraft({
      item_name: row.item_name ?? '',
      product_no: row.product_no ?? '',
      category: row.category ?? '',
      price: row.price != null ? String(row.price) : '',
      material: row.material ?? '',
      color_size: row.color_size ?? '',
      weight_kg: row.weight_kg != null ? String(row.weight_kg) : '',
      vendor_name: row.vendor_name ?? '',
      purchase_link: row.purchase_link ?? '',
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditDraft({}); };

  const saveEdit = async () => {
    if (!editingId) return;
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(editDraft)) {
      if (k === 'price' || k === 'weight_kg') {
        updates[k] = v ? Number(v) : null;
      } else {
        updates[k] = v || null;
      }
    }
    const { error } = await (supabase as any).from(tableName).update(updates).eq('id', editingId);
    if (error) {
      toast({ title: '수정 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ 수정 완료' });
      queryClient.invalidateQueries({ queryKey });
    }
    cancelEdit();
  };

  const confirmBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const { error } = await (supabase as any).from(tableName).delete().in('id', ids);
    if (error) {
      toast({ title: '일괄 삭제 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `🗑️ ${ids.length}개 상품 삭제 완료` });
      queryClient.invalidateQueries({ queryKey });
      setSelectedIds(new Set());
    }
    setShowBulkDelete(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const headers = ['', '이미지', '상품명', '소싱처', '소싱 공장', '상품코드', '카테고리', '상품설명', '공급가', '소재', '색상/사이즈', '무게(kg)', '등록일', ''];

  return (
    <>
      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 mb-2 rounded-lg bg-destructive/10 border border-destructive/20">
          <span className="text-sm font-medium text-destructive">{selectedIds.size}개 선택됨</span>
          <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={() => setShowBulkDelete(true)}>
            <Trash2 className="w-3 h-3" />선택 삭제
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>선택 해제</Button>
        </div>
      )}

      {/* ── 테이블 래퍼: 가로 스크롤 유지, 세로 스크롤 제거 ── */}
      <div
        ref={scrollRef}
        className="w-full overflow-x-auto rounded-lg border border-border cursor-grab"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1500 }}>
          <thead>
            <tr className="bg-muted/50">
              {headers.map((h, i) => (
                <th key={`${h}-${i}`} className="text-left text-[11px] font-medium text-muted-foreground tracking-wide px-3 py-2.5 border-b border-border whitespace-nowrap">
                  {i === 0 ? (
                    <Checkbox
                      checked={items.length > 0 && selectedIds.size === items.length}
                      onCheckedChange={toggleAll}
                      className="h-3.5 w-3.5"
                    />
                  ) : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedItems.map((p) => {
              const isEditing = editingId === p.id;
              const isSelected = selectedIds.has(p.id);
              // 상품설명: DB 값 우선, 없으면 로컬 생성 결과 사용
              const resolvedDesc: string | null | undefined =
                p.description || localDesc[p.id];
              const isLoadingDesc = loadingDescIds.has(p.id);

              return (
                <tr key={p.id} className={`border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors ${isSelected ? 'bg-primary/5' : ''} ${p.status === 'archived' ? 'opacity-60 hover:opacity-90' : ''}`}>
                  {/* Checkbox */}
                  <td className="px-3 py-2 w-8 align-top">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(p.id)}
                      className="h-3.5 w-3.5 mt-1"
                    />
                  </td>
                  {/* Image */}
                  <td className="px-3 py-2 align-top" style={{ width: 60 }}>
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.product_no} className="w-[50px] h-[62px] object-cover rounded border border-border" />
                    ) : (
                      <div className="w-[50px] h-[62px] rounded border border-border bg-muted flex items-center justify-center">
                        <span className="text-[9px] text-muted-foreground">No img</span>
                      </div>
                    )}
                  </td>
                  {/* Item Name */}
                  <td className="px-3 py-2 min-w-[200px] max-w-[300px] align-top">
                    {isEditing ? (
                      <InlineCell value={p.item_name ?? ''} editing={true} field="item_name" onChange={handleFieldChange} style={{ fontSize: 12, fontWeight: 500, color: 'hsl(var(--foreground))' }} />
                    ) : (
                      <div className="flex items-start gap-1.5 min-w-0 flex-wrap">
                        <span className="whitespace-normal break-words text-xs font-medium text-foreground">
                          {p.item_name || '—'}
                        </span>
                        {p.purchase_link && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={p.purchase_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0 text-muted-foreground hover:text-primary transition-colors mt-0.5"
                              >
                                <ExternalLink size={12} />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent><p>구매 링크 열기</p></TooltipContent>
                          </Tooltip>
                        )}
                        {p.status === 'archived' && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                            보관됨
                          </Badge>
                        )}
                      </div>
                    )}
                  </td>
                  {/* Vendor */}
                  <td className="px-3 py-2 min-w-[100px] align-top">
                    <InlineCell value={p.vendor_name ?? ''} editing={isEditing} field="vendor_name" onChange={handleFieldChange} style={{ fontSize: 12, color: 'hsl(var(--foreground))' }} />
                  </td>
                  {/* Factory */}
                  <td className="px-3 py-2 min-w-[100px] align-top">
                    {p.factory_id ? (
                      <Link to={`/factories/${p.factory_id}`} className="text-xs text-primary hover:underline font-medium">공장 보기</Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  {/* Product No */}
                  <td className="px-3 py-2 min-w-[140px] align-top">
                    <InlineCell value={p.product_no ?? ''} editing={isEditing} field="product_no" onChange={handleFieldChange} style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: 'hsl(var(--foreground))' }} />
                  </td>
                  {/* Category */}
                  <td className="px-3 py-2 align-top">
                    <InlineCell value={p.category ?? ''} editing={isEditing} field="category" onChange={handleFieldChange} style={{ fontSize: 12, background: 'hsl(var(--muted))', padding: '2px 8px', borderRadius: 4, color: 'hsl(var(--foreground))' }} />
                  </td>
                  {/* Description — AI 생성 */}
                  <td className="px-3 py-3 min-w-[280px] max-w-[420px] align-top whitespace-normal break-words text-sm leading-relaxed text-foreground/80">
                    {isLoadingDesc ? (
                      <div className="space-y-1.5">
                        <Skeleton className="h-3 w-[90%]" />
                        <Skeleton className="h-3 w-[80%]" />
                        <Skeleton className="h-3 w-[60%]" />
                      </div>
                    ) : resolvedDesc ? (
                      <div className="space-y-1">
                        {p.description_source === 'ai' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className="text-[10px] h-5 mb-1 gap-1 inline-flex items-center w-fit cursor-default">
                                <Sparkles className="h-3 w-3" />
                                AI작성
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>AI가 자동 생성한 설명입니다</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <span>{resolvedDesc}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {/* Price */}
                  <td className="px-3 py-2 whitespace-nowrap align-top">
                    {isEditing ? (
                      <Input type="number" defaultValue={editDraft.price} onChange={(e) => handleFieldChange('price', e.target.value)} className="h-7 text-xs w-20" />
                    ) : (
                      <span className="text-[13px] font-semibold text-foreground">{p.price != null ? `$${p.price.toFixed(2)}` : '—'}</span>
                    )}
                  </td>
                  {/* Material */}
                  <td className="px-3 py-2 max-w-[150px] align-top">
                    <InlineCell value={p.material ?? ''} editing={isEditing} field="material" onChange={handleFieldChange} style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }} />
                  </td>
                  {/* Color/Size */}
                  <td className="px-3 py-2 max-w-[200px] align-top">
                    <InlineCell value={p.color_size ?? ''} editing={isEditing} field="color_size" onChange={handleFieldChange} style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }} />
                  </td>
                  {/* Weight */}
                  <td className="px-3 py-2 align-top">
                    {isEditing ? (
                      <Input type="number" defaultValue={editDraft.weight_kg} onChange={(e) => handleFieldChange('weight_kg', e.target.value)} className="h-7 text-xs w-16" />
                    ) : (
                      <span className="text-xs text-muted-foreground">{p.weight_kg ? `${p.weight_kg}kg` : '—'}</span>
                    )}
                  </td>
                  {/* Created */}
                  <td className="px-3 py-2 text-[11px] text-muted-foreground whitespace-nowrap align-top">
                    {new Date(p.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  {/* Actions — right end */}
                  <td className="px-2 py-2 whitespace-nowrap align-top">
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEdit}><Check className="w-3.5 h-3.5 text-green-600" /></Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEdit}><X className="w-3.5 h-3.5 text-destructive" /></Button>
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        {p.status === 'archived' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-[56px] text-xs text-primary border-primary/40 hover:bg-primary/10"
                            onClick={() => setRestoreId(p.id)}
                          >
                            복원
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="h-7 w-[80px] text-xs" onClick={() => startEdit(p)}>수정하기</Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="py-10 text-center text-muted-foreground text-sm">{emptyText}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination bar */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value={10}>10개씩 보기</option>
            <option value={20}>20개씩 보기</option>
            <option value={50}>50개씩 보기</option>
            <option value={100}>100개씩 보기</option>
          </select>
          <span className="text-xs text-muted-foreground">
            {items.length > 0 ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, items.length)} / ${items.length}개` : '0개'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 text-xs px-2" disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}>이전</Button>
          <span className="text-xs text-muted-foreground px-1">{currentPage + 1} / {totalPages}</span>
          <Button size="sm" variant="outline" className="h-7 text-xs px-2" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)}>다음</Button>
        </div>
      </div>

      {/* Restore dialog */}
      <AlertDialog open={!!restoreId} onOpenChange={(open) => !open && setRestoreId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>활성으로 복원</AlertDialogTitle>
            <AlertDialogDescription>
              이 상품을 활성 상태로 복원하시겠습니까? 복원하면 트렌드 매칭 풀에 다시 포함됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (restoreId) {
                  restoreMutation.mutate(restoreId);
                  setRestoreId(null);
                }
              }}
            >
              복원
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete dialog */}
      <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>일괄 삭제</AlertDialogTitle>
            <AlertDialogDescription>선택한 {selectedIds.size}개 상품을 모두 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">전체 삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ProductTable;
