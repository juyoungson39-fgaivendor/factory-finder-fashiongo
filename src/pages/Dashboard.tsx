import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Factory, Plus, Search, ExternalLink, Star } from 'lucide-react';
import { useState } from 'react';
import ScoreBadge from '@/components/ScoreBadge';
import StatusBadge from '@/components/StatusBadge';

const statusOptions = ['all', 'new', 'contacted', 'sampling', 'approved', 'rejected'];

const Dashboard = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const { data: factories = [], isLoading } = useQuery({
    queryKey: ['factories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('factories')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const filtered = factories
    .filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'score') return (b.overall_score ?? 0) - (a.overall_score ?? 0);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const stats = {
    total: factories.length,
    approved: factories.filter((f) => f.status === 'approved').length,
    avgScore: factories.length
      ? (factories.reduce((sum, f) => sum + (f.overall_score ?? 0), 0) / factories.length).toFixed(1)
      : '0',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">공장 대시보드</h1>
          <p className="text-muted-foreground mt-1">소싱 공장을 관리하고 스코어링하세요</p>
        </div>
        <Link to="/factories/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            공장 추가
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-heading font-bold">{stats.total}</div>
            <p className="text-sm text-muted-foreground">전체 공장</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-heading font-bold text-success">{stats.approved}</div>
            <p className="text-sm text-muted-foreground">승인된 공장</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-heading font-bold">
              <span className="text-accent">{stats.avgScore}</span>
              <span className="text-sm text-muted-foreground font-normal">/100</span>
            </div>
            <p className="text-sm text-muted-foreground">평균 스코어</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="공장 이름으로 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'all' ? '전체 상태' : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">최신순</SelectItem>
            <SelectItem value="score">스코어순</SelectItem>
            <SelectItem value="name">이름순</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Factory list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Factory className="w-12 h-12 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">아직 등록된 공장이 없습니다</p>
            <p className="text-sm text-muted-foreground/60 mb-4">URL을 입력하여 첫 공장을 추가하세요</p>
            <Link to="/factories/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                공장 추가하기
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((factory) => (
            <Link key={factory.id} to={`/factories/${factory.id}`}>
              <Card className="hover:border-accent/50 transition-colors cursor-pointer">
                <CardContent className="flex items-center gap-6 py-4">
                  <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <Factory className="w-6 h-6 text-secondary-foreground/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading font-semibold text-foreground truncate">{factory.name}</h3>
                      <StatusBadge status={factory.status ?? 'new'} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      {factory.source_platform && (
                        <span className="capitalize">{factory.source_platform}</span>
                      )}
                      {factory.country && <span>{factory.country}</span>}
                      {factory.main_products?.length ? (
                        <span className="truncate">{factory.main_products.slice(0, 3).join(', ')}</span>
                      ) : null}
                    </div>
                  </div>
                  <ScoreBadge score={factory.overall_score ?? 0} />
                  {factory.source_url && (
                    <a
                      href={factory.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-accent"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
