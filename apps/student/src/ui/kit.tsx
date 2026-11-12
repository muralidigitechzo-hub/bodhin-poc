/** Generic building blocks shared by all tabs. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, touch } from '@/theme/tokens';
import { useAuth } from '@/store/auth';
import { notifications } from '@/api/client';
import { BrandLogo } from './Brand';
import { Txt } from './Txt';
import { Button } from './Button';

type IconName = keyof typeof Ionicons.glyphMap;

/** Fetch helper: { data, loading, error, reload }. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const run = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((e) => alive && setState({ data: null, loading: false, error: e?.message ?? 'Something went wrong.' }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { ...state, reload: run };
}

export function Avatar({ name, color, size = 44 }: { name: string; color?: string; size?: number }) {
  const { c } = useTheme();
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? c.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.accentSoft }}>
      <Txt variant="bodyStrong" color="#fff" style={{ fontSize: size * 0.38, lineHeight: size * 0.46 }}>
        {initials}
      </Txt>
    </View>
  );
}

/** Compact app header used on the tab screens: logo · bell · avatar. */
/**
 * Top bar. Phone: logo · bell · avatar. Desktop (≥1024): the sidebar shows the logo, so learners get a search
 * field here and educators get the page's primary `action` (replaces the phone's floating button).
 */
export function AppHeader({ profileHref = '/profile', action }: { profileHref?: string; action?: { title: string; icon?: IconName; onPress: () => void } }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const educatorArea = profileHref !== '/profile';
  return (
    <View style={styles.header}>
      {width >= 1024 && educatorArea ? (
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', paddingRight: 8 }}>
          {action && <Button title={action.title} iconLeft={action.icon ?? 'add'} onPress={action.onPress} />}
        </View>
      ) : width >= 1024 ? (
        // Desktop: the sidebar already shows the logo — use the space for search.
        <Pressable onPress={() => router.push('/search')} accessibilityRole="search" accessibilityLabel="Search courses" style={({ hovered }: any) => [styles.deskSearch, { backgroundColor: c.surface, borderColor: hovered ? c.borderStrong : c.border }]}>
          <Ionicons name="search" size={18} color={c.muted} />
          <Txt color={c.muted}>Search courses, skills or tutors</Txt>
        </Pressable>
      ) : (
        <View style={{ alignItems: 'flex-start', flex: 1 }}>
          <BrandLogo size="sm" align="flex-start" />
        </View>
      )}
      <IconButton icon="notifications-outline" label="Notifications" dot={!!session && notifications.unread(session.user.id) > 0} onPress={() => router.push('/notifications')} />
      <Pressable onPress={() => router.navigate(profileHref as any)} accessibilityRole="button" accessibilityLabel="Your profile" hitSlop={6}>
        <Avatar name={session?.user.name ?? 'You'} size={42} color={c.primaryDeep} />
      </Pressable>
    </View>
  );
}

export function IconButton({ icon, label, onPress, dot, tone = 'plain' }: { icon: IconName; label: string; onPress: () => void; dot?: boolean; tone?: 'plain' | 'filled' }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.iconBtn, tone === 'filled' && { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={icon} size={24} color={c.ink} />
      {dot && <View style={[styles.dot, { backgroundColor: c.live, borderColor: c.ivory }]} />}
    </Pressable>
  );
}

/** `tight`: no top margin, for blocks already spaced by a parent's gap. */
export function SectionHeader({ title, action, onAction, tight }: { title: string; action?: string; onAction?: () => void; tight?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.section, tight && { marginTop: 0 }]}>
      <Txt variant="heading" style={{ fontSize: 19 }} accessibilityRole="header">
        {title}
      </Txt>
      {action && onAction && (
        <Pressable onPress={onAction} hitSlop={10} style={styles.sectionAction} accessibilityRole="button">
          <Txt variant="label" color={c.primary}>
            {action}
          </Txt>
          <Ionicons name="arrow-forward" size={16} color={c.primary} />
        </Pressable>
      )}
    </View>
  );
}

export function ProgressRing({ pct, size = 72, stroke = 7, color, track, label = true, textColor }: { pct: number; size?: number; stroke?: number; color?: string; track?: string; label?: boolean; textColor?: string }) {
  const { c } = useTheme();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${pct}% complete`}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? c.border} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color ?? c.success} strokeWidth={stroke} fill="none" strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - pct / 100)} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      {label && (
        <Txt variant="heading" color={textColor ?? c.ink} style={{ fontSize: size * 0.24 }}>
          {pct}%
        </Txt>
      )}
    </View>
  );
}

export function ProgressBar({ pct, color, height = 6 }: { pct: number; color?: string; height?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.border, overflow: 'hidden', flex: 1 }}>
      <View style={{ width: `${pct}%`, height, borderRadius: height, backgroundColor: color ?? c.success }} />
    </View>
  );
}

export function Pill({ text, tone = 'neutral', icon }: { text: string; tone?: 'neutral' | 'live' | 'success' | 'warning' | 'info' | 'gold'; icon?: IconName }) {
  const { c } = useTheme();
  const map = {
    neutral: [c.surfaceMuted, c.inkSoft],
    live: [c.live, '#fff'],
    success: [c.successBg, c.success],
    warning: [c.warningBg, c.warning],
    info: [c.infoBg, c.info],
    gold: ['#FCE7A8', '#7A4B00'],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={12} color={fg} />}
      <Txt variant="caption" color={fg} style={{ fontWeight: '700' }}>
        {text}
      </Txt>
    </View>
  );
}

export function Chip({ label, icon, active, onPress }: { label: string; icon?: IconName; active?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={[styles.chip, { backgroundColor: active ? c.primary : c.surface, borderColor: active ? c.primary : c.border }]}
    >
      {icon && <Ionicons name={icon} size={16} color={active ? '#fff' : c.primary} />}
      <Txt variant="label" color={active ? '#fff' : c.ink}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 8, style }: { h?: number; w?: number | `${number}%`; r?: number; style?: ViewStyle }) {
  const { c } = useTheme();
  const o = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={[{ height: h, width: w, borderRadius: r, backgroundColor: c.border, opacity: o }, style]} />;
}

export function ErrorState({ text, onRetry }: { text: string; onRetry: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 40 }}>
      <Ionicons name="cloud-offline-outline" size={36} color={c.muted} />
      <Txt color={c.inkSoft} center>
        {text}
      </Txt>
      <Pressable onPress={onRetry} style={[styles.chip, { borderColor: c.primary }]} accessibilityRole="button">
        <Txt variant="label" color={c.primary}>
          Try again
        </Txt>
      </Pressable>
    </View>
  );
}

/**
 * Bottom sheet — all options, filters and confirmations open from the bottom,
 * inside the thumb zone. Drag the handle or tap the scrim to close.
 */
export function BottomSheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const dialog = width >= 1024; // desktop: centred dialog instead of a bottom sheet
  const y = useRef(new Animated.Value(height)).current;
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
    } else if (mounted) {
      Animated.timing(y, { toValue: height, duration: 200, useNativeDriver: true }).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(7,20,40,0.45)', opacity: y.interpolate({ inputRange: [0, height], outputRange: [1, 0] }) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        pointerEvents="box-none"
        style={[
          dialog ? [styles.dialog, { backgroundColor: c.surface, maxHeight: height * 0.86, top: height * 0.07, opacity: y.interpolate({ inputRange: [0, height], outputRange: [1, 0] }), transform: [{ scale: y.interpolate({ inputRange: [0, height], outputRange: [1, 0.96] }) }] }]
                 : [styles.sheet, { backgroundColor: c.surface, paddingBottom: Math.max(insets.bottom, 12), maxHeight: height * 0.88, transform: [{ translateY: y }] }],
        ]}
        accessibilityViewIsModal
      >
        <View style={styles.sheetTop}>
          {!dialog && <View style={[styles.handle, { backgroundColor: c.borderStrong }]} />}
          <View style={styles.sheetTitleRow}>
            <Txt variant="heading">{title}</Txt>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={[styles.close, { backgroundColor: c.surfaceMuted }]}>
              <Ionicons name="close" size={20} color={c.ink} />
            </Pressable>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 18 }} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
        {footer && <View style={[styles.sheetFooter, { borderTopColor: c.border }]}>{footer}</View>}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  iconBtn: { width: touch.min, height: touch.min, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 11, right: 12, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 12 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 42, borderRadius: radius.pill, borderWidth: 1.2 },
  deskSearch: { flex: 1, maxWidth: 520, marginRight: 'auto', flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, width: '100%', maxWidth: 640, alignSelf: 'center' },
  dialog: { position: 'absolute', alignSelf: 'center', width: '92%', maxWidth: 600, borderRadius: 24, paddingBottom: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 40, shadowOffset: { width: 0, height: 16 } },
  sheetTop: { paddingTop: 10, paddingHorizontal: 20, paddingBottom: 8 },
  handle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sheetFooter: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, flexDirection: 'row', gap: 12 },
});
