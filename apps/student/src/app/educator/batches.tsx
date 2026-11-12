/** Educator › Batches tab: two segments — Batches (cohorts) and Students (workspace-wide). */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { batchesApi, educator, people } from '@/api/client';
import { InviteSheet } from '@/ui/InviteSheet';
import { slotLabel } from '@/core/batch';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { AppHeader, Avatar, BottomSheet, Chip, Pill, ProgressBar, Skeleton, useAsync } from '@/ui/kit';
import { CourseArt } from '@/ui/course';

type Seg = 'batches' | 'students';
const STATUS_TONE = { active: 'success', upcoming: 'info', completed: 'neutral' } as const;
const P_TONE = { active: ['Active', 'success'], completed: ['Completed', 'info'], inactive: ['Inactive', 'live'], pending: ['Awaiting approval', 'warning'], on_hold: ['On hold', 'neutral'] } as const;

export default function BatchesTab() {
  const { isDesktop } = useLayout();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const params = useLocalSearchParams<{ seg?: string }>();
  const [seg, setSeg] = useState<Seg>(params.seg === 'students' ? 'students' : 'batches');
  const ctx = educator.context(userId);
  const owner = ctx?.role === 'owner';
  const [invite, setInvite] = useState(false);
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={[styles.head, wide && { maxWidth: 1080 }]}>
          <AppHeader profileHref="/educator/more" action={owner ? { title: seg === 'batches' ? 'New batch' : 'Invite students', icon: seg === 'batches' ? 'add' : 'person-add', onPress: () => (seg === 'batches' ? (ctx?.ent.has('batches') ? router.push('/edu/batch-new') : router.push({ pathname: '/educator-soon', params: { f: 'Upgrade to use batches', step: 'E6' } })) : setInvite(true)) } : undefined} />
          <TwoTone lead={seg === 'batches' ? 'Batches &' : 'Your'} accent={seg === 'batches' ? 'Cohorts' : 'Students'} variant="title" />
          <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
            {(['batches', 'students'] as const).map((s) => (
              <Pressable key={s} onPress={() => setSeg(s)} accessibilityRole="tab" accessibilityState={{ selected: seg === s }} style={[styles.segBtn, seg === s && { backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 }]}>
                <Txt variant="label" color={seg === s ? c.primary : c.inkSoft}>{s === 'batches' ? 'Batches' : 'Students'}</Txt>
              </Pressable>
            ))}
          </View>
        </View>
        {seg === 'batches' ? <BatchList userId={userId} wide={wide} /> : <StudentList userId={userId} wide={wide} />}

        {owner && !isDesktop && (
          <Pressable
            onPress={() => (seg === 'batches' ? (ctx?.ent.has('batches') ? router.push('/edu/batch-new') : router.push({ pathname: '/educator-soon', params: { f: 'Upgrade to use batches', step: 'E6' } })) : setInvite(true))}
            style={[styles.fab, { backgroundColor: c.primary }]}
            accessibilityRole="button"
          >
            <Ionicons name={seg === 'batches' ? 'add' : 'person-add'} size={24} color="#fff" />
            <Txt variant="bodyStrong" color="#fff">{seg === 'batches' ? 'New batch' : 'Invite students'}</Txt>
          </Pressable>
        )}
      </SafeAreaView>
      <InviteSheet open={invite} onClose={() => setInvite(false)} userId={userId} />
    </View>
  );
}

function BatchList({ userId, wide }: { userId: string; wide: boolean }) {
  const { c } = useTheme();
  const { data, reload } = useAsync(() => batchesApi.list(userId), [userId]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming' | 'completed'>('all');
  const rows = (data ?? []).filter((r) => filter === 'all' || r.status === filter);
  const total = (data ?? []).reduce((s, r) => s + r.students, 0);
  const avg = data?.length ? Math.round(data.reduce((s, r) => s + r.progress, 0) / data.length) : 0;

  return (
    <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={false} onRefresh={() => { reload(); }} />} showsVerticalScrollIndicator={false}>
      <View style={[styles.inner, wide && { maxWidth: 1080 }]}>
        <View style={[styles.stats, { backgroundColor: c.surface, borderColor: c.border }]}>
          {([['albums-outline', String(data?.length ?? '–'), 'Batches', c.primary], ['people-outline', String(total), 'Students', c.success], ['trending-up-outline', `${avg}%`, 'Avg progress', '#7C3AED'], ['radio-outline', String((data ?? []).filter((r) => r.status === 'active').length), 'Running', c.accent]] as const).map(([i, v, l, col]) => (
            <View key={l} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <Ionicons name={i} size={20} color={col} />
              <Txt variant="heading">{v}</Txt>
              <Txt variant="caption" color={c.muted}>{l}</Txt>
            </View>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
          {(['all', 'active', 'upcoming', 'completed'] as const).map((f) => (
            <Chip key={f} label={`${f[0].toUpperCase()}${f.slice(1)} (${(data ?? []).filter((r) => f === 'all' || r.status === f).length})`} active={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>
        {!data ? (
          <Skeleton h={160} r={18} />
        ) : rows.length === 0 ? (
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 40 }}>
            <Ionicons name="albums-outline" size={36} color={c.muted} />
            <Txt variant="bodyStrong">No batches here</Txt>
            <Txt color={c.muted} center>A batch groups students with a start date and a weekly class schedule.</Txt>
          </View>
        ) : (
          <View style={wide ? styles.grid : { gap: 12 }}>
            {rows.map((r) => (
              <Pressable key={r.batch.id} onPress={() => router.push({ pathname: '/edu/batch/[id]', params: { id: r.batch.id } })} style={({ pressed }) => [styles.card, { backgroundColor: c.surface, borderColor: c.border }, wide && { flexBasis: '48%', flexGrow: 1 }, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={`${r.batch.name}, ${r.status}`}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ width: 92 }}><CourseArt course={r.course} height={72} rounded={radius.md} /></View>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      <Pill text={r.status[0].toUpperCase() + r.status.slice(1)} tone={STATUS_TONE[r.status]} />
                      {r.pending > 0 && <Pill text={`${r.pending} to approve`} tone="warning" />}
                    </View>
                    <Txt variant="bodyStrong" numberOfLines={2}>{r.batch.name}</Txt>
                    <Txt variant="caption" color={c.muted} numberOfLines={1}>{new Date(r.batch.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – {new Date(r.batch.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {r.weeks} weeks</Txt>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="people-outline" size={16} color={c.muted} />
                  <Txt variant="label">{r.students}/{r.batch.capacity}</Txt>
                  <ProgressBar pct={r.progress} color={r.progress === 100 ? c.info : c.success} />
                  <Txt variant="label">{r.progress}%</Txt>
                </View>
                <View style={[styles.nextRow, { borderTopColor: c.border }]}>
                  <Ionicons name={r.next ? 'calendar-outline' : 'checkmark-done-outline'} size={16} color={c.primary} />
                  <Txt variant="caption" color={c.inkSoft} style={{ flex: 1 }} numberOfLines={1}>
                    {r.next ? `Next: ${new Date(r.next.startsAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : r.status === 'completed' ? 'All classes completed' : slotLabel(r.batch.slots)}
                  </Txt>
                  <Ionicons name="chevron-forward" size={18} color={c.muted} />
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function StudentList({ userId, wide }: { userId: string; wide: boolean }) {
  const { c } = useTheme();
  const { data, reload } = useAsync(() => people.list(userId), [userId]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const ctx = educator.context(userId);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'inactive' | 'pending'>('all');
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter((r) => (filter === 'all' || r.status === filter) && (!t || [r.person.name, r.person.email, r.person.enrollmentId].some((x) => x.toLowerCase().includes(t))));
  }, [data, filter, q]);
  const count = (f: typeof filter) => (data ?? []).filter((r) => f === 'all' || r.status === f).length;

  return (
    <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={false} onRefresh={() => { reload(); }} />} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={[styles.inner, wide && { maxWidth: 1080 }]}>
        <View style={[styles.stats, { backgroundColor: c.surface, borderColor: c.border }]}>
          {([['people-outline', count('all'), 'Students', c.primary], ['school-outline', count('active'), 'Active', c.success], ['ribbon-outline', count('completed'), 'Completed', c.info], ['person-add-outline', (data ?? []).filter((r) => r.isNew).length, 'New (7 d)', c.accent]] as const).map(([i, v, l, col]) => (
            <View key={l} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <Ionicons name={i} size={20} color={col} />
              <Txt variant="heading">{String(v)}</Txt>
              <Txt variant="caption" color={c.muted}>{l}</Txt>
            </View>
          ))}
        </View>
        {ctx?.role === 'owner' && <Txt variant="caption" color={c.muted}>POC sample of your {ctx.usage.rows[0].used.toLocaleString('en-IN')} active students.</Txt>}
        <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name="search" size={20} color={c.inkSoft} />
          <TextInput value={q} onChangeText={setQ} placeholder="Name, email or enrollment ID" placeholderTextColor={c.muted} accessibilityLabel="Search students" style={[styles.searchInput, { color: c.ink }]} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
          {(['all', 'active', 'completed', 'inactive', 'pending'] as const).map((f) => (
            <Chip key={f} label={`${f === 'pending' ? 'To approve' : f[0].toUpperCase() + f.slice(1)} (${count(f)})`} active={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>
        {!data ? (
          <Skeleton h={300} r={18} />
        ) : (
          <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
            {rows.length === 0 && <Txt color={c.muted} center style={{ padding: 24 }}>No students match.</Txt>}
            {rows.map((r, i) => {
              const [label, tone] = P_TONE[r.status];
              return (
                <Pressable key={r.person.id} onPress={() => router.push({ pathname: '/edu/student/[id]', params: { id: r.person.id } })} style={[styles.sRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]} accessibilityRole="button" accessibilityLabel={`${r.person.name}, ${label}, ${r.progress}% progress`}>
                  <Avatar name={r.person.name} size={42} color={c.primary} />
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{r.person.name}</Txt>
                      {r.isNew && <Pill text="New" tone="gold" />}
                    </View>
                    <Txt variant="caption" color={c.muted} numberOfLines={1}>{r.course.title}{r.batch ? ` · ${r.batch.code}` : ' · self-paced'}</Txt>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ProgressBar pct={r.progress} color={r.progress < 40 ? c.danger : r.progress < 70 ? '#F5A524' : c.success} height={5} />
                      <Txt variant="caption" style={{ width: 34, fontWeight: '700' }}>{r.progress}%</Txt>
                    </View>
                  </View>
                  <Pill text={label} tone={tone} />
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 20, gap: 10, paddingBottom: 10 },
  seg: { flexDirection: 'row', padding: 4, borderRadius: radius.pill },
  segBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 110 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  stats: { flexDirection: 'row', paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { padding: 12, borderRadius: radius.lg, borderWidth: 1, gap: 12 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 50, borderRadius: radius.pill, borderWidth: 1 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, minHeight: 48, outlineStyle: 'none' } as any,
  list: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  sRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 72 },
  fab: { position: 'absolute', right: 20, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, height: 56, borderRadius: 28, shadowColor: '#0B2A55', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
});
