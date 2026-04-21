/**
 * 정적 카탈로그(AI_VENDORS)와 사용자 설정(fg_settings.aiVendors)을 병합한
 * 최종 벤더 목록을 제공하는 훅.
 *
 * - overrides: 카탈로그 벤더의 isActive를 사용자별로 덮어씀
 * - custom:    사용자가 추가한 벤더 (항상 카탈로그 뒤에 합쳐짐)
 */
import { useMemo } from 'react';
import { useFgSettings } from '@/integrations/supabase/hooks/use-fg-settings';
import { AI_VENDORS } from './vendor-config';
import type { AIVendorConfig } from './vendor-config';

export function useResolvedVendors(): {
  all: AIVendorConfig[];
  active: AIVendorConfig[];
  isLoading: boolean;
} {
  const { data: settings, isLoading } = useFgSettings();

  return useMemo(() => {
    const overrides = settings?.aiVendors?.overrides ?? {};
    const custom = settings?.aiVendors?.custom ?? [];

    const merged: AIVendorConfig[] = [
      ...AI_VENDORS.map((v) => ({
        ...v,
        isActive: overrides[v.id]?.isActive ?? v.isActive,
      })),
      ...custom.map((c) => ({
        id: c.id,
        name: c.name,
        wholesalerId: c.wholesalerId,
        defaultColorId: c.defaultColorId,
        position: c.position,
        categories: c.categories,
        color: c.color,
        isActive: c.isActive,
      })),
    ];

    return {
      all: merged,
      active: merged.filter((v) => v.isActive),
      isLoading,
    };
  }, [settings, isLoading]);
}
