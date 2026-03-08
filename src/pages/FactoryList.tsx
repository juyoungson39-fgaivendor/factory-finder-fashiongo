import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, MapPin, Mail, Phone, MessageSquare, ExternalLink, Package, Clock, Layers } from 'lucide-react';
import { useState } from 'react';
import ScoreBadge from '@/components/ScoreBadge';
import StatusBadge from '@/components/StatusBadge';

const statusOptions = ['all', 'new', 'contacted', 'sampling', 'approved', 'rejected'];

const FactoryList = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  const { data: factories = [], isLoading } = useQuery({
    queryKey: ['factories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('factories').select('*').order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const platforms = ['all', ...Array.from(new Set(factories.map((f) => f.source_platform).filter(Boolean))) as string[]];

  const filtered = factories
    .filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (platformFilter !== 'all' && f.source_platform !== platformFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          f.name.toLowerCase().includes(q) ||
          f.country?.toLowerCase().includes(q) ||
          f.city?.toLowerCase().includes(q) ||
          f.main_products?.some((p) => p.toLowerCase().includes(q))
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'score') return (b.overall_score ?? 0) - (a.overall_score ?? 0);
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return a.name.localeCompare(b.name);
    });

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Factory Directory</h1>
      <p className="text-sm text-muted-foreground mb-8">등록된 모든 공장 정보를 한눈에 확인하세요</p>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="이름, 국가, 도시, 제품으로 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{s === 'all' ? 'All Status' : s.toUpperCase()}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {platforms.length > 2 && (
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {platforms.map((p) => (
                <SelectItem key={p} value={p} className="text-xs">{p === 'all' ? 'All Platforms' : p.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name" className="text-xs">Name</SelectItem>
            <SelectItem value="score" className="text-xs">Score ↓</SelectItem>
            <SelectItem value="newest" className="text-xs">Newest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground mb-4">{filtered.length}개 공장</p>

      {isLoading ? (
        <div className="text-center py-16 text-sm text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <p className="text-muted-foreground text-sm">검색 결과가 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((factory) => (
            <Link key={factory.id} to={`/factories/${factory.id}`}>
              <Card className="hover:bg-secondary/40 transition-colors cursor-pointer">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-4">
                    <ScoreBadge score={factory.overall_score ?? 0} size="md" />
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + Status */}
                      <div className="flex items-center gap-3 mb-1.5">
                        <h3 className="text-sm font-semibold truncate">{factory.name}</h3>
                        <StatusBadge status={factory.status ?? 'new'} />
                        {factory.source_platform && (
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{factory.source_platform}</span>
                        )}
                      </div>

                      {/* Row 2: Location + Contact */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
                        {factory.country && (
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{factory.country}{factory.city ? `, ${factory.city}` : ''}</span>
                        )}
                        {factory.contact_email && (
                          <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{factory.contact_email}</span>
                        )}
                        {factory.contact_phone && (
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{factory.contact_phone}</span>
                        )}
                        {factory.contact_wechat && (
                          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{factory.contact_wechat}</span>
                        )}
                      </div>

                      {/* Row 3: Products + MOQ + Lead Time */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        {factory.main_products?.length ? (
                          <div className="flex items-center gap-1.5">
                            <Package className="w-3 h-3 text-muted-foreground shrink-0" />
                            <div className="flex flex-wrap gap-1">
                              {factory.main_products.slice(0, 5).map((p, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px] font-normal py-0 h-5">{p}</Badge>
                              ))}
                              {factory.main_products.length > 5 && (
                                <Badge variant="secondary" className="text-[10px] font-normal py-0 h-5">+{factory.main_products.length - 5}</Badge>
                              )}
                            </div>
                          </div>
                        ) : null}
                        {factory.moq && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Layers className="w-3 h-3" />MOQ: {factory.moq}
                          </span>
                        )}
                        {factory.lead_time && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />리드타임: {factory.lead_time}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* External link */}
                    {factory.source_url && (
                      <a
                        href={factory.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground/40 hover:text-foreground transition-colors shrink-0 mt-1"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default FactoryList;
