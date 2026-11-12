import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Grid, PAGE, useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { learning } from '@/api/client';
import { dateParts, greeting, sessionStatus, timeRange } from '@/core/time';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { AppHeader, ErrorState, Pill, ProgressBar, ProgressRing, SectionHeader, Skeleton, useAsync } from '@/ui/kit';
import { CourseArt, CourseCard, openCourse } from '@/ui/course';
import { CodeArena } from '@/ui/CodeArena';

export default function Home() {
  const { c, tenant } = useTheme();
  const { isDesktop, pad, cols, width } = useLayout();
  // Right rail only when the main column keeps a comfortable width (sidebar + rail take ~650px).
  const split = isDesktop && width >= 1180;
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { data, loading, error, reload } = useAsync(() => learning.home(userId, tenant?.id ?? null), [userId, tenant?.id]);
  const first = session?.user.name.split(' ')[0] ?? 'there';

  const quick = [
    { label: 'My Learning', icon: 'book-outline', color: c.primary, go: () => router.navigate('/learning') },
    { label: 'Live Classes', icon: 'calendar-outline', color: c.accent, go: () => router.navigate('/live') },
    { label: 'Assignments', icon: 'document-text-outline', color: '#7C3AED', go: () => router.navigate({ pathname: '/learning', params: { tab: 'assessments' } }), badge: data?.counts.assignmentsPending },
    { label: 'Certificates', icon: 'ribbon-outline', color: c.success, go: () => router.push('/certificates') },
  ] as const;

  const quickEl = (
    <View style={[styles.quick, split && { flexWrap: 'wrap' }]}>
      {quick.map((q) => (
        <Pressable key={q.label} onPress={q.go} accessibilityRole="button" style={({ pressed }) => [styles.quickItem, { backgroundColor: c.surface, borderColor: c.border }, split && { flexBasis: '47%', minHeight: 104 }, pressed && { opacity: 0.8 }]}>
          <View>
            <Ionicons name={q.icon} size={28} color={q.color} />
            {'badge' in q && !!q.badge && (
              <View style={[styles.badge, { backgroundColor: c.live }]}>
                <Txt variant="caption" color="#fff" style={{ fontSize: 10, lineHeight: 14 }}>
                  {q.badge}
                </Txt>
              </View>
            )}
          </View>
          <Txt variant="caption" center numberOfLines={2} style={{ fontWeight: '600', fontSize: isDesktop ? 13 : 11, lineHeight: isDesktop ? 16 : 14, letterSpacing: -0.2 }}>
            {q.label}
          </Txt>
        </Pressable>
      ))}
    </View>
  );

  const cont = data?.inProgress[0];
  const live = data?.upcomingLive[0];

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, isDesktop && { paddingHorizontal: pad, paddingTop: 24 }]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => { reload(); }} tintColor={c.primary} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.inner, isDesktop && { maxWidth: PAGE.wide }]}>
            <AppHeader />
            <View style={{ marginTop: 10, marginBottom: 16 }}>
              <Txt variant="label" color={c.muted}>
                {greeting()}
              </Txt>
              <Txt variant="title" color={c.primaryDeep}>
                Hello, {first} 👋
              </Txt>
            </View>

            {error ? (
              <ErrorState text={error} onRetry={reload} />
            ) : loading && !data ? (
              <View style={{ gap: 14 }}>
                <Skeleton h={112} r={22} />
                <Skeleton h={92} r={18} />
                <Skeleton h={120} r={18} />
              </View>
            ) : data ? (
              <>
              <View style={split ? styles.deskRow : undefined}>
              <View style={[styles.col, split && { flex: 1, minWidth: 0 }]}>
                {/* Overall progress */}
                <LinearGradient colors={[c.primaryDeep, c.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
                  <ProgressRing pct={data.overallPct} size={78} stroke={8} track="rgba(255,255,255,0.18)" color="#3FD17C" textColor="#fff" />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt variant="heading" color="#fff">
                      Your learning progress
                    </Txt>
                    <Txt variant="label" color="rgba(255,255,255,0.78)" style={{ fontWeight: '500' }}>
                      {data.inProgress.length} of {data.enrolled.length} courses in progress · {data.completedCount} completed
                    </Txt>
                  </View>
                  <Ionicons name="stats-chart" size={30} color="rgba(255,255,255,0.9)" />
                </LinearGradient>

                {/* Daily streak, XP, heatmap and cohort leaderboard — straight under the progress banner. */}
                <CodeArena />

                {/* Phone: shortcuts as a row under the Arena. Desktop: they live in the right rail. */}
                {!split && quickEl}

                {/* Continue learning */}
                {cont ? (
                  <>
                    <SectionHeader tight title="Continue Learning" action="View all" onAction={() => router.navigate('/learning')} />
                    <Pressable onPress={() => openCourse(cont.course.id)} accessibilityRole="button" accessibilityLabel={`Continue ${cont.course.title}`} style={({ pressed }) => [styles.cont, { backgroundColor: c.surface, borderColor: c.border }, pressed && { opacity: 0.92 }]}>
                      <View style={{ width: 112 }}>
                        <CourseArt course={cont.course} height={96} rounded={radius.md} />
                      </View>
                      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                        <Txt variant="bodyStrong" numberOfLines={1}>
                          {cont.course.title}
                        </Txt>
                        <Txt variant="caption" color={c.muted} numberOfLines={1}>
                          Next: {cont.next.lesson.title}
                        </Txt>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                          <ProgressBar pct={cont.progress.pct} />
                          <Txt variant="label">{cont.progress.pct}%</Txt>
                        </View>
                      </View>
                      <View style={[styles.play, { backgroundColor: c.primary }]}>
                        <Ionicons name="play" size={22} color="#fff" style={{ marginLeft: 3 }} />
                      </View>
                    </Pressable>
                  </>
                ) : null}

                {/* Phone: the rest of the stack continues below Continue Learning. */}
                {!split && (
                  <>
                    {live && <UpcomingLive live={live} />}
                    <MentorsLink />
                    <PlaygroundLink />
                  </>
                )}
              </View>
              {/* Desktop right rail: practice, next live class, playground. */}
              {split && (
                <View style={[styles.col, { width: 340 }]}>
                  {live && <UpcomingLive live={live} />}
                  <MentorsLink />
                  <PlaygroundLink />
                  {quickEl}
                </View>
              )}
              </View>

                {/* Recommendations */}
                {data.recommended.length > 0 && (
                  <>
                    <SectionHeader title={tenant ? `More from ${tenant.branding.displayName}` : 'Recommended for you'} action="Explore" onAction={() => router.navigate('/explore')} />
                    {isDesktop ? (
                      <Grid cols={cols(250)}>
                        {/* Whole rows only, so the last row is never left with a single orphan card. */}
                        {data.recommended.slice(0, data.recommended.length >= cols(250) ? Math.min(cols(250) * 2, Math.floor(data.recommended.length / cols(250)) * cols(250)) : data.recommended.length).map(({ course, tutor }) => (
                          <CourseCard key={course.id} course={course} tutor={tutor} width="100%" />
                        ))}
                      </Grid>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} style={styles.bleed}>
                        {data.recommended.map(({ course, tutor }) => (
                          <CourseCard key={course.id} course={course} tutor={tutor} />
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}

                {data.enrolled.length === 0 && (
                  <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <Ionicons name="sparkles-outline" size={30} color={c.accent} />
                    <Txt variant="bodyStrong" center>
                      Start your first course
                    </Txt>
                    <Txt color={c.muted} center>
                      Browse courses from verified educators and start learning today.
                    </Txt>
                    <Pressable onPress={() => router.navigate('/explore')} style={[styles.emptyBtn, { backgroundColor: c.primary }]} accessibilityRole="button">
                      <Txt variant="bodyStrong" color="#fff">
                        Explore courses
                      </Txt>
                    </Pressable>
                  </View>
                )}
              </>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

type LiveItem = Awaited<ReturnType<typeof learning.home>>['upcomingLive'][number];

function UpcomingLive({ live }: { live: LiveItem }) {
  return (
    <View>
      <SectionHeader tight title="Upcoming Live Class" action="Schedule" onAction={() => router.navigate("/live")} />
      <LiveCard live={live} />
    </View>
  );
}

function MentorsLink() {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => router.push('/mentors')} accessibilityRole="button" accessibilityLabel="Book a 1-on-1 mentor" style={({ pressed }) => [styles.play2, { backgroundColor: c.surface, borderColor: c.border }, pressed && { opacity: 0.9 }]}>
      <Ionicons name="videocam-outline" size={26} color={c.primary} />
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">1-on-1 Mentors</Txt>
        <Txt variant="caption" color={c.inkSoft}>Book a resume review, code debugging or project feedback session.</Txt>
      </View>
      <Ionicons name="chevron-forward" size={20} color={c.primary} />
    </Pressable>
  );
}

function PlaygroundLink() {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => router.push('/playground')} accessibilityRole="button" accessibilityLabel="Open Code Playground" style={({ pressed }) => [styles.play2, { backgroundColor: c.primarySoft, borderColor: c.primary }, pressed && { opacity: 0.9 }]}>
      <Ionicons name="code-slash" size={26} color={c.primary} />
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">Code Playground</Txt>
        <Txt variant="caption" color={c.inkSoft}>Practise Python, JavaScript, SQL, Java, React and more — no install.</Txt>
      </View>
      <Ionicons name="chevron-forward" size={20} color={c.primary} />
    </Pressable>
  );
}

export function LiveCard({ live }: { live: LiveItem }) {
  const { c } = useTheme();
  const d = dateParts(live.session.startsAt);
  const st = sessionStatus(live.session.startsAt, live.session.endsAt);
  const isLive = st.state === 'live' || st.state === 'soon';
  return (
    <Pressable onPress={() => router.navigate('/live')} accessibilityRole="button" style={({ pressed }) => [styles.live, { backgroundColor: c.surface, borderColor: isLive ? c.live : c.border }, pressed && { opacity: 0.92 }]}>
      <View style={[styles.date, { backgroundColor: c.primarySoft }]}>
        <Txt variant="caption" color={c.inkSoft}>
          {d.month}
        </Txt>
        <Txt variant="title" color={c.primaryDeep} style={{ lineHeight: 28 }}>
          {d.day}
        </Txt>
        <Txt variant="caption" color={c.inkSoft}>
          {d.weekday}
        </Txt>
      </View>
      <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
        <Pill text={st.state === 'live' ? 'LIVE NOW' : st.label} tone={isLive ? 'live' : 'info'} icon="radio" />
        <Txt variant="bodyStrong" numberOfLines={2}>
          {live.session.title}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="time-outline" size={14} color={c.muted} />
          <Txt variant="caption" color={c.muted} numberOfLines={1}>
            {timeRange(live.session.startsAt, live.session.endsAt)}
          </Txt>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={22} color={c.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 28 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth },
  deskRow: { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },
  /** One vertical rhythm for every block in a column. */
  col: { gap: 16 },
  play2: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, borderRadius: 22 },
  quick: { flexDirection: 'row', gap: 8 },
  quickItem: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 2, borderRadius: radius.lg, borderWidth: 1, minHeight: 88 },
  badge: { position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cont: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1 },
  play: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1.2 },
  date: { width: 64, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center' },
  rail: { gap: 12, paddingHorizontal: 20 },
  bleed: { marginHorizontal: -20 },
  empty: { alignItems: 'center', gap: 8, padding: 24, borderRadius: radius.lg, borderWidth: 1, marginTop: 16 },
  emptyBtn: { marginTop: 8, paddingHorizontal: 22, minHeight: 48, borderRadius: radius.pill, justifyContent: 'center' },
});
