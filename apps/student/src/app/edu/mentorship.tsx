/** Tutor › Mentorship & Office Hours: publish weekly 15/30-minute slots, see bookings, join calls, sync Google Calendar. */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { mentorship, type BookingView } from '@/api/mentorship';
import { RULES, SLOT_MINS, TOPICS, toMin, validateWindows, type Window } from '@/core/mentorship';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, ScreenTop } from '@/ui/section';
import { CalendarCard, SessionRow } from '@/ui/MentorSessions';
import { dayLabel, clock } from '@/ui/calendarActions';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PRESETS: { label: string; windows: Window[] }[] = [
  { label: 'Weekday evenings', windows: [1, 2, 3, 4, 5].map((day) => ({ day, start: '18:00', end: '20:00' })) },
  { label: 'Weekend mornings', windows: [6, 0].map((day) => ({ day, start: '10:00', end: '12:00' })) },
];
const sortWin = (w: Window[]) => [...w].sort((a, b) => a.day - b.day || toMin(a.start) - toMin(b.start));
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

export default function MentorshipManage() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [rev, setRev] = useState(0);
  const bump = useCallback(() => setRev((r) => r + 1), []);
  useFocusEffect(useCallback(() => { bump(); }, [bump]));
  useEffect(() => { const t = setInterval(bump, 30000); return () => clearInterval(t); }, [bump]); // join buttons appear on time
  const ov = React.useMemo(() => mentorship.overview(userId), [userId, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  // editor state, seeded from the saved schedule
  const [slotMins, setSlotMins] = useState<number>(ov.config?.slotMins ?? 30);
  const [windows, setWindows] = useState<Window[]>(ov.config?.windows ?? []);
  const [topics, setTopics] = useState<string[]>(ov.config?.topics ?? TOPICS.map((t) => t.id));
  const [day, setDay] = useState(1);
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('19:00');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [completing, setCompleting] = useState<BookingView | null>(null);
  const [feedback, setFeedback] = useState('');
  const [stopConfirm, setStopConfirm] = useState(false);

  // On a fresh page load the session restores a moment after the first render, so the saved schedule can arrive late.
  // Re-seed the form whenever the saved schedule (or the signed-in person) changes.
  const cfgKey = `${userId}|${ov.config?.publishedAt ?? ''}`;
  useEffect(() => {
    setSlotMins(ov.config?.slotMins ?? 30);
    setWindows(ov.config?.windows ?? []);
    setTopics(ov.config?.topics ?? TOPICS.map((t) => t.id));
  }, [cfgKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const addWindow = () => {
    const next = sortWin([...windows, { day, start, end }]);
    const p = validateWindows(next, slotMins);
    if (p) return setFormErr(p);
    setWindows(next);
    setFormErr(null);
  };
  const publish = () => {
    try {
      const r = mentorship.publish(userId, { slotMins, windows, topics });
      setResult({ ok: true, text: `Published. ${r.created} slot${r.created === 1 ? '' : 's'} are open for the next ${RULES.daysAhead} days${r.kept ? ` (${r.kept} booked session${r.kept === 1 ? '' : 's'} kept)` : ''}.` });
      setFormErr(null);
      bump();
    } catch (e) {
      setResult({ ok: false, text: msg(e) });
    }
  };
  const stop = () => {
    const r = mentorship.unpublish(userId);
    setResult({ ok: true, text: `Mentoring paused. Open slots were removed${r.upcoming ? `; your ${r.upcoming} booked session${r.upcoming === 1 ? '' : 's'} still stand` : ''}.` });
    setStopConfirm(false);
    bump();
  };
  const finish = () => {
    if (!completing) return;
    try { mentorship.complete(userId, completing.id, feedback); setCompleting(null); setFeedback(''); bump(); } catch (e) { setResult({ ok: false, text: msg(e) }); setCompleting(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Mentorship & Office Hours" sub="1-on-1 sessions for resume reviews, debugging and project feedback" fallback="/educator/home" />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            {result && <Banner tone={result.ok ? 'success' : 'danger'} text={result.text} />}

            <Card title="Weekly availability" right={ov.published ? <Pill text="Published" tone="success" icon="checkmark" /> : <Pill text="Not published" tone="neutral" />}>
              <Txt variant="label" color={c.muted}>SLOT LENGTH</Txt>
              <View style={styles.wrap}>
                {SLOT_MINS.map((m) => <Chip key={m} label={`${m} minutes`} active={slotMins === m} onPress={() => { setSlotMins(m); setFormErr(null); }} />)}
              </View>

              <Txt variant="label" color={c.muted} style={{ marginTop: 6 }}>STUDENTS CAN BOOK YOU FOR</Txt>
              <View style={styles.wrap}>
                {TOPICS.map((t) => (
                  <Chip key={t.id} label={t.label} icon={t.icon as any} active={topics.includes(t.id)} onPress={() => setTopics((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))} />
                ))}
              </View>

              <Txt variant="label" color={c.muted} style={{ marginTop: 6 }}>WEEKLY WINDOWS</Txt>
              {windows.length === 0 ? (
                <Txt color={c.muted}>No windows yet. Add one below or start from a preset.</Txt>
              ) : (
                <View style={{ gap: 6 }}>
                  {windows.map((w, i) => (
                    <View key={`${w.day}-${w.start}`} style={[styles.win, { borderColor: c.border, backgroundColor: c.surfaceMuted }]}>
                      <Ionicons name="time-outline" size={18} color={c.primary} />
                      <Txt variant="bodyStrong" style={{ flex: 1 }}>{DAYS[w.day]} · {w.start}–{w.end}</Txt>
                      <Txt variant="caption" color={c.muted}>{Math.floor((toMin(w.end) - toMin(w.start)) / slotMins)} slots</Txt>
                      <Pressable onPress={() => setWindows((x) => x.filter((_, j) => j !== i))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${DAYS[w.day]} ${w.start} to ${w.end}`}>
                        <Ionicons name="close-circle" size={22} color={c.muted} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.wrap}>
                {PRESETS.map((p) => <Chip key={p.label} label={p.label} icon="flash-outline" onPress={() => { setWindows(sortWin(p.windows)); setFormErr(validateWindows(p.windows, slotMins)); }} />)}
              </View>

              <View style={[styles.add, { borderColor: c.border }]}>
                <Txt variant="label" color={c.muted}>ADD A WINDOW</Txt>
                <View style={styles.wrap}>
                  {DAYS.map((d, i) => <Chip key={d} label={d} active={day === i} onPress={() => setDay(i)} />)}
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}><TextField label="From" value={start} onChangeText={(v) => { setStart(v); setFormErr(null); }} placeholder="18:00" maxLength={5} autoCapitalize="none" /></View>
                  <View style={{ flex: 1 }}><TextField label="To" value={end} onChangeText={(v) => { setEnd(v); setFormErr(null); }} placeholder="19:00" maxLength={5} autoCapitalize="none" /></View>
                </View>
                {formErr && <Txt variant="caption" color={c.danger} accessibilityLiveRegion="polite">{formErr}</Txt>}
                <Button title="Add window" iconLeft="add" size="md" variant="outline" onPress={addWindow} />
              </View>

              <Button title={ov.published ? 'Update availability' : 'Publish availability'} iconLeft="calendar" disabled={!windows.length} onPress={publish} />
              {ov.published && !stopConfirm && <Button title="Pause mentoring" variant="ghost" size="md" onPress={() => setStopConfirm(true)} />}
              {stopConfirm && (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <Button title="Yes, remove open slots" size="md" style={{ backgroundColor: c.danger }} onPress={stop} />
                  <Button title="Keep them" size="md" variant="outline" onPress={() => setStopConfirm(false)} />
                </View>
              )}
              <Txt variant="caption" color={c.muted}>Slots are created for the next {RULES.daysAhead} days and refresh whenever you update. Students can book up to {RULES.minLeadMin} minutes before a slot and cancel up to {RULES.studentCancelBeforeMin / 60} hours before.</Txt>
            </Card>

            <Card title={`Upcoming sessions · ${ov.upcoming.length}`}>
              {ov.upcoming.length === 0 ? (
                <Txt color={c.muted}>{ov.published ? 'No bookings yet. Students enrolled in your academy can see your open slots on the Mentors page.' : 'Publish your availability to start getting bookings.'}</Txt>
              ) : (
                <View style={{ gap: 10 }}>
                  {ov.upcoming.map((b) => <SessionRow key={b.id} b={b} viewer="tutor" userId={userId} onChanged={bump} onComplete={(x) => { setCompleting(x); setFeedback(''); }} />)}
                </View>
              )}
            </Card>

            <CalendarCard userId={userId} status={ov.calendar} onChanged={bump} />

            <Card title={`Open slots · ${ov.openSlots}`}>
              {ov.nextOpen.length === 0 ? (
                <Txt color={c.muted}>Nothing open right now.</Txt>
              ) : (
                <View style={{ gap: 6 }}>
                  {ov.nextOpen.map((s) => (
                    <View key={s.id} style={[styles.win, { borderColor: c.border }]}>
                      <Ionicons name="ellipse" size={8} color={c.success} />
                      <Txt style={{ flex: 1 }}>{dayLabel(s.startsAt)} · {clock(s.startsAt)}–{clock(s.endsAt)}</Txt>
                      <Pressable onPress={() => { try { mentorship.removeSlot(userId, s.id); bump(); } catch (e) { setResult({ ok: false, text: msg(e) }); } }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove slot ${dayLabel(s.startsAt)} ${clock(s.startsAt)}`}>
                        <Ionicons name="trash-outline" size={20} color={c.muted} />
                      </Pressable>
                    </View>
                  ))}
                  {ov.openSlots > ov.nextOpen.length && <Txt variant="caption" color={c.muted}>and {ov.openSlots - ov.nextOpen.length} more…</Txt>}
                </View>
              )}
            </Card>

            {ov.past.length > 0 && (
              <Card title="Recent sessions">
                <View style={{ gap: 10 }}>{ov.past.map((b) => <SessionRow key={b.id} b={b} viewer="tutor" userId={userId} onChanged={bump} onComplete={(x) => { setCompleting(x); setFeedback(''); }} />)}</View>
              </Card>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet open={!!completing} onClose={() => setCompleting(null)} title="Mark session complete" footer={<Button title="Save and complete" size="md" style={{ flex: 1 }} onPress={finish} />}>
        <Txt color={c.inkSoft}>Leave a short note for {completing?.studentName}. They will see it under their sessions. (Optional)</Txt>
        <TextField label="Feedback" value={feedback} onChangeText={setFeedback} placeholder="What went well, and one thing to try next" multiline maxLength={RULES.tutorNoteMax} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 40 },
  inner: { width: '100%', maxWidth: 760, gap: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  win: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 46, borderRadius: radius.md, borderWidth: 1 },
  add: { gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed' },
});
