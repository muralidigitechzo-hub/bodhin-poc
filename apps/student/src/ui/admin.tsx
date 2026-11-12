/** Shared Super Admin UI: search bar, quick-look sheet, placeholders. */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { admin } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';
import { Button } from './Button';
import { BottomSheet } from './kit';
import { KV } from './section';

export const KIND_ICON = { tenant: 'business', user: 'person', course: 'layers', order: 'receipt', application: 'document-text' } as const;
export type PeekTarget = { kind: keyof typeof KIND_ICON; id: string; title: string } | null;

/** Tap-to-search bar (opens full-screen search). On web, “/” also opens it. */
export function SearchBar() {
  const { c } = useTheme();
  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        router.push('/admin/search');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <Pressable onPress={() => router.push('/admin/search')} style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="search" accessibilityLabel="Search everything">
      <Ionicons name="search" size={20} color={c.muted} />
      <Txt color={c.muted} style={{ flex: 1 }} numberOfLines={1}>Search workspaces, people, courses, invoices…</Txt>
      <View style={[styles.kbd, { borderColor: c.border }]}><Txt variant="caption" color={c.muted}>/</Txt></View>
    </Pressable>
  );
}

/** One-tap quick look at any record — no page change. */
export function PeekSheet({ userId, target, onClose, action }: { userId: string; target: PeekTarget; onClose: () => void; action?: React.ReactNode }) {
  const { c } = useTheme();
  const rows = target ? admin.peek(userId, target.kind, target.id) : [];
  return (
    <BottomSheet open={!!target} onClose={onClose} title={target?.title ?? ''}>
      <View style={{ gap: 4 }}>
        {rows.map(([k, v], i) => <KV key={`${k}${i}`} k={k} v={v} />)}
        {!rows.length && <Txt color={c.muted}>No details.</Txt>}
        {target?.kind === 'tenant' && !action && <View style={{ marginTop: 10 }}><Button title="Open workspace" iconRight="arrow-forward" size="md" onPress={() => { onClose(); router.push({ pathname: '/admin/tenant/[id]', params: { id: target.id } }); }} /></View>}
        {action && <View style={{ marginTop: 10, gap: 8 }}>{action}</View>}
      </View>
    </BottomSheet>
  );
}

export function AdminSoon({ title, step, icon, lines }: { title: string; step: string; icon: keyof typeof Ionicons.glyphMap; lines: string[] }) {
  const { c } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.ivory }}>
      <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 20, paddingTop: 40 }}>
        <View style={{ width: '100%', maxWidth: 560, gap: 12, alignItems: 'center' }}>
          <View style={[styles.soonIcon, { backgroundColor: c.primarySoft }]}><Ionicons name={icon} size={36} color={c.primary} /></View>
          <Txt variant="title" center>{title}</Txt>
          <Txt color={c.muted} center>Coming in step {step}</Txt>
          <View style={[styles.soonCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            {lines.map((l) => (
              <View key={l} style={{ flexDirection: 'row', gap: 8 }}>
                <Ionicons name="checkmark-circle-outline" size={18} color={c.primary} />
                <Txt variant="label" style={{ flex: 1, fontWeight: '400' }}>{l}</Txt>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
export const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`);
export const ago = (iso: string) => {
  const m = (Date.now() - new Date(iso).getTime()) / 6e4;
  return m < 60 ? `${Math.max(1, Math.round(m))} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, minHeight: 50 },
  kbd: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6 },
  soonIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  soonCard: { width: '100%', borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
});

const SMALL = new Set(['with', 'and', 'the', 'of', 'for', '&', 'at', 'by']);
export const initials = (name: string) => name.split(/\s+/).filter((w) => w && !SMALL.has(w.toLowerCase())).map((w) => w[0].toUpperCase()).slice(0, 2).join('');
