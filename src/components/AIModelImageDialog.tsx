import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, ImageIcon, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AIModelImageDialogProps {
  open: boolean;
  onClose: () => void;
  productName: string;
  onUseImage?: (imageUrl: string) => void;
  modelImageUrl?: string;
}

type Stage = 'upload' | 'generating' | 'result' | 'error';

const AIModelImageDialog = ({ open, onClose, productName, onUseImage, modelImageUrl }: AIModelImageDialogProps) => {
  const [stage, setStage] = useState<Stage>('upload');
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const reset = useCallback(() => {
    setStage('upload');
    setOriginalImage(null);
    setGeneratedImage(null);
    setErrorMsg('');
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: '이미지 파일만 업로드 가능합니다', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: '파일 크기는 10MB 이하여야 합니다', variant: 'destructive' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setOriginalImage(base64);
      generateModelImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setOriginalImage(base64);
      generateModelImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const generateModelImage = async (imageBase64: string) => {
    setStage('generating');
    setErrorMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('generate-model-image', {
        body: { imageBase64, modelImageUrl },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.generatedImageUrl) throw new Error('이미지 생성에 실패했습니다');

      setGeneratedImage(data.generatedImageUrl);
      setStage('result');
    } catch (err: any) {
      console.error('AI model image generation failed:', err);
      setErrorMsg(err.message || '알 수 없는 오류가 발생했습니다');
      setStage('error');
    }
  };

  const handleUseImage = () => {
    if (generatedImage && onUseImage) {
      onUseImage(generatedImage);
      toast({ title: 'AI 모델 이미지가 등록용으로 설정되었습니다' });
      handleClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary" />
            AI 모델 착용샷 생성
          </DialogTitle>
          <DialogDescription>
            {productName} — 상품 이미지를 업로드하면 AI가 모델 착용샷을 생성합니다
          </DialogDescription>
        </DialogHeader>

        {/* UPLOAD STAGE */}
        {stage === 'upload' && (
          <div
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <Upload className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">
              상품 이미지를 업로드하세요
            </p>
            <p className="text-xs text-muted-foreground">
              클릭하거나 드래그 앤 드롭 · PNG, JPG · 최대 10MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {/* GENERATING STAGE */}
        {stage === 'generating' && (
          <div className="py-10 text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto">
              <Loader2 className="w-16 h-16 animate-spin text-primary/60" />
              <ImageIcon className="w-6 h-6 absolute inset-0 m-auto text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                AI가 모델 착용샷을 생성하고 있습니다...
              </p>
              <p className="text-xs text-muted-foreground mt-1">0~30초 소요</p>
            </div>
            {originalImage && (
              <div className="mt-4 mx-auto w-32 h-32 rounded-lg overflow-hidden border border-border">
                <img src={originalImage} alt="원본" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        )}

        {/* RESULT STAGE */}
        {stage === 'result' && originalImage && generatedImage && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 text-center">원본</p>
                <div className="rounded-lg overflow-hidden border border-border aspect-[3/4] bg-secondary/20">
                  <img src={originalImage} alt="원본 이미지" className="w-full h-full object-contain" />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 text-center">AI 모델 착용샷</p>
                <div className="rounded-lg overflow-hidden border border-primary/30 aspect-[3/4] bg-secondary/20 ring-2 ring-primary/10">
                  <img src={generatedImage} alt="AI 생성 이미지" className="w-full h-full object-contain" />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>
                <X className="w-4 h-4 mr-1" />
                다시 시도
              </Button>
              {onUseImage && (
                <Button className="flex-1" onClick={handleUseImage}>
                  <Check className="w-4 h-4 mr-1" />
                  FashionGo 등록에 사용
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ERROR STAGE */}
        {stage === 'error' && (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
              <X className="w-6 h-6 text-destructive" />
            </div>
            <p className="text-sm font-medium text-foreground">이미지 생성에 실패했습니다</p>
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
            <Button variant="outline" onClick={reset}>
              다시 시도
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AIModelImageDialog;
