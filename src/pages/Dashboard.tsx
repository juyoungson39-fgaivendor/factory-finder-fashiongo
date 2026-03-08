import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, ExternalLink, Factory, ArrowUpRight, Upload, Download } from 'lucide-react';
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
    sampling: factories.filter((f) => f.status === 'sampling').length,
    avgScore: factories.length
      ? (factories.reduce((sum, f) => sum + (f.overall_score ?? 0), 0) / factories.length).toFixed(1)
      : '0',
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground mt-0.5">소싱 공장 관리 및 스코어링</p>
        </div>
        <Link to="/factories/new">
          <Button size="sm" className="h-9 text-xs uppercase tracking-wider font-medium">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Vendor
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total', value: stats.total },
          { label: 'Approved', value: stats.approved },
          { label: 'Sampling', value: stats.sampling },
          { label: 'Avg Score', value: stats.avgScore },
        ].map((stat) => (
          <Card key={stat.label} className="border-border">
            <CardContent className="pt-5 pb-4">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">{stat.label}</p>
              <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {s === 'all' ? 'All Status' : s.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-36 h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest" className="text-xs">Newest</SelectItem>
            <SelectItem value="score" className="text-xs">Score</SelectItem>
            <SelectItem value="name" className="text-xs">Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table-like list */}
      {isLoading ? (
        <div className="text-center py-16 text-sm text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <Factory className="w-10 h-10 text-muted-foreground/30 mb-4" />
            <p className="font-medium text-muted-foreground mb-1">No vendors yet</p>
            <p className="text-sm text-muted-foreground/60 mb-6">Add your first factory to get started</p>
            <Link to="/factories/new">
              <Button size="sm" className="text-xs uppercase tracking-wider">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add Vendor
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_120px_100px_80px_40px] gap-4 px-5 py-3 border-b border-border text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
            <span>Vendor</span>
            <span>Platform</span>
            <span>Products</span>
            <span>Status</span>
            <span className="text-right">Score</span>
            <span></span>
          </div>
          {/* Table rows */}
          {filtered.map((factory, idx) => (
            <Link key={factory.id} to={`/factories/${factory.id}`}>
              <div
                className={`grid grid-cols-[1fr_100px_120px_100px_80px_40px] gap-4 px-5 py-3.5 items-center hover:bg-secondary/50 transition-colors cursor-pointer ${
                  idx < filtered.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <div>
                  <p className="text-sm font-medium truncate">{factory.name}</p>
                  {factory.country && (
                    <p className="text-[11px] text-muted-foreground">{factory.country}{factory.city ? `, ${factory.city}` : ''}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground uppercase">{factory.source_platform || '—'}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {factory.main_products?.slice(0, 2).join(', ') || '—'}
                </span>
                <StatusBadge status={factory.status ?? 'new'} />
                <div className="flex justify-end">
                  <ScoreBadge score={factory.overall_score ?? 0} size="sm" />
                </div>
                <div className="flex justify-end">
                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                </div>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
