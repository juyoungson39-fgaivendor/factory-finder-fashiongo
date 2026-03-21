import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Info } from 'lucide-react';

export interface ModelSettings {
  gender: string;
  ethnicity: string;
  bodyType: string;
  pose: string;
  modelImageUrl: string;
}

const DEFAULTS: ModelSettings = {
  gender: '여성',
  ethnicity: 'Asian',
  bodyType: 'Regular',
  pose: 'Standing Front',
  modelImageUrl: '',
};

const IMAGE_MAP: Record<string, string> = {
  '여성-Asian-Slim': 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=300&fit=crop',
  '여성-Asian-Regular': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=300&fit=crop',
  '여성-Black-Plus Size': 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&h=300&fit=crop',
  '여성-Caucasian-Slim': 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=200&h=300&fit=crop',
  '여성-Latina-Regular': 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=200&h=300&fit=crop',
  '여성-Middle Eastern-Regular': 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&h=300&fit=crop',
  '남성-Asian-Regular': 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=300&fit=crop',
  '남성-Caucasian-Regular': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=300&fit=crop',
  '남성-Black-Regular': 'https://images.unsplash.com/photo-1531384441138-2736e62e0919?w=200&h=300&fit=crop',
};

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=300&fit=crop';

function getModelImage(gender: string, ethnicity: string, bodyType: string) {
  return IMAGE_MAP[`${gender}-${ethnicity}-${bodyType}`] || FALLBACK_IMAGE;
}

export function getVendorModelSettings(vendorId: string): ModelSettings {
  try {
    const raw = localStorage.getItem(`fg_vendor_model_${vendorId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  const url = getModelImage(DEFAULTS.gender, DEFAULTS.ethnicity, DEFAULTS.bodyType);
  return { ...DEFAULTS, modelImageUrl: url };
}

const GENDERS = ['여성', '남성'];
const ETHNICITIES = ['Asian', 'Black', 'Caucasian', 'Latina', 'Middle Eastern'];
const BODY_TYPES = ['Slim', 'Regular', 'Curvy', 'Plus Size'];
const POSES = ['Standing Front', 'Standing Side', 'Casual Pose'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  vendorName: string;
  onSaved?: () => void;
}

const OptionGroup = ({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) => (
  <div className="space-y-2">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <Button
          key={opt}
          type="button"
          size="sm"
          variant={value === opt ? 'destructive' : 'outline'}
          className="text-xs h-8 px-3"
          onClick={() => onChange(opt)}
        >
          {opt}
        </Button>
      ))}
    </div>
  </div>
);

const VendorModelSettingsDialog = ({ open, onOpenChange, vendorId, vendorName, onSaved }: Props) => {
  const { toast } = useToast();
  const [gender, setGender] = useState(DEFAULTS.gender);
  const [ethnicity, setEthnicity] = useState(DEFAULTS.ethnicity);
  const [bodyType, setBodyType] = useState(DEFAULTS.bodyType);
  const [pose, setPose] = useState(DEFAULTS.pose);
  const [initialState, setInitialState] = useState('');

  useEffect(() => {
    if (!open) return;
    const saved = getVendorModelSettings(vendorId);
    setGender(saved.gender);
    setEthnicity(saved.ethnicity);
    setBodyType(saved.bodyType);
    setPose(saved.pose);
    setInitialState(JSON.stringify(saved));
  }, [open, vendorId]);

  const imageUrl = useMemo(() => getModelImage(gender, ethnicity, bodyType), [gender, ethnicity, bodyType]);
  const currentState = JSON.stringify({ gender, ethnicity, bodyType, pose });
  const hasChanged = currentState !== initialState;

  const handleSave = () => {
    const settings: ModelSettings = { gender, ethnicity, bodyType, pose, modelImageUrl: imageUrl };
    localStorage.setItem(`fg_vendor_model_${vendorId}`, JSON.stringify(settings));
    toast({ title: `${vendorName} 모델 설정이 저장되었습니다` });
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>{vendorName} — AI 모델 설정</DialogTitle>
          <DialogDescription>이 벤더의 상품에 적용될 고정 AI 모델을 설정합니다</DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* Preview */}
          <div className="space-y-3">
            <p className="text-sm font-bold">현재 모델 미리보기</p>
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-[200px] h-[300px] rounded-lg overflow-hidden border border-border">
                <img
                  src={imageUrl}
                  alt="Model preview"
                  className="w-full h-full object-cover transition-all duration-300"
                />
                {hasChanged && (
                  <Badge className="absolute top-2 right-2 text-[10px] bg-destructive text-destructive-foreground border-0">
                    변경됨
                  </Badge>
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap justify-center">
                <Badge variant="secondary" className="text-[10px]">{gender}</Badge>
                <Badge variant="secondary" className="text-[10px]">{ethnicity}</Badge>
                <Badge variant="secondary" className="text-[10px]">{bodyType}</Badge>
                <Badge variant="secondary" className="text-[10px]">{pose}</Badge>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-4">
            <p className="text-sm font-bold">모델 옵션 설정</p>
            <OptionGroup label="성별" options={GENDERS} value={gender} onChange={setGender} />
            <OptionGroup label="인종" options={ETHNICITIES} value={ethnicity} onChange={setEthnicity} />
            <OptionGroup label="체형" options={BODY_TYPES} value={bodyType} onChange={setBodyType} />
            <OptionGroup label="포즈" options={POSES} value={pose} onChange={setPose} />
          </div>

          {/* Info */}
          <div className="rounded-lg bg-muted p-3 flex gap-2 text-xs text-muted-foreground">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p>모델 설정을 변경하면 이후 생성되는 모든 AI 착용샷에 적용됩니다.</p>
              <p>기존에 생성된 이미지는 변경되지 않습니다.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button variant="destructive" onClick={handleSave}>설정 저장</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VendorModelSettingsDialog;
