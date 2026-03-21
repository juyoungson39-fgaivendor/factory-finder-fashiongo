import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Sparkles, ArrowRight, Settings2 } from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import VendorModelSettingsDialog, { getVendorModelSettings } from '@/components/vendor/VendorModelSettingsDialog';

const VENDORS = [
  { id: 'basic', name: 'BASIC', position: '베이직 스테디', categories: 'Tops, Basics, Everyday Wear', products: 24, factories: 3, score: 88, color: '#1A1A1A' },
  { id: 'curve', name: 'CURVE', position: '플러스사이즈', categories: 'Plus Size Tops, Dresses, Bottoms', products: 18, factories: 2, score: 82, color: '#D60000' },
  { id: 'denim', name: 'DENIM', position: '데님 스테디', categories: 'Jeans, Denim Jackets, Shorts', products: 21, factories: 3, score: 85, color: '#1E3A5F' },
  { id: 'vacation', name: 'VACATION', position: '리조트/여름 시즌', categories: 'Swimwear, Resort, Linen', products: 16, factories: 2, score: 79, color: '#F59E0B' },
  { id: 'festival', name: 'FESTIVAL', position: '미국 시즌 이벤트', categories: 'Holiday, Prom, Party, Formal', products: 14, factories: 2, score: 76, color: '#7C3AED' },
  { id: 'trend', name: 'TREND', position: 'SNS 트렌드', categories: 'TikTok/Instagram 바이럴', products: 31, factories: 4, score: 91, color: '#EC4899' },
];

const AIVendors = () => {
  const totalProducts = VENDORS.reduce((sum, v) => sum + v.products, 0);
  const [modelDialogVendor, setModelDialogVendor] = useState<{ id: string; name: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleModelSaved = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6" />
            AI Vendor 피드
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI가 선별한 벤더별 상품이 FashionGo 바이어 피드에 자동 연결됩니다
          </p>
        </div>
        <span className="text-sm text-muted-foreground shrink-0">
          전체 상품 {totalProducts}개
        </span>
      </div>

      {/* Vendor Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {VENDORS.map((v) => {
          const model = getVendorModelSettings(v.id);
          return (
            <Card key={`${v.id}-${refreshKey}`} className="overflow-hidden">
              {/* Accent bar */}
              <div className="h-1.5" style={{ backgroundColor: v.color }} />
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-xl font-bold" style={{ color: v.color }}>{v.name}</h2>
                      <Avatar className="h-8 w-8 border border-border">
                        <AvatarImage src={model.modelImageUrl} alt="model" />
                        <AvatarFallback className="text-[10px]">AI</AvatarFallback>
                      </Avatar>
                      <span className="text-[10px] text-muted-foreground">{model.ethnicity} · {model.bodyType}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-medium">
                      {v.position}
                    </Badge>
                    <p className="text-xs text-muted-foreground">{v.categories}</p>
                  </div>
                  <ScoreBadge score={v.score} size="lg" />
                </div>

                <div className="border-t border-border" />

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>상품 <span className="font-medium text-foreground">{v.products}</span>개</span>
                  <span className="text-border">|</span>
                  <span>공장 <span className="font-medium text-foreground">{v.factories}</span>개</span>
                  <span className="text-border">|</span>
                  <span>평균스코어 <span className="font-medium text-foreground">{v.score}</span></span>
                </div>

                <div className="space-y-2">
                  <Link to={`/ai-vendors/${v.id}`} className="block">
                    <Button variant="outline" className="w-full">
                      상품 보기 <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setModelDialogVendor({ id: v.id, name: v.name })}
                  >
                    <Settings2 className="w-3.5 h-3.5 mr-1" />
                    모델 설정
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Model Settings Dialog */}
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
