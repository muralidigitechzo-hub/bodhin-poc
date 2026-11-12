/**
 * Video insights for one course: every video lesson with how many learners watched and finished it,
 * and the drop-off of the selected lesson. Owners see their workspace, tutors only their assigned courses.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { insights } from '@/api/client';
import { mmss } from '@/core/watch';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Dropoff } from '@/ui/Dropoff';
import { IconButton, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';

export default function WatchInsights() {
  const { courseId, lessonId } = useLocalSearchParams<{ courseId: string; lessonId?: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [rev, setRev] = useState(0);
  useFocusEffect(React.useCallback(() => { setRev((r) => r + 1); }, []));
  const data = useMemo(() => insights.course(userId, courseId), [userId, courseId, rev]);
  const [picked, setPicked] = useState<string | undefined>(lessonId);

  if (!data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, justifyContent: 'center', gap: 16 }}>
        <Banner text="You can’t see insights for this course." />
        <Button title="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/educator/courses'))} />
      </SafeAreaView>
    );
  }
  const current = data.rows.find((r) => r.lesson.id === (picked ?? data.worstLessonId ?? data.rows.find((x) => x.analysis.status === 'ok')?.lesson.id)) ?? data.rows[0];

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/educator/courses'))} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="heading" numberOfLines={1}>Video insights</Txt>
            <Txt variant="caption" color={c.muted} numberOfLines={1}>{data.course.title}</Txt>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            {data.rows.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Ionicons name="videocam-outline" size={36} color={c.muted} />
                <Txt variant="bodyStrong" center>No video lessons yet</Txt>
                <Txt color={c.muted} center>Add recorded lessons to this course. Drop-off appears after learners watch them.</Txt>
              </View>
            ) : (
              <>
                {data.withData === 0 && <Banner tone="info" text="Charts appear for a video once 5 enrolled learners have watched it. Until then nothing is shown, so you never see guesses." />}
                <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
                  {data.rows.map((r, i) => {
                    const on = r.lesson.id === current.lesson.id;
                    const top = r.analysis.moments[0];
                    return (
                      <Pressable key={r.lesson.id} onPress={() => setPicked(r.lesson.id)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${r.lesson.title}, ${r.analysis.viewers} viewers`} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }, on && { backgroundColor: c.primarySoft }]}>
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Txt variant="bodyStrong" numberOfLines={2}>{r.lesson.title}</Txt>
                          <Txt variant="caption" color={c.muted} numberOfLines={1}>Module {r.moduleNo} · {mmss(r.durationSec)} · {r.analysis.viewers} viewer{r.analysis.viewers === 1 ? '' : 's'}{r.analysis.status === 'ok' ? ` · ${r.analysis.finishPct}% finished` : ''}</Txt>
                        </View>
                        {top ? <Pill text={`Drop at ${mmss(top.atSec)}`} tone="live" icon="trending-down" /> : r.analysis.status === 'ok' ? <Pill text="Healthy" tone="success" /> : <Pill text="Few views" tone="neutral" />}
                      </Pressable>
                    );
                  })}
                </View>
                <View style={[styles.detail, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <Txt variant="heading" numberOfLines={2}>{current.lesson.title}</Txt>
                  <Dropoff a={current.analysis} durationSec={current.durationSec} />
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 60 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  empty: { alignItems: 'center', gap: 8, padding: 28, borderWidth: 1, borderRadius: radius.lg },
  list: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, minHeight: 64 },
  detail: { borderWidth: 1, borderRadius: radius.lg, padding: 16, gap: 14 },
});
