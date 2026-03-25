import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, MapPin, Mail, Phone, MessageSquare, ExternalLink, Package, Clock, Layers, Download, Tag, Star, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import ScoreBadge from '@/components/ScoreBadge';
import StatusBadge from '@/components/StatusBadge';
import { DEV_FACTORIES, isDevMode } from '@/lib/devMockData';

const statusOptions = ['all', 'new', 'contacted', 'sampling', 'approved', 'rejected'];

const ITEMS_PER_PAGE = 10;

const FactoryList = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (factoryId: string) => {
      const { error } = await supabase
        .from('factories')
        .update({ deleted_at: new Date().toISOString(), deleted_reason: 'user_deleted' })
        .eq('id', factoryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factories'] });
      toast.success('공장이 삭제되었습니다.');
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error('삭제에 실패했습니다.');
    },
  });

  const { data: factories = [], isLoading } = useQuery({
    queryKey: ['factories', user?.id],
    queryFn: async () => {
      if (isDevMode && !user) return DEV_FACTORIES;
      const { data, error } = await supabase.from('factories').select('*').is('deleted_at', null).order('name');
      if (error) throw error;
      return data;
    },
    enabled: isDevMode || !!user,
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['tags', user?.id],
    queryFn: async () => {
      if (isDevMode && !user) return [];
      const { data, error } = await supabase.from('tags').select('*').order('name');
      if (error) throw error;
      return data;
    },
    enabled: isDevMode || !!user,
  });

  const { data: factoryTags = [] } = useQuery({
    queryKey: ['factory_tags', user?.id],
    queryFn: async () => {
      if (isDevMode && !user) return [];
      const { data, error } = await supabase.from('factory_tags').select('*');
      if (error) throw error;
      return data;
    },
    enabled: isDevMode || !!user,
  });

  const platforms = ['all', ...Array.from(new Set(factories.map((f) => f.source_platform).filter(Boolean))) as string[]];

  // Build a map of factory_id -> tag_ids
  const factoryTagMap = new Map<string, string[]>();
  factoryTags.forEach((ft) => {
    const existing = factoryTagMap.get(ft.factory_id) || [];
    existing.push(ft.tag_id);
    factoryTagMap.set(ft.factory_id, existing);
  });

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const filtered = factories
    .filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (platformFilter !== 'all' && f.source_platform !== platformFilter) return false;
      if (selectedTags.length > 0) {
        const fTags = factoryTagMap.get(f.id) || [];
        if (!selectedTags.some((t) => fTags.includes(t))) return false;
      }
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

  // Reset page on filter change
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safeCurrentPage - 1) * ITEMS_PER_PAGE, safeCurrentPage * ITEMS_PER_PAGE);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div></div>
        <Button
          size="sm"
          variant="outline"
          className="h-9 text-xs uppercase tracking-wider font-medium"
          onClick={() => {
            const headers = ['이름', '국가', '도시', '플랫폼', 'URL', '주요제품', 'MOQ', '리드타임', '상태', '점수', '담당자', '이메일', '전화번호', 'WeChat'];
            const keys = ['name', 'country', 'city', 'source_platform', 'source_url', 'main_products', 'moq', 'lead_time', 'status', 'overall_score', 'contact_name', 'contact_email', 'contact_phone', 'contact_wechat'];
            const rows = filtered.map((f) =>
              keys.map((h) => {
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
            link.download = `factory_list_${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
          }}
          disabled={filtered.length === 0}
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          CSV 내보내기
        </Button>
      </div>

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

      {/* Tag Filters */}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
                selectedTags.includes(tag.id)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-secondary/50 text-muted-foreground border-border hover:bg-secondary'
              }`}
            >
              {tag.name}
            </button>
          ))}
          {selectedTags.length > 0 && (
            <button
              onClick={() => setSelectedTags([])}
              className="text-[11px] text-muted-foreground hover:text-foreground underline ml-1"
            >
              초기화
            </button>
          )}
        </div>
      )}

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
          {paginated.map((factory) => {
            const detail = factory.platform_score_detail as Record<string, number> | null;
            return (
            <Link key={factory.id} to={`/factories/${factory.id}`}>
              <Card className="hover:bg-secondary/40 transition-colors cursor-pointer">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-4">
                    <ScoreBadge score={factory.overall_score ?? 0} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="text-sm font-semibold truncate">{factory.name}</h3>
                        <StatusBadge status={factory.status ?? 'new'} />
                        {factory.recommendation_grade && (
                          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            {factory.recommendation_grade}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
                        {factory.country && (
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{factory.country}{factory.city ? `, ${factory.city}` : ''}</span>
                        )}
                        {factory.contact_phone && (
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{factory.contact_phone}</span>
                        )}
                        {factory.fg_category && (
                          <Badge variant="outline" className="text-[10px] font-medium py-0 h-5 border-primary/30 text-primary">
                            {factory.fg_category}
                          </Badge>
                        )}
                        {factory.source_platform && (
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{factory.source_platform}</span>
                        )}
                      </div>
                      {(factory.platform_score != null || detail) && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                          {factory.platform_score != null && (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded ${
                              factory.platform_score >= 4.5 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                              factory.platform_score >= 4.0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              <Star className="w-3 h-3" />종합 {factory.platform_score}
                            </span>
                          )}
                          {detail && (
                            <>
                              {[
                                { key: 'consultation', label: '상담', icon: '💬' },
                                { key: 'logistics', label: '물류', icon: '🚚' },
                                { key: 'dispute', label: '분쟁', icon: '🛡️' },
                                { key: 'quality', label: '품질', icon: '✨' },
                                { key: 'exchange', label: '교환', icon: '🔄' },
                              ].map(({ key, label, icon }) => {
                                const val = detail[key];
                                if (val == null) return null;
                                return (
                                  <span key={key} className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                    val >= 4.5 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                                    val >= 3.5 ? 'bg-muted text-muted-foreground' :
                                    'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                  }`}>
                                    {icon}{label} {val}
                                  </span>
                                );
                              })}
                            </>
                          )}
                          {factory.repurchase_rate != null && (
                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              factory.repurchase_rate >= 63 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                              factory.repurchase_rate >= 55 ? 'bg-muted text-muted-foreground' :
                              'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                            }`}>
                              🔁재구매 {factory.repurchase_rate}%
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        {factory.main_products?.length ? (
                          <div className="flex items-center gap-1.5">
                            <Package className="w-3 h-3 text-muted-foreground shrink-0" />
                            <div className="flex flex-wrap gap-1">
                              {factory.main_products.slice(0, 4).map((p, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px] font-normal py-0 h-5">{p}</Badge>
                              ))}
                              {factory.main_products.length > 4 && (
                                <Badge variant="secondary" className="text-[10px] font-normal py-0 h-5">+{factory.main_products.length - 4}</Badge>
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
                        {factory.years_on_platform != null && (
                          <span className="text-[11px] text-muted-foreground">
                            📅 입주 {factory.years_on_platform}년
                          </span>
                        )}
                      </div>
                    </div>
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
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {filtered.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-center gap-1 mt-6">
          <button
            onClick={() => setCurrentPage(Math.max(1, safeCurrentPage - 1))}
            disabled={safeCurrentPage <= 1}
            style={{
              padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 4,
              border: '1px solid #e1e3e5', background: '#fff', color: safeCurrentPage <= 1 ? '#b5b5b5' : '#202223',
              cursor: safeCurrentPage <= 1 ? 'default' : 'pointer',
            }}
          >
            ← 이전
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              style={{
                padding: '6px 10px', fontSize: 12, fontWeight: page === safeCurrentPage ? 700 : 400,
                borderRadius: 4, minWidth: 34,
                border: page === safeCurrentPage ? '1px solid #2c6ecb' : '1px solid #e1e3e5',
                background: page === safeCurrentPage ? '#f2f7fe' : '#fff',
                color: page === safeCurrentPage ? '#2c6ecb' : '#202223',
                cursor: 'pointer',
              }}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, safeCurrentPage + 1))}
            disabled={safeCurrentPage >= totalPages}
            style={{
              padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 4,
              border: '1px solid #e1e3e5', background: '#fff', color: safeCurrentPage >= totalPages ? '#b5b5b5' : '#202223',
              cursor: safeCurrentPage >= totalPages ? 'default' : 'pointer',
            }}
          >
            다음 →
          </button>
        </div>
      )}
    </div>
  );
};

export default FactoryList;
