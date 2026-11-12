/**
 * Explore. Thumb-first change from the design: the search bar floats at the BOTTOM
 * (above the tab bar) instead of the top, so search + filters are one thumb-tap away.
 */
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { catalog } from '@/api/client';
import { COLLECTIONS, type Course } from '@/core/catalog';
import { useTheme } from '@/theme/ThemeProvider';
import { Grid, PAGE, SIDEBAR_W, useLayout } from '@/ui/responsive';
import { layout, radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { AppHeader, Chip, ErrorState, SectionHeader, Skeleton, useAsync } from '@/ui/kit';
import { BadgeFor, CourseCard, CourseRow, openCourse } from '@/ui/course';

export default function Explore() {
  const { c, tenant } = useTheme();
  const { width } = useWindowDimensions();
  const { isDesktop, pad, cols } = useLayout();
  const deskW = Math.min(width - SIDEBAR_W - pad * 2, PAGE.wide);
  const nCols = cols(250);
  const [cat, setCat] = useState('all');
  const [slide, setSlide] = useState(0);
  const { data, loading, error, reload } = useAsync(() => catalog.explore(tenant?.id ?? null), [tenant?.id]);
  const cats = catalog.categories();
  // Desktop shows two promoted banners side by side.
  const bannerW = isDesktop ? Math.floor((deskW - 12) / 2) : Math.min(width, layout.contentMaxWidth) - 40;

  const browse = useMemo(() => (data?.all ?? []).filter((x) => cat === 'all' || x.course.categoryId === cat), [data, cat]);

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, isDesktop && { paddingHorizontal: pad, paddingTop: 24, paddingBottom: 48 }]} showsVerticalScrollIndicator={false}>
          <View style={[styles.inner, isDesktop && { maxWidth: PAGE.wide }]}>
            <AppHeader />
            <View style={{ marginTop: 10, marginBottom: 16, gap: 2 }}>
              <TwoTone lead="Explore" accent="Courses" variant="title" />
              <Txt color={c.inkSoft}>{tenant ? `Courses from ${tenant.branding.displayName}.` : 'Expert-led courses from verified educators.'}</Txt>
            </View>

            {error ? (
              <ErrorState text={error} onRetry={reload} />
            ) : !data || loading ? (
              <View style={{ gap: 14 }}>
                <Skeleton h={168} r={22} />
                <Skeleton h={44} r={22} />
                <Skeleton h={220} r={18} />
              </View>
            ) : (
              <>
                {/* Promoted banners (only courses with listing + promotion consent) */}
                <FlatList
                  data={data.banners}
                  horizontal
                  pagingEnabled
                  snapToInterval={bannerW + 12}
                  decelerationRate="fast"
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(x) => x.id}
                  style={isDesktop ? undefined : { marginHorizontal: -20 }}
                  contentContainerStyle={{ paddingHorizontal: isDesktop ? 0 : 20, gap: 12 }}
                  onScroll={(e) => setSlide(Math.round(e.nativeEvent.contentOffset.x / (bannerW + 12)))}
                  scrollEventThrottle={32}
                  renderItem={({ item }) => <Banner course={item} width={bannerW} />}
                />
                {data.banners.length > (isDesktop ? 2 : 1) && (
                  <View style={styles.dots}>
                    {data.banners.map((b, i) => (
                      <View key={b.id} style={[styles.dot, { backgroundColor: i === slide ? c.primary : c.borderStrong, width: i === slide ? 18 : 7 }]} />
                    ))}
                  </View>
                )}

                {/* Categories */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginTop: 14 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
                  {cats.map((k) => (
                    <Chip key={k.id} label={k.name} icon={k.icon as keyof typeof Ionicons.glyphMap} active={cat === k.id} onPress={() => setCat(k.id)} />
                  ))}
                </ScrollView>

                {cat === 'all' && (
                  <>
                    <SectionHeader title="Featured Courses" action="View all" onAction={() => router.push({ pathname: '/search', params: { sort: 'popular' } })} />
                    {isDesktop ? (
                      <Grid cols={nCols}>
                        {data.featured.slice(0, nCols).map(({ course, tutor }) => (
                          <CourseCard key={course.id} course={course} tutor={tutor} width="100%" />
                        ))}
                      </Grid>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
                        {data.featured.map(({ course, tutor }) => (
                          <CourseCard key={course.id} course={course} tutor={tutor} />
                        ))}
                      </ScrollView>
                    )}

                    <SectionHeader title="Popular Collections" />
                    <View style={styles.grid}>
                      {COLLECTIONS.map((k) => (
                        <Pressable key={k.id} onPress={() => router.push({ pathname: '/search', params: { collection: k.id, title: k.name } })} accessibilityRole="button" style={({ pressed }) => [styles.coll, isDesktop && { flexBasis: '22%', width: undefined }, { backgroundColor: k.tint, borderColor: c.border }, pressed && { opacity: 0.85 }]}>
                          <Ionicons name={k.icon} size={26} color={c.primary} />
                          <Txt variant="bodyStrong" style={{ fontSize: 14 }}>
                            {k.name}
                          </Txt>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}

                <SectionHeader title={cat === 'all' ? 'All Courses' : cats.find((k) => k.id === cat)?.name ?? ''} />
                {isDesktop && browse.length ? (
                  <Grid cols={nCols}>
                    {browse.map(({ course, tutor }) => (
                      <CourseCard key={course.id} course={course} tutor={tutor} width="100%" />
                    ))}
                  </Grid>
                ) : (
                <View style={width >= 900 ? styles.cols : { gap: 10 }}>
                  {browse.length ? (
                    browse.map(({ course, tutor }) => (
                      <View key={course.id} style={width >= 900 ? styles.col : undefined}>
                        <CourseRow course={course} tutor={tutor} />
                      </View>
                    ))
                  ) : (
                    <Txt color={c.muted} center style={{ paddingVertical: 24 }}>
                      No courses in this category yet.
                    </Txt>
                  )}
                </View>
                )}
              </>
            )}
          </View>
        </ScrollView>

        {/* Bottom search dock (thumb zone) — phones/tablets; desktop has search in the header */}
        {!isDesktop && <View style={styles.dockWrap} pointerEvents="box-none">
          <View style={[styles.dock, { maxWidth: layout.contentMaxWidth }]}>
            <Pressable onPress={() => router.push('/search')} accessibilityRole="search" accessibilityLabel="Search courses, skills or tutors" style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Ionicons name="search" size={20} color={c.inkSoft} />
              <Txt color={c.muted} numberOfLines={1} style={{ flex: 1 }}>
                Search courses, skills or tutors
              </Txt>
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/search', params: { filters: '1' } })} accessibilityRole="button" accessibilityLabel="Filters" style={[styles.filterBtn, { backgroundColor: c.primary }]}>
              <Ionicons name="options" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>}
      </SafeAreaView>
    </View>
  );
}

function Banner({ course, width }: { course: Course; width: number }) {
  return (
    <Pressable onPress={() => openCourse(course.id)} accessibilityRole="button" accessibilityLabel={course.title} style={{ width }}>
      <LinearGradient colors={[course.art.from, course.art.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
        <Ionicons name={course.art.icon as keyof typeof Ionicons.glyphMap} size={150} color="rgba(255,255,255,0.13)" style={{ position: 'absolute', right: -16, top: 6 }} />
        <BadgeFor course={course} />
        <Txt variant="title" color="#fff" numberOfLines={2} style={{ maxWidth: '82%', fontSize: 22, lineHeight: 27 }}>
          {course.title}
        </Txt>
        <Txt variant="label" color="rgba(255,255,255,0.82)" numberOfLines={2} style={{ maxWidth: '80%', fontWeight: '500' }}>
          {course.subtitle}
        </Txt>
        <View style={styles.bannerCta}>
          <Txt variant="label" color="#0E1B33">
            View course
          </Txt>
          <Ionicons name="arrow-forward" size={16} color="#0E1B33" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 110 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth },
  banner: { borderRadius: 22, padding: 18, gap: 8, minHeight: 176, overflow: 'hidden' },
  bannerCta: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', alignSelf: 'flex-start', paddingHorizontal: 16, minHeight: 40, borderRadius: radius.pill, marginTop: 4 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 10 },
  dot: { height: 7, borderRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cols: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  col: { flexBasis: '48%', flexGrow: 1 },
  coll: { width: '48.5%', flexGrow: 1, flexBasis: '45%', gap: 10, padding: 14, borderRadius: radius.lg, borderWidth: 1, minHeight: 92 },
  dockWrap: { position: 'absolute', left: 0, right: 0, bottom: 10, alignItems: 'center', paddingHorizontal: 16 },
  dock: { width: '100%', flexDirection: 'row', gap: 10 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 54, borderRadius: radius.pill, borderWidth: 1, shadowColor: '#0B2A55', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  filterBtn: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B2A55', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
});
