import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Plus, Search, Factory, ArrowUpRight, Upload, Download, Star, TrendingUp, Loader2, Check } from 'lucide-react';
import { useState } from 'react';
import ScoreBadge from '@/components/ScoreBadge';
import StatusBadge from '@/components/StatusBadge';
import { useToast } from '@/hooks/use-toast';

const statusOptions = ['all', 'new', 'contacted', 'sampling', 'approved', 'rejected'];

const scoreRangePresets = [
  { label: 'All Scores', min: 0, max: 100 },
  { label: '80+ Excellent', min: 80, max: 100 },
  { label: '60–79 Good', min: 60, max: 79 },
  { label: '40–59 Average', min: 40, max: 59 },
  { label: 'Under 40', min: 0, max: 39 },
];

const FALLBACK_FACTORIES = [
  { id:'fb000001-0000-0000-0000-000000000001', name:'C&S Fashion', country:'China', city:'Guangzhou', source_platform:'1688', main_products:['Dresses','Tops','Activewear'], status:'approved', overall_score:88, created_at:new Date().toISOString() },
  { id:'fb000001-0000-0000-0000-000000000002', name:'Unity Mode', country:'China', city:'Guangzhou', source_platform:'1688', main_products:['Skirts','Knitwear','T-Shirts'], status:'approved', overall_score:85, created_at:new Date().toISOString() },
  { id:'fb000001-0000-0000-0000-000000000003', name:'Fengjue Fashion', country:'China', city:'Guangzhou', source_platform:'1688', main_products:['Dresses','Blouses','Sets'], status:'approved', overall_score:82, created_at:new Date().toISOString() },
  { id:'fb000001-0000-0000-0000-000000000004', name:'Youthmi', country:'China', city:'Liaoning', source_platform:'ALIBABA', main_products:['Sets','Dresses','Swimwear'], status:'sampling', overall_score:79, created_at:new Date().toISOString() },
  { id:'fb000001-0000-0000-0000-000000000005', name:'Chengni Fashion', country:'China', city:'Guangzhou', source_platform:'1688', main_products:['Plus Size Dresses','Tops'], status:'approved', overall_score:78, created_at:new Date().toISOString() },
  { id:'fb000001-0000-0000-0000-000000000006', name:'Aiyouya Fashion', country:'China', city:'Guangzhou', source_platform:'1688', main_products:['Dresses','Jumpsuits'], status:'sampling', overall_score:75, created_at:new Date().toISOString() },
  { id:'fb000001-0000-0000-0000-000000000007', name:'LSYS Fashion', country:'China', city:'Guangzhou', source_platform:'1688', main_products:["Women's Apparel","Tops"], status:'new', overall_score:72, created_at:new Date().toISOString() },
  { id:'fb000001-0000-0000-0000-000000000008', name:'Yuchen Tongguang', country:'China', city:'Dongguan', source_platform:'1688', main_products:['Dresses','Sets','Pants'], status:'new', overall_score:62, created_at:new Date().toISOString() },
  { id:'fb000001-0000-0000-0000-000000000009', name:'Leqi Fashion', country:'China', city:'Shenzhen', source_platform:'1688', main_products:['Dresses','Tops','Basics'], status:'new', overall_score:68, created_at:new Date().toISOString() },
];

const CONFIRM_PRODUCTS = [
  { id:1, name:'Smocked Halter Maxi Dress', vendor:'BASIC', vendorColor:'#1A1A1A', factory:'C&S Fashion', yuan:126, score:88, image:'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=120&h=120&fit=crop' },
  { id:2, name:'Easy Flow Wide Leg Denim Pants', vendor:'DENIM', vendorColor:'#1E3A5F', factory:'Leqi Fashion', yuan:154, score:85, image:'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=120&h=120&fit=crop' },
  { id:3, name:'100% Linen Wide Leg Trousers', vendor:'BASIC', vendorColor:'#1A1A1A', factory:'Fengjue Fashion', yuan:158, score:82, image:'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=120&h=120&fit=crop' },
  { id:4, name:'Reversible Ribbed Tank Top', vendor:'BASIC', vendorColor:'#1A1A1A', factory:'C&S Fashion', yuan:84, score:88, image:'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=120&h=120&fit=crop' },
  { id:5, name:'Graphic Fleece Pullover Sweatshirt', vendor:'TREND', vendorColor:'#EC4899', factory:'Unity Mode', yuan:112, score:79, image:'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=120&h=120&fit=crop' },
  { id:6, name:'Crochet Button Down Shorts Set', vendor:'VACATION', vendorColor:'#F59E0B', factory:'Youthmi', yuan:196, score:82, image:'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=120&h=120&fit=crop' },
  { id:7, name:'Floral Chiffon Tiered Maxi Dress', vendor:'BASIC', vendorColor:'#1A1A1A', factory:'C&S Fashion', yuan:168, score:85, image:'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=120&h=120&fit=crop' },
  { id:8, name:'Back Lace Up Mermaid Evening Dress', vendor:'FESTIVAL', vendorColor:'#7C3AED', factory:'Chengni Fashion', yuan:224, score:76, image:'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=120&h=120&fit=crop' },
  { id:9, name:'Sunny Days Bikini Set', vendor:'VACATION', vendorColor:'#F59E0B', factory:'Youthmi', yuan:98, score:79, image:'https://images.unsplash.com/photo-1570976447640-ac859083963f?w=120&h=120&fit=crop' },
  { id:10, name:'Graphic Fleece Pullover', vendor:'TREND', vendorColor:'#EC4899', factory:'Unity Mode', yuan:140, score:82, image:'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?w=120&h=120&fit=crop' },
  { id:11, name:'Activewear 3Pcs Sports Set', vendor:'TREND', vendorColor:'#EC4899', factory:'Fengjue Fashion', yuan:182, score:75, image:'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?w=120&h=120&fit=crop' },
  { id:12, name:'Coastal Stripe Smocked Jumpsuit', vendor:'VACATION', vendorColor:'#F59E0B', factory:'Youthmi', yuan:168, score:76, image:'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=120&h=120&fit=crop' },
];

type AgentStatus = 'idle' | 'running' | 'waiting' | 'push-confirm' | 'complete';

const VENDOR_COLORS: Record<string, string> = {
  BASIC: '#1A1A1A', DENIM: '#1E3A5F', VACATION: '#F59E0B',
  FESTIVAL: '#7C3AED', TREND: '#EC4899', CURVE: '#D60000',
};

const Dashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [scorePreset, setScorePreset] = useState('all');

  const [agentBarOpen, setAgentBarOpen] = useState(true);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [stepBadges, setStepBadges] = useState<string[]>(['','','','','','']);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);
  const [confirmedItems, setConfirmedItems] = useState<number[]>(CONFIRM_PRODUCTS.map(p => p.id));

  const { data: rawFactories = [], isLoading } = useQuery({
    queryKey: ['factories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('factories')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const factories = (rawFactories && rawFactories.length > 0) ? rawFactories : FALLBACK_FACTORIES;

  const filtered = factories
    .filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
      const score = f.overall_score ?? 0;
      if (score < scoreRange[0] || score > scoreRange[1]) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'score') return (b.overall_score ?? 0) - (a.overall_score ?? 0);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const stats = {
    total: factories.length,
    approved: factories.filter((f) => f.status === 'approved').length,
    sampling: factories.filter((f) => f.status === 'sampling').length,
    avgScore: factories.length
      ? (factories.reduce((sum, f) => sum + (f.overall_score ?? 0), 0) / factories.length).toFixed(1)
      : '0',
    topVendors: factories.filter((f) => (f.overall_score ?? 0) >= 60).length,
  };

  const handleScorePreset = (preset: string) => {
    setScorePreset(preset);
    const found = scoreRangePresets.find((p) => p.label === preset);
    if (found) setScoreRange([found.min, found.max]);
  };

  const isTopVendor = (score: number) => score >= 80;

  const handleAgentRun = () => {
    setAgentStatus('running');
    setCurrentStep(1);
    setCompletedSteps([]);
    setStepBadges(['','','','','','']);
    setTimeout(() => {
      setCompletedSteps([1]);
      setStepBadges(prev => { const b=[...prev]; b[0]='100개'; return b; });
      setCurrentStep(2);
      setTimeout(() => {
        setCompletedSteps([1,2]);
        setStepBadges(prev => { const b=[...prev]; b[1]='9개'; return b; });
        setCurrentStep(3);
        // Step 3: 벤더 배분 (auto)
        setTimeout(() => {
          setCompletedSteps([1,2,3]);
          setStepBadges(prev => { const b=[...prev]; b[2]='6벤더'; return b; });
          setCurrentStep(4);
          // Step 4: 상품 컨펌 (human)
          setAgentStatus('waiting');
          setTimeout(() => {
            setStepBadges(prev => { const b=[...prev]; b[3]='12개'; return b; });
            setShowConfirmModal(true);
          }, 1000);
        }, 2500);
      }, 2500);
    }, 2500);
  };

  const handleConfirm = () => {
    setShowConfirmModal(false);
    setCompletedSteps([1,2,3,4]);
    setStepBadges(prev => { const b=[...prev]; b[3]=`${confirmedItems.length}개`; return b; });
    setCurrentStep(5);
    setAgentStatus('running');
    setTimeout(() => {
      setCompletedSteps([1,2,3,4,5]);
      setStepBadges(prev => { const b=[...prev]; b[4]=`${confirmedItems.length}개`; return b; });
      setCurrentStep(6);
      setTimeout(() => {
        setStepBadges(prev => { const b=[...prev]; b[5]=`${confirmedItems.length}개`; return b; });
        setAgentStatus('push-confirm');
        setShowPushModal(true);
      }, 2500);
    }, 1875);
  };

  const handleFinalPush = () => {
    setShowPushModal(false);
    setCompletedSteps([1,2,3,4,5,6]);
    setCurrentStep(0);
    setAgentStatus('complete');
    toast({ title: `✅ AI Vendor Agent 사이클 완료`, description: `${confirmedItems.length}개 상품이 FashionGo에 등록되었습니다` });
  };

  const handleReset = () => {
    setAgentStatus('idle');
    setCurrentStep(0);
    setCompletedSteps([]);
    setStepBadges(['','','','','','']);
    setConfirmedItems(CONFIRM_PRODUCTS.map(p => p.id));
  };

  const STEPS = ['트렌드 분석','공장 매칭','벤더 배분','상품 컨펌','정보 완성','FG 등록'];
  const STEP_NUMS = ['①','②','③','④','⑤','⑥'];

  const getState = (i: number) => {
    const n = i + 1;
    if (completedSteps.includes(n)) return 'done';
    if (currentStep === n) return 'current';
    return 'idle';
  };

  const badge = agentStatus === 'idle' ? { text:'● 대기중', cls:'bg-gray-100 text-gray-500' }
    : agentStatus === 'running' ? { text:'● 실행중', cls:'bg-orange-100 text-orange-600 animate-pulse' }
    : agentStatus === 'waiting' ? { text:'⏳ 컨펌 대기', cls:'bg-orange-100 text-orange-600 animate-pulse' }
    : agentStatus === 'push-confirm' ? { text:'🚀 Push 대기', cls:'bg-blue-100 text-blue-600 animate-pulse' }
    : { text:'✅ 완료', cls:'bg-green-100 text-green-600' };

  // Vendor distribution for selected items
  const getVendorCounts = () => {
    const selected = CONFIRM_PRODUCTS.filter(p => confirmedItems.includes(p.id));
    const counts: Record<string, number> = {};
    selected.forEach(p => { counts[p.vendor] = (counts[p.vendor] || 0) + 1; });
    return counts;
  };

  return (
    <div>
      {/* TITLE */}
      <h1 style={{ fontSize: 20, fontWeight: 500, color: '#202223', marginBottom: 8 }}>대시보드</h1>

      {/* ALERT BANNER */}
      <div
        className="flex items-start"
        style={{ gap: 10, background: '#f2f7fe', border: '1px solid #c9d9f4', borderRadius: 4, padding: '10px 14px', marginBottom: 16 }}
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="#2c6ecb" className="shrink-0" style={{ marginTop: 1 }}>
          <path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2zm0 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm1 9H9V9h2v5z" />
        </svg>
        <p style={{ fontSize: 12, color: '#2c6ecb' }}>
          <span style={{ fontWeight: 500 }}>AI 에이전트 대기 중.</span>
          <span style={{ fontWeight: 400 }}> 다음 자동 실행: 월요일 06:00 · 에이전트 패널에서 실행할 수 있습니다.</span>
        </p>
      </div>

      {/* AGENT BAR */}
      <div className="mb-6 rounded-lg border border-border bg-card overflow-hidden">
        {!agentBarOpen ? (
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">🤖 AI Vendor Agent</span>
              <span className={`px-2 py-0.5 text-[11px] rounded-full font-medium ${badge.cls}`}>{badge.text}</span>
              <span className="text-[11px] text-muted-foreground hidden sm:inline">다음 실행: 월 06:00</span>
            </div>
            <button onClick={() => setAgentBarOpen(true)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1">표시 ∨</button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="font-bold text-base">🤖 AI Vendor Agent</span>
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${badge.cls}`}>{badge.text}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">마지막 실행: 2026.03.24 06:00</span>
                {(agentStatus === 'idle' || agentStatus === 'complete') && (
                  <button onClick={handleAgentRun} className="px-3 py-1 bg-destructive text-destructive-foreground text-xs rounded hover:bg-destructive/90 font-medium">
                    ▶ 지금 실행
                  </button>
                )}
                {agentStatus === 'waiting' && (
                  <button onClick={() => setShowConfirmModal(true)} className="px-3 py-1 bg-orange-500 text-white text-xs rounded font-medium animate-pulse">
                    📋 컨펌 필요
                  </button>
                )}
                {agentStatus === 'push-confirm' && (
                  <button onClick={() => setShowPushModal(true)} className="px-3 py-1 bg-blue-600 text-white text-xs rounded font-medium animate-pulse">
                    🚀 Push 확인
                  </button>
                )}
                {agentStatus === 'running' && (
                  <button disabled className="px-3 py-1 bg-muted text-muted-foreground text-xs rounded flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> 실행중...
                  </button>
                )}
                {agentStatus === 'complete' && (
                  <button onClick={handleReset} className="px-3 py-1 border border-border text-xs rounded hover:bg-muted">초기화</button>
                )}
                <button onClick={() => setAgentBarOpen(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1">숨기기 ∧</button>
              </div>
            </div>

            <div className="flex items-start gap-1 w-full pb-2">
              {STEPS.map((name, i) => {
                const state = getState(i);
                const isDone = state === 'done';
                const isCurrent = state === 'current';
                return (
                  <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
                    <div className={`flex flex-col items-center w-full px-2 py-2 rounded-lg border text-center transition-all ${isCurrent ? 'border-orange-300 bg-orange-50' : isDone ? 'border-red-200 bg-red-50' : 'border-border bg-muted/20'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${isCurrent ? 'bg-orange-500 text-white' : isDone ? 'bg-destructive text-white' : 'bg-muted text-muted-foreground'}`}>
                        {isDone ? <Check className="w-3.5 h-3.5" /> : isCurrent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : STEP_NUMS[i]}
                      </div>
                      <span className="text-[11px] font-medium leading-tight">{name}</span>
                      {stepBadges[i] && (
                        <span className={`text-[11px] font-bold mt-0.5 ${isDone ? 'text-destructive' : isCurrent ? 'text-orange-500' : 'text-muted-foreground'}`}>{stepBadges[i]}</span>
                      )}
                      <span className={`text-[10px] mt-0.5 ${isCurrent ? 'text-orange-500' : isDone ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {isDone ? '완료' : isCurrent ? (i === 3 ? '컨펌 대기' : '처리중...') : '대기'}
                      </span>
                    </div>
                    {i < 5 && <span className={`text-lg font-bold shrink-0 ${isDone ? 'text-destructive' : 'text-muted-foreground/20'}`}>→</span>}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">다음 자동 실행: 월요일 06:00 | 패스 설정: OFF</span>
              {agentStatus === 'waiting' && (
                <button onClick={() => setShowConfirmModal(true)} className="px-4 py-1.5 bg-destructive text-destructive-foreground text-sm rounded font-medium hover:bg-destructive/90">
                  📋 {stepBadges[2] || '12'}개 상품 확인하기 →
                </button>
              )}
              {agentStatus === 'push-confirm' && (
                <button onClick={() => setShowPushModal(true)} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded font-medium hover:bg-blue-700 animate-pulse">
                  🚀 FashionGo Push 최종 확인 →
                </button>
              )}
              {agentStatus === 'complete' && (
                <span className="text-sm font-medium text-green-600">✅ {confirmedItems.length}개 상품 FashionGo 등록 완료</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CONFIRM MODAL */}
      {showConfirmModal && (
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
                {Object.entries(getVendorCounts()).sort((a,b) => b[1] - a[1]).map(([vendor, count]) => (
                  <span key={vendor} className="inline-flex items-center gap-1 text-[11px] font-bold text-white px-2 py-1 rounded"
                    style={{ backgroundColor: VENDOR_COLORS[vendor] || '#666' }}>
                    {vendor} <span className="bg-white/20 rounded px-1">{count}</span>
                  </span>
                ))}
                <span className="inline-flex items-center text-[11px] text-muted-foreground px-2 py-1">
                  = {confirmedItems.length}개 선택
                </span>
              </div>
            </div>
            <div className="px-4 py-3 border-b flex items-center gap-3">
              <div onClick={() => setConfirmedItems(confirmedItems.length === CONFIRM_PRODUCTS.length ? [] : CONFIRM_PRODUCTS.map(p => p.id))}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer ${confirmedItems.length === CONFIRM_PRODUCTS.length ? 'bg-destructive border-destructive' : 'border-muted-foreground'}`}>
                {confirmedItems.length === CONFIRM_PRODUCTS.length && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-sm cursor-pointer" onClick={() => setConfirmedItems(confirmedItems.length === CONFIRM_PRODUCTS.length ? [] : CONFIRM_PRODUCTS.map(p => p.id))}>전체 선택</span>
              <span className="text-sm text-muted-foreground ml-auto">{confirmedItems.length}개 선택됨</span>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {CONFIRM_PRODUCTS.map((p) => {
                const usd = (p.yuan / 7 * 3).toFixed(2);
                const checked = confirmedItems.includes(p.id);
                return (
                  <div key={p.id} onClick={() => setConfirmedItems(prev => checked ? prev.filter(i => i !== p.id) : [...prev, p.id])}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${checked ? 'border-destructive bg-red-50' : 'border-border hover:bg-muted/50'}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-destructive border-destructive' : 'border-muted-foreground'}`}>
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <img src={p.image} alt={p.name} className="w-14 h-14 rounded-md object-cover shrink-0 bg-muted" loading="lazy" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white" style={{ backgroundColor: p.vendorColor }}>{p.vendor}</span>
                        <span className="text-[11px] text-muted-foreground">{p.factory}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground line-through">¥{p.yuan}</p>
                      <p className="text-sm font-bold text-destructive">${usd}</p>
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${p.score >= 80 ? 'bg-green-500' : 'bg-orange-400'}`}>{p.score}</div>
                  </div>
                );
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
      )}

      {/* PUSH CONFIRM MODAL */}
      {showPushModal && (() => {
        const vendorCounts = getVendorCounts();
        const selectedProducts = CONFIRM_PRODUCTS.filter(p => confirmedItems.includes(p.id));
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
                    {Object.entries(vendorCounts).sort((a,b) => b[1] - a[1]).map(([vendor, count]) => (
                      <div key={vendor} className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-white px-2 py-0.5 rounded w-20 text-center" style={{ backgroundColor: VENDOR_COLORS[vendor] || '#666' }}>{vendor}</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(count / selectedProducts.length) * 100}%`, backgroundColor: VENDOR_COLORS[vendor] || '#666' }} />
                        </div>
                        <span className="text-sm font-bold w-8 text-right">{count}개</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Summary */}
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">총 상품 수</span><span className="font-bold">{selectedProducts.length}개</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">벤더 수</span><span className="font-bold">{Object.keys(vendorCounts).length}개</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">평균 스코어</span><span className="font-bold">{(selectedProducts.reduce((s,p) => s + p.score, 0) / selectedProducts.length).toFixed(0)}점</span></div>
                </div>
                {/* Product list preview */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">등록 상품 목록</p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {selectedProducts.map(p => (
                      <div key={p.id} className="flex items-center gap-2 text-xs py-1.5 px-1 rounded hover:bg-muted/30">
                        <img src={p.image} alt={p.name} className="w-10 h-10 rounded object-cover shrink-0 bg-muted" loading="lazy" />
                        <span className="text-[9px] font-bold text-white px-1 py-0.5 rounded shrink-0" style={{ backgroundColor: VENDOR_COLORS[p.vendor] || '#666' }}>{p.vendor}</span>
                        <span className="truncate flex-1">{p.name}</span>
                        <span className="text-muted-foreground shrink-0">${(p.yuan / 7 * 3).toFixed(0)}</span>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${p.score >= 80 ? 'bg-green-500' : 'bg-orange-400'}`}>{p.score}</span>
                      </div>
                    ))}
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
          </div>
        );
      })()}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight"><span className="text-primary">FG AI VENDOR</span></h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vendor의 AI화를 실현하는 AI 에이전트 — 소싱 · 검증 · 매칭 · 등록 자동화</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-9 text-xs uppercase tracking-wider font-medium"
            onClick={() => {
              const headers = ['name','country','city','source_platform','source_url','main_products','moq','lead_time','status','overall_score','contact_name','contact_email','contact_phone'];
              const rows = factories.map((f) => headers.map((h) => { const val=(f as any)[h]; if(Array.isArray(val)) return `"${val.join(', ')}"`;if(val===null||val===undefined) return '';return `"${String(val).replace(/"/g,'""')}"`;}).join(','));
              const csv=[headers.join(','),...rows].join('\n');
              const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
              const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`vendors_${new Date().toISOString().slice(0,10)}.csv`;link.click();
            }} disabled={factories.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1.5" />CSV
          </Button>
          <Link to="/factories/bulk-import"><Button size="sm" variant="outline" className="h-9 text-xs uppercase tracking-wider font-medium"><Upload className="w-3.5 h-3.5 mr-1.5" />Bulk Import</Button></Link>
          <Link to="/factories/new"><Button size="sm" className="h-9 text-xs uppercase tracking-wider font-medium"><Plus className="w-3.5 h-3.5 mr-1.5" />Add Vendor</Button></Link>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6 md:mb-8">
        {[
          { label:'Total', value:stats.total, icon:null as any, highlight:false },
          { label:'Approved', value:stats.approved, icon:null as any, highlight:false },
          { label:'Sampling', value:stats.sampling, icon:null as any, highlight:false },
          { label:'Avg Score', value:stats.avgScore, icon:TrendingUp, highlight:false },
          { label:'Top Vendors', value:stats.topVendors, icon:Star, highlight:true },
        ].map((stat) => (
          <Card key={stat.label} className={`border-border ${stat.highlight ? 'border-[hsl(var(--score-excellent))]/30 bg-[hsl(var(--score-excellent))]/[0.03]' : ''}`}>
            <CardContent className="pt-4 pb-3 md:pt-5 md:pb-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">{stat.label}</p>
                {stat.icon && <stat.icon className={`w-3.5 h-3.5 ${stat.highlight ? 'text-[hsl(var(--score-excellent))]' : 'text-muted-foreground/40'}`} />}
              </div>
              <p className={`text-xl md:text-2xl font-bold tracking-tight ${stat.highlight && Number(stat.value) > 0 ? 'text-[hsl(var(--score-excellent))]' : ''}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FILTERS */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9 text-sm" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] sm:w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{statusOptions.map((s) => (<SelectItem key={s} value={s} className="text-xs">{s === 'all' ? 'All Status' : s.toUpperCase()}</SelectItem>))}</SelectContent>
          </Select>
          <Select value={scorePreset} onValueChange={handleScorePreset}>
            <SelectTrigger className="w-[120px] sm:w-40 h-9 text-xs"><SelectValue placeholder="Score Filter" /></SelectTrigger>
            <SelectContent>{scoreRangePresets.map((p) => (<SelectItem key={p.label} value={p.label} className="text-xs">{p.label}</SelectItem>))}</SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[120px] sm:w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" className="text-xs">Newest</SelectItem>
              <SelectItem value="score" className="text-xs">Score ↓</SelectItem>
              <SelectItem value="name" className="text-xs">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* SCORE SLIDER */}
      <div className="flex items-center gap-4 mb-6 px-1">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium whitespace-nowrap">Score</span>
        <div className="flex-1 max-w-xs">
          <Slider value={scoreRange} onValueChange={(val) => { setScoreRange(val as [number, number]); setScorePreset('custom'); }} min={0} max={100} step={5} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums min-w-[60px]">{scoreRange[0]}–{scoreRange[1]}</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">({filtered.length} vendor{filtered.length !== 1 ? 's' : ''})</span>
      </div>

      {/* TABLE */}
      {isLoading ? (
        <div className="text-center py-16 text-sm text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <Factory className="w-10 h-10 text-muted-foreground/30 mb-4" />
            <p className="font-medium text-muted-foreground mb-1">No vendors found</p>
            <p className="text-sm text-muted-foreground/60 mb-6">{factories.length > 0 ? 'Try adjusting your filters' : 'Add your first factory to get started'}</p>
            {factories.length === 0 && (<Link to="/factories/new"><Button size="sm" className="text-xs uppercase tracking-wider"><Plus className="w-3.5 h-3.5 mr-1.5" />Add Vendor</Button></Link>)}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="hidden md:block">
            <div className="grid grid-cols-[1fr_100px_140px_100px_90px_40px] gap-4 px-5 py-3 border-b border-border text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
              <span>Vendor</span><span>Platform</span><span>Products</span><span>Status</span><span className="text-right">Score</span><span></span>
            </div>
            {filtered.map((factory, idx) => {
              const score = factory.overall_score ?? 0;
              const isTop = isTopVendor(score);
              return (
                <Link key={factory.id} to={`/factories/${factory.id}`}>
                  <div className={`grid grid-cols-[1fr_100px_140px_100px_90px_40px] gap-4 px-5 py-3.5 items-center hover:bg-secondary/50 transition-colors cursor-pointer ${idx < filtered.length - 1 ? 'border-b border-border' : ''} ${isTop ? 'bg-[hsl(var(--score-excellent))]/[0.02]' : ''}`}>
                    <div className="flex items-center gap-2.5">
                      {isTop && <Star className="w-3.5 h-3.5 text-[hsl(var(--score-excellent))] fill-[hsl(var(--score-excellent))] shrink-0" />}
                      <div>
                        <p className={`text-sm font-medium truncate ${isTop ? 'text-[hsl(var(--score-excellent))]' : ''}`}>{factory.name}</p>
                        {factory.country && <p className="text-[11px] text-muted-foreground">{factory.country}{factory.city ? `, ${factory.city}` : ''}</p>}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground uppercase">{(factory as any).source_platform || '—'}</span>
                    <span className="text-xs text-muted-foreground truncate">{(factory as any).main_products?.slice(0,2).join(', ') || '—'}</span>
                    <StatusBadge status={factory.status ?? 'new'} />
                    <div className="flex justify-end items-center gap-2">
                      {isTop && <span className="text-[9px] uppercase tracking-widest font-bold text-[hsl(var(--score-excellent))]">Top</span>}
                      <ScoreBadge score={score} size="sm" />
                    </div>
                    <div className="flex justify-end"><ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40" /></div>
                  </div>
                </Link>
              );
            })}
          </Card>
          <div className="md:hidden space-y-2">
            {filtered.map((factory) => {
              const score = factory.overall_score ?? 0;
              const isTop = isTopVendor(score);
              return (
                <Link key={factory.id} to={`/factories/${factory.id}`}>
                  <Card className={`transition-colors hover:bg-secondary/50 ${isTop ? 'border-[hsl(var(--score-excellent))]/30 bg-[hsl(var(--score-excellent))]/[0.02]' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {isTop && <Star className="w-3.5 h-3.5 text-[hsl(var(--score-excellent))] fill-[hsl(var(--score-excellent))] shrink-0" />}
                            <p className={`text-sm font-medium truncate ${isTop ? 'text-[hsl(var(--score-excellent))]' : ''}`}>{factory.name}</p>
                          </div>
                          {factory.country && <p className="text-[11px] text-muted-foreground mb-2">{factory.country}{factory.city ? `, ${factory.city}` : ''}</p>}
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={factory.status ?? 'new'} />
                            {(factory as any).source_platform && <span className="text-[10px] text-muted-foreground uppercase">{(factory as any).source_platform}</span>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <ScoreBadge score={score} size="sm" />
                          {isTop && <span className="text-[9px] uppercase tracking-widest font-bold text-[hsl(var(--score-excellent))]">Top</span>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;