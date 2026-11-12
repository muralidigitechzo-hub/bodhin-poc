/**
 * Checkout. India-first: UPI default, then card / netbanking. One screen: summary → pay → success.
 * Real integration: Razorpay/Cashfree; the backend creates the order and verifies payment (see client.ts).
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, catalog, commerce } from '@/api/client';
import { inr, nextLesson, type Order, type PaymentMethod } from '@/core/catalog';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Banner } from '@/ui/misc';
import { Chip, IconButton } from '@/ui/kit';
import { CourseArt } from '@/ui/course';

const METHODS: { id: PaymentMethod; title: string; sub: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'upi', title: 'UPI', sub: 'GPay, PhonePe, Paytm or any UPI app', icon: 'qr-code-outline' },
  { id: 'card', title: 'Credit / Debit card', sub: 'Visa, Mastercard, RuPay', icon: 'card-outline' },
  { id: 'netbanking', title: 'Net banking', sub: 'All major Indian banks', icon: 'business-outline' },
];
const BANKS = ['SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak', 'Indian Bank'];

export default function Checkout() {
  const { isDesktop, pad } = useLayout();
  const { id, source } = useLocalSearchParams<{ id: string; source?: Order['source'] }>();
  const { c, tenant } = useTheme();
  const { session } = useAuth();
  const data = catalog.get(id);
  const route = useMemo(() => (data ? commerce.route(data.course.id, tenant?.id ?? null, session?.user.id) : null), [data, tenant?.id, session?.user.id]);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<string | undefined>();
  const [couponErr, setCouponErr] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [upi, setUpi] = useState('');
  const [card, setCard] = useState({ number: '', exp: '', cvv: '' });
  const [bank, setBank] = useState('SBI');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);

  const quote = useMemo(() => (data ? commerce.quote(data.course.id, coupon) : null), [data, coupon]);
  if (!data || !quote || !session || !route) return null;
  const { course, tutor } = data;

  const applyCoupon = () => {
    try {
      commerce.quote(course.id, couponInput);
      setCoupon(couponInput.trim().toUpperCase());
      setCouponErr(null);
    } catch (e) {
      setCouponErr((e as ApiError).message);
    }
  };

  const validate = () => {
    if (method === 'upi' && upi && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(upi.trim())) return 'Enter a valid UPI ID like name@okicici, or leave it empty to pick an app.';
    if (method === 'card') {
      const n = card.number.replace(/\s/g, '');
      if (!/^\d{16}$/.test(n)) return 'Enter the 16-digit card number.';
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(card.exp)) return 'Enter expiry as MM/YY.';
      if (!/^\d{3}$/.test(card.cvv)) return 'Enter the 3-digit CVV.';
    }
    return null;
  };

  const pay = async () => {
    const v = validate();
    if (v) return setError(v);
    setBusy(true);
    setError(null);
    try {
      const o = await commerce.pay({ userId: session.user.id, courseId: course.id, coupon, method, source: source ?? 'bodhin_referral', checkoutTenantId: tenant?.id ?? null, failDemo: method === 'card' && card.number.replace(/\s/g, '') === '4000000000000002' });
      setOrder(o);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  if (order) return <Success order={order} courseTitle={course.title} onStart={() => router.replace({ pathname: '/learn/[courseId]', params: { courseId: course.id, lesson: nextLesson(course).lesson.id } })} onCourse={() => router.replace({ pathname: '/course/[id]', params: { id: course.id } })} />;

  const fmtCard = (t: string) => t.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  const fmtExp = (t: string) => {
    const d = t.replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  const orderEl = (
    <>
    {/* Order */}
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 84 }}>
          <CourseArt course={course} height={72} rounded={radius.md} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" numberOfLines={2}>{course.title}</Txt>
          <Txt variant="caption" color={c.muted}>by {tutor.name} · 12 months access</Txt>
        </View>
      </View>
      <View style={[styles.seller, { backgroundColor: c.surfaceMuted }]}>
        <Ionicons name={route.collector === 'bodhin' ? 'shield-checkmark' : 'storefront-outline'} size={18} color={c.primary} />
        <Txt variant="caption" color={c.inkSoft} style={{ flex: 1 }}>
          {route.collector === 'bodhin' ? 'Sold by Bodhin. Payment, GST invoice and refunds are handled by Bodhin.' : `Paid directly to ${route.sellerName}. They issue your invoice and handle refunds.`}
        </Txt>
      </View>
    </View>
    </>
  );
  const blockedEl = (
    <>
    {/* Why this can't be bought right now — shown first so the disabled Pay button is never a mystery */}
    {route.blocked && <Banner text={route.blocked} />}
    </>
  );
  const couponEl = (
    <>
    {/* Coupon */}
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      {coupon ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="pricetag" size={20} color={c.success} />
          <Txt variant="bodyStrong" color={c.success} style={{ flex: 1 }}>{coupon} applied · {quote.coupon?.label}</Txt>
          <Pressable onPress={() => { setCoupon(undefined); setCouponInput(''); }} hitSlop={10} accessibilityRole="button">
            <Txt variant="label" color={c.danger}>Remove</Txt>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <TextField label="Have a coupon?" icon="pricetag-outline" placeholder="Enter code" autoCapitalize="characters" value={couponInput} onChangeText={(t) => { setCouponInput(t); setCouponErr(null); }} onSubmitEditing={applyCoupon} error={couponErr} hint={route.channel === 'bodhin_own' ? 'Demo: BODHIN10' : undefined} />
          </View>
          <Button title="Apply" variant="soft" size="md" disabled={!couponInput.trim()} onPress={applyCoupon} style={{ marginBottom: couponErr ? 22 : 22 }} />
        </View>
      )}
    </View>
    </>
  );
  const methodsEl = (
    <>
    {/* Payment method */}
    <Txt variant="heading" style={{ marginTop: 6 }}>Pay with</Txt>
    <View style={{ gap: 10 }}>
      {METHODS.map((m) => {
        const on = method === m.id;
        return (
          <View key={m.id} style={[styles.method, { backgroundColor: c.surface, borderColor: on ? c.primary : c.border }, on && { borderWidth: 2 }]}>
            <Pressable onPress={() => { setMethod(m.id); setError(null); }} style={styles.methodHead} accessibilityRole="radio" accessibilityState={{ checked: on }}>
              <View style={[styles.mIcon, { backgroundColor: c.primarySoft }]}>
                <Ionicons name={m.icon} size={22} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{m.title}</Txt>
                <Txt variant="caption" color={c.muted}>{m.sub}</Txt>
              </View>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={24} color={on ? c.primary : c.borderStrong} />
            </Pressable>
            {on && m.id === 'upi' && (
              <View style={styles.methodBody}>
                <TextField label="UPI ID (optional)" placeholder="yourname@okicici" autoCapitalize="none" value={upi} onChangeText={setUpi} hint="Leave empty to choose your UPI app on the next step." />
              </View>
            )}
            {on && m.id === 'card' && (
              <View style={styles.methodBody}>
                <TextField label="Card number" placeholder="1234 5678 9012 3456" keyboardType="number-pad" autoComplete="cc-number" value={card.number} onChangeText={(t) => setCard((s) => ({ ...s, number: fmtCard(t) }))} hint="Demo decline: 4000 0000 0000 0002" />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <TextField label="Expiry" placeholder="MM/YY" keyboardType="number-pad" autoComplete="cc-exp" value={card.exp} onChangeText={(t) => setCard((s) => ({ ...s, exp: fmtExp(t) }))} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextField label="CVV" placeholder="123" keyboardType="number-pad" secure autoComplete="cc-csc" value={card.cvv} onChangeText={(t) => setCard((s) => ({ ...s, cvv: t.replace(/\D/g, '').slice(0, 3) }))} />
                  </View>
                </View>
              </View>
            )}
            {on && m.id === 'netbanking' && (
              <View style={[styles.methodBody, { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }]}>
                {BANKS.map((b) => <Chip key={b} label={b} active={bank === b} onPress={() => setBank(b)} />)}
              </View>
            )}
          </View>
        );
      })}
    </View>
    </>
  );
  const billEl = (
    <>
    {/* Bill */}
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, marginTop: 6 }]}>
      <Row k="Course price" v={inr(quote.listInr)} />
      {quote.discountInr > 0 && <Row k={`Coupon (${quote.coupon?.code})`} v={`− ${inr(quote.discountInr)}`} color={c.success} />}
      <View style={[styles.hr, { backgroundColor: c.border }]} />
      <Row k="Total" v={inr(quote.totalInr)} strong />
      <Txt variant="caption" color={c.muted}>Includes GST of {inr(quote.gstIncludedInr)}. {route.collector === 'bodhin' ? 'Bodhin' : route.sellerName} emails the GST invoice after payment.</Txt>
    </View>
    </>
  );
  const tailEl = (
    <>
    {error && <Banner text={error} />}
    <View style={styles.secure}>
      <Ionicons name="lock-closed" size={14} color={c.muted} />
      <Txt variant="caption" color={c.muted}>Secure payment · 7-day refund if you’ve watched under 20%</Txt>
    </View>
    </>
  );
  const payBtn = <Button title={busy ? 'Processing…' : `Pay ${inr(quote.totalInr)}`} iconRight="lock-closed" loading={busy} disabled={!!route.blocked} style={{ minWidth: 180 }} onPress={pay} />;

  if (isDesktop) {
    return (
      <View style={{ flex: 1, backgroundColor: c.ivory }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: pad, paddingTop: 24, paddingBottom: 64, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: 1080 }}>
            <View style={[styles.top, { justifyContent: 'flex-start', gap: 14, marginBottom: 8 }]}>
              <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => router.back()} />
              <Txt variant="title">Checkout</Txt>
            </View>
            <View style={{ flexDirection: 'row', gap: 32, alignItems: 'flex-start' }}>
              <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
                {blockedEl}
                {methodsEl}
              </View>
              <View style={[{ width: 420, gap: 12 }, { position: 'sticky', top: 24 } as object]}>
                {orderEl}
                {couponEl}
                {billEl}
                {payBtn}
                {tailEl}
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            <View style={styles.top}>
              <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => router.back()} />
              <Txt variant="heading">Checkout</Txt>
              <View style={{ width: 48 }} />
            </View>

            {orderEl}
            {blockedEl}
            {couponEl}
            {methodsEl}
            {billEl}
            {tailEl}
          </View>
        </ScrollView>

        <View style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <View style={styles.barInner}>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={c.muted}>Total</Txt>
              <Txt variant="title">{inr(quote.totalInr)}</Txt>
            </View>
            {payBtn}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Row({ k, v, strong, color }: { k: string; v: string; strong?: boolean; color?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Txt variant={strong ? 'bodyStrong' : 'body'} color={strong ? c.ink : c.inkSoft}>{k}</Txt>
      <Txt variant={strong ? 'heading' : 'bodyStrong'} color={color ?? c.ink}>{v}</Txt>
    </View>
  );
}

function Success({ order, courseTitle, onStart, onCourse }: { order: Order; courseTitle: string; onStart: () => void; onCourse: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, padding: 20, alignItems: 'center' }}>
        <View style={{ flex: 1, width: '100%', maxWidth: layout.authMaxWidth, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <View style={[styles.ok, { backgroundColor: c.successBg }]}>
            <Ionicons name="checkmark-circle" size={72} color={c.success} />
          </View>
          <TwoTone lead="You're" accent="enrolled!" variant="title" center />
          <Txt center color={c.inkSoft}>{courseTitle}</Txt>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, width: '100%', marginTop: 8 }]}>
            <Row k="Amount paid" v={inr(order.amountInr)} strong />
            <Row k="Payment" v={order.method === 'upi' ? 'UPI' : order.method === 'card' ? 'Card' : 'Net banking'} />
            <Row k="Invoice" v={order.invoiceNo} />
          </View>
          <Txt variant="caption" color={c.muted} center>Invoice sent to your email. You can also find it in Profile → Payments.</Txt>
        </View>
        <View style={{ width: '100%', maxWidth: layout.authMaxWidth, gap: 10 }}>
          <Button title="Start learning" iconRight="play" onPress={onStart} />
          <Button title="Go to course" variant="outline" onPress={onCourse} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 120, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.authMaxWidth + 80, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  card: { padding: 14, borderRadius: radius.lg, borderWidth: 1, gap: 10 },
  method: { borderRadius: radius.lg, borderWidth: 1.2, overflow: 'hidden' },
  methodHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 68 },
  mIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  methodBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 12 },
  hr: { height: 1 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.md },
  secure: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 4 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, alignItems: 'center' },
  barInner: { width: '100%', maxWidth: layout.authMaxWidth + 80, flexDirection: 'row', alignItems: 'center', gap: 14 },
  ok: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
