/** Grading queue: oldest submissions first, filter by assignment, To grade · Graded · Returned. */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { grading, type QueueFilter } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, Chip, IconButton, Pill, Skeleton } from '@/ui/kit';

type Data = Awaited<ReturnType<typeof grading.queue>>;
const ago = (iso?: string) => {
  if (!iso) return '';
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  return h < 1 ? 'just now' : h < 24 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago`;
};

export default function GradingQueue() {
  const p = useLocalSearchParams<{ assessmentId?: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [filter, setFilter] = useState<QueueFilter>('to_grade');
  const [asg, setAsg] = useState<string | undefined>(p.assessmentId || undefined);
  const [data, setData] = useState<Data | null>(null);
  useFocusEffect(useCallback(() => { grading.queue(userId, filter, asg).then(setData); }, [userId, filter, asg]));

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/educator/home'))} />
          <Txt variant="heading" style={{ flex: 1 }}>Grade assignments</Txt>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Chip label={`To grade (${data?.counts.to_grade ?? '…'})`} active={filter === 'to_grade'} onPress={() => setFilter('to_grade')} />
              <Chip label={`Graded (${data?.counts.graded ?? '…'})`} active={filter === 'graded'} onPress={() => setFilter('graded')} />
              <Chip label={`Returned (${data?.counts.returned ?? '…'})`} active={filter === 'returned'} onPress={() => setFilter('returned')} />
            </View>
            {!!data?.byAssignment.length && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Chip label="All assignments" active={!asg} onPress={() => setAsg(undefined)} />
                {data.byAssignment.map((x) => <Chip key={x.a.id} label={`${x.a.title.length > 24 ? `${x.a.title.slice(0, 23)}…` : x.a.title} · ${x.count}`} active={asg === x.a.id} onPress={() => setAsg(x.a.id)} />)}
              </ScrollView>
            )}
            {!data ? <View style={{ gap: 8 }}><Skeleton h={68} /><Skeleton h={68} /><Skeleton h={68} /></View> : data.rows.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Ionicons name={filter === 'to_grade' ? 'checkmark-done-circle-outline' : 'file-tray-outline'} size={36} color={filter === 'to_grade' ? c.success : c.muted} />
                <Txt color={c.muted} center>{filter === 'to_grade' ? 'All caught up — nothing waiting to be graded.' : 'Nothing here yet.'}</Txt>
              </View>
            ) : (
              <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
                {data.rows.map((r, i) => (
                  <Pressable key={r.s.id} onPress={() => router.push({ pathname: '/edu/grade/[id]', params: { id: r.s.id } })} style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={`${r.name}, ${r.a.title}`}>
                    <Avatar name={r.name} size={40} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Txt variant="bodyStrong" numberOfLines={1}>{r.name}</Txt>
                      <Txt variant="caption" color={c.muted} numberOfLines={1}>{r.a.title}</Txt>
                      <Txt variant="caption" color={c.inkSoft}>{filter === 'returned' ? `Returned ${ago(r.s.updatedAt)}` : `Submitted ${ago(r.s.submittedAt)}`} · {r.s.files.length ? `${r.s.files.length} file${r.s.files.length > 1 ? 's' : ''}` : 'Link'}</Txt>
                    </View>
                    {r.late && <View><Pill text="Late" tone="warning" /></View>}
                    {r.s.grade ? <View><Pill text={`${r.s.grade.pct}%`} tone="success" /></View> : <Ionicons name="chevron-forward" size={18} color={c.muted} />}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
        {filter === 'to_grade' && !!data?.rows.length && (
          <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
            <Button title={`Start grading · ${data.rows.length}`} iconLeft="play" onPress={() => router.push({ pathname: '/edu/grade/[id]', params: { id: data.rows[0].s.id } })} style={{ width: '100%', maxWidth: layout.contentMaxWidth }} />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 24 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  list: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 72 },
  empty: { borderWidth: 1, borderRadius: 18, padding: 28, alignItems: 'center', gap: 8 },
  footer: { borderTopWidth: 1, padding: 12, alignItems: 'center' },
});
