/** Notifications: grouped by day, unread highlighted, tap opens the related screen. */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { notifications } from '@/api/client';
import { dayLabel } from '@/core/time';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { IconButton } from '@/ui/kit';

const KIND = {
  live: ['radio', '#E5383B'],
  grade: ['star', '#15803D'],
  course: ['book', '#1D5FD0'],
  payment: ['card', '#7C3AED'],
  qa: ['chatbubbles', '#B7791F'],
  system: ['ribbon', '#0B3B73'],
} as const;

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export default function Notifications() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [list, setList] = useState(() => notifications.list(userId));
  useFocusEffect(useCallback(() => setList(notifications.list(userId)), [userId]));
  const unread = list.filter((n) => !n.read).length;

  const groups = list.reduce<[string, typeof list][]>((acc, n) => {
    const k = dayLabel(n.at);
    const g = acc.find(([x]) => x === k);
    g ? g[1].push(n) : acc.push([k === 'Today' || k === 'Tomorrow' ? k : 'Earlier', [n]]);
    return acc;
  }, []);
  const merged = groups.reduce<[string, typeof list][]>((acc, [k, items]) => {
    const g = acc.find(([x]) => x === k);
    g ? g[1].push(...items) : acc.push([k, [...items]]);
    return acc;
  }, []);

  const open = (n: (typeof list)[number]) => {
    notifications.markRead(userId, n.id);
    setList(notifications.list(userId));
    if (n.link) router.push(n.link as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.inner}>
            <View style={styles.top}>
              <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
              {unread > 0 && (
                <Pressable onPress={() => { notifications.markRead(userId); setList(notifications.list(userId)); }} hitSlop={10} style={styles.markAll} accessibilityRole="button">
                  <Ionicons name="checkmark-done" size={18} color={c.primary} />
                  <Txt variant="label" color={c.primary}>Mark all read</Txt>
                </Pressable>
              )}
            </View>
            <TwoTone lead="Your" accent="Notifications" variant="title" />
            <Txt color={c.inkSoft}>{unread ? `${unread} unread` : 'You’re all caught up.'}</Txt>

            {list.length === 0 && (
              <View style={{ alignItems: 'center', gap: 8, paddingVertical: 40 }}>
                <Ionicons name="notifications-off-outline" size={36} color={c.muted} />
                <Txt color={c.muted}>No notifications yet.</Txt>
              </View>
            )}

            {merged.map(([k, items]) => (
              <View key={k} style={{ gap: 8 }}>
                <Txt variant="label" color={c.muted} style={{ marginTop: 8 }}>{k.toUpperCase()}</Txt>
                {items.map((n) => {
                  const [icon, col] = KIND[n.kind];
                  return (
                    <Pressable key={n.id} onPress={() => open(n)} style={({ pressed }) => [styles.item, { backgroundColor: n.read ? c.surface : c.primarySoft, borderColor: n.read ? c.border : c.primary }, pressed && { opacity: 0.9 }]} accessibilityRole="button" accessibilityLabel={`${n.read ? '' : 'Unread. '}${n.title}. ${n.body}`}>
                      <View style={[styles.icon, { backgroundColor: col }]}>
                        <Ionicons name={icon} size={20} color="#fff" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Txt variant="bodyStrong">{n.title}</Txt>
                        <Txt variant="label" color={c.inkSoft} style={{ fontWeight: '400' }}>{n.body}</Txt>
                        <Txt variant="caption" color={c.muted}>{ago(n.at)}</Txt>
                      </View>
                      {!n.read && <View style={[styles.dot, { backgroundColor: c.primary }]} />}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  markAll: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  item: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
});
