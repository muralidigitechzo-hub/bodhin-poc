/**
 * Approvals inbox — Educators · Courses · Reports. Oldest first. Phone: tap → full review.
 * Desktop (≥1100px): list + review side by side. Select mode for bulk approve (only items passing all checks).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, approvals, type InboxTab } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, BottomSheet, Pill, Skeleton } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { CourseArt } from '@/ui/course';
import { ago } from '@/ui/admin';
import { ApplicationReview, CourseReview } from '@/ui/adminReview';

type Data = Awaited<ReturnType<typeof approvals.inbox>>;
type Report = Data['reports'][number];
const ACTIONS: Record<Report['kind'], { k: 'dismiss' | 'remove' | 'warn' | 'suspend'; l: string; danger?: boolean }[]> = {
  review: [{ k: 'dismiss', l: 'Keep review' }, { k: 'remove', l: 'Remove review', danger: true }],
  course: [{ k: 'dismiss', l: 'No issue' }, { k: 'remove', l: 'Unlist course', danger: true }],
  user: [{ k: 'dismiss', l: 'Dismiss' }, { k: 'warn', l: 'Warn user' }, { k: 'suspend', l: 'Suspend', danger: true }],
};

export default function Inbox() {
  const p = useLocalSearchParams<{ tab?: InboxTab; msg?: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<InboxTab>(p.tab ?? 'educators');
  const [sel, setSel] = useState<string | null>(null);
  const [pick, setPick] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<string | null>(p.msg ?? null);
  const [act, setAct] = useState<{ r: Report; k: 'dismiss' | 'remove' | 'warn' | 'suspend'; l: string } | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => approvals.inbox(userId).then((x) => { setD(x); return x; }), [userId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (p.tab) setTab(p.tab); if (p.msg) setMsg(p.msg); }, [p.tab, p.msg]);
  useEffect(() => { setSel(null); setPick(null); }, [tab]);
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); } }, [msg]);
  // Desktop: auto-open the first item so the reviewer never sees an empty pane.
  useEffect(() => {
    if (!wide || !d || sel) return;
    const first = tab === 'educators' ? d.educators[0]?.a.id : tab === 'courses' ? d.courses[0]?.c.id : null;
    if (first) setSel(first);
  }, [wide, d, tab, sel]);

  const open = (id: string) => (wide ? setSel(id) : router.push({ pathname: '/admin/review/[kind]/[id]', params: { kind: tab === 'courses' ? 'course' : 'application', id } }));
  const done = async (m: string) => { setMsg(m); setSel(null); await load(); };
  const tabs = d ? ([['educators', 'Educators', d.educators.filter((x) => x.a.status !== 'changes_requested').length, d.can.educators], ['courses', 'Courses', d.courses.length, d.can.courses], ['reports', 'Reports', d.reports.length, d.can.reports]] as const).filter((t) => t[3]) : [];
  const ids = tab === 'educators' ? (d?.educators ?? []).filter((x) => x.ready && x.a.status !== 'changes_requested').map((x) => x.a.id) : (d?.courses ?? []).filter((x) => x.ready).map((x) => x.c.id);

  const list = !d ? <View style={{ gap: 10 }}><Skeleton h={80} /><Skeleton h={80} /><Skeleton h={80} /></View> : (
    <>
      {tab === 'educators' && (d.educators.length === 0 ? <Empty text="No applications waiting." /> : d.educators.map(({ a, u, ready }) => (
        <Row key={a.id} label={`${a.workspaceName ?? u.name}, ${u.name}`} active={sel === a.id} picked={pick?.includes(a.id)} picking={!!pick} onPress={() => (pick ? ready && a.status !== 'changes_requested' && setPick((x) => (x!.includes(a.id) ? x!.filter((y) => y !== a.id) : [...x!, a.id])) : open(a.id))}>
          <Avatar name={u.name} size={42} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt variant="bodyStrong" numberOfLines={1}>{a.workspaceName}</Txt>
            <Txt variant="caption" color={c.muted} numberOfLines={1}>{u.name} · {a.city} · {a.subjects?.join(', ')}</Txt>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
              {a.status === 'changes_requested' ? <Pill text="Waiting on applicant" tone="neutral" /> : ready ? <Pill text="All checks pass" tone="success" icon="checkmark" /> : <Pill text="Missing info" tone="warning" />}
              {a.status === 'under_review' && <Pill text={a.reviewedBy ? `Opened by ${a.reviewedBy.split(' ')[0]}` : 'In review'} tone="info" />}
            </View>
          </View>
          <Txt variant="caption" color={c.muted}>{a.submittedAt ? ago(a.submittedAt) : ''}</Txt>
        </Row>
      )))}
      {tab === 'courses' && (d.courses.length === 0 ? <Empty text="No courses waiting for review." /> : d.courses.map(({ c: co, t, ready }) => (
        <Row key={co.id} label={co.title} active={sel === co.id} picked={pick?.includes(co.id)} picking={!!pick} onPress={() => (pick ? ready && setPick((x) => (x!.includes(co.id) ? x!.filter((y) => y !== co.id) : [...x!, co.id])) : open(co.id))}>
          <View style={{ width: 64 }}><CourseArt course={co} height={50} rounded={10} /></View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt variant="bodyStrong" numberOfLines={1}>{co.title}</Txt>
            <Txt variant="caption" color={c.muted} numberOfLines={1}>{t.branding.displayName} · ₹{co.priceInr.toLocaleString('en-IN')}</Txt>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
              {ready ? <Pill text="Checks pass" tone="success" icon="checkmark" /> : <Pill text="Needs fixes" tone="warning" />}
              {co.visibility === 'public_promoted' && <Pill text="Promotion" tone="gold" />}
            </View>
          </View>
          <Txt variant="caption" color={c.muted}>{co.updatedAt ? ago(co.updatedAt) : ''}</Txt>
        </Row>
      )))}
      {tab === 'reports' && (d.reports.length === 0 ? <Empty text="No open reports." /> : d.reports.map((r) => (
        <View key={r.id} style={[styles.report, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.rIcon, { backgroundColor: c.dangerBg }]}><Ionicons name={r.kind === 'review' ? 'star-half' : r.kind === 'course' ? 'layers' : 'person'} size={18} color={c.danger} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>{r.reason}</Txt>
              <Txt variant="caption" color={c.muted} numberOfLines={1}>{r.label} · {ago(r.at)}</Txt>
            </View>
          </View>
          <Txt color={c.inkSoft}>{r.detail}</Txt>
          <Txt variant="caption" color={c.muted}>Reported by {r.by}</Txt>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {ACTIONS[r.kind].map((a) => <Button key={a.k} title={a.l} size="md" variant={a.danger ? 'primary' : 'outline'} style={{ flexGrow: 1, ...(a.danger ? { backgroundColor: c.danger } : {}) }} onPress={() => { setAct({ r, ...a }); setNote(''); setErr(null); }} />)}
          </View>
        </View>
      )))}
      {d.history.length > 0 && (
        <View style={{ gap: 6, marginTop: 8 }}>
          <Txt variant="label" color={c.muted}>RECENTLY DECIDED</Txt>
          {d.history.slice(0, 6).map((e) => <Txt key={e.id} variant="caption" color={c.inkSoft}>{ago(e.at)} · {e.actorName} · {e.summary} — {e.target.label}</Txt>)}
        </View>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={[styles.head, wide && { maxWidth: undefined }]}>
          <Txt variant="title" style={{ flex: 1 }}>Inbox</Txt>
          {tab !== 'reports' && ids.length > 1 && (pick ? <Button title="Cancel" size="md" variant="ghost" onPress={() => setPick(null)} /> : <Button title="Select" size="md" variant="outline" iconLeft="checkbox-outline" onPress={() => setPick([])} />)}
        </View>
        <View style={styles.tabsRow}>
          {tabs.map(([k, l, n]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, { backgroundColor: tab === k ? c.primary : c.surface, borderColor: tab === k ? c.primary : c.border }]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
              <Txt variant="label" color={tab === k ? '#fff' : c.ink}>{l}</Txt>
              {n > 0 && <View style={[styles.count, { backgroundColor: tab === k ? 'rgba(255,255,255,0.25)' : c.primarySoft }]}><Txt variant="caption" color={tab === k ? '#fff' : c.primary}>{n}</Txt></View>}
            </Pressable>
          ))}
        </View>
        {msg && <View style={{ paddingHorizontal: 16 }}><Banner tone="success" text={msg} /></View>}
        {wide && tab !== 'reports' ? (
          <View style={{ flex: 1, flexDirection: 'row', gap: 16, padding: 16, paddingTop: 8 }}>
            <ScrollView style={{ width: 420, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingBottom: 20 }}>{list}</ScrollView>
            <View style={{ flex: 1, minWidth: 0 }}>
              {sel ? (tab === 'courses' ? <CourseReview key={sel} id={sel} userId={userId} onDone={done} /> : <ApplicationReview key={sel} id={sel} userId={userId} onDone={done} />) : <Empty text="Select an item to review." />}
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}><View style={styles.inner}>{list}</View></ScrollView>
        )}
        {pick && (
          <View style={[styles.bulk, { backgroundColor: c.surface, borderTopColor: c.border }]}>
            <Button title={`Select all ready (${ids.length})`} size="md" variant="outline" style={{ flex: 1 }} onPress={() => setPick(ids)} />
            <Button title={`Approve ${pick.length}`} size="md" iconLeft="checkmark-done" disabled={!pick.length} style={{ flex: 1 }} onPress={async () => { const r = await approvals.bulkApprove(userId, tab === 'courses' ? 'courses' : 'educators', pick); setPick(null); setMsg(`${r.done.length} approved${r.skipped.length ? ` · ${r.skipped.length} skipped (checks failed)` : ''}`); load(); }} />
          </View>
        )}
      </SafeAreaView>

      <BottomSheet open={!!act} onClose={() => setAct(null)} title={act?.l ?? ''} footer={<Button title="Confirm" size="md" style={{ flex: 1, ...(act?.k === 'remove' || act?.k === 'suspend' ? { backgroundColor: c.danger } : {}) }} onPress={async () => { if (!act) return; try { await approvals.resolveReport(userId, act.r.id, act.k, note.trim()); setAct(null); setMsg(`Resolved · ${act.l.toLowerCase()}`); load(); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not resolve.'); } }} />}>
        <View style={{ gap: 8 }}>
          <Txt color={c.inkSoft}>{act?.r.label}</Txt>
          <TextInput value={note} onChangeText={setNote} multiline placeholder={act?.k === 'warn' || act?.k === 'suspend' ? 'Message to the user' : 'Internal note (optional)'} placeholderTextColor={c.muted} style={[styles.area, { borderColor: c.border, color: c.ink }]} accessibilityLabel="Note" />
          {err && <Banner text={err} />}
        </View>
      </BottomSheet>
    </View>
  );
}

function Row({ children, onPress, active, picked, picking, label }: { children: React.ReactNode; onPress: () => void; active?: boolean; picked?: boolean; picking?: boolean; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { backgroundColor: active ? c.primarySoft : c.surface, borderColor: active || picked ? c.primary : c.border }, pressed && { opacity: 0.85 }]} accessibilityRole={picking ? 'checkbox' : 'button'} accessibilityLabel={label} accessibilityState={picking ? { checked: !!picked } : undefined}>
      {picking && <Ionicons name={picked ? 'checkbox' : 'square-outline'} size={22} color={picked ? c.primary : c.borderStrong} />}
      {children}
    </Pressable>
  );
}

function Empty({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Ionicons name="checkmark-done-circle-outline" size={36} color={c.success} />
      <Txt color={c.muted} center>{text}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  tabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 40 },
  count: { borderRadius: 999, paddingHorizontal: 7, minWidth: 22, alignItems: 'center' },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 30 },
  inner: { width: '100%', maxWidth: 720, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 12, minHeight: 72 },
  report: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 8 },
  rIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: 1, borderRadius: 18, padding: 28, alignItems: 'center', gap: 8 },
  bulk: { flexDirection: 'row', gap: 8, borderTopWidth: 1, padding: 12 },
  area: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 80, textAlignVertical: 'top', fontSize: 15 },
});
