/** Workspace 360 — one panel for everything about a tenant + every admin action (reason required, audited). */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, tenantsAdmin } from '@/api/client';
import { ADDON_CATALOG } from '@/core/business';
import { PLANS, type PlanId } from '@/core/plans';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';
import { Button } from './Button';
import { TextField } from './TextField';
import { Avatar, BottomSheet, Chip, Pill, ProgressBar } from './kit';
import { Banner } from './misc';
import { PillTabs, Stepper } from './pickers';
import { KV, ToggleRow, fmtDay, inr } from './section';
import { ago, initials, lakh } from './admin';

type D = NonNullable<ReturnType<typeof tenantsAdmin.detail>>;
type Tab = 'overview' | 'plan' | 'money' | 'people' | 'notes' | 'owner';
type Sheet = null | 'plan' | 'trial' | 'status' | 'addon' | 'overrides' | 'paid' | 'message';
const LEVEL = { ok: '#15803D', warn: '#B7791F', critical: '#E8833A', limit: '#D93A3F' } as const;
const LIMIT_KEYS = [['activeStudents', 'Active students'], ['storageGb', 'Video storage (GB)'], ['liveHours', 'Live hours / month'], ['tutorSeats', 'Tutor seats']] as const;

export function TenantPanel({ id, userId, onChanged }: { id: string; userId: string; onChanged?: (msg: string) => void }) {
  const { c } = useTheme();
  const [rev, setRev] = useState(0);
  const d = tenantsAdmin.detail(userId, id);
  const [tab, setTab] = useState<Tab>('overview');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [actions, setActions] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [owner, setOwner] = useState<Awaited<ReturnType<typeof tenantsAdmin.ownerView>> | null>(null);
  const [note, setNote] = useState('');
  void rev;
  if (!d) return <Banner text="Workspace not found." />;
  const { t, sub } = d;
  const refresh = (m: string) => { setRev((r) => r + 1); setMsg(m); setSheet(null); onChanged?.(m); setTimeout(() => setMsg(null), 3500); };
  const statusPill = d.flags.suspended ? <Pill text="Suspended" tone="live" /> : d.flags.cancelled ? <Pill text="Cancelled" tone="neutral" /> : d.flags.pastDue ? <Pill text="Payment failed" tone="live" /> : d.flags.trial ? <Pill text={`Trial · ${d.flags.trialDays}d left`} tone="warning" /> : <Pill text="Active" tone="success" />;
  const plan = PLANS.find((p) => p.id === sub?.plan)!;

  const ACTIONS: { k: Sheet; icon: keyof typeof Ionicons.glyphMap; l: string; show: boolean; danger?: boolean }[] = [
    { k: 'plan', icon: 'swap-vertical', l: 'Change plan', show: true },
    { k: 'trial', icon: 'hourglass', l: 'Extend trial', show: d.flags.trial },
    { k: 'paid', icon: 'checkmark-done', l: 'Record payment', show: d.flags.pastDue },
    { k: 'addon', icon: 'add-circle', l: 'Add capacity / add-on', show: true },
    { k: 'overrides', icon: 'options', l: 'Feature & limit overrides', show: true },
    { k: 'message', icon: 'chatbubble-ellipses', l: 'Message owner', show: true },
    { k: 'status', icon: d.flags.suspended ? 'play-circle' : 'pause-circle', l: d.flags.suspended ? 'Reactivate workspace' : 'Suspend workspace', show: true, danger: !d.flags.suspended },
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 90 }} showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.logo, { backgroundColor: t.branding.primary }]}><Txt variant="bodyStrong" color="#fff">{initials(t.branding.displayName)}</Txt></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="heading" numberOfLines={2}>{t.branding.displayName}</Txt>
              <Txt variant="caption" color={c.muted} numberOfLines={1}>{t.customDomain ?? `${t.slug}.thebodhin.com`} · since {t.createdAt ? fmtDay(t.createdAt) : '—'}</Txt>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{statusPill}<Pill text={`${plan.name} · ${sub?.billing}`} tone="info" />{sub?.pending && <Pill text={`→ ${sub.pending.plan} on ${fmtDay(sub.pending.at)}`} tone="neutral" />}</View>
          <View style={styles.stats}>
            <Stat v={inr(d.mrr)} l="MRR" />
            <Stat v={lakh(d.gmv)} l="Sales this month" />
            <Stat v={d.students.toLocaleString('en-IN')} l="Active students" />
          </View>
          {msg && <Banner tone="success" text={msg} />}
        </View>
        <View style={{ backgroundColor: c.ivory, paddingVertical: 4 }}>
          <PillTabs<Tab> value={tab} onChange={(x) => { setTab(x); if (x === 'owner' && !owner && d.canManage) tenantsAdmin.ownerView(userId, id).then(setOwner).catch(() => {}); }} tabs={[
            { id: 'overview', label: 'Overview', icon: 'grid-outline' },
            { id: 'plan', label: 'Plan & limits', icon: 'speedometer-outline' },
            { id: 'money', label: 'Money', icon: 'wallet-outline' },
            { id: 'people', label: 'Courses & team', icon: 'people-outline' },
            { id: 'notes', label: `Notes & log`, icon: 'list-outline' },
            ...(d.canManage ? [{ id: 'owner' as const, label: 'Owner view', icon: 'eye-outline' as const }] : []),
          ]} />
        </View>

        {tab === 'overview' && (
          <>
            <Box title="Owner">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar name={d.owner?.name ?? '?'} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong">{d.owner?.name}</Txt>
                  <Txt variant="caption" color={c.muted} numberOfLines={1}>{d.owner?.email} · {d.owner?.phone}</Txt>
                </View>
              </View>
            </Box>
            <Box title="Health">
              <Health ok={!d.flags.pastDue && !d.flags.cancelled} t={d.flags.pastDue ? 'Subscription payment failed' : d.flags.cancelled ? 'Subscription cancelled' : d.flags.trial ? `Free trial · ${d.flags.trialDays} days left` : `Subscription paid · renews ${sub ? fmtDay(sub.periodEnd) : ''}`} />
              <Health ok={!d.flags.noGateway} t={d.flags.noGateway ? 'No payment gateway — direct sales paused' : `Gateway: ${t.payments?.directGateway} live`} />
              <Health ok={!d.flags.noBank} t={d.flags.noBank ? 'No verified payout bank' : `Payout bank: ${t.payments?.payoutAccount?.bank} ••${t.payments?.payoutAccount?.last4}`} />
              <Health ok={!d.flags.alert} t={d.worst ? `Highest usage: ${d.worst.label} ${d.worst.pct}%` : 'Usage normal'} />
              <Health ok={!d.flags.domainPending} t={t.domain ? `${t.domain.host} · ${t.domain.status === 'active' ? 'live' : 'DNS pending'}` : 'No custom domain'} />
            </Box>
          </>
        )}

        {tab === 'plan' && (
          <>
            <Box title="Usage vs limits">
              {d.report?.rows.map((r) => (
                <View key={r.key} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Txt variant="label">{r.label}</Txt>
                    <Txt variant="label" color={LEVEL[r.level]}>{r.used}{r.unit && ` ${r.unit}`} / {r.limit ?? '∞'} · {r.pct}%</Txt>
                  </View>
                  <ProgressBar pct={r.pct} color={LEVEL[r.level]} height={6} />
                </View>
              ))}
            </Box>
            <Box title="Features">
              {d.features.map((f) => (
                <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 }}>
                  <Ionicons name={f.on ? 'checkmark-circle' : 'close-circle-outline'} size={18} color={f.on ? c.success : c.muted} />
                  <Txt variant="label" style={{ flex: 1, fontWeight: '400' }}>{f.label}</Txt>
                  {f.override !== undefined && <Pill text={f.override ? 'Override: on' : 'Override: off'} tone="gold" />}
                </View>
              ))}
            </Box>
            <Box title="Add-ons">
              {sub?.addons.length ? sub.addons.map((a) => <KV key={a.kind} k={ADDON_CATALOG.find((x) => x.kind === a.kind)?.label ?? a.kind} v={a.kind === 'custom_domain' ? 'Active' : `× ${a.qty}`} />) : <Txt color={c.muted}>None</Txt>}
            </Box>
          </>
        )}

        {tab === 'money' && (
          <>
            <Box title="This month">
              <KV k="Direct sales (tutor’s gateway)" v={lakh(Math.round(d.month.direct * (new Date().getDate() / 30)))} />
              <KV k="Marketplace sales (Bodhin collects)" v={lakh(Math.round(d.month.market * (new Date().getDate() / 30)))} />
              <KV k="Subscription (MRR)" v={inr(d.mrr)} strong />
            </Box>
            <Box title="Recent orders">
              {d.orders.length === 0 && <Txt color={c.muted}>No orders recorded in this demo for this workspace.</Txt>}
              {d.orders.map(({ o, course }) => <KV key={o.id} k={`${o.buyerName ?? 'Learner'} · ${course?.title.slice(0, 24) ?? ''}`} v={`${inr(o.amountInr)} · ${o.channel === 'tutor_direct' ? 'Direct' : 'Bodhin'}`} />)}
            </Box>
            <Box title="Subscription invoices">
              {d.invoices.length === 0 && <Txt color={c.muted}>No invoices yet.</Txt>}
              {d.invoices.map((i) => <KV key={i.id} k={`${fmtDay(i.at)} · ${i.description.slice(0, 34)}`} v={inr(i.amountInr)} />)}
            </Box>
          </>
        )}

        {tab === 'people' && (
          <>
            <Box title={`Courses · ${d.courseCount}`}>
              {d.courses.length === 0 && <Txt color={c.muted}>{d.courseCount} courses (details load from the API in production).</Txt>}
              {d.courses.map((co) => (
                <View key={co.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 }}>
                  <Txt variant="label" style={{ flex: 1, fontWeight: '500' }} numberOfLines={1}>{co.title}</Txt>
                  <Pill text={co.moderation === 'pending' ? 'In review' : co.visibility === 'private' ? 'Private' : co.moderation === 'rejected' ? 'Changes' : 'Listed'} tone={co.moderation === 'pending' ? 'warning' : co.visibility === 'private' ? 'neutral' : 'success'} />
                </View>
              ))}
            </Box>
            <Box title={`Team · ${d.team.length}`}>
              {d.team.map((m) => (
                <View key={m.u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Avatar name={m.u.name} size={32} />
                  <Txt style={{ flex: 1 }} numberOfLines={1}>{m.u.name}</Txt>
                  <Pill text={m.role} tone={m.role === 'owner' ? 'gold' : 'info'} />
                </View>
              ))}
            </Box>
          </>
        )}

        {tab === 'notes' && (
          <>
            <Box title="Internal notes (staff only)">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput value={note} onChangeText={setNote} placeholder="Add a note for the team…" placeholderTextColor={c.muted} style={[styles.input, { borderColor: c.border, color: c.ink }]} accessibilityLabel="Note" />
                <Button title="Add" size="md" onPress={async () => { if (!note.trim()) return; await tenantsAdmin.act(userId, id, { kind: 'note', text: note }); setNote(''); refresh('Note added'); }} />
              </View>
              {d.notes.map((n) => <View key={n.id} style={{ gap: 2 }}><Txt variant="label" style={{ fontWeight: '400' }}>{n.text}</Txt><Txt variant="caption" color={c.muted}>{n.by} · {ago(n.at)}</Txt></View>)}
            </Box>
            <Box title="Audit log">
              {d.log.length === 0 && <Txt color={c.muted}>No admin actions yet.</Txt>}
              {d.log.map((e) => <Txt key={e.id} variant="caption" color={c.inkSoft}>{ago(e.at)} · {e.actorName} · {e.summary}</Txt>)}
            </Box>
          </>
        )}

        {tab === 'owner' && (
          <Box title="What the owner sees (read-only)">
            {!owner ? <Txt color={c.muted}>Loading…</Txt> : (
              <>
                <Banner tone="info" text="Snapshot of the owner dashboard. Viewing is recorded in the audit log; nothing can be changed from here." />
                <View style={styles.stats}>
                  <Stat v={String(owner.kpis.students)} l="Students" />
                  <Stat v={String(owner.kpis.liveCourses)} l="Live courses" />
                  <Stat v={String(owner.kpis.sessionsThisMonth)} l="Classes" />
                </View>
                {owner.earnings && <KV k="Net earnings this month" v={inr(owner.earnings.net)} strong />}
                {owner.next && <KV k="Next live class" v={`${owner.next.session.title.slice(0, 28)} · ${new Date(owner.next.session.startsAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`} />}
                {owner.attention.map((a) => <KV key={a.key} k={a.label} v={String(a.count)} />)}
                {d.courses.length === 0 && <Txt variant="caption" color={c.muted}>Demo note: this sample workspace has summary numbers only. Open Rajesh Kumar Academy for a fully populated owner view.</Txt>}
                {owner.ctx.usage.worst && <Banner tone="info" text={`Owner sees a usage banner: ${owner.ctx.usage.worst.label} at ${owner.ctx.usage.worst.pct}%`} />}
              </>
            )}
          </Box>
        )}
      </ScrollView>

      {d.canManage && (
        <View style={styles.fabWrap} pointerEvents="box-none">
          <Button title="Actions" iconLeft="flash" style={styles.fab} onPress={() => setActions(true)} />
        </View>
      )}

      <BottomSheet open={actions} onClose={() => setActions(false)} title="Workspace actions">
        <View style={{ gap: 6 }}>
          {ACTIONS.filter((a) => a.show).map((a) => (
            <Pressable key={a.l} onPress={() => { setActions(false); setSheet(a.k); }} style={[styles.actRow, { borderColor: c.border }]} accessibilityRole="button">
              <Ionicons name={a.icon} size={20} color={a.danger ? c.danger : c.primary} />
              <Txt variant="bodyStrong" color={a.danger ? c.danger : c.ink} style={{ flex: 1 }}>{a.l}</Txt>
              <Ionicons name="chevron-forward" size={18} color={c.muted} />
            </Pressable>
          ))}
        </View>
      </BottomSheet>
      {sheet && <ActionSheet sheet={sheet} d={d} userId={userId} onClose={() => setSheet(null)} onDone={refresh} />}
    </View>
  );
}

function ActionSheet({ sheet, d, userId, onClose, onDone }: { sheet: Exclude<Sheet, null>; d: D; userId: string; onClose: () => void; onDone: (m: string) => void }) {
  const { c } = useTheme();
  const sub = d.sub!;
  const [reason, setReason] = useState('');
  const [plan, setPlan] = useState<PlanId>(sub.plan);
  const [billing, setBilling] = useState(sub.billing);
  const [when, setWhen] = useState<'now' | 'renewal'>('now');
  const [days, setDays] = useState(7);
  const [addon, setAddon] = useState<(typeof ADDON_CATALOG)[number]['kind']>('students');
  const [qty, setQty] = useState(1);
  const [free, setFree] = useState(false);
  const [feat, setFeat] = useState<Record<string, boolean | undefined>>(() => ({ ...(sub.overrides?.features ?? {}) }));
  const [lim, setLim] = useState<Record<string, string>>(() => Object.fromEntries(LIMIT_KEYS.map(([k]) => [k, sub.overrides?.limits?.[k] != null ? String(sub.overrides.limits[k]) : ''])));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = { plan: 'Change plan', trial: 'Extend trial', status: d.flags.suspended ? 'Reactivate workspace' : 'Suspend workspace', addon: 'Add capacity', overrides: 'Overrides', paid: 'Record payment', message: 'Message owner' }[sheet];
  const blockers = sheet === 'plan' ? PLANS.find((p) => p.id === plan)!.activeStudents != null && d.students > (PLANS.find((p) => p.id === plan)!.activeStudents ?? 0) : false;
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (sheet === 'plan') await tenantsAdmin.act(userId, d.t.id, { kind: 'plan', plan, billing, when, reason });
      if (sheet === 'trial') await tenantsAdmin.act(userId, d.t.id, { kind: 'extend_trial', days, reason });
      if (sheet === 'status') await tenantsAdmin.act(userId, d.t.id, { kind: 'status', status: d.flags.suspended ? 'active' : 'suspended', reason });
      if (sheet === 'addon') await tenantsAdmin.act(userId, d.t.id, { kind: 'addon', addon, qty, free, reason });
      if (sheet === 'overrides') await tenantsAdmin.act(userId, d.t.id, { kind: 'overrides', features: feat, limits: Object.fromEntries(Object.entries(lim).map(([k, v]) => [k, v === '' ? undefined : v === '∞' ? null : Number(v)])), reason });
      if (sheet === 'paid') await tenantsAdmin.act(userId, d.t.id, { kind: 'mark_paid', reason });
      if (sheet === 'message') await tenantsAdmin.act(userId, d.t.id, { kind: 'message', title, body });
      onDone(`${label} · done${sheet === 'message' ? '' : ' (logged)'}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not apply.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet open onClose={onClose} title={label} footer={<Button title="Confirm" size="md" loading={busy} style={{ flex: 1, ...(sheet === 'status' && !d.flags.suspended ? { backgroundColor: c.danger } : {}) }} onPress={run} />}>
      <View style={{ gap: 10 }}>
        {sheet === 'plan' && (
          <>
            <View style={styles.chips}>{PLANS.filter((p) => p.monthlyInr != null).map((p) => <Chip key={p.id} label={p.name} active={plan === p.id} onPress={() => setPlan(p.id)} />)}</View>
            <View style={styles.chips}>{(['monthly', 'annual'] as const).map((b) => <Chip key={b} label={b} active={billing === b} onPress={() => setBilling(b)} />)}</View>
            <View style={styles.chips}><Chip label="Apply now" active={when === 'now'} onPress={() => setWhen('now')} /><Chip label={`At renewal (${fmtDay(sub.periodEnd)})`} active={when === 'renewal'} onPress={() => setWhen('renewal')} /></View>
            {blockers && <Banner tone="info" text={`They have ${d.students} active students — more than ${PLANS.find((p) => p.id === plan)!.name} allows. Nothing is deleted, but new enrolments will pause.`} />}
          </>
        )}
        {sheet === 'trial' && <Stepper label="Extra days" value={days} onChange={setDays} min={1} max={60} />}
        {sheet === 'status' && <Txt color={c.inkSoft}>{d.flags.suspended ? 'New sales and enrolments open again. The owner is notified.' : 'New sales, enrolments and live classes pause. Students keep access to courses they bought. The owner is notified.'}</Txt>}
        {sheet === 'addon' && (
          <>
            <View style={styles.chips}>{ADDON_CATALOG.map((a) => <Chip key={a.kind} label={a.label} active={addon === a.kind} onPress={() => setAddon(a.kind)} />)}</View>
            <Txt variant="caption" color={c.muted}>{ADDON_CATALOG.find((a) => a.kind === addon)!.unit} · {inr(ADDON_CATALOG.find((a) => a.kind === addon)!.monthlyInr)}/mo each</Txt>
            {addon !== 'custom_domain' && <Stepper label="Quantity" value={qty} onChange={setQty} min={1} max={20} />}
            <ToggleRow title="Complimentary (no invoice)" sub="e.g. goodwill or a support issue" value={free} onChange={setFree} />
          </>
        )}
        {sheet === 'overrides' && (
          <>
            <Txt variant="caption" color={c.muted}>Override this workspace only. Leave a limit empty to use the plan value; type ∞ for unlimited.</Txt>
            {d.features.map((f) => (
              <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Txt variant="label" style={{ flex: 1, fontWeight: '400' }}>{f.label}{f.plan ? '' : ' (not in plan)'}</Txt>
                {(['plan', 'on', 'off'] as const).map((o) => {
                  const cur = feat[f.key] === undefined ? 'plan' : feat[f.key] ? 'on' : 'off';
                  return <Chip key={o} label={o === 'plan' ? 'Plan' : o === 'on' ? 'On' : 'Off'} active={cur === o} onPress={() => setFeat((x) => ({ ...x, [f.key]: o === 'plan' ? undefined : o === 'on' }))} />;
                })}
              </View>
            ))}
            {LIMIT_KEYS.map(([k, l]) => <TextField key={k} label={`${l} — plan: ${d.ent.plan[k === 'storageGb' ? 'videoStorageGb' : k === 'liveHours' ? 'liveRoomHoursPerMonth' : k] ?? '∞'}`} value={lim[k]} onChangeText={(v) => setLim((x) => ({ ...x, [k]: v.replace(/[^0-9∞]/g, '') }))} placeholder="Use plan value" />)}
          </>
        )}
        {sheet === 'paid' && <Txt color={c.inkSoft}>Use when the owner paid outside the app (bank transfer, UPI). Renews {sub.billing} from today and creates an invoice.</Txt>}
        {sheet === 'message' ? (
          <>
            <TextField label="Title" value={title} onChangeText={setTitle} />
            <TextInput value={body} onChangeText={setBody} multiline placeholder="Message (in-app + email to the owner)" placeholderTextColor={c.muted} style={[styles.area, { borderColor: c.border, color: c.ink }]} accessibilityLabel="Message" />
          </>
        ) : (
          <TextField label="Reason (audit log)" value={reason} onChangeText={setReason} placeholder="e.g. Upgrade agreed on call" />
        )}
        {err && <Banner text={err} />}
      </View>
    </BottomSheet>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}><Txt variant="label" color={c.muted}>{title.toUpperCase()}</Txt>{children}</View>;
}
function Stat({ v, l }: { v: string; l: string }) {
  const { c } = useTheme();
  return <View style={[styles.stat, { backgroundColor: c.surfaceMuted }]}><Txt variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{v}</Txt><Txt variant="caption" color={c.muted} numberOfLines={1}>{l}</Txt></View>;
}
function Health({ ok, t }: { ok: boolean; t: string }) {
  const { c } = useTheme();
  return <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 28 }}><Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={ok ? c.success : c.warning} /><Txt variant="label" style={{ flex: 1, fontWeight: '400' }}>{t}</Txt></View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  logo: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 12, padding: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, fontSize: 15 },
  area: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 90, textAlignVertical: 'top', fontSize: 15 },
  actRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 52 },
  fabWrap: { position: 'absolute', right: 4, bottom: 12, left: 4, alignItems: 'flex-end' },
  fab: { paddingHorizontal: 22, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
});
