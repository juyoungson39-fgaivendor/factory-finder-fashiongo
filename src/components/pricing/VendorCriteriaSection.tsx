import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useFgSettings, useUpdateFgSettings } from '@/integrations/supabase/hooks/use-fg-settings';

const VendorCriteriaSection = () => {
  const { toast } = useToast();
  const { data: settings } = useFgSettings();
  const updateSettings = useUpdateFgSettings();
  const [vendors, setVendors] = useState(settings?.vendorCriteria ?? []);

  useEffect(() => {
    if (settings) setVendors(settings.vendorCriteria);
  }, [settings]);

  const updateVendor = (idx: number, field: 'keywords' | 'categories', value: string) => {
    setVendors(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  };

  const saveVendors = () => {
    updateSettings.mutate(
      { vendorCriteria: vendors },
      { onSuccess: () => toast({ title: 'AI Vendor 기준이 저장되었습니다' }) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI Vendor 배정 기준</CardTitle>
        <CardDescription>상품 카테고리/키워드 분석으로 AI Vendor를 자동 배정합니다</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Vendor</TableHead>
                <TableHead className="w-[130px]">포지션</TableHead>
                <TableHead>키워드</TableHead>
                <TableHead>주력 카테고리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((v, idx) => (
                <TableRow key={v.name}>
                  <TableCell>
                    <Badge className={`${v.color} text-white border-0`}>{v.name}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{v.position}</TableCell>
                  <TableCell>
                    <Input
                      className="text-sm h-8"
                      value={v.keywords}
                      onChange={e => updateVendor(idx, 'keywords', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="text-sm h-8"
                      value={v.categories}
                      onChange={e => updateVendor(idx, 'categories', e.target.value)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-end">
          <Button onClick={saveVendors}>기준 저장</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default VendorCriteriaSection;
