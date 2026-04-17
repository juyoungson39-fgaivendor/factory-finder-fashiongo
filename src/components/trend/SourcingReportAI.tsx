import { FileText, Copy, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface SourcingOpportunity {
  rank: number;
  trend_title: string;
  recommended_products: string[];
  reason: string;
  estimated_demand: 'high' | 'medium' | 'low';
  suggested_price_range: string;
  target_buyer_segment: string;
}

export interface CategoryInsight {
  category: string;
  trend_direction: 'rising' | 'stable' | 'declining';
  key_styles: string[];
  recommendation: string;
}

export interface SourcingReportData {
  executive_summary: string;
  top_opportunities: SourcingOpportunity[];
  category_insights: CategoryInsight[];
  action_items: string[];
  risk_alerts: string[];
}

export interface ReportHistoryItem {
  id: string;
  generated_at: string;
  period_days: number;
  summary: string | null;
}

interface SourcingReportAIProps {
  report: SourcingReportData | null;
  history: ReportHistoryItem[];
  selectedId: string | null;
  onSelectReport: (id: string) => void;
  loading: boolean;
  onCopy: () => void;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function demandBadgeVariant(demand: SourcingOpportunity['estimated_demand']) {
  if (demand === 'high') return 'default';
  if (demand === 'medium') return 'secondary';
  return 'outline';
}

function demandLabel(demand: SourcingOpportunity['estimated_demand']) {
  if (demand === 'high') return '수요 높음';
  if (demand === 'medium') return '수요 보통';
  return '수요 낮음';
}

function demandColor(demand: SourcingOpportunity['estimated_demand']) {
  if (demand === 'high') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (demand === 'medium') return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-slate-500 bg-slate-50 border-slate-200';
}

function directionIcon(direction: CategoryInsight['trend_direction']) {
  if (direction === 'rising') return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (direction === 'declining') return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-slate-400" />;
}

function directionLabel(direction: CategoryInsight['trend_direction']) {
  if (direction === 'rising') return '상승';
  if (direction === 'declining') return '하락';
  return '안정';
}

function directionColor(direction: CategoryInsight['trend_direction']) {
  if (direction === 'rising') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (direction === 'declining') return 'text-red-600 bg-red-50 border-red-200';
  return 'text-slate-500 bg-slate-50 border-slate-200';
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

// ─────────────────────────────────────────────────────────────
// Loading Skeleton
// ─────────────────────────────────────────────────────────────
const ReportSkeleton = () => (
  <div className="space-y-4">
    {/* Executive summary */}
    <Card>
      <CardContent className="p-4 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </CardContent>
    </Card>
    {/* Opportunity cards */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Opportunity Card
// ─────────────────────────────────────────────────────────────
const OpportunityCard = ({ opp }: { opp: SourcingOpportunity }) => (
  <Card className="flex flex-col h-full">
    <CardHeader className="pb-2 pt-4 px-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center shrink-0">
            {opp.rank}
          </span>
          <CardTitle className="text-sm font-semibold leading-snug line-clamp-2">
            {opp.trend_title}
          </CardTitle>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        <span
          className={cn(
            'text-[10px] px-2 py-0.5 rounded-full border font-medium',
            demandColor(opp.estimated_demand)
          )}
        >
          {demandLabel(opp.estimated_demand)}
        </span>
        {opp.suggested_price_range && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600 font-medium tabular-nums">
            {opp.suggested_price_range}
          </span>
        )}
      </div>
    </CardHeader>
    <CardContent className="pt-0 pb-4 px-4 flex flex-col gap-2.5 flex-1">
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
        {opp.reason}
      </p>

      {opp.recommended_products && opp.recommended_products.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            추천 상품
          </p>
          <ul className="space-y-0.5">
            {opp.recommended_products.slice(0, 3).map((p, i) => (
              <li key={i} className="flex items-center gap-1 text-[11px] text-foreground">
                <ChevronRight className="w-3 h-3 text-primary shrink-0" />
                <span className="line-clamp-1">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {opp.target_buyer_segment && (
        <div className="mt-auto pt-2 border-t border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
            타겟 바이어
          </p>
          <p className="text-[11px] text-foreground line-clamp-1">{opp.target_buyer_segment}</p>
        </div>
      )}
    </CardContent>
  </Card>
);

// ─────────────────────────────────────────────────────────────
// Category Insight Card
// ─────────────────────────────────────────────────────────────
const CategoryInsightCard = ({ insight }: { insight: CategoryInsight }) => (
  <div className="flex gap-3 p-3 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
    <div className="shrink-0 mt-0.5">
      {directionIcon(insight.trend_direction)}
    </div>
    <div className="flex-1 min-w-0 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-foreground">{insight.category}</span>
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full border font-medium',
            directionColor(insight.trend_direction)
          )}
        >
          {directionLabel(insight.trend_direction)}
        </span>
      </div>
      {insight.key_styles && insight.key_styles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {insight.key_styles.slice(0, 4).map((s, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {s}
            </Badge>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground leading-relaxed">{insight.recommendation}</p>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
const SourcingReportAI = ({
  report,
  history,
  selectedId,
  onSelectReport,
  loading,
  onCopy,
}: SourcingReportAIProps) => {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">AI 소싱 인텔리전스 리포트</span>
          </div>
        </div>
        <ReportSkeleton />
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-4 pb-1">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">AI 소싱 인텔리전스 리포트</span>
        </div>

        <div className="flex items-center gap-2">
          {/* History dropdown */}
          {history.length > 0 && (
            <Select
              value={selectedId ?? ''}
              onValueChange={onSelectReport}
            >
              <SelectTrigger className="h-8 text-xs w-52">
                <SelectValue placeholder="이전 리포트 선택" />
              </SelectTrigger>
              <SelectContent>
                {history.map((h) => (
                  <SelectItem key={h.id} value={h.id} className="text-xs">
                    {formatDateTime(h.generated_at)} · {h.period_days}일
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Copy button */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={onCopy}
          >
            <Copy className="w-3.5 h-3.5" />
            리포트 복사
          </Button>
        </div>
      </div>

      {/* Executive Summary */}
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="p-4">
          <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">
            Executive Summary
          </p>
          <p className="text-sm text-foreground leading-relaxed">
            {report.executive_summary}
          </p>
        </CardContent>
      </Card>

      {/* Top Opportunities */}
      {report.top_opportunities && report.top_opportunities.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            🎯 Top Sourcing Opportunities
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {report.top_opportunities.map((opp) => (
              <OpportunityCard key={opp.rank} opp={opp} />
            ))}
          </div>
        </div>
      )}

      {/* Category Insights */}
      {report.category_insights && report.category_insights.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            📊 Category Insights
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {report.category_insights.map((insight, i) => (
              <CategoryInsightCard key={i} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {/* Action Items + Risk Alerts */}
      {((report.action_items && report.action_items.length > 0) ||
        (report.risk_alerts && report.risk_alerts.length > 0)) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Action Items */}
          {report.action_items && report.action_items.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  이번 주 Action Items
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-4 px-4">
                <ul className="space-y-2">
                  {report.action_items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-xs text-foreground leading-relaxed">{item}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Risk Alerts */}
          {report.risk_alerts && report.risk_alerts.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/30">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  Risk Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-4 px-4">
                <ul className="space-y-2">
                  {report.risk_alerts.map((alert, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                      <p className="text-xs text-amber-800 leading-relaxed">{alert}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default SourcingReportAI;
