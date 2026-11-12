/** Coupons & offers: real, dated offers only. Create %, or ₹ off, per course or all, with usage limits. */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Cols, Grid, useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, couponsApi } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill, ProgressBar } from '@/ui/kit';
import { Banner, Checkbox } from '@/ui/misc';
import { DateField } from '@/ui/pickers';
import { Card, ScreenTop, fmtDay, inr, shared } from '@/ui/section';

type Data = ReturnType<typeof couponsApi.list>;
type Row = Data['rows'][number];
const STATE = { active: ['Active', 'success'], scheduled: ['Starts later', 'info'], paused: ['Paused', 'neutral'], used_up: ['Limit reached', 'warning'], expired: ['Ended', 'neutral'] } as const;
const blank = () => ({ code: '', type: 'pct' as 'pct' | 'flat', value: '10', courseIds: [] as string[], maxUses: '100', unlimited: false, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 7 * 864e5).toISOString() });

export default function Coupons() {
  const { isDesktop } = useLayout();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [d, setD] = useState<Data | null>(null);
  const [form, setForm] = useState<ReturnType<typeof blank> | null>(null);
  const [sel, setSel] = useState<Row | null>(null);
  const [fe, setFe] = useState<{ field?: string; msg: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => { try { setD(couponsApi.list(userId)); } catch (e) { setFe({ msg: e instanceof ApiError ? e.message : 'Not available' }); } }, [userId]);
  useFocusEffect(load);
  if (!d) return <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20 }}>{fe && <Banner text={fe.msg} />}</SafeAreaView>;
  const label = (r: Row['cp']) => (r.type === 'pct' ? `${r.value}% off` : `${inr(r.value)} off`);
  const scope = (ids: string[]) => (ids.length ? ids.map((id) => d.courses.find((x) => x.id === id)?.title ?? '').join(', ') : 'All paid courses');
  const save = () => {
    if (!form) return;
    setFe(null);
    try {
      const code = couponsApi.create(userId, { code: form.code, type: form.type, value: Number(form.value) || 0, courseIds: form.courseIds, maxUses: form.unlimited ? null : Number(form.maxUses) || null, startsAt: form.startsAt, endsAt: form.endsAt });
      setForm(null);
      setMsg(`${code} is live on your site${form.courseIds.length ? '' : ' for all courses'}.`);
      load();
    } catch (e) {
      setFe(e instanceof ApiError ? { field: e.field, msg: e.message } : { msg: 'Could not create.' });
    }
  };
  const err = (f: string) => (fe?.field === f ? fe.msg : undefined);
  const suggest = () => setForm((f) => f && { ...f, code: `OFFER${f.type === 'pct' ? f.value : Math.round(Number(f.value) / 100)}${new Date(f.endsAt).toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}`.slice(0, 15) });

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Coupons & offers" />
        <ScrollView contentContainerStyle={[shared.scroll, isDesktop && { paddingHorizontal: 32, paddingBottom: 48 }]} showsVerticalScrollIndicator={false}>
          <View style={[shared.inner, isDesktop && { maxWidth: 1000 }]}>
            {msg && <Banner tone="success" text={msg} />}
            {!d.enabled && <Banner tone="info" text="Coupons are available from the Creator plan." />}
            <Txt variant="caption" color={c.muted}>Every offer has a real end date — no fake countdowns. Coupons apply to your direct and marketplace sales; Bodhin’s commission is calculated on the discounted price.</Txt>
            {d.rows.length === 0 && <Card><Txt color={c.muted} center>No coupons yet.</Txt></Card>}
            {d.rows.map((r) => {
              const [t, tone] = STATE[r.state];
              return (
                <Pressable key={r.cp.id} onPress={() => setSel(r)} style={[styles.coupon, { backgroundColor: c.surface, borderColor: c.border, opacity: r.state === 'expired' ? 0.6 : 1 }]} accessibilityRole="button" accessibilityLabel={`${r.cp.code}, ${label(r.cp)}, ${t}`}>
                  <View style={[styles.ticket, { backgroundColor: c.primarySoft, borderColor: c.primary }]}>
                    <Txt variant="label" color={c.primary}>{r.cp.type === 'pct' ? `${r.cp.value}%` : `₹${r.cp.value}`}</Txt>
                    <Txt variant="caption" color={c.primary}>OFF</Txt>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Txt variant="bodyStrong" style={{ letterSpacing: 1 }}>{r.cp.code}</Txt>
                      <Pill text={t} tone={tone} />
                    </View>
                    <Txt variant="caption" color={c.muted} numberOfLines={1}>{scope(r.cp.courseIds)}</Txt>
                    <Txt variant="caption" color={c.inkSoft}>{fmtDay(r.cp.startsAt)} – {fmtDay(r.cp.endsAt)} · {r.cp.used}{r.cp.maxUses ? `/${r.cp.maxUses}` : ''} used</Txt>
                    {r.cp.maxUses != null && <ProgressBar pct={(r.cp.used / r.cp.maxUses) * 100} color={c.primary} height={4} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <View style={[shared.footer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
          <Button title="New coupon" iconLeft="add" disabled={!d.enabled} onPress={() => { setForm(blank()); setFe(null); }} style={{ width: '100%', maxWidth: 720 }} />
        </View>
      </SafeAreaView>

      <BottomSheet open={!!form} onClose={() => setForm(null)} title="New coupon" footer={<Button title="Create coupon" size="md" style={{ flex: 1 }} onPress={save} />}>
        {form && (
          <View style={{ gap: 10 }}>
            <View style={shared.chips}>
              <Chip label="% off" active={form.type === 'pct'} onPress={() => setForm({ ...form, type: 'pct', value: '10' })} />
              <Chip label="₹ off" active={form.type === 'flat'} onPress={() => setForm({ ...form, type: 'flat', value: '500' })} />
            </View>
            <TextField label={form.type === 'pct' ? 'Discount (%)' : 'Discount (₹)'} value={form.value} onChangeText={(v) => setForm({ ...form, value: v.replace(/\D/g, '') })} keyboardType="number-pad" error={err('value')} />
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}><TextField label="Code" placeholder="DIWALI25" value={form.code} onChangeText={(v) => setForm({ ...form, code: v.toUpperCase().replace(/[^A-Z0-9]/g, '') })} autoCapitalize="characters" maxLength={15} error={err('code')} /></View>
              <Button title="Suggest" size="md" variant="outline" onPress={suggest} />
            </View>
            <DateField label="Starts" value={form.startsAt} onChange={(v) => setForm({ ...form, startsAt: v })} />
            <DateField label="Ends (required)" value={form.endsAt} onChange={(v) => { const e = new Date(v); e.setHours(23, 59, 0, 0); setForm({ ...form, endsAt: e.toISOString() }); }} min={form.startsAt} error={err('dates')} />
            <Checkbox label="Unlimited uses" checked={form.unlimited} onChange={(v) => setForm({ ...form, unlimited: v })}><Txt variant="label">Unlimited uses</Txt></Checkbox>
            {!form.unlimited && <TextField label="Max uses" value={form.maxUses} onChangeText={(v) => setForm({ ...form, maxUses: v.replace(/\D/g, '') })} keyboardType="number-pad" />}
            <Txt variant="label">Applies to</Txt>
            <Checkbox label="All paid courses" checked={!form.courseIds.length} onChange={() => setForm({ ...form, courseIds: [] })}><Txt variant="label">All paid courses</Txt></Checkbox>
            {d.courses.map((co) => (
              <Checkbox key={co.id} label={co.title} checked={form.courseIds.includes(co.id)} onChange={(v) => setForm({ ...form, courseIds: v ? [...form.courseIds, co.id] : form.courseIds.filter((x) => x !== co.id) })}>
                <View style={{ flex: 1 }}><Txt variant="label">{co.title}</Txt><Txt variant="caption" color={c.muted}>{inr(co.priceInr)}</Txt></View>
              </Checkbox>
            ))}
            {fe && !fe.field && <Banner text={fe.msg} />}
          </View>
        )}
      </BottomSheet>

      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel?.cp.code ?? ''}>
        {sel && (
          <View style={{ gap: 8 }}>
            <Txt color={c.inkSoft}>{label(sel.cp)} · {scope(sel.cp.courseIds)}</Txt>
            <Txt variant="caption" color={c.muted}>{fmtDay(sel.cp.startsAt)} – {fmtDay(sel.cp.endsAt)} · used {sel.cp.used}{sel.cp.maxUses ? ` of ${sel.cp.maxUses}` : ''}</Txt>
            <Button title="Share code" iconLeft="share-social-outline" size="md" onPress={async () => { try { await Share.share({ message: `Use code ${sel.cp.code} for ${label(sel.cp)} — valid till ${fmtDay(sel.cp.endsAt)}.` }); } catch { /* ignore */ } }} />
            {sel.state !== 'expired' && <Button title={sel.cp.paused ? 'Resume' : 'Pause'} iconLeft={sel.cp.paused ? 'play' : 'pause'} variant="outline" size="md" onPress={() => { couponsApi.togglePause(userId, sel.cp.id); setSel(null); load(); }} />}
            {sel.state !== 'expired' && <Button title={sel.cp.used ? 'End offer now' : 'Delete'} iconLeft="close-circle-outline" variant="outline" size="md" onPress={() => { couponsApi.endNow(userId, sel.cp.id); setSel(null); load(); }} />}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  coupon: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 12 },
  ticket: { width: 62, height: 62, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
