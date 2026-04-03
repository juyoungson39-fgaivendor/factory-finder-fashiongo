import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, ArrowUpDown, Loader2, Sparkles, TrendingUp, DollarSign, Package } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, subDays, isAfter, isBefore, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useProducts } from '@/integrations/va-api/hooks/use-products';
import { getVendorById } from '@/integrations/va-api/vendor-config';
import type { FGProductListItem } from '@/integrations/va-api/types';

// Mock sales data generator (deterministic per productId)
function getMockSales(productId: number): { salesQty: number; revenue: number } {
  const seed = productId % 997;
  const salesQty = 10 + (seed * 7) % 490;
  const revenue = salesQty * (8 + (seed * 3) % 42);
  return { salesQty, revenue };
}

type SortKey = 'activatedOn' | 'unitPrice' | 'salesQty' | 'revenue';
type SortDir = 'asc' | 'desc';

const AIVendorProducts = () => {
  const { id } = useParams<{ id: string }>();
  const vendor = getVendorById(id || '');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortKey, setSortKey] = useState<SortKey>('activatedOn');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());

  const { data, isLoading } = useProducts({
    wholesalerId: vendor?.wholesalerId ?? 0,
    page,
    size: pageSize,
  });

  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;

  // Filter by date range + sort
  const processedItems = useMemo(() => {
    let filtered = items.filter((item) => {
      const pushDate = item.activatedOn || item.createdOn;
      if (!pushDate) return true;
      const d = startOfDay(new Date(pushDate));
      if (dateFrom && isBefore(d, startOfDay(dateFrom))) return false;
      if (dateTo && isAfter(d, startOfDay(dateTo))) return false;
      return true;
    });

    filtered.sort((a, b) => {
      let va: number, vb: number;
      if (sortKey === 'activatedOn') {
        va = new Date(a.activatedOn || a.createdOn).getTime();
        vb = new Date(b.activatedOn || b.createdOn).getTime();
      } else if (sortKey === 'unitPrice') {
        va = a.unitPrice;
        vb = b.unitPrice;
      } else if (sortKey === 'salesQty') {
        va = getMockSales(a.productId).salesQty;
        vb = getMockSales(b.productId).salesQty;
      } else {
        va = getMockSales(a.productId).revenue;
        vb = getMockSales(b.productId).revenue;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    return filtered;
  }, [items, dateFrom, dateTo, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  // Summary stats
  const totalSales = processedItems.reduce((s, i) => s + getMockSales(i.productId).salesQty, 0);
  const totalRevenue = processedItems.reduce((s, i) => s + getMockSales(i.productId).revenue, 0);

  if (!vendor) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        벤더를 찾을 수 없습니다.
        <Link to="/ai-vendors" className="block mt-4 text-primary underline">돌아가기</Link>
      </div>
    );
  }

  const SortIcon = ({ field }: { field: SortKey }) => (
    <ArrowUpDown className={cn('w-3 h-3 ml-1 inline', sortKey === field ? 'text-foreground' : 'text-muted-foreground/50')} />
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-3">
        <Link to="/ai-vendors" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> 벤더 목록
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-3 h-8 rounded" style={{ backgroundColor: vendor.color }} />
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h1 className="text-xl font-bold text-foreground">{vendor.name}</h1>
            </div>
            <p className="text-xs text-muted-foreground">{vendor.categories} · 판매 상품 리스트</p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">총 상품수</p>
              <p className="text-2xl font-bold">{totalCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-emerald-500" />
            <div>
              <p className="text-xs text-muted-foreground">총 판매량</p>
              <p className="text-2xl font-bold">{totalSales.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">총 매출액</p>
              <p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">기간 필터:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs">
                  {dateFrom ? format(dateFrom, 'yyyy-MM-dd') : '시작일'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground">~</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs">
                  {dateTo ? format(dateTo, 'yyyy-MM-dd') : '종료일'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>

            {/* Quick filters */}
            <div className="flex gap-1 ml-2">
              {[7, 14, 30, 90].map((d) => (
                <Button key={d} variant="ghost" size="sm" className="text-xs h-7 px-2"
                  onClick={() => { setDateFrom(subDays(new Date(), d)); setDateTo(new Date()); }}>
                  {d}일
                </Button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">표시:</span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-[80px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10개</SelectItem>
                  <SelectItem value="50">50개</SelectItem>
                  <SelectItem value="100">100개</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead className="w-16">이미지</TableHead>
                <TableHead>상품명</TableHead>
                <TableHead className="w-24">Style No</TableHead>
                <TableHead className="w-28 cursor-pointer select-none" onClick={() => toggleSort('activatedOn')}>
                  푸쉬 날짜 <SortIcon field="activatedOn" />
                </TableHead>
                <TableHead className="w-24 cursor-pointer select-none text-right" onClick={() => toggleSort('unitPrice')}>
                  가격 <SortIcon field="unitPrice" />
                </TableHead>
                <TableHead className="w-24 cursor-pointer select-none text-right" onClick={() => toggleSort('salesQty')}>
                  판매량 <SortIcon field="salesQty" />
                </TableHead>
                <TableHead className="w-28 cursor-pointer select-none text-right" onClick={() => toggleSort('revenue')}>
                  매출액 <SortIcon field="revenue" />
                </TableHead>
                <TableHead className="w-16 text-center">상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-40 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : processedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-40 text-center text-muted-foreground">
                    해당 기간에 상품이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                processedItems.map((item, idx) => {
                  const sales = getMockSales(item.productId);
                  const pushDate = item.activatedOn || item.createdOn;
                  return (
                    <TableRow key={item.productId}>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {(page - 1) * pageSize + idx + 1}
                      </TableCell>
                      <TableCell>
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.itemName} className="w-12 h-12 object-cover rounded" />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center text-[10px] text-muted-foreground">N/A</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium truncate max-w-[200px]">{item.itemName}</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.styleNo}</TableCell>
                      <TableCell className="text-xs">
                        {pushDate ? format(new Date(pushDate), 'yyyy-MM-dd') : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm">
                        ${item.unitPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {sales.salesQty.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm text-emerald-600">
                        ${sales.revenue.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={item.isActive ? 'default' : 'secondary'} className="text-[10px]">
                          {item.isActive ? '판매중' : '비활성'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              총 {totalCount}개 중 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalCount)}
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                이전
              </Button>
              <span className="flex items-center px-2 text-xs text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                다음
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AIVendorProducts;
