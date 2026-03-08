import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Clock, Play, Pause, Calendar
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useState } from 'react';
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

const FashionGoPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [threshold, setThreshold] = useState(70);
  const [activeTab, setActiveTab] = useState<'trends' | 'eligible' | 'queue' | 'schedule'>('trends');
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [extraCategories, setExtraCategories] = useState('');

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
    mutationFn: async (match: MatchResult) => {
      const { error } = await supabase.from('fashiongo_queue').insert({
        factory_id: match.factory_id,
        user_id: user!.id,
        status: 'pending',
        min_score_threshold: threshold,
        product_data: { matched_keywords: match.matched_keywords, match_score: match.match_score, reasoning: match.reasoning },
      });
      if (error) throw error;
    },
    onSuccess: (_, match) => {
      setMatches(prev => prev.filter(m => m.factory_id !== match.factory_id));
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
                          onClick={() => approveMatch.mutate(match)}
                          disabled={approveMatch.isPending}
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
                <div key={item.id} className={`flex items-center gap-4 px-5 py-3 ${idx < queue.length - 1 ? 'border-b border-border' : ''}`}>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{(item.factories as any)?.name ?? 'Unknown'}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(item.created_at).toLocaleString('ko-KR')}</p>
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
    </div>
  );
};

export default FashionGoPage;
