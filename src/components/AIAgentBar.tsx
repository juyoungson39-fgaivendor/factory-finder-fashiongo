import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import FGDataConvertDialog from '@/components/agent/FGDataConvertDialog';

const STEPS = [
  { num: '①', name: '트렌드', badge: '100', done: true, current: false },
  { num: '②', name: '매칭', badge: '9', done: true, current: false },
  { num: '③', name: '컨펌', badge: '12', done: false, current: true },
  { num: '④', name: '배분', badge: '', done: false, current: false },
  { num: '⑤', name: 'FG변환', badge: '', done: false, current: false },
  { num: '⑥', name: '등록', badge: '', done: false, current: false },
] as const;

/** Compact one-line bar for the global header */
export const AIAgentBarCompact = () => {
  return (
    <div className="flex items-center gap-4 w-full">
      <span className="font-bold text-sm shrink-0">🤖 AI Sourcing Agent</span>
      <div className="flex items-center gap-1 flex-1 justify-center">
        {STEPS.map((s, i) =>
          <div key={i} className="flex items-center gap-1">
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${s.current ? 'bg-warning text-warning-foreground' : s.done ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'}`}>
                {s.done ? '✓' : i + 1}
              </div>
              <span className={`text-[11px] font-medium hidden lg:inline ${s.current ? 'text-foreground' : s.done ? 'text-destructive' : 'text-muted-foreground'}`}>{s.name}</span>
              {s.badge && <span className={`text-[10px] font-bold hidden lg:inline ${s.current ? 'text-warning' : s.done ? 'text-destructive' : 'text-muted-foreground'}`}>{s.badge}</span>}
            </div>
            {i < 5 && <span className={`text-[10px] mx-0.5 ${s.done ? 'text-destructive' : 'text-muted-foreground/30'}`}>→</span>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="px-2 py-0.5 bg-warning/15 text-warning text-[10px] rounded-full font-medium">⏳ 컨펌 대기</span>
        <span className="text-[10px] text-muted-foreground hidden md:inline">03.24 06:00</span>
        <button className="px-2.5 py-1 bg-destructive text-destructive-foreground text-[10px] rounded font-medium">지금 실행</button>
      </div>
    </div>
  );
};

/** Full detailed card for the Dashboard page */
const AIAgentBar = () => {
  const [open, setOpen] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["agent-confirm-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sourceable_products")
        .select("*")
        .eq("source", "agent")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: showModal,
  });

  return (
    <>
      <div className="mb-4 rounded-lg border border-border bg-card">
        {!open ? (
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">🤖 Angel Agent</span>
              <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[11px] rounded-full">⏳ 컨펌 대기</span>
              <span className="text-[11px] text-muted-foreground">다음 실행: 월 06:00</span>
            </div>
            <button onClick={() => setOpen(true)} className="text-xs text-muted-foreground px-2 py-1">표시 ∨</button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-bold">🤖 Angel Agent</span>
                <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-xs rounded-full animate-pulse">⏳ 컨펌 대기</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">마지막 실행: 2026.03.24 06:00</span>
                <button className="px-3 py-1 bg-destructive text-destructive-foreground text-xs rounded">지금 실행</button>
                <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground px-2">숨기기 ∧</button>
              </div>
            </div>
            <div className="flex items-start gap-1 overflow-x-auto pb-1">
              {STEPS.map((s, i) =>
                <div key={i} className="flex items-center gap-1 shrink-0">
                  <div className={`flex flex-col items-center w-[88px] px-2 py-2 rounded-lg border text-center ${s.current ? 'border-orange-300 bg-orange-50' : s.done ? 'border-red-100 bg-red-50' : 'border-border bg-muted/20'}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${s.current ? 'bg-orange-500 text-white' : s.done ? 'bg-destructive text-white' : 'bg-muted text-muted-foreground'}`}>
                      {s.done ? '✓' : s.num}
                    </div>
                    <span className="text-[11px] font-medium leading-tight">{s.name}</span>
                    {s.badge && <span className={`text-[11px] font-bold mt-0.5 ${s.current ? 'text-orange-500' : s.done ? 'text-destructive' : 'text-muted-foreground'}`}>{s.badge}</span>}
                  </div>
                  {i < 5 && <span className={`text-base font-bold ${s.done ? 'text-destructive' : 'text-muted-foreground/20'}`}>→</span>}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">다음 자동 실행: 월요일 06:00</span>
              <button onClick={() => setShowModal(true)} className="px-4 py-1.5 bg-destructive text-destructive-foreground text-sm rounded font-medium">
                📋 상품 확인하기 →
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl border w-full max-w-4xl max-h-[85vh] flex flex-col">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h2 className="font-bold">상품 컨펌</h2>
                <p className="text-xs text-muted-foreground mt-0.5">AI가 선별한 후보 상품을 검토하고 등록할 상품을 선택하세요 ({products.length}개)</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground text-lg">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">후보 상품이 없습니다</p>
                  <p className="text-xs">AI Agent를 실행하면 후보 상품이 표시됩니다</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground text-xs">
                      <th className="pb-2 pr-2">이미지</th>
                      <th className="pb-2 pr-2">상품코드</th>
                      <th className="pb-2 pr-2">상품명</th>
                      <th className="pb-2 pr-2">카테고리</th>
                      <th className="pb-2 pr-2">단가</th>
                      <th className="pb-2 pr-2">소재</th>
                      <th className="pb-2">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 pr-2">
                          {p.image_url ? (
                            <img src={p.image_url} alt="" className="w-10 h-10 object-cover rounded" />
                          ) : (
                            <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-[10px] text-muted-foreground">N/A</div>
                          )}
                        </td>
                        <td className="py-2 pr-2 font-mono text-xs">{p.product_no || p.style_no || '-'}</td>
                        <td className="py-2 pr-2 max-w-[200px] truncate">{p.item_name || '-'}</td>
                        <td className="py-2 pr-2 text-xs">{p.category || p.fg_category || '-'}</td>
                        <td className="py-2 pr-2 text-xs">
                          {p.unit_price ? `¥${p.unit_price}` : p.price ? `¥${p.price}` : '-'}
                        </td>
                        <td className="py-2 pr-2 text-xs">{p.material || '-'}</td>
                        <td className="py-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                            {p.status || 'active'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-4 border-t flex items-center justify-end">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded text-sm">닫기</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIAgentBar;
