/**
 * Batch page — one screen, five tabs (combines Batch Details, Live Sessions, Attendance,
 * Attendance Reports and Announcements designs): Overview · Students · Schedule · Attendance · Updates.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { ApiError, batchesApi } from '@/api/client';
import { attendanceBand, fmtTime, slotLabel, type Announcement, type ClassSession, type Mark } from '@/core/batch';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Avatar, BottomSheet, Chip, IconButton, Pill, ProgressBar, ProgressRing } from '@/ui/kit';
import { CourseArt } from '@/ui/course';
import { Banner, Checkbox } from '@/ui/misc';
import { DateField, PillTabs, TimeField } from '@/ui/pickers';
import { InviteSheet } from '@/ui/InviteSheet';
import { MessageSheet } from '@/ui/MessageSheet';

type Tab = 'overview' | 'students' | 'schedule' | 'attendance' | 'updates';
type Info = NonNullable<ReturnType<typeof batchesApi.get>>;
const soon = (f: string, step: string) => router.push({ pathname: '/educator-soon', params: { f, step } });
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const STATUS_TONE = { active: 'success', upcoming: 'info', completed: 'neutral' } as const;

export default function BatchPage() {
  const { id, tab: tabParam } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [tab, setTab] = useState<Tab>(tabParam ?? 'overview');
  const [rev, setRev] = useState(0);
  const [info, setInfo] = useState<ReturnType<typeof batchesApi.get>>(null);
  const [attSession, setAttSession] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const reload = useCallback(() => {
    setInfo(batchesApi.get(userId, id));
    setRev((r) => r + 1);
  }, [userId, id]);
  useFocusEffect(reload);
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2400);
  };

  if (!info) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, justifyContent: 'center', gap: 16 }}>
        <Banner text="This batch isn’t available to you." />
        <Button title="Back to batches" onPress={() => router.replace('/educator/batches')} />
      </SafeAreaView>
    );
  }
  const { batch, course, counts } = info;

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/educator/batches'))} />
          <Txt variant="heading" numberOfLines={1} style={{ flex: 1 }}>{batch.code}</Txt>
          <IconButton icon="share-social-outline" label="Share join link" tone="filled" onPress={async () => { try { await Share.share({ message: `Join ${batch.name}: ${info.joinLink}`, url: info.joinLink }); } catch { flash(info.joinLink); } }} />
        </View>

        <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.pad}>
            <View style={[styles.summary, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 96 }}><CourseArt course={course} height={74} rounded={radius.md} /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Pill text={info.status[0].toUpperCase() + info.status.slice(1)} tone={STATUS_TONE[info.status]} />
                  <Txt variant="bodyStrong" numberOfLines={2}>{batch.name}</Txt>
                  <Txt variant="caption" color={c.muted} numberOfLines={1}>{course.title}</Txt>
                </View>
              </View>
              <View style={styles.metaGrid}>
                <Meta icon="people-outline" v={`${counts.enrolled}/${batch.capacity}`} l="Students" />
                <Meta icon="calendar-outline" v={new Date(batch.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} l="Start" />
                <Meta icon="flag-outline" v={new Date(batch.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} l="End" />
                <Meta icon="hourglass-outline" v={`${info.weeks} wk`} l="Duration" />
              </View>
              {info.next && (
                <View style={[styles.next, { backgroundColor: c.primaryDeep }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="caption" color="rgba(255,255,255,0.75)">Next class · {when(info.next.startsAt)}</Txt>
                    <Txt variant="bodyStrong" color="#fff" numberOfLines={1}>{info.next.title}</Txt>
                  </View>
                  <Button title="Start" size="md" style={{ backgroundColor: '#E8A21B' }} onPress={() => router.push({ pathname: '/edu/prejoin/[id]', params: { id: info.next!.id } })} />
                </View>
              )}
            </View>
          </View>

          <View style={[styles.tabsWrap, { backgroundColor: c.ivory }]}>
            <PillTabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'overview', label: 'Overview', icon: 'grid-outline' },
                { id: 'students', label: `Students${counts.pending ? ` · ${counts.pending}` : ''}`, icon: 'people-outline' },
                { id: 'schedule', label: 'Schedule', icon: 'calendar-outline' },
                { id: 'attendance', label: 'Attendance', icon: 'checkbox-outline' },
                { id: 'updates', label: 'Updates', icon: 'megaphone-outline' },
              ]}
            />
          </View>

          <View style={styles.pad}>
            <View style={styles.inner}>
              {tab === 'overview' && <Overview info={info} go={setTab} />}
              {tab === 'students' && <Students info={info} userId={userId} rev={rev} reload={reload} flash={flash} />}
              {tab === 'schedule' && <Schedule info={info} reload={reload} flash={flash} onMark={(sid) => { setAttSession(sid); setTab('attendance'); }} />}
              {tab === 'attendance' && <Attendance info={info} userId={userId} initial={attSession} flash={flash} reload={reload} />}
              {tab === 'updates' && <Updates info={info} userId={userId} flash={flash} />}
            </View>
          </View>
        </ScrollView>
        {toast && (
          <View style={[styles.toast, { backgroundColor: c.ink }]} accessibilityLiveRegion="polite">
            <Txt variant="label" color="#fff" center>{toast}</Txt>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

function Meta({ icon, v, l }: { icon: keyof typeof Ionicons.glyphMap; v: string; l: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name={icon} size={14} color={c.muted} />
        <Txt variant="label">{v}</Txt>
      </View>
      <Txt variant="caption" color={c.muted}>{l}</Txt>
    </View>
  );
}

/* ───────── Overview ───────── */
function Overview({ info, go }: { info: Info; go: (t: Tab) => void }) {
  const { c } = useTheme();
  const { counts, batch } = info;
  return (
    <>
      {counts.pending > 0 && (
        <Pressable onPress={() => go('students')} style={[styles.alert, { backgroundColor: c.warningBg, borderColor: c.warning }]} accessibilityRole="button">
          <Ionicons name="person-add" size={20} color={c.warning} />
          <Txt variant="bodyStrong" style={{ flex: 1 }}>{counts.pending} join requests to approve</Txt>
          <Ionicons name="chevron-forward" size={18} color={c.warning} />
        </Pressable>
      )}
      <View style={styles.kpis}>
        <Kpi v={String(counts.enrolled)} l="Enrolled" icon="people" color={c.info} />
        <Kpi v={String(counts.activeLearners)} l="Active this week" icon="pulse" color={c.success} />
        <Kpi v={counts.attendance == null ? '–' : `${counts.attendance}%`} l="Attendance" icon="checkbox" color={c.accent} onPress={() => go('attendance')} />
        <Kpi v={`${counts.conducted}/${counts.sessions}`} l="Classes held" icon="radio" color="#7C3AED" onPress={() => go('schedule')} />
      </View>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
        <ProgressRing pct={counts.avgProgress} size={96} stroke={10} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="heading">Batch progress</Txt>
          <Txt variant="label" color={c.muted} style={{ fontWeight: '500' }}>Average lesson completion across {counts.enrolled} {counts.enrolled === 1 ? "student" : "students"}. {counts.completed === 1 ? '1 has' : `${counts.completed} have`} finished the course.</Txt>
        </View>
      </View>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Txt variant="heading">Schedule</Txt>
        <Row icon="repeat-outline" k="Weekly" v={slotLabel(batch.slots)} />
        <Row icon="videocam-outline" k="Mode" v={batch.slots[0]?.mode === 'offline' ? 'In person' : 'Online · Bodhin Live'} />
        <Row icon="enter-outline" k="Joining" v={batch.enrollment.selfEnroll ? (batch.enrollment.approval ? 'Link + your approval' : 'Anyone with the link') : 'Added by you only'} />
      </View>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Txt variant="heading">Instructors</Txt>
        {info.instructors.map((u) => (
          <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={u.name} size={38} color={c.primaryDeep} />
            <Txt variant="bodyStrong">{u.name}</Txt>
          </View>
        ))}
      </View>
      {info.lastAnnouncement && (
        <Pressable onPress={() => go('updates')} style={[styles.card, { backgroundColor: c.accentSoft, borderColor: c.border }]} accessibilityRole="button">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="megaphone" size={18} color={c.warning} />
            <Txt variant="label" color={c.inkSoft} style={{ flex: 1 }}>Latest update · {new Date(info.lastAnnouncement.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Txt>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </View>
          <Txt variant="bodyStrong">{info.lastAnnouncement.title}</Txt>
          <Txt color={c.inkSoft} numberOfLines={2}>{info.lastAnnouncement.body}</Txt>
        </Pressable>
      )}
    </>
  );
}

function Kpi({ v, l, icon, color, onPress }: { v: string; l: string; icon: keyof typeof Ionicons.glyphMap; color: string; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={[styles.kpi, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole={onPress ? 'button' : undefined}>
      <Ionicons name={icon} size={20} color={color} />
      <Txt variant="title" style={{ fontSize: 22, lineHeight: 28 }}>{v}</Txt>
      <Txt variant="caption" color={c.muted}>{l}</Txt>
    </Pressable>
  );
}
function Row({ icon, k, v }: { icon: keyof typeof Ionicons.glyphMap; k: string; v: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name={icon} size={18} color={c.muted} />
      <Txt color={c.inkSoft} style={{ width: 72 }}>{k}</Txt>
      <Txt variant="bodyStrong" style={{ flex: 1 }}>{v}</Txt>
    </View>
  );
}

/* ───────── Students ───────── */
function Students({ info, userId, rev, reload, flash }: { info: Info; userId: string; rev: number; reload: () => void; flash: (t: string) => void }) {
  const { c } = useTheme();
  const roster = useMemo(() => batchesApi.roster(info.batch.id), [info.batch.id, rev]);
  const [f, setF] = useState<'all' | 'active' | 'pending' | 'on_hold' | 'low'>(info.counts.pending ? 'pending' : 'all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<(typeof roster)[number] | null>(null);
  const [msgFor, setMsgFor] = useState<(typeof roster)[number] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const rows = roster.filter((r) => (f === 'all' ? true : f === 'low' ? r.attendance != null && r.attendance < 75 : r.status === f) && (!q.trim() || r.person.name.toLowerCase().includes(q.trim().toLowerCase()) || r.person.enrollmentId.toLowerCase().includes(q.trim().toLowerCase())));
  const pill = { active: ['Active', 'success'], completed: ['Completed', 'info'], pending: ['Requested', 'warning'], on_hold: ['On hold', 'neutral'] } as const;
  const setStatus = (s: Parameters<typeof batchesApi.setMemberStatus>[2], msg: string) => {
    if (!sel) return;
    batchesApi.setMemberStatus(info.batch.id, sel.person.id, s);
    setSel(null);
    setConfirmRemove(false);
    reload();
    flash(msg);
  };

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Add students" iconLeft="person-add" size="md" style={{ flex: 1 }} onPress={() => setAddOpen(true)} />
        <Button title="Invite new" iconLeft="mail-outline" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setInviteOpen(true)} />
      </View>
      <TextField label="Search" placeholder="Name or enrollment ID" value={q} onChangeText={setQ} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
        {([['all', 'All'], ['active', 'Active'], ['pending', 'Requests'], ['on_hold', 'On hold'], ['low', 'Attendance < 75%']] as const).map(([k, l]) => (
          <Chip key={k} label={`${l} (${roster.filter((r) => (k === 'all' ? true : k === 'low' ? r.attendance != null && r.attendance < 75 : r.status === k)).length})`} active={f === k} onPress={() => setF(k)} />
        ))}
      </ScrollView>
      <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
        {rows.length === 0 && <Txt color={c.muted} center style={{ padding: 24 }}>No students here.</Txt>}
        {rows.map((r, i) => {
          const [label, tone] = pill[r.status];
          const band = attendanceBand(r.attendance);
          return (
            <Pressable key={r.person.id} onPress={() => setSel(r)} style={[styles.sRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]} accessibilityRole="button" accessibilityLabel={`${r.person.name}, ${label}`}>
              <Avatar name={r.person.name} size={40} color={c.primary} />
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Txt variant="bodyStrong" numberOfLines={1}>{r.person.name}</Txt>
                <Txt variant="caption" color={c.muted}>{r.person.enrollmentId}{r.conducted ? ` · attended ${r.attended}/${r.conducted}` : ''}</Txt>
                {r.status !== 'pending' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ProgressBar pct={r.progress} color={r.progress < 40 ? c.danger : r.progress < 70 ? '#F5A524' : c.success} height={5} />
                    <Txt variant="caption" style={{ width: 34, fontWeight: '700' }}>{r.progress}%</Txt>
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Pill text={label} tone={tone} />
                {r.attendance != null && <Txt variant="caption" color={band === 'attention' ? c.danger : c.muted} style={{ fontWeight: '700' }}>{r.attendance}%</Txt>}
              </View>
            </Pressable>
          );
        })}
      </View>

      <BottomSheet open={!!sel && !confirmRemove} onClose={() => setSel(null)} title={sel?.person.name ?? ''}>
        {sel && (
          <View style={{ gap: 2 }}>
            <Txt variant="caption" color={c.muted}>{sel.person.email} · {sel.person.enrollmentId}</Txt>
            {sel.status === 'pending' && <SheetBtn icon="checkmark-circle-outline" label="Approve request" onPress={() => setStatus('active', `${sel.person.name} approved`)} />}
            <SheetBtn icon="person-outline" label="View profile" onPress={() => { const pid = sel.person.id; setSel(null); router.push({ pathname: '/edu/student/[id]', params: { id: pid } }); }} />
            <SheetBtn icon="chatbubble-outline" label="Send message" onPress={() => { setMsgFor(sel); setSel(null); }} />
            {sel.status === 'active' && <SheetBtn icon="pause-circle-outline" label="Put on hold" sub="Keeps progress; pauses class reminders" onPress={() => setStatus('on_hold', 'Put on hold')} />}
            {sel.status === 'on_hold' && <SheetBtn icon="play-circle-outline" label="Reactivate" onPress={() => setStatus('active', 'Reactivated')} />}
            <SheetBtn icon="person-remove-outline" label={sel.status === 'pending' ? 'Decline request' : 'Remove from batch'} danger onPress={() => setConfirmRemove(true)} />
          </View>
        )}
      </BottomSheet>
      <BottomSheet
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={sel?.status === 'pending' ? 'Decline request?' : 'Remove from batch?'}
        footer={
          <>
            <Button title="Keep" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setConfirmRemove(false)} />
            <Button title={sel?.status === 'pending' ? 'Decline' : 'Remove'} size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={() => setStatus('removed', sel?.status === 'pending' ? 'Request declined' : 'Removed from batch')} />
          </>
        }
      >
        <Txt color={c.inkSoft}>{sel?.person.name} leaves this batch’s classes and updates. Their course access and progress stay as they are.</Txt>
      </BottomSheet>
      <MessageSheet target={msgFor ? { id: msgFor.person.id, name: msgFor.person.name, linked: !!msgFor.person.userId } : null} onClose={() => setMsgFor(null)} userId={userId} flash={flash} />
      <AddExisting open={addOpen} onClose={() => setAddOpen(false)} info={info} userId={userId} onDone={(n) => { reload(); flash(`${n} added to the batch`); }} />
      <InviteSheet open={inviteOpen} onClose={() => { setInviteOpen(false); reload(); }} userId={userId} batchId={info.batch.id} />
    </>
  );
}

function AddExisting({ open, onClose, info, userId, onDone }: { open: boolean; onClose: () => void; info: Info; userId: string; onDone: (n: number) => void }) {
  const { c } = useTheme();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const list = useMemo(() => (open ? batchesApi.candidates(userId, info.batch.id) : []), [open, userId, info.batch.id]);
  const shown = list.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40);
  const left = info.batch.capacity - info.counts.enrolled;
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Add existing students"
      footer={<Button title={`Add ${sel.size || ''} to batch`} disabled={!sel.size} style={{ flex: 1 }} onPress={() => { try { batchesApi.addMembers(userId, info.batch.id, [...sel]); const n = sel.size; setSel(new Set()); onClose(); onDone(n); } catch (e) { setErr((e as ApiError).message); } }} />}
    >
      <Txt variant="caption" color={left <= 0 ? c.danger : c.muted}>{left} seats left of {info.batch.capacity}</Txt>
      {err && <Banner text={err} />}
      <TextField label="Search" value={q} onChangeText={setQ} placeholder="Type a name" />
      {shown.map((p) => (
        <Checkbox key={p.id} checked={sel.has(p.id)} onChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(p.id) : n.delete(p.id); return n; })} label={p.name}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={p.name} size={32} color={c.inkSoft} />
            <View style={{ flex: 1 }}>
              <Txt variant="label">{p.name}</Txt>
              <Txt variant="caption" color={c.muted}>{p.email}</Txt>
            </View>
          </View>
        </Checkbox>
      ))}
      {!shown.length && <Txt color={c.muted}>Everyone in your workspace is already in this batch. Use “Invite new”.</Txt>}
    </BottomSheet>
  );
}

function SheetBtn({ icon, label, sub, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void; danger?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.sheetRow} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={danger ? c.danger : c.primary} />
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong" color={danger ? c.danger : c.ink}>{label}</Txt>
        {sub && <Txt variant="caption" color={c.muted}>{sub}</Txt>}
      </View>
    </Pressable>
  );
}

/* ───────── Schedule ───────── */
function Schedule({ info, reload, flash, onMark }: { info: Info; reload: () => void; flash: (t: string) => void; onMark: (sessionId: string) => void }) {
  const { c } = useTheme();
  const all = batchesApi.sessions(info.batch.id);
  const [seg, setSeg] = useState<'scheduled' | 'conducted' | 'cancelled'>(info.status === 'completed' ? 'conducted' : 'scheduled');
  const [sel, setSel] = useState<ClassSession | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const list = all.filter((s) => s.status === seg);
  const ordered = seg === 'scheduled' ? list : [...list].reverse();
  const marks = sel ? batchesApi.attendance(sel.id) : [];
  const present = marks.filter((m) => m.mark && m.mark.status !== 'absent').length;

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {(['scheduled', 'conducted', 'cancelled'] as const).map((s) => (
          <Chip key={s} label={`${s === 'scheduled' ? 'Upcoming' : s === 'conducted' ? 'Conducted' : 'Cancelled'} (${all.filter((x) => x.status === s).length})`} active={seg === s} onPress={() => setSeg(s)} />
        ))}
      </View>
      <Button title="Schedule an extra class" iconLeft="add" variant="outline" size="md" onPress={() => router.push({ pathname: '/edu/schedule', params: { batchId: info.batch.id } })} />
      <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
        {ordered.length === 0 && <Txt color={c.muted} center style={{ padding: 24 }}>Nothing here.</Txt>}
        {ordered.map((s, i) => {
          const d = new Date(s.startsAt);
          const rows = s.status === 'conducted' ? batchesApi.attendance(s.id) : [];
          const att = rows.length ? Math.round((rows.filter((r) => r.mark && r.mark.status !== 'absent').length / rows.length) * 100) : null;
          return (
            <Pressable key={s.id} onPress={() => setSel(s)} style={[styles.sess, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]} accessibilityRole="button" accessibilityLabel={`${s.title}, ${when(s.startsAt)}`}>
              <View style={[styles.date, { backgroundColor: s.status === 'cancelled' ? c.surfaceMuted : c.primarySoft }]}>
                <Txt variant="caption" color={c.inkSoft}>{d.toLocaleDateString('en-IN', { month: 'short' })}</Txt>
                <Txt variant="heading" color={c.primaryDeep}>{d.getDate()}</Txt>
                <Txt variant="caption" color={c.inkSoft}>{d.toLocaleDateString('en-IN', { weekday: 'short' })}</Txt>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt variant="bodyStrong" numberOfLines={2} style={s.status === 'cancelled' ? { textDecorationLine: 'line-through' } : undefined}>{s.title}</Txt>
                <Txt variant="caption" color={c.muted}>{fmtTime(d.toTimeString().slice(0, 5))} – {fmtTime(new Date(s.endsAt).toTimeString().slice(0, 5))} · {s.mode === 'online' ? 'Online' : 'In person'}</Txt>
              </View>
              {att != null ? <Pill text={`${att}%`} tone={att >= 85 ? 'success' : 'warning'} icon="people" /> : <Ionicons name="chevron-forward" size={18} color={c.muted} />}
            </Pressable>
          );
        })}
      </View>

      <BottomSheet open={!!sel && !confirmCancel} onClose={() => setSel(null)} title={sel?.title ?? ''}>
        {sel && (
          <View style={{ gap: 12 }}>
            <Row icon="calendar-outline" k="When" v={when(sel.startsAt)} />
            <Row icon="videocam-outline" k="Mode" v={sel.mode === 'online' ? 'Online · Bodhin Live' : 'In person'} />
            {sel.status === 'conducted' && <Row icon="people-outline" k="Present" v={`${present} of ${marks.length}`} />}
            {sel.status === 'conducted' && (
              <>
                <Button title="Mark / edit attendance" iconLeft="checkbox-outline" onPress={() => { const id = sel.id; setSel(null); onMark(id); }} />
                <Button title="Class summary & recording" variant="outline" iconLeft="play-circle-outline" onPress={() => { const id = sel.id; setSel(null); router.push({ pathname: '/edu/summary/[id]', params: { id } }); }} />
              </>
            )}
            {sel.status === 'scheduled' && (
              <>
                <Button title="Start class" iconLeft="radio" onPress={() => { const id = sel.id; setSel(null); router.push({ pathname: '/edu/prejoin/[id]', params: { id } }); }} />
                {new Date(sel.startsAt).getTime() < Date.now() && <Button title="Mark attendance" variant="outline" iconLeft="checkbox-outline" onPress={() => { const id = sel.id; setSel(null); onMark(id); }} />}
                <Button title="Cancel this class" variant="outline" iconLeft="close-circle-outline" onPress={() => setConfirmCancel(true)} />
              </>
            )}
            {sel.status === 'cancelled' && <Button title="Restore class" iconLeft="refresh" onPress={() => { batchesApi.setSessionStatus(sel.id, 'scheduled'); setSel(null); reload(); flash('Class restored'); }} />}
          </View>
        )}
      </BottomSheet>
      <BottomSheet
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this class?"
        footer={
          <>
            <Button title="Keep" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setConfirmCancel(false)} />
            <Button title="Cancel class" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={() => { if (sel) batchesApi.setSessionStatus(sel.id, 'cancelled'); setConfirmCancel(false); setSel(null); reload(); flash('Class cancelled · students notified'); }} />
          </>
        }
      >
        <Txt color={c.inkSoft}>All {info.counts.enrolled} students get a notification. You can restore it later.</Txt>
      </BottomSheet>
    </>
  );
}

/* ───────── Attendance (mark + reports) ───────── */
function Attendance({ info, userId, initial, flash, reload }: { info: Info; userId: string; initial: string | null; flash: (t: string) => void; reload: () => void }) {
  const [seg, setSeg] = useState<'mark' | 'reports'>('mark');
  const { c } = useTheme();
  return (
    <>
      <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
        {(['mark', 'reports'] as const).map((s) => (
          <Pressable key={s} onPress={() => setSeg(s)} accessibilityRole="tab" accessibilityState={{ selected: seg === s }} style={[styles.segBtn, seg === s && { backgroundColor: c.surface }]}>
            <Txt variant="label" color={seg === s ? c.primary : c.inkSoft}>{s === 'mark' ? 'Mark attendance' : 'Reports'}</Txt>
          </Pressable>
        ))}
      </View>
      {seg === 'mark' ? <MarkAttendance info={info} initial={initial} flash={flash} reload={reload} /> : <Reports info={info} userId={userId} flash={flash} />}
    </>
  );
}

const NEXT: Record<Mark, Mark> = { present: 'late', late: 'absent', absent: 'present' };
function MarkAttendance({ info, initial, flash, reload }: { info: Info; initial: string | null; flash: (t: string) => void; reload: () => void }) {
  const { c } = useTheme();
  const past = batchesApi.sessions(info.batch.id).filter((s) => s.status !== 'cancelled' && new Date(s.startsAt).getTime() <= Date.now()).reverse();
  const [sid, setSid] = useState(initial ?? past[0]?.id ?? '');
  const [marks, setMarks] = useState<Record<string, { status: Mark; note?: string }>>({});
  const [dirty, setDirty] = useState(false);
  const rows = useMemo(() => (sid ? batchesApi.attendance(sid) : []), [sid]);
  useEffect(() => {
    const m: Record<string, { status: Mark; note?: string }> = {};
    rows.forEach((r) => r.mark && (m[r.person.id] = { status: r.mark.status, note: r.mark.note }));
    setMarks(m);
    setDirty(false);
  }, [rows]);
  if (!past.length) return <Txt color={c.muted} center style={{ paddingVertical: 30 }}>Attendance opens once the first class has started.</Txt>;
  const s = past.find((x) => x.id === sid)!;
  const counts = { present: 0, late: 0, absent: 0, unmarked: 0 };
  rows.forEach((r) => (marks[r.person.id] ? (counts[marks[r.person.id].status] += 1) : (counts.unmarked += 1)));
  const set = (pid: string, st: Mark) => {
    setMarks((m) => ({ ...m, [pid]: { ...m[pid], status: st } }));
    setDirty(true);
  };
  const tone = { present: [c.successBg, c.success, 'checkmark'], late: [c.warningBg, c.warning, 'time'], absent: [c.dangerBg, c.danger, 'close'] } as const;

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
        {past.slice(0, 12).map((x) => <Chip key={x.id} label={`${new Date(x.startsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · Class ${x.no}`} active={x.id === sid} onPress={() => setSid(x.id)} />)}
      </ScrollView>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Txt variant="bodyStrong">{s.title}</Txt>
        <Txt variant="caption" color={c.muted}>{when(s.startsAt)}</Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['present', 'late', 'absent'] as const).map((k) => (
            <View key={k} style={[styles.countBox, { backgroundColor: tone[k][0] }]}>
              <Txt variant="heading" color={tone[k][1]}>{counts[k]}</Txt>
              <Txt variant="caption" color={tone[k][1]} style={{ fontWeight: '700' }}>{k[0].toUpperCase() + k.slice(1)}</Txt>
            </View>
          ))}
          <View style={[styles.countBox, { backgroundColor: c.surfaceMuted }]}>
            <Txt variant="heading" color={c.inkSoft}>{counts.unmarked}</Txt>
            <Txt variant="caption" color={c.inkSoft} style={{ fontWeight: '700' }}>Unmarked</Txt>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Import from live class" iconLeft="cloud-download-outline" variant="soft" size="md" style={{ flex: 1.4 }} onPress={() => { const m: Record<string, { status: Mark; note?: string }> = {}; batchesApi.importFromLive(sid).forEach((x) => (m[x.personId] = { status: x.status, note: x.note })); setMarks(m); setDirty(true); flash('Filled from live-class join logs. Review and save.'); }} />
          <Button title="All present" variant="outline" size="md" style={{ flex: 1 }} onPress={() => { const m: Record<string, { status: Mark }> = {}; rows.forEach((r) => (m[r.person.id] = { status: 'present' })); setMarks(m); setDirty(true); }} />
        </View>
        <Txt variant="caption" color={c.muted}>Tap a student’s status to switch Present → Late → Absent.</Txt>
      </View>
      <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
        {rows.map((r, i) => {
          const m = marks[r.person.id];
          const t = m ? tone[m.status] : null;
          return (
            <View key={r.person.id} style={[styles.markRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
              <Avatar name={r.person.name} size={36} color={c.primary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="label" numberOfLines={1}>{r.person.name}</Txt>
                <Txt variant="caption" color={c.muted} numberOfLines={1}>{m?.note ?? r.person.enrollmentId}</Txt>
              </View>
              <Pressable onPress={() => set(r.person.id, m ? NEXT[m.status] : 'present')} style={[styles.markBtn, { backgroundColor: t ? t[0] : c.surfaceMuted, borderColor: t ? t[1] : c.border }]} accessibilityRole="button" accessibilityLabel={`${r.person.name}: ${m?.status ?? 'not marked'}. Tap to change.`}>
                {t && <Ionicons name={t[2]} size={16} color={t[1]} />}
                <Txt variant="label" color={t ? t[1] : c.muted}>{m ? m.status[0].toUpperCase() + m.status.slice(1) : 'Mark'}</Txt>
              </Pressable>
            </View>
          );
        })}
      </View>
      {dirty && (
        <Button title={`Save · ${counts.present} P · ${counts.late} L · ${counts.absent} A`} iconLeft="save-outline" disabled={counts.unmarked > 0} onPress={() => { batchesApi.saveAttendance(sid, Object.entries(marks).map(([personId, v]) => ({ personId, ...v }))); setDirty(false); reload(); flash('Attendance saved'); }} />
      )}
      {dirty && counts.unmarked > 0 && <Txt variant="caption" color={c.warning} center>Mark every student before saving ({counts.unmarked} left).</Txt>}
    </>
  );
}

function Reports({ info, userId, flash }: { info: Info; userId: string; flash: (t: string) => void }) {
  const { c } = useTheme();
  const r = useMemo(() => batchesApi.report(info.batch.id), [info.batch.id]);
  const [remind, setRemind] = useState(false);
  if (!r.conducted) return <Txt color={c.muted} center style={{ paddingVertical: 30 }}>Reports appear after the first class.</Txt>;
  return (
    <>
      <View style={styles.kpis}>
        <Kpi v={`${r.avg}%`} l="Avg attendance" icon="people" color={c.info} />
        <Kpi v={String(r.conducted)} l="Classes held" icon="checkmark-done" color={c.success} />
        <Kpi v={String(r.low.length)} l="Below 75%" icon="alert-circle" color={c.danger} />
        <Kpi v={`${r.delta >= 0 ? '+' : ''}${r.delta}%`} l="vs last week" icon="trending-up" color={c.accent} />
      </View>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Txt variant="heading">Weekly attendance</Txt>
        <Trend weeks={r.weeks} />
        <View style={styles.distBar} accessibilityLabel={`Present ${r.dist.present}%, late ${r.dist.late}%, absent ${r.dist.absent}%`}>
          <View style={{ flex: Math.max(1, r.dist.present), backgroundColor: c.success }} />
          <View style={{ flex: Math.max(1, r.dist.late), backgroundColor: '#F5A524' }} />
          <View style={{ flex: Math.max(1, r.dist.absent), backgroundColor: c.danger }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
          {([['Present', r.dist.present, c.success], ['Late', r.dist.late, '#F5A524'], ['Absent', r.dist.absent, c.danger]] as const).map(([l, v, col]) => (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: col }} />
              <Txt variant="caption" color={c.inkSoft}>{l} {v}%</Txt>
            </View>
          ))}
        </View>
      </View>
      {r.low.length > 0 && (
        <View style={[styles.alert, { backgroundColor: c.warningBg, borderColor: c.warning, flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="warning-outline" size={20} color={c.warning} />
            <Txt variant="bodyStrong" style={{ flex: 1 }}>{r.low.length} students below 75%</Txt>
          </View>
          <Txt variant="caption" color={c.inkSoft}>{r.low.map((x) => `${x.person.name} (${x.attendance}%)`).join(', ')}</Txt>
          <Button title="Send them a reminder" iconLeft="notifications-outline" size="md" onPress={() => setRemind(true)} />
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt variant="heading" style={{ flex: 1 }}>Student-wise</Txt>
        <Button title="Export CSV" iconLeft="download-outline" variant="outline" size="md" onPress={async () => { const csv = batchesApi.attendanceCsv(info.batch.id); try { await Share.share({ message: csv, title: `${info.batch.code}-attendance.csv` }); } catch { flash('CSV ready — sharing is not available in this preview'); } }} />
      </View>
      <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
        {r.students.map((s, i) => {
          const band = attendanceBand(s.attendance);
          return (
            <View key={s.person.id} style={[styles.markRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
              <Avatar name={s.person.name} size={34} color={c.primary} />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Txt variant="label" numberOfLines={1}>{s.person.name}</Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ProgressBar pct={s.attendance ?? 0} color={band === 'attention' ? c.danger : band === 'good' ? '#F5A524' : c.success} height={5} />
                  <Txt variant="caption" style={{ width: 62, fontWeight: '700' }}>{s.attended}/{s.conducted}</Txt>
                </View>
              </View>
              <Pill text={band === 'excellent' ? 'Excellent' : band === 'good' ? 'Good' : band === 'attention' ? 'Needs attention' : '–'} tone={band === 'excellent' ? 'success' : band === 'good' ? 'info' : 'live'} />
            </View>
          );
        })}
      </View>
      <ComposeSheet open={remind} onClose={() => setRemind(false)} info={info} userId={userId} flash={flash} preset={{ title: 'We miss you in class!', body: 'Your attendance has dropped below 75%. Join the next live class — recordings help, but live doubts clearing makes the biggest difference.', audience: 'low_attendance', kind: 'class' }} />
    </>
  );
}

function Trend({ weeks }: { weeks: { label: string; pct: number }[] }) {
  const { c } = useTheme();
  const w = 320, h = 150, padL = 34, padB = 22, padT = 12;
  const minY = 50;
  const x = (i: number) => padL + (weeks.length === 1 ? (w - padL) / 2 : (i / (weeks.length - 1)) * (w - padL - 12));
  const y = (v: number) => padT + (1 - (Math.max(minY, v) - minY) / (100 - minY)) * (h - padT - padB);
  const d = weeks.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ');
  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} accessibilityLabel={`Weekly attendance: ${weeks.map((p) => `${p.label} ${p.pct}%`).join(', ')}`}>
      {[50, 75, 100].map((g) => (
        <React.Fragment key={g}>
          <Line x1={padL} x2={w} y1={y(g)} y2={y(g)} stroke={c.border} strokeWidth={1} strokeDasharray={g === 75 ? '4 4' : undefined} />
          <SvgText x={padL - 6} y={y(g) + 4} fontSize={10} fill={c.muted} textAnchor="end">{g}%</SvgText>
        </React.Fragment>
      ))}
      <Path d={`${d} L${x(weeks.length - 1)},${h - padB} L${x(0)},${h - padB} Z`} fill={c.primary} opacity={0.08} />
      <Path d={d} stroke={c.primary} strokeWidth={2.4} fill="none" strokeLinejoin="round" />
      {weeks.map((p, i) => (
        <React.Fragment key={p.label}>
          <Circle cx={x(i)} cy={y(p.pct)} r={i === weeks.length - 1 ? 5 : 3.5} fill={i === weeks.length - 1 ? c.primary : c.surface} stroke={c.primary} strokeWidth={2} />
          <SvgText x={x(i)} y={h - 6} fontSize={10} fill={c.muted} textAnchor="middle">{p.label}</SvgText>
        </React.Fragment>
      ))}
    </Svg>
  );
}

/* ───────── Updates (announcements) ───────── */
function Updates({ info, userId, flash }: { info: Info; userId: string; flash: (t: string) => void }) {
  const { c } = useTheme();
  const [rev, setRev] = useState(0);
  const list = useMemo(() => batchesApi.announcements(info.batch.id), [info.batch.id, rev]);
  const [compose, setCompose] = useState<Partial<Announcement> | null>(null);
  const [sel, setSel] = useState<Announcement | null>(null);
  const [f, setF] = useState<'all' | 'sent' | 'scheduled' | 'draft'>('all');
  const icon = { class: ['calendar', '#7C3AED', '#F1ECFC'], assignment: ['document-text', c.success, c.successBg], recording: ['videocam', c.info, c.infoBg], general: ['megaphone', c.warning, c.warningBg] } as const;
  const rows = list.filter((a) => f === 'all' || a.status === f);
  return (
    <>
      <View style={styles.kpis}>
        <Kpi v={String(list.filter((a) => a.status === 'sent').length)} l="Sent" icon="paper-plane" color={c.primary} />
        <Kpi v={String(list.filter((a) => a.status === 'scheduled').length)} l="Scheduled" icon="time" color="#7C3AED" />
      </View>
      <Button title="New announcement" iconLeft="create-outline" onPress={() => setCompose({})} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {(['all', 'sent', 'scheduled', 'draft'] as const).map((k) => <Chip key={k} label={`${k[0].toUpperCase()}${k.slice(1)} (${list.filter((a) => k === 'all' || a.status === k).length})`} active={f === k} onPress={() => setF(k)} />)}
      </View>
      {rows.length === 0 && <Txt color={c.muted} center style={{ paddingVertical: 20 }}>No updates yet.</Txt>}
      {rows.map((a) => {
        const [ic, col, bg] = icon[a.kind];
        return (
          <Pressable key={a.id} onPress={() => setSel(a)} style={[styles.ann, { backgroundColor: a.pinned ? c.accentSoft : c.surface, borderColor: c.border }]} accessibilityRole="button">
            <View style={[styles.annIcon, { backgroundColor: bg }]}><Ionicons name={ic} size={20} color={col} /></View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {a.pinned && <Pill text="Pinned" tone="gold" icon="pin" />}
                {a.status !== 'sent' && <Pill text={a.status === 'scheduled' ? `Sends ${when(a.sendAt!)}` : 'Draft'} tone={a.status === 'scheduled' ? 'info' : 'neutral'} />}
              </View>
              <Txt variant="bodyStrong">{a.title}</Txt>
              <Txt color={c.inkSoft} numberOfLines={3}>{a.body}</Txt>
              <Txt variant="caption" color={c.muted}>{a.status === 'sent' ? `${new Date(a.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · ${a.reached} students · by ${a.by}` : `by ${a.by}`}{a.audience === 'low_attendance' ? ' · low attendance only' : ''}</Txt>
            </View>
          </Pressable>
        );
      })}

      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel?.title ?? ''}>
        {sel && (
          <View style={{ gap: 2 }}>
            <Txt color={c.inkSoft}>{sel.body}</Txt>
            {sel.status === 'draft' && <SheetBtn icon="create-outline" label="Edit & send" onPress={() => { setCompose(sel); setSel(null); }} />}
            <SheetBtn icon={sel.pinned ? 'pin-outline' : 'pin'} label={sel.pinned ? 'Unpin' : 'Pin to top'} onPress={() => { batchesApi.pinAnnouncement(sel.id); setSel(null); setRev((r) => r + 1); }} />
            <SheetBtn icon="trash-outline" label={sel.status === 'scheduled' ? 'Cancel scheduled update' : 'Delete'} danger onPress={() => { batchesApi.deleteAnnouncement(sel.id); setSel(null); setRev((r) => r + 1); flash('Deleted'); }} />
          </View>
        )}
      </BottomSheet>
      <ComposeSheet open={!!compose} onClose={() => { setCompose(null); setRev((r) => r + 1); }} info={info} userId={userId} flash={flash} preset={compose ?? undefined} />
    </>
  );
}

function ComposeSheet({ open, onClose, info, userId, flash, preset }: { open: boolean; onClose: () => void; info: Info; userId: string; flash: (t: string) => void; preset?: Partial<Announcement> }) {
  const { c } = useTheme();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<Announcement['kind']>('general');
  const [audience, setAudience] = useState<Announcement['audience']>('batch');
  const [pinned, setPinned] = useState(false);
  const [later, setLater] = useState(false);
  const [date, setDate] = useState(new Date(Date.now() + 864e5).toISOString());
  const [time, setTime] = useState('09:00');
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTitle(preset?.title ?? '');
    setBody(preset?.body ?? '');
    setKind(preset?.kind ?? 'general');
    setAudience(preset?.audience ?? 'batch');
    setPinned(!!preset?.pinned);
    setLater(false);
    setErr(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const sendAt = () => {
    const d = new Date(date);
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const go = async (mode: 'send' | 'schedule' | 'draft') => {
    setBusy(true);
    setErr(null);
    try {
      await batchesApi.announce(userId, { batchId: info.batch.id, title, body, kind, pinned, audience, mode, sendAt: mode === 'schedule' ? sendAt() : undefined, id: preset?.id });
      onClose();
      flash(mode === 'send' ? 'Sent to students' : mode === 'schedule' ? 'Scheduled' : 'Saved as draft');
    } catch (e) {
      const a = e as ApiError;
      setErr({ field: a.field, msg: a.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Announcement"
      footer={
        <>
          <Button title="Draft" variant="outline" size="md" style={{ flex: 1 }} onPress={() => go('draft')} />
          <Button title={later ? 'Schedule' : 'Send now'} iconRight={later ? 'time-outline' : 'send'} size="md" loading={busy} style={{ flex: 1.6 }} onPress={() => go(later ? 'schedule' : 'send')} />
        </>
      }
    >
      {err && !err.field && <Banner text={err.msg} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {([['general', 'General'], ['class', 'Class'], ['assignment', 'Assignment'], ['recording', 'Recording']] as const).map(([k, l]) => <Chip key={k} label={l} active={kind === k} onPress={() => setKind(k)} />)}
      </View>
      <TextField label="Title" value={title} onChangeText={setTitle} error={err?.field === 'title' ? err.msg : null} />
      <View style={{ gap: 6 }}>
        <Txt variant="label">Message</Txt>
        <TextInput value={body} onChangeText={(v) => setBody(v.slice(0, 1000))} multiline placeholder="What do students need to know?" placeholderTextColor={c.muted} accessibilityLabel="Announcement message" style={[styles.area, { borderColor: err?.field === 'body' ? c.danger : c.border, backgroundColor: c.surfaceMuted, color: c.ink }]} />
        {err?.field === 'body' && <Txt variant="caption" color={c.danger}>{err.msg}</Txt>}
      </View>
      <Txt variant="label">Send to</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label={`Whole batch (${info.counts.enrolled})`} active={audience === 'batch'} onPress={() => setAudience('batch')} />
        <Chip label="Attendance below 75%" active={audience === 'low_attendance'} onPress={() => setAudience('low_attendance')} />
      </View>
      <Pressable onPress={() => setPinned((v) => !v)} style={styles.toggle} accessibilityRole="switch" accessibilityState={{ checked: pinned }}>
        <Txt variant="bodyStrong" style={{ flex: 1 }}>Pin to top</Txt>
        <Switch value={pinned} onValueChange={setPinned} trackColor={{ true: c.primary, false: c.borderStrong }} thumbColor="#fff" />
      </Pressable>
      <Pressable onPress={() => setLater((v) => !v)} style={styles.toggle} accessibilityRole="switch" accessibilityState={{ checked: later }}>
        <Txt variant="bodyStrong" style={{ flex: 1 }}>Send later</Txt>
        <Switch value={later} onValueChange={setLater} trackColor={{ true: c.primary, false: c.borderStrong }} thumbColor="#fff" />
      </Pressable>
      {later && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <DateField label="Date" value={date} onChange={setDate} min={new Date().toISOString()} error={err?.field === 'sendAt' ? err.msg : null} />
          <TimeField label="Time" value={time} onChange={setTime} />
        </View>
      )}
      <Txt variant="caption" color={c.muted}>Students get a push notification and see it in the app. Students without the app get an email.</Txt>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 6 },
  pad: { paddingHorizontal: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  summary: { width: '100%', maxWidth: layout.contentMaxWidth, padding: 12, borderRadius: radius.lg, borderWidth: 1, gap: 12 },
  metaGrid: { flexDirection: 'row', gap: 8 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md },
  tabsWrap: { paddingVertical: 10 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.lg, borderWidth: 1.2 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: { flexBasis: '46%', flexGrow: 1, padding: 12, borderRadius: radius.lg, borderWidth: 1, gap: 2 },
  card: { padding: 14, borderRadius: radius.lg, borderWidth: 1, gap: 10 },
  list: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  sRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 70 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 4 },
  area: { minHeight: 110, borderWidth: 1.2, borderRadius: radius.md, padding: 12, fontSize: 15, textAlignVertical: 'top', outlineStyle: 'none' } as any,
  sess: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, minHeight: 72 },
  date: { width: 56, paddingVertical: 6, borderRadius: radius.md, alignItems: 'center' },
  seg: { flexDirection: 'row', padding: 4, borderRadius: radius.pill },
  segBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  countBox: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.md },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 62, paddingVertical: 6 },
  markBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 98, minHeight: 42, borderRadius: radius.pill, borderWidth: 1.4, paddingHorizontal: 10 },
  distBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  ann: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1 },
  annIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  toast: { position: 'absolute', bottom: 24, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.pill, maxWidth: '90%' },
});
