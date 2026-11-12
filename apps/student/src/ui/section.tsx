/** Small shared building blocks for educator settings screens. */
import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';
import { IconButton } from './kit';

export function ScreenTop({ title, sub, fallback = '/educator/more', right }: { title: string; sub?: string; fallback?: string; right?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.top}>
      <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as never))} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="heading" numberOfLines={1}>{title}</Txt>
        {!!sub && <Txt variant="caption" color={c.muted} numberOfLines={1}>{sub}</Txt>}
      </View>
      {right}
    </View>
  );
}

export function Card({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      {(title || right) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {title ? <Txt variant="label" color={c.muted}>{title.toUpperCase()}</Txt> : <View />}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function Stat({ v, l, tone }: { v: string; l: string; tone?: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Txt variant="bodyStrong" color={tone} style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{v}</Txt>
      <Txt variant="caption" color={c.muted} numberOfLines={1}>{l}</Txt>
    </View>
  );
}

export function ToggleRow({ title, sub, value, onChange, disabled }: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }, disabled && { opacity: 0.45 }]}>
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        {!!sub && <Txt variant="caption" color={c.muted}>{sub}</Txt>}
      </View>
      <Switch disabled={disabled} value={value} onValueChange={onChange} accessibilityLabel={title} trackColor={{ true: c.primary, false: c.borderStrong }} thumbColor="#fff" />
    </View>
  );
}

export function KV({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, minHeight: 26, alignItems: 'center' }}>
      <Txt variant={strong ? 'bodyStrong' : 'body'} color={strong ? c.ink : c.inkSoft} style={{ flex: 1 }}>{k}</Txt>
      <Txt variant={strong ? 'bodyStrong' : 'body'} color={tone ?? c.ink} style={{ fontVariant: ['tabular-nums'] }}>{v}</Txt>
    </View>
  );
}

/** Thumb-friendly number control: − value + (with optional "unlimited"). */
export function Num({ label, sub, value, onChange, step = 1, min = 0, max = 100000, fmt, unlimited, disabled }: { label: string; sub?: string; value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; max?: number; fmt?: (v: number) => string; unlimited?: boolean; disabled?: boolean }) {
  const { c } = useTheme();
  const v = value ?? 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  return (
    <View style={[{ gap: 6 }, disabled && { opacity: 0.5 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Txt variant="label">{label}</Txt>
          {!!sub && <Txt variant="caption" color={c.muted}>{sub}</Txt>}
        </View>
        {unlimited && (
          <Pressable disabled={disabled} onPress={() => onChange(value == null ? min || step : null)} style={[styles.unl, { borderColor: value == null ? c.primary : c.border, backgroundColor: value == null ? c.primarySoft : c.surface }]} accessibilityRole="switch" accessibilityState={{ checked: value == null }} accessibilityLabel={`${label} unlimited`}>
            <Txt variant="caption" color={value == null ? c.primary : c.inkSoft}>∞ Unlimited</Txt>
          </Pressable>
        )}
      </View>
      {value != null && (
        <View style={styles.num}>
          <Pressable disabled={disabled || v <= min} onPress={() => onChange(Math.max(min, round(v - step)))} style={[styles.numBtn, { borderColor: c.border, opacity: v <= min ? 0.4 : 1 }]} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`}><Ionicons name="remove" size={20} color={c.ink} /></Pressable>
          <View style={[styles.numVal, { backgroundColor: c.surfaceMuted }]}><Txt variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{fmt ? fmt(v) : v.toLocaleString('en-IN')}</Txt></View>
          <Pressable disabled={disabled || v >= max} onPress={() => onChange(Math.min(max, round(v + step)))} style={[styles.numBtn, { borderColor: c.border, opacity: v >= max ? 0.4 : 1 }]} accessibilityRole="button" accessibilityLabel={`Increase ${label}`}><Ionicons name="add" size={20} color={c.ink} /></Pressable>
        </View>
      )}
    </View>
  );
}

export const inr = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const shared = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 30 },
  inner: { width: '100%', maxWidth: 720, gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { borderTopWidth: 1, padding: 12, alignItems: 'center' },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 40, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  list: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
});

const styles = StyleSheet.create({
  num: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  numBtn: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  numVal: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  unl: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 10, gap: 2 },
});
