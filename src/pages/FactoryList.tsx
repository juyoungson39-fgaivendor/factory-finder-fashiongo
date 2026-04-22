import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, MapPin, Mail, Phone, MessageSquare, ExternalLink, Package, Clock, Layers, Download, Tag, Star, Pencil, Trash2, Upload, Loader2, CheckSquare, FlaskConical, AlertCircle } from 'lucide-react';
import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import ScoreBadge from '@/components/ScoreBadge';
import StatusBadge from '@/components/StatusBadge';
import { DEV_FACTORIES, isDevMode } from '@/lib/devMockData';
import FactorySyncDialog from '@/components/FactorySyncDialog';
import { RefreshCw } from 'lucide-react';
import { RecentFactoryActivityWidget } from '@/components/factory/RecentFactoryActivityWidget';
import { parseFactoryCsv, type ParsedFactoryRow } from '@/lib/factoryCsvParser';

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
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncTarget, setSyncTarget] = useState<'all' | 'selected'>('all');
  const [aiScoringIds, setAiScoringIds] = useState<Set<string>>(new Set());
  // CSV 업로드 진행 상태
  const [csvStage, setCsvStage] = useState<'idle' | 'parsing' | 'saving' | 'done'>('idle');
  const [csvProgress, setCsvProgress] = useState(0);
  const [csvFailures, setCsvFailures] = useState<{ name: string; reason: string }[]>([]);
  const [csvFailuresOpen, setCsvFailuresOpen] = useState(false);

  const runAiScoring = async (ids: string[]) => {
    if (ids.length === 0) return;
    const scoringSet = new Set(ids);
    setAiScoringIds(scoringSet);
    toast.success(`${ids.length}개 공장 AI 스코어링을 시작합니다...`);
    for (const fid of ids) {
      try {
        await supabase.functions.invoke('auto-score-factory', { body: { factory_id: fid } });
      } catch (err) {
        console.error('AI scoring error for', fid, err);
      }
    }
    setAiScoringIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['factories'] });
    toast.success('AI 스코어링이 완료되었습니다.');
  };

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

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const ids = factories.map((f) => f.id);
      if (ids.length === 0) return;
      const { error } = await supabase
        .from('factories')
        .update({ deleted_at: new Date().toISOString(), deleted_reason: 'bulk_deleted' })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factories'] });
      toast.success('모든 공장 데이터가 삭제되었습니다.');
      setDeleteAllOpen(false);
    },
    onError: () => toast.error('전체 삭제에 실패했습니다.'),
  });

  const downloadCrawlTargets = async () => {
    try {
      const { data, error } = await supabase
        .from('factories')
        .select('shop_id, source_url, name, fg_collab_status, fg_collab_code, p1_crawled_at, score_status')
        .not('source_url', 'is', null)
        .neq('source_url', '')
        .ilike('source_url', '%1688.com%')
        .is('deleted_at', null);
      if (error) throw error;

      const filtered = (data ?? []).filter(
        (r: any) => r.p1_crawled_at == null || r.score_status === 'error',
      );

      const order: Record<string, number> = { active: 1, fg_listed: 2, new: 3, stopped: 4 };
      filtered.sort((a: any, b: any) => {
        const oa = order[a.fg_collab_status] ?? 99;
        const ob = order[b.fg_collab_status] ?? 99;
        if (oa !== ob) return oa - ob;
        return (a.name ?? '').localeCompare(b.name ?? '');
      });

      const escape = (v: unknown) => {
        if (v == null) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ['shop_id', 'source_url', 'name', 'fg_collab_status', 'fg_collab_code'];
      const lines = [header.join(',')];
      for (const r of filtered) {
        lines.push(
          [r.shop_id, r.source_url, r.name, r.fg_collab_status, r.fg_collab_code]
            .map(escape)
            .join(','),
        );
      }
      const csv = lines.join('\n');

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const filename = `crawl_targets_${ts}.csv`;

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);

      toast.success(`크롤 대상 ${filtered.length}건을 다운로드했습니다.`);
    } catch (err: any) {
      toast.error('다운로드 실패: ' + (err?.message || String(err)));
    }
  };

  const downloadCsvTemplate = () => {
    const rows = [
      'name,country,province,city,source_platform,source_url,shop_id,offer_id,main_products,moq,lead_time,status,fg_partner,remark,contact_name,contact_email,contact_wechat,fg_collab_status,fg_collab_code,fg_collab_note',
      '深圳市龙岗区迪芸服装厂,China,广东,深圳,1688,https://detail.1688.com/offer/901940300819.html,,901940300819,,,,active,false,正在合作中,,,,active,FG-DY-001,주력 거래처',
      '广州云尚里跨境供应链有限公司,China,广东,广州,1688,https://shop123.1688.com/page/offerlist.htm,shop123,,,,,fg_listed,true,入驻FG,,,,fg_listed,FG-YS-002,FG 등록 완료',
      '广州市凯阔服饰有限公司,China,广东,广州,1688,https://detail.1688.com/offer/886007565078.html,,886007565078,,,,active,false,正在合作中,,,,new,,',
      'Sample Alibaba Vendor,China,广东,深圳,alibaba,https://sample-vendor.en.alibaba.com,,,,,,active,false,Alibaba 거래처,,,,active,FG-AL-003,',
    ];
    const csv = rows.join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'factories_template_v3.4.csv';
    link.click();
  };

  // v3.3 CSV 업로드 핸들러: 17컬럼, URL 파싱, fg_partner 자동, shop_id UPSERT
  const processParsedRows = async (parsed: ParsedFactoryRow[]) => {
    if (!user) throw new Error('로그인이 필요합니다');
    if (parsed.length === 0) throw new Error('유효한 공장 데이터가 없습니다');

    setCsvStage('saving');
    setCsvProgress(50);

    // shop_id가 있는 행 → 기존 row와 충돌 가능. 한 번만 조회해서 매핑.
    const shopIds = parsed.map((r) => r.shop_id).filter((s): s is string => !!s);
    const existingByShopId = new Map<string, { id: string; fg_partner: boolean | null; score_status: string | null }>();
    if (shopIds.length > 0) {
      const { data: existing, error: selErr } = await supabase
        .from('factories')
        .select('id, shop_id, fg_partner, score_status')
        .in('shop_id', shopIds)
        .is('deleted_at', null);
      if (selErr) throw selErr;
      (existing ?? []).forEach((row: any) => {
        if (row.shop_id) existingByShopId.set(row.shop_id, row);
      });
    }

    const failures: { name: string; reason: string }[] = [];
    const insertedIds: string[] = [];
    const total = parsed.length;
    let done = 0;

    for (const r of parsed) {
      const basePayload: Record<string, unknown> = {
        user_id: user.id,
        name: r.name,
        country: r.country,
        province: r.province,
        city: r.city,
        source_platform: r.source_platform,
        source_url: r.source_url,
        shop_id: r.shop_id,
        offer_id: r.offer_id,
        main_products: r.main_products,
        moq: r.moq,
        lead_time: r.lead_time,
        description: r.description,
        contact_name: r.contact_name,
        contact_email: r.contact_email,
        contact_wechat: r.contact_wechat,
        // FG 협업 컬럼: null이면 덮어쓰지 않도록 분기에서 제거
        ...(r.fg_collab_status != null && { fg_collab_status: r.fg_collab_status }),
        ...(r.fg_collab_code != null && { fg_collab_code: r.fg_collab_code }),
        ...(r.fg_collab_note != null && { fg_collab_note: r.fg_collab_note }),
        // Alibaba 자동 감지
        ...(r.alibaba_detected && { alibaba_detected: true, alibaba_url: r.alibaba_url }),
      };

      try {
        const existing = r.shop_id ? existingByShopId.get(r.shop_id) : undefined;
        if (existing) {
          // UPSERT: shop_id 충돌 → 기존 row UPDATE
          //   ❗ fg_partner / score_status 는 절대 덮어쓰지 않는다
          const { error: updErr } = await supabase
            .from('factories')
            .update(basePayload)
            .eq('id', existing.id);
          if (updErr) throw updErr;
          insertedIds.push(existing.id);
        } else {
          // 신규 INSERT: fg_partner / status / score_status 초기화
          const insertPayload = {
            ...basePayload,
            fg_partner: r.fg_partner,
            status: r.status,
            score_status: 'new',
            // fg_collab_status가 CSV에 없으면 기본값 'new'
            fg_collab_status: r.fg_collab_status ?? 'new',
          };
          const { data: ins, error: insErr } = await supabase
            .from('factories')
            .insert(insertPayload as any)
            .select('id')
            .single();
          if (insErr) throw insErr;
          if (ins?.id) insertedIds.push(ins.id);
        }

        if (r.parse_error) {
          failures.push({ name: r.name, reason: r.parse_error });
        }
      } catch (rowErr: any) {
        failures.push({
          name: r.name,
          reason: rowErr?.message || '알 수 없는 오류',
        });
      } finally {
        done++;
        setCsvProgress(50 + Math.round((done / total) * 50));
      }
    }

    return { insertedIds, failures };
  };

  const runCsvImport = async (text: string, sourceLabel: string) => {
    setCsvUploading(true);
    setCsvStage('parsing');
    setCsvProgress(15);
    setCsvFailures([]);

    try {
      const { rows, failed: parseFailed } = parseFactoryCsv(text);
      if (rows.length === 0 && parseFailed.length > 0) {
        throw new Error(parseFailed[0].reason);
      }
      setCsvProgress(40);

      const { insertedIds, failures } = await processParsedRows(rows);

      const allFailures = [
        ...parseFailed.map((f) => ({ name: f.name, reason: `라인 ${f.line}: ${f.reason}` })),
        ...failures,
      ];

      setCsvStage('done');
      setCsvProgress(100);
      setCsvFailures(allFailures);
      if (allFailures.length > 0) setCsvFailuresOpen(true);

      const successCount = insertedIds.length;
      const failCount = allFailures.length;
      if (successCount > 0 && failCount === 0) {
        toast.success(`${sourceLabel}: ${successCount}개 성공`);
      } else if (successCount > 0 && failCount > 0) {
        toast.warning(`${sourceLabel}: ${successCount}개 성공 / ${failCount}개 실패`);
      } else {
        toast.error(`${sourceLabel}: 모두 실패 (${failCount}건)`);
      }

      queryClient.invalidateQueries({ queryKey: ['factories'] });

      // AI 스코어링 트리거 (신규 + UPSERT 모두)
      for (const fid of insertedIds) {
        supabase.functions.invoke('auto-score-factory', { body: { factory_id: fid } });
      }
    } catch (err: any) {
      setCsvStage('idle');
      setCsvProgress(0);
      toast.error('CSV 업로드 실패: ' + (err?.message || String(err)));
    } finally {
      setCsvUploading(false);
      if (csvRef.current) csvRef.current.value = '';
      // 진행 바는 잠깐 보였다가 idle로 복귀
      setTimeout(() => {
        setCsvStage((s) => (s === 'done' ? 'idle' : s));
        setCsvProgress(0);
      }, 1500);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    // utf-8-sig 지원: parser에서 BOM을 제거함
    const text = await file.text();
    await runCsvImport(text, file.name);
  };

  // 임시: v3.3 형식 샘플 1건을 즉석 업로드하여 동작 확인
  const uploadTestSample = async () => {
    if (!user) {
      toast.error('로그인이 필요합니다');
      return;
    }
    const sample = [
      'name,country,province,city,source_platform,source_url,shop_id,offer_id,main_products,moq,lead_time,status,fg_partner,remark,contact_name,contact_email,contact_wechat',
      `테스트공장-${Date.now()},China,广东,深圳,1688,https://detail.1688.com/offer/901940300819.html,,,,,,active,false,v3.3 테스트 업로드,,,`,
    ].join('\n');
    await runCsvImport(sample, '테스트 샘플');
  };

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
      <RecentFactoryActivityWidget />

      {(csvStage !== 'idle' || csvUploading) && (
        <div className="mb-4 p-3 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="font-medium uppercase tracking-wider">
              {csvStage === 'parsing' && '1/3 · CSV 파싱 중'}
              {csvStage === 'saving' && '2/3 · 데이터베이스 저장 중'}
              {csvStage === 'done' && '3/3 · 완료'}
              {csvStage === 'idle' && csvUploading && '준비 중'}
            </span>
            <span>{csvProgress}%</span>
          </div>
          <Progress value={csvProgress} className="h-1.5" />
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs uppercase tracking-wider font-medium"
            onClick={() => csvRef.current?.click()}
            disabled={csvUploading}
          >
            {csvUploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
            CSV 등록
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 text-xs uppercase tracking-wider font-medium"
            onClick={downloadCsvTemplate}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            CSV 양식
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs uppercase tracking-wider font-medium"
            onClick={downloadCrawlTargets}
            title="1688 source_url을 가진 미크롤링/에러 공장의 CSV"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            📥 크롤 대상 URL
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 text-xs uppercase tracking-wider font-medium text-amber-700 hover:text-amber-800"
            onClick={uploadTestSample}
            disabled={csvUploading}
            title="v3.3 형식 샘플 1건을 즉석 업로드"
          >
            <FlaskConical className="w-3.5 h-3.5 mr-1.5" />
            테스트 샘플 1건
          </Button>
          {csvFailures.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 text-xs uppercase tracking-wider font-medium text-destructive"
              onClick={() => setCsvFailuresOpen(true)}
            >
              <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
              실패 {csvFailures.length}건
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <Button
                size="sm"
                className="h-9 text-xs uppercase tracking-wider font-medium bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => runAiScoring(Array.from(selectedIds))}
                disabled={aiScoringIds.size > 0}
              >
                {aiScoringIds.size > 0 ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Star className="w-3.5 h-3.5 mr-1.5" />}
                🤖 AI 스코어링 ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                className="h-9 text-xs uppercase tracking-wider font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => { setSyncTarget('selected'); setSyncDialogOpen(true); }}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                🔄 선택 동기화 ({selectedIds.size})
              </Button>
            </>
          )}
          <Button
            size="sm"
            className="h-9 text-xs uppercase tracking-wider font-medium bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => { setSyncTarget('all'); setSyncDialogOpen(true); }}
            disabled={factories.length === 0}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            🔄 전체 동기화
          </Button>
          <Button
            variant="outline"
            className="h-9 text-xs uppercase tracking-wider font-medium text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setDeleteAllOpen(true)}
            disabled={factories.length === 0}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            전체 삭제
          </Button>
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

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={filtered.length > 0 && filtered.every(f => selectedIds.has(f.id))}
            onCheckedChange={(checked) => {
              if (checked) {
                setSelectedIds(new Set(filtered.map(f => f.id)));
              } else {
                setSelectedIds(new Set());
              }
            }}
          />
          <span className="text-xs text-muted-foreground">
            {selectedIds.size > 0 ? `${selectedIds.size}개 선택됨` : `${filtered.length}개 공장`}
          </span>
          {selectedIds.size > 0 && (
            <button onClick={() => setSelectedIds(new Set())} className="text-[11px] text-muted-foreground hover:text-foreground underline ml-1">선택 해제</button>
          )}
        </div>
      </div>

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
            <div key={factory.id} className="relative">
              <Link to={`/factories/${factory.id}`} className="block">
              <Card className={`hover:bg-secondary/40 transition-colors cursor-pointer ${selectedIds.has(factory.id) ? 'ring-2 ring-primary/50' : ''}`}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center gap-2 shrink-0" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                      <Checkbox
                        checked={selectedIds.has(factory.id)}
                        onCheckedChange={(checked) => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (checked) next.add(factory.id); else next.delete(factory.id);
                            return next;
                          });
                        }}
                        onClick={(e) => { e.stopPropagation(); }}
                      />
                    </div>
                    <ScoreBadge score={factory.overall_score ?? 0} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="text-sm font-semibold truncate">{factory.name}</h3>
                        <StatusBadge status={factory.status ?? 'new'} />
                        {(!(factory as any).last_synced_at || (Date.now() - new Date((factory as any).last_synced_at as string).getTime() > 7 * 24 * 60 * 60 * 1000)) && factory.source_url && (
                          <Badge variant="outline" className="text-[10px] py-0 h-5 bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800">
                            동기화 필요
                          </Badge>
                        )}
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
                      {(factory.platform_score != null || detail || (factory as any).trend_match_score != null) && (
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
                          {(factory as any).trend_match_score != null && (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded ${
                              (factory as any).trend_match_score >= 75
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : (factory as any).trend_match_score >= 50
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                              📈트렌드 {Math.round((factory as any).trend_match_score)}
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
                    <div className="flex flex-col items-center gap-1.5 shrink-0 mt-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.location.href = `/factories/${factory.id}`;
                        }}
                        title="수정"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteTarget({ id: factory.id, name: factory.name });
                        }}
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      {factory.source_url && (
                        <a
                          href={factory.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground/40 hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            </div>
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

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>공장 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong>을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete All Confirmation */}
      <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>전체 공장 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              등록된 <strong>{factories.length}개</strong> 공장을 모두 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteAllMutation.mutate()}
            >
              전체 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FactorySyncDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        factories={syncTarget === 'selected' ? factories.filter(f => selectedIds.has(f.id)) : factories}
        onComplete={() => queryClient.invalidateQueries({ queryKey: ['factories'] })}
      />

      {/* CSV 업로드 실패 상세 */}
      <AlertDialog open={csvFailuresOpen} onOpenChange={setCsvFailuresOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>CSV 업로드 실패 항목 ({csvFailures.length}건)</AlertDialogTitle>
            <AlertDialogDescription>
              아래 행은 저장에 실패했거나 source_url 패턴 인식이 불가능합니다. 원본 CSV에서 해당 행을 수정한 뒤 다시 업로드해주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-96 overflow-y-auto border border-border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">공장명</th>
                  <th className="px-3 py-2 text-left font-medium">실패 사유</th>
                </tr>
              </thead>
              <tbody>
                {csvFailures.map((f, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2 align-top whitespace-nowrap">{f.name}</td>
                    <td className="px-3 py-2 text-destructive">{f.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FactoryList;
