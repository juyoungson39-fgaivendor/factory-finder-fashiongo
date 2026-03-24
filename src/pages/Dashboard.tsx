import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Plus, Download, Loader2, Check } from 'lucide-react';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useProducts } from '@/integrations/va-api/hooks/use-products';
import { AI_VENDORS, ALL_WHOLESALER_IDS } from '@/integrations/va-api/vendor-config';
import ProductConfirmCard, { type FashionGoData, type ChangeLogEntry } from '@/components/agent/ProductConfirmCard';
import ProductLogTimeline, { type ProductLogEntry } from '@/components/agent/ProductLogTimeline';
import { generateRecommendationLogs, generateEditLog, generatePushQueuedLog, generatePushConfirmedLog, generatePushCompletedLog } from '@/lib/productLogHelpers';




const FALLBACK_FACTORIES = [
{ id: 'fb000001-0000-0000-0000-000000000001', name: 'C&S Fashion', country: 'China', city: 'Guangzhou', source_platform: '1688', main_products: ['Dresses', 'Tops', 'Activewear'], status: 'approved', overall_score: 88, created_at: new Date().toISOString() },
{ id: 'fb000001-0000-0000-0000-000000000002', name: 'Unity Mode', country: 'China', city: 'Guangzhou', source_platform: '1688', main_products: ['Skirts', 'Knitwear', 'T-Shirts'], status: 'approved', overall_score: 85, created_at: new Date().toISOString() },
{ id: 'fb000001-0000-0000-0000-000000000003', name: 'Fengjue Fashion', country: 'China', city: 'Guangzhou', source_platform: '1688', main_products: ['Dresses', 'Blouses', 'Sets'], status: 'approved', overall_score: 82, created_at: new Date().toISOString() },
{ id: 'fb000001-0000-0000-0000-000000000004', name: 'Youthmi', country: 'China', city: 'Liaoning', source_platform: 'ALIBABA', main_products: ['Sets', 'Dresses', 'Swimwear'], status: 'sampling', overall_score: 79, created_at: new Date().toISOString() },
{ id: 'fb000001-0000-0000-0000-000000000005', name: 'Chengni Fashion', country: 'China', city: 'Guangzhou', source_platform: '1688', main_products: ['Plus Size Dresses', 'Tops'], status: 'approved', overall_score: 78, created_at: new Date().toISOString() },
{ id: 'fb000001-0000-0000-0000-000000000006', name: 'Aiyouya Fashion', country: 'China', city: 'Guangzhou', source_platform: '1688', main_products: ['Dresses', 'Jumpsuits'], status: 'sampling', overall_score: 75, created_at: new Date().toISOString() },
{ id: 'fb000001-0000-0000-0000-000000000007', name: 'LSYS Fashion', country: 'China', city: 'Guangzhou', source_platform: '1688', main_products: ["Women's Apparel", "Tops"], status: 'new', overall_score: 72, created_at: new Date().toISOString() },
{ id: 'fb000001-0000-0000-0000-000000000008', name: 'Yuchen Tongguang', country: 'China', city: 'Dongguan', source_platform: '1688', main_products: ['Dresses', 'Sets', 'Pants'], status: 'new', overall_score: 62, created_at: new Date().toISOString() },
{ id: 'fb000001-0000-0000-0000-000000000009', name: 'Leqi Fashion', country: 'China', city: 'Shenzhen', source_platform: '1688', main_products: ['Dresses', 'Tops', 'Basics'], status: 'new', overall_score: 68, created_at: new Date().toISOString() }];


const CONFIRM_PRODUCTS = [
  { id: 1, name: 'Smocked Halter Maxi Dress', vendor: 'BASIC', vendorColor: '#1A1A1A', factory: 'C&S Fashion', yuan: 126, score: 88, image: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=120&h=120&fit=crop', styleNo: 'FG-BASIC-202603-4821', msrp: 108, category: 'Dresses', season: 'All Season', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.5 lb', aiDesc: 'Elegant smocked halter maxi dress with flowing silhouette, perfect for casual and semi-formal occasions.', factoryScore: 85, platform: '1688', originalName: '吊带连衣裙女夏季褶皱长裙', sourceUrl: 'https://detail.1688.com/offer/example1.html', moq: '100pcs', leadTime: '15-25 days' },
  { id: 2, name: 'Easy Flow Wide Leg Denim Pants', vendor: 'DENIM', vendorColor: '#1E3A5F', factory: 'Leqi Fashion', yuan: 154, score: 85, image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=120&h=120&fit=crop', styleNo: 'FG-DENIM-202603-3912', msrp: 132, category: 'Pants & Jeans', season: 'All Season', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.8 lb', aiDesc: 'Relaxed wide-leg denim pants with comfortable elastic waistband.', factoryScore: 82, platform: '1688', originalName: '宽松阔腿牛仔裤女高腰', sourceUrl: 'https://detail.1688.com/offer/example2.html', moq: '200pcs', leadTime: '20-30 days' },
  { id: 3, name: '100% Linen Wide Leg Trousers', vendor: 'BASIC', vendorColor: '#1A1A1A', factory: 'Fengjue Fashion', yuan: 158, score: 82, image: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=120&h=120&fit=crop', styleNo: 'FG-BASIC-202603-5543', msrp: 136, category: 'Pants & Jeans', season: 'Spring/Summer', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.4 lb', aiDesc: 'Premium 100% linen wide-leg trousers with breathable fabric.', factoryScore: 78, platform: '1688', originalName: '亚麻阔腿裤女夏季薄款', sourceUrl: 'https://detail.1688.com/offer/example3.html', moq: '150pcs', leadTime: '15-20 days' },
  { id: 4, name: 'Reversible Ribbed Tank Top', vendor: 'BASIC', vendorColor: '#1A1A1A', factory: 'C&S Fashion', yuan: 84, score: 88, image: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=120&h=120&fit=crop', styleNo: 'FG-BASIC-202603-2210', msrp: 72, category: 'Tops', season: 'All Season', madeIn: 'China', pack: 'Open-pack', minQty: 12, weight: '0.2 lb', aiDesc: 'Versatile reversible ribbed tank top with flattering fit.', factoryScore: 85, platform: '1688', originalName: '双面穿螺纹背心女修身', sourceUrl: 'https://detail.1688.com/offer/example4.html', moq: '100pcs', leadTime: '10-15 days' },
  { id: 5, name: 'Graphic Fleece Pullover Sweatshirt', vendor: 'TREND', vendorColor: '#EC4899', factory: 'Unity Mode', yuan: 112, score: 79, image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=120&h=120&fit=crop', styleNo: 'FG-TREND-202603-7788', msrp: 96, category: 'Tops', season: 'Fall/Winter', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.6 lb', aiDesc: 'Trendy graphic fleece pullover with oversized fit and bold print.', factoryScore: 74, platform: '1688', originalName: '卫衣女秋冬加绒印花宽松', sourceUrl: 'https://detail.1688.com/offer/example5.html', moq: '100pcs', leadTime: '15-25 days' },
  { id: 6, name: 'Crochet Button Down Shorts Set', vendor: 'VACATION', vendorColor: '#F59E0B', factory: 'Youthmi', yuan: 196, score: 82, image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=120&h=120&fit=crop', styleNo: 'FG-VACA-202603-6634', msrp: 168, category: 'Sets', season: 'Spring/Summer', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.4 lb', aiDesc: 'Hand-crafted crochet button-down top and shorts set for resort wear.', factoryScore: 80, platform: '1688', originalName: '镂空针织套装女短裤两件套', sourceUrl: 'https://detail.1688.com/offer/example6.html', moq: '100pcs', leadTime: '20-30 days' },
  { id: 7, name: 'Floral Chiffon Tiered Maxi Dress', vendor: 'BASIC', vendorColor: '#1A1A1A', factory: 'C&S Fashion', yuan: 168, score: 85, image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=120&h=120&fit=crop', styleNo: 'FG-BASIC-202603-1199', msrp: 144, category: 'Dresses', season: 'Spring/Summer', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.4 lb', aiDesc: 'Romantic floral chiffon maxi dress with tiered skirt.', factoryScore: 85, platform: '1688', originalName: '碎花雪纺连衣裙女夏季长裙', sourceUrl: 'https://detail.1688.com/offer/example7.html', moq: '100pcs', leadTime: '15-25 days' },
  { id: 8, name: 'Back Lace Up Mermaid Evening Dress', vendor: 'FESTIVAL', vendorColor: '#7C3AED', factory: 'Chengni Fashion', yuan: 224, score: 76, image: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=120&h=120&fit=crop', styleNo: 'FG-FEST-202603-8845', msrp: 192, category: 'Dresses', season: 'All Season', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.6 lb', aiDesc: 'Stunning back lace-up evening dress with elegant silhouette.', factoryScore: 72, platform: '1688', originalName: '晚礼服后背绑带连衣裙', sourceUrl: 'https://detail.1688.com/offer/example8.html', moq: '50pcs', leadTime: '25-35 days' },
  { id: 9, name: 'Sunny Days Bikini Set', vendor: 'VACATION', vendorColor: '#F59E0B', factory: 'Youthmi', yuan: 98, score: 79, image: 'https://images.unsplash.com/photo-1570976447640-ac859083963f?w=120&h=120&fit=crop', styleNo: 'FG-VACA-202603-3321', msrp: 84, category: 'Swimwear', season: 'Spring/Summer', madeIn: 'China', pack: 'Open-pack', minQty: 12, weight: '0.2 lb', aiDesc: 'Cheerful bikini set with vibrant patterns and adjustable straps.', factoryScore: 80, platform: '1688', originalName: '比基尼泳衣女分体', sourceUrl: 'https://detail.1688.com/offer/example9.html', moq: '200pcs', leadTime: '10-20 days' },
  { id: 10, name: 'Graphic Fleece Pullover', vendor: 'TREND', vendorColor: '#EC4899', factory: 'Unity Mode', yuan: 140, score: 82, image: 'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?w=120&h=120&fit=crop', styleNo: 'FG-TREND-202603-7790', msrp: 120, category: 'Tops', season: 'Fall/Winter', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.7 lb', aiDesc: 'Premium graphic fleece pullover with detailed embroidery.', factoryScore: 74, platform: '1688', originalName: '卫衣女秋冬刺绣加绒', sourceUrl: 'https://detail.1688.com/offer/example10.html', moq: '100pcs', leadTime: '15-25 days' },
  { id: 11, name: 'Activewear 3Pcs Sports Set', vendor: 'TREND', vendorColor: '#EC4899', factory: 'Fengjue Fashion', yuan: 182, score: 75, image: 'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?w=120&h=120&fit=crop', styleNo: 'FG-TREND-202603-9901', msrp: 156, category: 'Activewear', season: 'All Season', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.6 lb', aiDesc: 'Complete 3-piece activewear set including sports bra, jacket, and leggings.', factoryScore: 78, platform: '1688', originalName: '运动套装女三件套瑜伽服', sourceUrl: 'https://detail.1688.com/offer/example11.html', moq: '100pcs', leadTime: '15-25 days' },
  { id: 12, name: 'Coastal Stripe Smocked Jumpsuit', vendor: 'VACATION', vendorColor: '#F59E0B', factory: 'Youthmi', yuan: 168, score: 76, image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=120&h=120&fit=crop', styleNo: 'FG-VACA-202603-4456', msrp: 144, category: 'Jumpsuits', season: 'Spring/Summer', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.5 lb', aiDesc: 'Breezy coastal-inspired striped jumpsuit with smocked bodice.', factoryScore: 80, platform: '1688', originalName: '条纹连体裤女夏季阔腿', sourceUrl: 'https://detail.1688.com/offer/example12.html', moq: '100pcs', leadTime: '20-30 days' },
];


type AgentStatus = 'idle' | 'running' | 'waiting' | 'push-confirm' | 'complete';

const VENDOR_COLORS: Record<string, string> = {
  BASIC: '#1A1A1A', DENIM: '#1E3A5F', VACATION: '#F59E0B',
  FESTIVAL: '#7C3AED', TREND: '#EC4899', CURVE: '#D60000'
};

const Dashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [starredVendors, setStarredVendors] = useState<Set<string>>(() => new Set());

  const [agentBarOpen, setAgentBarOpen] = useState(true);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [lastRunAt, setLastRunAt] = useState<string>('2026-03-22 06:00:00');
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [stepBadges, setStepBadges] = useState<string[]>(['', '', '', '', '', '']);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);
  const [confirmedItems, setConfirmedItems] = useState<number[]>(CONFIRM_PRODUCTS.map((p) => p.id));
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);
  const [fgOverrides, setFgOverrides] = useState<Record<number, Partial<FashionGoData>>>({});
  const [changeLogs, setChangeLogs] = useState<ChangeLogEntry[]>([]);
  const [productLogs, setProductLogs] = useState<ProductLogEntry[]>([]);

  const handleSaveFgData = useCallback((productId: number, data: Partial<FashionGoData>) => {
    setFgOverrides((prev) => {
      if (Object.keys(data).length === 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: data };
    });
  }, []);

  const handleAddChangeLogs = useCallback((logs: ChangeLogEntry[]) => {
    setChangeLogs((prev) => [...prev, ...logs]);
  }, []);

  // VA API: fetch real products for confirm modal
  const { data: vaProductsData } = useProducts({
    wholesalerId: ALL_WHOLESALER_IDS[0],
    active: true,
    size: 12,
  });

  const confirmProducts = useMemo(() => {
    if (!vaProductsData?.items?.length) return CONFIRM_PRODUCTS;
    return vaProductsData.items.slice(0, 12).map((item, idx) => {
      const vendor = AI_VENDORS[idx % AI_VENDORS.length];
      return {
        id: item.productId,
        name: item.itemName,
        vendor: vendor.name,
        vendorColor: vendor.color,
        factory: '-',
        yuan: Math.round(item.unitPrice * 7),
        score: 80 + (item.productId % 15),
        image: item.imageUrl || 'https://placehold.co/120x120?text=No+Image',
      };
    });
  }, [vaProductsData]);

  // Sync confirmedItems when VA API products arrive
  useEffect(() => {
    if (vaProductsData?.items?.length) {
      setConfirmedItems(confirmProducts.map((p) => p.id));
    }
  }, [confirmProducts]);

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

  const factories = rawFactories && rawFactories.length > 0 ? rawFactories : FALLBACK_FACTORIES;

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

  const stats = {
    total: factories.length,
    approved: factories.filter((f) => f.status === 'approved').length,
    sampling: factories.filter((f) => f.status === 'sampling').length,
    avgScore: factories.length ?
    (factories.reduce((sum, f) => sum + (f.overall_score ?? 0), 0) / factories.length).toFixed(1) :
    '0',
    topVendors: factories.filter((f) => starredVendors.has(f.id) || (f.overall_score ?? 0) >= 80).length
  };

  const isTopVendor = (id: string, score: number) => starredVendors.has(id) || score >= 80;

  const toggleStar = (id: string) => {
    setStarredVendors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);else next.add(id);
      return next;
    });
  };

  const handleAgentRun = () => {
    setAgentStatus('running');
    setCurrentStep(1);
    setCompletedSteps([]);
    setStepBadges(['', '', '', '', '', '']);
    setTimeout(() => {
      setCompletedSteps([1]);
      setStepBadges((prev) => {const b = [...prev];b[0] = '100개';return b;});
      setCurrentStep(2);
      setTimeout(() => {
        setCompletedSteps([1, 2]);
        setStepBadges((prev) => {const b = [...prev];b[1] = '9개';return b;});
        setCurrentStep(3);
        // Step 3: 벤더 배분 (auto)
        setTimeout(() => {
          setCompletedSteps([1, 2, 3]);
          setStepBadges((prev) => {const b = [...prev];b[2] = '6벤더';return b;});
          setCurrentStep(4);
          // Step 4: 상품 컨펌 (human)
          setAgentStatus('waiting');
          setTimeout(() => {
            setStepBadges((prev) => {const b = [...prev];b[3] = '12개';return b;});
            setShowConfirmModal(true);
          }, 1000);
        }, 2500);
      }, 2500);
    }, 2500);
  };

  const handleConfirm = () => {
    setShowConfirmModal(false);
    setCompletedSteps([1, 2, 3, 4]);
    setStepBadges((prev) => {const b = [...prev];b[3] = `${confirmedItems.length}개`;return b;});
    setCurrentStep(5);
    setAgentStatus('running');
    setTimeout(() => {
      setCompletedSteps([1, 2, 3, 4, 5]);
      setStepBadges((prev) => {const b = [...prev];b[4] = `${confirmedItems.length}개`;return b;});
      setCurrentStep(6);
      setTimeout(() => {
        setStepBadges((prev) => {const b = [...prev];b[5] = `${confirmedItems.length}개`;return b;});
        setAgentStatus('push-confirm');
        setShowPushModal(true);
      }, 2500);
    }, 1875);
  };

  const handleFinalPush = () => {
    setShowPushModal(false);
    setCompletedSteps([1, 2, 3, 4, 5, 6]);
    setCurrentStep(0);
    setAgentStatus('complete');
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setLastRunAt(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
    toast({ title: `✅ Angel Agent 사이클 완료`, description: `${confirmedItems.length}개 상품이 FashionGo에 등록되었습니다` });
  };

  const handleReset = () => {
    setAgentStatus('idle');
    setCurrentStep(0);
    setCompletedSteps([]);
    setStepBadges(['', '', '', '', '', '']);
    setConfirmedItems(confirmProducts.map((p) => p.id));
  };

  const STEPS = ['트렌드 분석', '공장 매칭', '벤더 배분', '상품 컨펌', '정보 완성', 'FG 등록'];



  const getState = (i: number) => {
    const n = i + 1;
    if (completedSteps.includes(n)) return 'done';
    if (currentStep === n) return 'current';
    return 'idle';
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

      {/* ALERT BANNER */}
      <div
        className="flex items-start"
        style={{ gap: 10, background: '#f2f7fe', border: '1px solid #c9d9f4', borderRadius: 4, padding: '10px 14px', marginBottom: 16 }}>
        
        <svg width="16" height="16" viewBox="0 0 20 20" fill="#2c6ecb" className="shrink-0" style={{ marginTop: 1 }}>
          <path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2zm0 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm1 9H9V9h2v5z" />
        </svg>
        <p style={{ fontSize: 12, color: '#2c6ecb' }}>
          <span style={{ fontWeight: 500 }}>AI 에이전트 대기 중.</span>
          <span style={{ fontWeight: 400 }}> 다음 자동 실행: 월요일 06:00 · 에이전트 패널에서 실행할 수 있습니다.</span>
        </p>
      </div>

      {/* CATEGORY SUMMARY BAR */}
      <div
        className="flex overflow-hidden"
        style={{ background: '#ffffff', border: '1px solid #e1e3e5', borderRadius: 6, boxShadow: '0 1px 0 rgba(26,26,26,0.07)', marginBottom: 16 }}>
        
        {([
        { label: 'BASIC', color: '#202223', added: 18, total: 124 },
        { label: 'DENIM', color: '#1c3d7a', added: 6, total: 42 },
        { label: 'VACATION', color: '#e88c00', added: 12, total: 67 },
        { label: 'FESTIVAL', color: '#6c3db5', added: 4, total: 31 },
        { label: 'TREND', color: '#e0387a', added: 9, total: 53 },
        { label: 'CURVE', color: '#d42020', added: 7, total: 38 }] as
        const).map((cat, i, arr) =>
        <div
          key={cat.label}
          className="flex flex-col justify-center flex-1 cursor-pointer transition-colors"
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
          </div>
        )}
      </div>

      {/* ANGEL AGENT CARD */}
      <div style={{ background: '#ffffff', border: '1px solid #e1e3e5', borderRadius: 6, boxShadow: '0 1px 0 rgba(26,26,26,0.07)', marginBottom: 16, overflow: 'hidden' }}>
        {/* Header */}
        <div className="flex items-center" style={{ background: '#202223', padding: '10px 20px', gap: 8 }}>
          <span className="shrink-0" style={{ width: 7, height: 7, borderRadius: '50%', background: agentStatus === 'running' ? '#ffc453' : agentStatus === 'waiting' || agentStatus === 'push-confirm' ? '#ffc453' : agentStatus === 'complete' ? '#008060' : '#8c9196' }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: '#ffffff' }}>Angel Agent</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginLeft: 2 }}>{badge.text}</span>
          <div className="ml-auto flex items-center" style={{ gap: 6 }}>
            {(agentStatus === 'idle' || agentStatus === 'complete') &&
            <button
              onClick={handleAgentRun}
              className="transition-colors"
              style={{ background: '#ffffff', color: '#202223', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
              onMouseEnter={(e) => {e.currentTarget.style.background = '#e4e5e7';}}
              onMouseLeave={(e) => {e.currentTarget.style.background = '#ffffff';}}
              onMouseDown={(e) => {e.currentTarget.style.background = '#d2d5d8';}}
              onMouseUp={(e) => {e.currentTarget.style.background = '#e4e5e7';}}>
              
                실행하기
              </button>
            }
            {agentStatus === 'waiting' &&
            <button
              onClick={() => setShowConfirmModal(true)}
              className="transition-colors"
              style={{ background: '#ffc453', color: '#202223', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              
                📋 컨펌 필요
              </button>
            }
            {agentStatus === 'push-confirm' &&
            <button
              onClick={() => setShowPushModal(true)}
              className="transition-colors"
              style={{ background: '#4d7cf3', color: '#ffffff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              
                🚀 Push 확인
              </button>
            }
            {agentStatus === 'running' &&
            <button
              disabled
              className="flex items-center"
              style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 12, fontWeight: 500, gap: 4 }}>
              
                <Loader2 className="w-3 h-3 animate-spin" /> 실행중...
              </button>
            }
            {agentStatus === 'complete' &&
            <button
              onClick={handleReset}
              className="transition-colors"
              style={{ background: 'transparent', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, padding: '5px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              
                초기화
              </button>
            }
            <button
              onClick={() => setAgentBarOpen(!agentBarOpen)}
              style={{ background: 'transparent', color: 'rgba(255,255,255,0.45)', border: 'none', fontSize: 12, cursor: 'pointer', padding: '5px 8px' }}>
              
              {agentBarOpen ? '∧' : '∨'}
            </button>
          </div>
        </div>
        {/* Body — 6-step flow */}
        {agentBarOpen &&
        <>
            <div className="flex items-start" style={{ padding: '16px 20px' }}>
              {STEPS.map((name, i) => {
              const state = getState(i);
              const isDone = state === 'done';
              const isCurrent = state === 'current';
              return (
                <div key={i} className="contents">
                    <div className="flex flex-col items-center flex-1" style={{ gap: 4 }}>
                      <div className="flex items-center justify-center" style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: isDone ? '#d72c0d' : isCurrent ? '#e88c00' : '#f6f6f7',
                      border: isDone || isCurrent ? 'none' : '1px solid #e1e3e5',
                      color: isDone || isCurrent ? '#ffffff' : '#8c9196',
                      fontSize: 11, fontWeight: 500
                    }}>
                        {isDone ? <Check className="w-3.5 h-3.5" /> : isCurrent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : i + 1}
                      </div>
                      <span style={{ fontSize: 10, color: isDone ? '#d72c0d' : isCurrent ? '#e88c00' : '#6d7175', textAlign: 'center', lineHeight: 1.3, fontWeight: isDone || isCurrent ? 500 : 400 }}>{name}</span>
                      {stepBadges[i] ?
                    <span style={{ fontSize: 9, color: isDone ? '#d72c0d' : isCurrent ? '#e88c00' : '#8c9196', fontWeight: 500 }}>{stepBadges[i]}</span> :

                    <span style={{ fontSize: 9, color: '#8c9196' }}>
                          {isDone ? '완료' : isCurrent ? i === 3 ? '컨펌 대기' : '처리중...' : '대기'}
                        </span>
                    }
                    </div>
                    {i < 5 && <div className="shrink-0" style={{ height: 1, flex: '0 0 16px', background: isDone ? '#d72c0d' : '#e1e3e5', marginTop: 14 }} />}
                  </div>);

            })}
            </div>
            {/* Footer */}
            <div className="flex items-center" style={{ borderTop: '1px solid #e1e3e5', padding: '10px 20px', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#6d7175', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace' }}>{lastRunAt}</span>
              {agentStatus === 'complete' ?
            <span style={{ background: '#f1f8f5', color: '#008060', fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 500 }}>성공</span> :
            agentStatus === 'running' || agentStatus === 'waiting' || agentStatus === 'push-confirm' ?
            <span style={{ background: '#fff7e0', color: '#8a6d00', fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 500 }}>진행중</span> :

            <span style={{ background: '#f6f6f7', color: '#8c9196', fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 500 }}>대기</span>
            }
              <div className="ml-auto">
                {agentStatus === 'waiting' &&
              <button
                onClick={() => setShowConfirmModal(true)}
                style={{ background: 'none', border: 'none', fontSize: 12, color: '#2c6ecb', fontWeight: 500, cursor: 'pointer' }}>
                
                    📋 {stepBadges[3] || '12'}개 상품 확인하기 →
                  </button>
              }
                {agentStatus === 'push-confirm' &&
              <button
                onClick={() => setShowPushModal(true)}
                style={{ background: 'none', border: 'none', fontSize: 12, color: '#2c6ecb', fontWeight: 500, cursor: 'pointer' }}>
                
                    🚀 FashionGo Push 최종 확인 →
                  </button>
              }
                {agentStatus === 'complete' &&
              <span className="flex items-center" style={{ gap: 6 }}>
                <span style={{ background: '#f1f8f5', color: '#008060', fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 500 }}>성공</span>
                <span style={{ fontSize: 12, color: '#008060', fontWeight: 500 }}>{confirmedItems.length}개 상품 등록 성공</span>
              </span>
              }
              </div>
            </div>
          </>
        }
      </div>

      {/* SALES CHART CARD */}
      {(() => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const fmtDate = (d: Date) => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
        const pts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const cw = 100;
        const ch = 88;
        const cstep = cw / (pts.length - 1);
        const linePath = pts.map((y, idx) => `${idx === 0 ? 'M' : 'L'}${(idx * cstep).toFixed(1)},${(ch - y).toFixed(1)}`).join(' ');
        return (
          <div style={{ background: '#ffffff', border: '1px solid #e1e3e5', borderRadius: 6, boxShadow: '0 1px 0 rgba(26,26,26,0.07)', marginBottom: 16, width: '100%' }}>
            <div className="flex items-center justify-between" style={{ padding: '14px 20px', borderBottom: '1px solid #e1e3e5' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#202223' }}>총 판매금액 </span>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 20, fontWeight: 500, color: '#202223', marginBottom: 12 }}>₩0</div>
              <svg width="100%" height={ch} viewBox={`0 0 ${cw} ${ch}`} preserveAspectRatio="none" style={{ display: 'block' }}>
                <line x1="0" y1={ch} x2={cw} y2={ch} stroke="#e1e3e5" strokeWidth="0.5" />
                <path d={linePath} fill="none" stroke="#008060" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="flex items-center" style={{ gap: 16, marginTop: 8 }}>
                <div className="flex items-center" style={{ gap: 5 }}>
                  <div style={{ width: 18, height: 2, background: '#008060', borderRadius: 1 }} />
                  <span style={{ fontSize: 11, color: '#6d7175' }}>{fmtDate(today)}</span>
                </div>
                <div className="flex items-center" style={{ gap: 5 }}>
                  <div style={{ width: 18, height: 2, background: '#e1e3e5', borderRadius: 1 }} />
                  <span style={{ fontSize: 11, color: '#6d7175' }}>{fmtDate(yesterday)}</span>
                </div>
              </div>
            </div>
          </div>);

      })()}


      {showConfirmModal &&
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl border w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl">
            <div className="p-5 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold">상품 컨펌 — 12개 후보 상품</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">AI가 선별한 후보 상품을 검토하고 등록할 상품을 선택하세요</p>
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
              {confirmProducts.map((p) => (
                <ProductConfirmCard
                  key={p.id}
                  product={p as any}
                  checked={confirmedItems.includes(p.id)}
                  isExpanded={expandedProduct === p.id}
                  onToggleCheck={() => setConfirmedItems((prev) => prev.includes(p.id) ? prev.filter((i) => i !== p.id) : [...prev, p.id])}
                  onToggleExpand={() => setExpandedProduct(expandedProduct === p.id ? null : p.id)}
                  fgOverrides={fgOverrides}
                  onSaveFgData={handleSaveFgData}
                  changeLogs={changeLogs}
                  onAddChangeLogs={handleAddChangeLogs}
                />
              ))}
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
                          <div className="h-full rounded-full" style={{ width: `${count / selectedProducts.length * 100}%`, backgroundColor: VENDOR_COLORS[vendor] || '#666' }} />
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
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">평균 스코어</span><span className="font-bold">{(selectedProducts.reduce((s, p) => s + p.score, 0) / selectedProducts.length).toFixed(0)}점</span></div>
                </div>
                {/* Product list preview */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">등록 상품 목록</p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {selectedProducts.map((p) => {
                      const hasFactory = !!(p as any).factory && (p as any).factory !== '-';
                      return (
                        <div key={p.id} className="space-y-0.5">
                          <div className="flex items-center gap-2 text-xs py-1.5 px-1 rounded hover:bg-muted/30">
                            <img src={p.image} alt={p.name} className="w-10 h-10 rounded object-cover shrink-0 bg-muted" loading="lazy" />
                            <span className="text-[9px] font-bold text-white px-1 py-0.5 rounded shrink-0" style={{ backgroundColor: VENDOR_COLORS[p.vendor] || '#666' }}>{p.vendor}</span>
                            <span className="truncate flex-1">{p.name}</span>
                            <span className="text-muted-foreground shrink-0">${(p.yuan / 7 * 3).toFixed(0)}</span>
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${p.score >= 80 ? 'bg-green-500' : 'bg-orange-400'}`}>{p.score}</span>
                          </div>
                          {!hasFactory && (
                            <div className="ml-12 text-[10px] text-warning flex items-center gap-1 bg-warning/10 px-2 py-1 rounded">
                              ⚠️ 원본 공장 정보가 연결되지 않았습니다
                            </div>
                          )}
                        </div>
                      );
                    })}
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

      {/* ANGEL SECTION */}
      <div style={{ background: '#ffffff', border: '1px solid #e1e3e5', borderRadius: 6, boxShadow: '0 1px 0 rgba(26,26,26,0.07)', marginBottom: 16, overflow: 'hidden' }}>
        {/* Section Header */}
        <div className="flex items-center justify-between" style={{ padding: '14px 20px', borderBottom: '1px solid #e1e3e5', gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#202223' }}>공장 목록 </span>
          <div className="flex items-center" style={{ gap: 8 }}>
            <button
              className="inline-flex items-center transition-colors"
              style={{ background: '#ffffff', border: '1px solid #e1e3e5', borderRadius: 4, color: '#202223', fontSize: 12, fontWeight: 500, padding: '5px 10px', gap: 6, cursor: 'pointer' }}
              onMouseEnter={(e) => {e.currentTarget.style.background = '#f1f2f3';}}
              onMouseLeave={(e) => {e.currentTarget.style.background = '#ffffff';}}
              onClick={() => {
                const headers = ['name', 'country', 'city', 'source_platform', 'source_url', 'main_products', 'moq', 'lead_time', 'status', 'overall_score', 'contact_name', 'contact_email', 'contact_phone'];
                const rows = factories.map((f) => headers.map((h) => {const val = (f as any)[h];if (Array.isArray(val)) return `"${val.join(', ')}"`;if (val === null || val === undefined) return '';return `"${String(val).replace(/"/g, '""')}"`;}).join(','));
                const csv = [headers.join(','), ...rows].join('\n');
                const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');link.href = URL.createObjectURL(blob);link.download = `vendors_${new Date().toISOString().slice(0, 10)}.csv`;link.click();
              }}>
              
              <Download size={13} />
              CSV
            </button>
            <Link to="/factories/new">
              <button
                className="inline-flex items-center transition-colors"
                style={{ background: '#202223', border: '1px solid #202223', borderRadius: 4, color: '#ffffff', fontSize: 12, fontWeight: 500, padding: '5px 10px', gap: 6, cursor: 'pointer' }}
                onMouseEnter={(e) => {e.currentTarget.style.background = '#303030';}}
                onMouseLeave={(e) => {e.currentTarget.style.background = '#202223';}}>
                
                <Plus size={13} />
                Add Vendor
              </button>
            </Link>
          </div>
        </div>

      {/* KPI INLINE BAR */}
      <div className="flex" style={{ borderBottom: '1px solid #e1e3e5', overflow: 'hidden' }}>
        {([
          { label: 'TOTAL', value: stats.total, highlight: false, trend: false },
          { label: 'APPROVED', value: stats.approved, highlight: false, trend: false },
          { label: 'SAMPLING', value: stats.sampling, highlight: false, trend: false },
          { label: 'AVG SCORE', value: stats.avgScore, highlight: false, trend: true },
          { label: 'TOP FACTORY', value: stats.topVendors, highlight: true, trend: false }] as
          const).map((cell, i, arr) =>
          <div
            key={cell.label}
            className="flex flex-col flex-1"
            style={{
              padding: '10px 16px',
              gap: 3,
              borderRight: i < arr.length - 1 ? '1px solid #e1e3e5' : 'none',
              ...(cell.highlight ? { background: '#f1f8f5' } : {})
            }}>
            
            <span style={{ fontSize: 10, fontWeight: 500, color: '#6d7175', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {cell.label}
            </span>
            <div className="flex items-center" style={{ gap: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 600, color: cell.highlight ? '#008060' : '#202223' }}>
                {cell.value}
              </span>
              {cell.trend &&
              <svg width="14" height="14" viewBox="0 0 20 16" fill="none" style={{ flexShrink: 0 }}>
                  <polyline points="2,14 7,8 11,11 18,4" stroke="#6d7175" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
            </div>
          </div>
          )}
      </div>

      {/* FILTERS */}
       <div style={{ padding: '12px 20px', borderBottom: '1px solid #e1e3e5' }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <div style={{ flex: 1, maxWidth: 280, position: 'relative' }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="#6d7175" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
              <path d="M8.5 3a5.5 5.5 0 1 0 3.54 9.75l3.36 3.36 1.06-1.06-3.36-3.36A5.5 5.5 0 0 0 8.5 3zM8.5 4.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />
            </svg>
            <input
                type="text"
                placeholder="Search vendors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', padding: '7px 10px 7px 32px', border: '1px solid #e1e3e5', borderRadius: 6, fontSize: 13, color: '#202223', background: '#fff', outline: 'none' }} />
          </div>
          <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid #e1e3e5', borderRadius: 6, fontSize: 13, color: '#202223', background: '#ffffff', minWidth: 110 }}>
            <option value="all">All Status</option>
            <option value="approved">Approved</option>
            <option value="sampling">Sampling</option>
            <option value="new">Pending</option>
          </select>
          <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid #e1e3e5', borderRadius: 6, fontSize: 13, color: '#202223', background: '#ffffff', minWidth: 110 }}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="score">Score High</option>
            <option value="score-asc">Score Low</option>
          </select>
          <div className="flex items-center" style={{ gap: 6, marginLeft: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#6d7175', textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0 }}>Score</span>
            <input
                type="range"
                min={0}
                max={100}
                value={scoreRange[0]}
                onChange={(e) => {setScoreRange([Number(e.target.value), scoreRange[1]]);}}
                style={{ width: 100, accentColor: '#202223', cursor: 'pointer' }} />
            <span style={{ fontSize: 12, color: '#6d7175', flexShrink: 0 }}>{scoreRange[0]}–{scoreRange[1]}</span>
          </div>
          <span style={{ fontSize: 12, color: '#6d7175', flexShrink: 0, marginLeft: 'auto' }}>({filtered.length})</span>
        </div>
      </div>

      {/* TABLE */}
      {isLoading ?
        <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 13, color: '#6d7175' }}>Loading...</div> :
        filtered.length === 0 ?
        <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 13, color: '#6d7175' }}>
          <p style={{ fontWeight: 500, marginBottom: 4 }}>No vendors found</p>
          <p style={{ fontSize: 12, color: '#8c9196' }}>{factories.length > 0 ? 'Try adjusting your filters' : 'Add your first factory to get started'}</p>
        </div> :

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f6f6f7', borderBottom: '1px solid #e1e3e5' }}>
              <th style={{ width: 32, padding: '10px 12px' }} />
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6d7175', textTransform: 'uppercase', letterSpacing: 0.3 }}>FACTORY</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6d7175', textTransform: 'uppercase', letterSpacing: 0.3 }}>Platform</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6d7175', textTransform: 'uppercase', letterSpacing: 0.3 }}>Products</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6d7175', textTransform: 'uppercase', letterSpacing: 0.3 }}>Status</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6d7175', textTransform: 'uppercase', letterSpacing: 0.3 }}>Score</th>
              <th style={{ padding: '10px 12px' }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((factory, idx) => {
              const score = factory.overall_score ?? 0;
              const isTop = isTopVendor(factory.id, score);
              const platform = (factory as any).source_platform || '';
              const statusVal = factory.status ?? 'new';
              const statusMap: Record<string, {bg: string;color: string;label: string;}> = {
                approved: { bg: '#f1f8f5', color: '#008060', label: 'Approved' },
                sampling: { bg: '#fff5ea', color: '#915907', label: 'Sampling' },
                new: { bg: '#f6f6f7', color: '#6d7175', label: 'Pending' }
              };
              const st = statusMap[statusVal] || statusMap.new;
              const catColorMap: Record<string, string> = { '1688': '#202223', 'ALIBABA': '#1c3d7a' };
              const catColor = catColorMap[platform.toUpperCase()] || '#202223';
              return (
                <tr
                  key={factory.id}
                  style={{ borderBottom: idx < filtered.length - 1 ? '1px solid #e1e3e5' : 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => {(e.currentTarget as HTMLElement).style.background = '#f1f2f3';}}
                  onMouseLeave={(e) => {(e.currentTarget as HTMLElement).style.background = 'transparent';}}>
                  
                  {/* Star */}
                  <td style={{ width: 32, textAlign: 'center', padding: '10px 12px', cursor: 'pointer' }} onClick={(e) => {e.stopPropagation();toggleStar(factory.id);}}>
                    <svg width="15" height="15" viewBox="0 0 20 20" style={{ display: 'inline-block' }}>
                      <polygon
                        points="10,2 12.5,7.5 18.5,8.2 14,12.5 15.4,18.5 10,15.5 4.6,18.5 6,12.5 1.5,8.2 7.5,7.5"
                        fill={isTop ? '#f4b400' : 'none'}
                        stroke={isTop ? 'none' : '#d2d5d8'}
                        strokeWidth={isTop ? 0 : 1.5} />
                      
                    </svg>
                  </td>
                  {/* Vendor */}
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#202223' }}>{factory.name}</span>
                    {factory.country && <span style={{ display: 'block', fontSize: 11, color: '#6d7175' }}>{factory.country}{factory.city ? `, ${factory.city}` : ''}</span>}
                  </td>
                  {/* Platform */}
                  <td style={{ padding: '10px 12px' }}>
                    {platform ?
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#ffffff', padding: '2px 7px', borderRadius: 3, background: catColor }}>{platform}</span> :
                    '—'}
                  </td>
                  {/* Products */}
                  <td style={{ padding: '10px 12px', fontSize: 13, color: '#6d7175' }}>
                    {(factory as any).main_products?.slice(0, 2).join(', ') || '—'}
                  </td>
                  {/* Status */}
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 4, background: st.bg, color: st.color }}>{st.label}</span>
                  </td>
                  {/* Score */}
                  <td style={{ padding: '10px 12px' }}>
                    <div className="flex items-center" style={{ gap: 8 }}>
                      <div style={{ width: 44, height: 4, background: '#f6f6f7', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${score}%`, height: '100%', background: '#008060', borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 12, color: '#202223' }}>{score}</span>
                    </div>
                  </td>
                  {/* Action */}
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <Link to={`/factories/${factory.id}`} onClick={(e) => e.stopPropagation()}>
                      <button
                        className="transition-colors"
                        style={{ padding: '4px 10px', border: '1px solid #e1e3e5', borderRadius: 4, background: '#ffffff', color: '#202223', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                        onMouseEnter={(e) => {e.currentTarget.style.background = '#f1f2f3';}}
                        onMouseLeave={(e) => {e.currentTarget.style.background = '#ffffff';}}>
                        
                        관리
                      </button>
                    </Link>
                  </td>
                </tr>);

            })}
          </tbody>
        </table>
        }
      </div>
    </div>);

};

export default Dashboard;