import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useResolvedVendors } from '@/integrations/va-api/use-resolved-vendors';

const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`;

// Mock KPI numbers (deterministic per vendor.id) for demo display.
function mockKpi(id: string) {
  const seed = id.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return {
    newStyles: 5 + (seed % 20),
    active: 40 + (seed % 100),
    sales: 5000 + (seed % 30) * 1000,
  };
}

/** Compact vendor KPI bar for the global header */
export const VendorKPIBar = () => {
  const navigate = useNavigate();
  const { active } = useResolvedVendors();
  const vendors = useMemo(
    () => active.map((v) => ({ id: v.id, name: v.name, color: v.color, ...mockKpi(v.id) })),
    [active],
  );

  const totalNew = vendors.reduce((s, v) => s + v.newStyles, 0);
  const totalActive = vendors.reduce((s, v) => s + v.active, 0);
  const totalSales = vendors.reduce((s, v) => s + v.sales, 0);

  return (
    <div className="flex items-center gap-3 w-full overflow-x-auto">
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">3월</span>
        <span className="text-[11px] font-bold text-foreground">+{totalNew}</span>
        <span className="text-[10px] text-muted-foreground">/</span>
        <span className="text-[11px] font-medium text-foreground">{totalActive}</span>
        <span className="text-[10px] text-muted-foreground">스타일</span>
        <span className="text-[10px] text-muted-foreground mx-0.5">·</span>
        <span className="text-[11px] font-bold text-foreground">{fmt(totalSales)}</span>
      </div>

      <div className="h-4 w-px bg-border shrink-0" />

      <div className="flex items-center gap-2 flex-1 overflow-x-auto">
        {vendors.map((v) => (
          <div
            key={v.name}
            className="flex items-center gap-1.5 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate(`/ai-vendors/${v.id}/products`)}
          >
            <span
              className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded"
              style={{ backgroundColor: v.color }}
            >
              {v.name}
            </span>
            <span className="text-[10px] font-semibold text-foreground">+{v.newStyles}</span>
            <span className="text-[10px] text-muted-foreground">/{v.active}</span>
            <span className="text-[10px] font-medium text-muted-foreground hidden xl:inline">{fmt(v.sales)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VendorKPIBar;
