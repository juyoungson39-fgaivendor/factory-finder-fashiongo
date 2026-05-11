import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Play, Check, X, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type StatusKey = 'all' | 'candidate' | 'pending_confirm' | 'approved' | 'rejected' | 'live';

const STATUS_TABS: { key: StatusKey; label: string }[] = [
  { key: 'candidate', label: '후보' },
  { key: 'pending_confirm', label: '컨펌대기' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '거절' },
  { key: 'live', label: '활성' },
];

const REJECT_REASONS = [
  { v: 'price_too_high', l: '가격 너무 높음' },
  { v: 'design_low', l: '디자인 낮음' },
  { v: 'category_mismatch', l: '카테고리 불일치' },
  { v: 'factory_unreliable', l: '공장 신뢰도 낮음' },
  { v: 'other', l: '기타' },
];

export default function Matches() {
  const [status, setStatus] = useState<StatusKey>('candidate');
  const [targetId, setTargetId] = useState<string>('all');
  const [running, setRunning] = useState(false);

  const { data: targets = [] } = useQuery({
    queryKey: ['target-products-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('target_products' as any)
        .select('id, name')
        .order('created_at', { ascending: false });
      return (data as any[]) || [];
    },
  });

  const { data: counts = {} as Record<string, number> } = useQuery({
    queryKey: ['matches-counts', targetId],
    queryFn: async () => {
      let q = supabase.from('matches' as any).select('status');
      if (targetId !== 'all') q = q.eq('target_id', targetId);
      const { data } = await q;
      const c: Record<string, number> = {};
      (data as any[] || []).forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
      return c;
    },
  });

  const { data: matches = [], refetch } = useQuery({
    queryKey: ['matches', status, targetId],
    queryFn: async () => {
      let q = supabase
        .from('matches' as any)
        .select('*, target:target_products(name, category), product:sourceable_products(item_name, item_name_en, image_url, images, unit_price_usd), factory:factories(name, stock_score, oem_score)')
        .order('total_score', { ascending: false })
        .limit(200);
      if (status !== 'all') q = q.eq('status', status);
      if (targetId !== 'all') q = q.eq('target_id', targetId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const handleRerun = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('run-matching', {
        body: targetId === 'all' ? {} : { target_id: targetId },
      });
      if (error || !(data as any)?.ok) throw new Error(error?.message || 'unknown');
      toast.success(`✅ 매칭 ${(data as any).inserted}건 갱신 (전체 ${(data as any).total} 평가)`);
      refetch();
    } catch (e: any) {
      toast.error('매칭 실패: ' + e.message);
    } finally {
      setRunning(false);
    }
  };

  const handleApprove = async (id: string) => {
    await supabase.from('matches' as any).update({
      status: 'approved',
      confirmed_at: new Date().toISOString(),
    }).eq('id', id);
    toast.success('승인 완료');
    refetch();
  };

  const handleReject = async (id: string, reason: string) => {
    await supabase.from('matches' as any).update({
      status: 'rejected',
      rejection_reason: reason,
    }).eq('id', id);
    toast.success('거절 처리');
    refetch();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI 매칭 결과</h1>
          <p className="text-sm text-muted-foreground">Stage 3 — 타겟 상품과 소싱 후보 매칭</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="타깃 선택" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 타깃</SelectItem>
              {targets.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleRerun} disabled={running}>
            <Play className="w-4 h-4 mr-1" />
            {running ? '실행중...' : '매칭 재실행'}
          </Button>
        </div>
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as StatusKey)}>
        <TabsList>
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label} {counts[t.key] ? <span className="ml-1 text-[10px] opacity-70">{counts[t.key]}</span> : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {matches.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          매칭 결과가 없습니다. 타깃 상품을 정의 후 「매칭 재실행」을 눌러주세요.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {matches.map((m) => {
            const b = m.breakdown || {};
            const img = m.product?.image_url || (Array.isArray(m.product?.images) ? m.product.images[0] : null);
            return (
              <Card key={m.id} className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {img ? (
                    <img src={img} alt="" className="w-20 h-20 object-cover rounded-md flex-shrink-0" />
                  ) : (
                    <div className="w-20 h-20 bg-muted rounded-md flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-muted-foreground truncate">🎯 {m.target?.name || '-'}</div>
                    <div className="font-medium text-sm truncate">{m.product?.item_name_en || m.product?.item_name || '-'}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      공장: {m.factory?.name || '-'} {m.factory?.stock_score ? `(Stock ${Math.round(m.factory.stock_score)})` : ''}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge className="bg-primary text-primary-foreground">⭐ {Number(m.total_score).toFixed(2)}</Badge>
                      {m.product?.unit_price_usd && (
                        <span className="text-[11px]">${Number(m.product.unit_price_usd).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-1 text-[10px] text-center">
                  {[
                    ['카테고리', b.category],
                    ['키워드', b.keyword],
                    ['가격', b.price],
                    ['MOQ', b.moq],
                    ['공장', b.factory],
                  ].map(([label, v]) => {
                    const num = typeof v === 'number' ? v : null;
                    const color = num === null ? 'bg-muted' : num >= 0.8 ? 'bg-green-100 text-green-700' : num >= 0.5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
                    return (
                      <div key={label as string} className={`rounded p-1 ${color}`}>
                        <div className="font-medium">{label}</div>
                        <div>{num === null ? '-' : num.toFixed(2)}</div>
                      </div>
                    );
                  })}
                </div>

                {m.status === 'rejected' && m.rejection_reason && (
                  <div className="text-[11px] text-red-600">거절 사유: {REJECT_REASONS.find((r) => r.v === m.rejection_reason)?.l || m.rejection_reason}</div>
                )}

                {(m.status === 'candidate' || m.status === 'pending_confirm') && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="default" onClick={() => handleApprove(m.id)}>
                      <Check className="w-3 h-3 mr-1" /> 승인
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline">
                          <X className="w-3 h-3 mr-1" /> 거절
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {REJECT_REASONS.map((r) => (
                          <DropdownMenuItem key={r.v} onClick={() => handleReject(m.id, r.v)}>{r.l}</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {m.product_id && (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={`/factories/${m.factory_id || ''}`} target="_blank" rel="noreferrer">
                          <Search className="w-3 h-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
