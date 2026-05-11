import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Plus, Download, Loader2, Check, Sparkles, TrendingUp, Info } from 'lucide-react';
import {
  TooltipProvider,
  Tooltip as ShadTooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAgentKeywordSelector, type AgentKeyword, N_RISING, M_HOT, K_CATEGORY, MAX_KEYWORDS } from '@/hooks/useAgentKeywordSelector';
import FGDataConvertDialog from '@/components/agent/FGDataConvertDialog';
import { useToast } from '@/hooks/use-toast';
import { AI_VENDORS, ACTIVE_AI_VENDORS } from '@/integrations/va-api/vendor-config';
import { vaApi } from '@/integrations/va-api/client';
import type { FGProductRegistrationRequest, FGProductDetail } from '@/integrations/va-api/types';
import { useFashiongoQueue, useProcessQueueItem } from '@/integrations/supabase/hooks/use-fashiongo-queue';
import { useInsertFgRegisteredProduct } from '@/integrations/supabase/hooks/use-fg-registered-products';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import AngelAgentPanel from '@/components/dashboard/AngelAgentPanel';
import TrendInsightsPanel from '@/components/dashboard/TrendInsightsPanel';

/**
 * AI-based vendor assignment: 활성 벤더(Sassy Look, G1K)에만 배정.
 * 비활성 벤더 카테고리(plus, swim, denim, festival 등)도 휴리스틱에 따라
 * 트렌디 → G1K, 그 외 → Sassy Look 으로 매핑.
 */
async function analyzeAndAssignVendor(imageUrl: string | null, category?: string): Promise<{ vendor: typeof AI_VENDORS[number]; analysis: any }> {
  const basic = AI_VENDORS.find(v => v.id === 'basic')!;   // Sassy Look
  const trend = AI_VENDORS.find(v => v.id === 'trend')!;   // G1K

  if (imageUrl && !imageUrl.includes('placehold.co')) {
    try {
      const { data, error } = await supabase.functions.invoke('analyze-product-image', {
        body: { image_url: imageUrl },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.skipped || !data?.analysis) {
        console.warn('Image analysis skipped, using fallback vendor:', data?.reason || imageUrl);
      } else {
        const a = data.analysis;
        // 트렌디/바이럴/Y2K/스트릿/파티/프롬/홀리데이 → G1K(SNS 트렌드)
        const trendyTags = ['trendy', 'streetwear', 'viral', 'y2k', 'edgy', 'formal', 'party', 'prom', 'evening', 'holiday', 'resort', 'vacation', 'beach', 'summer'];
        if (a.style_tags?.some((t: string) => trendyTags.includes(t.toLowerCase()))) {
          return { vendor: trend, analysis: a };
        }
        // 그 외(베이직/데님/플러스 포함) → Sassy Look
        return { vendor: basic, analysis: a };
      }
    } catch (e) {
      console.warn('Image analysis failed, using fallback:', e);
    }
  }
  // Fallback
  return { vendor: basic, analysis: null };
}






type AgentStatus = 'idle' | 'running' | 'waiting' | 'push-confirm' | 'complete';

const VENDOR_COLORS: Record<string, string> = {
  'Sassy Look': '#1A1A1A', styleu: '#1E3A5F', 'Young Aloud': '#F59E0B',
  'Lenovia USA': '#7C3AED', G1K: '#EC4899', BiBi: '#D60000'
};

const Dashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search] = useState('');
  const [statusFilter] = useState('all');
  const [sortBy] = useState('newest');
  const [scoreRange] = useState<[number, number]>([0, 100]);
  const [starredVendors] = useState<Set<string>>(() => new Set());
  const [currentFactoryPage] = useState(1);

  const [agentBarOpen, setAgentBarOpen] = useState(true);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [stepBadges, setStepBadges] = useState<string[]>(['', '', '', '', '', '']);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);
  const [showFGConvert, setShowFGConvert] = useState(false);
  const [confirmedItems, setConfirmedItems] = useState<string[]>([]);

  // Fetch sourceable products for confirm modal
  const { data: sourceableProducts = [] } = useQuery({
    queryKey: ["sourceable-products-confirm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sourceable_products")
        .select("*")
        .eq("source", "agent")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Queue-based confirm products (pending fashiongo_queue items)
  const { data: queueItems = [] } = useFashiongoQueue();
  const processQueueItem = useProcessQueueItem();
  const insertFgProduct = useInsertFgRegisteredProduct();

  // ── Angel Agent Step 1 — 키워드 선별 ───────────────────────
  const { select: selectKeywords } = useAgentKeywordSelector();
  const [selectedKeywords, setSelectedKeywords] = useState<AgentKeyword[]>([]);
  const [noKeywordsData, setNoKeywordsData] = useState(false);

  // AI-analyzed vendor assignments
  const [aiAssignments, setAiAssignments] = useState<Record<string, { vendor: typeof AI_VENDORS[number]; analysis: any }>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  const confirmProducts = useMemo(() => {
    if (sourceableProducts.length > 0) {
      return sourceableProducts.map((item, idx) => {
        const assignment = aiAssignments[item.id];
        const vendor = assignment?.vendor || ACTIVE_AI_VENDORS[idx % ACTIVE_AI_VENDORS.length];
        const yuan = item.unit_price ?? item.price ?? 0;
        return {
          id: item.id,
          name: item.item_name ?? item.product_no ?? 'Unknown',
          vendor: vendor.name,
          vendorColor: vendor.color,
          vendorId: vendor.id,
          factory: item.vendor_name ?? '-',
          yuan: Number(yuan),
          score: 80 + (idx % 15),
          image: item.image_url || 'https://placehold.co/120x120?text=No+Image',
          queueItemId: null as string | null,
          category: item.category ?? item.fg_category ?? '-',
          material: item.material ?? '-',
          productNo: item.product_no ?? item.style_no ?? '-',
          aiAnalysis: assignment?.analysis || null,
        };
      });
    }
    if (queueItems.length > 0) {
      return queueItems.slice(0, 12).map((item, idx) => {
        const pd = (item.product_data as any) ?? {};
        const firstProduct = pd.products?.[0];
        const vendor = ACTIVE_AI_VENDORS[idx % ACTIVE_AI_VENDORS.length];
        const wholesalePrice = firstProduct?.wholesalePrice ? parseFloat(firstProduct.wholesalePrice) : 0;
        const yuan = Math.round(wholesalePrice * 7);
        return {
          id: item.id,
          name: firstProduct?.name ?? (item.factories as any)?.name ?? 'Unknown',
          vendor: vendor.name,
          vendorColor: vendor.color,
          vendorId: vendor.id,
          factory: (item.factories as any)?.name ?? '-',
          yuan: yuan || Math.round(wholesalePrice * 7) || 100,
          score: Math.round(pd.match_score ?? (item.factories as any)?.overall_score ?? 75),
          image: pd.ai_model_image || 'https://placehold.co/120x120?text=No+Image',
          queueItemId: item.id,
          aiAnalysis: null,
        };
      });
    }
    return [];
  }, [sourceableProducts, queueItems, aiAssignments]);

  // Don't auto-select all — user picks which products to confirm

  const { data: rawFactories = [], isLoading } = useQuery({
    queryKey: ['factories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.
      from('factories').
      select('*').
      order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  const factories = rawFactories ?? [];

  const filtered = factories.
  filter((f) => {
    if (statusFilter !== 'all' && f.status !== statusFilter) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    const score = f.overall_score ?? 0;
    if (score < scoreRange[0] || score > scoreRange[1]) return false;
    return true;
  }).
  sort((a, b) => {
    if (sortBy === 'score') return (b.overall_score ?? 0) - (a.overall_score ?? 0);
    if (sortBy === 'score-asc') return (a.overall_score ?? 0) - (b.overall_score ?? 0);
    if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const stats = (() => {
    const total = factories.length;
    const approved = factories.filter((f) => f.status === 'approved').length;
    const sampling = factories.filter((f) => f.status === 'sampling').length;

    // AI 평균 점수: (AVG(stock_score) + AVG(oem_score)) / 2 — 0~100 스케일
    const stockVals = factories.map((f) => Number((f as any).stock_score ?? 0)).filter((v) => v > 0);
    const oemVals = factories.map((f) => Number((f as any).oem_score ?? 0)).filter((v) => v > 0);
    const avgStock = stockVals.length ? stockVals.reduce((a, b) => a + b, 0) / stockVals.length : 0;
    const avgOem = oemVals.length ? oemVals.reduce((a, b) => a + b, 0) / oemVals.length : 0;
    const avgScore = avgStock || avgOem ? ((avgStock + avgOem) / 2).toFixed(1) : '0';

    // TOP FACTORY: GREATEST(stock_score, oem_score) >= 60 인 공장 개수
    const topFactoryCount = factories.filter((f) => {
      const best = Math.max(Number((f as any).stock_score ?? 0), Number((f as any).oem_score ?? 0));
      return best >= 60;
    }).length;

    return {
      total,
      approved,
      sampling,
      avgScore,
      topFactoryName: topFactoryCount,
    };
  })();

  const isTopVendor = (id: string, score: number) => starredVendors.has(id) || score >= 80;


  const handleAgentRun = async () => {
    setAgentStatus('running');
    setCurrentStep(1);
    setCompletedSteps([]);
    setStepBadges(['', '', '', '', '', '']);
    setAnalysisComplete(false);
    setSelectedKeywords([]);
    setNoKeywordsData(false);

    // ── Step 1: 트렌드 리포트 기반 키워드 자동 선별 (실제 DB 조회) ──
    const kwResult = await selectKeywords();
    const keywords = kwResult?.keywords ?? [];
    if (!kwResult || kwResult.noData) {
      setNoKeywordsData(true);
    }
    setSelectedKeywords(keywords);
    setCompletedSteps([1]);
    setStepBadges((prev) => {const b = [...prev]; b[0] = `${keywords.length}개 키워드`; return b;});
    setCurrentStep(2);

    await new Promise(resolve => setTimeout(resolve, 1500));

    setCompletedSteps([1, 2]);
    setStepBadges((prev) => {const b = [...prev];b[1] = '9개';return b;});
    setCurrentStep(3);
    // Step 3: 벤더 배분 — AI image analysis (parallel with timeout)
    setIsAnalyzing(true);
    const assignments: Record<string, { vendor: typeof AI_VENDORS[number]; analysis: any }> = {};
    const TIMEOUT_MS = 15000;
    const results = await Promise.allSettled(
      sourceableProducts.map(async (item) => {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
        );
        try {
          const result = await Promise.race([
            analyzeAndAssignVendor(item.image_url, item.category ?? item.fg_category ?? undefined),
            timeoutPromise,
          ]);
          return { id: item.id, result };
        } catch {
          return { id: item.id, result: { vendor: ACTIVE_AI_VENDORS[0], analysis: null } };
        }
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        assignments[r.value.id] = r.value.result;
      }
    }
    setAiAssignments(assignments);
    setIsAnalyzing(false);
    setAnalysisComplete(true);
    setCompletedSteps([1, 2, 3]);
    const vendorSet = new Set(Object.values(assignments).map(a => a.vendor.name));
    setStepBadges((prev) => {const b = [...prev];b[2] = `${vendorSet.size}벤더`;return b;});
    setCurrentStep(4);
    setAgentStatus('waiting');
    await new Promise(resolve => setTimeout(resolve, 1000));
    setStepBadges((prev) => {const b = [...prev];b[3] = `${sourceableProducts.length}개`;return b;});
    setShowConfirmModal(true);
  };

  const handleConfirm = () => {
    setShowConfirmModal(false);
    setCompletedSteps([1, 2, 3, 4]);
    setStepBadges((prev) => {const b = [...prev];b[3] = `${confirmedItems.length}개`;return b;});
    setCurrentStep(5);
    setAgentStatus('waiting');
    setShowFGConvert(true);
  };

  const handleFGConvertClose = useCallback(() => {
    setShowFGConvert(false);
    // 닫기만 — 5단계에 머무름
  }, []);

  const handleFGConvertProceed = useCallback(() => {
    setCompletedSteps([1, 2, 3, 4, 5]);
    setStepBadges((prev) => {const b = [...prev];b[4] = `${confirmedItems.length}개`;return b;});
    setCurrentStep(6);
    setAgentStatus('running');
    setTimeout(() => {
      setStepBadges((prev) => {const b = [...prev];b[5] = `${confirmedItems.length}개`;return b;});
      setAgentStatus('push-confirm');
      setShowPushModal(true);
    }, 1500);
  }, [confirmedItems.length]);

  const handleFinalPush = async () => {
    setShowPushModal(false);
    setAgentStatus('running');

    const selectedProducts = confirmProducts.filter((p) => confirmedItems.includes(p.id));
    let successCount = 0;
    let failCount = 0;

    for (const product of selectedProducts) {
      if (product.queueItemId) {
        // Real queue item — register via VA API
        try {
          await processQueueItem.mutateAsync({
            queueItemId: product.queueItemId,
            vendorKey: product.vendorId,
            itemName: product.name,
          });
          successCount++;
        } catch {
          failCount++;
        }
      } else {
        // sourceable_products item — register via VA API directly
        try {
          const vendor = AI_VENDORS.find(v => v.id === product.vendorId);
          if (!vendor) throw new Error(`Vendor not found: ${product.vendorId}`);

          const regRequest: FGProductRegistrationRequest = {
            wholesalerId: vendor.wholesalerId,
            productName: product.name,
            itemName: product.name,
            categoryId: 1,
            parentCategoryId: 0,
            parentParentCategoryId: 0,
            unitPrice: product.yuan,
            colorId: vendor.defaultColorId,
            imageUrl: product.image,
            autoActivate: false,
          };

          const registered = await vaApi.post<FGProductDetail>(
            '/products',
            regRequest as unknown as Record<string, unknown>,
          );

          await insertFgProduct.mutateAsync({
            fg_product_id: registered.productId,
            wholesaler_id: vendor.wholesalerId,
            vendor_key: vendor.id,
            item_name: registered.itemName,
            category_id: registered.categoryId ?? null,
            unit_price: registered.unitPrice ?? null,
            color_id: vendor.defaultColorId,
            image_url: product.image,
            source_type: 'sourceable_product',
            source_id: product.id,
            user_id: user?.id ?? null,
            status: 'registered',
          });

          successCount++;
        } catch {
          failCount++;
        }
      }
    }

    setCompletedSteps([1, 2, 3, 4, 5, 6]);
    setCurrentStep(0);
    setAgentStatus('complete');
    if (failCount === 0) {
      toast({ title: `✅ Angel Agent 사이클 완료`, description: `${successCount}개 상품이 FashionGo에 등록되었습니다` });
    } else {
      toast({ title: `⚠️ 일부 등록 실패`, description: `${successCount}개 성공, ${failCount}개 실패`, variant: 'destructive' });
    }
  };

  const handleReset = () => {
    setAgentStatus('idle');
    setCurrentStep(0);
    setCompletedSteps([]);
    setStepBadges(['', '', '', '', '', '']);
    setConfirmedItems(confirmProducts.map((p) => p.id));
    setSelectedKeywords([]);
    setNoKeywordsData(false);
  };

  const STEPS = ['트렌드 분석', '공장 매칭', '벤더 배분', '상품 컨펌', '정보 완성', 'FG 등록'];

  const getState = (i: number) => {
    const n = i + 1;
    if (completedSteps.includes(n)) return 'done';
    if (currentStep === n) return 'current';
    return 'idle';
  };

  /** 스텝 카드 클릭: 4~6단계만 모달 재오픈 및 롤백 지원 */
  const handleStepClick = (stepIndex: number) => {
    const stepNum = stepIndex + 1;
    if (agentStatus === 'idle') return;
    // 1~3단계는 클릭 무시
    if (stepNum <= 3) return;

    // 현재 대기 중인 스텝 클릭 → 해당 모달 재오픈
    if (stepNum === currentStep) {
      if (stepNum === 4) { setAgentStatus('waiting'); setShowConfirmModal(true); }
      else if (stepNum === 5) { setAgentStatus('waiting'); setShowFGConvert(true); }
      else if (stepNum === 6) { setAgentStatus('push-confirm'); setShowPushModal(true); }
      return;
    }

    // 완료된 이전 스텝(4~5만 해당) 클릭 → 해당 스텝으로 롤백 (이후 상태 전부 초기화)
    if (completedSteps.includes(stepNum) && stepNum < currentStep && stepNum >= 4) {
      setCompletedSteps(prev => prev.filter(s => s < stepNum));
      setCurrentStep(stepNum);
      setStepBadges(prev => {
        const b = [...prev];
        for (let j = stepIndex; j < 6; j++) b[j] = '';
        return b;
      });
      // 이후 단계 모달/상태 초기화
      setShowFGConvert(false);
      setShowPushModal(false);
      setShowConfirmModal(false);
      if (stepNum <= 4) {
        // 4단계로 돌아가면 컨펌 선택 초기화
        setConfirmedItems(confirmProducts.map(p => p.id));
      }
      setAgentStatus('waiting');
      if (stepNum === 4) setTimeout(() => setShowConfirmModal(true), 500);
      else if (stepNum === 5) setTimeout(() => setShowFGConvert(true), 500);
      return;
    }
  };

  const badge = agentStatus === 'idle' ? { text: '● 대기중', cls: 'bg-gray-100 text-gray-500' } :
  agentStatus === 'running' ? { text: '● 실행중', cls: 'bg-orange-100 text-orange-600 animate-pulse' } :
  agentStatus === 'waiting' ? { text: '⏳ 컨펌 대기', cls: 'bg-orange-100 text-orange-600 animate-pulse' } :
  agentStatus === 'push-confirm' ? { text: '🚀 Push 대기', cls: 'bg-blue-100 text-blue-600 animate-pulse' } :
  { text: '', cls: '' };

  // Vendor distribution for selected items
  const getVendorCounts = () => {
    const selected = confirmProducts.filter((p) => confirmedItems.includes(p.id));
    const counts: Record<string, number> = {};
    selected.forEach((p) => {counts[p.vendor] = (counts[p.vendor] || 0) + 1;});
    return counts;
  };

  return (
    <div>
      {/* TITLE */}
      <h1 style={{ fontSize: 20, fontWeight: 500, color: '#202223', marginBottom: 8 }}>대시보드</h1>

      {/* 공장 DB 현황 */}
      <div style={{ background: '#ffffff', border: '1px solid #e1e3e5', borderRadius: 6, boxShadow: '0 1px 0 rgba(26,26,26,0.07)', marginBottom: 16, overflow: 'hidden' }}>
        <div className="flex items-center" style={{ padding: '14px 20px', borderBottom: '1px solid #e1e3e5' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#202223' }}>공장 DB 현황</span>
        </div>
        <div className="flex" style={{ overflow: 'hidden' }}>
          {([
            { label: 'TOTAL', value: stats.total, highlight: false, trend: false },
            { label: 'APPROVED', value: stats.approved, highlight: false, trend: false },
            { label: 'SAMPLING', value: stats.sampling, highlight: false, trend: false },
            { label: 'AI 평균', value: stats.avgScore, highlight: false, trend: true },
            { label: 'TOP FACTORY', value: stats.topFactoryName, highlight: true, trend: false },
          ] as const).map((cell, i, arr) => (
            <div
              key={cell.label}
              className="flex flex-col flex-1"
              style={{
                padding: '10px 16px',
                gap: 3,
                borderRight: i < arr.length - 1 ? '1px solid #e1e3e5' : 'none',
                ...(cell.highlight ? { background: '#f1f8f5' } : {}),
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 500, color: '#6d7175', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {cell.label}
              </span>
              <div className="flex items-center" style={{ gap: 4 }}>
                <span style={{ fontSize: 18, fontWeight: 600, color: cell.highlight ? '#008060' : '#202223' }}>
                  {cell.value}
                </span>
                {cell.trend && (
                  <svg width="14" height="14" viewBox="0 0 20 16" fill="none" style={{ flexShrink: 0 }}>
                    <polyline points="2,14 7,8 11,11 18,4" stroke="#6d7175" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Angel Agent — 7-stage workflow panel */}
      <AngelAgentPanel />

      {/* CATEGORY SUMMARY BAR (Sassy Look / G1K) */}
      <div
        className="flex overflow-hidden"
        style={{ background: '#ffffff', border: '1px solid #e1e3e5', borderRadius: 6, boxShadow: '0 1px 0 rgba(26,26,26,0.07)', marginBottom: 16 }}>
        {([
        { label: 'Sassy Look', color: '#202223', added: 18, total: 124, vendorId: 'basic' },
        { label: 'G1K', color: '#e0387a', added: 9, total: 53, vendorId: 'trend' }] as
        const).map((cat, i, arr) =>
        <Link
          key={cat.label}
          to={`/ai-vendors/${cat.vendorId}/products`}
          className="flex flex-col justify-center flex-1 cursor-pointer transition-colors no-underline"
          style={{ padding: '10px 14px', borderRight: i < arr.length - 1 ? '1px solid #e1e3e5' : 'none' }}
          onMouseEnter={(e) => {e.currentTarget.style.background = '#f6f6f7';}}
          onMouseLeave={(e) => {e.currentTarget.style.background = 'transparent';}}>
            <span
            style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 700, color: '#ffffff', letterSpacing: 0.3, marginBottom: 6, background: cat.color, alignSelf: 'flex-start' }}>
              {cat.label}
            </span>
            <div className="flex items-baseline" style={{ gap: 3 }}>
              <span style={{ fontSize: 16, fontWeight: 500, color: '#202223' }}>{cat.added}</span>
              <span style={{ fontSize: 11, color: '#6d7175' }}>/ {cat.total}</span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 500, color: '#008060', marginTop: 2 }}>+{cat.added} 이번 달</span>
          </Link>
        )}
      </div>

      {/* VENDOR SALES LINE CHART */}
      {(() => {
        // 활성 벤더(Sassy Look, G1K)만 시뮬레이션
        const vendorList = [
          { key: 'Sassy Look', color: '#1A1A1A', base: 12800,
            curve: [0.85, 0.80, 0.75, 0.70, 0.95, 1.10, 1.00, 0.90, 1.25, 1.40, 0.70, 0.80] },
          { key: 'G1K', color: '#EC4899', base: 8000,
            curve: [0.80, 0.90, 1.00, 0.75, 0.70, 1.40, 1.10, 0.85, 1.05, 1.30, 1.50, 1.00] },
        ];
        const months: Record<string, any>[] = [];
        const monthNames = ['4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '1월', '2월', '3월'];
        for (let m = 0; m < 12; m++) {
          const row: Record<string, any> = { month: monthNames[m] };
          vendorList.forEach((v) => {
            const seasonalMultiplier = v.curve[m];
            const trend = m * (v.base * 0.015);
            const noise = (Math.sin(m * 7 + v.base) * 0.5 + 0.5) * v.base * 0.08 - v.base * 0.04;
            row[v.key] = Math.max(500, Math.round(v.base * seasonalMultiplier + trend + noise));
          });
          months.push(row);
        }
        const totalSales = vendorList.reduce((sum, v) => sum + months.reduce((s, r) => s + (r[v.key] || 0), 0), 0);
        return (
          <div style={{ background: '#ffffff', border: '1px solid #e1e3e5', borderRadius: 6, boxShadow: '0 1px 0 rgba(26,26,26,0.07)', marginBottom: 16, padding: '16px 20px' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#202223' }}>총 판매 금액</span>
                <span style={{ fontSize: 20, fontWeight: 600, color: '#202223', marginLeft: 10 }}>${totalSales.toLocaleString()}</span>
                <span style={{ fontSize: 11, color: '#6d7175', marginLeft: 6 }}>최근 1년</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={months} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6d7175' }} axisLine={{ stroke: '#e1e3e5' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6d7175' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} width={45} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e1e3e5', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name]}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {vendorList.map((v) => (
                  <Line key={v.key} type="linear" dataKey={v.key} stroke={v.color} strokeWidth={2} dot={{ r: 3, fill: v.color }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {showConfirmModal &&
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl border w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl">
            <div className="p-5 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold">상품 컨펌 — {confirmProducts.length}개 후보 상품</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">소싱가능상품에서 선별된 후보를 검토하고 등록할 상품을 선택하세요</p>
                </div>
                <button onClick={() => setShowConfirmModal(false)} className="text-muted-foreground hover:text-foreground text-xl w-8 h-8 flex items-center justify-center rounded hover:bg-muted">✕</button>
              </div>
              {/* Vendor distribution summary */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {Object.entries(getVendorCounts()).sort((a, b) => b[1] - a[1]).map(([vendor, count]) =>
              <span key={vendor} className="inline-flex items-center gap-1 text-[11px] font-bold text-white px-2 py-1 rounded"
              style={{ backgroundColor: VENDOR_COLORS[vendor] || '#666' }}>
                    {vendor} <span className="bg-white/20 rounded px-1">{count}</span>
                  </span>
              )}
                <span className="inline-flex items-center text-[11px] text-muted-foreground px-2 py-1">
                  = {confirmedItems.length}개 선택
                </span>
              </div>
            </div>
            <div className="px-4 py-3 border-b flex items-center gap-3">
              <div onClick={() => setConfirmedItems(confirmedItems.length === confirmProducts.length ? [] : confirmProducts.map((p) => p.id))}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer ${confirmedItems.length === confirmProducts.length ? 'bg-destructive border-destructive' : 'border-muted-foreground'}`}>
                {confirmedItems.length === confirmProducts.length && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-sm cursor-pointer" onClick={() => setConfirmedItems(confirmedItems.length === confirmProducts.length ? [] : confirmProducts.map((p) => p.id))}>전체 선택</span>
              <span className="text-sm text-muted-foreground ml-auto">{confirmedItems.length}개 선택됨</span>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {confirmProducts.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: '#6d7175' }}>
                  <p style={{ fontWeight: 500, marginBottom: 4, color: '#202223' }}>소싱가능상품이 없습니다</p>
                  <p style={{ fontSize: 12, color: '#8c9196' }}>AI Agent를 실행하면 소싱가능상품이 표시됩니다</p>
                </div>
              )}
              {confirmProducts.map((p) => {
              const usd = (p.yuan / 7 * 3).toFixed(2);
              const checked = confirmedItems.includes(p.id);
              const analysis = (p as any).aiAnalysis;
              return (
                <div key={p.id} onClick={() => setConfirmedItems((prev) => checked ? prev.filter((i) => i !== p.id) : [...prev, p.id])}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${checked ? 'border-destructive bg-red-50' : 'border-border hover:bg-muted/50'}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-destructive border-destructive' : 'border-muted-foreground'}`}>
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <img src={p.image} alt={p.name} className="w-14 h-14 rounded-md object-cover shrink-0 bg-muted" loading="lazy" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white" style={{ backgroundColor: p.vendorColor }}>{p.vendor}</span>
                        {analysis && (
                          <>
                            <span className="text-[9px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 font-medium flex items-center gap-0.5">
                              <Sparkles className="w-2.5 h-2.5" /> {analysis.product_type}
                            </span>
                            {analysis.is_plus_size && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-700 font-bold">PLUS</span>
                            )}
                            {analysis.pattern && analysis.pattern !== 'Solid' && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-blue-50 text-blue-600">{analysis.pattern}</span>
                            )}
                          </>
                        )}
                        <span className="text-[11px] text-muted-foreground">{p.factory}</span>
                      </div>
                      {analysis?.suggested_item_name && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">AI: {analysis.suggested_item_name}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground line-through">¥{p.yuan}</p>
                      <p className="text-sm font-bold text-destructive">${usd}</p>
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${p.score >= 80 ? 'bg-green-500' : 'bg-orange-400'}`}>{p.score}</div>
                  </div>);

            })}
            </div>
            <div className="p-4 border-t flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{confirmedItems.length}개 선택됨</span>
              <div className="flex gap-2">
                <button onClick={() => setShowConfirmModal(false)} className="px-4 py-2 border border-border rounded text-sm hover:bg-muted">취소</button>
                <button onClick={handleConfirm} disabled={confirmedItems.length === 0}
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded text-sm font-medium hover:bg-destructive/90 disabled:opacity-50">
                  선택 상품 컨펌 ({confirmedItems.length}개) →
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      {/* PUSH CONFIRM MODAL */}
      {showPushModal && (() => {
        const vendorCounts = getVendorCounts();
        const selectedProducts = confirmProducts.filter((p) => confirmedItems.includes(p.id));
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-background rounded-xl border w-full max-w-lg flex flex-col shadow-xl">
              <div className="p-5 border-b">
                <h2 className="font-bold text-lg">🚀 FashionGo 최종 Push 확인</h2>
                <p className="text-xs text-muted-foreground mt-1">아래 상품들이 FashionGo에 등록됩니다. 최종 확인 후 Push해주세요.</p>
              </div>
              <div className="p-5 space-y-4">
                {/* Vendor breakdown */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">벤더별 등록 상품 수</p>
                  <div className="space-y-1.5">
                    {Object.entries(vendorCounts).sort((a, b) => b[1] - a[1]).map(([vendor, count]) =>
                    <div key={vendor} className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-white px-2 py-0.5 rounded w-20 text-center" style={{ backgroundColor: VENDOR_COLORS[vendor] || '#666' }}>{vendor}</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${selectedProducts.length > 0 ? (count / selectedProducts.length * 100) : 0}%`, backgroundColor: VENDOR_COLORS[vendor] || '#666' }} />
                        </div>
                        <span className="text-sm font-bold w-8 text-right">{count}개</span>
                      </div>
                    )}
                  </div>
                </div>
                {/* Summary */}
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">총 상품 수</span><span className="font-bold">{selectedProducts.length}개</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">벤더 수</span><span className="font-bold">{Object.keys(vendorCounts).length}개</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">평균 스코어</span><span className="font-bold">{selectedProducts.length > 0 ? (selectedProducts.reduce((s, p) => s + p.score, 0) / selectedProducts.length).toFixed(0) : '0'}점</span></div>
                </div>
                {/* Product list preview */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">등록 상품 목록</p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {selectedProducts.map((p) =>
                    <div key={p.id} className="flex items-center gap-2 text-xs py-1.5 px-1 rounded hover:bg-muted/30">
                        <img src={p.image} alt={p.name} className="w-10 h-10 rounded object-cover shrink-0 bg-muted" loading="lazy" />
                        <span className="text-[9px] font-bold text-white px-1 py-0.5 rounded shrink-0" style={{ backgroundColor: VENDOR_COLORS[p.vendor] || '#666' }}>{p.vendor}</span>
                        <span className="truncate flex-1">{p.name}</span>
                        <span className="text-muted-foreground shrink-0">${(p.yuan / 7 * 3).toFixed(0)}</span>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${p.score >= 80 ? 'bg-green-500' : 'bg-orange-400'}`}>{p.score}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-4 border-t flex items-center justify-between">
                <button onClick={() => setShowPushModal(false)} className="px-4 py-2 border border-border rounded text-sm hover:bg-muted">취소</button>
                <button onClick={handleFinalPush} className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">
                  🚀 FashionGo Push 실행 ({selectedProducts.length}개)
                </button>
              </div>
            </div>
          </div>);

      })()}

      <FGDataConvertDialog
        open={showFGConvert}
        onClose={handleFGConvertClose}
        onProceed={handleFGConvertProceed}
        products={(() => {
          // Only pass confirmed products with their assigned vendor info
          const confirmed = confirmProducts.filter(p => confirmedItems.includes(p.id));
          return confirmed.map(p => {
            const sp = sourceableProducts.find(s => s.id === p.id);
            return {
              ...(sp || {}),
              id: p.id,
              item_name: (p as any).aiAnalysis?.suggested_item_name || sp?.item_name || p.name,
              vendor_name: p.vendor,
              category: (p as any).aiAnalysis?.suggested_category || sp?.category || sp?.fg_category || '',
              price: sp?.price || p.yuan,
              material: (p as any).aiAnalysis?.material_guess || sp?.material || '',
              color_size: (p as any).aiAnalysis?.color || sp?.color_size || '',
              weight_kg: sp?.weight_kg || null,
              image_url: sp?.image_url || p.image,
              product_no: sp?.product_no || sp?.style_no || '',
              ai_analysis: (p as any).aiAnalysis || null,
            } as any;
          });
        })()}
      />

    </div>);

};

export default Dashboard;