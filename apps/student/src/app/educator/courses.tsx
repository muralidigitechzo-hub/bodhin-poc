/** Educator › Courses: lifecycle filters, search, performance per course, actions in a bottom sheet. */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, courseAdmin, educator, type CourseState } from '@/api/client';
import { inr } from '@/core/catalog';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { AppHeader, BottomSheet, Chip, Pill, ProgressBar, Skeleton, useAsync } from '@/ui/kit';
import { CourseArt } from '@/ui/course';
import { Banner } from '@/ui/misc';
import { STATE_META } from '@/ui/courseState';

type Row = Awaited<ReturnType<typeof courseAdmin.list>>[number];
type Filter = 'all' | 'live' | 'draft' | 'review';
const FILTERS: { id: Filter; label: string; match: (s: CourseState) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'live', label: 'Published', match: (s) => s !== 'draft' && s !== 'archived' },
  { id: 'draft', label: 'Drafts', match: (s) => s === 'draft' },
  { id: 'review', label: 'In review', match: (s) => s === 'in_review' || s === 'changes' },
];

export default function EducatorCourses() {
  const { isDesktop } = useLayout();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const owner = educator.context(userId)?.role === 'owner';
  const { data, loading, reload } = useAsync(() => courseAdmin.list(userId), [userId]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Row | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const cols = width >= 900;

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    const t = q.trim().toLowerCase();
    return (data ?? []).filter((r) => f.match(r.state) && (!t || r.course.title.toLowerCase().includes(t)));
  }, [data, filter, q]);

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2400);
  };
  const create = () => {
    try {
      const id = courseAdmin.create(userId);
      router.push({ pathname: '/edu/course/[id]', params: { id } });
    } catch (e) {
      flash((e as ApiError).message);
    }
  };
  const act = (fn: () => void, msg: string) => {
    try {
      fn();
      setSel(null);
      reload();
      flash(msg);
    } catch (e) {
      flash((e as ApiError).message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={false} onRefresh={() => { reload(); }} />} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={[styles.inner, cols && { maxWidth: 1080 }]}>
            <AppHeader profileHref="/educator/more" action={owner ? { title: 'New course', onPress: create } : undefined} />
            <View style={{ marginTop: 10, marginBottom: 12 }}>
              <TwoTone lead="My" accent="Courses" variant="title" />
              <Txt color={c.inkSoft}>{owner ? 'Create, publish and choose where each course is sold.' : 'Courses assigned to you. You can edit lessons; the owner manages pricing.'}</Txt>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
              {FILTERS.map((f) => (
                <Chip key={f.id} label={`${f.label} (${(data ?? []).filter((r) => f.match(r.state)).length})`} active={filter === f.id} onPress={() => setFilter(f.id)} />
              ))}
            </ScrollView>

            <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Ionicons name="search" size={20} color={c.inkSoft} />
              <TextInput value={q} onChangeText={setQ} placeholder="Search your courses" placeholderTextColor={c.muted} accessibilityLabel="Search your courses" style={[styles.searchInput, { color: c.ink }]} />
            </View>

            {!data || loading ? (
              <View style={{ gap: 10 }}>
                <Skeleton h={150} r={18} />
                <Skeleton h={150} r={18} />
              </View>
            ) : rows.length === 0 ? (
              <View style={{ alignItems: 'center', gap: 10, paddingVertical: 40 }}>
                <Ionicons name="layers-outline" size={40} color={c.muted} />
                <Txt variant="bodyStrong">{data.length ? 'No courses match' : 'Create your first course'}</Txt>
                <Txt color={c.muted} center>{data.length ? 'Try another filter or search.' : 'Add lessons, set a price and publish in four steps.'}</Txt>
                {owner && !data.length && <Button title="New course" iconLeft="add" size="md" onPress={create} />}
              </View>
            ) : (
              <View style={cols ? styles.grid : { gap: 12 }}>
                {rows.map((r) => {
                  const m = STATE_META[r.state];
                  return (
                    <Pressable key={r.course.id} onPress={() => setSel(r)} style={({ pressed }) => [styles.card, { backgroundColor: c.surface, borderColor: c.border }, cols && { flexBasis: '48%', flexGrow: 1 }, pressed && { opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={`${r.course.title || 'Untitled course'}, ${m.label}`}>
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        <View style={{ width: 104 }}>
                          <CourseArt course={r.course} height={78} rounded={radius.md} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                          <Pill text={m.label} tone={m.tone} icon={m.icon as any} />
                          <Txt variant="bodyStrong" numberOfLines={2}>{r.course.title || 'Untitled course'}</Txt>
                          <Txt variant="caption" color={c.muted}>{r.lessons} lessons · updated {new Date(r.course.updatedAt ?? r.course.publishedAt ?? Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Txt>
                        </View>
                        <Ionicons name="ellipsis-vertical" size={20} color={c.muted} />
                      </View>
                      {r.state !== 'draft' && (
                        <View style={[styles.stats, { borderTopColor: c.border }]}>
                          <Stat icon="people-outline" v={r.students.toLocaleString('en-IN')} l="Students" />
                          <View style={{ flex: 1.3, gap: 4 }}>
                            <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                              <Ionicons name="checkmark-done-outline" size={15} color={c.muted} />
                              <Txt variant="label">{r.completion}%</Txt>
                            </View>
                            <View style={{ flexDirection: 'row' }}><ProgressBar pct={r.completion} height={5} /></View>
                          </View>
                          {owner && <Stat icon="wallet-outline" v={`₹${r.revenue.toLocaleString('en-IN')}`} l="Earned" />}
                        </View>
                      )}
                      {r.state === 'draft' && (
                        <Pressable onPress={() => router.push({ pathname: '/edu/course/[id]', params: { id: r.course.id } })} style={[styles.continue, { backgroundColor: c.primarySoft }]} accessibilityRole="button">
                          <Ionicons name="create-outline" size={18} color={c.primary} />
                          <Txt variant="label" color={c.primary} style={{ flex: 1 }}>Continue editing</Txt>
                          <Ionicons name="chevron-forward" size={18} color={c.primary} />
                        </Pressable>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

        {owner && !isDesktop && (
          <Pressable onPress={create} style={[styles.fab, { backgroundColor: c.primary }]} accessibilityRole="button" accessibilityLabel="New course">
            <Ionicons name="add" size={26} color="#fff" />
            <Txt variant="bodyStrong" color="#fff">New course</Txt>
          </Pressable>
        )}
        {toast && (
          <View style={[styles.toast, { backgroundColor: c.ink }]} accessibilityLiveRegion="polite">
            <Txt variant="label" color="#fff" center>{toast}</Txt>
          </View>
        )}
      </SafeAreaView>

      <BottomSheet open={!!sel && !confirmArchive} onClose={() => setSel(null)} title={sel?.course.title || 'Untitled course'}>
        {sel && (
          <>
            <View style={[styles.stateBox, { backgroundColor: c.surfaceMuted }]}>
              <Pill text={STATE_META[sel.state].label} tone={STATE_META[sel.state].tone} icon={STATE_META[sel.state].icon as any} />
              <Txt variant="label" color={c.inkSoft} style={{ fontWeight: '500' }}>{STATE_META[sel.state].help}</Txt>
            </View>
            {sel.state === 'changes' && sel.course.moderationNote && <Banner tone="danger" text={`Bodhin: ${sel.course.moderationNote}`} />}
            <View style={{ gap: 2 }}>
              <SheetRow icon="create-outline" label={sel.state === 'draft' ? 'Continue editing' : 'Edit course'} onPress={() => { setSel(null); router.push({ pathname: '/edu/course/[id]', params: { id: sel.course.id } }); }} />
              <SheetRow icon="eye-outline" label="Preview as a student" onPress={() => { setSel(null); router.push({ pathname: '/course/[id]', params: { id: sel.course.id } }); }} />
              {owner && sel.state !== 'draft' && (
                <>
                  {sel.course.visibility === 'private' ? (
                    <SheetRow icon="storefront-outline" label="List on Bodhin marketplace" sub="Bodhin reviews it first. Marketplace sales pay out after commission." onPress={() => act(() => courseAdmin.setListing(userId, sel.course.id, 'public'), 'Sent for marketplace review')} />
                  ) : (
                    <>
                      {sel.course.visibility === 'public' ? (
                        <SheetRow icon="megaphone-outline" label="Allow Bodhin promotion" sub="Featured placements, campaigns and newsletters" onPress={() => act(() => courseAdmin.setListing(userId, sel.course.id, 'public_promoted'), 'Promotion consent given')} />
                      ) : (
                        <SheetRow icon="megaphone-outline" label="Stop Bodhin promotion" sub="Stays listed; no future campaigns" onPress={() => act(() => courseAdmin.setListing(userId, sel.course.id, 'public'), 'Promotion consent withdrawn')} />
                      )}
                      <SheetRow icon="lock-closed-outline" label="Make private" sub="Removed from the marketplace. Your site keeps selling it." onPress={() => act(() => courseAdmin.setListing(userId, sel.course.id, 'private'), 'Course is now private')} />
                    </>
                  )}
                </>
              )}
              {owner && <SheetRow icon="copy-outline" label="Duplicate as draft" onPress={() => act(() => courseAdmin.duplicate(userId, sel.course.id), 'Copy created in Drafts')} />}
              {owner && <SheetRow icon="archive-outline" label={sel.state === 'draft' ? 'Delete draft' : 'Archive'} danger onPress={() => setConfirmArchive(true)} />}
            </View>
            {sel.state === 'in_review' && (
              <View style={[styles.demo, { borderColor: c.borderStrong }]}>
                <Txt variant="caption" color={c.muted}>POC ONLY — stands in for the Super Admin review queue (built later)</Txt>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Approve listing" size="md" style={{ flex: 1 }} onPress={() => act(() => courseAdmin.demoReview(sel.course.id, 'approve'), 'Approved — now on the marketplace')} />
                  <Button title="Ask for changes" size="md" variant="outline" style={{ flex: 1 }} onPress={() => act(() => courseAdmin.demoReview(sel.course.id, 'changes'), 'Bodhin asked for changes')} />
                </View>
              </View>
            )}
          </>
        )}
      </BottomSheet>

      <BottomSheet
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title={sel?.state === 'draft' ? 'Delete this draft?' : 'Archive this course?'}
        footer={
          <>
            <Button title="Keep" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setConfirmArchive(false)} />
            <Button title={sel?.state === 'draft' ? 'Delete' : 'Archive'} size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={() => { setConfirmArchive(false); sel && act(() => courseAdmin.archive(userId, sel.course.id), sel.state === 'draft' ? 'Draft deleted' : 'Course archived'); }} />
          </>
        }
      >
        <Txt color={c.inkSoft}>{sel?.state === 'draft' ? 'The draft and its lessons will be removed.' : 'New students can’t enroll. Everyone already enrolled keeps access until their access period ends.'}</Txt>
      </BottomSheet>
    </View>
  );
}

function Stat({ icon, v, l }: { icon: keyof typeof Ionicons.glyphMap; v: string; l: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        <Ionicons name={icon} size={15} color={c.muted} />
        <Txt variant="label" numberOfLines={1}>{v}</Txt>
      </View>
      <Txt variant="caption" color={c.muted}>{l}</Txt>
    </View>
  );
}

function SheetRow({ icon, label, sub, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void; danger?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.sheetRow} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={danger ? c.danger : c.primary} />
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong" color={danger ? c.danger : c.ink}>{label}</Txt>
        {sub && <Txt variant="caption" color={c.muted}>{sub}</Txt>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 110 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 50, borderRadius: radius.pill, borderWidth: 1 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, minHeight: 48, outlineStyle: 'none' } as any,
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { padding: 12, borderRadius: radius.lg, borderWidth: 1, gap: 12 },
  stats: { flexDirection: 'row', gap: 12, paddingTop: 10, borderTopWidth: 1, alignItems: 'flex-start' },
  continue: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 44, borderRadius: radius.md },
  fab: { position: 'absolute', right: 20, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, height: 56, borderRadius: 28, shadowColor: '#0B2A55', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  toast: { position: 'absolute', bottom: 86, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.pill, maxWidth: '90%' },
  stateBox: { padding: 12, borderRadius: radius.md, gap: 8 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 58, paddingVertical: 6 },
  demo: { borderWidth: 1.2, borderStyle: 'dashed', borderRadius: radius.md, padding: 12, gap: 8 },
});
