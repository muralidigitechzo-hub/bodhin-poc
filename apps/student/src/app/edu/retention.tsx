/**
 * Retention radar: students who are drifting away (low attendance or no activity), most urgent first.
 * Rules live in core/retention.ts, nudges in core/nudge.ts. Owners see the whole workspace, tutors only the courses assigned to them.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { retention, type RiskFilter } from '@/api/client';
import { agoLabel, returnedAfter } from '@/core/nudge';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { NudgeSheet, type NudgeTarget } from '@/ui/NudgeSheet';
import { Avatar, Chip, ErrorState, IconButton, Pill, Skeleton, useAsync } from '@/ui/kit';

type Data = Awaited<ReturnType<typeof retention.radar>>;
type Row = Data['items'][number];
const CHANNEL: Record<string, string> = { app: 'in-app', email: 'email', whatsapp: 'WhatsApp' };

export default function Retention() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [level, setLevel] = useState<RiskFilter['level']>();
  const [courseId, setCourseId] = useState<string | undefined>();
  const [targets, setTargets] = useState<NudgeTarget[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 3200);
  };
  const { data, error, reload } = useAsync(() => retention.radar(userId, { level, courseId }), [userId, level, courseId]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const { rules } = retention;
  const chosen = (data?.items ?? []).filter((r) => selected.includes(r.person.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/educator/home'))} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="heading" numberOfLines={1}>Retention radar</Txt>
            <Txt variant="caption" color={c.muted} numberOfLines={1}>Students who may be drifting away</Txt>
          </View>
        </View>
        <ScrollView contentContainerStyle={[styles.scroll, chosen.length > 0 && { paddingBottom: 110 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            {error ? (
              <ErrorState text={error} onRetry={reload} />
            ) : !data ? (
              <View style={{ gap: 10 }}>
                <Skeleton h={84} />
                <Skeleton h={120} />
                <Skeleton h={120} />
              </View>
            ) : (
              <>
                <View style={styles.tiles}>
                  <Tile label="At risk" value={data.atRisk} sub={`of ${data.judged} active`} icon="alert-circle" color={data.atRisk ? c.danger : c.success} bg={data.atRisk ? c.dangerBg : c.successBg} />
                  <Tile label="Low attendance" value={data.lowAttendance} sub={`under ${rules.minAttendancePct}%`} icon="calendar" color={c.warning} bg={c.warningBg} />
                  <Tile label="Inactive" value={data.inactive} sub={`${rules.inactiveDays}+ days`} icon="time" color={c.info} bg={c.primarySoft} />
                </View>
                <Txt variant="caption" color={c.muted}>
                  A student is flagged when they attended under {rules.minAttendancePct}% of live classes (after {rules.minClasses} classes) or had no activity for {rules.inactiveDays} days. Students who finished or paused a course are not flagged.
                </Txt>
                {data.nudges.sent > 0 && (
                  <View style={[styles.stat, { backgroundColor: c.successBg }]}>
                    <Ionicons name="trending-up" size={18} color={c.success} />
                    <Txt variant="label" style={{ flex: 1, fontWeight: '500' }}>
                      Last 30 days: {data.nudges.sent} nudge{data.nudges.sent === 1 ? '' : 's'} sent · {data.nudges.returned} student{data.nudges.returned === 1 ? '' : 's'} came back
                    </Txt>
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <Chip label={`All (${data.atRisk})`} active={!level} onPress={() => setLevel(undefined)} />
                  <Chip label={`High risk (${data.high})`} active={level === 'high'} onPress={() => setLevel('high')} />
                  <Chip label="Medium" active={level === 'medium'} onPress={() => setLevel('medium')} />
                </View>
                {data.courses.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    <Chip label="All courses" active={!courseId} onPress={() => setCourseId(undefined)} />
                    {data.courses.map((x) => (
                      <Chip key={x.course.id} label={`${x.course.title.length > 24 ? `${x.course.title.slice(0, 23)}…` : x.course.title}${x.atRisk ? ` · ${x.atRisk}` : ''}`} active={courseId === x.course.id} onPress={() => setCourseId(x.course.id)} />
                    ))}
                  </ScrollView>
                )}

                {data.items.length === 0 ? (
                  <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <Ionicons name={data.judged === 0 ? 'people-outline' : 'checkmark-done-circle-outline'} size={38} color={data.judged === 0 ? c.muted : c.success} />
                    <Txt variant="bodyStrong" center>{data.judged === 0 ? 'No active students yet' : level || courseId ? 'No one matches this filter' : 'Everyone is on track'}</Txt>
                    <Txt color={c.muted} center>{data.judged === 0 ? 'Students appear here once they join a batch or enrol in your course.' : 'Nobody is below the attendance limit or away for too long. Great work!'}</Txt>
                  </View>
                ) : (
                  data.items.map((r) => <StudentRow key={r.person.id} r={r} picked={selected.includes(r.person.id)} onPick={() => toggle(r.person.id)} onNudge={() => setTargets([r])} />)
                )}
              </>
            )}
          </View>
        </ScrollView>

        {chosen.length > 0 && (
          <View style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
            <View style={styles.barInner}>
              <Pressable onPress={() => setSelected([])} accessibilityRole="button" accessibilityLabel="Clear selection" style={styles.clear}>
                <Txt variant="label" color={c.primary}>Clear</Txt>
              </Pressable>
              <Button title={`Nudge ${chosen.length} student${chosen.length === 1 ? '' : 's'}`} iconRight="send" style={{ flex: 1 }} onPress={() => setTargets(chosen)} />
            </View>
          </View>
        )}
        {toast && (
          <View style={[styles.toast, { backgroundColor: c.ink, bottom: chosen.length ? 100 : 40 }]} pointerEvents="none">
            <Txt variant="label" color="#fff" center>{toast}</Txt>
          </View>
        )}
      </SafeAreaView>
      <NudgeSheet
        targets={targets}
        onClose={() => setTargets([])}
        onDone={(m) => {
          setTargets([]);
          setSelected([]);
          flash(m);
          reload();
        }}
      />
    </View>
  );
}

function Tile({ label, value, sub, icon, color, bg }: { label: string; value: number; sub: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLabel={`${label}: ${value}, ${sub}`}>
      <View style={[styles.tileIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Txt variant="title" style={{ fontSize: 26, lineHeight: 30 }}>{value}</Txt>
      <Txt variant="label" numberOfLines={1}>{label}</Txt>
      <Txt variant="caption" color={c.muted} numberOfLines={1}>{sub}</Txt>
    </View>
  );
}

function StudentRow({ r, picked, onPick, onNudge }: { r: Row; picked: boolean; onPick: () => void; onNudge: () => void }) {
  const { c } = useTheme();
  const high = r.risk.level === 'high';
  const n = r.lastNudge;
  const came = n ? returnedAfter(n.at, r.lastActiveAt) : false;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: picked ? c.primary : high ? c.danger : c.border }]}>
      <View style={styles.head}>
        <Pressable onPress={onPick} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: picked }} accessibilityLabel={`Select ${r.person.name}`}>
          <Ionicons name={picked ? 'checkbox' : 'square-outline'} size={24} color={picked ? c.primary : c.muted} />
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: '/edu/student/[id]', params: { id: r.person.id } })} style={styles.who} accessibilityRole="button" accessibilityLabel={`Open ${r.person.name}'s profile`}>
          <Avatar name={r.person.name} size={44} color={high ? c.danger : c.warning} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Txt variant="bodyStrong" numberOfLines={1}>{r.person.name}</Txt>
            <Txt variant="caption" color={c.muted} numberOfLines={1}>{r.batch ? `${r.batch.name} · ` : ''}{r.course.title}</Txt>
          </View>
          <Pill text={high ? 'High risk' : 'At risk'} tone={high ? 'live' : 'warning'} />
        </Pressable>
      </View>
      <View style={{ gap: 6 }}>
        {r.risk.reasons.map((x) => (
          <View key={x.kind} style={styles.reason}>
            <Ionicons name={x.kind === 'attendance' ? 'calendar-outline' : 'time-outline'} size={16} color={c.warning} />
            <Txt variant="label" style={{ flex: 1, fontWeight: '500' }}>{x.text}</Txt>
          </View>
        ))}
        {n && (
          <View style={styles.reason}>
            <Ionicons name={came ? 'checkmark-circle' : 'paper-plane-outline'} size={16} color={came ? c.success : c.muted} />
            <Txt variant="caption" color={came ? c.success : c.muted} style={{ flex: 1 }}>
              {came ? `Came back after your ${CHANNEL[n.channel]} nudge` : `Nudged ${agoLabel(n.at)} · ${CHANNEL[n.channel]}`}
            </Txt>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Nudge" iconLeft="paper-plane-outline" size="md" style={{ flex: 1 }} onPress={onNudge} />
        <Button title="View profile" variant="outline" size="md" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/edu/student/[id]', params: { id: r.person.id } })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 60 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: radius.lg, padding: 12, gap: 2 },
  tileIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md },
  card: { borderWidth: 1.2, borderRadius: radius.lg, padding: 14, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48 },
  check: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, minWidth: 0 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { alignItems: 'center', gap: 8, padding: 28, borderWidth: 1, borderRadius: radius.lg },
  bar: { borderTopWidth: 1, padding: 12, alignItems: 'center' },
  barInner: { width: '100%', maxWidth: layout.contentMaxWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  clear: { minHeight: 48, paddingHorizontal: 8, justifyContent: 'center' },
  toast: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, maxWidth: 420 },
});
