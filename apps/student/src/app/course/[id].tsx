/**
 * Course page — one screen, two states (combines the Course Detail, Curriculum and Course Reviews designs).
 *  Not enrolled: overview, curriculum with free previews, live, reviews → sticky "Enroll" bar.
 *  Enrolled: progress card, ticked curriculum, review button → sticky "Continue" bar.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PAGE, useLayout } from '@/ui/responsive';
import { catalog, commerce, enrollment as enrollmentApi, live as liveApi, reviews as reviewsApi } from '@/api/client';
import { FORMAT_LABEL, LEVEL_LABEL, compact, lessonCount, nextLesson, priceDisplay, progressOf, totalHours, type Course, type Enrollment, type Lesson, type Order } from '@/core/catalog';
import { dateParts, dayLabel, sessionStatus, timeRange } from '@/core/time';
import { tenantUrl } from '@/core/tenant';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, ErrorState, IconButton, Pill, ProgressBar, ProgressRing, Skeleton, useAsync } from '@/ui/kit';
import { BadgeFor, CourseArt, Price, Rating } from '@/ui/course';
import { ReviewSheet } from '@/ui/ReviewSheet';
import { BottomSheet } from '@/ui/kit';

type Tab = 'overview' | 'curriculum' | 'live' | 'reviews';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'live', label: 'Live' },
  { id: 'reviews', label: 'Reviews' },
];

const fmtDur = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

export default function CoursePage() {
  const { isDesktop, pad } = useLayout();
  const { id, ref } = useLocalSearchParams<{ id: string; ref?: string }>();
  const { c, tenant } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const data = catalog.get(id);
  const [tab, setTab] = useState<Tab>('overview');
  const [wish, setWish] = useState(() => catalog.isWishlisted(userId, id));
  const [enr, setEnr] = useState<Enrollment | null>(() => enrollmentApi.get(userId, id));
  const [reviewOpen, setReviewOpen] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [freeBusy, setFreeBusy] = useState(false);
  const rv = useAsync(() => reviewsApi.list(id), [id]);

  // Re-read enrollment when coming back from checkout or the player.
  useFocusEffect(
    useCallback(() => {
      setEnr(enrollmentApi.get(userId, id));
    }, [userId, id]),
  );

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };

  if (!data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20 }}>
        <ErrorState text="This course is not available." onRetry={() => router.replace('/explore')} />
      </SafeAreaView>
    );
  }
  const { course, tutor } = data;
  const enrolled = !!enr;
  const prog = progressOf(course, enr ?? undefined);
  const next = nextLesson(course, enr ?? undefined);
  const source: Order['source'] = ref === 'campaign' ? 'bodhin_campaign' : tenant ? 'direct' : 'bodhin_referral';

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/explore'));
  const openLesson = (l: Lesson) => {
    if (enrolled || l.preview) router.push({ pathname: '/learn/[courseId]', params: { courseId: course.id, lesson: l.id } });
    else setLockedOpen(true);
  };
  const enroll = async () => {
    if (course.priceInr === 0) {
      setFreeBusy(true);
      try {
        await commerce.enrollFree(userId, course.id, source);
        setEnr(enrollmentApi.get(userId, course.id));
        flash('You are enrolled. Happy learning!');
      } catch (e) {
        flash((e as Error).message); // e.g. academy paused or student limit full
      } finally {
        setFreeBusy(false);
      }
    } else router.push({ pathname: '/checkout/[id]', params: { id: course.id, source } });
  };
  const share = async () => {
    const url = `${tenantUrl(tenant?.slug ?? 'www')}/course/${course.id}`;
    try {
      await Share.share({ message: `${course.title} on Bodhin\n${url}`, url });
    } catch {
      flash('Sharing is not available here. Link: ' + url);
    }
  };


  const lockedSheet = (
  <BottomSheet open={lockedOpen} onClose={() => setLockedOpen(false)} title="Enroll to unlock" footer={<Button title={course.priceInr === 0 ? 'Enroll free' : `Enroll · ${priceDisplay(course).price}`} style={{ flex: 1 }} onPress={() => { setLockedOpen(false); enroll(); }} />}>
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 6 }}>
      <View style={[styles.lockIcon, { backgroundColor: c.primarySoft }]}>
        <Ionicons name="lock-closed" size={30} color={c.primary} />
      </View>
      <Txt center color={c.inkSoft}>
        This lesson is part of the full course. Enroll to get all {lessonCount(course)} lessons, live classes, assessments{course.certificate ? ' and a certificate' : ''}.
      </Txt>
    </View>
  </BottomSheet>
  );
  // ── Reusable pieces (phone layout below; desktop layout uses the same pieces in two columns) ──
  const topBarEl = (
    <View style={styles.topBar}>
      <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={goBack} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <IconButton icon={wish ? 'heart' : 'heart-outline'} label={wish ? 'Remove from wishlist' : 'Save to wishlist'} tone="filled" onPress={() => { const on = catalog.toggleWishlist(userId, course.id); setWish(on); flash(on ? 'Saved to your wishlist' : 'Removed from wishlist'); }} />
        <IconButton icon="share-social-outline" label="Share course" tone="filled" onPress={share} />
      </View>
    </View>
  );
  const artEl = (h: number) => (
    <CourseArt course={course} height={h} rounded={22}>
      <View style={{ position: 'absolute', top: 14, left: 14 }}>
        <BadgeFor course={course} />
      </View>
      {course.modules[0]?.lessons[0]?.preview && !enrolled && (
        <Pressable onPress={() => openLesson(course.modules[0].lessons[0])} style={styles.previewBtn} accessibilityRole="button" accessibilityLabel="Watch free preview">
          <Ionicons name="play" size={16} color="#fff" />
          <Txt variant="label" color="#fff">
            Watch preview
          </Txt>
        </Pressable>
      )}
    </CourseArt>
  );
  const infoEl = (
    <>
    <Txt variant="title" style={{ marginTop: 14 }} accessibilityRole="header">
      {course.title}
    </Txt>
    <Txt color={c.inkSoft} style={{ marginTop: 4 }}>
      {course.subtitle}
    </Txt>
    <View style={styles.metaRow}>
      <Rating value={rv.data?.avg ?? course.rating} count={rv.data?.count ?? course.ratingCount} />
      <Txt variant="caption" color={c.muted}>
        ·
      </Txt>
      <View style={styles.meta}>
        <Ionicons name="people-outline" size={15} color={c.muted} />
        <Txt variant="caption" color={c.inkSoft}>
          {compact(course.students)} learners
        </Txt>
      </View>
      <Pill text={FORMAT_LABEL[course.format]} tone="info" icon="videocam-outline" />
    </View>

    <View style={[styles.tutor, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Avatar name={tutor.name} color={tutor.color} size={46} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Txt variant="bodyStrong">{tutor.name}</Txt>
          {tutor.verified && <Ionicons name="checkmark-circle" size={16} color={c.info} accessibilityLabel="Verified educator" />}
        </View>
        <Txt variant="caption" color={c.muted}>
          {tutor.headline} · {tutor.yearsExperience}+ years
        </Txt>
      </View>
    </View>

    {enrolled && (
      <View style={[styles.progress, { backgroundColor: c.surface, borderColor: c.border }]}>
        <ProgressRing pct={prog.pct} size={70} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="heading">Your progress</Txt>
          <Txt variant="label" color={c.muted} style={{ fontWeight: '500' }}>
            {prog.done} of {prog.total} lessons · {prog.modulesDone} of {course.modules.length} modules
          </Txt>
          {enr?.validTill && (
            <Txt variant="caption" color={c.muted}>
              Access till {new Date(enr.validTill).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Txt>
          )}
        </View>
      </View>
    )}
    </>
  );
  const tabsEl = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
      {TABS.map((t) => {
        const on = tab === t.id;
        const count = t.id === 'reviews' && rv.data ? ` (${compact(rv.data.count)})` : '';
        return (
          <Pressable key={t.id} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.tab, { backgroundColor: on ? c.primary : c.surface, borderColor: on ? c.primary : c.border }]}>
            <Txt variant="label" color={on ? '#fff' : c.ink}>
              {t.label}
              {count}
            </Txt>
          </Pressable>
        );
      })}
    </ScrollView>
  );
  const contentEl = (
    <>
    {tab === 'overview' && <Overview course={course} />}
    {tab === 'curriculum' && <Curriculum course={course} enr={enr} nextId={next.lesson.id} onOpen={openLesson} />}
    {tab === 'live' && <LiveList course={course} userId={userId} enrolled={enrolled} onToast={flash} />}
    {tab === 'reviews' &&
      (rv.loading || !rv.data ? (
        <Skeleton h={160} r={18} />
      ) : (
        <Reviews data={rv.data} enrolled={enrolled} hasMine={!!reviewsApi.mine(userId, course.id)} onWrite={() => setReviewOpen(true)} />
      ))}
    </>
  );

  if (isDesktop) {
    return (
      <View style={{ flex: 1, backgroundColor: c.ivory }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: pad, paddingTop: 24, paddingBottom: 64, alignItems: 'center' }} showsVerticalScrollIndicator={true}>
          <View style={{ width: '100%', maxWidth: PAGE.wide }}>
            {topBarEl}
            <View style={{ flexDirection: 'row', gap: 40, alignItems: 'flex-start' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                {infoEl}
                <View style={{ marginTop: 24, marginBottom: 8 }}>{tabsEl}</View>
                {contentEl}
              </View>
              {/* Purchase / continue card — stays in view while scrolling */}
              <View style={[styles.buyCard, { backgroundColor: c.surface, borderColor: c.border }, { position: 'sticky', top: 24 } as object]}>
                {artEl(196)}
                <View style={{ padding: 20, gap: 14 }}>
                  {enrolled ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                        <ProgressRing pct={prog.pct} size={58} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Txt variant="caption" color={c.muted}>{prog.pct === 100 ? 'Course completed' : 'Up next'}</Txt>
                          <Txt variant="bodyStrong" numberOfLines={2}>{next.lesson.title}</Txt>
                        </View>
                      </View>
                      <Button title={prog.done ? 'Continue learning' : 'Start learning'} iconRight="play" onPress={() => openLesson(next.lesson)} />
                    </>
                  ) : (
                    <>
                      <View><Price course={course} big /><OfferLine course={course} /></View>
                      <Button title={course.priceInr === 0 ? 'Enroll free' : 'Enroll Now'} iconRight="arrow-forward" loading={freeBusy} onPress={enroll} />
                      <Txt variant="caption" color={c.muted} center>Secure payment · GST invoice · {course.priceInr === 0 ? 'Free forever' : '7-day refund window'}</Txt>
                    </>
                  )}
                  <View style={[styles.includes, { borderTopColor: c.border }]}>
                    <Txt variant="label">This course includes</Txt>
                    {[
                      ['play-circle-outline', `${lessonCount(course)} lessons · ${totalHours(course)} of content`],
                      ['layers-outline', `${course.modules.length} modules`],
                      ['time-outline', course.accessMonths ? `${course.accessMonths} months access` : 'Lifetime access'],
                      ...(course.certificate ? [['ribbon-outline', 'Certificate of completion']] : []),
                    ].map(([ic, t]) => (
                      <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name={ic as keyof typeof Ionicons.glyphMap} size={18} color={c.inkSoft} />
                        <Txt variant="caption" color={c.inkSoft}>{t}</Txt>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
        {toast && (
          <View style={[styles.toast, { backgroundColor: c.ink }]} accessibilityLiveRegion="polite">
            <Txt variant="label" color="#fff" center>{toast}</Txt>
          </View>
        )}
        <ReviewSheet course={course} open={reviewOpen} onClose={() => setReviewOpen(false)} onSaved={() => { rv.reload(); flash('Thanks! Your review is live.'); }} />
        {lockedSheet}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          {/* 0 — hero + summary */}
          <View style={styles.pad}>
            <View style={styles.inner}>
              <View style={styles.topBar}>
                <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={goBack} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <IconButton icon={wish ? 'heart' : 'heart-outline'} label={wish ? 'Remove from wishlist' : 'Save to wishlist'} tone="filled" onPress={() => { const on = catalog.toggleWishlist(userId, course.id); setWish(on); flash(on ? 'Saved to your wishlist' : 'Removed from wishlist'); }} />
                  <IconButton icon="share-social-outline" label="Share course" tone="filled" onPress={share} />
                </View>
              </View>

              <CourseArt course={course} height={188} rounded={22}>
                <View style={{ position: 'absolute', top: 14, left: 14 }}>
                  <BadgeFor course={course} />
                </View>
                {course.modules[0]?.lessons[0]?.preview && !enrolled && (
                  <Pressable onPress={() => openLesson(course.modules[0].lessons[0])} style={styles.previewBtn} accessibilityRole="button" accessibilityLabel="Watch free preview">
                    <Ionicons name="play" size={16} color="#fff" />
                    <Txt variant="label" color="#fff">
                      Watch preview
                    </Txt>
                  </Pressable>
                )}
              </CourseArt>

              <Txt variant="title" style={{ marginTop: 14 }} accessibilityRole="header">
                {course.title}
              </Txt>
              <Txt color={c.inkSoft} style={{ marginTop: 4 }}>
                {course.subtitle}
              </Txt>
              <View style={styles.metaRow}>
                <Rating value={rv.data?.avg ?? course.rating} count={rv.data?.count ?? course.ratingCount} />
                <Txt variant="caption" color={c.muted}>
                  ·
                </Txt>
                <View style={styles.meta}>
                  <Ionicons name="people-outline" size={15} color={c.muted} />
                  <Txt variant="caption" color={c.inkSoft}>
                    {compact(course.students)} learners
                  </Txt>
                </View>
                <Pill text={FORMAT_LABEL[course.format]} tone="info" icon="videocam-outline" />
              </View>

              <View style={[styles.tutor, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Avatar name={tutor.name} color={tutor.color} size={46} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Txt variant="bodyStrong">{tutor.name}</Txt>
                    {tutor.verified && <Ionicons name="checkmark-circle" size={16} color={c.info} accessibilityLabel="Verified educator" />}
                  </View>
                  <Txt variant="caption" color={c.muted}>
                    {tutor.headline} · {tutor.yearsExperience}+ years
                  </Txt>
                </View>
              </View>

              {enrolled && (
                <View style={[styles.progress, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <ProgressRing pct={prog.pct} size={70} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt variant="heading">Your progress</Txt>
                    <Txt variant="label" color={c.muted} style={{ fontWeight: '500' }}>
                      {prog.done} of {prog.total} lessons · {prog.modulesDone} of {course.modules.length} modules
                    </Txt>
                    {enr?.validTill && (
                      <Txt variant="caption" color={c.muted}>
                        Access till {new Date(enr.validTill).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Txt>
                    )}
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* 1 — sticky section tabs */}
          <View style={[styles.tabsWrap, { backgroundColor: c.ivory }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
              {TABS.map((t) => {
                const on = tab === t.id;
                const count = t.id === 'reviews' && rv.data ? ` (${compact(rv.data.count)})` : '';
                return (
                  <Pressable key={t.id} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.tab, { backgroundColor: on ? c.primary : c.surface, borderColor: on ? c.primary : c.border }]}>
                    <Txt variant="label" color={on ? '#fff' : c.ink}>
                      {t.label}
                      {count}
                    </Txt>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* 2 — section content */}
          <View style={styles.pad}>
            <View style={styles.inner}>
              {tab === 'overview' && <Overview course={course} />}
              {tab === 'curriculum' && <Curriculum course={course} enr={enr} nextId={next.lesson.id} onOpen={openLesson} />}
              {tab === 'live' && <LiveList course={course} userId={userId} enrolled={enrolled} onToast={flash} />}
              {tab === 'reviews' &&
                (rv.loading || !rv.data ? (
                  <Skeleton h={160} r={18} />
                ) : (
                  <Reviews data={rv.data} enrolled={enrolled} hasMine={!!reviewsApi.mine(userId, course.id)} onWrite={() => setReviewOpen(true)} />
                ))}
            </View>
          </View>
        </ScrollView>

        {/* Sticky action bar (thumb zone) */}
        <View style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <View style={[styles.barInner]}>
            {enrolled ? (
              <>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="caption" color={c.muted}>
                    {prog.pct === 100 ? 'Course completed' : 'Up next'}
                  </Txt>
                  <Txt variant="bodyStrong" numberOfLines={1}>
                    {next.lesson.title}
                  </Txt>
                </View>
                <Button title={prog.done ? 'Continue' : 'Start'} iconRight="play" style={{ minWidth: 150 }} onPress={() => openLesson(next.lesson)} />
              </>
            ) : (
              <>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Price course={course} big />
                  <OfferLine course={course} />
                </View>
                <Button title={course.priceInr === 0 ? 'Enroll free' : 'Enroll Now'} iconRight="arrow-forward" loading={freeBusy} style={{ minWidth: 160 }} onPress={enroll} />
              </>
            )}
          </View>
        </View>

        {toast && (
          <View style={[styles.toast, { backgroundColor: c.ink }]} accessibilityLiveRegion="polite">
            <Txt variant="label" color="#fff" center>
              {toast}
            </Txt>
          </View>
        )}
      </SafeAreaView>

      <ReviewSheet course={course} open={reviewOpen} onClose={() => setReviewOpen(false)} onSaved={() => { rv.reload(); flash('Thanks! Your review is live.'); }} />

      {lockedSheet}
    </View>
  );
}

function OfferLine({ course }: { course: Course }) {
  const { c } = useTheme();
  const p = priceDisplay(course);
  if (!p.pctOff || !p.offerEndsAt) return <Txt variant="caption" color={c.muted}>Incl. GST · one-time payment</Txt>;
  return (
    <Txt variant="caption" color={c.warning} style={{ fontWeight: '700' }}>
      {p.pctOff}% off · ends {new Date(p.offerEndsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
    </Txt>
  );
}

function Overview({ course }: { course: Course }) {
  const { c } = useTheme();
  const stats = [
    { icon: 'layers-outline', v: String(course.modules.length), l: 'Modules' },
    { icon: 'play-circle-outline', v: String(lessonCount(course)), l: 'Lessons' },
    { icon: 'time-outline', v: `${Math.max(1, totalHours(course))}h`, l: 'Content' },
    { icon: 'construct-outline', v: String(course.projects), l: 'Projects' },
    { icon: course.certificate ? 'ribbon-outline' : 'remove-circle-outline', v: course.certificate ? 'Yes' : 'No', l: 'Certificate' },
  ] as const;
  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 6 }}>
        <Txt variant="heading">About this course</Txt>
        <Txt color={c.inkSoft}>{course.description}</Txt>
      </View>
      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.l} style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Ionicons name={s.icon} size={22} color={c.primary} />
            <Txt variant="bodyStrong">{s.v}</Txt>
            <Txt variant="caption" color={c.muted}>
              {s.l}
            </Txt>
          </View>
        ))}
      </View>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Txt variant="heading">What you'll learn</Txt>
        {course.outcomes.map((o) => (
          <View key={o} style={styles.outcome}>
            <Ionicons name="checkmark-circle" size={20} color={c.success} />
            <Txt style={{ flex: 1 }}>{o}</Txt>
          </View>
        ))}
      </View>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Txt variant="heading">Course details</Txt>
        {[
          ['Level', LEVEL_LABEL[course.level]],
          ['Format', FORMAT_LABEL[course.format]],
          ['Language', 'English (Tamil support in live classes)'],
          ['Access', '12 months, on app and web'],
        ].map(([k, v]) => (
          <View key={k} style={styles.kv}>
            <Txt color={c.muted}>{k}</Txt>
            <Txt variant="bodyStrong" style={{ flex: 1, textAlign: 'right' }}>
              {v}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

function Curriculum({ course, enr, nextId, onOpen }: { course: Course; enr: Enrollment | null; nextId: string; onOpen: (l: Lesson) => void }) {
  const { c } = useTheme();
  const done = new Set(enr?.completedLessonIds ?? []);
  const firstOpen = course.modules.find((m) => m.lessons.some((l) => l.id === nextId))?.id ?? course.modules[0]?.id;
  const [open, setOpen] = useState<Set<string>>(() => new Set([firstOpen]));
  const icon = { video: 'play', pdf: 'document-text', quiz: 'help-circle' } as const;
  const tint = { video: [c.primarySoft, c.primary], pdf: [c.infoBg, c.info], quiz: ['#F1ECFC', '#7C3AED'] } as const;

  return (
    <View style={{ gap: 10 }}>
      <Txt variant="label" color={c.muted}>
        {course.modules.length} modules · {lessonCount(course)} lessons · {Math.max(1, totalHours(course))}h total
      </Txt>
      {course.modules.map((m, mi) => {
        const isOpen = open.has(m.id);
        const mDone = m.lessons.filter((l) => done.has(l.id)).length;
        const complete = enr && mDone === m.lessons.length;
        const mins = Math.round(m.lessons.reduce((s, l) => s + (l.durationSec ?? 0), 0) / 60);
        return (
          <View key={m.id} style={[styles.module, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Pressable onPress={() => setOpen((s) => { const n = new Set(s); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} style={styles.moduleHead} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
              <View style={[styles.modIcon, { backgroundColor: complete ? c.successBg : enr ? c.primarySoft : c.surfaceMuted }]}>
                {complete ? <Ionicons name="checkmark" size={20} color={c.success} /> : <Txt variant="bodyStrong" color={c.primary}>{mi + 1}</Txt>}
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{m.title}</Txt>
                <Txt variant="caption" color={c.muted}>
                  {m.lessons.length} lessons · {mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`}
                  {enr ? ` · ${mDone}/${m.lessons.length} done` : ''}
                </Txt>
              </View>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={c.muted} />
            </Pressable>
            {isOpen &&
              m.lessons.map((l, li) => {
                const isDone = done.has(l.id);
                const isNext = !!enr && l.id === nextId;
                const locked = !enr && !l.preview;
                const [bg, fg] = tint[l.type];
                return (
                  <Pressable key={l.id} onPress={() => onOpen(l)} style={[styles.lesson, { borderTopColor: c.border }, isNext && { backgroundColor: c.primarySoft }]} accessibilityRole="button" accessibilityLabel={`${l.title}${isDone ? ', completed' : ''}${locked ? ', locked' : ''}`}>
                    <View style={[styles.lIcon, { backgroundColor: bg }]}>
                      <Ionicons name={icon[l.type]} size={16} color={fg} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="label" numberOfLines={2} style={{ fontWeight: isNext ? '700' : '600' }}>
                        {li + 1}. {l.title}
                      </Txt>
                      <Txt variant="caption" color={c.muted}>
                        {l.type === 'video' ? `Video · ${fmtDur(l.durationSec)}` : l.type === 'pdf' ? `PDF · ${l.sizeMb} MB` : `Quiz · ${l.questions} questions`}
                        {l.preview && !enr ? ' · Free preview' : ''}
                      </Txt>
                    </View>
                    {isDone ? (
                      <Ionicons name="checkmark-circle" size={24} color={c.success} />
                    ) : locked ? (
                      <Ionicons name="lock-closed-outline" size={20} color={c.muted} />
                    ) : l.preview && !enr ? (
                      <Pill text="Preview" tone="success" />
                    ) : (
                      <Ionicons name={isNext ? 'play-circle' : 'ellipse-outline'} size={24} color={isNext ? c.primary : c.borderStrong} />
                    )}
                  </Pressable>
                );
              })}
          </View>
        );
      })}
    </View>
  );
}

function LiveList({ course, userId, enrolled, onToast }: { course: Course; userId: string; enrolled: boolean; onToast: (t: string) => void }) {
  const { c } = useTheme();
  const [, force] = useState(0);
  const items = liveApi.forCourse(course.id, userId).filter((x) => sessionStatus(x.session.startsAt, x.session.endsAt).state !== 'ended');
  if (!items.length)
    return (
      <Txt color={c.muted} center style={{ paddingVertical: 30 }}>
        No live classes are scheduled for this course right now.
      </Txt>
    );
  return (
    <View style={{ gap: 10 }}>
      {!enrolled && <Txt variant="label" color={c.muted}>Live classes are included when you enroll.</Txt>}
      {items.map(({ session: s, registered }) => {
        const d = dateParts(s.startsAt);
        const st = sessionStatus(s.startsAt, s.endsAt);
        return (
          <View key={s.id} style={[styles.liveRow, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.date, { backgroundColor: c.primarySoft }]}>
              <Txt variant="caption" color={c.inkSoft}>{d.month}</Txt>
              <Txt variant="title" color={c.primaryDeep} style={{ lineHeight: 28 }}>{d.day}</Txt>
              <Txt variant="caption" color={c.inkSoft}>{d.weekday}</Txt>
            </View>
            <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
              <Txt variant="bodyStrong" numberOfLines={2}>{s.title}</Txt>
              <Txt variant="caption" color={c.muted}>{dayLabel(s.startsAt)} · {timeRange(s.startsAt, s.endsAt)}</Txt>
              <Txt variant="caption" color={st.state === 'live' ? c.live : c.info} style={{ fontWeight: '700' }}>{st.label}</Txt>
            </View>
            {enrolled && (
              <Pressable
                onPress={async () => { const on = await liveApi.toggleReminder(userId, s.id); force((x) => x + 1); onToast(on ? 'We’ll remind you 15 minutes before.' : 'Reminder removed'); }}
                accessibilityRole="button"
                style={[styles.remind, { borderColor: registered ? c.success : c.primary, backgroundColor: registered ? c.successBg : c.surface }]}
              >
                <Ionicons name={registered ? 'checkmark' : 'notifications-outline'} size={16} color={registered ? c.success : c.primary} />
                <Txt variant="caption" color={registered ? c.success : c.primary} style={{ fontWeight: '700' }}>
                  {registered ? 'Reminder on' : 'Remind me'}
                </Txt>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

type ReviewData = Awaited<ReturnType<typeof reviewsApi.list>>;
function Reviews({ data, enrolled, hasMine, onWrite }: { data: ReviewData; enrolled: boolean; hasMine: boolean; onWrite: () => void }) {
  const { c } = useTheme();
  const [sort, setSort] = useState<'recent' | 'high' | 'low'>('recent');
  const list = useMemo(() => {
    const l = [...data.list];
    if (sort === 'high') l.sort((a, b) => b.rating - a.rating);
    if (sort === 'low') l.sort((a, b) => a.rating - b.rating);
    return l;
  }, [data.list, sort]);

  return (
    <View style={{ gap: 14 }}>
      <View style={[styles.summary, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={{ alignItems: 'center', width: 104 }}>
          <Txt variant="display" style={{ fontSize: 44, lineHeight: 50 }}>{data.avg.toFixed(1)}</Txt>
          <View style={{ flexDirection: 'row' }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Ionicons key={s} name={data.avg >= s ? 'star' : data.avg >= s - 0.5 ? 'star-half' : 'star-outline'} size={15} color="#F5A524" />
            ))}
          </View>
          <Txt variant="caption" color={c.muted} style={{ marginTop: 4 }}>{data.count.toLocaleString('en-IN')} reviews</Txt>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          {data.split.map((r) => (
            <View key={r.stars} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Txt variant="caption" style={{ width: 10 }}>{r.stars}</Txt>
              <Ionicons name="star" size={11} color="#F5A524" />
              <ProgressBar pct={r.pct} color="#F5A524" height={7} />
              <Txt variant="caption" color={c.muted} style={{ width: 32, textAlign: 'right' }}>{r.pct}%</Txt>
            </View>
          ))}
        </View>
      </View>

      {enrolled ? (
        <Button title={hasMine ? 'Edit your review' : 'Write a review'} iconLeft="create-outline" variant="outline" onPress={onWrite} />
      ) : (
        <Txt variant="caption" color={c.muted} center>Only enrolled learners can write reviews.</Txt>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['recent', 'high', 'low'] as const).map((s) => (
          <Pressable key={s} onPress={() => setSort(s)} style={[styles.sortChip, { borderColor: sort === s ? c.primary : c.border, backgroundColor: sort === s ? c.primarySoft : c.surface }]} accessibilityRole="button" accessibilityState={{ selected: sort === s }}>
            <Txt variant="caption" color={sort === s ? c.primary : c.inkSoft} style={{ fontWeight: '700' }}>
              {{ recent: 'Most recent', high: 'Highest', low: 'Lowest' }[s]}
            </Txt>
          </Pressable>
        ))}
      </View>

      {list.map((r) => (
        <View key={r.id} style={[styles.review, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Avatar name={r.userName} size={38} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{r.userName}</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ flexDirection: 'row' }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Ionicons key={s} name={s <= r.rating ? 'star' : 'star-outline'} size={12} color="#F5A524" />
                  ))}
                </View>
                <Txt variant="caption" color={c.muted}>{relDays(r.createdAt)}</Txt>
              </View>
            </View>
          </View>
          <Txt color={c.inkSoft}>{r.text}</Txt>
          {r.tags.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {r.tags.map((t) => <Pill key={t} text={t} />)}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const relDays = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 7 ? `${d} days ago` : d < 30 ? `${Math.floor(d / 7)} week${d < 14 ? '' : 's'} ago` : new Date(iso).toLocaleDateString('en-IN');
};

const styles = StyleSheet.create({
  buyCard: { width: 380, borderWidth: 1, borderRadius: 24, overflow: 'hidden', shadowColor: '#0B2A55', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  includes: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 10 },
  pad: { paddingHorizontal: 20, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 14, minHeight: 40, borderRadius: radius.pill },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tutor: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, marginTop: 14 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg, borderWidth: 1, marginTop: 10 },
  tabsWrap: { paddingVertical: 10, alignItems: 'center' },
  tabs: { gap: 8, paddingHorizontal: 20 },
  tab: { paddingHorizontal: 18, minHeight: 42, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1.2 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: '30%', alignItems: 'center', gap: 2, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1 },
  card: { padding: 16, borderRadius: radius.lg, borderWidth: 1, gap: 10 },
  outcome: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  kv: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  module: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  moduleHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 64 },
  modIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  lesson: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 58, borderTopWidth: 1 },
  lIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1 },
  date: { width: 60, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center' },
  remind: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 40, borderRadius: radius.pill, borderWidth: 1.2 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 1 },
  sortChip: { paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1.2 },
  review: { padding: 14, borderRadius: radius.lg, borderWidth: 1, gap: 8 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, alignItems: 'center' },
  barInner: { width: '100%', maxWidth: layout.contentMaxWidth, flexDirection: 'row', alignItems: 'center', gap: 14 },
  toast: { position: 'absolute', bottom: 100, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.pill, maxWidth: '90%' },
  lockIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
