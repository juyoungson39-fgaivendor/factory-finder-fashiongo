import { useNavigate } from 'react-router-dom';

const VENDORS = [
  { id: 'basic', name: 'Sassy Look', color: '#1A1A1A', newStyles: 18, active: 124, sales: 28400 },
  { id: 'denim', name: 'styleu', color: '#1E3A5F', newStyles: 6, active: 42, sales: 12800 },
  { id: 'vacation', name: 'Young Aloud', color: '#F59E0B', newStyles: 12, active: 67, sales: 18200 },
  { id: 'festival', name: 'Lenovia USA', color: '#7C3AED', newStyles: 4, active: 31, sales: 8600 },
  { id: 'trend', name: 'G1K', color: '#EC4899', newStyles: 9, active: 53, sales: 15400 },
  { id: 'curve', name: 'BiBi', color: '#D60000', newStyles: 7, active: 38, sales: 9200 },
];

const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`;

/** Compact vendor KPI bar for the global header */
export const VendorKPIBar = () => {
  const totalNew = VENDORS.reduce((s, v) => s + v.newStyles, 0);
  const totalActive = VENDORS.reduce((s, v) => s + v.active, 0);
  const totalSales = VENDORS.reduce((s, v) => s + v.sales, 0);

  const navigate = useNavigate();

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
        {VENDORS.map((v) => (
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
