import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';

interface FactoryRow {
  id: string;
  name: string;
  name_en: string | null;
  stock_score: number | null;
  oem_score: number | null;
  ai_scored_at: string | null;
  scored_at: string | null;
  fg_category: string | null;
  main_products: string[] | null;
  capabilities: string[] | null;
  country: string | null;
  city: string | null;
}

function formatMDY(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

export default function TopStockFactories() {
  const [params] = useSearchParams();
  const threshold = Number(params.get('min') ?? 60);

  const { data: factories = [], isLoading } = useQuery({
    queryKey: ['top-stock-factories', threshold],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('factories')
        .select('id, name, name_en, stock_score, oem_score, ai_scored_at, scored_at, fg_category, main_products, capabilities, country, city')
        .gte('stock_score', threshold)
        .is('deleted_at', null)
        .order('stock_score', { ascending: false });
      if (error) throw error;
      return (data ?? []) as FactoryRow[];
    },
  });

  const avg = factories.length
    ? factories.reduce((a, b) => a + Number(b.stock_score ?? 0), 0) / factories.length
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="w-3 h-3" /> 대시보드로
          </Link>
          <h1 className="text-xl font-bold text-foreground">TOP 공장 (stock_score ≥ {threshold})</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            총 {factories.length}개 · 평균 {avg.toFixed(1)}점
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2 w-12">#</th>
              <th className="text-left font-medium px-4 py-2">공장명</th>
              <th className="text-right font-medium px-4 py-2 w-28">Stock Score</th>
              <th className="text-right font-medium px-4 py-2 w-28">OEM Score</th>
              <th className="text-left font-medium px-4 py-2">태그</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">로딩 중...</td></tr>
            ) : factories.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">조건에 맞는 공장이 없습니다.</td></tr>
            ) : factories.map((f, i) => {
              const tags = [
                f.fg_category,
                ...(f.main_products ?? []).slice(0, 3),
                ...(f.capabilities ?? []).slice(0, 2),
              ].filter(Boolean) as string[];
              return (
                <tr key={f.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <Link to={`/factories/${f.id}`} className="text-foreground hover:text-primary font-medium">
                      {f.name}
                    </Link>
                    {(f.country || f.city) && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {[f.country, f.city].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground cursor-help"
                    title={`stock_score\n마지막 스코어링: ${formatMDY(f.ai_scored_at ?? f.scored_at)}`}
                  >
                    {Number(f.stock_score ?? 0).toFixed(1)}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right tabular-nums text-muted-foreground cursor-help"
                    title={`OEM_score\n마지막 스코어링: ${formatMDY(f.ai_scored_at ?? f.scored_at)}`}
                  >
                    {Number(f.oem_score ?? 0).toFixed(1)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {tags.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      ) : tags.slice(0, 6).map((t, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[10px] font-normal">{t}</Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
