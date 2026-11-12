/** Create a batch: course & details → schedule → enrollment rules → students (optional). Sessions are generated from the weekly slots. */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, batchForm, batchesApi, educator } from '@/api/client';
import { DAY_SHORT, generateSessions, weeksBetween, type Slot } from '@/core/batch';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Avatar, Chip, IconButton } from '@/ui/kit';
import { Banner, Checkbox } from '@/ui/misc';
import { DateField, Stepper, TimeField } from '@/ui/pickers';

const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};

export default function NewBatch() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const ctx = educator.context(userId);
  const courses = educator.courses(userId).filter((x) => x.status !== 'draft' && x.status !== 'archived');
  const team = batchForm.team(userId);

  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const course = courses.find((x) => x.id === courseId);
  const month = new Date(plusDays(7)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<'cohort' | 'live_only'>('cohort');
  const [instructors, setInstructors] = useState<string[]>([userId]);
  const [capacity, setCapacity] = useState(30);
  const [start, setStart] = useState(plusDays(7));
  const [end, setEnd] = useState(plusDays(7 + 70));
  const [days, setDays] = useState<number[]>([6, 0]);
  const [time, setTime] = useState({ start: '16:00', end: '18:00' });
  const [mode, setMode] = useState<Slot['mode']>('online');
  const [selfEnroll, setSelfEnroll] = useState(true);
  const [approval, setApproval] = useState(false);
  const [closes, setCloses] = useState(plusDays(6));
  const [add, setAdd] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const suggestedName = course ? `${course.title.split(/[(:–-]/)[0].trim()} – ${days.includes(6) || days.includes(0) ? 'Weekend' : 'Weekday'} Batch (${month})` : '';
  const suggestedCode = course ? `${course.title.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w.slice(0, 3)).join('').toUpperCase()}-${new Date(start).toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}-${String(batchForm.countForCourse(courseId) + 1).padStart(2, '0')}` : '';
  const slots: Slot[] = days.map((d) => ({ day: d, start: time.start, end: time.end, mode }));
  const preview = useMemo(() => (course ? generateSessions({ id: 'x', tenantId: '', courseId, name: '', code: '', type, instructorIds: [], capacity, startDate: start, endDate: end, slots, enrollment: { selfEnroll, approval, closesAt: closes }, createdAt: '' }, [], 'x') : []), [course, courseId, start, end, days, time, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const candidates = batchForm.candidates(userId, courseId);
  const shown = candidates.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const id = await batchesApi.create(
        userId,
        { courseId, name: name.trim() || suggestedName, code: code.trim() || suggestedCode, type, instructorIds: instructors, capacity, startDate: start, endDate: end, slots, enrollment: { selfEnroll, approval, closesAt: closes } },
        [...add],
      );
      router.replace({ pathname: '/edu/batch/[id]', params: { id } });
    } catch (e) {
      const a = e as ApiError;
      setErr({ field: a.field, msg: a.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="close" label="Cancel" tone="filled" onPress={() => router.back()} />
          <Txt variant="heading" style={{ flex: 1 }}>New batch</Txt>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            {err && <Banner text={err.msg} />}

            <Section n={1} title="Course & details">
              <Txt variant="label">Course *</Txt>
              <View style={styles.wrap}>
                {courses.map((x) => <Chip key={x.id} label={x.title} active={courseId === x.id} onPress={() => setCourseId(x.id)} />)}
              </View>
              <TextField label="Batch name" placeholder={suggestedName} value={name} onChangeText={setName} error={err?.field === 'name' ? err.msg : null} hint="Leave empty to use the suggestion" />
              <TextField label="Batch code" placeholder={suggestedCode} autoCapitalize="characters" value={code} onChangeText={(v) => setCode(v.replace(/[^A-Za-z0-9-]/g, '').slice(0, 16))} error={err?.field === 'code' ? err.msg : null} hint={`Used in the join link: ${ctx?.host}/join/${code || suggestedCode}`} />
              <Txt variant="label">Batch type</Txt>
              <View style={styles.wrap}>
                <Chip label="Cohort (lessons + live)" icon="people" active={type === 'cohort'} onPress={() => setType('cohort')} />
                <Chip label="Live classes only" icon="radio" active={type === 'live_only'} onPress={() => setType('live_only')} />
              </View>
              <Txt variant="label">Instructors</Txt>
              <View style={styles.wrap}>
                {team.map((m) => {
                  const on = instructors.includes(m.id);
                  return (
                    <Pressable key={m.id} onPress={() => setInstructors((x) => (on ? (x.length > 1 ? x.filter((i) => i !== m.id) : x) : [...x, m.id]))} style={[styles.person, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : c.surface }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                      <Avatar name={m.name} size={28} color={c.primaryDeep} />
                      <Txt variant="label">{m.name}{m.role === 'owner' ? ' (you)' : ''}</Txt>
                      {on && <Ionicons name="checkmark" size={16} color={c.primary} />}
                    </Pressable>
                  );
                })}
              </View>
              <Stepper label="Capacity" value={capacity} onChange={setCapacity} min={5} max={500} step={5} />
            </Section>

            <Section n={2} title="Schedule">
              <View style={styles.row}>
                <DateField label="Start date *" value={start} onChange={(v) => { setStart(v); if (new Date(end) <= new Date(v)) setEnd(new Date(new Date(v).getTime() + 70 * 864e5).toISOString()); }} min={new Date().toISOString()} />
                <DateField label="End date *" value={end} onChange={setEnd} min={start} error={err?.field === 'dates' ? err.msg : null} />
              </View>
              <Txt variant="caption" color={c.muted}>{weeksBetween(start, end)} weeks</Txt>
              <Txt variant="label">Class days</Txt>
              <View style={styles.days}>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const on = days.includes(d);
                  return (
                    <Pressable key={d} onPress={() => setDays((x) => (on ? x.filter((i) => i !== d) : [...x, d]))} style={[styles.dayBtn, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : c.surface }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={DAY_SHORT[d]}>
                      <Txt variant="label" color={on ? '#fff' : c.ink}>{DAY_SHORT[d]}</Txt>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.row}>
                <TimeField label="Starts" value={time.start} onChange={(v) => setTime((x) => ({ start: v, end: x.end <= v ? `${String(Math.min(23, Number(v.slice(0, 2)) + 1)).padStart(2, '0')}${v.slice(2)}` : x.end }))} />
                <TimeField label="Ends" value={time.end} onChange={(v) => setTime((x) => ({ ...x, end: v }))} />
              </View>
              <View style={styles.wrap}>
                <Chip label="Online (Bodhin Live)" icon="videocam" active={mode === 'online'} onPress={() => setMode('online')} />
                <Chip label="In person" icon="location" active={mode === 'offline'} onPress={() => setMode('offline')} />
              </View>
              {err?.field === 'slots' && <Txt variant="caption" color={c.danger}>{err.msg}</Txt>}
              <View style={[styles.previewBox, { backgroundColor: c.primarySoft }]}>
                <Ionicons name="calendar" size={20} color={c.primary} />
                <Txt variant="label" style={{ flex: 1 }}>
                  {preview.length} classes will be scheduled{preview[0] ? `, first on ${new Date(preview[0].startsAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}. You can move or cancel any class later.
                </Txt>
              </View>
              {mode === 'online' && ctx && <Txt variant="caption" color={c.muted}>Uses about {Math.round(preview.length * ((Number(time.end.slice(0, 2)) * 60 + Number(time.end.slice(3)) - Number(time.start.slice(0, 2)) * 60 - Number(time.start.slice(3))) / 60))} live room-hours over the batch ({ctx.usage.rows.find((r) => r.key === 'liveHours')?.limit ?? '∞'} per month on your plan).</Txt>}
            </Section>

            <Section n={3} title="Enrollment">
              <Pressable onPress={() => setSelfEnroll((v) => !v)} style={styles.toggle} accessibilityRole="switch" accessibilityState={{ checked: selfEnroll }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong">Students can join with the link</Txt>
                  <Txt variant="caption" color={c.muted}>Share the batch link on WhatsApp, email or your site.</Txt>
                </View>
                <Switch value={selfEnroll} onValueChange={setSelfEnroll} trackColor={{ true: c.primary, false: c.borderStrong }} thumbColor="#fff" />
              </Pressable>
              {selfEnroll && (
                <>
                  <Pressable onPress={() => setApproval((v) => !v)} style={styles.toggle} accessibilityRole="switch" accessibilityState={{ checked: approval }}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong">I approve each request</Txt>
                      <Txt variant="caption" color={c.muted}>Useful for scholarship or screened batches.</Txt>
                    </View>
                    <Switch value={approval} onValueChange={setApproval} trackColor={{ true: c.primary, false: c.borderStrong }} thumbColor="#fff" />
                  </Pressable>
                  <DateField label="Enrollment closes" value={closes} onChange={setCloses} min={new Date().toISOString()} />
                </>
              )}
            </Section>

            <Section n={4} title={`Students (optional) · ${add.size} selected`}>
              <Txt variant="caption" color={c.muted}>Pick existing students now, or add and invite later from the batch page.</Txt>
              <TextField label="Search students" value={q} onChangeText={setQ} placeholder="Type a name" />
              <View style={{ gap: 2 }}>
                {shown.map((p) => (
                  <Checkbox key={p.id} checked={add.has(p.id)} onChange={(v) => setAdd((s) => { const n = new Set(s); v ? n.add(p.id) : n.delete(p.id); return n; })} label={p.name}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Avatar name={p.name} size={32} color={c.inkSoft} />
                      <View style={{ flex: 1 }}>
                        <Txt variant="label">{p.name}</Txt>
                        <Txt variant="caption" color={c.muted}>{p.email}</Txt>
                      </View>
                    </View>
                  </Checkbox>
                ))}
                {!shown.length && <Txt variant="caption" color={c.muted}>No matching students.</Txt>}
              </View>
              {add.size > capacity && <Txt variant="caption" color={c.danger}>More students than capacity ({capacity}).</Txt>}
            </Section>
          </View>
        </ScrollView>
        <View style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <View style={styles.barInner}>
            <Button title={`Create batch · ${preview.length} classes`} iconLeft="add" loading={busy} style={{ flex: 1 }} onPress={create} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[styles.num, { backgroundColor: c.primaryDeep }]}><Txt variant="label" color="#fff">{n}</Txt></View>
        <Txt variant="heading">{title}</Txt>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 6 },
  scroll: { paddingHorizontal: 16, paddingBottom: 120, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  section: { padding: 16, borderRadius: radius.lg, borderWidth: 1, gap: 12 },
  num: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, minHeight: 44, borderRadius: radius.pill, borderWidth: 1.2 },
  days: { flexDirection: 'row', gap: 6 },
  dayBtn: { flex: 1, minHeight: 46, borderRadius: radius.md, borderWidth: 1.2, alignItems: 'center', justifyContent: 'center' },
  previewBox: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, alignItems: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, alignItems: 'center' },
  barInner: { width: '100%', maxWidth: layout.contentMaxWidth, flexDirection: 'row', gap: 10 },
});
