/** Feature flags & maintenance banner — instant platform-wide switches (logged with a reason). */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, flagsAdmin } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, ScreenTop, ToggleRow, shared } from '@/ui/section';

export default function Flags() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [base, setBase] = useState(() => flagsAdmin.get(userId));
  const [f, setF] = useState(base.flags);
  const [save, setSave] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const changed = JSON.stringify(f) !== JSON.stringify(base.flags);
  const ro = !base.canEdit;
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Feature flags & maintenance" fallback="/admin/more" />
        <ScrollView contentContainerStyle={shared.scroll} keyboardShouldPersistTaps="handled">
          <View style={shared.inner}>
            {msg && <Banner tone="success" text={msg} />}
            {ro && <Banner tone="info" text="View only — Super Admin changes flags." />}
            <Card title="Maintenance banner">
              <ToggleRow title="Show banner in every app" sub="Learners, educators and staff see it at the top" value={f.maintenance.on} disabled={ro} onChange={(v) => setF({ ...f, maintenance: { ...f.maintenance, on: v } })} />
              <TextInput value={f.maintenance.message} onChangeText={(v) => setF({ ...f, maintenance: { ...f.maintenance, message: v } })} editable={!ro} multiline maxLength={160} placeholder="Message users will see" placeholderTextColor={c.muted} style={[styles.area, { borderColor: c.border, color: c.ink }]} accessibilityLabel="Maintenance message" />
              {f.maintenance.on && <View style={[styles.preview, { backgroundColor: '#B7791F' }]}><Txt variant="label" color="#fff" center>⚠ {f.maintenance.message}</Txt></View>}
            </Card>
            <Card title="Kill switches">
              <ToggleRow title="New educator sign-ups" sub="Off: the “Teach on Bodhin” sign-up is paused" value={f.tutorSignups} disabled={ro} onChange={(v) => setF({ ...f, tutorSignups: v })} />
              <ToggleRow title="Marketplace checkout" sub="Off: purchases on thebodhin.com pause. Educators’ own sites keep selling." value={f.marketplaceCheckout} disabled={ro} onChange={(v) => setF({ ...f, marketplaceCheckout: v })} />
              <ToggleRow title="Live classes" sub="Off: no new live classes can be scheduled or joined" value={f.liveClasses} disabled={ro} onChange={(v) => setF({ ...f, liveClasses: v })} />
              <Txt variant="caption" color={c.muted}>Use during incidents (payment gateway outage, video provider down). Every switch is logged.</Txt>
            </Card>
          </View>
        </ScrollView>
        {changed && !ro && (
          <View style={[shared.footer, { borderTopColor: c.border, backgroundColor: c.surface, flexDirection: 'row', gap: 8 }]}>
            <Button title="Discard" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setF(base.flags)} />
            <Button title="Apply now" size="md" style={{ flex: 1.4 }} onPress={() => { setReason(''); setErr(null); setSave(true); }} />
          </View>
        )}
      </SafeAreaView>
      <BottomSheet open={save} onClose={() => setSave(false)} title="Apply platform-wide?" footer={<Button title="Apply" size="md" style={{ flex: 1 }} onPress={() => { try { flagsAdmin.save(userId, f, reason); setSave(false); const b = flagsAdmin.get(userId); setBase(b); setF(b.flags); setMsg('Applied — live in every app within a minute'); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); } }} />}>
        <View style={{ gap: 8 }}>
          <TextField label="Reason (audit log)" value={reason} onChangeText={setReason} placeholder="e.g. Razorpay incident #2211" />
          {err && <Banner text={err} />}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  area: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 70, textAlignVertical: 'top', fontSize: 15 },
  preview: { borderRadius: 10, padding: 8 },
});
