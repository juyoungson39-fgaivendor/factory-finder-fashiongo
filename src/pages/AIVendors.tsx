import React, { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, ArrowRight, Settings2, Loader2, Sparkles } from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import VendorModelSettingsDialog, { getVendorModelSettings } from '@/components/vendor/VendorModelSettingsDialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts } from '@/integrations/va-api/hooks/use-products';
import { useResolvedVendors } from '@/integrations/va-api/use-resolved-vendors';
import type { AIVendorConfig } from '@/integrations/va-api/vendor-config';

/** Card for a single AI Vendor with real product count from VA API */
function VendorCard({ vendor, refreshKey, onOpenModelDialog }: {
  vendor: AIVendorConfig;
  refreshKey: number;
  onOpenModelDialog: (v: { id: string; name: string }) => void;
}) {
  const { data: productData, isLoading: productsLoading } = useProducts({
    wholesalerId: vendor.wholesalerId,
    page: 1,
    size: 1,
  });

  const productCount = productData?.totalCount ?? 0;
  const model = getVendorModelSettings(vendor.id);

  return (
    <Card key={`${vendor.id}-${refreshKey}`} className="overflow-hidden group hover:shadow-lg transition-all duration-300">
      <div className="h-2" style={{ backgroundColor: vendor.color }} />
      <CardContent className="p-5 space-y-4">
        {/* Model image hero */}
        {model.modelImageUrl && !model.modelImageUrl.includes('unsplash.com') ? (
          <div className="relative w-full aspect-[3/4] max-h-[280px] overflow-hidden rounded-lg bg-muted mb-1">
            <img src={model.modelImageUrl} alt={`${vendor.name} AI model`} className="w-full h-full object-cover" />
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span className="text-[9px] font-semibold tracking-widest uppercase text-amber-300">Angels' Vendor</span>
              </div>
              <h2 className="text-xl font-black tracking-tight text-white">{vendor.name}</h2>
            </div>
          </div>
        ) : (
          <div className="w-full aspect-[3/4] max-h-[280px] rounded-lg bg-muted/50 flex flex-col items-center justify-center gap-2 mb-1">
            <Avatar className="h-20 w-20 border-2 border-border shadow-sm">
              <AvatarFallback className="text-lg font-bold" style={{ color: vendor.color }}>AI</AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span className="text-[9px] font-semibold tracking-widest uppercase text-amber-600">Angels' Vendor</span>
            </div>
            <h2 className="text-xl font-black tracking-tight" style={{ color: vendor.color }}>{vendor.name}</h2>
            <p className="text-[10px] text-muted-foreground">AI 모델 미생성</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-medium">
            {vendor.position}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{model.ethnicity} · {model.bodyType}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{vendor.categories}</p>

        <div className="border-t border-border" />

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            등록 상품{' '}
            {productsLoading ? (
              <Loader2 className="inline w-3 h-3 animate-spin" />
            ) : (
              <span className="font-bold text-foreground text-lg">{productCount}</span>
            )}
            개
          </span>
        </div>

        <div className="space-y-2">
          <Link to={`/ai-vendors/${vendor.id}/products`} className="block">
            <Button variant="outline" size="sm" className="w-full text-xs font-semibold">
              📊 {vendor.name} 판매 대시보드
            </Button>
          </Link>
          <Link to={`/ai-vendors/${vendor.id}`} className="block">
            <Button className="w-full font-semibold" style={{ backgroundColor: vendor.color }}>
              상품 & 이미지 변환 <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => onOpenModelDialog({ id: vendor.id, name: vendor.name })}
          >
            <Settings2 className="w-3.5 h-3.5 mr-1" />
            AI 모델 설정
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const AIVendors = () => {
  const [modelDialogVendor, setModelDialogVendor] = useState<{ id: string; name: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { active: activeVendors } = useResolvedVendors();

  const handleModelSaved = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="space-y-3">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> 대시보드로 돌아가기
        </Link>
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Angels' Vendor Feed</h1>
            <p className="text-xs text-muted-foreground">AI가 운영하는 {activeVendors.length}개 전문 벤더 브랜드</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {activeVendors.map((v) => (
          <VendorCard
            key={v.id}
            vendor={v}
            refreshKey={refreshKey}
            onOpenModelDialog={setModelDialogVendor}
          />
        ))}
        {activeVendors.length === 0 && (
          <div className="col-span-full text-center py-16 border border-dashed rounded-xl text-sm text-muted-foreground">
            활성화된 벤더가 없습니다. <Link to="/settings/pricing" className="text-foreground underline">FashionGo 설정</Link>에서 벤더를 활성화하세요.
          </div>
        )}
      </div>

      {modelDialogVendor && (
        <VendorModelSettingsDialog
          open={!!modelDialogVendor}
          onOpenChange={(open) => { if (!open) setModelDialogVendor(null); }}
          vendorId={modelDialogVendor.id}
          vendorName={modelDialogVendor.name}
          onSaved={handleModelSaved}
        />
      )}
    </div>
  );
};

export default AIVendors;
