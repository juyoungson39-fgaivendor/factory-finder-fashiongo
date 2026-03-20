import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AIModelImageDialog from '@/components/AIModelImageDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ShoppingBag, Zap, AlertCircle, CheckCircle2, ArrowUpRight,
  TrendingUp, Search, Loader2, Sparkles, ThumbsUp, ThumbsDown, Send, RefreshCw, Tag,
  Clock, Play, Pause, Calendar, Plus, X, DollarSign, Package, ImageIcon
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useState, useEffect } from 'react';
import ScoreBadge from '@/components/ScoreBadge';
import { Link } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

type TrendData = {
  trend_keywords: string[];
  trend_categories: string[];
  trending_styles: { name: string; description: string; keywords: string[]; estimated_demand: string }[];
  season_info: string;
  analysis_summary: string;
};

type MatchResult = {
  factory_id: string;
  factory_name: string;
  matched_keywords: string[];
  match_score: number;
  reasoning: string;
};

type ProductEntry = {
  name: string;
  category: string;
  wholesalePrice: string;
  retailPrice: string;
  sizes: string;
  colors: string;
};

type ApproveDetails = {
  products: ProductEntry[];
  notes: string;
};

const FashionGoPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [threshold, setThreshold] = useState(70);
  const [activeTab, setActiveTab] = useState<'trends' | 'eligible' | 'queue' | 'schedule'>('trends');
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [extraCategories, setExtraCategories] = useState('');
  const [approveModalMatch, setApproveModalMatch] = useState<MatchResult | null>(null);
  const [detailQueueItem, setDetailQueueItem] = useState<any | null>(null);
  const [aiImageItem, setAiImageItem] = useState<any | null>(null);

  const CRON_PRESETS = [
    { label: '매시간', value: '0 * * * *', desc: '매시간 정각' },
    { label: '매일 오전 9시', value: '0 9 * * *', desc: '매일 오전 9시 (UTC)' },
    { label: '매주 월요일', value: '0 9 * * 1', desc: '매주 월요일 오전 9시' },
    { label: '매주 월/목', value: '0 9 * * 1,4', desc: '월, 목요일 오전 9시' },
    { label: '매일 2회', value: '0 9,18 * * *', desc: '매일 오전 9시, 오후 6시' },
  ];

  const { data: factories = [] } = useQuery({
    queryKey: ['factories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('factories').select('*').order('overall_score', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: queue = [] } = useQuery({
    queryKey: ['fashiongo-queue', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('fashiongo_queue').select('*, factories(name, overall_score)').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: analyses = [] } = useQuery({
    queryKey: ['trend-analyses', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trend_analyses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: schedule, refetch: refetchSchedule } = useQuery({
    queryKey: ['trend-schedule', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trend_schedules')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const saveSchedule = useMutation({
    mutationFn: async ({ cronExpression, isActive, categories }: { cronExpression: string; isActive: boolean; categories: string[] }) => {
      if (schedule) {
        const { error } = await supabase.from('trend_schedules')
          .update({ cron_expression: cronExpression, is_active: isActive, extra_categories: categories })
          .eq('id', schedule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('trend_schedules')
          .insert({ user_id: user!.id, cron_expression: cronExpression, is_active: isActive, extra_categories: categories });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refetchSchedule();
      toast({ title: '스케줄 저장 완료', description: '트렌드 분석 스케줄이 업데이트되었습니다' });
    },
    onError: (err: Error) => {
      toast({ title: '저장 실패', description: err.message, variant: 'destructive' });
    },
  });

  const scrapeTrends = useMutation({
    mutationFn: async () => {
      const cats = extraCategories.split(',').map(s => s.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke('scrape-fashiongo-trends', {
        body: { categories: cats.length > 0 ? cats : undefined },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to scrape trends');
      return data.data as TrendData;
    },
    onSuccess: async (data) => {
      setTrendData(data);
      toast({ title: '트렌드 분석 완료', description: `${data.trend_keywords.length}개 트렌드 키워드를 발견했습니다` });

      // Save analysis to DB
      const { data: analysis, error } = await supabase.from('trend_analyses').insert({
        user_id: user!.id,
        trend_keywords: data.trend_keywords,
        trend_categories: data.trend_categories,
        source_data: data as any,
        status: 'analyzed',
      }).select().single();

      if (!error && analysis) {
        queryClient.invalidateQueries({ queryKey: ['trend-analyses'] });
        // Auto-match
        matchFactories.mutate({ trendData: data, analysisId: analysis.id });
      }
    },
    onError: (err: Error) => {
      toast({ title: '트렌드 스크래핑 실패', description: err.message, variant: 'destructive' });
    },
  });

  const matchFactories = useMutation({
    mutationFn: async ({ trendData: td, analysisId }: { trendData: TrendData; analysisId: string }) => {
      const { data, error } = await supabase.functions.invoke('match-trend-factories', {
        body: {
          trend_keywords: td.trend_keywords,
          trend_categories: td.trend_categories,
          trend_analysis_id: analysisId,
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to match');
      return data.matches as MatchResult[];
    },
    onSuccess: (data) => {
      setMatches(data);
      toast({ title: '매칭 완료', description: `${data.length}개 공장이 트렌드와 매칭되었습니다` });
    },
    onError: (err: Error) => {
      toast({ title: '매칭 실패', description: err.message, variant: 'destructive' });
    },
  });

  const approveMatch = useMutation({
    mutationFn: async ({ match, details }: { match: MatchResult; details: ApproveDetails }) => {
      const { error } = await supabase.from('fashiongo_queue').insert({
        factory_id: match.factory_id,
        user_id: user!.id,
        status: 'pending',
        min_score_threshold: threshold,
        product_data: {
          matched_keywords: match.matched_keywords,
          match_score: match.match_score,
          reasoning: match.reasoning,
          products: details.products,
          notes: details.notes,
        },
      });
      if (error) throw error;
    },
    onSuccess: (_, { match }) => {
      setMatches(prev => prev.filter(m => m.factory_id !== match.factory_id));
      setApproveModalMatch(null);
      queryClient.invalidateQueries({ queryKey: ['fashiongo-queue'] });
      toast({ title: '등록 대기열에 추가', description: `${match.factory_name}이 등록 대기열에 추가되었습니다` });
    },
    onError: (err: Error) => {
      toast({ title: '등록 실패', description: err.message, variant: 'destructive' });
    },
  });

  const dismissMatch = (factoryId: string) => {
    setMatches(prev => prev.filter(m => m.factory_id !== factoryId));
  };

  const qualifiedFactories = factories.filter((f) => (f.overall_score ?? 0) >= threshold && f.status === 'approved');
  const isLoading = scrapeTrends.isPending || matchFactories.isPending;

  const demandColor = (d: string) => {
    if (d === 'high') return 'bg-success/10 text-success border-success/20';
    if (d === 'medium') return 'bg-warning/10 text-warning border-warning/20';
    return 'bg-muted text-muted-foreground border-border';
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">FashionGo</h1>
      <p className="text-sm text-muted-foreground mb-6">트렌드 분석 → 공장 매칭 → 상품 등록까지 자동화</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-secondary/50 rounded-lg p-1 w-fit">
        {([
          { key: 'trends' as const, label: '트렌드 분석', icon: TrendingUp },
          { key: 'eligible' as const, label: `적격 벤더 (${qualifiedFactories.length})`, icon: CheckCircle2 },
          { key: 'queue' as const, label: `등록 대기 (${queue.length})`, icon: ShoppingBag },
          { key: 'schedule' as const, label: '스케줄', icon: Clock },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* TRENDS TAB */}
      {activeTab === 'trends' && (
        <div className="space-y-6">
          {/* Scrape Controls */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                FashionGo 트렌드 스크래핑
              </CardTitle>
              <CardDescription className="text-xs">
                FashionGo에서 현재 트렌드를 자동 분석하고, 보유 공장의 상품과 매칭합니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">추가 카테고리 (선택사항, 쉼표 구분)</Label>
                <Input
                  placeholder="예: dresses, tops, denim, activewear"
                  value={extraCategories}
                  onChange={(e) => setExtraCategories(e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button
                onClick={() => scrapeTrends.mutate()}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                {scrapeTrends.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />트렌드 분석 중...</>
                ) : matchFactories.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />공장 매칭 중...</>
                ) : (
                  <><Search className="w-4 h-4 mr-2" />트렌드 분석 시작</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Trend Results */}
          {trendData && (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">📊 트렌드 분석 결과</CardTitle>
                  <CardDescription className="text-xs">{trendData.season_info}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-foreground/80">{trendData.analysis_summary}</p>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">트렌드 키워드</p>
                    <div className="flex flex-wrap gap-1.5">
                      {trendData.trend_keywords.map((kw, i) => (
                        <Badge key={i} variant="secondary" className="text-[11px]">
                          <Tag className="w-3 h-3 mr-1" />{kw}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">카테고리</p>
                    <div className="flex flex-wrap gap-1.5">
                      {trendData.trend_categories.map((cat, i) => (
                        <Badge key={i} variant="outline" className="text-[11px]">{cat}</Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Trending Styles */}
              {trendData.trending_styles && trendData.trending_styles.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">트렌딩 스타일</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {trendData.trending_styles.map((style, i) => (
                      <Card key={i} className="border-border">
                        <CardContent className="pt-4 pb-3 px-4">
                          <div className="flex items-start justify-between mb-2">
                            <p className="text-sm font-medium">{style.name}</p>
                            <Badge variant="outline" className={`text-[10px] ${demandColor(style.estimated_demand)}`}>
                              {style.estimated_demand === 'high' ? '높음' : style.estimated_demand === 'medium' ? '보통' : '낮음'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{style.description}</p>
                          <div className="flex flex-wrap gap-1">
                            {style.keywords.slice(0, 4).map((kw, j) => (
                              <span key={j} className="text-[10px] px-1.5 py-0.5 bg-secondary rounded">{kw}</span>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Top Factories (Score 80+) */}
          {(() => {
            const topFactories = factories.filter(f => (f.overall_score ?? 0) >= 60);
            return topFactories.length > 0 ? (
              <div>
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">
                  ⭐ 스코어 60+ 우수 공장 ({topFactories.length})
                </h3>
                <Card>
                  {topFactories.map((f, idx) => (
                    <Link key={f.id} to={`/factories/${f.id}`}>
                      <div className={`flex items-center gap-4 px-5 py-3 hover:bg-secondary/50 transition-colors ${idx < topFactories.length - 1 ? 'border-b border-border' : ''}`}>
                        <ScoreBadge score={f.overall_score ?? 0} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{f.name}</p>
                          <p className="text-[11px] text-muted-foreground">{f.main_products?.slice(0, 4).join(', ')}</p>
                          {f.country && <p className="text-[10px] text-muted-foreground/60">{f.city ? `${f.city}, ` : ''}{f.country}</p>}
                        </div>
                        <Badge variant="outline" className="text-[10px] bg-score-excellent/10 text-score-excellent border-score-excellent/20">
                          Top Vendor
                        </Badge>
                        <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                      </div>
                    </Link>
                  ))}
                </Card>
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center py-8">
                  <AlertCircle className="w-6 h-6 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">스코어 60점 이상의 공장이 아직 없습니다</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">공장의 스코어링을 완료하면 여기에 표시됩니다</p>
                </CardContent>
              </Card>
            );
          })()}

          {/* Match Results */}
          {matches.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">
                🏭 매칭된 공장 ({matches.length})
              </h3>
              <Card>
                {matches.map((match, idx) => (
                  <div
                    key={match.factory_id}
                    className={`p-4 ${idx < matches.length - 1 ? 'border-b border-border' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-sm font-bold flex-shrink-0">
                        {match.match_score}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Link to={`/factories/${match.factory_id}`} className="text-sm font-medium hover:underline">
                            {match.factory_name}
                          </Link>
                          <ArrowUpRight className="w-3 h-3 text-muted-foreground/40" />
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{match.reasoning}</p>
                        <div className="flex flex-wrap gap-1">
                          {match.matched_keywords.map((kw, j) => (
                            <Badge key={j} variant="secondary" className="text-[10px]">{kw}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => dismissMatch(match.factory_id)}
                          title="거절"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => setApproveModalMatch(match)}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          승인
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {/* Recent Analyses */}
          {analyses.length > 0 && !trendData && (
            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">최근 분석 기록</h3>
              <Card>
                {analyses.map((a: any, idx: number) => (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 px-4 py-3 ${idx < analyses.length - 1 ? 'border-b border-border' : ''}`}
                  >
                    <div className="flex-1">
                      <p className="text-sm">
                        {(a.trend_keywords as string[])?.slice(0, 5).join(', ')}
                        {(a.trend_keywords as string[])?.length > 5 && ` 외 ${(a.trend_keywords as string[]).length - 5}개`}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString('ko-KR')}</p>
                    </div>
                    <Badge variant={a.status === 'completed' ? 'default' : 'secondary'} className="text-[10px]">
                      {a.status === 'completed' ? '완료' : a.status === 'analyzed' ? '분석됨' : '진행중'}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => {
                        if (a.source_data) {
                          setTrendData(a.source_data as unknown as TrendData);
                        }
                      }}
                      title="결과 보기"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ELIGIBLE TAB */}
      {activeTab === 'eligible' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Auto-List Threshold</CardTitle>
              <CardDescription className="text-xs">이 스코어 이상이고 APPROVED 상태인 공장만 자동 등록됩니다</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Label className="text-xs">Min Score</Label>
                <Input type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-20 h-9" />
                <span className="text-xs text-muted-foreground">/100</span>
              </div>
            </CardContent>
          </Card>

          {qualifiedFactories.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-12">
                <ShoppingBag className="w-8 h-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">기준을 충족하는 승인된 공장이 없습니다</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              {qualifiedFactories.map((f, idx) => (
                <Link key={f.id} to={`/factories/${f.id}`}>
                  <div className={`flex items-center gap-4 px-5 py-3 hover:bg-secondary/50 transition-colors ${idx < qualifiedFactories.length - 1 ? 'border-b border-border' : ''}`}>
                    <ScoreBadge score={f.overall_score ?? 0} size="sm" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{f.name}</p>
                      <p className="text-[11px] text-muted-foreground">{f.main_products?.slice(0, 3).join(', ')}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-success/10 text-success border-success/20">
                      <CheckCircle2 className="w-3 h-3 mr-1" />Eligible
                    </Badge>
                    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* QUEUE TAB */}
      {activeTab === 'queue' && (
        <div>
          {queue.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="text-center py-10 text-sm text-muted-foreground">
                아직 등록 대기 중인 상품이 없습니다
              </CardContent>
            </Card>
          ) : (
            <Card>
              {queue.map((item, idx) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-secondary/50 transition-colors ${idx < queue.length - 1 ? 'border-b border-border' : ''}`}
                  onClick={() => setDetailQueueItem(item)}
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{(item.factories as any)?.name ?? 'Unknown'}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(item.created_at).toLocaleString('ko-KR')}</p>
                    {item.product_data && (item.product_data as any).products && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        상품 {((item.product_data as any).products as any[]).length}개
                      </p>
                    )}
                    {item.product_data && (item.product_data as any).matched_keywords && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {((item.product_data as any).matched_keywords as string[]).slice(0, 3).map((kw: string, j: number) => (
                          <span key={j} className="text-[10px] px-1.5 py-0.5 bg-secondary rounded">{kw}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Badge variant={item.status === 'listed' ? 'default' : item.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px] uppercase tracking-wider">
                    {item.status === 'listed' ? '등록완료' : item.status === 'failed' ? '실패' : '대기중'}
                  </Badge>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* SCHEDULE TAB */}
      {activeTab === 'schedule' && (
        <SchedulePanel
          schedule={schedule}
          cronPresets={CRON_PRESETS}
          onSave={(cron: string, active: boolean, cats: string[]) => saveSchedule.mutate({ cronExpression: cron, isActive: active, categories: cats })}
          isSaving={saveSchedule.isPending}
        />
      )}

      {/* APPROVE MODAL */}
      {approveModalMatch && (
        <ApproveModal
          match={approveModalMatch}
          factory={factories.find(f => f.id === approveModalMatch.factory_id)}
          onClose={() => setApproveModalMatch(null)}
          onApprove={(details) => approveMatch.mutate({ match: approveModalMatch, details })}
          isPending={approveMatch.isPending}
        />
      )}

      {/* QUEUE DETAIL MODAL */}
      {detailQueueItem && (
        <QueueDetailModal
          item={detailQueueItem}
          onClose={() => setDetailQueueItem(null)}
        />
      )}
    </div>
  );
};

const emptyProduct = (): ProductEntry => ({
  name: '', category: '', wholesalePrice: '', retailPrice: '', sizes: '', colors: '',
});

const QueueDetailModal = ({ item, onClose }: { item: any; onClose: () => void }) => {
  const pd = item.product_data as any;
  const products = (pd?.products as ProductEntry[]) || [];
  const factoryName = (item.factories as any)?.name ?? 'Unknown';
  const factoryScore = (item.factories as any)?.overall_score;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            등록 대기 상세 정보
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{factoryName}</span> — {new Date(item.created_at).toLocaleString('ko-KR')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
          {factoryScore != null && (
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
              {factoryScore}
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{factoryName}</p>
              <Badge variant={item.status === 'listed' ? 'default' : item.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px] uppercase tracking-wider">
                {item.status === 'listed' ? '등록완료' : item.status === 'failed' ? '실패' : '대기중'}
              </Badge>
            </div>
            {pd?.match_score && (
              <p className="text-[11px] text-muted-foreground">매칭 스코어: {pd.match_score}</p>
            )}
          </div>
        </div>

        {pd?.matched_keywords && (pd.matched_keywords as string[]).length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">매칭 키워드</p>
            <div className="flex flex-wrap gap-1">
              {(pd.matched_keywords as string[]).map((kw: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-[10px]">
                  <Tag className="w-3 h-3 mr-1" />{kw}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {pd?.reasoning && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">AI 분석</p>
            <p className="text-xs text-foreground/80 p-2 rounded bg-secondary/20">{pd.reasoning}</p>
          </div>
        )}

        {products.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">등록 상품 ({products.length}개)</p>
            {products.map((product, idx) => (
              <Card key={idx}>
                <CardContent className="pt-3 pb-3 px-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">{product.name || `상품 ${idx + 1}`}</p>
                    {product.category && (
                      <Badge variant="outline" className="text-[10px]">{product.category}</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" />도매가</span>
                      <p className="font-medium mt-0.5">{product.wholesalePrice ? `$${product.wholesalePrice}` : '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" />소매가</span>
                      <p className="font-medium mt-0.5">{product.retailPrice ? `$${product.retailPrice}` : '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">사이즈</span>
                      <p className="font-medium mt-0.5">{product.sizes || '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">컬러</span>
                      <p className="font-medium mt-0.5">{product.colors || '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">등록된 상품 정보가 없습니다</p>
        )}

        {pd?.notes && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">메모</p>
            <p className="text-xs text-foreground/80 p-2 rounded bg-secondary/20">{pd.notes}</p>
          </div>
        )}

        {item.error_message && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p className="text-xs">{item.error_message}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ApproveModal = ({
  match, factory, onClose, onApprove, isPending,
}: {
  match: MatchResult;
  factory?: any;
  onClose: () => void;
  onApprove: (details: ApproveDetails) => void;
  isPending: boolean;
}) => {
  const [products, setProducts] = useState<ProductEntry[]>([]);
  const [notes, setNotes] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [vendorSummary, setVendorSummary] = useState('');
  const { toast } = useToast();

  // Auto-fetch vendor best products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      setIsFetching(true);
      try {
        const { data, error } = await supabase.functions.invoke('scrape-vendor-products', {
          body: {
            factory_id: match.factory_id,
            factory_name: match.factory_name,
            source_url: factory?.source_url || null,
            main_products: factory?.main_products || [],
            matched_keywords: match.matched_keywords,
          },
        });
        if (error) throw error;
        if (data?.success && data.data?.products) {
          setProducts(data.data.products.map((p: any) => ({
            name: p.name || '',
            category: p.category || '',
            wholesalePrice: p.wholesalePrice || '',
            retailPrice: p.retailPrice || '',
            sizes: p.sizes || '',
            colors: p.colors || '',
          })));
          if (data.data.vendor_summary) {
            setVendorSummary(data.data.vendor_summary);
          }
          toast({ title: '베스트 상품 로드 완료', description: `${data.data.products.length}개 상품을 가져왔습니다` });
        } else {
          setProducts([emptyProduct()]);
        }
      } catch (err: any) {
        console.error('Failed to fetch vendor products:', err);
        setProducts([emptyProduct()]);
        toast({ title: '상품 자동 로드 실패', description: '수동으로 입력해주세요', variant: 'destructive' });
      } finally {
        setIsFetching(false);
      }
    };
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateProduct = (idx: number, field: keyof ProductEntry, value: string) => {
    setProducts(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const addProduct = () => setProducts(prev => [...prev, emptyProduct()]);
  const removeProduct = (idx: number) => setProducts(prev => prev.filter((_, i) => i !== idx));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            상품 등록 상세 설정
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{match.factory_name}</span>에서 등록할 상품 정보를 입력하세요
          </DialogDescription>
        </DialogHeader>

        {/* Match Info */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 mb-2">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
            {match.match_score}
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">{match.reasoning}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {match.matched_keywords.map((kw, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">{kw}</Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Vendor Summary */}
        {vendorSummary && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-xs text-foreground/80 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              {vendorSummary}
            </p>
          </div>
        )}

        {/* Products */}
        {isFetching ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">벤더 베스트 상품을 가져오는 중...</p>
            <p className="text-[11px] text-muted-foreground/60">FashionGo에서 데이터를 분석하고 있습니다</p>
          </div>
        ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">상품 목록 {products.length > 0 && <span className="text-muted-foreground font-normal">({products.length}개)</span>}</Label>
            <Button size="sm" variant="outline" onClick={addProduct} className="h-7 gap-1 text-xs">
              <Plus className="w-3 h-3" />상품 추가
            </Button>
          </div>

          {products.map((product, idx) => (
            <Card key={idx} className="relative">
              <CardContent className="pt-4 pb-3 px-4 space-y-3">
                {products.length > 1 && (
                  <Button
                    size="sm" variant="ghost"
                    className="absolute top-2 right-2 h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeProduct(idx)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
                <div className="text-[11px] text-muted-foreground font-medium">상품 {idx + 1}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">상품명</Label>
                    <Input
                      placeholder="예: Women's Casual Blouse"
                      value={product.name}
                      onChange={(e) => updateProduct(idx, 'name', e.target.value)}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">카테고리</Label>
                    <Select value={product.category} onValueChange={(v) => updateProduct(idx, 'category', v)}>
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue placeholder="카테고리 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {['Tops', 'Dresses', 'Bottoms', 'Outerwear', 'Activewear', 'Accessories', 'Shoes', 'Plus Size', 'Swimwear', 'Sets'].map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />도매가
                    </Label>
                    <Input
                      type="number" placeholder="0.00"
                      value={product.wholesalePrice}
                      onChange={(e) => updateProduct(idx, 'wholesalePrice', e.target.value)}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />소매가
                    </Label>
                    <Input
                      type="number" placeholder="0.00"
                      value={product.retailPrice}
                      onChange={(e) => updateProduct(idx, 'retailPrice', e.target.value)}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">사이즈</Label>
                    <Input
                      placeholder="S, M, L, XL"
                      value={product.sizes}
                      onChange={(e) => updateProduct(idx, 'sizes', e.target.value)}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">컬러</Label>
                    <Input
                      placeholder="Black, White"
                      value={product.colors}
                      onChange={(e) => updateProduct(idx, 'colors', e.target.value)}
                      className="mt-1 h-9"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        )}


        <div>
          <Label className="text-xs text-muted-foreground">추가 메모</Label>
          <Textarea
            placeholder="등록 시 참고할 사항을 입력하세요..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 min-h-[60px]"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            onClick={() => onApprove({ products, notes })}
            disabled={isPending || products.every(p => !p.name.trim())}
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            등록 대기열에 추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SchedulePanel = ({
  schedule,
  cronPresets,
  onSave,
  isSaving,
}: {
  schedule: any;
  cronPresets: { label: string; value: string; desc: string }[];
  onSave: (cron: string, active: boolean, cats: string[]) => void;
  isSaving: boolean;
}) => {
  const [selectedCron, setSelectedCron] = useState(schedule?.cron_expression || '0 9 * * 1');
  const [isActive, setIsActive] = useState(schedule?.is_active ?? false);
  const [scheduleCats, setScheduleCats] = useState((schedule?.extra_categories || []).join(', '));

  const currentPreset = cronPresets.find(p => p.value === selectedCron);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            자동 트렌드 분석 스케줄
          </CardTitle>
          <CardDescription className="text-xs">
            설정한 주기에 따라 FashionGo 트렌드를 자동으로 분석하고 공장을 매칭합니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Active Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
            <div>
              <p className="text-sm font-medium">자동 분석 활성화</p>
              <p className="text-xs text-muted-foreground">활성화하면 설정된 주기에 따라 자동으로 실행됩니다</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* Cron Preset */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">분석 주기</Label>
            <Select value={selectedCron} onValueChange={setSelectedCron}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="주기 선택" />
              </SelectTrigger>
              <SelectContent>
                {cronPresets.map(p => (
                  <SelectItem key={p.value} value={p.value}>
                    <span className="font-medium">{p.label}</span>
                    <span className="text-muted-foreground ml-2 text-xs">— {p.desc}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentPreset && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {currentPreset.desc}
              </p>
            )}
          </div>

          {/* Extra categories */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">추가 카테고리 (선택사항, 쉼표 구분)</Label>
            <Input
              placeholder="예: dresses, tops, denim"
              value={scheduleCats}
              onChange={(e) => setScheduleCats(e.target.value)}
            />
          </div>

          {/* Last run info */}
          {schedule?.last_run_at && (
            <div className="text-xs text-muted-foreground p-2 rounded bg-secondary/30">
              마지막 실행: {new Date(schedule.last_run_at).toLocaleString('ko-KR')}
            </div>
          )}

          <Button
            onClick={() => {
              const cats = scheduleCats.split(',').map((s: string) => s.trim()).filter(Boolean);
              onSave(selectedCron, isActive, cats);
            }}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            스케줄 저장
          </Button>
        </CardContent>
      </Card>

      {/* Status Card */}
      <Card className="border-border">
        <CardContent className="flex items-center gap-4 py-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isActive ? 'bg-success/10' : 'bg-secondary'}`}>
            {isActive ? <Play className="w-4 h-4 text-success" /> : <Pause className="w-4 h-4 text-muted-foreground" />}
          </div>
          <div>
            <p className="text-sm font-medium">{isActive ? '자동 분석 활성' : '자동 분석 비활성'}</p>
            <p className="text-xs text-muted-foreground">
              {isActive ? `${currentPreset?.label || selectedCron} 주기로 자동 실행됩니다` : '수동으로만 트렌드를 분석합니다'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FashionGoPage;
