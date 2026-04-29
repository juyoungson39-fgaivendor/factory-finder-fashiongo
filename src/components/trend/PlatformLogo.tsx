import { useState } from 'react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Platform domain → Google Favicon API
// ─────────────────────────────────────────────────────────────
export const PLATFORM_DOMAINS: Record<string, string> = {
  instagram:    'instagram.com',
  tiktok:       'tiktok.com',
  vogue:        'vogue.com',
  elle:         'elle.com',
  wwd:          'wwd.com',
  hypebeast:    'hypebeast.com',
  highsnobiety: 'highsnobiety.com',
  footwearnews: 'footwearnews.com',
  google:       'google.com',
  amazon:       'amazon.com',
  pinterest:    'pinterest.com',
  fashiongo:    'fashiongo.net',
  shein:        'shein.com',
  zara:         'zara.com',
};

export const getFavicon = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

// ─────────────────────────────────────────────────────────────
// Fallback letter-badge (favicon 로드 실패 시)
// ─────────────────────────────────────────────────────────────
const FALLBACK_BADGES: Record<string, { symbol: string; cls: string }> = {
  google:       { symbol: 'G',  cls: 'bg-blue-500 text-white' },
  amazon:       { symbol: 'a',  cls: 'bg-orange-500 text-white' },
  pinterest:    { symbol: 'P',  cls: 'bg-red-600 text-white' },
  instagram:    { symbol: 'In', cls: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' },
  tiktok:       { symbol: 'Tk', cls: 'bg-black text-white' },
  vogue:        { symbol: 'V',  cls: 'bg-black text-white' },
  elle:         { symbol: 'E',  cls: 'bg-red-600 text-white' },
  wwd:          { symbol: 'W',  cls: 'bg-gray-800 text-white' },
  hypebeast:    { symbol: 'HB', cls: 'bg-green-700 text-white' },
  highsnobiety: { symbol: 'H',  cls: 'bg-purple-700 text-white' },
  footwearnews: { symbol: 'FW', cls: 'bg-amber-700 text-white' },
  shein:        { symbol: 'S',  cls: 'bg-rose-500 text-white' },
  zara:         { symbol: 'Z',  cls: 'bg-neutral-900 text-white' },
  fashiongo:    { symbol: 'FG', cls: 'bg-indigo-600 text-white' },
};

// ─────────────────────────────────────────────────────────────
// PlatformLogo component
// ─────────────────────────────────────────────────────────────
interface PlatformLogoProps {
  platform: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * 플랫폼 로고 공통 컴포넌트
 * - Google Favicon API 우선, 로드 실패 시 컬러 이니셜 배지로 폴백
 * - sm (16px): 카드 목록 / 필터 패널용
 * - md (20px): 사이드 뷰용
 */
export const PlatformLogo = ({ platform, size = 'sm', className }: PlatformLogoProps) => {
  const [error, setError] = useState(false);
  const pKey = (platform ?? '').toLowerCase();
  const domain = PLATFORM_DOMAINS[pKey];
  const fallback = FALLBACK_BADGES[pKey];
  const dim = size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
  const textDim = size === 'md' ? 'text-[9px]' : 'text-[8px]';

  if (domain && !error) {
    return (
      <img
        src={getFavicon(domain)}
        alt={platform}
        className={cn(dim, 'object-contain shrink-0', className)}
        onError={() => setError(true)}
      />
    );
  }

  if (fallback) {
    return (
      <span className={cn(
        'inline-flex items-center justify-center rounded-sm font-bold shrink-0 leading-none',
        dim, textDim, fallback.cls, className
      )}>
        {fallback.symbol}
      </span>
    );
  }

  return null;
};

export default PlatformLogo;
