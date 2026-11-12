/** Create step: pick type and course, then open the builder. Pre-filled when launched from a course or lesson. */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { assessAdmin, educator } from '@/api/client';
import type { AssessKind } from '@/core/assess';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/kit';
import { KIND_META } from '@/ui/assessMeta';

const DESC: Record<AssessKind, string> = {
  quiz: 'Quick multiple-choice check after a lesson. Auto-scored, can allow retries.',
  exam: 'Timed test that opens at a set date & time. One attempt by default.',
  assignment: 'Students upload a file or link. You grade with a rubric and feedback.',
};

export default function NewAssessment() {
  const p = useLocalSearchParams<{ kind?: string; courseId?: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const courses = educator.courses(userId);
  const [kind, setKind] = useState<AssessKind | null>((['quiz', 'exam', 'assignment'] as const).find((k) => k === p.kind) ?? null);
  const [courseId, setCourseId] = useState<string | null>(courses.find((x) => x.id === p.courseId)?.id ?? (courses.length === 1 ? courses[0].id : null));
  const go = (k = kind, co = courseId) => {
    if (!k || !co) return;
    router.replace({ pathname: '/edu/assess/[id]', params: { id: assessAdmin.create(userId, k, co), fresh: '1' } });
  };
  useEffect(() => {
    if (kind && courseId && p.kind && p.courseId) go();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="close" label="Close" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/edu/assess'))} />
          <Txt variant="heading" style={{ flex: 1 }}>Create</Txt>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.inner}>
            <Txt variant="label" color={c.muted}>WHAT ARE YOU CREATING?</Txt>
            {(['quiz', 'exam', 'assignment'] as const).map((k) => {
              const m = KIND_META[k];
              const on = kind === k;
              return (
                <Pressable key={k} onPress={() => setKind(k)} style={[styles.opt, { backgroundColor: on ? c.primarySoft : c.surface, borderColor: on ? c.primary : c.border }]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                  <View style={[styles.icon, { backgroundColor: m.tint }]}><Ionicons name={m.icon} size={22} color={m.color} /></View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">{m.label}</Txt>
                    <Txt variant="caption" color={c.muted}>{DESC[k]}</Txt>
                  </View>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? c.primary : c.borderStrong} />
                </Pressable>
              );
            })}
            {courses.length > 1 && (
              <>
                <Txt variant="label" color={c.muted} style={{ marginTop: 8 }}>FOR WHICH COURSE?</Txt>
                {courses.map((co) => (
                  <Pressable key={co.id} onPress={() => setCourseId(co.id)} style={[styles.opt, { backgroundColor: courseId === co.id ? c.primarySoft : c.surface, borderColor: courseId === co.id ? c.primary : c.border, minHeight: 52 }]} accessibilityRole="radio" accessibilityState={{ checked: courseId === co.id }}>
                    <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{co.title}</Txt>
                    <Ionicons name={courseId === co.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={courseId === co.id ? c.primary : c.borderStrong} />
                  </Pressable>
                ))}
              </>
            )}
          </View>
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
          <Button title="Continue" iconRight="arrow-forward" disabled={!kind || !courseId} onPress={() => go()} style={{ width: '100%', maxWidth: layout.contentMaxWidth }} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 24 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 10 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 12, minHeight: 72 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: 1, padding: 12, alignItems: 'center' },
});
