import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';

interface Props {
  count: number;
}

const FewShotStatusSection = ({ count }: Props) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <Sparkles size={18} className="text-primary" />
        Few-shot 상태
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm">AI 프롬프트에 주입 중인 피드백 목록</p>
          <p className="text-xs text-muted-foreground mt-1">
            factory_scores.correction_reason 이 있는 항목이 AI 프롬프트에 Few-shot 예시로 포함되어 정확도를 높입니다.
          </p>
        </div>
        <Badge variant={count > 0 ? 'default' : 'outline'} className="text-sm px-3 py-1">
          {count > 0 ? `ON (${count}건)` : 'OFF'}
        </Badge>
      </div>
    </CardContent>
  </Card>
);

export default FewShotStatusSection;
