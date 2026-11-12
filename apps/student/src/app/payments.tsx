/** Payments & enrollments: totals, enrollments with access dates, payment history, invoice sheet. */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, payments } from '@/api/client';
import { inr } from '@/core/catalog';
import { TextField } from '@/ui/TextField';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { BottomSheet, IconButton, Pill, ProgressBar, Skeleton, useAsync } from '@/ui/kit';
import { CourseArt, openCourse } from '@/ui/course';

type Data = Awaited<ReturnType<typeof payments.list>>;
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function Payments() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { data } = useAsync(() => payments.list(userId), [userId]);
  const [seg, setSeg] = useState<'payments' | 'enrollments'>('payments');
  const [open, setOpen] = useState<Data['rows'][number] | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [refundErr, setRefundErr] = useState<string | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  const win = open ? payments.refundWindow(open.order) : null;

  const askRefund = async () => {
    if (!open) return;
    setRefundBusy(true);
    setRefundErr(null);
    try {
      await payments.requestRefund(userId, open.order.id, reason);
      setRequested(true);
      setReason('');
    } catch (e) {
      setRefundErr((e as ApiError).message);
    } finally {
      setRefundBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.inner}>
            <View style={{ paddingVertical: 8 }}>
              <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
            </View>
            <TwoTone lead="Payments &" accent="Enrollments" variant="title" />
            {!data ? (
              <Skeleton h={90} r={18} />
            ) : (
              <>
                <View style={[styles.stats, { backgroundColor: c.surface, borderColor: c.border }]}>
                  {([
                    ['school-outline', String(data.stats.enrollments), 'Enrollments', c.primary],
                    ['checkmark-circle-outline', String(data.stats.active), 'Active', c.success],
                    ['wallet-outline', inr(data.stats.totalPaid), 'Total paid', '#7C3AED'],
                  ] as const).map(([icon, v, l, col]) => (
                    <View key={l} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                      <Ionicons name={icon} size={22} color={col} />
                      <Txt variant="heading">{v}</Txt>
                      <Txt variant="caption" color={c.muted}>{l}</Txt>
                    </View>
                  ))}
                </View>

                <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
                  {(['payments', 'enrollments'] as const).map((s) => (
                    <Pressable key={s} onPress={() => setSeg(s)} accessibilityRole="tab" accessibilityState={{ selected: seg === s }} style={[styles.segBtn, seg === s && { backgroundColor: c.surface }]}>
                      <Txt variant="label" color={seg === s ? c.primary : c.inkSoft}>{s === 'payments' ? 'Payment history' : 'My enrollments'}</Txt>
                    </Pressable>
                  ))}
                </View>

                {seg === 'payments' ? (
                  data.rows.length === 0 ? (
                    <Txt color={c.muted} center style={{ paddingVertical: 30 }}>No payments yet. Free enrollments don't appear here.</Txt>
                  ) : (
                    data.rows.map((r) => (
                      <Pressable key={r.order.id} onPress={() => setOpen(r)} style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="button" accessibilityLabel={`${r.course.title}, ${inr(r.order.amountInr)}, ${r.order.status}`}>
                        <View style={{ width: 64 }}><CourseArt course={r.course} height={52} rounded={10} /></View>
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Txt variant="label" numberOfLines={1}>{r.course.title}</Txt>
                          <Txt variant="caption" color={c.muted}>{when(r.order.createdAt)}</Txt>
                          <Txt variant="caption" color={c.muted}>{r.order.invoiceNo}</Txt>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Txt variant="bodyStrong" color={c.success}>{inr(r.order.amountInr)}</Txt>
                          <Pill text={r.order.status === 'paid' ? 'Paid' : r.order.status === 'refunded' ? 'Refunded' : r.order.status} tone={r.order.status === 'paid' ? 'success' : r.order.status === 'refunded' ? 'info' : 'warning'} icon={r.order.status === 'paid' ? 'checkmark' : undefined} />
                        </View>
                      </Pressable>
                    ))
                  )
                ) : (
                  data.enrollments.map(({ e, course, progress }) => {
                    const active = !e.validTill || new Date(e.validTill).getTime() > Date.now();
                    return (
                      <Pressable key={course.id} onPress={() => openCourse(course.id)} style={[styles.enr, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="button">
                        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                          <View style={{ width: 64 }}><CourseArt course={course} height={52} rounded={10} /></View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt variant="label" numberOfLines={2}>{course.title}</Txt>
                            <Txt variant="caption" color={c.muted}>Enrolled {new Date(e.enrolledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Txt>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Pill text={active ? 'Active' : 'Expired'} tone={active ? 'success' : 'warning'} />
                          {e.validTill && <Txt variant="caption" color={c.inkSoft}>Valid till {new Date(e.validTill).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Txt>}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <ProgressBar pct={progress.pct} />
                          <Txt variant="caption">{progress.pct}%</Txt>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet
        open={!!open}
        onClose={() => { setOpen(null); setSent(null); setReason(''); setRefundErr(null); setRequested(false); }}
        title="Payment details"
        footer={<Button title={sent ? 'Invoice sent' : 'Email invoice'} iconLeft={sent ? 'checkmark' : 'mail-outline'} disabled={!!sent} style={{ flex: 1 }} onPress={async () => { if (open) { const r = await payments.emailInvoice(open.order.id); setSent(r.sentTo); } }} />}
      >
        {open && (
          <View style={{ gap: 10 }}>
            <Txt variant="bodyStrong">{open.course.title}</Txt>
            {([
              ['Invoice no.', open.order.invoiceNo],
              ['Date', when(open.order.createdAt)],
              ['Method', { upi: 'UPI', card: 'Card', netbanking: 'Net banking' }[open.order.method]],
              ['Course price', inr(open.order.amountInr + open.order.discountInr)],
              ...(open.order.discountInr ? [[`Discount${open.order.coupon ? ` (${open.order.coupon})` : ''}`, `− ${inr(open.order.discountInr)}`]] : []),
              ['GST included (18%)', inr(Math.round(open.order.amountInr - open.order.amountInr / 1.18))],
              ['Total paid', inr(open.order.amountInr)],
            ] as [string, string][]).map(([k, v]) => (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt color={c.inkSoft}>{k}</Txt>
                <Txt variant="bodyStrong">{v}</Txt>
              </View>
            ))}
            {sent && <Txt variant="caption" color={c.success}>Invoice emailed to {sent}.</Txt>}

            {/* Refund: request inside the window; show state otherwise */}
            {requested || win?.pending ? (
              <View style={[styles.refund, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}>
                <Ionicons name="hourglass-outline" size={18} color={c.primary} />
                <Txt variant="caption" style={{ flex: 1 }}>Refund request under review. We’ll notify you in 1–2 working days.</Txt>
              </View>
            ) : open.order.status === 'refunded' || win?.decided === 'approved' ? (
              <View style={[styles.refund, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}>
                <Ionicons name="checkmark-circle-outline" size={18} color={c.success} />
                <Txt variant="caption" style={{ flex: 1 }}>Refunded. The amount returns to your payment method in 5–7 working days.</Txt>
              </View>
            ) : win?.decided === 'rejected' ? (
              <View style={[styles.refund, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}>
                <Ionicons name="information-circle-outline" size={18} color={c.inkSoft} />
                <Txt variant="caption" style={{ flex: 1 }}>Your refund request was reviewed and not approved. See Help center for details.</Txt>
              </View>
            ) : win?.open ? (
              <View style={{ gap: 8 }}>
                <Txt variant="label">Need a refund? {win.daysLeft} day{win.daysLeft === 1 ? '' : 's'} left in the {win.days}-day window.</Txt>
                <TextField label="Reason" icon="chatbox-ellipses-outline" placeholder="Tell us briefly what went wrong" value={reason} onChangeText={(v) => { setReason(v); setRefundErr(null); }} error={refundErr} />
                <Button title="Request refund" variant="ghost" loading={refundBusy} onPress={askRefund} />
              </View>
            ) : (
              <Txt variant="caption" color={c.muted}>The refund window for this order has closed. Need help? Raise a ticket from Help center.</Txt>
            )}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  stats: { flexDirection: 'row', paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1 },
  seg: { flexDirection: 'row', padding: 4, borderRadius: radius.pill },
  segBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1 },
  enr: { padding: 12, borderRadius: radius.lg, borderWidth: 1, gap: 10 },
  refund: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.md, padding: 10 },
});
