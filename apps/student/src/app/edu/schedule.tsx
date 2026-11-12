/**
 * Schedule a live class (one screen, thumb-first): batch → title → when → instructor & mode →
 * class settings → notify. Enforces live room-hours limit and same-batch clashes (server-side in real API).
 */
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, batchForm, educator, liveAdmin } from '@/api/client';
import { fmtTime } from '@/core/batch';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Avatar, BottomSheet, Chip, IconButton } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { DateField, TimeField } from '@/ui/pickers';

const DURATIONS = [30, 45, 60, 90, 120];
const REMINDERS = [{ m: 1440, l: '1 day before' }, { m: 120, l: '2 hours before' }, { m: 15, l: '15 min before' }];
const SETTINGS = [
  { k: 'record', icon: 'recording-outline', t: 'Record this class', s: 'Recording uses storage from your plan' },
  { k: 'saveToCourse', icon: 'albums-outline', t: 'Add recording to the course', s: 'Batch students can re-watch it' },
  { k: 'chat', icon: 'chatbubble-ellipses-outline', t: 'Live chat', s: '' },
  { k: 'qa', icon: 'help-circle-outline', t: 'Q&A with upvotes', s: '' },
  { k: 'trackAttendance', icon: 'checkbox-outline', t: 'Auto attendance', s: 'Present if in class ≥ 50% of the time' },
] as const;

function nextSlot() {
  const d = new Date(Date.now() + 864e5);
  d.setHours(19, 0, 0, 0);
  return d;
}

export default function ScheduleClass() {
  const { batchId: pre } = useLocalSearchParams<{ batchId?: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const ctx = educator.context(userId);
  const batches = useMemo(() => liveAdmin.hostableBatches(userId), [userId]);
  const team = useMemo(() => batchForm.team(userId), [userId]);
  const [batchId, setBatchId] = useState(pre && batches.some((b) => b.id === pre) ? pre : batches[0]?.id ?? '');
  const [pickBatch, setPickBatch] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const init = nextSlot();
  const [date, setDate] = useState(init.toISOString());
  const [time, setTime] = useState('19:00');
  const [dur, setDur] = useState(60);
  const [instructorId, setInstructorId] = useState(userId);
  const [mode, setMode] = useState<'online' | 'offline'>('online');
  const [settings, setSettings] = useState({ record: true, saveToCourse: true, qa: true, chat: true, trackAttendance: true });
  const [notifyNow, setNotifyNow] = useState(true);
  const [reminders, setReminders] = useState<number[]>([1440, 15]);
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const batch = batches.find((b) => b.id === batchId);
  const hours = ctx?.usage.rows.find((r) => r.key === 'liveHours');
  const startsAt = (() => {
    const d = new Date(date);
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  })();
  const ends = new Date(startsAt.getTime() + dur * 6e4);
  const instructors = team.filter((u) => !batch || batch.instructorIds.includes(u.id) || u.role === 'owner');

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      await liveAdmin.schedule(userId, { batchId, title, description: desc, startsAt: startsAt.toISOString(), durationMin: dur, instructorId, mode, settings, notifyNow, reminders });
      router.replace({ pathname: '/edu/batch/[id]', params: { id: batchId, tab: 'schedule' } });
    } catch (e) {
      setErr(e instanceof ApiError ? { field: e.field, msg: e.message } : { msg: 'Something went wrong. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  if (!batches.length) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, justifyContent: 'center', gap: 16 }}>
        <Banner tone="info" text="Live classes belong to a batch. Create a batch first, then schedule its classes." />
        <Button title="Create a batch" onPress={() => router.replace('/edu/batch-new')} />
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="close" label="Close" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/educator/live'))} />
          <Txt variant="heading" style={{ flex: 1 }}>Schedule live class</Txt>
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.inner}>
              <Card title="Batch">
                <Pressable onPress={() => setPickBatch(true)} style={[styles.pick, { borderColor: err?.field === 'batch' ? c.danger : c.border, backgroundColor: c.surfaceMuted }]} accessibilityRole="button" accessibilityLabel={`Batch: ${batch?.name ?? 'choose'}`}>
                  <Ionicons name="people-outline" size={18} color={c.inkSoft} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="bodyStrong" numberOfLines={1}>{batch?.name ?? 'Choose a batch'}</Txt>
                    {batch && <Txt variant="caption" color={c.muted}>{batch.code}</Txt>}
                  </View>
                  <Ionicons name="chevron-down" size={18} color={c.muted} />
                </Pressable>
              </Card>

              <Card title="Class details">
                <TextField label="Class title" placeholder="e.g. Google Ads – Search campaigns" value={title} onChangeText={setTitle} error={err?.field === 'title' ? err.msg : undefined} maxLength={80} />
                <TextField label="What will you cover? (optional)" placeholder="Students see this on the class card" value={desc} onChangeText={setDesc} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} maxLength={300} />
              </Card>

              <Card title="When">
                <DateField label="Date" value={date} onChange={setDate} min={new Date().toISOString()} />
                <TimeField label="Start time" value={time} onChange={setTime} />
                <Txt variant="label">Duration</Txt>
                <View style={styles.chips}>
                  {DURATIONS.map((d) => <Chip key={d} label={d < 60 ? `${d} min` : `${d / 60} h`.replace('1.5 h', '1 h 30')} active={dur === d} onPress={() => setDur(d)} />)}
                </View>
                <Txt variant="caption" color={err?.field === 'time' ? c.danger : c.muted}>
                  {err?.field === 'time' ? err.msg : `${startsAt.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} · ${fmtTime(time)} – ${fmtTime(ends.toTimeString().slice(0, 5))} (IST)`}
                </Txt>
              </Card>

              <Card title="Instructor & mode">
                <View style={styles.chips}>
                  {instructors.map((u) => (
                    <Pressable key={u.id} onPress={() => setInstructorId(u.id)} style={[styles.person, { borderColor: instructorId === u.id ? c.primary : c.border, backgroundColor: instructorId === u.id ? c.primarySoft : c.surface }]} accessibilityRole="radio" accessibilityState={{ checked: instructorId === u.id }}>
                      <Avatar name={u.name} size={28} />
                      <Txt variant="label">{u.name.split(' ')[0]}{u.id === userId ? ' (you)' : ''}</Txt>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.chips}>
                  <Chip label="Online · Bodhin Live" icon="videocam-outline" active={mode === 'online'} onPress={() => setMode('online')} />
                  <Chip label="In person" icon="location-outline" active={mode === 'offline'} onPress={() => setMode('offline')} />
                </View>
                {mode === 'online' && hours && (
                  <Txt variant="caption" color={hours.level === 'ok' ? c.muted : c.warning}>Uses ~{dur / 60} live room-hour{dur > 60 ? 's' : ''} · {hours.used} of {hours.limit ?? '∞'} h used this month</Txt>
                )}
              </Card>

              {mode === 'online' && (
                <Card title="Class settings">
                  {SETTINGS.map((s) => {
                    const disabled = s.k === 'saveToCourse' && !settings.record;
                    return (
                      <View key={s.k} style={[styles.toggle, disabled && { opacity: 0.45 }]}>
                        <Ionicons name={s.icon} size={20} color={c.inkSoft} />
                        <View style={{ flex: 1 }}>
                          <Txt variant="bodyStrong">{s.t}</Txt>
                          {!!s.s && <Txt variant="caption" color={c.muted}>{s.s}</Txt>}
                        </View>
                        <Switch disabled={disabled} value={settings[s.k] && !disabled} onValueChange={(v) => setSettings((x) => ({ ...x, [s.k]: v }))} accessibilityLabel={s.t} trackColor={{ true: c.primary, false: c.borderStrong }} thumbColor="#fff" />
                      </View>
                    );
                  })}
                </Card>
              )}

              <Card title="Notify students">
                <View style={styles.toggle}>
                  <Ionicons name="notifications-outline" size={20} color={c.inkSoft} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">Notify now</Txt>
                    <Txt variant="caption" color={c.muted}>App notification to the {batch ? 'batch' : ''} students</Txt>
                  </View>
                  <Switch value={notifyNow} onValueChange={setNotifyNow} accessibilityLabel="Notify now" trackColor={{ true: c.primary, false: c.borderStrong }} thumbColor="#fff" />
                </View>
                <Txt variant="label">Reminders</Txt>
                <View style={styles.chips}>
                  {REMINDERS.map((r) => <Chip key={r.m} label={r.l} active={reminders.includes(r.m)} onPress={() => setReminders((x) => (x.includes(r.m) ? x.filter((y) => y !== r.m) : [...x, r.m]))} />)}
                </View>
              </Card>

              {err && !err.field && <Banner text={err.msg} />}
            </View>
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
            <Button title="Schedule class" iconLeft="calendar" loading={busy} onPress={submit} style={{ width: '100%', maxWidth: layout.contentMaxWidth }} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <BottomSheet open={pickBatch} onClose={() => setPickBatch(false)} title="Choose batch">
        <View style={{ gap: 8 }}>
          {batches.map((b) => (
            <Pressable key={b.id} onPress={() => { setBatchId(b.id); setPickBatch(false); }} style={[styles.pick, { borderColor: b.id === batchId ? c.primary : c.border, backgroundColor: b.id === batchId ? c.primarySoft : c.surface }]} accessibilityRole="radio" accessibilityState={{ checked: b.id === batchId }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong" numberOfLines={1}>{b.name}</Txt>
                <Txt variant="caption" color={c.muted}>{b.code}</Txt>
              </View>
              {b.id === batchId && <Ionicons name="checkmark-circle" size={22} color={c.primary} />}
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Txt variant="label" color={c.muted}>{title.toUpperCase()}</Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 24 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 56 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 999, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, minHeight: 44 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  footer: { borderTopWidth: 1, padding: 12, alignItems: 'center' },
});
