import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ReactNode } from 'react';

interface Props {
  stockScore?: number | null;
  oemScore?: number | null;
  useCase?: string | null;
  summary: ReactNode;
  stock: ReactNode;
  oem: ReactNode;
  raw: ReactNode;
}

const useCaseLabel: Record<string, string> = {
  stock: '재고 구매 추천',
  oem: '생산 외주 추천',
  both: '둘 다 적합',
  unknown: '판단 불가',
};

export default function FactoryTabs({ stockScore, oemScore, useCase, summary, stock, oem, raw }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono">Stock {stockScore ?? '–'}/100</Badge>
        <Badge variant="outline" className="font-mono">OEM {oemScore ?? '–'}/100</Badge>
        {useCase && (
          <Badge variant="default">추천: {useCaseLabel[useCase] ?? useCase}</Badge>
        )}
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">요약</TabsTrigger>
          <TabsTrigger value="stock">재고 구매 적합도</TabsTrigger>
          <TabsTrigger value="oem">생산 외주 적합도</TabsTrigger>
          <TabsTrigger value="raw">Raw 데이터</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="mt-4 space-y-4">{summary}</TabsContent>
        <TabsContent value="stock" className="mt-4">{stock}</TabsContent>
        <TabsContent value="oem" className="mt-4">{oem}</TabsContent>
        <TabsContent value="raw" className="mt-4">{raw}</TabsContent>
      </Tabs>
    </div>
  );
}
