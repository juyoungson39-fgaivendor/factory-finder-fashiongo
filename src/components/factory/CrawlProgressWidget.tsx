import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Phase 1 AI 스코어링 진행률 위젯.
 * v_crawl_progress 뷰를 5초마다 폴링하여 활성(soft-delete 제외) factories의
 * scored / pending / errors / null_shop_id 카운트를 한 번에 표시.
 * 외부 크롤러(Apify / Claude Code 로컬)가 webhook으로 결과를 push하면 자동 반영됨.
 */
export const CrawlProgressWidget = () => {
  const { data } = useQuery({
    queryKey: ["factory-crawl-progress"],
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("v_crawl_progress")
        .select("total, scored, pending, errors, null_shop_id, pct_done")
        .maybeSingle();
      if (error) throw error;
      return row ?? {
        total: 0,
        scored: 0,
        pending: 0,
        errors: 0,
        null_shop_id: 0,
        pct_done: 0,
      };
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  if (!data || (data.total ?? 0) === 0) return null;

  const total = data.total ?? 0;
  const scored = data.scored ?? 0;
  const pending = data.pending ?? 0;
  const errors = data.errors ?? 0;
  const nullShopId = data.null_shop_id ?? 0;
  const pct = Number(data.pct_done ?? 0);
  const isDone = scored === total && pending === 0;

  return (
    <div className="mb-4 p-3 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          {isDone ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
          ) : (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          )}
          AI 스코어 진행률
        </span>
        <span className="font-mono tabular-nums text-foreground">
          {scored} / {total}건 ({pct}%)
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>대기 <span className="font-mono tabular-nums text-foreground">{pending}</span></span>
        <span className="opacity-50">·</span>
        <span className={errors > 0 ? "flex items-center gap-1 text-destructive" : "flex items-center gap-1"}>
          {errors > 0 && <AlertCircle className="w-3 h-3" />}
          오류 <span className="font-mono tabular-nums">{errors}</span>
        </span>
        {nullShopId > 0 && (
          <>
            <span className="opacity-50">·</span>
            <span>shop_id 미상 <span className="font-mono tabular-nums text-foreground">{nullShopId}</span></span>
          </>
        )}
        <span className="opacity-50">·</span>
        <span>5초마다 갱신</span>
      </div>
    </div>
  );
};

export default CrawlProgressWidget;
