import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowRight, Settings2, Loader2, Sparkles } from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import VendorModelSettingsDialog, { getVendorModelSettings } from '@/components/vendor/VendorModelSettingsDialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts } from '@/integrations/va-api/hooks/use-products';
import { AI_VENDORS } from '@/integrations/va-api/vendor-config';
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
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            {/* Angels' Vendor label */}
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] font-semibold tracking-widest uppercase text-amber-600">Angels' Vendor</span>
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black tracking-tight" style={{ color: vendor.color }}>{vendor.name}</h2>
              <Avatar className="h-10 w-10 border-2 border-border shadow-sm">
                <AvatarImage src={model.modelImageUrl} alt="model" />
                <AvatarFallback className="text-[10px] font-bold">AI</AvatarFallback>
              </Avatar>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-medium">
                {vendor.position}
              </Badge>
              <span className="text-[10px] text-muted-foreground">{model.ethnicity} · {model.bodyType}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{vendor.categories}</p>
          </div>
        </div>

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

  const handleModelSaved = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Angels' Vendor Feed</h1>
            <p className="text-xs text-muted-foreground">AI가 운영하는 {AI_VENDORS.length}개 전문 벤더 브랜드</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {AI_VENDORS.map((v) => (
          <VendorCard
            key={v.id}
            vendor={v}
            refreshKey={refreshKey}
            onOpenModelDialog={setModelDialogVendor}
          />
        ))}
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
