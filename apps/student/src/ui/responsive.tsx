/**
 * Responsive shell. One codebase, three layouts:
 *  - phone   (< 768)  : thumb-first, bottom tab bar, sheets from the bottom  (unchanged mobile UX)
 *  - tablet  (768–1023): icon side rail, centred content
 *  - desktop (≥ 1024) : full left sidebar with labels, wide multi-column pages, dialogs instead of sheets,
 *                       primary actions inline (no pinned bottom bars)
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { educatorMembership, useAuth } from '@/store/auth';
import { BrandLogo } from './Brand';
import { Txt } from './Txt';

export const BP = { tablet: 768, desktop: 1024 } as const;
/** Page widths on large screens (phones are always full width). */
export const PAGE = { wide: 1200, read: 860, form: 720 } as const;

export function useLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BP.desktop;
  const isTablet = !isDesktop && width >= BP.tablet;
  return {
    width,
    isDesktop,
    isTablet,
    isPhone: width < BP.tablet,
    /** Columns for card grids: phone 1, tablet 2, desktop 3–4 (by available width). */
    cols: (min = 260) => (width < BP.tablet ? 1 : Math.max(2, Math.min(4, Math.floor((Math.min(width - (isDesktop ? SIDEBAR_W : 0), PAGE.wide) - 64) / min)))),
    /** Horizontal page padding. */
    pad: isDesktop ? 32 : 16,
  };
}

export const SIDEBAR_W = 248;

type NavItem = readonly [name: string, title: string, icon: string];
type Area = 'learner' | 'educator' | 'admin';

/** Sidebar entries per area: [href, label, icon, path prefixes that also highlight it]. */
const NAV: Record<Area, [string, string, string, string[]][]> = {
  learner: [
    ['/home', 'Home', 'home', []],
    ['/explore', 'Explore', 'compass', ['/course', '/checkout', '/search']],
    ['/learning', 'My Learning', 'play-circle', ['/assignment', '/result', '/quiz']],
    ['/live', 'Live', 'radio', []],
    ['/playground', 'Playground', 'code-slash', []],
    ['/profile', 'Profile', 'person', ['/payments', '/notifications', '/certificates', '/downloads', '/help']],
  ],
  educator: [
    ['/educator/home', 'Home', 'grid', []],
    ['/educator/courses', 'Courses', 'layers', ['/edu/course', '/edu/lesson', '/edu/assess', '/edu/grad', '/edu/doubts']],
    ['/educator/batches', 'Batches', 'people', ['/edu/batch', '/edu/student']],
    ['/educator/live', 'Live', 'radio', ['/edu/schedule', '/edu/summary']],
    ['/educator/more', 'More', 'menu', ['/edu/']],
  ],
  admin: [
    ['/admin', 'Home', 'speedometer', []],
    ['/admin/inbox', 'Inbox', 'file-tray-full', ['/admin/review']],
    ['/admin/tenants', 'Tenants', 'business', ['/admin/tenant/']],
    ['/admin/money', 'Money', 'wallet', []],
    ['/admin/more', 'More', 'menu', ['/admin/']],
  ],
};

/** Routes that stay full-screen on desktop (sign-in flow, video player, live rooms). */
const NO_FRAME = ['/sign-in', '/sign-up', '/verify', '/forgot-password', '/onboarding', '/apply', '/application-status', '/learn/', '/live-room', '/edu/host', '/edu/prejoin', '/quiz/'];

function areaOf(path: string): Area {
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/educator') || path.startsWith('/edu/')) return 'educator';
  return 'learner';
}

function activeHref(area: Area, path: string) {
  const items = NAV[area];
  // '/admin' is the area root: only an exact match highlights Home (otherwise every admin page would).
  const exact = items.find(([h]) => path === h || (h !== '/admin' && path.startsWith(h + '/')));
  if (exact) return exact[0];
  // longest matching extra prefix wins (so '/edu/course' beats the catch-all '/edu/')
  let best: [string, number] | null = null;
  for (const [h, , , pre] of items) for (const p of pre) if (path.startsWith(p) && (!best || p.length > best[1])) best = [h, p.length];
  return best?.[0] ?? items[0][0];
}

/** Desktop sidebar (≥ 1024px) — persistent on every page of an area, not just the tab screens. */
export function DesktopSidebar({ area, path }: { area: Area; path: string }) {
  const { c } = useTheme();
  const { session, setMode, signOut } = useAuth();
  const edu = educatorMembership(session);
  const u = session?.user;
  const initials = (u?.name ?? '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const areaLabel = area === 'educator' ? 'Teaching' : area === 'admin' ? 'Bodhin admin' : 'Learning';
  const active = activeHref(area, path);

  return (
    <View style={[s.side, { backgroundColor: c.surface, borderRightColor: c.border }]} accessibilityRole="navigation">
      <View style={s.logo}>
        <BrandLogo size="sm" align="flex-start" />
      </View>
      <Txt variant="label" color={c.muted} style={s.area}>{areaLabel.toUpperCase()}</Txt>
      <View style={{ gap: 4 }}>
        {NAV[area].map(([href, title, icon]) => {
          const on = href === active;
          return (
            <Pressable
              key={href}
              onPress={() => router.navigate(href as never)}
              accessibilityRole="link"
              accessibilityState={{ selected: on }}
              accessibilityLabel={title}
              style={({ hovered }: any) => [s.item, { backgroundColor: on ? c.primarySoft : hovered ? c.surfaceMuted : 'transparent' }]}
            >
              <Ionicons name={(on ? icon : `${icon}-outline`) as keyof typeof Ionicons.glyphMap} size={20} color={on ? c.primary : c.inkSoft} />
              <Txt variant="bodyStrong" color={on ? c.primary : c.ink} style={{ fontWeight: on ? '700' : '500' }}>{title}</Txt>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flex: 1 }} />
      {area !== 'admin' && edu && (
        <Pressable
          onPress={() => {
            setMode(area === 'learner' ? 'educator' : 'learner');
            router.replace(area === 'learner' ? '/educator/home' : '/home');
          }}
          accessibilityRole="button"
          accessibilityLabel={area === 'learner' ? 'Switch to teaching' : 'Switch to learning'}
          style={({ hovered }: any) => [s.switch, { borderColor: c.border, backgroundColor: hovered ? c.surfaceMuted : 'transparent' }]}
        >
          <Ionicons name="swap-horizontal" size={18} color={c.primary} />
          <Txt variant="label" color={c.primary}>{area === 'learner' ? 'Switch to teaching' : 'Switch to learning'}</Txt>
        </Pressable>
      )}
      <View style={[s.user, { borderTopColor: c.border }]}>
        <View style={[s.avatar, { backgroundColor: c.primary }]}>
          <Txt variant="label" color="#fff" style={{ fontWeight: '700' }}>{initials}</Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>{u?.name}</Txt>
          <Txt variant="caption" color={c.muted} numberOfLines={1}>{u?.email}</Txt>
        </View>
        <Pressable onPress={() => { signOut(); router.replace('/sign-in'); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Sign out">
          <Ionicons name="log-out-outline" size={20} color={c.muted} />
        </Pressable>
      </View>
    </View>
  );
}

/** Root frame: on desktop, signed-in pages get the area's sidebar on the left. Phones/tablets: untouched. */
export function DesktopFrame({ children }: { children: React.ReactNode }) {
  const { isDesktop } = useLayout();
  const { session } = useAuth();
  const path = usePathname();
  const framed = isDesktop && !!session && path !== '/' && !NO_FRAME.some((p) => path === p || path.startsWith(p));
  if (!framed) return <>{children}</>;
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <DesktopSidebar area={areaOf(path)} path={path} />
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

/**
 * Shared Tabs config for all three areas: bottom bar on phones, icon rail on tablets.
 * Desktop hides the tab bar — the root DesktopFrame shows the sidebar on every page.
 */
export function useAppTabs(_items: readonly NavItem[], _area: Area) {
  const { c } = useTheme();
  const { isDesktop, isTablet } = useLayout();
  return {
    tabBar: isDesktop ? () => null : undefined,
    screenOptions: {
      headerShown: false,
      tabBarActiveTintColor: c.primary,
      tabBarInactiveTintColor: c.muted,
      tabBarPosition: (isTablet ? 'left' : 'bottom') as 'left' | 'bottom',
      tabBarVariant: (isTablet ? 'material' : 'uikit') as 'material' | 'uikit',
      tabBarLabelPosition: isTablet ? ('below-icon' as const) : undefined,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
      tabBarStyle: isTablet
        ? { backgroundColor: c.surface, borderRightColor: c.border, width: 104, paddingTop: 16 }
        : { backgroundColor: c.surface, borderTopColor: c.border, height: Platform.OS === 'web' ? 68 : undefined, paddingTop: 6 },
      tabBarItemStyle: isTablet ? { minHeight: 72 } : { paddingBottom: Platform.OS === 'web' ? 8 : 0 },
    },
  };
}

/** Grid that lays children out in N equal columns (wraps). Phones: 1 column. */
export function Grid({ cols, gap = 16, children }: { cols: number; gap?: number; children: React.ReactNode }) {
  const arr = React.Children.toArray(children);
  if (cols <= 1) return <View style={{ gap }}>{arr}</View>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gap / 2, rowGap: gap }}>
      {arr.map((ch, i) => (
        <View key={i} style={{ width: `${100 / cols}%` as `${number}%`, paddingHorizontal: gap / 2 }}>{ch}</View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  side: { width: SIDEBAR_W, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 20, paddingBottom: 14, height: '100%' },
  logo: { paddingHorizontal: 8, paddingBottom: 20 },
  area: { paddingHorizontal: 12, paddingBottom: 8, letterSpacing: 0.8, fontSize: 11 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, height: 44, borderRadius: 12 },
  switch: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42, marginBottom: 12 },
  user: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, paddingHorizontal: 4 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});

/** Side-by-side columns on desktop, stacked on phones/tablets (same gap). */
export function Cols({ children, gap = 12, widths }: { children: React.ReactNode; gap?: number; widths?: (number | undefined)[] }) {
  const { isDesktop } = useLayout();
  const arr = React.Children.toArray(children).filter(Boolean);
  if (!isDesktop) return <>{arr}</>;
  return (
    <View style={{ flexDirection: 'row', gap, alignItems: 'flex-start' }}>
      {arr.map((ch, i) => (
        <View key={i} style={widths?.[i] ? { width: widths[i] } : { flex: 1, minWidth: 0, gap }}>{ch}</View>
      ))}
    </View>
  );
}
