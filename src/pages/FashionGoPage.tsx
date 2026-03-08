import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShoppingBag, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import ScoreBadge from '@/components/ScoreBadge';
import { Link } from 'react-router-dom';

const FashionGoPage = () => {
  const { user } = useAuth();
  const [threshold, setThreshold] = useState(70);

  const { data: factories = [] } = useQuery({
    queryKey: ['factories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('factories')
        .select('*')
        .order('overall_score', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: queue = [] } = useQuery({
    queryKey: ['fashiongo-queue', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fashiongo_queue')
        .select('*, factories(name, overall_score)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const qualifiedFactories = factories.filter((f) => (f.overall_score ?? 0) >= threshold && f.status === 'approved');

  return (
    <div>
      <h1 className="text-3xl font-heading font-bold mb-2">FashionGo AI Vendor</h1>
      <p className="text-muted-foreground mb-8">스코어 기준을 충족하는 공장 상품을 자동으로 FashionGo에 등록합니다</p>

      {/* API Status */}
      <Card className="mb-6 border-accent/30">
        <CardContent className="flex items-center gap-4 py-4">
          <AlertCircle className="w-5 h-5 text-accent" />
          <div>
            <p className="font-medium">FashionGo API 연결 대기 중</p>
            <p className="text-sm text-muted-foreground">
              FashionGo 벤더 API 키를 연결하면 자동 상품 등록 기능이 활성화됩니다.
              현재는 등록 대기 큐만 관리할 수 있습니다.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Threshold setting */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            자동 등록 기준
          </CardTitle>
          <CardDescription>이 스코어 이상이고 '승인' 상태인 공장 상품만 자동 등록됩니다</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label>최소 스코어</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">/100</span>
          </div>
        </CardContent>
      </Card>

      {/* Qualified factories */}
      <h2 className="text-xl font-heading font-bold mb-4">
        등록 가능 공장 ({qualifiedFactories.length})
      </h2>
      {qualifiedFactories.length === 0 ? (
        <Card className="mb-8">
          <CardContent className="flex flex-col items-center py-12">
            <ShoppingBag className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">기준을 충족하는 승인된 공장이 없습니다</p>
            <p className="text-sm text-muted-foreground/60">공장 스코어링과 승인 상태를 확인하세요</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3 mb-8">
          {qualifiedFactories.map((f) => (
            <Link key={f.id} to={`/factories/${f.id}`}>
              <Card className="hover:border-accent/50 transition-colors cursor-pointer">
                <CardContent className="flex items-center gap-4 py-3">
                  <ScoreBadge score={f.overall_score ?? 0} size="sm" />
                  <div className="flex-1">
                    <p className="font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.main_products?.slice(0, 3).join(', ')}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    등록 가능
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Queue */}
      <h2 className="text-xl font-heading font-bold mb-4">등록 큐</h2>
      {queue.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            아직 등록 대기 중인 상품이 없습니다
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {queue.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex items-center gap-4 py-3">
                <div className="flex-1">
                  <p className="font-medium">{(item.factories as any)?.name ?? 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString('ko-KR')}
                  </p>
                </div>
                <Badge variant={item.status === 'listed' ? 'default' : item.status === 'failed' ? 'destructive' : 'secondary'}>
                  {item.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default FashionGoPage;
