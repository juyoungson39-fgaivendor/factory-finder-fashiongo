import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

// ─────────────────────────────────────────────────────────────────
// types
// ─────────────────────────────────────────────────────────────────
export interface ExchangeRateData {
  cny_to_usd_rate:  number;
  rate_updated_at:  string | null;
  rate_updated_by:  string | null;
  rate_source:      string | null;
}

// ─────────────────────────────────────────────────────────────────
// useExchangeRate — system_settings id=1 에서 환율 조회
// ─────────────────────────────────────────────────────────────────
export function useExchangeRate() {
  return useQuery<ExchangeRateData>({
    queryKey: ['exchange-rate'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('system_settings')
        .select('cny_to_usd_rate, rate_updated_at, rate_updated_by, rate_source')
        .eq('id', 1)
        .single();
      if (error) throw error;
      return data as ExchangeRateData;
    },
    staleTime: 5 * 60 * 1000,  // 5분 캐시
  });
}

// ─────────────────────────────────────────────────────────────────
// useUpdateExchangeRate — admin 전용 환율 업데이트
// ─────────────────────────────────────────────────────────────────
export function useUpdateExchangeRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (newRate: number) => {
      const { error } = await (supabase as any)
        .from('system_settings')
        .update({
          cny_to_usd_rate: newRate,
          rate_updated_at: new Date().toISOString(),
          rate_source: 'manual',
        })
        .eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exchange-rate'] });
      toast({ title: '✅ 환율 업데이트 완료' });
    },
    onError: (err: any) => {
      const msg = err?.message ?? '';
      if (msg.includes('permission') || msg.includes('403') || msg.includes('policy')) {
        toast({ title: '권한 없음', description: '환율 업데이트는 관리자만 가능합니다.', variant: 'destructive' });
      } else {
        toast({ title: '업데이트 실패', description: msg, variant: 'destructive' });
      }
    },
  });
}
