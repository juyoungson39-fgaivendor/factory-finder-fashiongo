import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { X, ShieldCheck, AlertCircle, Ban } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ─── 타입 ────────────────────────────────────────────────────
interface CategoryUrl {
  name: string;
  url: string;
}

interface CollectionSetting {
  id: string;
  source_type: string;
  is_enabled: boolean;
  hashtags: string[];
  keywords: string[];
  category_urls: CategoryUrl[];
  collect_limit: number;
  updated_at: string;
}

// ─── 스톱워드 타입 & 상수 ────────────────────────────────────
interface Stopword {
  keyword: string;
  category: string;
  notes: string | null;
  created_at: string;
}

const STOPWORD_CATEGORIES = [
  { value: 'game',     label: '게임'       },
  { value: 'food',     label: '음식'       },
  { value: 'tech',     label: '기술'       },
  { value: 'politics', label: '정치/뉴스'  },
  { value: 'media',    label: '미디어'     },
  { value: 'sports',   label: '스포츠 경기' },
  { value: 'etc',      label: '기타'       },
];

// ─── 스톱워드 섹션 컴포넌트 ──────────────────────────────────
const StopwordsSection = () => {
  const queryClient = useQueryClient();
  const [newKeyword, setNewKeyword]   = useState('');
  const [newCategory, setNewCategory] = useState('etc');

  // ── 데이터 fetch ──────────────────────────────────────────
  const { data: stopwords = [], isLoading } = useQuery<Stopword[]>({
    queryKey: ['trend-stopwords'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('trend_stopwords')
        .select('keyword, category, notes, created_at')
        .order('category', { ascending: true })
        .order('keyword',  { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── 카테고리별 그룹화 ─────────────────────────────────────
  const grouped = useMemo(() => {
    const g: Record<string, Stopword[]> = {};
    stopwords.forEach(s => {
      const cat = s.category || 'etc';
      if (!g[cat]) g[cat] = [];
      g[cat].push(s);
    });
    return g;
  }, [stopwords]);

  // ── 추가 mutation ─────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async ({ keyword, category }: { keyword: string; category: string }) => {
      const normalized = keyword.trim().toLowerCase();
      if (normalized.length < 2) throw new Error('2자 이상 입력해주세요');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('trend_stopwords')
        .insert({ keyword: normalized, category });
      if (error) throw error;
      return normalized;
    },
    onSuccess: (normalized) => {
      queryClient.invalidateQueries({ queryKey: ['trend-stopwords'] });
      toast.success(`"${normalized}" 추가됨`);
      setNewKeyword('');
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      if (err?.code === '23505') {
        toast.error('이미 등록된 키워드입니다');
      } else {
        toast.error('추가 실패: ' + (err?.message ?? String(err)));
      }
    },
  });

  // ── 삭제 mutation ─────────────────────────────────────────
  const removeMutation = useMutation({
    mutationFn: async (keyword: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('trend_stopwords')
        .delete()
        .eq('keyword', keyword);
      if (error) throw error;
      return keyword;
    },
    onSuccess: (keyword) => {
      queryClient.invalidateQueries({ queryKey: ['trend-stopwords'] });
      toast.success(`"${keyword}" 삭제됨`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      toast.error('삭제 실패: ' + (err?.message ?? String(err)));
    },
  });

  const handleAdd = () => {
    if (!newKeyword.trim()) return;
    addMutation.mutate({ keyword: newKeyword, category: newCategory });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">비패션 키워드 관리</CardTitle>
        <CardDescription className="text-xs">
          이 단어들이 트렌드 키워드에 포함되면 수집이 자동 차단됩니다.
          sneakers/sportswear 등 fashion-adjacent 단어는 추가하지 마세요.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 추가 입력 */}
        <div className="flex gap-2">
          <Input
            placeholder="새 키워드 (예: cryptocurrency)"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            className="flex-1 text-xs h-8"
          />
          <Select value={newCategory} onValueChange={setNewCategory}>
            <SelectTrigger className="w-[110px] text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STOPWORD_CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 text-xs px-3 shrink-0"
            disabled={!newKeyword.trim() || addMutation.isPending}
            onClick={handleAdd}
          >
            {addMutation.isPending ? '추가 중…' : '추가'}
          </Button>
        </div>

        {/* 로딩 */}
        {isLoading && (
          <p className="text-xs text-muted-foreground">불러오는 중…</p>
        )}

        {/* 카테고리별 키워드 칩 */}
        {!isLoading && STOPWORD_CATEGORIES.map(cat => {
          const items = grouped[cat.value] ?? [];
          if (items.length === 0) return null;
          return (
            <div key={cat.value}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs font-semibold">{cat.label}</span>
                <span className="text-[10px] text-muted-foreground">({items.length})</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {items.map(s => (
                  <Badge
                    key={s.keyword}
                    variant="secondary"
                    className="cursor-pointer text-[11px] hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    onClick={() => {
                      if (window.confirm(`"${s.keyword}"을 삭제하시겠습니까?`)) {
                        removeMutation.mutate(s.keyword);
                      }
                    }}
                  >
                    {s.keyword}
                    <X className="h-3 w-3 ml-1 shrink-0" />
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}

        {/* 총 카운트 */}
        {!isLoading && (
          <div className="text-[11px] text-muted-foreground pt-2 border-t border-border">
            총 {stopwords.length}개 활성
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── 운영 상태 타입 & 상수 ───────────────────────────────────
type CollectorStatus = 'stable' | 'external_dep' | 'permanently_blocked';

interface SourceStatusInfo {
  status: CollectorStatus;
  label: string;
  tooltip: string;
}

const _stableMag = (tooltip: string): SourceStatusInfo => ({
  status: 'stable',
  label: '안정',
  tooltip,
});

const SOURCE_STATUS: Record<string, SourceStatusInfo> = {
  instagram: {
    status: 'permanently_blocked',
    label: '영구 차단',
    tooltip: 'Apify Instagram scraper 차단으로 거의 0건/에러. ENABLE_INSTAGRAM_SCRAPING flag 비활성.',
  },
  tiktok: {
    status: 'external_dep',
    label: '외부 의존',
    tooltip: 'Apify actor 토큰 필요. Apify 차단/rate-limit 위험.',
  },
  pinterest: {
    status: 'external_dep',
    label: '외부 의존',
    tooltip: 'Apify actor 토큰 필요.',
  },
  google: {
    status: 'external_dep',
    label: '외부 의존',
    tooltip: 'SerpApi 키 필요. SerpApi 한도 위험.',
  },
  amazon: {
    status: 'external_dep',
    label: '외부 의존',
    tooltip: 'SerpApi 키 필요. SerpApi 한도 위험.',
  },
  shein: {
    status: 'external_dep',
    label: '외부 의존',
    tooltip: 'Apify shahidirfan~shein-product-scraper 토큰 필요.',
  },
  zara: {
    status: 'external_dep',
    label: '외부 의존',
    tooltip: 'Apify karamelo~zara-scraper 토큰 필요. 권한 미승인 사례 있음.',
  },
  fashiongo: _stableMag('fashiongo.net HTML + Lovable AI. LOVABLE_API_KEY 자동 제공.'),
  magazine:  _stableMag('RSS fetch + OpenAI 분석. OpenAI 토큰 없어도 수집됨.'),
  vogue:        _stableMag('RSS fetch + OpenAI 분석. OpenAI 토큰 없어도 수집됨.'),
  elle:         _stableMag('RSS fetch + OpenAI 분석. OpenAI 토큰 없어도 수집됨.'),
  wwd:          _stableMag('RSS fetch + OpenAI 분석. OpenAI 토큰 없어도 수집됨.'),
  hypebeast:    _stableMag('RSS fetch + OpenAI 분석. OpenAI 토큰 없어도 수집됨.'),
  highsnobiety: _stableMag('RSS fetch + OpenAI 분석. OpenAI 토큰 없어도 수집됨.'),
  footwearnews: _stableMag('RSS fetch + OpenAI 분석. OpenAI 토큰 없어도 수집됨.'),
};

// ─── StatusBadge ─────────────────────────────────────────────
const StatusBadge = ({ sourceType }: { sourceType: string }) => {
  const info = SOURCE_STATUS[sourceType];
  if (!info) return null;

  const colorCls =
    info.status === 'stable'              ? 'text-green-600' :
    info.status === 'external_dep'        ? 'text-amber-600' :
                                            'text-red-600';

  const Icon =
    info.status === 'stable'              ? ShieldCheck :
    info.status === 'external_dep'        ? AlertCircle :
                                            Ban;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex items-center gap-0.5 text-[11px] cursor-default shrink-0', colorCls)}>
            <Icon className="h-3.5 w-3.5" />
            <span>{info.label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">{info.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// ─── 사이트별 메타 정보 ───────────────────────────────────────
const SOURCE_META: Record<string, { label: string; type: 'hashtag' | 'keyword' | 'category_url'; icon: string }> = {
  instagram:    { label: 'Instagram',     type: 'hashtag',      icon: '📷' },
  tiktok:       { label: 'TikTok',        type: 'hashtag',      icon: '🎵' },
  vogue:        { label: 'Vogue',         type: 'keyword',      icon: '📰' },
  elle:         { label: 'Elle',          type: 'keyword',      icon: '📰' },
  wwd:          { label: 'WWD',           type: 'keyword',      icon: '📰' },
  hypebeast:    { label: 'Hypebeast',     type: 'keyword',      icon: '📰' },
  highsnobiety: { label: 'Highsnobiety',  type: 'keyword',      icon: '📰' },
  footwearnews: { label: 'Footwear News', type: 'keyword',      icon: '📰' },
  google:       { label: 'Google',        type: 'keyword',      icon: '🔍' },
  amazon:       { label: 'Amazon',        type: 'keyword',      icon: '📦' },
  pinterest:    { label: 'Pinterest',     type: 'keyword',      icon: '📌' },
  fashiongo:    { label: 'FashionGo',     type: 'category_url', icon: '👗' },
  shein:        { label: 'SHEIN',         type: 'category_url', icon: '🛒' },
  zara:         { label: 'ZARA',          type: 'keyword',      icon: '🧥' },
};

const SOURCE_ORDER = ['instagram', 'tiktok', 'vogue', 'elle', 'wwd', 'hypebeast', 'highsnobiety', 'footwearnews', 'google', 'amazon', 'zara', 'pinterest', 'fashiongo', 'shein'];

const MAX_TAGS = 10;
const MAX_CATEGORIES = 10;

// ─── TagInput ────────────────────────────────────────────────
const TagInput = ({
  tags,
  onChange,
  placeholder,
  prefix = '',
  maxTags = MAX_TAGS,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  prefix?: string;
  maxTags?: number;
}) => {
  const [input, setInput] = useState('');
  const isMaxReached = tags.length >= maxTags;

  const addTag = () => {
    if (isMaxReached) return;
    const value = input.trim().replace(/^#/, '');
    if (value && !tags.includes(value)) {
      onChange([...tags, value]);
      setInput('');
    }
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {tags.map((tag, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-muted text-foreground"
          >
            {prefix}{tag}
            <button
              type="button"
              onClick={() => removeTag(idx)}
              className="text-muted-foreground hover:text-foreground leading-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder={isMaxReached ? `최대 ${maxTags}개까지 입력 가능` : placeholder}
          disabled={isMaxReached}
          className={cn(
            'flex-1 text-xs px-2 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary',
            isMaxReached && 'opacity-50 cursor-not-allowed'
          )}
        />
        <button
          type="button"
          onClick={addTag}
          disabled={isMaxReached}
          className={cn(
            'text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors',
            isMaxReached && 'opacity-50 cursor-not-allowed'
          )}
        >
          추가
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 text-right">
        {tags.length} / {maxTags}
      </div>
    </div>
  );
};

// ─── CategoryUrlInput ─────────────────────────────────────────
const CategoryUrlInput = ({
  categories,
  onChange,
  maxCategories = MAX_CATEGORIES,
}: {
  categories: CategoryUrl[];
  onChange: (categories: CategoryUrl[]) => void;
  maxCategories?: number;
}) => {
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const isMaxReached = categories.length >= maxCategories;

  const addCategory = () => {
    if (isMaxReached) return;
    if (newName.trim() && newUrl.trim()) {
      onChange([...categories, { name: newName.trim(), url: newUrl.trim() }]);
      setNewName('');
      setNewUrl('');
    }
  };

  return (
    <div>
      {categories.map((cat, idx) => (
        <div key={idx} className="flex items-start gap-2 mb-2 p-2 rounded bg-muted/50">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">{cat.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">{cat.url}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(categories.filter((_, i) => i !== idx))}
            className="text-muted-foreground hover:text-foreground text-sm leading-none mt-0.5 shrink-0"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={isMaxReached ? '최대 도달' : '카테고리명'}
          disabled={isMaxReached}
          className={cn(
            'w-24 text-xs px-2 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary',
            isMaxReached && 'opacity-50 cursor-not-allowed'
          )}
        />
        <input
          type="text"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
          placeholder={isMaxReached ? '' : 'https://...'}
          disabled={isMaxReached}
          className={cn(
            'flex-1 text-xs px-2 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary',
            isMaxReached && 'opacity-50 cursor-not-allowed'
          )}
        />
        <button
          type="button"
          onClick={addCategory}
          disabled={isMaxReached}
          className={cn(
            'text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors shrink-0',
            isMaxReached && 'opacity-50 cursor-not-allowed'
          )}
        >
          추가
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 text-right">
        {categories.length} / {maxCategories}
      </div>
    </div>
  );
};

// ─── SourceSettingCard ────────────────────────────────────────
const SourceSettingCard = ({
  setting,
  onChange,
}: {
  setting: CollectionSetting;
  onChange: (updated: CollectionSetting) => void;
}) => {
  const meta = SOURCE_META[setting.source_type];
  if (!meta) return null;

  const statusInfo = SOURCE_STATUS[setting.source_type];
  const isPermanentlyBlocked = statusInfo?.status === 'permanently_blocked';

  const typeLabel =
    meta.type === 'hashtag' ? '해시태그' :
    meta.type === 'keyword' ? '키워드' : '카테고리 URL';

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span>{meta.icon}</span>
          <span className="text-sm font-semibold">{meta.label}</span>
          <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
            {typeLabel}
          </span>
          <StatusBadge sourceType={setting.source_type} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">수집</span>
          <Switch
            checked={setting.is_enabled}
            disabled={isPermanentlyBlocked}
            onCheckedChange={(checked) => onChange({ ...setting, is_enabled: checked })}
          />
        </div>
      </div>
      {isPermanentlyBlocked && (
        <p className="text-xs text-muted-foreground">
          현재 사용 불가. 외부 환경 복구 시 다시 활성화 가능.
        </p>
      )}

      {/* 입력 영역 — 비활성 시 흐리게 */}
      <div className={setting.is_enabled ? '' : 'opacity-40 pointer-events-none'}>
        {meta.type === 'hashtag' && (
          <TagInput
            tags={setting.hashtags}
            onChange={(tags) => onChange({ ...setting, hashtags: tags })}
            placeholder="해시태그 추가 (Enter)"
            prefix="#"
          />
        )}
        {meta.type === 'keyword' && (
          <TagInput
            tags={setting.keywords}
            onChange={(tags) => onChange({ ...setting, keywords: tags })}
            placeholder="키워드 추가 (Enter)"
          />
        )}
        {meta.type === 'category_url' && (
          <CategoryUrlInput
            categories={setting.category_urls}
            onChange={(cats) => onChange({ ...setting, category_urls: cats })}
          />
        )}

        {/* 수집 건수 — 드롭다운 1~10 */}
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground">수집 건수</span>
          <select
            value={setting.collect_limit}
            onChange={(e) => onChange({ ...setting, collect_limit: parseInt(e.target.value) })}
            className="text-xs px-2 py-1 rounded border border-border bg-background cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="text-[11px] text-muted-foreground">건 / 사이트</span>
        </div>
      </div>
    </div>
  );
};

// ─── CollectionSettingsPanel (메인) ───────────────────────────
export const CollectionSettingsPanel = ({ onSaved }: { onSaved?: () => void }) => {
  const [settings, setSettings] = useState<CollectionSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const normalizeLimit = (val: number | null | undefined): number => {
    const n = val ?? 5;
    if (n > 10) return 10;
    if (n < 1) return 1;
    return n;
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('collection_settings')
        .select('*')
        .order('source_type');

      if (error) throw error;

      // DB에 데이터가 없으면 기본 행 생성
      const dbSettings: CollectionSetting[] = (data || []).map((row: CollectionSetting) => ({
        ...row,
        hashtags: row.hashtags ?? [],
        keywords: row.keywords ?? [],
        category_urls: Array.isArray(row.category_urls) ? row.category_urls : [],
        collect_limit: normalizeLimit(row.collect_limit),
      }));

      // 빠진 source_type은 기본값으로 채움
      const merged = SOURCE_ORDER.map((st) => {
        const existing = dbSettings.find((s) => s.source_type === st);
        if (existing) return existing;
        return {
          id: '',
          source_type: st,
          is_enabled: true,
          hashtags: [],
          keywords: [],
          category_urls: [],
          collect_limit: 5,
          updated_at: '',
        } as CollectionSetting;
      });

      setSettings(merged);
    } catch (e) {
      console.error(e);
      toast.error('설정을 불러오지 못했습니다. DB에 collection_settings 테이블이 있는지 확인해주세요.');
      setSettings(
        SOURCE_ORDER.map((st) => ({
          id: '',
          source_type: st,
          is_enabled: true,
          hashtags: [],
          keywords: [],
          category_urls: [],
          collect_limit: 5,
          updated_at: '',
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const s of settings) {
        const payload = {
          source_type: s.source_type,
          is_enabled: s.is_enabled,
          hashtags: s.hashtags,
          keywords: s.keywords,
          category_urls: s.category_urls,
          collect_limit: s.collect_limit,
          updated_at: new Date().toISOString(),
        };

        if (s.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from('collection_settings')
            .update(payload)
            .eq('id', s.id);
          if (error) throw error;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any)
            .from('collection_settings')
            .insert(payload);
          if (error) throw error;
        }
      }
      toast.success('수집 설정이 저장되었습니다.');
      onSaved?.();
    } catch (e) {
      console.error(e);
      toast.error('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        설정을 불러오는 중...
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {settings.map((setting) => (
        <SourceSettingCard
          key={setting.source_type}
          setting={setting}
          onChange={(updated) =>
            setSettings(settings.map((s) => s.source_type === updated.source_type ? updated : s))
          }
        />
      ))}

      {/* ── 비패션 키워드 (스톱워드) 관리 ── */}
      <StopwordsSection />

      <div className="sticky bottom-0 bg-background pt-3 border-t border-border">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
        <p className="text-[11px] text-muted-foreground text-center mt-2">
          저장 후 "트렌드 수집하기"를 누르면 변경된 설정으로 수집됩니다.
        </p>
      </div>
    </div>
  );
};

export default CollectionSettingsPanel;
