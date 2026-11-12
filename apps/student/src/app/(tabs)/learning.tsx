/** My Learning — Courses + Assessments (quizzes, exams, assignments) in one tab. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Grid, useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { assessments, learning } from '@/api/client';
import type { AssessStatus } from '@/core/assess';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { AppHeader, Chip, ErrorState, Pill, ProgressBar, Skeleton, useAsync } from '@/ui/kit';
import { CourseArt, openCourse } from '@/ui/course';

type Seg = 'courses' | 'assessments';
type Kind = 'all' | 'quiz' | 'exam' | 'assignment';

export default function MyLearning() {
  const { isDesktop, pad } = useLayout();
  const { c, tenant } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const params = useLocalSearchParams<{ tab?: string }>();
  const [seg, setSeg] = useState<Seg>(params.tab === 'assessments' ? 'assessments' : 'courses');
  useEffect(() => {
    if (params.tab === 'assessments') setSeg('assessments');
  }, [params.tab]);

  const home = useAsync(() => learning.home(userId, tenant?.id ?? null), [userId, tenant?.id]);
  const as = useAsync(() => assessments.list(userId, tenant?.id ?? null), [userId, tenant?.id]);
  useFocusEffect(useCallback(() => { home.reload(); as.reload(); }, [home.reload, as.reload])); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, isDesktop && { paddingHorizontal: pad, paddingTop: 24 }]} refreshControl={<RefreshControl refreshing={false} onRefresh={() => { home.reload(); as.reload(); }} />} showsVerticalScrollIndicator={false}>
          <View style={[styles.inner, isDesktop && { maxWidth: 1100 }]}>
            <AppHeader />
            <View style={{ marginTop: 10, marginBottom: 14 }}>
              <TwoTone lead="My" accent="Learning" variant="title" />
            </View>
            <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
              {(['courses', 'assessments'] as const).map((s) => (
                <Pressable key={s} onPress={() => setSeg(s)} accessibilityRole="tab" accessibilityState={{ selected: seg === s }} style={[styles.segBtn, seg === s && { backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 }]}>
                  <Txt variant="label" color={seg === s ? c.primary : c.inkSoft}>
                    {s === 'courses' ? 'Courses' : 'Assessments'}
                    {s === 'assessments' && as.data?.stats.pending ? ` · ${as.data.stats.pending}` : ''}
                  </Txt>
                </Pressable>
              ))}
            </View>
            {seg === 'courses' ? <Courses data={home.data} loading={home.loading} error={home.error} reload={home.reload} /> : <Assessments data={as.data} error={as.error} reload={as.reload} />}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

type HomeData = Awaited<ReturnType<typeof learning.home>>;
function Courses({ data, loading, error, reload }: { data: HomeData | null; loading: boolean; error: string | null; reload: () => void }) {
  const { c } = useTheme();
  const wide = useLayout().isDesktop;
  const [filter, setFilter] = useState<'progress' | 'done'>('progress');
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data || loading) return <View style={{ gap: 12, marginTop: 14 }}><Skeleton h={110} r={18} /><Skeleton h={110} r={18} /></View>;
  const list = data.enrolled.filter((e) => (filter === 'done' ? e.progress.pct === 100 : e.progress.pct < 100));
  return (
    <View style={{ gap: 12, marginTop: 14 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label={`In progress (${data.inProgress.length})`} active={filter === 'progress'} onPress={() => setFilter('progress')} />
        <Chip label={`Completed (${data.completedCount})`} active={filter === 'done'} onPress={() => setFilter('done')} />
      </View>
      {list.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 30 }}>
          <Ionicons name={filter === 'done' ? 'trophy-outline' : 'book-outline'} size={34} color={c.muted} />
          <Txt color={c.muted} center>{filter === 'done' ? 'Finish a course to see it here with your certificate.' : 'No courses in progress.'}</Txt>
          {filter === 'progress' && <Chip label="Explore courses" icon="compass" onPress={() => router.navigate('/explore')} />}
        </View>
      ) : (
        <Grid cols={wide ? 2 : 1} gap={12}>
        {list.map((e) => (
          // Card is a plain container: a button can't sit inside another button on web.
          <View key={e.course.id} style={[styles.course, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Pressable onPress={() => openCourse(e.course.id)} style={({ pressed }) => [{ flexDirection: 'row', gap: 12 }, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={`${e.course.title}, ${e.progress.pct}% complete`}>
              <View style={{ width: 96 }}>
                <CourseArt course={e.course} height={80} rounded={radius.md} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Txt variant="bodyStrong" numberOfLines={2}>{e.course.title}</Txt>
                <Txt variant="caption" color={c.muted} numberOfLines={1}>{e.tutor.name}</Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <ProgressBar pct={e.progress.pct} />
                  <Txt variant="label">{e.progress.pct}%</Txt>
                </View>
              </View>
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/learn/[courseId]', params: { courseId: e.course.id, lesson: e.next.lesson.id } })} style={[styles.resume, { backgroundColor: c.primarySoft }]} accessibilityRole="button" accessibilityLabel={`Resume: ${e.next.lesson.title}`}>
              <Ionicons name="play-circle" size={22} color={c.primary} />
              <Txt variant="label" numberOfLines={1} style={{ flex: 1 }}>{e.progress.pct === 100 ? 'Rewatch' : 'Next'}: {e.next.lesson.title}</Txt>
              <Ionicons name="chevron-forward" size={18} color={c.primary} />
            </Pressable>
          </View>
        ))}
        </Grid>
      )}
    </View>
  );
}

type AsData = Awaited<ReturnType<typeof assessments.list>>;
const STATUS: Record<AssessStatus, { label: string; tone: 'warning' | 'info' | 'success' | 'neutral' | 'live' }> = {
  pending: { label: 'Pending', tone: 'warning' },
  in_progress: { label: 'Draft saved', tone: 'info' },
  overdue: { label: 'Overdue', tone: 'live' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  submitted: { label: 'Submitted', tone: 'success' },
  graded: { label: 'Graded', tone: 'success' },
  completed: { label: 'Completed', tone: 'success' },
};

function Assessments({ data, error, reload }: { data: AsData | null; error: string | null; reload: () => void }) {
  const { c } = useTheme();
  const [kind, setKind] = useState<Kind>('all');
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => kind === 'all' || r.a.kind === kind), [data, kind]);
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data) return <View style={{ gap: 12, marginTop: 14 }}><Skeleton h={80} r={18} /><Skeleton h={100} r={18} /></View>;

  const stats = [
    ['clipboard-outline', data.stats.total, 'Total', c.primary],
    ['checkmark-circle-outline', data.stats.done, 'Done', c.success],
    ['trophy-outline', `${data.stats.avg}%`, 'Avg score', c.accent],
    ['time-outline', data.stats.pending, 'Pending', c.danger],
  ] as const;

  const open = (r: AsData['rows'][number]) => {
    if (r.a.kind === 'assignment') return router.push({ pathname: '/assignment/[id]', params: { id: r.a.id } });
    if (r.status === 'completed' && r.best) return router.push({ pathname: '/result/[id]', params: { id: r.best.id } });
    router.push({ pathname: '/quiz/[lessonId]', params: { lessonId: r.a.id } });
  };

  return (
    <View style={{ gap: 12, marginTop: 14 }}>
      <View style={[styles.stats, { backgroundColor: c.surface, borderColor: c.border }]}>
        {stats.map(([icon, v, l, col]) => (
          <View key={l} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Ionicons name={icon} size={22} color={col} />
            <Txt variant="heading">{v}</Txt>
            <Txt variant="caption" color={c.muted}>{l}</Txt>
          </View>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
        {([['all', 'All'], ['quiz', 'Quizzes'], ['exam', 'Exams'], ['assignment', 'Assignments']] as const).map(([k, l]) => (
          <Chip key={k} label={l} active={kind === k} onPress={() => setKind(k)} />
        ))}
      </ScrollView>
      {rows.map((r) => {
        const st = STATUS[r.status];
        const icon = r.a.kind === 'quiz' ? 'help-circle' : r.a.kind === 'exam' ? 'school' : 'document-text';
        const tint = r.a.kind === 'quiz' ? ['#EEF2FF', '#3B5BDB'] : r.a.kind === 'exam' ? ['#F1ECFC', '#7C3AED'] : [c.warningBg, c.warning];
        const meta =
          r.a.kind === 'assignment'
            ? r.status === 'graded' ? `Score ${r.sub?.grade?.pct}%` : r.a.dueAt ? `Due ${new Date(r.a.dueAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''
            : r.status === 'scheduled' ? `Opens ${new Date(r.a.opensAt!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : `${r.a.questionIds?.length} questions · ${r.a.durationMin} min${r.best ? ` · Best ${r.best.scorePct}%` : ''}`;
        const cta = { pending: r.a.kind === 'assignment' ? 'Submit' : r.a.kind === 'exam' ? 'Start exam' : 'Start quiz', in_progress: 'Continue', overdue: 'Submit late', scheduled: 'View', submitted: 'View', graded: 'Feedback', completed: 'Result' }[r.status];
        return (
          <Pressable key={r.a.id} onPress={() => open(r)} style={({ pressed }) => [styles.as, { backgroundColor: c.surface, borderColor: r.status === 'overdue' ? c.danger : c.border }, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={`${r.a.title}, ${st.label}`}>
            <View style={[styles.asIcon, { backgroundColor: tint[0] }]}>
              <Ionicons name={icon} size={24} color={tint[1]} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Pill text={st.label} tone={st.tone} />
              <Txt variant="bodyStrong" numberOfLines={2}>{r.a.title}</Txt>
              <Txt variant="caption" color={c.muted} numberOfLines={1}>{r.course.title}</Txt>
              <Txt variant="caption" color={r.status === 'overdue' ? c.danger : c.inkSoft} numberOfLines={1} style={{ fontWeight: '600' }}>{meta}</Txt>
            </View>
            <View style={[styles.cta, { backgroundColor: ['pending', 'in_progress', 'overdue'].includes(r.status) ? c.primary : c.surfaceMuted }]}>
              <Txt variant="caption" color={['pending', 'in_progress', 'overdue'].includes(r.status) ? '#fff' : c.primary} style={{ fontWeight: '700' }}>{cta}</Txt>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 30 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth },
  seg: { flexDirection: 'row', padding: 4, borderRadius: radius.pill },
  segBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  course: { padding: 10, borderRadius: radius.lg, borderWidth: 1, gap: 10 },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 46, borderRadius: radius.md },
  stats: { flexDirection: 'row', paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1 },
  as: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1.2 },
  asIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cta: { paddingHorizontal: 12, minHeight: 36, borderRadius: radius.pill, justifyContent: 'center' },
});
