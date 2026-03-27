import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Trophy, Search, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const VENDORS = [
  { key: 'sassy_look', name: 'Sassy Look', color: '#1A1A1A' },
  { key: 'styleu', name: 'styleu', color: '#1E3A5F' },
  { key: 'young_aloud', name: 'Young Aloud', color: '#F59E0B' },
  { key: 'lenovia', name: 'Lenovia USA', color: '#7C3AED' },
  { key: 'g1k', name: 'G1K', color: '#EC4899' },
  { key: 'bibi', name: 'BiBi', color: '#D60000' },
];

interface FactoryRankRow {
  id: string;
  factoryNo: string;
  name: string;
  sourcingConfirmed: number;
  vendorProducts: Record<string, number>;
  vendorSales: Record<string, number>;
  totalProducts: number;
  totalSales: number;
  notes: string;
}

const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`;

type SortKey = 'rank' | 'sourcingConfirmed' | 'totalProducts' | 'totalSales';

const FactoryRanking = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<FactoryRankRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>('totalSales');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        // Fetch factories
        const { data: factories } = await supabase
          .from('factories')
          .select('id, name')
          .is('deleted_at', null);

        if (!factories || factories.length === 0) { setRows([]); setLoading(false); return; }

        // Fetch sourcing confirmed products per factory
        const { data: sourceableProducts } = await supabase
          .from('sourceable_products')
          .select('factory_id, status');

        // Fetch FG registered products per vendor per factory (via source_id linking)
        const { data: fgProducts } = await supabase
          .from('fg_registered_products')
          .select('vendor_key, source_id, unit_price, status');

        // Fetch sourceable_products to map source_id -> factory_id
        const sourceToFactory: Record<string, string> = {};
        (sourceableProducts || []).forEach(sp => {
          if (sp.factory_id) sourceToFactory[sp.factory_id] = sp.factory_id;
        });

        // Build rows
        const rankRows: FactoryRankRow[] = factories.map((f, idx) => {
          const confirmed = (sourceableProducts || []).filter(
            sp => sp.factory_id === f.id && sp.status === 'confirmed'
          ).length;

          const vendorProducts: Record<string, number> = {};
          const vendorSales: Record<string, number> = {};
          VENDORS.forEach(v => { vendorProducts[v.key] = 0; vendorSales[v.key] = 0; });

          // Count FG products linked to sourceable_products of this factory
          const factorySourceIds = (sourceableProducts || [])
            .filter(sp => sp.factory_id === f.id)
            .map(sp => sp.factory_id); // use factory_id as grouping

          (fgProducts || []).forEach(fp => {
            // Match by source_id to sourceable_products with this factory
            const matchedSp = (sourceableProducts || []).find(
              sp => sp.factory_id === f.id
            );
            if (matchedSp) {
              const vk = fp.vendor_key?.toLowerCase().replace(/\s+/g, '_') || 'other';
              const matchedVendor = VENDORS.find(v => v.key === vk || fp.vendor_key?.toLowerCase().includes(v.name.toLowerCase()));
              const key = matchedVendor?.key || vk;
              vendorProducts[key] = (vendorProducts[key] || 0) + 1;
              vendorSales[key] = (vendorSales[key] || 0) + (fp.unit_price || 0);
            }
          });

          const totalProducts = Object.values(vendorProducts).reduce((a, b) => a + b, 0);
          const totalSales = Object.values(vendorSales).reduce((a, b) => a + b, 0);

          return {
            id: f.id,
            factoryNo: `F-${String(idx + 1).padStart(3, '0')}`,
            name: f.name,
            sourcingConfirmed: confirmed,
            vendorProducts,
            vendorSales,
            totalProducts,
            totalSales,
            notes: '',
          };
        });

        setRows(rankRows);
      } catch (e) {
        console.error('Failed to load ranking data', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const filtered = rows
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.factoryNo.includes(search))
    .sort((a, b) => {
      const val = (r: FactoryRankRow) => {
        if (sortKey === 'sourcingConfirmed') return r.sourcingConfirmed;
        if (sortKey === 'totalProducts') return r.totalProducts;
        if (sortKey === 'totalSales') return r.totalSales;
        return 0;
      };
      return sortAsc ? val(a) - val(b) : val(b) - val(a);
    });

  const SortButton = ({ label, sk }: { label: string; sk: SortKey }) => (
    <Button variant="ghost" size="sm" className="h-auto p-0 font-medium text-muted-foreground hover:text-foreground" onClick={() => handleSort(sk)}>
      {label} <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">공장 순위</h2>
          <Badge variant="secondary" className="text-xs">{filtered.length}개</Badge>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="공장 검색..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead className="w-24">공장번호</TableHead>
                  <TableHead>공장이름</TableHead>
                  <TableHead className="text-center">
                    <SortButton label="소싱 확정" sk="sourcingConfirmed" />
                  </TableHead>
                  {VENDORS.map(v => (
                    <TableHead key={v.key} className="text-center min-w-[100px]">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded" style={{ backgroundColor: v.color }}>
                          {v.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">상품/매출</span>
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="text-center">
                    <SortButton label="총 상품" sk="totalProducts" />
                  </TableHead>
                  <TableHead className="text-center">
                    <SortButton label="총 매출" sk="totalSales" />
                  </TableHead>
                  <TableHead>기타</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5 + VENDORS.length + 3} className="text-center py-10 text-muted-foreground">
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5 + VENDORS.length + 3} className="text-center py-10 text-muted-foreground">
                      데이터가 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row, idx) => (
                    <TableRow key={row.id} className={idx < 3 ? 'bg-primary/5' : ''}>
                      <TableCell className="text-center font-bold">
                        {idx < 3 ? (
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white ${idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : 'bg-amber-700'}`}>
                            {idx + 1}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{idx + 1}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.factoryNo}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={row.sourcingConfirmed > 0 ? "default" : "secondary"} className="text-xs">
                          {row.sourcingConfirmed}
                        </Badge>
                      </TableCell>
                      {VENDORS.map(v => (
                        <TableCell key={v.key} className="text-center text-xs">
                          <div className="flex flex-col items-center">
                            <span className="font-semibold">{row.vendorProducts[v.key] || 0}</span>
                            <span className="text-muted-foreground">{fmt(row.vendorSales[v.key] || 0)}</span>
                          </div>
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-semibold">{row.totalProducts}</TableCell>
                      <TableCell className="text-center font-semibold text-primary">{fmt(row.totalSales)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.notes || '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FactoryRanking;
