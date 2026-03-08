import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShoppingBag, Zap, AlertCircle, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import ScoreBadge from '@/components/ScoreBadge';
import { Link } from 'react-router-dom';

const FashionGoPage = () => {
  const { user } = useAuth();
  const [threshold, setThreshold] = useState(70);

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

  const qualifiedFactories = factories.filter((f) => (f.overall_score ?? 0) >= threshold && f.status === 'approved');

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">FashionGo</h1>
      <p className="text-sm text-muted-foreground mb-8">스코어 기준을 충족하는 공장 상품을 자동으로 FashionGo에 등록합니다</p>

      {/* API Status */}
      <Card className="mb-6 border-border">
        <CardContent className="flex items-center gap-4 py-4">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <AlertCircle className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">API 연결 대기 중</p>
            <p className="text-xs text-muted-foreground">FashionGo 벤더 API 키를 연결하면 자동 상품 등록이 활성화됩니다</p>
          </div>
        </CardContent>
      </Card>

      {/* Threshold */}
      <Card className="mb-8">
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

      {/* Qualified */}
      <div className="mb-8">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-4">
          Eligible Vendors ({qualifiedFactories.length})
        </h2>
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

      {/* Queue */}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-4">Listing Queue</h2>
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
                </div>
                <Badge variant={item.status === 'listed' ? 'default' : item.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px] uppercase tracking-wider">
                  {item.status}
                </Badge>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
};

export default FashionGoPage;
