/** Shared pieces of the mentorship screens: one session row (tutor and learner views) and the Google Calendar connection card. */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ApiError } from '@/api/client';
import { mentorCalendar, mentorship, type BookingView } from '@/api/mentorship';
import { TOPICS } from '@/core/mentorship';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from './Txt';
import { Button } from './Button';
import { Pill } from './kit';
import { openUrl, saveIcs, whenLabel, clock } from './calendarActions';

const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

export function SessionRow({ b, viewer, userId, onChanged, onComplete }: { b: BookingView; viewer: 'student' | 'tutor'; userId: string; onChanged: () => void; onComplete?: (b: BookingView) => void }) {
  const { c } = useTheme();
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const icon = TOPICS.find((t) => t.id === b.topic)?.icon ?? 'chatbubble-ellipses-outline';
  const live = b.status === 'booked' && b.call === 'open';
  const status =
    b.status === 'completed' ? <Pill text="Completed" tone="success" icon="checkmark" />
    : b.status === 'cancelled' ? <Pill text={b.cancelledBy === viewer ? 'You cancelled' : `Cancelled by ${b.cancelledBy === 'tutor' ? 'mentor' : 'learner'}`} tone="neutral" />
    : live ? <Pill text={b.minutesUntil > 0 ? `Starts in ${b.minutesUntil} min` : 'In progress'} tone="live" icon="radio" />
    : <Pill text="Booked" tone="info" />;

  const cancel = () => {
    try { mentorship.cancel(userId, b.id); setErr(null); setConfirm(false); onChanged(); } catch (e) { setErr(msg(e)); setConfirm(false); onChanged(); }
  };
  const addToGoogle = () => { try { openUrl(mentorCalendar.eventFor(b.id, userId).googleUrl); } catch (e) { setErr(msg(e)); } };
  const ics = async () => { try { await saveIcs(`mentoring-${b.id}.ics`, mentorCalendar.eventFor(b.id, userId).ics); } catch (e) { setErr(msg(e)); } };

  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: live ? c.live : c.border }]} accessibilityLabel={`${b.topicLabel} with ${b.withName}, ${whenLabel(b.startsAt)}, ${b.status}`}>
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: c.primarySoft }]}><Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={c.primary} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>{b.topicLabel} · {b.withName}</Txt>
          <Txt variant="caption" color={c.muted}>{whenLabel(b.startsAt)} – {clock(b.endsAt)}</Txt>
        </View>
        {status}
      </View>

      {!!b.note && <Txt variant="caption" color={c.inkSoft}>“{b.note}”</Txt>}
      {!!b.tutorNote && (
        <View style={[styles.note, { backgroundColor: c.successBg }]}>
          <Txt variant="caption" color={c.success} style={{ fontWeight: '700' }}>Mentor’s feedback</Txt>
          <Txt variant="caption" color={c.inkSoft}>{b.tutorNote}</Txt>
        </View>
      )}
      {b.status === 'booked' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {b.synced ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="checkmark-circle" size={16} color={c.success} />
              <Txt variant="caption" color={c.success}>In your Google Calendar</Txt>
            </View>
          ) : (
            <>
              <Pressable onPress={addToGoogle} accessibilityRole="button" accessibilityLabel="Add to Google Calendar" style={styles.link}>
                <Ionicons name="calendar-outline" size={15} color={c.primary} />
                <Txt variant="caption" color={c.primary} style={{ fontWeight: '700' }}>Add to Google Calendar</Txt>
              </Pressable>
              <Pressable onPress={ics} accessibilityRole="button" accessibilityLabel="Download calendar file" style={styles.link}>
                <Ionicons name="download-outline" size={15} color={c.primary} />
                <Txt variant="caption" color={c.primary} style={{ fontWeight: '700' }}>.ics</Txt>
              </Pressable>
            </>
          )}
        </View>
      )}
      {err && <Txt variant="caption" color={c.danger} accessibilityLiveRegion="polite">{err}</Txt>}

      {b.status === 'booked' && (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {live ? (
            <Button title="Join video call" iconLeft="videocam" size="md" onPress={() => router.push({ pathname: '/mentor-call/[id]', params: { id: b.id } })} />
          ) : b.call === 'ended' ? (
            <Txt variant="caption" color={c.muted}>This session has ended</Txt>
          ) : (
            <Txt variant="caption" color={c.muted}>Video room opens 10 min before the start</Txt>
          )}
          {b.canComplete && onComplete && <Button title="Mark complete" size="md" variant="outline" onPress={() => onComplete(b)} />}
          {b.canCancel && !confirm && <Button title="Cancel" size="md" variant="ghost" onPress={() => setConfirm(true)} />}
          {confirm && (
            <>
              <Button title="Yes, cancel session" size="md" style={{ backgroundColor: c.danger }} onPress={cancel} />
              <Button title="Keep it" size="md" variant="outline" onPress={() => setConfirm(false)} />
            </>
          )}
          {!b.canCancel && viewer === 'student' && !live && b.call !== 'ended' && <Txt variant="caption" color={c.muted}>Cancellation closes 2 hours before the start</Txt>}
        </View>
      )}
    </View>
  );
}

export function CalendarCard({ userId, status, onChanged }: { userId: string; status: { connected: boolean; account: string | null }; onChanged: () => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: status.connected ? c.success : c.border }]}>
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: '#E8F0FE' }]}><Ionicons name="calendar" size={20} color="#1A73E8" /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt variant="bodyStrong">Google Calendar</Txt>
          <Txt variant="caption" color={c.muted}>
            {status.connected ? `Connected as ${status.account}. Sessions are added and removed automatically.` : 'Connect once and every booking appears in your calendar, and disappears if it is cancelled.'}
          </Txt>
        </View>
        {status.connected ? <Pill text="Connected" tone="success" icon="checkmark" /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {status.connected ? (
          <Button title="Disconnect" size="md" variant="outline" onPress={() => { mentorCalendar.disconnect(userId); onChanged(); }} />
        ) : (
          <Button title="Connect Google Calendar" size="md" iconLeft="link" onPress={() => { mentorCalendar.connect(userId); onChanged(); }} />
        )}
        <Txt variant="caption" color={c.muted} style={{ flex: 1, minWidth: 160 }}>Preview mode: sign-in is simulated and nothing is sent to Google. “Add to Google Calendar” links work today.</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { padding: 12, borderRadius: radius.lg, borderWidth: 1.2, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  note: { padding: 10, borderRadius: radius.md, gap: 2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
});
