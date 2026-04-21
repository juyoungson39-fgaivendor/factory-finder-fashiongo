import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// ── Shared Types ──────────────────────────────────────────────────────────────

export interface VendorPolicy {
  name: string;
  color: string;
  fgCategory: string;
  season: string;
  occasion: string;
  holiday: string;
}

export interface VendorCriteria {
  name: string;
  color: string;
  position: string;
  keywords: string;
  categories: string;
}

/**
 * AI Vendor 활성/비활성 + 사용자 커스텀 벤더 설정.
 * - overrides: 기본 카탈로그(vendor-config.ts)의 isActive를 사용자별로 오버라이드.
 *             key = vendor.id, value = { isActive }
 * - custom:    사용자가 직접 추가한 벤더. 카탈로그에는 없고 fg_settings에만 존재.
 */
export interface AIVendorOverride {
  isActive: boolean;
}
export interface CustomAIVendor {
  id: string;            // unique slug, e.g. 'custom-1700000000000'
  name: string;
  wholesalerId: number;
  defaultColorId: number;
  position: string;
  categories: string;
  color: string;
  isActive: boolean;
}
export interface AIVendorsConfig {
  overrides: Record<string, AIVendorOverride>;
  custom: CustomAIVendor[];
}

export interface FgSettings {
  // Pricing
  exchangeRate: number;
  marginMultiplier: number;
  // Product Defaults
  madeIn: string;
  pack: string;
  minQty: number;
  weight: number;
  defaultStatus: string;
  msrpMultiplier: number;
  autoDescription: boolean;
  descriptionTemplate: string;
  // Vendor Policies
  vendorPolicies: VendorPolicy[];
  // Vendor Criteria
  vendorCriteria: VendorCriteria[];
  // Trend Schedule
  trendAuto: boolean;
  trendSchedule: string;
  trendTime: string;
  // AI Vendors (활성/비활성 + 커스텀)
  aiVendors: AIVendorsConfig;
}

const DEFAULT_VENDOR_CRITERIA: VendorCriteria[] = [
  { name: 'Sassy Look', color: 'bg-slate-500', position: '베이직 스테디', keywords: '뉴트럴,데일리,베이직,심플', categories: 'Tops, Basics, Everyday Wear' },
  { name: 'BiBi', color: 'bg-pink-500', position: '플러스사이즈', keywords: '플러스,커브,사이즈인클루시브,빅사이즈', categories: 'Plus Size Tops, Dresses, Bottoms' },
  { name: 'styleu', color: 'bg-blue-600', position: '데님 스테디', keywords: '데님,인디고,워시드,진', categories: 'Jeans, Denim Jackets, Shorts' },
  { name: 'Young Aloud', color: 'bg-emerald-500', position: '리조트/여름', keywords: '리조트,코스탈,스윔,린넨,비치', categories: 'Swimwear, Resort, Linen' },
  { name: 'Lenovia USA', color: 'bg-purple-500', position: '미국 시즌 이벤트', keywords: '시즌,파티,포멀,홀리데이,프롬', categories: 'Holiday, Prom, Party, Formal' },
  { name: 'G1K', color: 'bg-orange-500', position: 'SNS 트렌드', keywords: '바이럴,트렌드,인스타,틱톡', categories: 'TikTok Viral, Instagram Trend' },
];

const DEFAULT_VENDOR_POLICIES: VendorPolicy[] = [
  { name: 'Sassy Look', color: 'bg-slate-500', fgCategory: 'Tops', season: 'All Season', occasion: 'Casual', holiday: 'None' },
  { name: 'BiBi', color: 'bg-pink-500', fgCategory: 'Tops', season: 'All Season', occasion: 'Casual', holiday: 'None' },
  { name: 'styleu', color: 'bg-blue-600', fgCategory: 'Jeans & Denim', season: 'All Season', occasion: 'Casual', holiday: 'None' },
  { name: 'Young Aloud', color: 'bg-emerald-500', fgCategory: 'Swimwear', season: 'Summer', occasion: 'Beach', holiday: 'None' },
  { name: 'Lenovia USA', color: 'bg-purple-500', fgCategory: 'Dresses', season: 'All Season', occasion: 'Holiday', holiday: '4th of July' },
  { name: 'G1K', color: 'bg-orange-500', fgCategory: 'Tops', season: 'All Season', occasion: 'Casual', holiday: 'None' },
];

export const DEFAULT_SETTINGS: FgSettings = {
  exchangeRate: 7,
  marginMultiplier: 3,
  madeIn: 'China',
  pack: 'Open-pack',
  minQty: 6,
  weight: 0.5,
  defaultStatus: 'Active',
  msrpMultiplier: 2,
  autoDescription: true,
  descriptionTemplate: '',
  vendorPolicies: DEFAULT_VENDOR_POLICIES,
  vendorCriteria: DEFAULT_VENDOR_CRITERIA,
  trendAuto: true,
  trendSchedule: 'weekly_mon',
  trendTime: '06:00',
};

const QUERY_KEY = ['fg-settings'];

// ── localStorage migration helper ─────────────────────────────────────────────

function migrateFromLocalStorage(): Partial<FgSettings> {
  const ls = localStorage;
  const partial: Partial<FgSettings> = {};

  const rate = ls.getItem('fg_exchange_rate');
  if (rate) partial.exchangeRate = parseFloat(rate);

  const margin = ls.getItem('fg_margin_multiplier');
  if (margin) partial.marginMultiplier = parseFloat(margin);

  const madeIn = ls.getItem('fg_made_in');
  if (madeIn) partial.madeIn = madeIn;

  const pack = ls.getItem('fg_pack');
  if (pack) partial.pack = pack;

  const minQty = ls.getItem('fg_min_qty');
  if (minQty) partial.minQty = parseInt(minQty);

  const weight = ls.getItem('fg_weight');
  if (weight) partial.weight = parseFloat(weight);

  const status = ls.getItem('fg_default_status');
  if (status) partial.defaultStatus = status;

  const msrp = ls.getItem('fg_msrp_multiplier');
  if (msrp) partial.msrpMultiplier = parseFloat(msrp);

  const autoDesc = ls.getItem('fg_auto_description');
  if (autoDesc !== null) partial.autoDescription = autoDesc !== 'false';

  const descTemplate = ls.getItem('fg_description_template');
  if (descTemplate) partial.descriptionTemplate = descTemplate;

  const policies = ls.getItem('fg_vendor_policies');
  if (policies) {
    try { partial.vendorPolicies = JSON.parse(policies); } catch {}
  }

  const criteria = ls.getItem('fg_vendor_criteria');
  if (criteria) {
    try { partial.vendorCriteria = JSON.parse(criteria); } catch {}
  }

  const trendAuto = ls.getItem('fg_trend_auto');
  if (trendAuto !== null) partial.trendAuto = trendAuto === 'true';

  const trendSchedule = ls.getItem('fg_trend_schedule');
  if (trendSchedule) partial.trendSchedule = trendSchedule;

  const trendTime = ls.getItem('fg_trend_time');
  if (trendTime) partial.trendTime = trendTime;

  return partial;
}

function syncToLocalStorage(settings: FgSettings) {
  localStorage.setItem('fg_exchange_rate', String(settings.exchangeRate));
  localStorage.setItem('fg_margin_multiplier', String(settings.marginMultiplier));
  localStorage.setItem('fg_made_in', settings.madeIn);
  localStorage.setItem('fg_pack', settings.pack);
  localStorage.setItem('fg_min_qty', String(settings.minQty));
  localStorage.setItem('fg_weight', String(settings.weight));
  localStorage.setItem('fg_default_status', settings.defaultStatus);
  localStorage.setItem('fg_msrp_multiplier', String(settings.msrpMultiplier));
  localStorage.setItem('fg_auto_description', String(settings.autoDescription));
  localStorage.setItem('fg_description_template', settings.descriptionTemplate);
  localStorage.setItem('fg_vendor_policies', JSON.stringify(settings.vendorPolicies));
  localStorage.setItem('fg_vendor_criteria', JSON.stringify(settings.vendorCriteria));
  localStorage.setItem('fg_trend_auto', String(settings.trendAuto));
  localStorage.setItem('fg_trend_schedule', settings.trendSchedule);
  localStorage.setItem('fg_trend_time', settings.trendTime);
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Loads settings from Supabase. Falls back to localStorage on first use
 * (one-time migration). Returns DEFAULT_SETTINGS when user is not logged in.
 */
export function useFgSettings() {
  const { user } = useAuth();

  return useQuery<FgSettings>({
    queryKey: QUERY_KEY,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fg_settings')
        .select('settings')
        .eq('user_id', user!.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = row not found — expected for new users
        throw new Error(error.message);
      }

      if (data?.settings) {
        // Row exists — merge with defaults to handle newly added fields
        const merged = { ...DEFAULT_SETTINGS, ...(data.settings as Partial<FgSettings>) };
        syncToLocalStorage(merged);
        return merged;
      }

      // No row yet — migrate from localStorage (one-time)
      const lsData = migrateFromLocalStorage();
      const migrated = { ...DEFAULT_SETTINGS, ...lsData };

      // Save migrated data to Supabase
      await supabase
        .from('fg_settings')
        .upsert([{ user_id: user!.id, settings: migrated as any }]);

      return migrated;
    },
    // Return defaults while loading / not logged in
    placeholderData: DEFAULT_SETTINGS,
  });
}

/**
 * Mutation to update settings. Performs Supabase UPSERT and syncs localStorage.
 */
export function useUpdateFgSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<FgSettings, Error, Partial<FgSettings>>({
    mutationFn: async (partial) => {
      if (!user) throw new Error('로그인이 필요합니다');

      // Optimistically merge with current cached value
      const current = queryClient.getQueryData<FgSettings>(QUERY_KEY) ?? DEFAULT_SETTINGS;
      const updated = { ...current, ...partial };

      const { error } = await supabase
        .from('fg_settings')
        .upsert([{ user_id: user.id, settings: updated as any }]);

      if (error) throw new Error(error.message);

      syncToLocalStorage(updated);
      return updated;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<FgSettings>(QUERY_KEY, updated);
    },
  });
}
