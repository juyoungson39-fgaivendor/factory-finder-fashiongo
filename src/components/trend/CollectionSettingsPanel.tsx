import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

// ─── 사이트별 메타 정보 ───────────────────────────────────────
const SOURCE_META: Record<string, { label: string; type: 'hashtag' | 'keyword' | 'category_url'; icon: string }> = {
  instagram: { label: 'Instagram', type: 'hashtag',      icon: '📷' },
  tiktok:    { label: 'TikTok',    type: 'hashtag',      icon: '🎵' },
  magazine:  { label: 'Magazine',  type: 'keyword',      icon: '📰' },
  google:    { label: 'Google',    type: 'keyword',      icon: '🔍' },
  amazon:    { label: 'Amazon',    type: 'keyword',      icon: '📦' },
  pinterest: { label: 'Pinterest', type: 'keyword',      icon: '📌' },
  fashiongo: { label: 'FashionGo', type: 'category_url', icon: '👗' },
  shein:     { label: 'SHEIN',     type: 'category_url', icon: '🛒' },
};

const SOURCE_ORDER = ['instagram', 'tiktok', 'magazine', 'google', 'amazon', 'pinterest', 'fashiongo', 'shein'];

// ─── TagInput ────────────────────────────────────────────────
const TagInput = ({
  tags,
  onChange,
  placeholder,
  prefix = '',
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  prefix?: string;
}) => {
  const [input, setInput] = useState('');

  const addTag = () => {
    const value = input.trim().replace(/^#/, '');
    if (value && !tags.includes(value)) {
      onChange([...tags, value]);
      setInput('');
    }
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
              onClick={() => onChange(tags.filter((_, i) => i !== idx))}
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
          placeholder={placeholder}
          className="flex-1 text-xs px-2 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={addTag}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
        >
          추가
        </button>
      </div>
    </div>
  );
};

// ─── CategoryUrlInput ─────────────────────────────────────────
const CategoryUrlInput = ({
  categories,
  onChange,
}: {
  categories: CategoryUrl[];
  onChange: (categories: CategoryUrl[]) => void;
}) => {
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const addCategory = () => {
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
          placeholder="카테고리명"
          className="w-24 text-xs px-2 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          type="text"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
          placeholder="https://..."
          className="flex-1 text-xs px-2 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={addCategory}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors shrink-0"
        >
          추가
        </button>
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

  const typeLabel =
    meta.type === 'hashtag' ? '해시태그' :
    meta.type === 'keyword' ? '키워드' : '카테고리 URL';

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{meta.icon}</span>
          <span className="text-sm font-semibold">{meta.label}</span>
          <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
            {typeLabel}
          </span>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={setting.is_enabled}
            onChange={(e) => onChange({ ...setting, is_enabled: e.target.checked })}
            className="w-3.5 h-3.5 rounded accent-primary"
          />
          <span className="text-xs text-muted-foreground">활성</span>
        </label>
      </div>

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

        {/* 수집 건수 */}
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground">수집 건수</span>
          <input
            type="number"
            min={5}
            max={100}
            value={setting.collect_limit}
            onChange={(e) =>
              onChange({ ...setting, collect_limit: Math.max(5, parseInt(e.target.value) || 20) })
            }
            className="w-16 text-xs px-2 py-1 rounded border border-border bg-background text-center"
          />
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
        collect_limit: row.collect_limit ?? 20,
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
          collect_limit: 20,
          updated_at: '',
        } as CollectionSetting;
      });

      setSettings(merged);
    } catch (e) {
      console.error(e);
      toast.error('설정을 불러오지 못했습니다. DB에 collection_settings 테이블이 있는지 확인해주세요.');
      // 빈 기본값으로 UI는 보여줌
      setSettings(
        SOURCE_ORDER.map((st) => ({
          id: '',
          source_type: st,
          is_enabled: true,
          hashtags: [],
          keywords: [],
          category_urls: [],
          collect_limit: 20,
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
          저장 후 "지금 수집"을 누르면 변경된 설정으로 수집됩니다.
        </p>
      </div>
    </div>
  );
};

export default CollectionSettingsPanel;
