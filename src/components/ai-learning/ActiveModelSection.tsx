import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain } from 'lucide-react';

interface Props {
  activeModel: any;
  newSinceTraining: number;
}

const ActiveModelSection = ({ activeModel, newSinceTraining }: Props) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <Brain size={18} className="text-primary" />
        현재 적용 모델
      </CardTitle>
    </CardHeader>
    <CardContent>
      {activeModel ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">내부 버전</p>
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium text-sm">{activeModel.version}</span>
              <Badge variant="default" className="text-[10px] px-1.5 py-0">ACTIVE</Badge>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">기반 모델</p>
            <span className="font-medium text-sm">{activeModel.base_model}</span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">학습 건수</p>
            <span className="font-medium text-sm">{activeModel.training_count}건</span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">배포일</p>
            <span className="font-medium text-sm">
              {activeModel.deployed_at ? new Date(activeModel.deployed_at).toLocaleDateString('ko-KR') : '-'}
            </span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">마지막 학습 이후 신규</p>
            <span className="font-medium text-sm">{newSinceTraining}건</span>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground py-4 text-center">
          활성 모델이 없습니다. 기본 AI 모델이 사용됩니다.
        </div>
      )}
    </CardContent>
  </Card>
);

export default ActiveModelSection;
