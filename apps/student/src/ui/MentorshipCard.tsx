/** Tutor dashboard card: "Mentorship & Office Hours". Shows state at a glance and opens the manage screen. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { mentorship } from '@/api/mentorship';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from './Txt';
import { Button } from './Button';
import { Pill } from './kit';
import { whenLabel } from './calendarActions';

export function MentorshipCard() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [rev, setRev] = useState(0);
  const bump = useCallback(() => setRev((r) => r + 1), []);
  useFocusEffect(useCallback(() => { bump(); }, [bump]));
  useEffect(() => { const t = setInterval(bump, 30000); return () => clearInterval(t); }, [bump]);
  const ov = useMemo(() => mentorship.overview(userId), [userId, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = ov.upcoming[0];
  const go = () => router.push('/edu/mentorship');

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: ov.published ? c.border : c.primary }]} accessibilityLabel="Mentorship and office hours">
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: c.primarySoft }]}><Ionicons name="videocam" size={22} color={c.primary} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="heading">Mentorship & Office Hours</Txt>
          <Txt variant="caption" color={c.muted}>1-on-1 slots for resume reviews, debugging and project feedback</Txt>
        </View>
        <Pill text={ov.published ? 'Published' : 'Not published'} tone={ov.published ? 'success' : 'neutral'} />
      </View>

      <View style={styles.stats}>
        <Stat v={ov.openSlots} l="Open slots" />
        <Stat v={ov.upcoming.length} l="Upcoming" />
        <Stat v={ov.stats.completed} l="Completed" />
      </View>

      {next ? (
        <Pressable onPress={go} accessibilityRole="button" accessibilityLabel={`Next session: ${next.studentName}, ${whenLabel(next.startsAt)}`} style={[styles.next, { backgroundColor: next.call === 'open' ? c.dangerBg : c.surfaceMuted }]}>
          <Ionicons name={next.call === 'open' ? 'radio' : 'time-outline'} size={18} color={next.call === 'open' ? c.live : c.primary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="label" numberOfLines={1}>Next: {next.topicLabel} · {next.studentName}</Txt>
            <Txt variant="caption" color={c.muted}>{next.call === 'open' ? 'Room is open now' : whenLabel(next.startsAt)}</Txt>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.muted} />
        </Pressable>
      ) : (
        <Txt variant="caption" color={c.inkSoft}>{ov.published ? 'No bookings yet. Learners enrolled in your academy can see your open slots.' : 'Publish weekly 15 or 30-minute slots and learners can book you.'}</Txt>
      )}

      <Button title={ov.published ? 'Manage availability & bookings' : 'Publish availability'} iconRight="arrow-forward" size="md" variant={ov.published ? 'outline' : 'primary'} onPress={go} />
    </View>
  );
}

function Stat({ v, l }: { v: number; l: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: c.surfaceMuted }]}>
      <Txt variant="title" style={{ fontSize: 22, lineHeight: 26 }}>{v}</Txt>
      <Txt variant="caption" color={c.muted}>{l}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: radius.lg, borderWidth: 1.2, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 10, borderRadius: radius.md, gap: 2 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md },
});
