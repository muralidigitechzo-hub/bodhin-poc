/**
 * Command Center — everything the Super Admin needs at a glance, every item one tap from action.
 * Revenue (Bodhin's own: subscriptions + commission + own courses), GMV split, pending work, alerts, activity, rules.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { admin, type AdminAlert } from '@/api/client';
import { ROLE_LABEL, can } from '@/core/admin';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Avatar, Pill, Skeleton } from '@/ui/kit';
import { PeekSheet, SearchBar, ago, greeting, lakh, type PeekTarget } from '@/ui/admin';
import { Card } from '@/ui/section';

type Data = Awaited<ReturnType<typeof admin.overview>>;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CommandCenter() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const me = admin.me(userId);
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const [d, setD] = useState<Data | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [peek, setPeek] = useState<PeekTarget>(null);
  const [allAlerts, setAllAlerts] = useState(false);
  const load = useCallback(() => admin.overview(userId).then(setD), [userId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const role = me?.role;

  const left = d && (
    <>
      {can(role, 'money.view') || role === 'super_admin' ? <Hero d={d} /> : null}
      <Txt variant="label" color={c.muted}>NEEDS YOU</Txt>
      <View style={styles.tiles}>
        {can(role, 'approvals.educators') && <Tile icon="person-add" tint="#E9F0FD" color="#1D5FD0" n={d.pending.educators} label="Educator approvals" onPress={() => router.push({ pathname: '/admin/inbox', params: { tab: 'educators' } })} />}
        {can(role, 'approvals.courses') && <Tile icon="layers" tint="#F1ECFC" color="#7C3AED" n={d.pending.courses} label="Course reviews" onPress={() => router.push({ pathname: '/admin/inbox', params: { tab: 'courses' } })} />}
        {can(role, 'payouts.run') && <Tile icon="send" tint="#E8F6EC" color="#15803D" n={d.pending.payouts.tenants} value={lakh(d.pending.payouts.amount)} label={`Payouts · ${DAYS[new Date(d.pending.payouts.date).getDay()]} ${new Date(d.pending.payouts.date).getDate()}`} onPress={() => router.push({ pathname: '/admin/money', params: { tab: 'payouts' } })} />}
        {can(role, 'refunds') && <Tile icon="return-down-back" tint="#FDF3E1" color="#B7791F" n={d.pending.refunds} label="Refund requests" onPress={() => router.push({ pathname: '/admin/money', params: { tab: 'refunds' } })} />}
        {can(role, 'approvals.reports') && <Tile icon="flag" tint="#FDECEC" color="#D93A3F" n={d.pending.reports} label="Reported content" onPress={() => router.push({ pathname: '/admin/inbox', params: { tab: 'reports' } })} />}
        {can(role, 'support.tickets') && <Tile icon="chatbubbles" tint="#E9F0FD" color="#1D5FD0" n={d.pending.tickets} label="Support tickets" onPress={() => router.push('/admin/tickets')} />}
      </View>

      <Txt variant="label" color={c.muted}>PLATFORM</Txt>
      <View style={styles.kpis}>
        <Kpi v={String(d.kpis.workspaces)} l="Active workspaces" sub={`+${d.kpis.newThisMonth} this month`} onPress={() => router.push('/admin/tenants')} />
        <Kpi v={String(d.kpis.trials)} l="On trial" sub="convert to paid" onPress={() => router.push({ pathname: '/admin/tenants', params: { f: 'trial' } })} />
        <Kpi v={String(d.kpis.pastDue)} l="Payment failed" sub="follow up" tone={d.kpis.pastDue ? c.danger : undefined} onPress={() => router.push({ pathname: '/admin/tenants', params: { f: 'past_due' } })} />
        <Kpi v={d.kpis.students.toLocaleString('en-IN')} l="Active students" sub="all workspaces" onPress={() => router.push('/admin/tenants')} />
      </View>

      {(can(role, 'money.view') || role === 'super_admin') && (
        <Card title="Where the money went · this month">
          <Txt variant="caption" color={c.muted}>GMV {lakh(d.kpis.gmv)} (on pace for {lakh(d.kpis.paceGmv)})</Txt>
          <Split parts={[
            { label: 'Tutors’ own gateways', sub: 'direct sales · Bodhin 0%', v: d.kpis.direct, color: c.success },
            { label: 'Bodhin marketplace', sub: `Bodhin collects · ${Math.round(d.cfg.commissionRate * 100)}% commission`, v: d.kpis.market, color: c.info },
            { label: 'Bodhin’s own courses', sub: 'Bodhin keeps 100%', v: d.kpis.ownSales, color: '#E8A21B' },
          ]} />
        </Card>
      )}
    </>
  );

  const shown = d ? (allAlerts ? d.alerts : d.alerts.slice(0, 5)) : [];
  const right = d && (
    <>
      <Card title={`Alerts · ${d.alerts.length}`} right={d.alerts.length > 5 ? <Pressable onPress={() => setAllAlerts(!allAlerts)} hitSlop={8} accessibilityRole="button"><Txt variant="label" color={c.primary}>{allAlerts ? 'Show less' : 'See all'}</Txt></Pressable> : undefined}>
        {d.alerts.length === 0 && <Txt color={c.muted}>All clear.</Txt>}
        {shown.map((a) => <AlertRow key={a.id} a={a} onPress={() => a.tenantId && setPeek({ kind: 'tenant', id: a.tenantId, title: a.title.split(':')[0] })} />)}
      </Card>
      <Card title="Recent admin activity" right={can(role, 'audit.view') ? <Pressable onPress={() => router.push('/admin/audit')} hitSlop={8}><Txt variant="label" color={c.primary}>Audit log</Txt></Pressable> : undefined}>
        {d.activity.map((e) => (
          <View key={e.id} style={styles.act}>
            <Avatar name={e.actorName} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="label" numberOfLines={2}><Txt variant="label">{e.actorName}</Txt><Txt variant="label" color={c.inkSoft} style={{ fontWeight: '400' }}> · {e.summary} — {e.target.label}</Txt></Txt>
              <Txt variant="caption" color={c.muted}>{ago(e.at)}</Txt>
            </View>
          </View>
        ))}
      </Card>
      {role === 'super_admin' && (
        <Card title="Platform rules (live)" right={<Pressable onPress={() => router.push('/admin/settings')} hitSlop={8}><Txt variant="label" color={c.primary}>Edit</Txt></Pressable>}>
          <View style={styles.rules}>
            <Rule v={`${Math.round(d.cfg.commissionRate * 100)}%`} l="Marketplace commission" />
            <Rule v={`${Math.round(d.cfg.gatewayFeeRate * 100)}%`} l="Gateway fee" />
            <Rule v={`${d.cfg.refundHoldDays} days`} l="Refund hold" />
            <Rule v={`Every ${DAYS[d.cfg.payoutWeekday]}`} l="Payout day" />
            <Rule v={`${d.cfg.trialDays} days`} l={`Trial (${d.cfg.trialPlan})`} />
            <Rule v={`${d.cfg.attributionDays} days`} l="Referral window" />
          </View>
        </Card>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />} showsVerticalScrollIndicator={false}>
          <View style={[styles.inner, wide && { maxWidth: 1240 }]}>
            <View style={styles.head}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="caption" color={c.muted}>{greeting()} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Txt>
                <Txt variant="title" numberOfLines={1}>{me?.user.name.split(' ')[0]}</Txt>
              </View>
              {role && <Pill text={ROLE_LABEL[role]} tone="gold" icon="shield-checkmark" />}
            </View>
            <SearchBar />
            {!d ? (
              <View style={{ gap: 12 }}><Skeleton h={170} r={20} /><Skeleton h={120} /><Skeleton h={90} /></View>
            ) : wide ? (
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
                <View style={{ flex: 1.35, gap: 12, minWidth: 0 }}>{left}</View>
                <View style={{ flex: 1, gap: 12, minWidth: 0 }}>{right}</View>
              </View>
            ) : (
              <>{left}{right}</>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
      <PeekSheet userId={userId} target={peek} onClose={() => setPeek(null)} />
    </View>
  );
}

function Hero({ d }: { d: Data }) {
  const k = d.kpis;
  const delta = k.prev.bodhin ? Math.round(((k.paceBodhin - k.prev.bodhin) / k.prev.bodhin) * 100) : 0;
  const max = Math.max(...d.history.bodhin, 1);
  return (
    <View style={styles.hero}>
      <Txt variant="caption" color="rgba(255,255,255,0.75)">Bodhin revenue · this month</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <Txt variant="display" color="#fff" style={{ fontVariant: ['tabular-nums'] }}>{lakh(k.bodhinRevenue)}</Txt>
        <Pill text={`${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% pace vs last month`} tone={delta >= 0 ? 'success' : 'live'} />
      </View>
      <Txt variant="caption" color="rgba(255,255,255,0.7)">On pace for {lakh(k.paceBodhin)} by month end</Txt>
      <View style={styles.heroSplit}>
        <HeroPart v={lakh(k.mrr)} l="Subscriptions" />
        <HeroPart v={lakh(k.commission)} l="Commission" />
        <HeroPart v={lakh(k.ownSales)} l="Own courses" />
      </View>
      <View style={styles.spark} accessibilityLabel="Bodhin revenue, last 9 months">
        {d.history.bodhin.map((v, i) => <View key={i} style={{ flex: 1, height: 6 + (v / max) * 34, borderRadius: 4, backgroundColor: i === d.history.bodhin.length - 1 ? '#E8A21B' : 'rgba(255,255,255,0.28)' }} />)}
      </View>
    </View>
  );
}

const HeroPart = ({ v, l }: { v: string; l: string }) => (
  <View style={{ flex: 1, minWidth: 0 }}>
    <Txt variant="bodyStrong" color="#fff" numberOfLines={1} adjustsFontSizeToFit>{v}</Txt>
    <Txt variant="caption" color="rgba(255,255,255,0.7)" numberOfLines={1}>{l}</Txt>
  </View>
);

function Tile({ icon, tint, color, n, value, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; tint: string; color: string; n: number; value?: string; label: string; onPress: () => void }) {
  const { c } = useTheme();
  const zero = n === 0 && !value;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, { backgroundColor: c.surface, borderColor: zero ? c.border : color + '55' }, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`${value ?? n} ${label}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={[styles.tileIcon, { backgroundColor: tint }]}><Ionicons name={icon} size={20} color={color} /></View>
        {!zero && <View style={[styles.dot, { backgroundColor: color }]} />}
      </View>
      <Txt variant="title" style={{ fontSize: 22, lineHeight: 28, fontVariant: ['tabular-nums'] }} color={zero ? c.muted : c.ink} numberOfLines={1} adjustsFontSizeToFit>{value ?? n}</Txt>
      <Txt variant="caption" color={c.inkSoft} numberOfLines={2}>{label}{value ? ` · ${n} workspace${n === 1 ? '' : 's'}` : ''}</Txt>
    </Pressable>
  );
}

function Kpi({ v, l, sub, tone, onPress }: { v: string; l: string; sub: string; tone?: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.kpi, { backgroundColor: c.surface, borderColor: c.border }, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`${v} ${l}`}>
      <Txt variant="heading" color={tone} style={{ fontVariant: ['tabular-nums'] }}>{v}</Txt>
      <Txt variant="caption" color={c.ink} numberOfLines={1}>{l}</Txt>
      <Txt variant="caption" color={c.muted} numberOfLines={1}>{sub}</Txt>
    </Pressable>
  );
}

function Split({ parts }: { parts: { label: string; sub: string; v: number; color: string }[] }) {
  const { c } = useTheme();
  const total = parts.reduce((s, p) => s + p.v, 0) || 1;
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.bar}>{parts.map((p) => <View key={p.label} style={{ flex: Math.max(0.02, p.v / total), backgroundColor: p.color }} />)}</View>
      {parts.map((p) => (
        <View key={p.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.dot, { backgroundColor: p.color, width: 10, height: 10 }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="label">{p.label}</Txt>
            <Txt variant="caption" color={c.muted}>{p.sub}</Txt>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{lakh(p.v)}</Txt>
            <Txt variant="caption" color={c.muted}>{Math.round((p.v / total) * 100)}%</Txt>
          </View>
        </View>
      ))}
    </View>
  );
}

function AlertRow({ a, onPress }: { a: AdminAlert; onPress: () => void }) {
  const { c } = useTheme();
  const col = a.tone === 'danger' ? c.danger : a.tone === 'warning' ? c.warning : c.info;
  const bg = a.tone === 'danger' ? c.dangerBg : a.tone === 'warning' ? c.warningBg : c.infoBg;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.alert, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={a.title}>
      <View style={[styles.alertIcon, { backgroundColor: bg }]}><Ionicons name={a.icon as keyof typeof Ionicons.glyphMap} size={18} color={col} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" numberOfLines={2}>{a.title}</Txt>
        <Txt variant="caption" color={c.muted} numberOfLines={1}>{a.sub}</Txt>
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.muted} />
    </Pressable>
  );
}

function Rule({ v, l }: { v: string; l: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.rule, { backgroundColor: c.surfaceMuted }]}>
      <Txt variant="bodyStrong">{v}</Txt>
      <Txt variant="caption" color={c.muted} numberOfLines={1}>{l}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 30 },
  inner: { width: '100%', maxWidth: 720, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8 },
  hero: { borderRadius: 22, padding: 18, gap: 6, backgroundColor: '#071F44' },
  heroSplit: { flexDirection: 'row', gap: 10, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 42, marginTop: 8 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: '30%', minWidth: 150, borderWidth: 1.5, borderRadius: 18, padding: 12, gap: 4 },
  tileIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: { flexGrow: 1, flexBasis: '45%', minWidth: 140, borderWidth: 1, borderRadius: 16, padding: 12 },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  alertIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  act: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  rules: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rule: { flexGrow: 1, flexBasis: '30%', minWidth: 120, borderRadius: 12, padding: 10 },
});
