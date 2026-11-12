/** Learner › Mentors: book a 1-on-1 slot (resume review, code debugging, project feedback) and manage your sessions. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { mentorship, mentorCalendar, type BookingView } from '@/api/mentorship';
import { RULES, TOPICS } from '@/core/mentorship';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Avatar, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, ScreenTop } from '@/ui/section';
import { CalendarCard, SessionRow } from '@/ui/MentorSessions';
import { clock, dayLabel, openUrl, saveIcs, whenLabel } from '@/ui/calendarActions';

const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

export default function Mentors() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [rev, setRev] = useState(0);
  const bump = useCallback(() => setRev((r) => r + 1), []);
  useFocusEffect(useCallback(() => { bump(); }, [bump]));
  useEffect(() => { const t = setInterval(bump, 30000); return () => clearInterval(t); }, [bump]);

  const mentors = useMemo(() => mentorship.mentors(userId), [userId, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = useMemo(() => mentorship.mine(userId), [userId, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tutorId, setTutorId] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [bookedSnap, setBooked] = useState<BookingView | null>(null);
  // Re-read the booking each render so the banner reflects calendar changes made after booking.
  const booked = useMemo(() => {
    if (!bookedSnap) return null;
    return [...mine.upcoming, ...mine.past].find((x) => x.id === bookedSnap.id) ?? bookedSnap;
  }, [bookedSnap, mine]);

  const active = mentors.find((m) => m.tutorId === tutorId) ?? mentors.find((m) => m.openSlots > 0) ?? mentors[0];
  const data = useMemo(() => {
    if (!active) return null;
    try { return mentorship.slots(userId, active.tutorId); } catch { return null; }
  }, [active?.tutorId, userId, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => {
    const m = new Map<string, { key: string; iso: string; slots: NonNullable<typeof data>['slots'] }>();
    for (const s of data?.slots ?? []) {
      const k = dayKey(s.startsAt);
      if (!m.has(k)) m.set(k, { key: k, iso: s.startsAt, slots: [] });
      m.get(k)!.slots.push(s);
    }
    return [...m.values()];
  }, [data]);
  const curDay = days.find((d) => d.key === day) ?? days[0];
  const chosen = curDay?.slots.find((s) => s.id === slotId);

  const book = () => {
    if (!chosen || !topic) return;
    try {
      const b = mentorship.book(userId, chosen.id, { topic, note });
      setBooked(b);
      setErr(null);
      setSlotId(null);
      setNote('');
    } catch (e) {
      setErr(msg(e));
      setSlotId(null); // the slot may have just been taken: show a fresh list
    }
    bump();
  };

  const addGoogle = () => { if (booked) { try { openUrl(mentorCalendar.eventFor(booked.id, userId).googleUrl); } catch (e) { setErr(msg(e)); } } };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="1-on-1 Mentors" sub="Resume reviews, code debugging and project feedback" fallback="/home" />
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            {booked && (
              <View style={[styles.done, { backgroundColor: c.successBg, borderColor: c.success }]} accessibilityLiveRegion="polite">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={24} color={c.success} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong" color={c.success}>Session booked</Txt>
                    <Txt variant="caption" color={c.inkSoft}>{booked.topicLabel} with {booked.withName} · {whenLabel(booked.startsAt)}</Txt>
                  </View>
                </View>
                {booked.synced ? (
                  <Txt variant="caption" color={c.success}>Added to your Google Calendar. The video room opens 10 minutes before the start.</Txt>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <Button title="Add to Google Calendar" iconLeft="calendar-outline" size="md" variant="outline" onPress={addGoogle} />
                    <Button title=".ics file" iconLeft="download-outline" size="md" variant="ghost" onPress={() => saveIcs(`mentoring-${booked.id}.ics`, mentorCalendar.eventFor(booked.id, userId).ics)} />
                  </View>
                )}
              </View>
            )}

            <Card title={`My sessions · ${mine.upcoming.length} upcoming`}>
              {mine.upcoming.length === 0 ? (
                <Txt color={c.muted}>You have nothing booked. Pick a mentor below.</Txt>
              ) : (
                <View style={{ gap: 10 }}>{mine.upcoming.map((b) => <SessionRow key={b.id} b={b} viewer="student" userId={userId} onChanged={bump} />)}</View>
              )}
            </Card>

            <CalendarCard userId={userId} status={mine.calendar} onChanged={bump} />

            <Card title="Book a session">
              {mentors.length === 0 ? (
                <View style={{ alignItems: 'center', gap: 6, paddingVertical: 14 }}>
                  <Ionicons name="people-outline" size={30} color={c.muted} />
                  <Txt variant="bodyStrong">No mentors are taking bookings yet</Txt>
                  <Txt color={c.muted} center>Mentoring is open to learners enrolled in an academy once its educators publish their office hours.</Txt>
                </View>
              ) : (
                <>
                  <Txt variant="label" color={c.muted}>MENTOR</Txt>
                  <View style={{ gap: 8 }}>
                    {mentors.map((m) => {
                      const on = m.tutorId === active?.tutorId;
                      return (
                        <Pressable key={m.tutorId} onPress={() => { setTutorId(m.tutorId); setDay(null); setSlotId(null); setTopic(null); setErr(null); }} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${m.name}, ${m.openSlots} open slots`} style={[styles.mentor, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : c.surface }]}>
                          <Avatar name={m.name} size={40} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt variant="bodyStrong">{m.name}</Txt>
                            <Txt variant="caption" color={c.muted}>{m.slotMins}-minute sessions · {m.openSlots} open slot{m.openSlots === 1 ? '' : 's'}</Txt>
                          </View>
                          <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? c.primary : c.borderStrong} />
                        </Pressable>
                      );
                    })}
                  </View>

                  {days.length === 0 ? (
                    <Banner tone="info" text={`${active?.name} has no open slots right now. Check back soon.`} />
                  ) : (
                    <>
                      <Txt variant="label" color={c.muted} style={{ marginTop: 6 }}>DAY</Txt>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
                        {days.map((d) => <Chip key={d.key} label={`${dayLabel(d.iso)} · ${d.slots.length}`} active={d.key === curDay?.key} onPress={() => { setDay(d.key); setSlotId(null); }} />)}
                      </ScrollView>

                      <Txt variant="label" color={c.muted} style={{ marginTop: 6 }}>TIME</Txt>
                      <View style={styles.wrap}>
                        {curDay?.slots.map((s) => {
                          const on = s.id === slotId;
                          return (
                            <Pressable key={s.id} onPress={() => { setSlotId(s.id); setErr(null); }} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${clock(s.startsAt)} to ${clock(s.endsAt)}`} style={[styles.slot, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : c.surface }]}>
                              <Txt variant="label" color={on ? '#fff' : c.ink}>{clock(s.startsAt)}</Txt>
                            </Pressable>
                          );
                        })}
                      </View>

                      <Txt variant="label" color={c.muted} style={{ marginTop: 6 }}>WHAT DO YOU NEED HELP WITH?</Txt>
                      <View style={styles.wrap}>
                        {TOPICS.filter((t) => data?.topics.includes(t.id)).map((t) => <Chip key={t.id} label={t.label} icon={t.icon as any} active={topic === t.id} onPress={() => setTopic(t.id)} />)}
                      </View>
                      <TextField label="Note for your mentor (optional)" value={note} onChangeText={setNote} placeholder="e.g. Please look at my portfolio link and the loop in main.py" multiline maxLength={RULES.noteMax} hint={`${note.length} / ${RULES.noteMax}`} />
                      {err && <Banner text={err} />}
                      <Button title={chosen ? `Book ${clock(chosen.startsAt)} · ${chosen.startsAt ? dayLabel(chosen.startsAt) : ''}` : 'Pick a time to book'} iconLeft="videocam" disabled={!chosen || !topic} onPress={book} />
                      {chosen && !topic && <Txt variant="caption" color={c.muted}>Choose what you need help with.</Txt>}
                    </>
                  )}
                </>
              )}
            </Card>

            {mine.past.length > 0 && (
              <Card title="Past sessions">
                <View style={{ gap: 10 }}>{mine.past.map((b) => <SessionRow key={b.id} b={b} viewer="student" userId={userId} onChanged={bump} />)}</View>
              </Card>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 40 },
  inner: { width: '100%', maxWidth: 760, gap: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  done: { padding: 14, borderRadius: radius.lg, borderWidth: 1.2, gap: 10 },
  mentor: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md, borderWidth: 1.5 },
  slot: { minWidth: 82, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
