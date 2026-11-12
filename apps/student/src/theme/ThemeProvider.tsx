/**
 * Tenant-branded theme. The same screens render in Bodhin colours on thebodhin.com
 * and in the tutor's colours on slug.thebodhin.com or their custom domain.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { Platform } from 'react-native';
import { tenants } from '@/api/client';
import type { Tenant, TenantBranding } from '@/core/types';
import { palette } from './tokens';

export const BODHIN_BRANDING: TenantBranding = {
  displayName: 'Bodhin',
  tagline: 'Discover What You Can Become',
  primary: '#0B3B73',
  primaryDeep: '#071F44',
  accent: '#D99A1E',
};

interface Theme {
  tenant: Tenant | null; // null = Bodhin marketplace
  brand: TenantBranding;
  c: typeof palette & { primary: string; primaryDeep: string; accent: string; primarySoft: string; accentSoft: string };
}

const ThemeCtx = createContext<Theme | null>(null);

/** Mix a hex colour with white. amount 0..1 */
function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * amount);
  const r = mix(n >> 16), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function detectTenant(): Tenant | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null; // native: tenant chosen in-app (later step)
  const override = new URLSearchParams(window.location.search).get('tenant');
  return tenants.resolve(window.location.hostname, override);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<Theme>(() => {
    const tenant = detectTenant();
    const brand = tenant?.branding ?? BODHIN_BRANDING;
    return {
      tenant,
      brand,
      c: { ...palette, primary: brand.primary, primaryDeep: brand.primaryDeep, accent: brand.accent, primarySoft: tint(brand.primary, 0.9), accentSoft: tint(brand.accent, 0.85) },
    };
  }, []);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const t = useContext(ThemeCtx);
  if (!t) throw new Error('useTheme must be used inside ThemeProvider');
  return t;
}
