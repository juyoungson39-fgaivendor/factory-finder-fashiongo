import { useTrend } from '@/contexts/TrendContext';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ScoringSettingsTab = () => {
  const { weights, setWeights, channelWeights, setChannelWeights, threshold, setThreshold, hideBelow, setHideBelow, scoredProducts } = useTrend();

  const updateWeight = (key: keyof typeof weights, val: number) => {
    const others = Object.entries(weights).filter(([k]) => k !== key);
    const remaining = 100 - val;
    const otherTotal = others.reduce((s, [, v]) => s + v, 0);
    const newWeights = { ...weights, [key]: val };
    if (otherTotal > 0) {
      others.forEach(([k, v]) => {
        (newWeights as any)[k] = Math.round((v / otherTotal) * remaining);
      });
    }
    // Fix rounding
    const sum = Object.values(newWeights).reduce((s, v) => s + v, 0);
    if (sum !== 100) {
      const firstOther = others[0][0];
      (newWeights as any)[firstOther] += 100 - sum;
    }
    setWeights(newWeights);
  };

  const updateChannelWeight = (key: string, field: 'enabled' | 'weight', value: boolean | number) => {
    setChannelWeights({ ...channelWeights, [key]: { ...channelWeights[key as keyof typeof channelWeights], [field]: value } });
  };

  const weightLabels: Record<string, string> = {
    trend_match: '트렌드 매치',
    profitability: '수익성',
    reliability: '신뢰도',
    season_fit: '시즌 적합도',
  };

  const channelLabels: Record<string, string> = {
    google: 'Google Trends',
    tiktok: 'TikTok Social Buzz',
    amazon: 'Amazon Sales Rank',
    shein: 'SHEIN / Pinterest',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Weight Sliders */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">추천 가중치 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {Object.entries(weights).map(([key, val]) => (
            <div key={key}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-medium text-[#202223]">{weightLabels[key]}</span>
                <span className="font-bold text-[#4f46e5]">{val}%</span>
              </div>
              <Slider value={[val]} onValueChange={v => updateWeight(key as keyof typeof weights, v[0])} min={0} max={80} step={5} />
            </div>
          ))}
          <div className="text-xs text-[#6d7175] text-right">합계: {Object.values(weights).reduce((s, v) => s + v, 0)}%</div>
        </CardContent>
      </Card>

      {/* Threshold Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">추천 임계값</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="font-medium text-[#202223]">최소 추천 점수</span>
              <span className="font-bold" style={{ color: threshold >= 80 ? '#16a34a' : threshold >= 70 ? '#d97706' : '#dc2626' }}>{threshold}</span>
            </div>
            <Slider value={[threshold]} onValueChange={v => setThreshold(v[0])} min={0} max={100} step={5} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#202223]">임계값 미만 상품 숨기기</span>
            <Switch checked={hideBelow} onCheckedChange={setHideBelow} />
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-[#6d7175]">
            현재 기준 추천 상품: <strong className="text-[#202223]">{scoredProducts.filter(p => p.computed_score >= threshold).length}개</strong> / 전체 {scoredProducts.length}개
          </div>
        </CardContent>
      </Card>

      {/* Channel Weights */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">데이터 채널 가중치</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(channelWeights).map(([key, val]) => (
              <div key={key} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <Checkbox checked={val.enabled} onCheckedChange={v => updateChannelWeight(key, 'enabled', !!v)} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-[#202223]">{channelLabels[key]}</div>
                  <div className="mt-1">
                    <Slider value={[val.weight]} onValueChange={v => updateChannelWeight(key, 'weight', v[0])} min={0} max={60} step={5} disabled={!val.enabled} />
                  </div>
                </div>
                <span className="text-sm font-bold text-[#4f46e5] w-10 text-right">{val.weight}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Live Preview */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">실시간 순위 미리보기</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {scoredProducts.slice(0, 5).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50">
                <span className="w-6 text-center font-bold text-[#6d7175]">{i + 1}</span>
                <span className="flex-1 text-sm font-medium text-[#202223]">{p.name_ko}</span>
                <span className="text-xs text-[#6d7175]">{p.keyword}</span>
                <span className="font-bold text-sm" style={{ color: p.computed_score >= 80 ? '#16a34a' : p.computed_score >= 70 ? '#d97706' : '#dc2626' }}>
                  {p.computed_score}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScoringSettingsTab;
