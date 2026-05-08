import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface Props {
  data?: any;
}

function JsonNode({ value, label, depth = 0 }: { value: any; label: string; depth?: number }) {
  const [open, setOpen] = useState(depth < 1);
  const isObj = value !== null && typeof value === 'object';
  const isArr = Array.isArray(value);

  if (!isObj) {
    return (
      <div className="flex gap-2 py-0.5 text-[11px] font-mono">
        <span className="text-muted-foreground">{label}:</span>
        <span className={typeof value === 'string' ? 'text-emerald-700' : 'text-blue-700'}>
          {value === null ? 'null' : typeof value === 'string' ? `"${value}"` : String(value)}
        </span>
      </div>
    );
  }

  const entries = isArr
    ? value.map((v: any, i: number) => [String(i), v] as [string, any])
    : Object.entries(value);

  return (
    <div className="text-[11px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 hover:bg-muted/40 rounded px-1 py-0.5 font-mono"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/60">
          {isArr ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </button>
      {open && (
        <div className="ml-4 border-l border-border/50 pl-2">
          {entries.map(([k, v]) => (
            <JsonNode key={k} label={k} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function RawDataCard({ data }: Props) {
  const [showJson, setShowJson] = useState(false);

  if (!data) {
    return (
      <Card className="rounded-xl">
        <CardContent className="py-12 text-center text-xs text-muted-foreground">
          verified_report_data 가 없습니다. 재크롤 후 다시 확인하세요.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          🗂 Raw 데이터 (verified_report_data)
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setShowJson((v) => !v)}>
          {showJson ? '트리 보기' : 'JSON 보기'}
        </Button>
      </CardHeader>
      <CardContent>
        {showJson ? (
          <pre className="text-[11px] bg-muted/40 border rounded-lg p-3 overflow-x-auto max-h-[600px]">
{JSON.stringify(data, null, 2)}
          </pre>
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <JsonNode value={data} label="verified_report_data" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
