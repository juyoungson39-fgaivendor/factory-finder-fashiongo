import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Plus, Search, Factory, ArrowUpRight, Upload, Download, Star, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import ScoreBadge from '@/components/ScoreBadge';
import StatusBadge from '@/components/StatusBadge';

const statusOptions = ['all', 'new', 'contacted', 'sampling', 'approved', 'rejected'];

const scoreRangePresets = [
  { label: 'All Scores', min: 0, max: 100 },
  { label: '80+ Excellent', min: 80, max: 100 },
  { label: '60–79 Good', min: 60, max: 79 },
  { label: '40–59 Average', min: 40, max: 59 },
  { label: 'Under 40', min: 0, max: 39 },
];

const Dashboard = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [scorePreset, setScorePreset] = useState('all');

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
      const score = f.overall_score ?? 0;
      if (score < scoreRange[0] || score > scoreRange[1]) return false;
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
    topVendors: factories.filter((f) => (f.overall_score ?? 0) >= 80).length,
  };

  const handleScorePreset = (preset: string) => {
    setScorePreset(preset);
    const found = scoreRangePresets.find((p) => p.label === preset);
    if (found) setScoreRange([found.min, found.max]);
  };

  const isTopVendor = (score: number) => score >= 80;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">
            <span className="text-primary">FG AI VENDOR</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vendor의 AI화를 실현하는 AI 에이전트 — 소싱 · 검증 · 매칭 · 등록 자동화</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs uppercase tracking-wider font-medium"
            onClick={() => {
              const headers = ['name', 'country', 'city', 'source_platform', 'source_url', 'main_products', 'moq', 'lead_time', 'status', 'overall_score', 'contact_name', 'contact_email', 'contact_phone'];
              const rows = factories.map((f) =>
                headers.map((h) => {
                  const val = (f as any)[h];
                  if (Array.isArray(val)) return `"${val.join(', ')}"`;
                  if (val === null || val === undefined) return '';
                  return `"${String(val).replace(/"/g, '""')}"`;
                }).join(',')
              );
              const csv = [headers.join(','), ...rows].join('\n');
              const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = `vendors_${new Date().toISOString().slice(0, 10)}.csv`;
              link.click();
            }}
            disabled={factories.length === 0}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            CSV
          </Button>
          <Link to="/factories/bulk-import">
            <Button size="sm" variant="outline" className="h-9 text-xs uppercase tracking-wider font-medium">
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Bulk Import
            </Button>
          </Link>
          <Link to="/factories/new">
            <Button size="sm" className="h-9 text-xs uppercase tracking-wider font-medium">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Vendor
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6 md:mb-8">
        {[
          { label: 'Total', value: stats.total, icon: null },
          { label: 'Approved', value: stats.approved, icon: null },
          { label: 'Sampling', value: stats.sampling, icon: null },
          { label: 'Avg Score', value: stats.avgScore, icon: TrendingUp },
          { label: 'Top Vendors', value: stats.topVendors, icon: Star, highlight: true },
        ].map((stat) => (
          <Card key={stat.label} className={`border-border ${stat.highlight ? 'border-[hsl(var(--score-excellent))]/30 bg-[hsl(var(--score-excellent))]/[0.03]' : ''}`}>
            <CardContent className="pt-4 pb-3 md:pt-5 md:pb-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">{stat.label}</p>
                {stat.icon && <stat.icon className={`w-3.5 h-3.5 ${stat.highlight ? 'text-[hsl(var(--score-excellent))]' : 'text-muted-foreground/40'}`} />}
              </div>
              <p className={`text-xl md:text-2xl font-bold tracking-tight ${stat.highlight && Number(stat.value) > 0 ? 'text-[hsl(var(--score-excellent))]' : ''}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9 text-sm"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] sm:w-36 h-9 text-xs">
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
          <Select value={scorePreset} onValueChange={handleScorePreset}>
            <SelectTrigger className="w-[120px] sm:w-40 h-9 text-xs">
              <SelectValue placeholder="Score Filter" />
            </SelectTrigger>
            <SelectContent>
              {scoreRangePresets.map((p) => (
                <SelectItem key={p.label} value={p.label} className="text-xs">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[120px] sm:w-36 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" className="text-xs">Newest</SelectItem>
              <SelectItem value="score" className="text-xs">Score ↓</SelectItem>
              <SelectItem value="name" className="text-xs">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Score Range Slider */}
      <div className="flex items-center gap-4 mb-6 px-1">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium whitespace-nowrap">Score</span>
        <div className="flex-1 max-w-xs">
          <Slider
            value={scoreRange}
            onValueChange={(val) => {
              setScoreRange(val as [number, number]);
              setScorePreset('custom');
            }}
            min={0}
            max={100}
            step={5}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums min-w-[60px]">
          {scoreRange[0]}–{scoreRange[1]}
        </span>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          ({filtered.length} vendor{filtered.length !== 1 ? 's' : ''})
        </span>
      </div>

      {/* Table / Card list */}
      {isLoading ? (
        <div className="text-center py-16 text-sm text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <Factory className="w-10 h-10 text-muted-foreground/30 mb-4" />
            <p className="font-medium text-muted-foreground mb-1">No vendors found</p>
            <p className="text-sm text-muted-foreground/60 mb-6">
              {factories.length > 0 ? 'Try adjusting your filters' : 'Add your first factory to get started'}
            </p>
            {factories.length === 0 && (
              <Link to="/factories/new">
                <Button size="sm" className="text-xs uppercase tracking-wider">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add Vendor
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <div className="grid grid-cols-[1fr_100px_140px_100px_90px_40px] gap-4 px-5 py-3 border-b border-border text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
              <span>Vendor</span>
              <span>Platform</span>
              <span>Products</span>
              <span>Status</span>
              <span className="text-right">Score</span>
              <span></span>
            </div>
            {filtered.map((factory, idx) => {
              const score = factory.overall_score ?? 0;
              const isTop = isTopVendor(score);
              return (
                <Link key={factory.id} to={`/factories/${factory.id}`}>
                  <div
                    className={`grid grid-cols-[1fr_100px_140px_100px_90px_40px] gap-4 px-5 py-3.5 items-center hover:bg-secondary/50 transition-colors cursor-pointer ${
                      idx < filtered.length - 1 ? 'border-b border-border' : ''
                    } ${isTop ? 'bg-[hsl(var(--score-excellent))]/[0.02] hover:bg-[hsl(var(--score-excellent))]/[0.06]' : ''}`}
                  >
                    <div className="flex items-center gap-2.5">
                      {isTop && (
                        <Star className="w-3.5 h-3.5 text-[hsl(var(--score-excellent))] fill-[hsl(var(--score-excellent))] shrink-0" />
                      )}
                      <div>
                        <p className={`text-sm font-medium truncate ${isTop ? 'text-[hsl(var(--score-excellent))]' : ''}`}>
                          {factory.name}
                        </p>
                        {factory.country && (
                          <p className="text-[11px] text-muted-foreground">{factory.country}{factory.city ? `, ${factory.city}` : ''}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground uppercase">{factory.source_platform || '—'}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {factory.main_products?.slice(0, 2).join(', ') || '—'}
                    </span>
                    <StatusBadge status={factory.status ?? 'new'} />
                    <div className="flex justify-end items-center gap-2">
                      {isTop && (
                        <span className="text-[9px] uppercase tracking-widest font-bold text-[hsl(var(--score-excellent))]">Top</span>
                      )}
                      <ScoreBadge score={score} size="sm" />
                    </div>
                    <div className="flex justify-end">
                      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </Card>

          {/* Mobile card list */}
          <div className="md:hidden space-y-2">
            {filtered.map((factory) => {
              const score = factory.overall_score ?? 0;
              const isTop = isTopVendor(score);
              return (
                <Link key={factory.id} to={`/factories/${factory.id}`}>
                  <Card className={`transition-colors hover:bg-secondary/50 ${isTop ? 'border-[hsl(var(--score-excellent))]/30 bg-[hsl(var(--score-excellent))]/[0.02]' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {isTop && <Star className="w-3.5 h-3.5 text-[hsl(var(--score-excellent))] fill-[hsl(var(--score-excellent))] shrink-0" />}
                            <p className={`text-sm font-medium truncate ${isTop ? 'text-[hsl(var(--score-excellent))]' : ''}`}>
                              {factory.name}
                            </p>
                          </div>
                          {factory.country && (
                            <p className="text-[11px] text-muted-foreground mb-2">
                              {factory.country}{factory.city ? `, ${factory.city}` : ''}
                            </p>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={factory.status ?? 'new'} />
                            {factory.source_platform && (
                              <span className="text-[10px] text-muted-foreground uppercase">{factory.source_platform}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <ScoreBadge score={score} size="sm" />
                          {isTop && (
                            <span className="text-[9px] uppercase tracking-widest font-bold text-[hsl(var(--score-excellent))]">Top</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
