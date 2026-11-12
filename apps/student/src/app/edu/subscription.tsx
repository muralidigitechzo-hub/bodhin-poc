/** Subscription & usage: current plan, usage with the 70/85/100% policy, add-ons, plan compare (monthly/annual), invoices. */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Cols, Grid, useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, subscriptionApi } from '@/api/client';
import type { Plan } from '@/core/plans';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { BottomSheet, Pill, ProgressBar } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Stepper } from '@/ui/pickers';
import { Card, KV, ScreenTop, fmtDay, inr, shared } from '@/ui/section';

type Data = ReturnType<typeof subscriptionApi.overview>;
type Addon = Data['addons'][number];

export default function Subscription() {
  const { isDesktop } = useLayout();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [d, setD] = useState<Data | null>(null);
  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual');
  const [pick, setPick] = useState<Plan | null>(null);
  const [addon, setAddon] = useState<Addon | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    try {
      const x = subscriptionApi.overview(userId);
      setD(x);
      setBilling(x.sub.billing);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Not available');
    }
  }, [userId]);
  useFocusEffect(load);
  if (!d) return <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20 }}>{err && <Banner text={err} />}</SafeAreaView>;
  const { ctx, sub } = d;
  const plan = ctx.ent.plan;
  const LEVEL = { ok: c.success, warn: c.warning, critical: '#E8833A', limit: c.danger } as const;

  const doPlan = async () => {
    if (!pick) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await subscriptionApi.changePlan(userId, pick.id, billing);
      setMsg(r.mode === 'now' ? `You’re now on ${pick.name} (${billing}). New limits apply immediately.` : `${pick.name} starts on ${fmtDay(r.at!)}. You keep ${plan.name} until then.`);
      setPick(null);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not change plan.');
      setPick(null);
    } finally {
      setBusy(false);
    }
  };
  const doAddon = async () => {
    if (!addon) return;
    setBusy(true);
    try {
      await subscriptionApi.buyAddon(userId, addon.kind, qty);
      setMsg(`${addon.label} added. Your new limits are live.`);
      setAddon(null);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not add.');
      setAddon(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Subscription & usage" sub={`${ctx.tenant.branding.displayName}`} />
        <ScrollView contentContainerStyle={[shared.scroll, isDesktop && { paddingHorizontal: 32, paddingTop: 8, paddingBottom: 48 }]} showsVerticalScrollIndicator={false}>
          <View style={[shared.inner, isDesktop && { maxWidth: 1180 }]}>
            {msg && <Banner tone="success" text={msg} />}
            {d.priceLock && <Banner tone="info" text={`Your current price (${inr(d.priceLock.monthly ?? 0)}/mo · ${inr(d.priceLock.annual ?? 0)}/yr) is kept until ${fmtDay(d.priceLock.until)}. The new ${plan.name} price applies after that.`} />}
            {err && <Banner text={err} />}
            <View style={[styles.hero, { backgroundColor: c.primaryDeep }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt variant="title" color="#fff" style={{ flex: 1 }}>{plan.name}</Txt>
                <Pill text={sub.status === 'trialing' ? `Trial · ${ctx.trialDaysLeft} days left` : sub.status === 'past_due' ? 'Payment due' : 'Active'} tone={sub.status === 'active' ? 'success' : 'warning'} />
              </View>
              <Txt color="rgba(255,255,255,0.8)">{sub.billing === 'annual' ? 'Annual' : 'Monthly'} billing · renews {fmtDay(sub.periodEnd)}</Txt>
              <Txt variant="caption" color="rgba(255,255,255,0.7)">≈ {inr(d.monthly.total)}/month incl. add-ons (+18% GST)</Txt>
              {sub.pending && (
                <View style={[styles.pending, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
                  <Txt variant="caption" color="#fff" style={{ flex: 1 }}>Changing to {sub.pending.plan[0].toUpperCase() + sub.pending.plan.slice(1)} ({sub.pending.billing}) on {fmtDay(sub.pending.at)}</Txt>
                  <Pressable onPress={() => { subscriptionApi.cancelPending(userId); load(); }} accessibilityRole="button" hitSlop={8}><Txt variant="label" color="#E8A21B">Undo</Txt></Pressable>
                </View>
              )}
            </View>

            <Cols>
            <Card title="Usage this period">
              {ctx.usage.rows.map((r) => (
                <View key={r.key} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Txt variant="label">{r.label}</Txt>
                    <Txt variant="label" color={LEVEL[r.level]}>{r.used}{r.unit && ` ${r.unit}`} / {r.limit ?? '∞'}{r.unit && ` ${r.unit}`} · {r.pct}%</Txt>
                  </View>
                  <ProgressBar pct={r.pct} color={LEVEL[r.level]} height={8} />
                  {r.level !== 'ok' && <Txt variant="caption" color={c.muted}>{r.level === 'limit' ? r.atLimit : r.level === 'critical' ? 'Above 85% — consider a top-up so nothing pauses.' : 'Above 70% — just a heads-up.'}</Txt>}
                </View>
              ))}
              <Txt variant="caption" color={c.muted}>At 100% only new uploads / enrolments / scheduling pause. Nothing is ever deleted and running classes are never cut.</Txt>
            </Card>
            <Card title="Add-ons">
              {d.addons.map((a) => (
                <View key={a.kind} style={styles.addon}>
                  <View style={[styles.addonIcon, { backgroundColor: c.primarySoft }]}><Ionicons name={a.icon as never} size={18} color={c.primary} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="bodyStrong">{a.label}</Txt>
                    <Txt variant="caption" color={c.muted}>{a.unit} · {inr(a.monthlyInr)}/mo{a.qty ? ` · you have ${a.kind === 'custom_domain' ? 'it' : `×${a.qty}`}` : ''}</Txt>
                  </View>
                  {a.included || (a.kind === 'custom_domain' && a.qty) ? <Pill text={a.included ? 'Included' : 'Active'} tone="success" /> : (
                    <Button title="Add" size="md" variant="outline" onPress={() => { setAddon(a); setQty(1); setErr(null); }} />
                  )}
                </View>
              ))}
            </Card>
            </Cols>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt variant="heading">Plans</Txt>
              <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]}>
                {(['monthly', 'annual'] as const).map((b) => (
                  <Pressable key={b} onPress={() => setBilling(b)} style={[styles.segBtn, billing === b && { backgroundColor: c.surface }]} accessibilityRole="tab" accessibilityState={{ selected: billing === b }}>
                    <Txt variant="label" color={billing === b ? c.primary : c.inkSoft}>{b === 'monthly' ? 'Monthly' : 'Annual · save 20%'}</Txt>
                  </Pressable>
                ))}
              </View>
            </View>
            <Grid cols={isDesktop ? 4 : 1} gap={12}>
            {d.plans.map(({ p, blockers, current }) => {
              const price = billing === 'annual' ? p.annualInr : p.monthlyInr;
              const same = current && billing === sub.billing;
              return (
                <View key={p.id} style={[styles.plan, { backgroundColor: c.surface, borderColor: current ? c.primary : p.recommended ? c.accent : c.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Txt variant="heading" style={{ flex: 1 }}>{p.name}</Txt>
                    {current && <Pill text="Current" tone="info" />}
                    {!current && p.recommended && <Pill text="Popular" tone="gold" />}
                  </View>
                  <Txt variant="caption" color={c.muted}>{p.bestFor}</Txt>
                  <Txt variant="title" style={{ fontSize: 22 }}>{price == null ? 'Custom' : `${inr(price)}`}<Txt variant="caption" color={c.muted}>{price == null ? '' : billing === 'annual' ? ' /year' : ' /month'}</Txt></Txt>
                  <View style={styles.limits}>
                    {[[p.activeStudents, 'students'], [p.videoStorageGb, 'GB video'], [p.liveRoomHoursPerMonth, 'live h/mo'], [p.tutorSeats, p.tutorSeats === 1 ? 'tutor' : 'tutors']].map(([v, l]) => (
                      <Txt key={String(l)} variant="caption" color={c.inkSoft}>• {v ?? 'Custom'} {l}</Txt>
                    ))}
                    <Txt variant="caption" color={c.inkSoft}>• Custom domain {p.customDomain === 'included' ? 'included' : p.customDomain === 'addon' ? 'as add-on' : 'custom'}</Txt>
                  </View>
                  {blockers.length > 0 && !current && <Txt variant="caption" color={c.warning}>Over this plan’s limits: {blockers.join(', ')}</Txt>}
                  {!same && (
                    <Button
                      title={p.monthlyInr == null ? 'Talk to us' : current ? `Switch to ${billing}` : (p.monthlyInr ?? 0) > (plan.monthlyInr ?? 0) ? `Upgrade to ${p.name}` : `Change to ${p.name}`}
                      size="md"
                      variant={(p.monthlyInr ?? 0) > (plan.monthlyInr ?? 0) ? 'primary' : 'outline'}
                      disabled={blockers.length > 0 && !current}
                      onPress={() => { setErr(null); setMsg(null); if (p.monthlyInr == null) setMsg('Our team will reach out within one working day for an Enterprise quote.'); else setPick(p); }}
                    />
                  )}
                </View>
              );
            })}
            </Grid>

            <Card title="Billing history">
              {d.invoices.map((i) => (
                <View key={i.id} style={styles.addon}>
                  <Ionicons name="receipt-outline" size={20} color={c.inkSoft} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="label" numberOfLines={2}>{i.description}</Txt>
                    <Txt variant="caption" color={c.muted}>{i.no} · {fmtDay(i.at)}</Txt>
                  </View>
                  <Txt variant="bodyStrong">{inr(i.amountInr)}</Txt>
                </View>
              ))}
              <Txt variant="caption" color={c.muted}>Invoices include 18% GST{ctx.tenant.payments?.gstin ? ` · GSTIN ${ctx.tenant.payments.gstin}` : ''}.</Txt>
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick ? `${(pick.monthlyInr ?? 0) > (plan.monthlyInr ?? 0) || (pick.id === plan.id) ? 'Upgrade' : 'Change'} to ${pick.name}` : ''} footer={<Button title="Confirm" size="md" loading={busy} style={{ flex: 1 }} onPress={doPlan} />}>
        {pick && (
          <View style={{ gap: 6 }}>
            <KV k="Price" v={`${inr((billing === 'annual' ? pick.annualInr : pick.monthlyInr) ?? 0)} ${billing === 'annual' ? '/year' : '/month'} + GST`} strong />
            {(pick.monthlyInr ?? 0) > (plan.monthlyInr ?? 0) || pick.id === plan.id ? (
              <Txt color={c.inkSoft}>Starts now. Unused time on {plan.name} is credited to this invoice (simulated payment in the POC).</Txt>
            ) : (
              <Txt color={c.inkSoft}>Takes effect on {fmtDay(sub.periodEnd)} when your current period ends. Nothing changes before then.</Txt>
            )}
          </View>
        )}
      </BottomSheet>
      <BottomSheet open={!!addon} onClose={() => setAddon(null)} title={addon ? `Add ${addon.label.toLowerCase()}` : ''} footer={<Button title={addon ? `Pay ${inr(addon.monthlyInr * (addon.kind === 'custom_domain' ? 1 : qty) * 1.18 * 0.8)} now` : 'Pay'} size="md" loading={busy} style={{ flex: 1 }} onPress={doAddon} />}>
        {addon && (
          <View style={{ gap: 10 }}>
            <Txt color={c.inkSoft}>{addon.unit} for {inr(addon.monthlyInr)}/month each. Billed with your plan; today’s charge is prorated.</Txt>
            {addon.kind !== 'custom_domain' && <Stepper label="Quantity" value={qty} onChange={setQty} min={1} max={10} />}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 20, padding: 18, gap: 4 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 10, marginTop: 6 },
  addon: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  addonIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segBtn: { paddingHorizontal: 10, minHeight: 36, borderRadius: 10, justifyContent: 'center' },
  plan: { borderWidth: 1.5, borderRadius: 18, padding: 14, gap: 6 },
  limits: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 },
});
