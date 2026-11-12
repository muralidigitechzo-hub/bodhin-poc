import React, { useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { BrandLogo } from '@/ui/Brand';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';

const hero = require('../../../assets/brand/onboard-hero.jpg');

type Slide = { key: string; lead: string; accent: string; body: string; icons?: (keyof typeof Ionicons.glyphMap)[] };
const SLIDES: Slide[] = [
  { key: 'a', lead: 'Learn. Teach.', accent: 'Grow.', body: 'A unified learning platform for students, educators and institutions.' },
  { key: 'b', lead: 'Learn', accent: 'anywhere.', body: 'Recorded lessons, notes and quizzes in your pocket. Download and keep learning offline.', icons: ['play-circle', 'download', 'document-text'] },
  { key: 'c', lead: 'Live with', accent: 'mentors.', body: 'Join live classes, raise your hand and get your doubts cleared in real time.', icons: ['videocam', 'hand-left', 'chatbubbles'] },
  { key: 'd', lead: 'Earn real', accent: 'certificates.', body: 'Finish courses, pass assessments and share verified certificates with employers.', icons: ['ribbon', 'trophy', 'shield-checkmark'] },
];

export default function Onboarding() {
  const { c } = useTheme();
  const { markOnboarded } = useAuth();
  const { width: winW } = useWindowDimensions();
  const width = Math.min(winW, layout.authMaxWidth + 40);
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<Slide>>(null);

  const go = (path: '/sign-up' | '/sign-in') => {
    markOnboarded();
    router.replace(path);
  };

  return (
    <Screen
      scroll={false}
      contentStyle={{ alignItems: 'center' }}
      footer={
        <>
          <View style={styles.dots} accessibilityRole="tablist">
            {SLIDES.map((s, i) => (
              <Pressable key={s.key} onPress={() => list.current?.scrollToIndex({ index: i })} hitSlop={10} accessibilityRole="tab" accessibilityState={{ selected: i === index }} accessibilityLabel={`Slide ${i + 1}`}>
                <View style={[styles.dot, { backgroundColor: i === index ? c.primary : c.borderStrong, width: i === index ? 22 : 8 }]} />
              </Pressable>
            ))}
          </View>
          <Button title="Get Started" iconRight="arrow-forward" onPress={() => go('/sign-up')} />
          <Button title="I already have an account · Sign In" variant="outline" onPress={() => go('/sign-in')} />
        </>
      }
    >
      <View style={styles.top}>
        <BrandLogo size="md" />
        <Pressable onPress={() => go('/sign-in')} hitSlop={12} accessibilityRole="button" style={styles.skip}>
          <Txt variant="label" color={c.muted}>
            Skip
          </Txt>
        </Pressable>
      </View>

      <FlatList
        ref={list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ width, flexGrow: 0, marginHorizontal: -20 }}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        onScroll={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== index) setIndex(i);
        }}
        scrollEventThrottle={32}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <TwoTone lead={item.lead} accent={item.accent} center />
            <Txt center color={c.inkSoft} style={{ marginTop: 10, maxWidth: 340 }}>
              {item.body}
            </Txt>
            <View style={styles.art}>
              {item.icons ? (
                <View style={[styles.iconStage, { backgroundColor: c.primarySoft }]}>
                  <View style={[styles.bigIcon, { backgroundColor: c.primary }]}>
                    <Ionicons name={item.icons[0]} size={64} color="#fff" />
                  </View>
                  <View style={[styles.chip, { top: 18, left: 8, backgroundColor: c.surface }]}>
                    <Ionicons name={item.icons[1]} size={28} color={c.accent} />
                  </View>
                  <View style={[styles.chip, { bottom: 18, right: 8, backgroundColor: c.surface }]}>
                    <Ionicons name={item.icons[2]} size={28} color={c.primary} />
                  </View>
                </View>
              ) : (
                <Image source={hero} style={styles.hero} resizeMode="contain" accessibilityLabel="Students learning on Bodhin" />
              )}
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { width: '100%', alignItems: 'center', paddingVertical: 12 },
  skip: { position: 'absolute', right: 0, top: 22, minHeight: 32, justifyContent: 'center' },
  slide: { paddingHorizontal: 20, paddingTop: 18, alignItems: 'center' },
  art: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', marginTop: 16, minHeight: 240 },
  hero: { width: '100%', aspectRatio: 800 / 524 },
  iconStage: { width: 240, height: 240, borderRadius: 120, alignItems: 'center', justifyContent: 'center' },
  bigIcon: { width: 128, height: 128, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  chip: { position: 'absolute', width: 64, height: 64, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B2A55', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  dot: { height: 8, borderRadius: 4 },
});
