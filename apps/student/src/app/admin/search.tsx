/** Global search: type → grouped results → tap for a quick look (no page hop). */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { admin } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import type { InputRef } from '@/ui/TextField';
import { Txt } from '@/ui/Txt';
import { Chip, IconButton, Pill } from '@/ui/kit';
import { KIND_ICON, PeekSheet, type PeekTarget } from '@/ui/admin';

const LABEL = { tenant: 'Workspaces', user: 'People', course: 'Courses', order: 'Orders & invoices', application: 'Applications' } as const;
const TRY = ['rajesh', 'priya', 'BOD-INV', 'NEET', 'trial', 'arjun'];

export default function AdminSearch() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ReturnType<typeof admin.search>>([]);
  const [peek, setPeek] = useState<PeekTarget>(null);
  const ref = useRef<InputRef>(null);
  useEffect(() => {
    const t = setTimeout(() => setHits(admin.search(userId, q)), 150);
    return () => clearTimeout(t);
  }, [q, userId]);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 50); }, []);
  const groups = (Object.keys(LABEL) as (keyof typeof LABEL)[]).map((k) => ({ k, rows: hits.filter((h) => h.kind === k) })).filter((g) => g.rows.length);

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="chevron-back" label="Close search" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))} />
          <View style={[styles.box, { backgroundColor: c.surface, borderColor: c.primary }]}>
            <Ionicons name="search" size={20} color={c.muted} />
            <TextInput ref={ref} value={q} onChangeText={setQ} placeholder="Name, email, phone, domain, invoice…" placeholderTextColor={c.muted} style={[styles.input, { color: c.ink }]} accessibilityLabel="Search" autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
            {!!q && <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Clear"><Ionicons name="close-circle" size={20} color={c.muted} /></Pressable>}
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            {q.trim().length < 2 ? (
              <>
                <Txt variant="label" color={c.muted}>TRY</Txt>
                <View style={styles.chips}>{TRY.map((t) => <Chip key={t} label={t} onPress={() => setQ(t)} />)}</View>
              </>
            ) : groups.length === 0 ? (
              <Txt color={c.muted} center style={{ marginTop: 30 }}>No matches for “{q}”.</Txt>
            ) : groups.map((g) => (
              <View key={g.k} style={{ gap: 6 }}>
                <Txt variant="label" color={c.muted}>{LABEL[g.k].toUpperCase()} · {g.rows.length}</Txt>
                <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
                  {g.rows.map((h, i) => (
                    <Pressable key={h.id} onPress={() => setPeek({ kind: h.kind, id: h.id, title: h.title })} style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={`${h.title}, ${h.sub}`}>
                      <View style={[styles.icon, { backgroundColor: c.primarySoft }]}><Ionicons name={KIND_ICON[h.kind]} size={18} color={c.primary} /></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt variant="bodyStrong" numberOfLines={1}>{h.title}</Txt>
                        <Txt variant="caption" color={c.muted} numberOfLines={1}>{h.sub}</Txt>
                      </View>
                      {h.badge && <View><Pill text={h.badge.replace('_', ' ')} tone={['Suspended', 'Past due', 'Refunded'].includes(h.badge) ? 'live' : 'neutral'} /></View>}
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
      <PeekSheet userId={userId} target={peek} onClose={() => setPeek(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  box: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, minHeight: 48 },
  input: { flex: 1, minWidth: 0, fontSize: 16, minHeight: 44 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 30 },
  inner: { width: '100%', maxWidth: 720, gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 60 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
