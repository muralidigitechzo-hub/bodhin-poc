/** Plans & add-ons: what each plan costs and includes, who is on it, add-on prices. */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, settingsAdmin } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, ScreenTop, inr, shared } from '@/ui/section';
import { History } from '@/ui/adminDiff';

type Data = ReturnType<typeof settingsAdmin.plans>;
type Addon = Data['addons'][number];

export default function Plans() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [d, setD] = useState<Data | null>(null);
  const [edit, setEdit] = useState<Addon | null>(null);
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => setD(settingsAdmin.plans(userId)), [userId]);
  useFocusEffect(load);
  if (!d) return null;
  const lim = (v: number | null, u: string) => (v == null ? `∞ ${u}` : `${v.toLocaleString('en-IN')} ${u}`);

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Plans & limits" sub="What educators pay Bodhin" fallback="/admin/more" right={<Pressable onPress={() => router.push('/admin/settings')} hitSlop={8} accessibilityRole="button"><Txt variant="label" color={c.primary}>Rules</Txt></Pressable>} />
        <ScrollView contentContainerStyle={shared.scroll} showsVerticalScrollIndicator={false}>
          <View style={shared.inner}>
            {msg && <Banner tone="success" text={msg} />}
            {!d.canEdit && <Banner tone="info" text="View only — your role can’t edit plans." />}
            {d.rows.map(({ p, tenants, paying, trials, mrr, features }) => (
              <Pressable key={p.id} onPress={() => router.push({ pathname: '/admin/plan/[id]', params: { id: p.id } })} style={({ pressed }) => [styles.plan, { backgroundColor: c.surface, borderColor: p.recommended ? c.accent : c.border }, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`${p.name} plan`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Txt variant="heading" style={{ flex: 1 }}>{p.name}</Txt>
                  {p.recommended && <Pill text="Recommended" tone="gold" />}
                  <Ionicons name="chevron-forward" size={18} color={c.muted} />
                </View>
                <Txt variant="title" style={{ fontSize: 20 }}>{p.monthlyInr == null ? 'Custom quote' : `${inr(p.monthlyInr)}/mo`}<Txt variant="caption" color={c.muted}>{p.annualInr != null ? `  ·  ${inr(p.annualInr)}/yr` : ''}</Txt></Txt>
                <Txt variant="caption" color={c.inkSoft}>{lim(p.activeStudents, 'students')} · {lim(p.videoStorageGb, 'GB')} · {lim(p.liveRoomHoursPerMonth, 'live h')} · {lim(p.tutorSeats, p.tutorSeats === 1 ? 'tutor' : 'tutors')} · domain {p.customDomain} · {features} features</Txt>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Pill text={`${paying} paying`} tone="success" />
                  {trials > 0 && <Pill text={`${trials} on trial`} tone="warning" />}
                  <Pill text={`MRR ${inr(mrr)}`} tone="info" />
                  {tenants === 0 && <Pill text="No workspaces yet" tone="neutral" />}
                </View>
              </Pressable>
            ))}
            <Card title="Add-ons (per month)">
              {d.addons.map((a) => (
                <View key={a.kind} style={styles.addon}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="bodyStrong">{a.label}</Txt>
                    <Txt variant="caption" color={c.muted}>{a.unit} · used by {a.inUse} workspace{a.inUse === 1 ? '' : 's'}</Txt>
                  </View>
                  <Txt variant="bodyStrong">{inr(a.monthlyInr)}</Txt>
                  {d.canEdit && <Pressable onPress={() => { setEdit(a); setPrice(String(a.monthlyInr)); setReason(''); setErr(null); }} style={styles.icon} accessibilityRole="button" accessibilityLabel={`Edit ${a.label} price`}><Ionicons name="create-outline" size={20} color={c.primary} /></Pressable>}
                </View>
              ))}
              <Txt variant="caption" color={c.muted}>New add-on prices apply to new purchases and to existing add-ons at their next renewal.</Txt>
            </Card>
            <History rows={d.history} />
          </View>
        </ScrollView>
      </SafeAreaView>
      <BottomSheet open={!!edit} onClose={() => setEdit(null)} title={edit ? `${edit.label} price` : ''} footer={<Button title="Save price" size="md" style={{ flex: 1 }} onPress={async () => { try { await settingsAdmin.saveAddon(userId, edit!.kind, Number(price), reason); setEdit(null); setMsg(`${edit!.label} now ${inr(Number(price))}/month`); load(); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save.'); } }} />}>
        <View style={{ gap: 10 }}>
          <TextField label="Monthly price (₹, GST extra)" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} keyboardType="number-pad" />
          <TextField label="Reason" value={reason} onChangeText={setReason} />
          {err && <Banner text={err} />}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  plan: { borderWidth: 1.5, borderRadius: 18, padding: 14, gap: 6 },
  addon: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
