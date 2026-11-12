/** Payments setup: (1) your own gateway for direct sales, (2) bank account for Bodhin marketplace payouts, (3) GST. */
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, paymentsSetup } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, ScreenTop, shared } from '@/ui/section';

type Data = ReturnType<typeof paymentsSetup.get>;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function PaymentsSetup() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [d, setD] = useState<Data | null>(null);
  const [gw, setGw] = useState<'razorpay' | 'cashfree' | null>(null);
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [bank, setBank] = useState(false);
  const [b, setB] = useState({ holder: '', account: '', confirm: '', ifsc: '' });
  const [gst, setGst] = useState('');
  const [fe, setFe] = useState<{ field?: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    try {
      const x = paymentsSetup.get(userId);
      setD({ ...x, p: { ...x.p } });
      setGst(x.p.gstin ?? '');
    } catch (e) {
      setFe({ msg: e instanceof ApiError ? e.message : 'Not available' });
    }
  }, [userId]);
  useFocusEffect(load);
  if (!d) return <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20 }}>{fe && <Banner text={fe.msg} />}</SafeAreaView>;
  const { p, cfg } = d;
  const run = async (fn: () => Promise<unknown> | unknown, ok: string, close: () => void) => {
    setBusy(true);
    setFe(null);
    try {
      await fn();
      close();
      setMsg(ok);
      load();
    } catch (e) {
      setFe(e instanceof ApiError ? { field: e.field, msg: e.message } : { msg: 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };
  const err = (f: string) => (fe?.field === f ? fe.msg : undefined);

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Payments setup" sub="How you get paid" />
        <ScrollView contentContainerStyle={shared.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={shared.inner}>
            {msg && <Banner tone="success" text={msg} />}
            {fe && !fe.field && !gw && !bank && <Banner text={fe.msg} />}

            <Card title="1 · Direct sales (your students)" right={<Pill text={p.directGatewayStatus === 'active' ? 'Connected' : 'Not connected'} tone={p.directGatewayStatus === 'active' ? 'success' : 'warning'} />}>
              <Txt color={c.inkSoft}>Students who buy on <Txt variant="bodyStrong">{d.ctx.host}</Txt> or your private links pay into your own gateway. Bodhin takes 0% — you pay only your gateway’s fees.</Txt>
              {p.directGatewayStatus === 'active' ? (
                <View style={styles.line}>
                  <Ionicons name="checkmark-circle" size={22} color={c.success} />
                  <Txt variant="bodyStrong" style={{ flex: 1 }}>{p.directGateway === 'razorpay' ? 'Razorpay' : 'Cashfree'} · live</Txt>
                  <Button title="Disconnect" size="md" variant="outline" onPress={() => { paymentsSetup.disconnectGateway(userId); setMsg('Gateway disconnected. Direct checkout is paused until you reconnect.'); load(); }} />
                </View>
              ) : (
                <>
                  <Banner tone="info" text="Until you connect, your direct checkout is paused. Marketplace sales still work." />
                  <View style={shared.row}>
                    <Button title="Razorpay" size="md" style={{ flex: 1 }} onPress={() => { setGw('razorpay'); setKeyId(''); setSecret(''); setFe(null); }} />
                    <Button title="Cashfree" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setGw('cashfree'); setKeyId(''); setSecret(''); setFe(null); }} />
                  </View>
                </>
              )}
            </Card>

            <Card title="2 · Marketplace payouts (from Bodhin)" right={<Pill text={p.payoutAccount?.verified ? 'Verified' : 'Needed'} tone={p.payoutAccount?.verified ? 'success' : 'warning'} />}>
              <Txt color={c.inkSoft}>When learners buy your course on thebodhin.com, Bodhin collects, keeps {Math.round(cfg.commissionRate * 100)}% + {Math.round(cfg.gatewayFeeRate * 100)}% gateway fee, and pays you every {DAYS[cfg.payoutWeekday]} after a {cfg.refundHoldDays}-day refund window.</Txt>
              {p.payoutAccount ? (
                <View style={styles.line}>
                  <Ionicons name="business" size={22} color={c.primary} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">{p.payoutAccount.bank} ••{p.payoutAccount.last4}</Txt>
                    <Txt variant="caption" color={c.muted}>{p.payoutAccount.verified ? 'Verified with ₹1 test deposit' : 'Verification pending'}</Txt>
                  </View>
                  <Button title="Change" size="md" variant="outline" onPress={() => { setBank(true); setFe(null); setB({ holder: '', account: '', confirm: '', ifsc: '' }); }} />
                </View>
              ) : <Button title="Add bank account" iconLeft="add" size="md" onPress={() => { setBank(true); setFe(null); }} />}
            </Card>

            <Card title="3 · Tax details">
              <TextField label="GSTIN (optional)" placeholder="33ABCDE1234F1Z5" value={gst} onChangeText={(v) => setGst(v.toUpperCase())} autoCapitalize="characters" maxLength={15} error={err('gstin')} hint="Shown on invoices to your direct-sale students and on Bodhin’s payout statements." />
              <Button title="Save tax details" size="md" variant="outline" onPress={() => run(() => paymentsSetup.saveTax(userId, gst), 'Tax details saved.', () => {})} />
            </Card>

            <Txt variant="caption" color={c.muted} center>Keys are encrypted and never shown again after saving (POC: stored locally only).</Txt>
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet open={!!gw} onClose={() => setGw(null)} title={`Connect ${gw === 'cashfree' ? 'Cashfree' : 'Razorpay'}`} footer={<Button title="Connect & test" size="md" loading={busy} style={{ flex: 1 }} onPress={() => run(() => paymentsSetup.connectGateway(userId, gw!, keyId, secret), `${gw === 'cashfree' ? 'Cashfree' : 'Razorpay'} connected. Test payment of ₹1 succeeded and was refunded.`, () => setGw(null))} />}>
        <View style={{ gap: 10 }}>
          <Txt variant="caption" color={c.muted}>{gw === 'cashfree' ? 'Cashfree dashboard → Developers → API keys.' : 'Razorpay dashboard → Settings → API Keys → Generate live key.'}</Txt>
          <TextField label={gw === 'cashfree' ? 'App ID' : 'Key ID'} placeholder={gw === 'cashfree' ? 'CF12345ABCDE' : 'rzp_live_XXXXXXXXXXXX'} value={keyId} onChangeText={setKeyId} autoCapitalize="none" error={err('key')} />
          <TextField label="Key secret" value={secret} onChangeText={setSecret} secure autoCapitalize="none" error={err('secret')} />
          <View style={shared.chips}><Chip label="Webhook added automatically" icon="checkmark" onPress={() => {}} active /></View>
          {fe && !fe.field && <Banner text={fe.msg} />}
        </View>
      </BottomSheet>

      <BottomSheet open={bank} onClose={() => setBank(false)} title="Payout bank account" footer={<Button title="Verify & save" size="md" loading={busy} style={{ flex: 1 }} onPress={() => run(() => paymentsSetup.saveBank(userId, b), 'Bank verified with a ₹1 test deposit. Payouts will go here.', () => setBank(false))} />}>
        <View style={{ gap: 10 }}>
          <TextField label="Account holder name" value={b.holder} onChangeText={(v) => setB({ ...b, holder: v })} error={err('holder')} />
          <TextField label="Account number" value={b.account} onChangeText={(v) => setB({ ...b, account: v.replace(/\D/g, '') })} keyboardType="number-pad" error={err('account')} />
          <TextField label="Confirm account number" value={b.confirm} onChangeText={(v) => setB({ ...b, confirm: v.replace(/\D/g, '') })} keyboardType="number-pad" error={err('confirm')} />
          <TextField label="IFSC" placeholder="HDFC0001234" value={b.ifsc} onChangeText={(v) => setB({ ...b, ifsc: v.toUpperCase() })} autoCapitalize="characters" maxLength={11} error={err('ifsc')} />
          <Txt variant="caption" color={c.muted}>Must be a current/savings account in the workspace owner’s or business name.</Txt>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
});
