import React, { useState } from 'react';
import { Loader2, ExternalLink, Pencil, Trash2, Check, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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

const ProductTable: React.FC<ProductTableProps> = ({
  items, isLoading, emptyText = '등록된 상품이 없습니다',
  tableName = 'sourceable_products', queryKey = ['sourceable-products'],
}) => {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  const handleFieldChange = (field: string, value: string) => {
    setEditDraft(prev => ({ ...prev, [field]: value }));
  };

  const startEdit = (row: ProductRow) => {
    setEditingId(row.id);
    setEditDraft({
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

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await (supabase as any).from(tableName).delete().eq('id', deleteId);
    if (error) {
      toast({ title: '삭제 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '🗑️ 삭제 완료' });
      queryClient.invalidateQueries({ queryKey });
    }
    setDeleteId(null);
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

  const headers = ['', '이미지', '소싱처', '소싱 공장', '상품코드', '카테고리', '공급가', '소재', '색상/사이즈', '무게(kg)', '구매링크', '등록일', ''];

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

      <div className="w-full overflow-auto rounded-lg border border-border">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
            {items.map((p) => {
              const isEditing = editingId === p.id;
              const isSelected = selectedIds.has(p.id);
              return (
                <tr key={p.id} className={`border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                  {/* Checkbox */}
                  <td className="px-3 py-2 w-8">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(p.id)}
                      className="h-3.5 w-3.5"
                    />
                  </td>
                  {/* Image */}
                  <td className="px-3 py-2" style={{ width: 60 }}>
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.product_no} className="w-[50px] h-[62px] object-cover rounded border border-border" />
                    ) : (
                      <div className="w-[50px] h-[62px] rounded border border-border bg-muted flex items-center justify-center">
                        <span className="text-[9px] text-muted-foreground">No img</span>
                      </div>
                    )}
                  </td>
                  {/* Vendor */}
                  <td className="px-3 py-2 min-w-[100px]">
                    <InlineCell value={p.vendor_name ?? ''} editing={isEditing} field="vendor_name" onChange={handleFieldChange} style={{ fontSize: 12, color: 'hsl(var(--foreground))' }} />
                  </td>
                  {/* Factory */}
                  <td className="px-3 py-2 min-w-[100px]">
                    {p.factory_id ? (
                      <Link to={`/factories/${p.factory_id}`} className="text-xs text-primary hover:underline font-medium">공장 보기</Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  {/* Product No */}
                  <td className="px-3 py-2 min-w-[140px]">
                    <InlineCell value={p.product_no ?? ''} editing={isEditing} field="product_no" onChange={handleFieldChange} style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: 'hsl(var(--foreground))' }} />
                  </td>
                  {/* Category */}
                  <td className="px-3 py-2">
                    <InlineCell value={p.category ?? ''} editing={isEditing} field="category" onChange={handleFieldChange} style={{ fontSize: 12, background: 'hsl(var(--muted))', padding: '2px 8px', borderRadius: 4, color: 'hsl(var(--foreground))' }} />
                  </td>
                  {/* Price */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {isEditing ? (
                      <Input type="number" defaultValue={editDraft.price} onChange={(e) => handleFieldChange('price', e.target.value)} className="h-7 text-xs w-20" />
                    ) : (
                      <span className="text-[13px] font-semibold text-foreground">{p.price != null ? `$${p.price.toFixed(2)}` : '—'}</span>
                    )}
                  </td>
                  {/* Material */}
                  <td className="px-3 py-2 max-w-[150px]">
                    <InlineCell value={p.material ?? ''} editing={isEditing} field="material" onChange={handleFieldChange} style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }} />
                  </td>
                  {/* Color/Size */}
                  <td className="px-3 py-2 max-w-[200px]">
                    <InlineCell value={p.color_size ?? ''} editing={isEditing} field="color_size" onChange={handleFieldChange} style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }} />
                  </td>
                  {/* Weight */}
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <Input type="number" defaultValue={editDraft.weight_kg} onChange={(e) => handleFieldChange('weight_kg', e.target.value)} className="h-7 text-xs w-16" />
                    ) : (
                      <span className="text-xs text-muted-foreground">{p.weight_kg ? `${p.weight_kg}kg` : '—'}</span>
                    )}
                  </td>
                  {/* Purchase Link */}
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <Input defaultValue={editDraft.purchase_link} onChange={(e) => handleFieldChange('purchase_link', e.target.value)} className="h-7 text-xs w-24" />
                    ) : p.purchase_link ? (
                      <a href={p.purchase_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink size={12} /> 링크
                      </a>
                    ) : '—'}
                  </td>
                  {/* Created */}
                  <td className="px-3 py-2 text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(p.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  {/* Actions — right end */}
                  <td className="px-2 py-2 whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEdit}><Check className="w-3.5 h-3.5 text-green-600" /></Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEdit}><X className="w-3.5 h-3.5 text-destructive" /></Button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(p)}><Pencil className="w-3 h-3 text-muted-foreground" /></Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setDeleteId(p.id)}><Trash2 className="w-3 h-3 text-destructive/70" /></Button>
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

      {/* Single delete dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>상품 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 상품을 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">삭제</AlertDialogAction>
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
