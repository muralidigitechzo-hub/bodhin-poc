/** Offline downloads: storage meter, grouped by course, play or remove. */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { downloads } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { BottomSheet, IconButton, ProgressBar } from '@/ui/kit';
import { CourseArt } from '@/ui/course';

const DEVICE_FREE_MB = 8200; // POC: real value from expo-file-system getFreeDiskStorageAsync()
const fmtMb = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`);

export default function Downloads() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [data, setData] = useState(() => downloads.list(userId));
  const [confirm, setConfirm] = useState<null | { label: string; ids: string[] }>(null);
  useFocusEffect(useCallback(() => setData(downloads.list(userId)), [userId]));

  const remove = () => {
    if (!confirm) return;
    downloads.remove(userId, confirm.ids);
    setData(downloads.list(userId));
    setConfirm(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.inner}>
            <View style={styles.top}>
              <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
            </View>
            <TwoTone lead="My" accent="Downloads" variant="title" />
            <Txt color={c.inkSoft} style={{ marginBottom: 14 }}>Lessons saved on this phone. They play without internet.</Txt>

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="bodyStrong">Storage used by Bodhin</Txt>
                <Txt variant="bodyStrong" color={c.primary}>{fmtMb(data.usedMb)}</Txt>
              </View>
              <View style={{ flexDirection: 'row' }}>
                <ProgressBar pct={Math.max(1, (data.usedMb / (DEVICE_FREE_MB + data.usedMb)) * 100)} color={c.primary} height={8} />
              </View>
              <Txt variant="caption" color={c.muted}>{fmtMb(DEVICE_FREE_MB)} free on this device</Txt>
            </View>

            {data.groups.length === 0 ? (
              <View style={styles.empty}>
                <View style={[styles.emptyIcon, { backgroundColor: c.primarySoft }]}>
                  <Ionicons name="cloud-download-outline" size={36} color={c.primary} />
                </View>
                <Txt variant="heading" center>No downloads yet</Txt>
                <Txt color={c.muted} center>Tap “Download” under any lesson to watch it later without internet.</Txt>
                <Button title="Go to My Learning" variant="outline" size="md" onPress={() => router.navigate('/learning')} />
              </View>
            ) : (
              data.groups.map((g) => (
                <View key={g.course.id} style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <View style={styles.gHead}>
                    <View style={{ width: 64 }}>
                      <CourseArt course={g.course} height={48} rounded={10} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="bodyStrong" numberOfLines={1}>{g.course.title}</Txt>
                      <Txt variant="caption" color={c.muted}>{g.items.length} lesson{g.items.length > 1 ? 's' : ''} · {fmtMb(g.items.reduce((s, i) => s + i.sizeMb, 0))}</Txt>
                    </View>
                    <IconButton icon="trash-outline" label={`Remove all downloads for ${g.course.title}`} onPress={() => setConfirm({ label: `all ${g.items.length} lessons of ${g.course.title}`, ids: g.items.map((i) => i.lesson.id) })} />
                  </View>
                  {g.items.map((i) => (
                    <Pressable key={i.lesson.id} onPress={() => router.push({ pathname: '/learn/[courseId]', params: { courseId: g.course.id, lesson: i.lesson.id } })} style={[styles.item, { borderTopColor: c.border }]} accessibilityRole="button" accessibilityLabel={`Play ${i.lesson.title} offline`}>
                      <View style={[styles.play, { backgroundColor: c.primarySoft }]}>
                        <Ionicons name={i.lesson.type === 'pdf' ? 'document-text' : 'play'} size={16} color={c.primary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt variant="label" numberOfLines={1}>{i.lesson.title}</Txt>
                        <Txt variant="caption" color={c.muted}>{i.quality === 'hd' ? '720p' : '480p'} · {fmtMb(i.sizeMb)}</Txt>
                      </View>
                      <IconButton icon="close-circle-outline" label={`Remove ${i.lesson.title}`} onPress={() => setConfirm({ label: i.lesson.title, ids: [i.lesson.id] })} />
                    </Pressable>
                  ))}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Remove download?"
        footer={
          <>
            <Button title="Keep" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setConfirm(null)} />
            <Button title="Remove" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={remove} />
          </>
        }
      >
        <Txt color={c.inkSoft}>This frees space on your phone. You can download {confirm?.label} again any time while your enrolment is active.</Txt>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  top: { paddingVertical: 8 },
  card: { padding: 16, borderRadius: radius.lg, borderWidth: 1, gap: 10 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  emptyIcon: { width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  group: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  gHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, paddingRight: 4, minHeight: 60, borderTopWidth: 1 },
  play: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
