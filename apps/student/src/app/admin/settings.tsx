/** Platform rules: commission, gateway fee, refund hold, payout day, referral window, trial. Live example + impact preview. */
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { settingsAdmin } from '@/api/client';
import { PLANS } from '@/core/plans';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, KV, Num, ScreenTop, inr, shared } from '@/ui/section';
import { History, ImpactCard, SaveSheet } from '@/ui/adminDiff';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PlatformSettings() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [rev, setRev] = useState(0);
  const base = useMemo(() => settingsAdmin.platform(userId), [userId, rev]);
  const [cfg, setCfg] = useState(base.cfg);
  const [save, setSave] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const imp = settingsAdmin.platformImpact(cfg);
  const set = <K extends keyof typeof cfg>(k: K, v: (typeof cfg)[K]) => setCfg((x) => ({ ...x, [k]: v }));
  const ro = !base.canEdit;
  const sale = 10000;
  const com = Math.round(sale * cfg.commissionRate);
  const fee = Math.round(sale * cfg.gatewayFeeRate);

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Platform rules" sub="Applies to every workspace" fallback="/admin/more" />
        <ScrollView contentContainerStyle={shared.scroll} showsVerticalScrollIndicator={false}>
          <View style={shared.inner}>
            {msg && <Banner tone="success" text={msg} />}
            {ro && <Banner tone="info" text="View only — your role can’t change platform rules." />}
            <ImpactCard changes={imp.changes} notes={imp.notes} />

            <Card title="Marketplace money">
              <Num label="Bodhin commission" sub="Only on courses bought on thebodhin.com" value={Math.round(cfg.commissionRate * 100)} onChange={(v) => set('commissionRate', (v ?? 0) / 100)} min={0} max={50} fmt={(v) => `${v}%`} disabled={ro} />
              <Num label="Gateway fee passed to educator" sub="Razorpay/Cashfree cost on Bodhin-collected sales" value={Math.round(cfg.gatewayFeeRate * 1000) / 10} onChange={(v) => set('gatewayFeeRate', (v ?? 0) / 100)} step={0.5} min={0} max={5} fmt={(v) => `${v}%`} disabled={ro} />
              <View style={{ backgroundColor: c.surfaceMuted, borderRadius: 14, padding: 12, gap: 2 }}>
                <Txt variant="caption" color={c.muted}>Example: {inr(sale)} marketplace sale</Txt>
                <KV k="Bodhin commission" v={inr(com)} />
                <KV k="Gateway fee" v={inr(fee)} />
                <KV k="Educator receives" v={inr(sale - com - fee)} strong />
                <Txt variant="caption" color={c.muted}>Direct sales on the educator’s own site: 0% to Bodhin (their own gateway).</Txt>
              </View>
            </Card>

            <Card title="Payouts to educators">
              <Num label="Refund hold" sub="Days after a sale before it can be paid out" value={cfg.refundHoldDays} onChange={(v) => set('refundHoldDays', v ?? 0)} min={0} max={30} fmt={(v) => `${v} days`} disabled={ro} />
              <Txt variant="label">Payout day</Txt>
              <View style={shared.chips}>{DAYS.map((d, i) => <Chip key={d} label={d} active={cfg.payoutWeekday === i} onPress={() => !ro && set('payoutWeekday', i)} />)}</View>
              <Txt variant="caption" color={c.muted}>A sale today is paid on the first {DAYS[cfg.payoutWeekday]} after {cfg.refundHoldDays} days, once Finance approves the weekly run.</Txt>
            </Card>

            <Card title="Referrals">
              <Num label="Attribution window" sub="How long a marketplace click counts as Bodhin-referred" value={cfg.attributionDays} onChange={(v) => set('attributionDays', v ?? 0)} step={5} min={0} max={90} fmt={(v) => `${v} days`} disabled={ro} />
            </Card>

            <Card title="New educator trial">
              <Num label="Trial length" value={cfg.trialDays} onChange={(v) => set('trialDays', v ?? 0)} min={0} max={60} fmt={(v) => (v ? `${v} days` : 'No trial')} disabled={ro} />
              <Txt variant="label">Trial plan</Txt>
              <View style={shared.chips}>{PLANS.filter((p) => p.monthlyInr != null).map((p) => <Chip key={p.id} label={p.name} active={cfg.trialPlan === p.id} onPress={() => !ro && set('trialPlan', p.id)} />)}</View>
            </Card>

            <History rows={base.history} />
          </View>
        </ScrollView>
        {!ro && imp.changes.length > 0 && (
          <View style={[shared.footer, { borderTopColor: c.border, backgroundColor: c.surface, flexDirection: 'row', gap: 8 }]}>
            <Button title="Discard" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setCfg(base.cfg)} />
            <Button title={`Save ${imp.changes.length} change${imp.changes.length > 1 ? 's' : ''}`} size="md" style={{ flex: 1.4 }} onPress={() => setSave(true)} />
          </View>
        )}
      </SafeAreaView>
      <SaveSheet open={save} onClose={() => setSave(false)} changes={imp.changes} onSave={async (r) => { await settingsAdmin.savePlatform(userId, cfg, r); setSave(false); setMsg('Saved. Live for new sales and approvals; educators notified where relevant.'); setRev((x) => x + 1); }} />
    </View>
  );
}
