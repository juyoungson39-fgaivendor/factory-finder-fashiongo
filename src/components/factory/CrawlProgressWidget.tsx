import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2 } from "lucide-react";

/**
 * Phase 1 AI 스코어링 진행률 위젯.
 * factories.score_status === 'ai_scored' 비율을 5초마다 폴링하여 표시.
 * 외부 크롤러(Apify / Claude Code 로컬)가 webhook으로 결과를 push하면 자동 반영됨.
 */
export const CrawlProgressWidget = () => {
  const { data } = useQuery({
    queryKey: ["factory-crawl-progress"],
    queryFn: async () => {
      const { count: total, error: e1 } = await supabase
        .from("factories")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);
      if (e1) throw e1;

      const { count: scored, error: e2 } = await supabase
        .from("factories")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("score_status", "ai_scored");
      if (e2) throw e2;

      return { total: total ?? 0, scored: scored ?? 0 };
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  if (!data || data.total === 0) return null;

  const pct = data.total > 0 ? Math.round((data.scored / data.total) * 100) : 0;
  const isDone = data.scored === data.total;

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
          {data.scored} / {data.total}건 ({pct}%)
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <p className="mt-2 text-[11px] text-muted-foreground">
        외부 크롤러(Claude Code · Apify)에서 webhook 결과 수신 시 자동 갱신 · 5초마다 폴링
      </p>
    </div>
  );
};

export default CrawlProgressWidget;
