/** Money — Payouts (weekly run) · Refunds · Billing · Reports. Finance works here; every action is logged. */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, money } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { BottomSheet, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, KV, fmtDay, inr } from '@/ui/section';
import { ago, initials, lakh } from '@/ui/admin';

type Tab = 'payouts' | 'refunds' | 'billing' | 'reports';
const TABS: [Tab, string][] = [['payouts', 'Payouts'], ['refunds', 'Refunds'], ['billing', 'Billing'], ['reports', 'Reports']];

export default function Money() {
  const p = useLocalSearchParams<{ tab?: Tab }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [tab, setTab] = useState<Tab>(p.tab ?? 'payouts');
  const [rev, setRev] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (p.tab) setTab(p.tab); }, [p.tab]);
  useFocusEffect(useCallback(() => setRev((r) => r + 1), []));
  const done = (m: string) => { setMsg(m); setRev((r) => r + 1); setTimeout(() => setMsg(null), 3500); };
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={styles.head}><Txt variant="title">Money</Txt></View>
        <View style={styles.tabs}>
          {TABS.map(([k, l]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, { backgroundColor: tab === k ? c.primary : c.surface, borderColor: tab === k ? c.primary : c.border }]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
              <Txt variant="label" color={tab === k ? '#fff' : c.ink}>{l}</Txt>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            {msg && <Banner tone="success" text={msg} />}
            {tab === 'payouts' && <Payouts key={rev} userId={userId} done={done} />}
            {tab === 'refunds' && <Refunds key={rev} userId={userId} done={done} />}
            {tab === 'billing' && <Billing key={rev} userId={userId} done={done} />}
            {tab === 'reports' && <Reports key={rev} userId={userId} />}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Payouts({ userId, done }: { userId: string; done: (m: string) => void }) {
  const { c } = useTheme();
  const d = money.payoutRun(userId);
  const [hold, setHold] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<null | 'approve' | 'release'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, m: string) => { setBusy(true); setErr(null); try { await fn(); setConfirm(null); done(m); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); } finally { setBusy(false); } };
  const ready = d.lines.filter((l) => !l.blocked);
  return (
    <>
      {d.approved ? (
        <View style={[styles.hero, { backgroundColor: '#0F5132' }]}>
          <Txt variant="caption" color="rgba(255,255,255,0.8)">Approved by {d.approved.approvedBy} · {ago(d.approved.approvedAt)}</Txt>
          <Txt variant="display" color="#fff">{inr(d.approved.lines.reduce((s, l) => s + l.amount, 0))}</Txt>
          <Txt color="rgba(255,255,255,0.85)">{d.approved.lines.length} workspaces · ready to release via RazorpayX</Txt>
          {d.canRun && <Button title="Release payouts now" iconLeft="send" style={{ backgroundColor: '#E8A21B', marginTop: 6 }} onPress={() => setConfirm('release')} />}
        </View>
      ) : (
        <View style={[styles.hero, { backgroundColor: '#071F44' }]}>
          <Txt variant="caption" color="rgba(255,255,255,0.75)">Next payout run · {new Date(d.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</Txt>
          <Txt variant="display" color="#fff">{inr(d.readyTotal)}</Txt>
          <Txt color="rgba(255,255,255,0.85)">{ready.length} workspaces ready{d.heldTotal ? ` · ${inr(d.heldTotal)} blocked/held` : ''}</Txt>
          <Txt variant="caption" color="rgba(255,255,255,0.7)">Marketplace sales older than {d.cfg.refundHoldDays} days, minus {Math.round(d.cfg.commissionRate * 100)}% commission and {Math.round(d.cfg.gatewayFeeRate * 100)}% gateway fee. Next week so far: {inr(d.nextWeek)}</Txt>
          {d.canRun && <Button title={`Review & approve ${ready.length}`} iconLeft="checkmark-done" disabled={!ready.length} style={{ backgroundColor: '#E8A21B', marginTop: 6 }} onPress={() => setConfirm('approve')} />}
        </View>
      )}
      {!d.canRun && <Banner tone="info" text="View only — Finance or Super Admin approves payout runs." />}
      {!d.approved && (
        <Card title={`This run · ${d.lines.length}`}>
          {d.lines.map((l) => (
            <View key={l.t.id} style={[styles.line, { borderColor: l.blocked ? c.warning : c.border, backgroundColor: l.blocked ? c.warningBg : c.surface }]}>
              <View style={[styles.logo, { backgroundColor: l.t.branding.primary }]}><Txt variant="caption" color="#fff">{initials(l.t.branding.displayName)}</Txt></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong" numberOfLines={1}>{l.t.branding.displayName}</Txt>
                <Txt variant="caption" color={l.blocked ? c.warning : c.muted} numberOfLines={2}>{l.blocked ?? `${l.bank} · ${l.orders} sales`}{l.refundHold ? ` · ${inr(l.refundHold)} kept for open refund` : ''}</Txt>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Txt variant="bodyStrong">{inr(l.amount)}</Txt>
                {d.canRun && (l.hold ? <Pressable onPress={() => { money.release(userId, l.t.id); done(`${l.t.branding.displayName}: hold released`); }} hitSlop={8} accessibilityRole="button"><Txt variant="caption" color={c.primary}>Release hold</Txt></Pressable> : l.bank && <Pressable onPress={() => { setHold(l.t.id); setReason(''); setErr(null); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Hold ${l.t.branding.displayName}`}><Txt variant="caption" color={c.danger}>Hold</Txt></Pressable>)}
              </View>
            </View>
          ))}
          {!d.lines.length && <Txt color={c.muted}>Nothing due this week.</Txt>}
        </Card>
      )}
      {d.approved && <Card title="Approved lines">{d.approved.lines.map((l) => <KV key={l.tenantId} k={`${l.name} · ${l.bank}`} v={inr(l.amount)} />)}</Card>}
      <Card title="Past runs">
        {d.runs.filter((r) => r.status === 'paid').map((r) => (
          <View key={r.id} style={{ gap: 4 }}>
            <KV k={`${fmtDay(r.paidAt ?? r.date)} · ${r.lines.length} workspaces`} v={inr(r.lines.reduce((s, l) => s + l.amount, 0))} strong />
            <Txt variant="caption" color={c.muted}>Approved by {r.approvedBy} · {r.lines.slice(0, 3).map((l) => `${l.name.split(' ')[0]} ${l.utr}`).join(' · ')}{r.lines.length > 3 ? ' …' : ''}</Txt>
          </View>
        ))}
        <Pressable onPress={async () => { const r = d.runs.find((x) => x.status === 'paid'); if (r) try { await Share.share({ message: ['Workspace,Bank,Amount,UTR', ...r.lines.map((l) => `"${l.name}",${l.bank},${l.amount},${l.utr ?? ''}`)].join('\n') }); } catch { /* ignore */ } }} hitSlop={8} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }} accessibilityRole="button">
          <Ionicons name="download-outline" size={16} color={c.primary} /><Txt variant="label" color={c.primary}>Export last run (CSV)</Txt>
        </Pressable>
      </Card>

      <BottomSheet open={!!hold} onClose={() => setHold(null)} title="Hold payouts" footer={<Button title="Hold" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={() => { try { money.hold(userId, hold!, reason); setHold(null); done('Payout held'); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); } }} />}>
        <View style={{ gap: 8 }}>
          <Txt color={c.inkSoft}>Money stays with Bodhin until you release the hold. The educator sees “On hold” in their statement.</Txt>
          <TextInput value={reason} onChangeText={setReason} placeholder="Reason, e.g. KYC re-check, refund dispute" placeholderTextColor={c.muted} style={[styles.input, { borderColor: c.border, color: c.ink }]} accessibilityLabel="Reason" />
          {err && <Banner text={err} />}
        </View>
      </BottomSheet>
      <BottomSheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm === 'approve' ? 'Approve payout run?' : 'Release payouts?'} footer={<Button title={confirm === 'approve' ? `Approve ${inr(d.readyTotal)}` : 'Release now'} size="md" loading={busy} style={{ flex: 1 }} onPress={() => (confirm === 'approve' ? run(() => money.approveRun(userId), 'Run approved — release when ready') : run(() => money.releaseRun(userId, d.approved!.id), 'Payouts sent · educators notified with UTR'))} />}>
        <View style={{ gap: 6 }}>
          {confirm === 'approve' ? ready.map((l) => <KV key={l.t.id} k={l.t.branding.displayName} v={inr(l.amount)} />) : <Txt color={c.inkSoft}>Transfers {d.approved ? inr(d.approved.lines.reduce((s, l) => s + l.amount, 0)) : ''} to {d.approved?.lines.length} bank accounts. Orders are marked paid and each educator gets the UTR.</Txt>}
          {err && <Banner text={err} />}
        </View>
      </BottomSheet>
    </>
  );
}

function Refunds({ userId, done }: { userId: string; done: (m: string) => void }) {
  const { c } = useTheme();
  const d = money.refunds(userId);
  const [sel, setSel] = useState<(typeof d.rows)[number] | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const decide = async (k: 'approved' | 'rejected') => { setBusy(true); setErr(null); try { await money.decideRefund(userId, sel!.r.id, k, note); setSel(null); done(k === 'approved' ? 'Refund approved · learner and educator notified' : 'Refund rejected · learner notified'); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); } finally { setBusy(false); } };
  return (
    <>
      {d.rows.length === 0 && <Card><Txt color={c.muted}>No refund requests.</Txt></Card>}
      {d.rows.map((x) => (
        <Pressable key={x.r.id} onPress={() => { setSel(x); setNote(''); setErr(null); }} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, opacity: x.r.status === 'open' ? 1 : 0.6 }]} accessibilityRole="button" accessibilityLabel={`Refund ${x.r.buyer} ${x.r.course}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{x.r.buyer} · {inr(x.r.amountInr)}</Txt>
            <Pill text={x.r.status === 'open' ? (x.plan.payer === 'educator' ? 'Educator refunds' : 'Needs decision') : x.r.status} tone={x.r.status === 'open' ? 'warning' : x.r.status === 'approved' ? 'success' : 'neutral'} />
          </View>
          <Txt variant="caption" color={c.muted} numberOfLines={1}>{x.r.course} · {x.o?.channel === 'bodhin_marketplace' ? 'Marketplace' : x.o?.channel === 'tutor_direct' ? 'Direct sale' : 'Bodhin course'} · {ago(x.r.at)}</Txt>
          <Txt color={c.inkSoft}>“{x.r.reason}”</Txt>
        </Pressable>
      ))}
      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel ? `Refund · ${sel.r.buyer}` : ''} footer={sel?.r.status === 'open' && d.canRefund && sel.plan.payer === 'bodhin' ? <>
        <Button title="Reject" variant="outline" size="md" style={{ flex: 1 }} onPress={() => decide('rejected')} />
        <Button title={`Refund ${inr(sel.r.amountInr)}`} size="md" loading={busy} style={{ flex: 1.3 }} onPress={() => decide('approved')} />
      </> : undefined}>
        {sel && (
          <View style={{ gap: 6 }}>
            <Txt color={c.inkSoft}>{sel.r.course}{sel.o ? ` · ${sel.o.invoiceNo} · bought ${fmtDay(sel.o.createdAt)}` : ''}</Txt>
            {sel.plan.lines.map(([k, v]) => <KV key={k} k={k} v={v} />)}
            <Txt variant="caption" color={c.muted}>{sel.plan.note}</Txt>
            {sel.r.status === 'open' && sel.plan.payer === 'bodhin' && <TextInput value={note} onChangeText={setNote} placeholder="Note to learner (required to reject)" placeholderTextColor={c.muted} style={[styles.input, { borderColor: c.border, color: c.ink }]} accessibilityLabel="Note" />}
            {err && <Banner text={err} />}
          </View>
        )}
      </BottomSheet>
    </>
  );
}

function Billing({ userId, done }: { userId: string; done: (m: string) => void }) {
  const { c } = useTheme();
  const d = money.billing(userId);
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <>
      <Card title={`Subscription MRR · ${inr(d.mrr)}`}>
        {d.byPlan.map((x) => <KV key={x.p.id} k={`${x.p.name} · ${x.n} paying`} v={inr(x.mrr)} />)}
      </Card>
      <Card title={`Payment failed · ${d.pastDue.length}`}>
        {d.pastDue.length === 0 && <Txt color={c.muted}>None.</Txt>}
        {d.pastDue.map((x) => (
          <View key={x.t.id} style={{ gap: 8 }}>
            <KV k={`${x.t.branding.displayName} · ${x.days} days overdue`} v={inr(x.amount)} strong />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Send reminder" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { money.remind(userId, x.t.id, 'past_due'); done('Reminder sent to owner'); }} />
              <Button title="Retry charge" size="md" loading={busy === x.t.id} style={{ flex: 1 }} onPress={async () => { setBusy(x.t.id); await money.retryCharge(userId, x.t.id); setBusy(null); done('Payment succeeded · renewed'); }} />
            </View>
          </View>
        ))}
      </Card>
      <Card title={`Trials ending · ${d.trials.length}`}>
        {d.trials.map((x) => (
          <View key={x.t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>{x.t.branding.displayName}</Txt>
              <Txt variant="caption" color={c.muted}>{x.days} days left · {x.ready ? 'gateway connected' : 'no gateway yet'}</Txt>
            </View>
            <Button title="Nudge" size="md" variant="outline" onPress={() => { money.remind(userId, x.t.id, 'trial'); done('Trial reminder sent'); }} />
          </View>
        ))}
      </Card>
      <Card title="Renewing in 14 days">
        {d.renewals.length === 0 && <Txt color={c.muted}>None.</Txt>}
        {d.renewals.map((x) => <KV key={x.t.id} k={`${x.t.branding.displayName} · ${fmtDay(x.at)}${x.locked ? ' · old price' : ''}`} v={inr(x.amount)} />)}
      </Card>
      <Card title="Latest invoices">
        {d.invoices.map(({ i, name }) => <KV key={i.id} k={`${fmtDay(i.at)} · ${name}`} v={inr(i.amountInr)} />)}
      </Card>
    </>
  );
}

function Reports({ userId }: { userId: string }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const [d, setD] = useState<Awaited<ReturnType<typeof money.report>> | null>(null);
  useEffect(() => { money.report(userId).then(setD); }, [userId]);
  if (!d) return null;
  const k = d.ov.kpis;
  const max = Math.max(...d.ov.history.gmv, 1);
  const csv = () => ['Month,GMV,Bodhin revenue', ...d.months.map((m, i) => `${m},${d.ov.history.gmv[i]},${d.ov.history.bodhin[i]}`)].join('\n');
  return (
    <>
      <View style={[styles.kpis, width >= 900 && { flexWrap: 'nowrap' }]}>
        <Kpi v={lakh(k.gmv)} l="GMV this month" />
        <Kpi v={lakh(k.bodhinRevenue)} l="Bodhin revenue" />
        <Kpi v={lakh(k.commission)} l="Commission" />
        <Kpi v={lakh(d.refunded)} l="Refunded" />
      </View>
      <Card title="GMV vs Bodhin revenue · 9 months (this month = pace)" right={<Pressable onPress={async () => { try { await Share.share({ message: csv() }); } catch { /* ignore */ } }} hitSlop={8} accessibilityRole="button"><Txt variant="label" color={c.primary}>CSV</Txt></Pressable>}>
        <View style={styles.chart} accessibilityLabel="Monthly GMV and Bodhin revenue chart">
          {d.ov.history.gmv.map((g, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <View style={{ height: 120, justifyContent: 'flex-end', flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
                <View style={{ width: 9, height: Math.max(4, (g / max) * 120), backgroundColor: c.info, borderRadius: 3, opacity: i === 8 ? 0.6 : 1 }} />
                <View style={{ width: 9, height: Math.max(4, (d.ov.history.bodhin[i] / max) * 120), backgroundColor: '#E8A21B', borderRadius: 3, opacity: i === 8 ? 0.6 : 1 }} />
              </View>
              <Txt variant="caption" color={c.muted} style={{ fontSize: 10 }}>{d.months[i]}</Txt>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <Legend color={c.info} l="GMV (all sales)" /><Legend color="#E8A21B" l="Bodhin revenue" />
        </View>
      </Card>
      <Card title="Bodhin revenue mix · this month">
        <KV k="Subscriptions (MRR)" v={inr(k.mrr)} />
        <KV k={`Marketplace commission (${Math.round(d.ov.cfg.commissionRate * 100)}%)`} v={inr(k.commission)} />
        <KV k="Bodhin’s own courses" v={inr(k.ownSales)} />
        <KV k="Total" v={inr(k.bodhinRevenue)} strong />
      </Card>
      <Card title="Top workspaces by sales">
        {d.topWorkspaces.map((x, i) => <Pressable key={x.t.id} onPress={() => router.push({ pathname: '/admin/tenant/[id]', params: { id: x.t.id } })} accessibilityRole="button"><KV k={`${i + 1}. ${x.t.branding.displayName}`} v={lakh(x.gmv)} /></Pressable>)}
      </Card>
      <Card title="Top courses this month (recorded orders)">
        {d.topCourses.map((x, i) => <KV key={x.title} k={`${i + 1}. ${x.title.slice(0, 34)} · ${x.n}`} v={inr(x.gross)} />)}
      </Card>
    </>
  );
}

const Kpi = ({ v, l }: { v: string; l: string }) => {
  const { c } = useTheme();
  return <View style={[styles.kpi, { backgroundColor: c.surface, borderColor: c.border }]}><Txt variant="heading" numberOfLines={1} adjustsFontSizeToFit>{v}</Txt><Txt variant="caption" color={c.muted} numberOfLines={1}>{l}</Txt></View>;
};
const Legend = ({ color, l }: { color: string; l: string }) => {
  const { c } = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} /><Txt variant="caption" color={c.inkSoft}>{l}</Txt></View>;
};

const styles = StyleSheet.create({
  head: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8, flexWrap: 'wrap' },
  tab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 30 },
  inner: { width: '100%', maxWidth: 860, gap: 12 },
  hero: { borderRadius: 22, padding: 18, gap: 4 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 10 },
  logo: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 46, fontSize: 15 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: { flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderRadius: 14, padding: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, paddingTop: 6 },
});
