/** Assessments hub: quizzes, exams and assignments across the educator's courses, with grading shortcut. */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { assessAdmin } from '@/api/client';
import type { AssessKind } from '@/core/assess';
import { KIND_META } from '@/ui/assessMeta';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Chip, IconButton, Pill, Skeleton } from '@/ui/kit';

type Data = Awaited<ReturnType<typeof assessAdmin.list>>;

export default function AssessHub() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [data, setData] = useState<Data | null>(null);
  const [kind, setKind] = useState<AssessKind | 'all'>('all');
  const [courseId, setCourseId] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { assessAdmin.list(userId).then(setData); }, [userId]));

  const rows = (data?.rows ?? []).filter((r) => (kind === 'all' || r.a.kind === kind) && (!courseId || r.a.courseId === courseId));
  const count = (k: AssessKind) => (data?.rows ?? []).filter((r) => r.a.kind === k && (!courseId || r.a.courseId === courseId)).length;

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/educator/more'))} />
          <Txt variant="heading" style={{ flex: 1 }}>Quizzes & assignments</Txt>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            {!data ? (
              <View style={{ gap: 10 }}><Skeleton h={64} r={16} /><Skeleton h={80} /><Skeleton h={80} /></View>
            ) : (
              <>
                {data.toGrade > 0 && (
                  <Pressable onPress={() => router.push('/edu/grading')} style={[styles.grade, { backgroundColor: c.primaryDeep }]} accessibilityRole="button" accessibilityLabel={`${data.toGrade} submissions to grade`}>
                    <Ionicons name="document-text" size={22} color="#E8A21B" />
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong" color="#fff">{data.toGrade} submission{data.toGrade === 1 ? '' : 's'} to grade</Txt>
                      <Txt variant="caption" color="rgba(255,255,255,0.75)">Oldest first · rubric scoring</Txt>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#fff" />
                  </Pressable>
                )}
                {data.courses.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    <Chip label="All courses" active={!courseId} onPress={() => setCourseId(null)} />
                    {data.courses.map((co) => <Chip key={co.id} label={co.title.length > 26 ? `${co.title.slice(0, 25)}…` : co.title} active={courseId === co.id} onPress={() => setCourseId(co.id)} />)}
                  </ScrollView>
                )}
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <Chip label="All" active={kind === 'all'} onPress={() => setKind('all')} />
                  {(['quiz', 'exam', 'assignment'] as const).map((k) => <Chip key={k} label={`${KIND_META[k].label}s (${count(k)})`} active={kind === k} onPress={() => setKind(k)} />)}
                </View>
                {rows.length === 0 && (
                  <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <Ionicons name="clipboard-outline" size={34} color={c.muted} />
                    <Txt color={c.muted} center>Nothing here yet. Tap “Create” to add a quiz, exam or assignment.</Txt>
                  </View>
                )}
                <View style={{ gap: 10 }}>
                  {rows.map((r) => {
                    const m = KIND_META[r.a.kind];
                    const when = r.a.kind === 'assignment' && r.a.dueAt ? `Due ${new Date(r.a.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : r.a.kind === 'exam' && r.a.opensAt ? `Opens ${new Date(r.a.opensAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : r.a.lessonId ? 'In curriculum' : `${r.a.questionIds?.length ?? 0} questions`;
                    return (
                      <Pressable key={r.a.id} onPress={() => router.push({ pathname: '/edu/assess/[id]', params: { id: r.a.id } })} style={({ pressed }) => [styles.row, { backgroundColor: c.surface, borderColor: c.border }, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`${m.label}: ${r.a.title || 'Untitled'}`}>
                        <View style={[styles.icon, { backgroundColor: m.tint }]}><Ionicons name={m.icon} size={22} color={m.color} /></View>
                        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                            {r.status === 'draft' ? <Pill text="Draft" tone="neutral" /> : <Pill text={m.label} tone="info" />}
                            {r.toGrade > 0 && <Pill text={`${r.toGrade} to grade`} tone="warning" />}
                          </View>
                          <Txt variant="bodyStrong" numberOfLines={2}>{r.a.title || 'Untitled'}</Txt>
                          <Txt variant="caption" color={c.muted} numberOfLines={1}>{when} · {r.batch ? r.batch.code : 'All students'} · {r.course.title}</Txt>
                          {r.status === 'published' && (
                            <Txt variant="caption" color={c.inkSoft}>{r.responses}/{r.audience} {r.a.kind === 'assignment' ? 'submitted' : 'attempted'}{r.avg != null ? ` · avg ${r.avg}%` : ''}</Txt>
                          )}
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={c.muted} />
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        </ScrollView>
        <View style={styles.fabWrap} pointerEvents="box-none">
          <Button title="Create" iconLeft="add" style={styles.fab} onPress={() => router.push({ pathname: '/edu/assess/new', params: { courseId: courseId ?? '', kind: kind === 'all' ? '' : kind } })} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 110 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  grade: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, minHeight: 64 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 12 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: 1, borderRadius: 18, padding: 28, alignItems: 'center', gap: 8 },
  fabWrap: { position: 'absolute', right: 20, bottom: 18, left: 20, alignItems: 'flex-end' },
  fab: { paddingHorizontal: 22, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
});
