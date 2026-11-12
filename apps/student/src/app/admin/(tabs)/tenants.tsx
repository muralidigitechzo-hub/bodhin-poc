/** Tenants: every workspace with filters, search and sort. Phone: tap → Workspace 360. Desktop: list + 360 side by side. */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tenantsAdmin, type TenantFilter } from '@/api/client';
import { PLANS } from '@/core/plans';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Chip, Pill, Skeleton } from '@/ui/kit';
import { TenantPanel } from '@/ui/adminTenant';
import { inr } from '@/ui/section';
import { initials, lakh } from '@/ui/admin';

type Data = Awaited<ReturnType<typeof tenantsAdmin.list>>;
const FILTERS: [TenantFilter, string][] = [['all', 'All'], ['trial', 'On trial'], ['past_due', 'Payment failed'], ['alerts', 'Usage ≥85%'], ['no_gateway', 'No gateway'], ['suspended', 'Suspended / cancelled']];
const SORTS = [['newest', 'Newest'], ['mrr', 'MRR'], ['students', 'Students'], ['usage', 'Usage']] as const;

export default function Tenants() {
  const p = useLocalSearchParams<{ f?: TenantFilter }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const [f, setF] = useState<TenantFilter>(p.f ?? 'all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>('newest');
  const [d, setD] = useState<Data | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const load = useCallback(() => { tenantsAdmin.list(userId, f, q, sort).then(setD); }, [userId, f, q, sort]);
  useFocusEffect(load);
  useEffect(() => { load(); }, [load, rev]);
  useEffect(() => { if (p.f) setF(p.f); }, [p.f]);
  useEffect(() => { if (wide && d && !sel && d.rows[0]) setSel(d.rows[0].t.id); }, [wide, d, sel]);

  const list = !d ? <View style={{ gap: 8 }}><Skeleton h={76} /><Skeleton h={76} /><Skeleton h={76} /></View> : d.rows.length === 0 ? <Txt color={c.muted} center style={{ padding: 24 }}>No workspaces match.</Txt> : d.rows.map((r) => {
    const plan = PLANS.find((x) => x.id === r.sub?.plan);
    return (
      <Pressable key={r.t.id} onPress={() => (wide ? setSel(r.t.id) : router.push({ pathname: '/admin/tenant/[id]', params: { id: r.t.id } }))} style={({ pressed }) => [styles.row, { backgroundColor: sel === r.t.id && wide ? c.primarySoft : c.surface, borderColor: sel === r.t.id && wide ? c.primary : c.border }, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`${r.t.branding.displayName}, ${plan?.name}`}>
        <View style={[styles.logo, { backgroundColor: r.t.branding.primary }]}><Txt variant="label" color="#fff">{initials(r.t.branding.displayName)}</Txt></View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>{r.t.branding.displayName}</Txt>
          <Txt variant="caption" color={c.muted} numberOfLines={1}>{r.owner?.name} · {plan?.name} {r.sub?.billing === 'annual' ? '(annual)' : ''}</Txt>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {r.flags.suspended ? <Pill text="Suspended" tone="live" /> : r.flags.cancelled ? <Pill text="Cancelled" tone="neutral" /> : r.flags.pastDue ? <Pill text="Payment failed" tone="live" /> : r.flags.trial ? <Pill text={`Trial ${r.flags.trialDays}d`} tone="warning" /> : null}
            {r.flags.alert && r.worst && <Pill text={`${r.worst.label.split(' ').slice(-1)[0]} ${r.worst.pct}%`} tone={r.worst.level === 'limit' ? 'live' : 'warning'} />}
            {r.flags.noGateway && !r.flags.cancelled && <Pill text="No gateway" tone="neutral" />}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Txt variant="bodyStrong">{inr(r.mrr)}</Txt>
          <Txt variant="caption" color={c.muted}>{r.students.toLocaleString('en-IN')} students</Txt>
          <Txt variant="caption" color={c.muted}>{lakh(r.gmv)} sales</Txt>
        </View>
      </Pressable>
    );
  });

  const header = (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <Txt variant="title" style={{ flex: 1 }}>Tenants</Txt>
        {d && <Txt variant="caption" color={c.muted}>{d.counts.all} workspaces · MRR {inr(d.totals.mrr)}</Txt>}
      </View>
      <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Ionicons name="search" size={18} color={c.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Name, owner, domain, plan…" placeholderTextColor={c.muted} style={[styles.input, { color: c.ink }]} accessibilityLabel="Filter workspaces" autoCapitalize="none" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {FILTERS.map(([k, l]) => <Chip key={k} label={`${l}${d ? ` ${d.counts[k]}` : ''}`} active={f === k} onPress={() => { setF(k); setSel(null); }} />)}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <Txt variant="caption" color={c.muted}>Sort</Txt>
        {SORTS.map(([k, l]) => <Pressable key={k} onPress={() => setSort(k)} style={[styles.sort, { backgroundColor: sort === k ? c.ink : 'transparent' }]} accessibilityRole="button" accessibilityState={{ selected: sort === k }}><Txt variant="caption" color={sort === k ? '#fff' : c.inkSoft}>{l}</Txt></Pressable>)}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {wide ? (
          <View style={{ flex: 1, flexDirection: 'row', gap: 16, padding: 16 }}>
            <ScrollView style={{ width: 460, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingBottom: 20 }}>{header}{list}</ScrollView>
            <View style={{ flex: 1, minWidth: 0 }}>{sel ? <TenantPanel key={sel + rev} id={sel} userId={userId} onChanged={() => setRev((x) => x + 1)} /> : null}</View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"><View style={styles.inner}>{header}{list}</View></ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 30 },
  inner: { width: '100%', maxWidth: 720, gap: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, minHeight: 46 },
  input: { flex: 1, minWidth: 0, fontSize: 15, minHeight: 44 },
  sort: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 12, minHeight: 80 },
  logo: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
