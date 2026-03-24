import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Info, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { uploadBase64Image } from '@/lib/imageStorage';

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

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=300&fit=crop';

export function getVendorModelSettings(vendorId: string): ModelSettings {
  try {
    const raw = localStorage.getItem(`fg_vendor_model_${vendorId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { ...DEFAULTS, modelImageUrl: FALLBACK_IMAGE };
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
  disabled,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
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
          disabled={disabled}
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
  const [imageUrl, setImageUrl] = useState(FALLBACK_IMAGE);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!open) return;
    const saved = getVendorModelSettings(vendorId);
    setGender(saved.gender);
    setEthnicity(saved.ethnicity);
    setBodyType(saved.bodyType);
    setPose(saved.pose);
    setImageUrl(saved.modelImageUrl || FALLBACK_IMAGE);
    setInitialState(JSON.stringify(saved));
  }, [open, vendorId]);

  const currentState = JSON.stringify({ gender, ethnicity, bodyType, pose });
  const hasChanged = currentState !== initialState;

  const generateModelImage = useCallback(async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-vendor-model', {
        body: { gender, ethnicity, bodyType, pose, vendorName },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.imageUrl) throw new Error('이미지 생성 실패');

      // Upload to storage to avoid localStorage quota issues
      const publicUrl = await uploadBase64Image(data.imageUrl, `vendor-models/${vendorId}`, `model`);
      setImageUrl(publicUrl);

      // Auto-save settings immediately after generation
      const settings: ModelSettings = { gender, ethnicity, bodyType, pose, modelImageUrl: publicUrl };
      localStorage.setItem(`fg_vendor_model_${vendorId}`, JSON.stringify(settings));

      toast({ title: 'AI 모델 이미지가 생성 및 저장되었습니다' });
    } catch (err: any) {
      console.error('Model image generation failed:', err);
      toast({ title: '모델 이미지 생성 실패', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }, [gender, ethnicity, bodyType, pose, vendorName, vendorId, toast]);

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
          <DialogDescription>이 벤더의 상품에 적용될 AI 모델을 설정하고 생성합니다</DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">현재 모델 미리보기</p>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={generateModelImage}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {generating ? 'AI 생성 중...' : 'AI 모델 생성'}
              </Button>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-[200px] h-[300px] rounded-lg overflow-hidden border border-border">
                {generating && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                    <p className="text-xs text-muted-foreground">AI 모델 생성 중...</p>
                    <p className="text-[10px] text-muted-foreground">약 10~30초 소요</p>
                  </div>
                )}
                <img
                  src={imageUrl}
                  alt="Model preview"
                  className="w-full h-full object-cover transition-all duration-300"
                />
                {hasChanged && !generating && (
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
            <OptionGroup label="성별" options={GENDERS} value={gender} onChange={setGender} disabled={generating} />
            <OptionGroup label="인종" options={ETHNICITIES} value={ethnicity} onChange={setEthnicity} disabled={generating} />
            <OptionGroup label="체형" options={BODY_TYPES} value={bodyType} onChange={setBodyType} disabled={generating} />
            <OptionGroup label="포즈" options={POSES} value={pose} onChange={setPose} disabled={generating} />
          </div>

          {/* Info */}
          <div className="rounded-lg bg-muted p-3 flex gap-2 text-xs text-muted-foreground">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p>옵션을 선택한 후 <strong>'AI 모델 생성'</strong> 버튼을 클릭하면 Gemini가 모델 이미지를 생성합니다.</p>
              <p>생성된 모델은 상품 이미지 변환 시 기준이 됩니다.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button variant="destructive" onClick={handleSave} disabled={generating}>설정 저장</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VendorModelSettingsDialog;
