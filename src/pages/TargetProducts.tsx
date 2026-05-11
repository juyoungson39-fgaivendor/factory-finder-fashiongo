import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ExternalLink, Search } from 'lucide-react';
import { format } from 'date-fns';

// 타겟 플랫폼 — ImageTrendTab.tsx 의 TARGET_PLATFORMS 와 동일
const TARGET_PLATFORMS = ['zara', 'amazon', 'shein'] as const;

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=500&fit=crop';

type TrendItem = {
  id: string;
  platform: string;
  image_url: string;
  permalink: string;
  trend_name: string;
  summary_ko: string;
  trend_keywords: string[];
  primary_category: string | null;
  created_at: string;
};

export default function TargetProducts() {
  const [search, setSearch] = useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['target-trend-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trend_analyses')
        .select('*')
        .eq('status', 'analyzed')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      return (data ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any) => {
          const sd = row.source_data || {};
          const platform = (sd.platform || '').toLowerCase().trim();
          return {
            id: row.id,
            platform,
            image_url: (sd.image_url || '').trim() || FALLBACK_IMG,
            permalink: sd.permalink || '',
            trend_name: sd.trend_name || sd.article_title || '',
            summary_ko:
              sd.summary_ko && sd.summary_ko !== 'GPT 미연동 - 기본 수집'
                ? sd.summary_ko
                : '',
            trend_keywords: row.trend_keywords || [],
            primary_category:
              row.primary_category ?? sd.primary_category ?? null,
            created_at: row.created_at,
          } as TrendItem;
        })
        .filter((item) =>
          TARGET_PLATFORMS.includes(item.platform as (typeof TARGET_PLATFORMS)[number])
        );
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.trend_name.toLowerCase().includes(q) ||
        item.platform.includes(q) ||
        item.trend_keywords.some((k) => k.toLowerCase().includes(q)) ||
        (item.primary_category?.toLowerCase().includes(q) ?? false),
    );
  }, [items, search]);

  return (
    <div className="space-y-4">

      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">타겟상품</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            트렌드 분석 중 Zara · Amazon · Shein 출처로 분류된 타겟 상품 목록
          </p>
        </div>
      </div>

      {/* ── 검색 ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="상품명 / 플랫폼 / 키워드 / 카테고리..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {isLoading ? '로딩 중...' : `${filtered.length}건`}
        </span>
      </div>

      {/* ── 테이블 ───────────────────────────────────────────── */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-12 text-center">로딩 중...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          {search.trim() ? '검색 결과가 없습니다.' : '타겟 상품 데이터가 없습니다.'}
        </p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-16 text-xs">이미지</TableHead>
                <TableHead className="w-24 text-xs">플랫폼</TableHead>
                <TableHead className="text-xs">상품명</TableHead>
                <TableHead className="w-28 text-xs">카테고리</TableHead>
                <TableHead className="text-xs">키워드</TableHead>
                <TableHead className="w-48 text-xs">요약</TableHead>
                <TableHead className="w-20 text-xs">수집일</TableHead>
                <TableHead className="w-8 text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/30 align-top">
                  {/* 이미지 */}
                  <TableCell className="py-2">
                    <img
                      src={item.image_url}
                      alt=""
                      className="w-12 h-14 object-cover rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = FALLBACK_IMG;
                      }}
                    />
                  </TableCell>
                  {/* 플랫폼 배지 */}
                  <TableCell className="py-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 capitalize"
                    >
                      🎯 {item.platform}
                    </Badge>
                  </TableCell>
                  {/* 상품명 */}
                  <TableCell className="py-2 font-medium text-sm max-w-[200px]">
                    <span className="line-clamp-2">{item.trend_name || '—'}</span>
                  </TableCell>
                  {/* 카테고리 */}
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    {item.primary_category || '—'}
                  </TableCell>
                  {/* 키워드 */}
                  <TableCell className="py-2">
                    <div className="flex flex-wrap gap-0.5 max-w-[180px]">
                      {item.trend_keywords.slice(0, 5).map((k, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-[10px] px-1 py-0 h-4"
                        >
                          {k}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  {/* 요약 */}
                  <TableCell className="py-2 text-xs text-muted-foreground max-w-[190px]">
                    <span className="line-clamp-2">{item.summary_ko || '—'}</span>
                  </TableCell>
                  {/* 수집일 */}
                  <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(item.created_at), 'yy.MM.dd')}
                  </TableCell>
                  {/* 외부 링크 */}
                  <TableCell className="py-2">
                    {item.permalink ? (
                      <a
                        href={item.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="원본 보기"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
