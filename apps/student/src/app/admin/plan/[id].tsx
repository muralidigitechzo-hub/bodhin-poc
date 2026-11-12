/** Edit one plan: prices, limits, custom domain, features. Live impact on workspaces before saving. */
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FEATURE_LABEL, settingsAdmin } from '@/api/client';
import type { Plan, PlanId } from '@/core/plans';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Chip } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, Num, ScreenTop, ToggleRow, inr, shared } from '@/ui/section';
import { History, ImpactCard, SaveSheet } from '@/ui/adminDiff';

export default function PlanEditor() {
  const { id } = useLocalSearchParams<{ id: PlanId }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [rev, setRev] = useState(0);
  const base = useMemo(() => settingsAdmin.plan(userId, id), [userId, id, rev]);
  const canEdit = settingsAdmin.plans(userId).canEdit;
  const [p, setP] = useState<Plan>(base.p);
  const [features, setFeatures] = useState<string[]>(base.features);
  const [save, setSave] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const imp = settingsAdmin.planImpact(id, p, features);
  const set = <K extends keyof Plan>(k: K, v: Plan[K]) => setP((x) => ({ ...x, [k]: v }));
  const ent = id === 'enterprise';
  const ro = !canEdit;

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title={`${base.p.name} plan`} sub={`${imp.tenants} workspace${imp.tenants === 1 ? '' : 's'} on this plan`} fallback="/admin/plans" />
        <ScrollView contentContainerStyle={shared.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={shared.inner}>
            {msg && <Banner tone="success" text={msg} />}
            {ro && <Banner tone="info" text="View only." />}
            <ImpactCard changes={imp.changes} notes={imp.notes} />
            {imp.changes.length > 0 && imp.over.length > 0 && <Banner tone="info" text={`Over new limits: ${imp.over.slice(0, 4).map((o) => `${o.name} — ${o.what}`).join('; ')}${imp.over.length > 4 ? '…' : ''}`} />}

            {!ent && (
              <Card title="Price (₹, GST extra)">
                <Num label="Monthly" value={p.monthlyInr} onChange={(v) => set('monthlyInr', v)} step={100} min={0} max={100000} fmt={(v) => inr(v)} disabled={ro} />
                <Num label="Annual" sub={p.monthlyInr ? `${Math.round((1 - (p.annualInr ?? 0) / (p.monthlyInr * 12)) * 100)}% less than 12 × monthly` : undefined} value={p.annualInr} onChange={(v) => set('annualInr', v)} step={500} min={0} max={1200000} fmt={(v) => inr(v)} disabled={ro} />
                <View style={shared.chips}>
                  {[15, 20, 25].map((pc) => <Chip key={pc} label={`Annual = ${pc}% off`} onPress={() => !ro && p.monthlyInr != null && set('annualInr', Math.round((p.monthlyInr * 12 * (1 - pc / 100)) / 10) * 10)} />)}
                </View>
              </Card>
            )}

            <Card title="Limits">
              <Num label="Active students" value={p.activeStudents} onChange={(v) => set('activeStudents', v)} step={50} min={10} max={100000} unlimited disabled={ro} />
              <Num label="Video storage" value={p.videoStorageGb} onChange={(v) => set('videoStorageGb', v)} step={5} min={1} max={10000} fmt={(v) => `${v} GB`} unlimited disabled={ro} />
              <Num label="Live room-hours / month" value={p.liveRoomHoursPerMonth} onChange={(v) => set('liveRoomHoursPerMonth', v)} step={10} min={0} max={10000} fmt={(v) => `${v} h`} unlimited disabled={ro} />
              <Num label="Tutor seats" value={p.tutorSeats} onChange={(v) => set('tutorSeats', v)} step={1} min={1} max={1000} unlimited disabled={ro} />
              <Txt variant="label">Custom domain</Txt>
              <View style={shared.chips}>{(['addon', 'included', 'custom'] as const).map((k) => <Chip key={k} label={k === 'addon' ? 'Paid add-on' : k === 'included' ? 'Included' : 'Custom deal'} active={p.customDomain === k} onPress={() => !ro && set('customDomain', k)} />)}</View>
            </Card>

            <Card title={`Features · ${features.length}`}>
              {base.all.map((f) => (
                <ToggleRow key={f} title={FEATURE_LABEL[f]} value={features.includes(f)} disabled={ro || f === 'courses'} onChange={(v) => setFeatures((x) => (v ? [...x, f] : x.filter((y) => y !== f)))} />
              ))}
            </Card>

            <Card title="Marketing">
              <TextField label="Best for" value={p.bestFor} onChangeText={(v) => set('bestFor', v)} editable={!ro} />
              <ToggleRow title="Show as recommended" sub="Only one plan can be recommended" value={!!p.recommended} disabled={ro} onChange={(v) => set('recommended', v)} />
            </Card>

            <History rows={base.history} />
          </View>
        </ScrollView>
        {!ro && imp.changes.length > 0 && (
          <View style={[shared.footer, { borderTopColor: c.border, backgroundColor: c.surface, flexDirection: 'row', gap: 8 }]}>
            <Button title="Discard" variant="outline" size="md" style={{ flex: 1 }} onPress={() => { setP(base.p); setFeatures(base.features); }} />
            <Button title={`Save ${imp.changes.length} change${imp.changes.length > 1 ? 's' : ''}`} size="md" style={{ flex: 1.4 }} onPress={() => setSave(true)} />
          </View>
        )}
      </SafeAreaView>
      <SaveSheet open={save} onClose={() => setSave(false)} changes={imp.changes} onSave={async (r) => { await settingsAdmin.savePlan(userId, id, p, features, r); setSave(false); setMsg('Plan saved. Live for new sign-ups; existing workspaces notified where prices rose.'); setRev((x) => x + 1); }} />
    </View>
  );
}
