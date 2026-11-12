/** Shown on any learner screen the moment a tutor starts a class the learner belongs to. */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { liveTab } from '@/api/client';
import { onRemoteChange } from '@/api/mockDb';
import { useAuth } from '@/store/auth';
import { Txt } from '@/ui/Txt';

type Item = ReturnType<typeof liveTab.startedNow>[number];
// screens where the banner would be in the way (the room itself, tutor and admin areas, sign-in)
const HIDDEN = ['/live-room', '/edu', '/educator', '/admin', '/sign', '/verify', '/forgot', '/onboarding', '/apply', '/application', '/checkout', '/learn', '/quiz'];

export function LiveStartBanner() {
  const { session, mode } = useAuth();
  const path = usePathname();
  const userId = session?.user.id ?? '';
  const [items, setItems] = useState<Item[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return setItems([]);
    const tick = () => setItems(liveTab.startedNow(userId));
    tick();
    const t = setInterval(tick, 4000);
    const off = onRemoteChange(tick);
    return () => { clearInterval(t); off(); };
  }, [userId]);

  const hide = path === '/' || HIDDEN.some((p) => path.startsWith(p)) || mode === 'educator';
  const first = items.find((i) => !dismissed.includes(i.session.id));
  if (!first || hide) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(first.startedAt).getTime()) / 6e4));
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <View style={styles.dot} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="label" color="#fff" numberOfLines={1}>{first.tutor.name} started “{first.session.title}”</Txt>
          <Txt variant="caption" color="rgba(255,255,255,0.75)" numberOfLines={1}>{first.course.title} · {mins < 1 ? 'just now' : `${mins} min ago`}</Txt>
        </View>
        <Pressable onPress={() => { setDismissed((d) => [...d, first.session.id]); router.push({ pathname: '/live-room/[id]', params: { id: first.session.id } }); }} style={styles.join} accessibilityRole="button" accessibilityLabel={`Join ${first.session.title}`}>
          <Txt variant="label" color="#0E1B33" style={{ fontWeight: '800' }}>Join</Txt>
        </Pressable>
        <Pressable onPress={() => setDismissed((d) => [...d, first.session.id])} style={styles.close} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Ionicons name="close" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center', zIndex: 1000, paddingHorizontal: 12 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', maxWidth: 560, backgroundColor: '#12407F', borderRadius: 16, paddingVertical: 10, paddingLeft: 14, paddingRight: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, elevation: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5383B' },
  join: { backgroundColor: '#FFD166', borderRadius: 999, paddingHorizontal: 16, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
