import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';

/**
 * shop_id가 'PENDING_*'인 공장 행에 노출되는 1클릭 detail→shop 변환 버튼.
 * resolve-detail-to-shop edge function을 호출.
 */
export default function ResolveDetailButton({
  factoryId,
  onResolved,
}: {
  factoryId: string;
  onResolved?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('resolve-detail-to-shop', {
        body: { factory_id: factoryId },
      });
      if (error) {
        toast.error(`변환 실패: ${error.message}`);
        return;
      }
      if (!data?.ok) {
        toast.error(`변환 실패: ${data?.reason ?? 'unknown'}`);
      } else {
        toast.success(`✓ shop_id=${data.shop_id} (큐 투입됨)`);
        onResolved?.();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handle}
      disabled={loading}
      className="h-7 text-[11px] px-2 border-amber-300 text-amber-700 hover:bg-amber-50"
      title="Detail URL을 Shop URL로 변환하고 크롤 큐에 투입"
    >
      {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
      🔁 detail→shop
    </Button>
  );
}
