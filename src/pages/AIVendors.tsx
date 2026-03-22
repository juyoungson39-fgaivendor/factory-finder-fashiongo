import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowRight, Settings2, Loader2 } from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import VendorModelSettingsDialog, { getVendorModelSettings } from '@/components/vendor/VendorModelSettingsDialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts } from '@/integrations/va-api/hooks/use-products';
import { AI_VENDORS } from '@/integrations/va-api/vendor-config';
import type { AIVendorConfig } from '@/integrations/va-api/vendor-config';

/** Hook to get factory count per vendor from Supabase */
function useFactoryCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['factories-count', user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('factories')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });
}

/** Card for a single AI Vendor with real product count from VA API */
function VendorCard({ vendor, refreshKey, onOpenModelDialog }: {
  vendor: AIVendorConfig;
  refreshKey: number;
  onOpenModelDialog: (v: { id: string; name: string }) => void;
}) {
  const { data: productData, isLoading: productsLoading } = useProducts({
    wholesalerId: vendor.wholesalerId,
    page: 1,
    size: 1, // only need totalCount
  });

  const productCount = productData?.totalCount ?? 0;
  const model = getVendorModelSettings(vendor.id);

  return (
    <Card key={`${vendor.id}-${refreshKey}`} className="overflow-hidden">
      <div className="h-1.5" style={{ backgroundColor: vendor.color }} />
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold" style={{ color: vendor.color }}>{vendor.name}</h2>
              <Avatar className="h-8 w-8 border border-border">
                <AvatarImage src={model.modelImageUrl} alt="model" />
                <AvatarFallback className="text-[10px]">AI</AvatarFallback>
              </Avatar>
              <span className="text-[10px] text-muted-foreground">{model.ethnicity} · {model.bodyType}</span>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-medium">
              {vendor.position}
            </Badge>
            <p className="text-xs text-muted-foreground">{vendor.categories}</p>
          </div>
        </div>

        <div className="border-t border-border" />

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            상품{' '}
            {productsLoading ? (
              <Loader2 className="inline w-3 h-3 animate-spin" />
            ) : (
              <span className="font-medium text-foreground">{productCount}</span>
            )}
            개
          </span>
        </div>

        <div className="space-y-2">
          <Link to={`/ai-vendors/${vendor.id}`} className="block">
            <Button variant="outline" className="w-full">
              상품 보기 <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => onOpenModelDialog({ id: vendor.id, name: vendor.name })}
          >
            <Settings2 className="w-3.5 h-3.5 mr-1" />
            모델 설정
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
      <div className="flex justify-end">
        <span className="text-sm text-muted-foreground shrink-0">
          {AI_VENDORS.length}개 AI 벤더
        </span>
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
