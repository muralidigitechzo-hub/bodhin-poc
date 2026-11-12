/** Earnings & statement: direct vs marketplace split, payouts (hold → scheduled → paid), transactions, CSV statement. */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Cols, Grid, useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, earningsApi, type Period } from '@/api/client';
import { TextField } from '@/ui/TextField';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { BottomSheet, Chip, Pill, Skeleton } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, KV, ScreenTop, fmtDay, inr, shared } from '@/ui/section';

type Data = Awaited<ReturnType<typeof earningsApi.statement>>;
type Ch = 'all' | 'tutor_direct' | 'bodhin_marketplace';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Earnings() {
  const { isDesktop } = useLayout();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [period, setPeriod] = useState<Period>('month');
  const [ch, setCh] = useState<Ch>('all');
  const [d, setD] = useState<Data | null>(null);
  const [how, setHow] = useState(false);
  const [sel, setSel] = useState<Data['rows'][number] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rf, setRf] = useState<ReturnType<typeof earningsApi.refundRequests>>([]);
  const [rfOpen, setRfOpen] = useState<ReturnType<typeof earningsApi.refundRequests>[number] | null>(null);
  const [rfNote, setRfNote] = useState('');
  const [rfErr, setRfErr] = useState<string | null>(null);
  const [rfBusy, setRfBusy] = useState(false);
  const load = useCallback(() => {
    earningsApi.statement(userId, period, ch).then(setD).catch((e) => setErr(e.message));
    try { setRf(earningsApi.refundRequests(userId)); } catch { /* not owner */ }
  }, [userId, period, ch]);
  useFocusEffect(load);
  const decide = async (decision: 'approved' | 'rejected') => {
    if (!rfOpen) return;
    setRfBusy(true);
    setRfErr(null);
    try {
      await earningsApi.decideRefund(userId, rfOpen.r.id, decision, rfNote);
      setRfOpen(null);
      setRfNote('');
      load();
    } catch (e) {
      setRfErr((e as ApiError).message);
    } finally {
      setRfBusy(false);
    }
  };
  const openRf = rf.filter((x) => x.r.status === 'open');

  if (err) return <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20 }}><Banner text={err} /></SafeAreaView>;
  const s = d?.summary;
  const max = d ? Math.max(1, ...d.history) : 1;

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Earnings & payouts" right={<Pressable onPress={() => setHow(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="How payments work"><Ionicons name="information-circle-outline" size={26} color={c.primary} /></Pressable>} />
        <ScrollView contentContainerStyle={[shared.scroll, isDesktop && { paddingHorizontal: 32, paddingTop: 8, paddingBottom: 48 }]} showsVerticalScrollIndicator={false}>
          <View style={[shared.inner, isDesktop && { maxWidth: 1180 }]}>
            <View style={shared.chips}>
              {([['month', 'This month'], ['last', 'Last month'], ['90d', 'Last 90 days']] as const).map(([k, l]) => <Chip key={k} label={l} active={period === k} onPress={() => setPeriod(k)} />)}
            </View>
            {openRf.length > 0 && (
              <Card title={`Refund requests · ${openRf.length}`}>
                <Txt variant="caption" color={c.muted}>These were direct sales — the money is in your gateway, so you decide. Approving refunds from your Razorpay/Cashfree and removes the learner’s access.</Txt>
                {openRf.map((x) => (
                  <Pressable key={x.r.id} onPress={() => { setRfOpen(x); setRfNote(''); setRfErr(null); }} accessibilityRole="button" accessibilityLabel={`Refund request from ${x.r.buyer}`} style={[styles.rfRow, { borderColor: c.border }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="bodyStrong" numberOfLines={1}>{x.r.buyer} · {inr(x.r.amountInr)}</Txt>
                      <Txt variant="caption" color={c.muted} numberOfLines={1}>{x.r.course} · “{x.r.reason}”</Txt>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.muted} />
                  </Pressable>
                ))}
              </Card>
            )}
            {!d || !s ? <View style={{ gap: 10 }}><Skeleton h={170} r={20} /><Skeleton h={120} /></View> : (
              <>
                <View style={[styles.hero, { backgroundColor: c.primaryDeep }]}>
                  <Txt variant="caption" color="rgba(255,255,255,0.75)">Your earnings · {period === 'month' ? 'this month' : period === 'last' ? 'last month' : 'last 90 days'}</Txt>
                  <Txt variant="display" color="#fff" style={{ fontVariant: ['tabular-nums'] }}>{inr(s.net)}</Txt>
                  <View style={styles.spark}>
                    {d.history.map((v, i) => <View key={i} style={{ flex: 1, height: 6 + (v / max) * 38, borderRadius: 4, backgroundColor: i === d.history.length - 1 ? '#E8A21B' : 'rgba(255,255,255,0.3)' }} />)}
                  </View>
                  <Txt variant="caption" color="rgba(255,255,255,0.7)">Monthly trend (last 8 months)</Txt>
                </View>

                <Cols>
                <Card title="Where it came from">
                  <View style={styles.split}>
                    <View style={[styles.dot, { backgroundColor: c.success }]} />
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong">Direct sales · {s.direct.count}</Txt>
                      <Txt variant="caption" color={c.muted}>Your site & links · paid straight to your gateway · 0% Bodhin fee</Txt>
                    </View>
                    <Txt variant="bodyStrong">{inr(s.direct.gross)}</Txt>
                  </View>
                  <View style={[styles.split, { alignItems: 'flex-start' }]}>
                    <View style={[styles.dot, { backgroundColor: c.info, marginTop: 6 }]} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="bodyStrong">Bodhin marketplace · {s.market.count}</Txt>
                      <Txt variant="caption" color={c.muted}>Bodhin collects, then pays you</Txt>
                      <KV k="Sales" v={inr(s.market.gross)} />
                      <KV k={`Bodhin commission (${Math.round(d.cfg.commissionRate * 100)}%)`} v={inr(-s.market.commission)} tone={c.danger} />
                      <KV k={`Gateway fee (${Math.round(d.cfg.gatewayFeeRate * 100)}%)`} v={inr(-s.market.fees)} tone={c.danger} />
                      <KV k="You receive" v={inr(s.market.net)} strong />
                    </View>
                  </View>
                  {s.refunds > 0 && <KV k="Refunded" v={inr(-s.refunds)} tone={c.danger} />}
                </Card>

                <Card title="Payouts from Bodhin">
                  <Txt variant="caption" color={c.muted}>Marketplace earnings are held {d.cfg.refundHoldDays} days for refunds, then paid every {DAYS[d.cfg.payoutWeekday]} to {d.account ? `${d.account.bank} ••${d.account.last4}` : 'your bank account'}.</Txt>
                  {!d.account?.verified && <Button title="Add payout bank account" size="md" iconLeft="card-outline" onPress={() => router.push('/edu/payments-setup')} />}
                  {d.upcoming.map((p) => (
                    <View key={p.date} style={styles.split}>
                      <Ionicons name={p.status === 'on_hold' ? 'hourglass-outline' : 'calendar-outline'} size={20} color={c.inkSoft} />
                      <View style={{ flex: 1 }}>
                        <Txt variant="bodyStrong">{fmtDay(p.date)}</Txt>
                        <Txt variant="caption" color={c.muted}>{p.count} sale{p.count > 1 ? 's' : ''} · {p.status === 'on_hold' ? 'in refund window' : 'scheduled'}</Txt>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <Txt variant="bodyStrong">{inr(p.amount)}</Txt>
                        <Pill text={p.status === 'on_hold' ? 'On hold' : 'Scheduled'} tone={p.status === 'on_hold' ? 'warning' : 'info'} />
                      </View>
                    </View>
                  ))}
                  {d.paidPayouts.slice(0, 3).map((p) => (
                    <View key={p.date} style={styles.split}>
                      <Ionicons name="checkmark-circle" size={20} color={c.success} />
                      <View style={{ flex: 1 }}>
                        <Txt variant="bodyStrong">{fmtDay(p.date)}</Txt>
                        <Txt variant="caption" color={c.muted}>{p.count} sale{p.count > 1 ? 's' : ''} · paid</Txt>
                      </View>
                      <Txt variant="bodyStrong" color={c.success}>{inr(p.amount)}</Txt>
                    </View>
                  ))}
                  {!d.upcoming.length && !d.paidPayouts.length && <Txt color={c.muted}>No marketplace payouts yet.</Txt>}
                </Card>
                </Cols>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Txt variant="heading">Transactions</Txt>
                  <Pressable onPress={async () => { try { await Share.share({ message: earningsApi.statementCsv(d.rows) }); } catch { /* ignore */ } }} hitSlop={10} accessibilityRole="button" style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                    <Ionicons name="download-outline" size={18} color={c.primary} />
                    <Txt variant="label" color={c.primary}>Statement (CSV)</Txt>
                  </Pressable>
                </View>
                <View style={shared.chips}>
                  {([['all', 'All'], ['tutor_direct', 'Direct'], ['bodhin_marketplace', 'Marketplace']] as const).map(([k, l]) => <Chip key={k} label={l} active={ch === k} onPress={() => setCh(k)} />)}
                </View>
                <View style={[shared.list, { backgroundColor: c.surface, borderColor: c.border }]}>
                  {d.rows.length === 0 && <Txt color={c.muted} center style={{ padding: 20 }}>No sales in this period.</Txt>}
                  {d.rows.map(({ o, course }, i) => {
                    const mine = o.channel === 'tutor_direct' ? o.amountInr : o.educatorShareInr;
                    return (
                      <Pressable key={o.id} onPress={() => setSel({ o, course })} style={[styles.tx, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]} accessibilityRole="button" accessibilityLabel={`${o.buyerName}, ${course.title}, ${inr(mine)}`}>
                        <View style={[styles.txIcon, { backgroundColor: o.channel === 'tutor_direct' ? c.successBg : c.infoBg }]}>
                          <Ionicons name={o.channel === 'tutor_direct' ? 'storefront-outline' : 'globe-outline'} size={18} color={o.channel === 'tutor_direct' ? c.success : c.info} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Txt variant="bodyStrong" numberOfLines={1}>{o.buyerName ?? 'Learner'}</Txt>
                          <Txt variant="caption" color={c.muted} numberOfLines={1}>{course.title} · {new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Txt>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Txt variant="bodyStrong" color={o.status === 'refunded' ? c.danger : c.ink}>{o.status === 'refunded' ? 'Refunded' : inr(mine)}</Txt>
                          {o.channel === 'bodhin_marketplace' && <Txt variant="caption" color={c.muted}>of {inr(o.amountInr)}</Txt>}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel?.o.invoiceNo ?? ''}>
        {sel && (
          <View style={{ gap: 6 }}>
            <Txt variant="bodyStrong">{sel.course.title}</Txt>
            <Txt variant="caption" color={c.muted}>{sel.o.buyerName} · {new Date(sel.o.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Txt>
            <KV k="Sale price (incl. GST)" v={inr(sel.o.amountInr)} />
            {!!sel.o.discountInr && <KV k={`Coupon ${sel.o.coupon ?? ''}`} v={inr(-sel.o.discountInr)} />}
            <KV k="Collected by" v={sel.o.collector === 'bodhin' ? 'Bodhin' : 'You (your gateway)'} />
            {sel.o.channel === 'bodhin_marketplace' ? (
              <>
                <KV k="Bodhin commission" v={inr(-sel.o.commissionInr)} tone={c.danger} />
                <KV k="Gateway fee" v={inr(-(sel.o.gatewayFeeInr ?? 0))} tone={c.danger} />
                <KV k="Your earning" v={inr(sel.o.educatorShareInr)} strong />
                <KV k="Payout" v={sel.o.payoutStatus === 'paid' ? `Paid ${fmtDay(sel.o.payoutDate!)}` : `${sel.o.payoutStatus === 'on_hold' ? 'On hold until' : 'Scheduled'} ${fmtDay(sel.o.payoutDate!)}`} />
              </>
            ) : <KV k="Your earning" v={inr(sel.o.amountInr)} strong />}
            <Txt variant="caption" color={c.muted} style={{ marginTop: 6 }}>{sel.o.channel === 'tutor_direct' ? 'Gateway charges for direct sales are billed by your gateway, not Bodhin.' : 'Marketplace sale: the learner found you on thebodhin.com.'}</Txt>
          </View>
        )}
      </BottomSheet>

      <BottomSheet open={how} onClose={() => setHow(false)} title="Who collects the money?">
        <View style={{ gap: 10 }}>
          <Txt color={c.inkSoft}><Txt variant="bodyStrong">Your own students</Txt> — on your site, custom domain or private link — pay through <Txt variant="bodyStrong">your</Txt> Razorpay/Cashfree. Money reaches you directly. Bodhin takes 0%.</Txt>
          <Txt color={c.inkSoft}><Txt variant="bodyStrong">Marketplace students</Txt> — who buy on thebodhin.com — pay Bodhin. Bodhin keeps {d ? Math.round(d.cfg.commissionRate * 100) : 20}% commission + gateway fee and pays you the rest every week after the refund window.</Txt>
          <Txt color={c.inkSoft}><Txt variant="bodyStrong">Your subscription</Txt> is billed separately in Subscription & usage.</Txt>
        </View>
      </BottomSheet>
      <BottomSheet open={!!rfOpen} onClose={() => setRfOpen(null)} title="Refund request" footer={
        <View style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
          <Button title="Decline" variant="ghost" loading={rfBusy} style={{ flex: 1 }} onPress={() => decide('rejected')} />
          <Button title="Approve refund" loading={rfBusy} style={{ flex: 1 }} onPress={() => decide('approved')} />
        </View>
      }>
        {rfOpen && (
          <View style={{ gap: 10 }}>
            <KV k="Learner" v={rfOpen.r.buyer} />
            <KV k="Course" v={rfOpen.r.course} />
            <KV k="Amount" v={inr(rfOpen.r.amountInr)} />
            <KV k="Paid on" v={fmtDay(rfOpen.o.createdAt)} />
            <Txt color={c.inkSoft}>“{rfOpen.r.reason}”</Txt>
            <TextField label="Note to learner (needed to decline)" icon="chatbox-outline" placeholder="e.g. You’ve completed most of the course" value={rfNote} onChangeText={(v) => { setRfNote(v); setRfErr(null); }} error={rfErr} />
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  rfRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  hero: { borderRadius: 20, padding: 18, gap: 6 },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 46, marginTop: 6 },
  split: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tx: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 64 },
  txIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
