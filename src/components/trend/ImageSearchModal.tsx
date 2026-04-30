import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, Upload, RotateCcw, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PlatformLogo } from './PlatformLogo';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface ImageSearchResult {
  id: string;
  trend_name: string;
  image_url: string | null;
  platform: string;
  lifecycle_stage: string | null;
  /** 0.0 ~ 1.0 */
  similarity: number;
  permalink?: string | null;
}

interface RecentSearch {
  localUrl: string;
  publicUrl: string;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const LIFECYCLE_MAP: Record<string, { emoji: string; label: string; cls: string }> = {
  emerging:  { emoji: '🌱', label: 'Emerging',  cls: 'bg-green-100 text-green-700' },
  rising:    { emoji: '🚀', label: 'Rising',    cls: 'bg-blue-100 text-blue-700' },
  peak:      { emoji: '⭐', label: 'Peak',       cls: 'bg-yellow-100 text-yellow-700' },
  declining: { emoji: '📉', label: 'Declining', cls: 'bg-gray-100 text-gray-600' },
  classic:   { emoji: '💎', label: 'Classic',   cls: 'bg-purple-100 text-purple-700' },
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function getSimilarityBadge(similarity: number) {
  const pct = Math.round(similarity * 100);
  const cls =
    pct >= 85 ? 'bg-green-500 text-white' :
    pct >= 70 ? 'bg-yellow-400 text-gray-900' :
                'bg-gray-400 text-white';
  return { pct, cls };
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export interface ImageSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  onResultClick: (id: string) => void;
}

type Phase = 'idle' | 'preview' | 'uploading' | 'searching' | 'results' | 'error';

export const ImageSearchModal = ({
  open,
  onOpenChange,
  userId,
  onResultClick,
}: ImageSearchModalProps) => {
  const [phase, setPhase]               = useState<Phase>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null);
  const [results, setResults]           = useState<ImageSearchResult[]>([]);
  const [aiDescription, setAiDescription] = useState('');
  const [errorMsg, setErrorMsg]         = useState('');
  const [isDragOver, setIsDragOver]     = useState(false);
  // 세션 내 최근 검색 이력 (모달 닫아도 유지)
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 모달 닫힐 때 검색 상태 초기화 (recentSearches 는 유지)
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setPhase('idle');
        setSelectedFile(null);
        setResults([]);
        setAiDescription('');
        setErrorMsg('');
        // previewUrl 은 recentSearches 에서 재사용할 수 있으므로 초기화하지 않음
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ── 파일 선택 처리 ───────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('JPG, PNG, WEBP 형식만 지원합니다.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('파일 크기는 5MB 이하여야 합니다.');
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setPhase('preview');
    setResults([]);
    setAiDescription('');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── 이미지 검색 실행 ─────────────────────────────────────
  const runSearch = useCallback(async (imageUrl: string) => {
    if (!userId) {
      toast.error('로그인이 필요합니다.');
      return;
    }
    setPhase('searching');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('search-by-image', {
        body: { image_url: imageUrl, user_id: userId, limit: 20 },
      });
      if (fnError) throw new Error(fnError.message);
      setResults(data?.results ?? []);
      setAiDescription(data?.ai_description ?? '');
      setPhase('results');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setPhase('error');
    }
  }, [userId]);

  const handleSearch = async () => {
    if (!selectedFile || !userId) return;
    setPhase('uploading');

    try {
      // 1. Supabase Storage 업로드
      const ext = (selectedFile.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('trend-search-images')
        .upload(path, selectedFile, { contentType: selectedFile.type, upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage
        .from('trend-search-images')
        .getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      // 최근 검색 이력 추가
      if (previewUrl) {
        setRecentSearches(prev => [
          { localUrl: previewUrl, publicUrl },
          ...prev.filter(r => r.publicUrl !== publicUrl).slice(0, 2),
        ]);
      }

      // 2. Edge Function 호출
      await runSearch(publicUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setPhase('error');
      toast.error(`이미지 검색 실패: ${msg}`);
    }
  };

  const handleRecentSearch = useCallback((recent: RecentSearch) => {
    setPreviewUrl(recent.localUrl);
    runSearch(recent.publicUrl);
  }, [runSearch]);

  const isLoading = phase === 'uploading' || phase === 'searching';
  const loadingText =
    phase === 'uploading' ? '이미지를 업로드하고 있습니다...' :
                            'AI가 이미지를 분석하고 있습니다...';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">

        {/* 헤더 */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Camera className="w-4 h-4 text-muted-foreground" />
            이미지로 트렌드 검색
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            패션 이미지를 업로드하면 AI가 유사한 트렌드를 찾아드립니다
          </p>
        </DialogHeader>

        {/* 본문 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── idle: 업로드 영역 ─────────────────────────── */}
          {phase === 'idle' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 cursor-pointer transition-colors',
                isDragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30',
              )}
            >
              <Upload className="w-10 h-10 text-muted-foreground/40" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">이미지를 드래그하거나 클릭하여 업로드</p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP · 최대 5MB</p>
              </div>
            </div>
          )}

          {/* ── preview: 미리보기 + 검색 버튼 ───────────────── */}
          {phase === 'preview' && (
            <div className="flex gap-4 items-start">
              <div className="shrink-0 w-28 h-28 rounded-xl overflow-hidden border border-border bg-muted">
                {previewUrl && <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 flex flex-col gap-3 pt-1">
                <div>
                  <p className="text-sm font-medium text-foreground truncate">{selectedFile?.name}</p>
                  {selectedFile && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSearch}
                    className="text-sm px-5 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                  >
                    검색
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    다시 선택
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 파일 입력 (hidden, 항상 존재) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />

          {/* ── 로딩 ─────────────────────────────────────── */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{loadingText}</p>
            </div>
          )}

          {/* ── 에러 ─────────────────────────────────────── */}
          {phase === 'error' && (
            <div className="text-center py-12 space-y-3">
              <p className="text-2xl">⚠️</p>
              <p className="text-sm text-destructive">{errorMsg || '검색 중 오류가 발생했습니다.'}</p>
              <button
                type="button"
                onClick={() => setPhase(previewUrl ? 'preview' : 'idle')}
                className="text-xs px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                다시 시도
              </button>
            </div>
          )}

          {/* ── 결과 ─────────────────────────────────────── */}
          {phase === 'results' && (
            <div className="space-y-4">
              {/* 검색 이미지 + AI 분석 설명 */}
              <div className="flex gap-3 items-start rounded-xl bg-muted/40 border border-border/50 p-3">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="searched"
                    className="w-16 h-16 rounded-lg object-cover shrink-0 border border-border"
                  />
                )}
                <div className="flex-1 min-w-0">
                  {aiDescription ? (
                    <p className="text-xs text-foreground leading-relaxed">
                      <span className="font-semibold text-primary">AI 분석: </span>
                      {aiDescription}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">이미지 분석 완료</p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {results.length > 0 ? `유사 트렌드 ${results.length}개 발견` : '유사 트렌드 없음'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPhase('preview');
                    setResults([]);
                  }}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  재검색
                </button>
              </div>

              {/* 결과 없음 */}
              {results.length === 0 && (
                <div className="text-center py-10 space-y-2 border border-dashed border-border rounded-xl">
                  <p className="text-2xl">🔍</p>
                  <p className="text-sm text-muted-foreground">유사한 트렌드를 찾지 못했습니다</p>
                  <p className="text-xs text-muted-foreground">다른 이미지로 검색해 보세요</p>
                </div>
              )}

              {/* 결과 그리드 */}
              {results.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {results.map((r) => {
                    const { pct, cls: badgeCls } = getSimilarityBadge(r.similarity);
                    const lc = r.lifecycle_stage ? LIFECYCLE_MAP[r.lifecycle_stage] : null;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          onOpenChange(false);
                          onResultClick(r.id);
                        }}
                        className="text-left rounded-xl border border-border bg-card overflow-hidden hover:shadow-md hover:border-primary/40 transition-all group"
                      >
                        {/* 썸네일 */}
                        <div className="relative h-[120px] bg-muted overflow-hidden">
                          {r.image_url ? (
                            <img
                              src={r.image_url}
                              alt={r.trend_name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-3xl">📷</div>
                          )}
                          {/* 유사도 배지 */}
                          <span className={cn(
                            'absolute top-1.5 right-1.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full',
                            badgeCls,
                          )}>
                            {pct}% 일치
                          </span>
                        </div>

                        {/* 정보 */}
                        <div className="p-2.5 space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <PlatformLogo platform={r.platform} size="sm" />
                            <span className="text-[10px] text-muted-foreground capitalize truncate">
                              {r.platform}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-foreground line-clamp-2 leading-tight">
                            {r.trend_name}
                          </p>
                          {lc && (
                            <span className={cn(
                              'inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                              lc.cls,
                            )}>
                              {lc.emoji} {lc.label}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── 최근 검색 이력 (idle / preview 상태에서만) ─── */}
          {(phase === 'idle' || phase === 'preview') && recentSearches.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">최근 검색</p>
              <div className="flex gap-2">
                {recentSearches.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleRecentSearch(r)}
                    className="w-16 h-16 rounded-lg border border-border overflow-hidden hover:border-primary/50 hover:shadow-sm transition-all shrink-0"
                    title="이 이미지로 재검색"
                  >
                    <img src={r.localUrl} alt={`recent-${i}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
