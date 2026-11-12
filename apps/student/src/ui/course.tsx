/** Course presentation components: artwork, cards, rows, rating. */
import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { FORMAT_LABEL, LEVEL_LABEL, compact, priceDisplay, type Course, type Tutor } from '@/core/catalog';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from './Txt';
import { Pill } from './kit';

export const openCourse = (id: string) => router.push({ pathname: '/course/[id]', params: { id } });

/** Generated course artwork (gradient + subject icon) until tutors upload thumbnails. */
export function CourseArt({ course, height = 120, showTitle = false, rounded = radius.lg, children }: { course: Course; height?: number; showTitle?: boolean; rounded?: number; children?: React.ReactNode }) {
  return (
    <LinearGradient colors={[course.art.from, course.art.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height, borderRadius: rounded, overflow: 'hidden', justifyContent: 'flex-end', padding: 12 }}>
      {course.art.image ? (
        <>
          <Image source={{ uri: course.art.image }} resizeMode="cover" style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />
          {showTitle && <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={StyleSheet.absoluteFill} />}
        </>
      ) : (
        <>
          <Ionicons name={course.art.icon as keyof typeof Ionicons.glyphMap} size={height * 0.62} color="rgba(255,255,255,0.18)" style={{ position: 'absolute', right: -height * 0.06, top: height * 0.08 }} />
          <View style={[styles.glow, { width: height * 1.4, height: height * 1.4, borderRadius: height, right: -height * 0.5, top: -height * 0.6 }]} />
        </>
      )}
      {showTitle && (
        <Txt variant="bodyStrong" color="#fff" numberOfLines={3} style={{ maxWidth: '72%', fontSize: 14, lineHeight: 18 }}>
          {course.title}
        </Txt>
      )}
      {children}
    </LinearGradient>
  );
}

export function BadgeFor({ course }: { course: Course }) {
  if (!course.badge) return null;
  const m = { bestseller: ['Bestseller', 'gold', 'trophy'], new: ['New', 'success', 'sparkles'], trending: ['Trending', 'info', 'flame'] } as const;
  const [t, tone, icon] = m[course.badge];
  return <Pill text={t} tone={tone} icon={icon} />;
}

export function Rating({ value, count, size = 'sm' }: { value: number; count?: number; size?: 'sm' | 'md' }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel={`Rated ${value} out of 5${count ? ` by ${count} learners` : ''}`}>
      <Ionicons name="star" size={size === 'sm' ? 14 : 18} color="#F5A524" />
      <Txt variant={size === 'sm' ? 'label' : 'bodyStrong'}>{value.toFixed(1)}</Txt>
      {count != null && (
        <Txt variant={size === 'sm' ? 'caption' : 'label'} color={c.muted}>
          ({compact(count)})
        </Txt>
      )}
    </View>
  );
}

/** Price with honest offer display (strike only for a live dated offer). */
export function Price({ course, big }: { course: Course; big?: boolean }) {
  const { c } = useTheme();
  const p = priceDisplay(course);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
      <Txt variant={big ? 'title' : 'bodyStrong'} color={course.priceInr === 0 ? c.success : c.ink}>
        {p.price}
      </Txt>
      {p.compareAt && (
        <Txt variant="caption" color={c.muted} style={{ textDecorationLine: 'line-through' }}>
          {p.compareAt}
        </Txt>
      )}
    </View>
  );
}

/** Carousel card (fixed width) for Explore/Home rails. */
export function CourseCard({ course, tutor, width = 252 }: { course: Course; tutor: Tutor; width?: number | '100%' }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => openCourse(course.id)} accessibilityRole="button" accessibilityLabel={`${course.title} by ${tutor.name}`} style={({ pressed }) => [styles.card, { width, backgroundColor: c.surface, borderColor: c.border }, pressed && styles.pressed]}>
      <CourseArt course={course} height={118} rounded={radius.md}>
        <View style={{ position: 'absolute', top: 10, left: 10 }}>
          <BadgeFor course={course} />
        </View>
      </CourseArt>
      <View style={{ padding: 12, gap: 6, flex: 1 }}>
        <Txt variant="bodyStrong" numberOfLines={2} style={{ minHeight: 44 }}>
          {course.title}
        </Txt>
        <Txt variant="caption" color={c.muted} numberOfLines={1}>
          {tutor.name} · {FORMAT_LABEL[course.format]}
        </Txt>
        <View style={styles.cardFoot}>
          <Rating value={course.rating} count={course.ratingCount} />
          <Price course={course} />
        </View>
      </View>
    </Pressable>
  );
}

/** Full-width row for search results and lists. */
export function CourseRow({ course, tutor }: { course: Course; tutor: Tutor }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => openCourse(course.id)} accessibilityRole="button" accessibilityLabel={`${course.title} by ${tutor.name}`} style={({ pressed }) => [styles.row, { backgroundColor: c.surface, borderColor: c.border }, pressed && styles.pressed]}>
      <View style={{ width: 104 }}>
        <CourseArt course={course} height={104} rounded={radius.md} />
      </View>
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={2}>
          {course.title}
        </Txt>
        <Txt variant="caption" color={c.muted} numberOfLines={1}>
          {tutor.name} · {LEVEL_LABEL[course.level]}
        </Txt>
        <Txt variant="caption" color={c.muted} numberOfLines={1}>
          {FORMAT_LABEL[course.format]} · {compact(course.students)} learners
        </Txt>
        <View style={styles.cardFoot}>
          <Rating value={course.rating} count={course.ratingCount} />
          <Price course={course} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.08)' },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: 6, overflow: 'hidden' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 4, gap: 8 },
  row: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
});
