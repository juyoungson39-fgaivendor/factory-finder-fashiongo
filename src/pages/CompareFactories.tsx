import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, X, ChevronDown } from 'lucide-react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import ScoreBadge from '@/components/ScoreBadge';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const COLORS = [
  'hsl(210, 80%, 55%)',
  'hsl(340, 75%, 55%)',
  'hsl(152, 55%, 42%)',
  'hsl(38, 92%, 50%)',
  'hsl(270, 60%, 55%)',
];

const CompareFactories = () => {
  const { user } = useAuth();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const { data: allFactories = [] } = useQuery({
    queryKey: ['factories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('factories').select('*').order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: criteria = [] } = useQuery({
    queryKey: ['scoring-criteria', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('scoring_criteria').select('*').order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: allScores = [] } = useQuery({
    queryKey: ['all-factory-scores', selectedIds],
    queryFn: async () => {
      if (selectedIds.length === 0) return [];
      const { data, error } = await supabase
        .from('factory_scores')
        .select('*')
        .in('factory_id', selectedIds);
      if (error) throw error;
      return data;
    },
    enabled: selectedIds.length > 0,
  });

  const selectedFactories = allFactories.filter((f) => selectedIds.includes(f.id));
  const availableFactories = allFactories.filter((f) => !selectedIds.includes(f.id));

  const addFactory = (id: string) => {
    if (selectedIds.length < 5 && !selectedIds.includes(id)) {
      setSelectedIds([...selectedIds, id]);
    }
    setPopoverOpen(false);
  };

  const removeFactory = (id: string) => {
    setSelectedIds(selectedIds.filter((fid) => fid !== id));
  };

  // Build radar data
  const radarData = criteria.map((c) => {
    const entry: any = {
      name: c.name.length > 6 ? c.name.slice(0, 6) + '…' : c.name,
      fullName: c.name,
      weight: c.weight,
      maxScore: c.max_score ?? 10,
    };
    selectedFactories.forEach((f, i) => {
      const score = allScores.find((s) => s.factory_id === f.id && s.criteria_id === c.id);
      const maxScore = c.max_score ?? 10;
      entry[`factory_${i}`] = maxScore > 0 ? (Number(score?.score ?? 0) / maxScore) * 100 : 0;
      entry[`raw_${i}`] = Number(score?.score ?? 0);
    });
    return entry;
  });

  // Build comparison table data
  const tableData = criteria.map((c) => {
    const row: any = { criteria: c, scores: [] };
    selectedFactories.forEach((f) => {
      const score = allScores.find((s) => s.factory_id === f.id && s.criteria_id === c.id);
      row.scores.push(Number(score?.score ?? 0));
    });
    return row;
  });

  const isHighWeight = (weight: number | null) => (weight ?? 1) >= 2;

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6 uppercase tracking-wider">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </Link>

      <h1 className="text-2xl font-bold tracking-tight mb-1">Compare Vendors</h1>
      <p className="text-sm text-muted-foreground mb-8">최대 5개 벤더를 선택하여 스코어를 비교하세요</p>

      {/* Selected vendors */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {selectedFactories.map((f, i) => (
          <div
            key={f.id}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border border-border bg-card"
          >
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i] }} />
            <ScoreBadge score={f.overall_score ?? 0} size="sm" />
            <span className="text-xs font-medium max-w-[140px] truncate">{f.name}</span>
            <button onClick={() => removeFactory(f.id)} className="text-muted-foreground hover:text-foreground ml-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {selectedIds.length < 5 && (
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5 rounded-full">
                <Plus className="w-3.5 h-3.5" />
                벤더 추가
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search vendors..." className="text-xs" />
                <CommandList>
                  <CommandEmpty className="text-xs py-4 text-center text-muted-foreground">No vendors found</CommandEmpty>
                  <CommandGroup>
                    {availableFactories.map((f) => (
                      <CommandItem key={f.id} onSelect={() => addFactory(f.id)} className="text-xs cursor-pointer">
                        <div className="flex items-center gap-2 w-full">
                          <ScoreBadge score={f.overall_score ?? 0} size="sm" />
                          <span className="truncate flex-1">{f.name}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {selectedFactories.length < 2 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <p className="text-muted-foreground text-sm mb-1">2개 이상의 벤더를 선택하세요</p>
            <p className="text-muted-foreground/60 text-xs">레이더 차트로 점수를 비교할 수 있습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Radar Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
                Score Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={420}>
                <RadarChart data={radarData} outerRadius="70%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis
                    dataKey="name"
                    tick={({ x, y, payload, index }: any) => {
                      const item = radarData[index];
                      const high = isHighWeight(item?.weight);
                      return (
                        <text
                          x={x} y={y}
                          textAnchor={x > 300 ? 'start' : x < 200 ? 'end' : 'middle'}
                          dominantBaseline="central"
                          className={high ? 'font-semibold' : ''}
                          style={{
                            fontSize: high ? 12 : 11,
                            fill: high ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                          }}
                        >
                          {high ? '★ ' : ''}{payload.value}
                        </text>
                      );
                    }}
                  />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickCount={5} />
                  {selectedFactories.map((f, i) => (
                    <Radar
                      key={f.id}
                      name={f.name}
                      dataKey={`factory_${i}`}
                      stroke={COLORS[i]}
                      fill={COLORS[i]}
                      fillOpacity={0.08}
                      strokeWidth={2}
                    />
                  ))}
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 16 }}
                    formatter={(value: string) => <span className="text-xs">{value}</span>}
                  />
                  <Tooltip
                    content={({ payload, label }) => {
                      if (!payload?.length) return null;
                      const item = payload[0]?.payload;
                      return (
                        <div className="bg-popover border border-border rounded-md px-3 py-2.5 shadow-md min-w-[160px]">
                          <p className="text-xs font-semibold mb-1.5">{item.fullName}</p>
                          {payload.map((p: any, i: number) => (
                            <div key={i} className="flex items-center justify-between gap-4 text-xs">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.stroke }} />
                                <span className="text-muted-foreground truncate max-w-[100px]">{p.name}</span>
                              </span>
                              <span className="font-medium tabular-nums">
                                {item[`raw_${i}`]} / {item.maxScore}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Comparison Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
                Detail Comparison
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Table Header */}
              <div
                className="grid gap-4 px-5 py-3 border-b border-border text-[11px] uppercase tracking-widest text-muted-foreground font-medium"
                style={{ gridTemplateColumns: `minmax(160px, 1fr) repeat(${selectedFactories.length}, minmax(80px, 1fr))` }}
              >
                <span>기준</span>
                {selectedFactories.map((f, i) => (
                  <span key={f.id} className="text-center flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                    <span className="truncate">{f.name.length > 12 ? f.name.slice(0, 12) + '…' : f.name}</span>
                  </span>
                ))}
              </div>

              {/* Table Rows */}
              {tableData.map((row, idx) => {
                const maxVal = Math.max(...row.scores);
                const high = isHighWeight(row.criteria.weight);
                return (
                  <div
                    key={row.criteria.id}
                    className={`grid gap-4 px-5 py-3 items-center transition-colors ${
                      idx < tableData.length - 1 ? 'border-b border-border' : ''
                    } ${high ? 'bg-[hsl(var(--primary))]/[0.02]' : ''}`}
                    style={{ gridTemplateColumns: `minmax(160px, 1fr) repeat(${selectedFactories.length}, minmax(80px, 1fr))` }}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        {high && <span className="text-[hsl(var(--score-excellent))] text-xs">★</span>}
                        <span className={`text-xs ${high ? 'font-semibold' : 'font-medium'}`}>
                          {row.criteria.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">×{row.criteria.weight}</span>
                      </div>
                      {row.criteria.description && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{row.criteria.description}</p>
                      )}
                    </div>
                    {row.scores.map((score: number, i: number) => {
                      const isMax = score === maxVal && maxVal > 0 && row.scores.filter((s: number) => s === maxVal).length === 1;
                      const pct = (row.criteria.max_score ?? 10) > 0 ? (score / (row.criteria.max_score ?? 10)) * 100 : 0;
                      return (
                        <div key={i} className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={`text-sm tabular-nums ${isMax ? 'font-bold text-[hsl(var(--score-excellent))]' : 'font-medium'}`}>
                              {score}
                            </span>
                            <span className="text-[10px] text-muted-foreground">/ {row.criteria.max_score ?? 10}</span>
                          </div>
                          {/* Mini bar */}
                          <div className="w-full h-1.5 bg-secondary rounded-full mt-1.5 mx-auto max-w-[80px]">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: COLORS[i],
                                opacity: isMax ? 1 : 0.5,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Total Row */}
              <div
                className="grid gap-4 px-5 py-4 items-center bg-secondary/50 border-t-2 border-border"
                style={{ gridTemplateColumns: `minmax(160px, 1fr) repeat(${selectedFactories.length}, minmax(80px, 1fr))` }}
              >
                <span className="text-xs font-bold uppercase tracking-widest">Overall Score</span>
                {selectedFactories.map((f, i) => {
                  const score = f.overall_score ?? 0;
                  const isMax = selectedFactories.every((of) => (of.overall_score ?? 0) <= score) &&
                    selectedFactories.filter((of) => (of.overall_score ?? 0) === score).length === 1;
                  return (
                    <div key={f.id} className="flex justify-center">
                      <div className="flex items-center gap-2">
                        {isMax && <span className="text-[9px] uppercase tracking-widest font-bold text-[hsl(var(--score-excellent))]">Best</span>}
                        <ScoreBadge score={score} size="md" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CompareFactories;
