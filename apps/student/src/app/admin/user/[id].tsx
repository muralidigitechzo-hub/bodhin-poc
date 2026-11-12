/** User 360: accounts, roles, courses, orders, tickets — lock/unlock, reset, verify phone, grant/remove course. */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, catalog, usersAdmin } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Avatar, BottomSheet, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, KV, ScreenTop, fmtDay, inr, shared } from '@/ui/section';
import { ago } from '@/ui/admin';

type Sheet = null | 'lock' | 'grant' | { revoke: string; title: string };

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [, force] = useState(0);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [reason, setReason] = useState('');
  const [course, setCourse] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const d = usersAdmin.detail(userId, id);
  if (!d) return <SafeAreaView style={{ flex: 1, padding: 20, backgroundColor: c.ivory }}><Banner text="User not found." /></SafeAreaView>;
  const act = async (a: Parameters<typeof usersAdmin.act>[2], m: string) => {
    setErr(null);
    try { await usersAdmin.act(userId, id, a); setSheet(null); setMsg(m); force((n) => n + 1); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); }
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="User" fallback="/admin/users" />
        <ScrollView contentContainerStyle={shared.scroll} showsVerticalScrollIndicator={false}>
          <View style={shared.inner}>
            {msg && <Banner tone="success" text={msg} />}
            {err && !sheet && <Banner text={err} />}
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={d.u.name} size={54} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="heading">{d.u.name}</Txt>
                  <Txt variant="caption" color={c.muted}>{d.u.email}</Txt>
                  <Txt variant="caption" color={c.muted}>{d.u.phone} {d.u.phoneVerified ? '✓ verified' : '· not verified'} · joined {fmtDay(d.u.createdAt)}</Txt>
                </View>
              </View>
              {d.lock && <Banner text={`Locked by ${d.lock.by} ${ago(d.lock.at)}: ${d.lock.reason}`} />}
              {d.canManage && (
                <View style={shared.chips}>
                  {d.lock ? <Button title="Unlock" size="md" iconLeft="lock-open" onPress={() => act({ kind: 'unlock' }, 'Account unlocked')} /> : <Button title="Lock account" size="md" variant="outline" iconLeft="lock-closed" onPress={() => { setSheet('lock'); setReason(''); setErr(null); }} />}
                  <Button title="Send reset link" size="md" variant="outline" iconLeft="key-outline" onPress={() => act({ kind: 'reset' }, 'Password reset link sent')} />
                  {!d.u.phoneVerified && <Button title="Mark phone verified" size="md" variant="outline" iconLeft="call-outline" onPress={() => act({ kind: 'verify_phone' }, 'Phone marked verified')} />}
                </View>
              )}
            </Card>
            <Card title="Roles & workspaces">
              {d.memberships.map((m, i) => (
                <Pressable key={i} disabled={!m.tenantId || m.tenantId === 't_bodhin'} onPress={() => router.push({ pathname: '/admin/tenant/[id]', params: { id: m.tenantId } })} accessibilityRole="button">
                  <KV k={m.tenant} v={m.role.replace('_', ' ')} />
                </Pressable>
              ))}
            </Card>
            <Card title={`Courses · ${d.enrolments.length}`} right={d.canManage ? <Pressable onPress={() => { setSheet('grant'); setReason(''); setCourse(null); setErr(null); }} hitSlop={8} accessibilityRole="button"><Txt variant="label" color={c.primary}>+ Give access</Txt></Pressable> : undefined}>
              {d.enrolments.length === 0 && <Txt color={c.muted}>No enrolments.</Txt>}
              {d.enrolments.map(({ e, c: co }) => (
                <View key={e.courseId} style={styles.row}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="label" numberOfLines={1}>{co?.title ?? e.courseId}</Txt>
                    <Txt variant="caption" color={c.muted}>{e.completedLessonIds.length} lessons done · since {fmtDay(e.enrolledAt)} · {e.source}</Txt>
                  </View>
                  {d.canManage && <Pressable onPress={() => { setSheet({ revoke: e.courseId, title: co?.title ?? '' }); setReason(''); setErr(null); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove access to ${co?.title}`}><Ionicons name="remove-circle-outline" size={22} color={c.danger} /></Pressable>}
                </View>
              ))}
            </Card>
            <Card title={`Orders · ${d.orders.length}`}>
              {d.orders.length === 0 && <Txt color={c.muted}>No orders.</Txt>}
              {d.orders.map((o) => <KV key={o.id} k={`${fmtDay(o.createdAt)} · ${o.invoiceNo}`} v={`${inr(o.amountInr)}${o.status === 'refunded' ? ' · refunded' : ''}`} />)}
            </Card>
            <Card title={`Support tickets · ${d.tickets.length}`}>
              {d.tickets.length === 0 && <Txt color={c.muted}>None.</Txt>}
              {d.tickets.map((t) => <View key={t.id} style={styles.row}><Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>{t.id} · {t.subject}</Txt><Pill text={t.status.replace('_', ' ')} tone={t.status === 'resolved' ? 'success' : 'warning'} /></View>)}
            </Card>
            {d.log.length > 0 && <Card title="Admin actions">{d.log.map((e) => <Txt key={e.id} variant="caption" color={c.inkSoft}>{ago(e.at)} · {e.actorName} · {e.summary}</Txt>)}</Card>}
          </View>
        </ScrollView>
      </SafeAreaView>
      <BottomSheet open={sheet === 'lock'} onClose={() => setSheet(null)} title="Lock account" footer={<Button title="Lock" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={() => act({ kind: 'lock', reason }, 'Account locked — sign-in blocked')} />}>
        <View style={{ gap: 8 }}>
          <Txt color={c.inkSoft}>They can’t sign in until unlocked. Purchases and progress are kept.</Txt>
          <TextField label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. Sharing paid videos publicly" />
          {err && <Banner text={err} />}
        </View>
      </BottomSheet>
      <BottomSheet open={sheet === 'grant'} onClose={() => setSheet(null)} title="Give course access" footer={<Button title="Give access" size="md" disabled={!course} style={{ flex: 1 }} onPress={() => act({ kind: 'grant', courseId: course!, reason }, 'Access given · learner notified')} />}>
        <View style={{ gap: 8 }}>
          {usersAdminCourses().filter((co) => !d.enrolments.some((x) => x.e.courseId === co.id)).map((co) => (
            <Pressable key={co.id} onPress={() => setCourse(co.id)} style={[styles.pick, { borderColor: course === co.id ? c.primary : c.border, backgroundColor: course === co.id ? c.primarySoft : c.surface }]} accessibilityRole="radio" accessibilityState={{ checked: course === co.id }}>
              <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>{co.title}</Txt>
              <Txt variant="caption" color={c.muted}>{co.priceInr ? inr(co.priceInr) : 'Free'}</Txt>
            </Pressable>
          ))}
          <TextField label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. Paid by bank transfer, ref 7781" />
          {err && <Banner text={err} />}
        </View>
      </BottomSheet>
      <BottomSheet open={!!sheet && typeof sheet === 'object'} onClose={() => setSheet(null)} title="Remove course access" footer={<Button title="Remove" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={() => sheet && typeof sheet === 'object' && act({ kind: 'revoke', courseId: sheet.revoke, reason }, 'Access removed')} />}>
        <View style={{ gap: 8 }}>
          <Txt color={c.inkSoft}>{sheet && typeof sheet === 'object' ? sheet.title : ''} — the learner loses access immediately. For refunds use Money → Refunds instead.</Txt>
          <TextField label="Reason" value={reason} onChangeText={setReason} />
          {err && <Banner text={err} />}
        </View>
      </BottomSheet>
    </View>
  );
}

function usersAdminCourses() {
  return catalog.allCourses();
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, padding: 10, minHeight: 48 },
});
