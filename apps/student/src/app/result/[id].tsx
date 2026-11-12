/** Quiz result: score, stats, topic performance, rank and a question-by-question review. */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { assessments } from '@/api/client';
import { verdict } from '@/core/assess';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Chip, IconButton, Pill, ProgressBar, ProgressRing } from '@/ui/kit';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Result() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const data = assessments.attempt(id);
  const [filter, setFilter] = useState<'all' | 'correct' | 'wrong'>('all');
  const [open, setOpen] = useState<number | null>(null);
  if (!data) return null;
  const { t, a, course, questions, best } = data;
  const passed = t.scorePct >= a.passPct;
  const v = verdict(t.scorePct, a.passPct);
  const ringColor = passed ? c.success : c.danger;

  const stats = [
    ['help-circle-outline', String(t.total), 'Questions', c.info],
    ['checkmark-circle-outline', String(t.correct), 'Correct', c.success],
    ['close-circle-outline', String(t.total - t.correct), 'Incorrect', c.danger],
    ['time-outline', mmss(t.timeTakenSec), 'Time taken', c.primary],
    ['ribbon-outline', `${t.marks}/${a.marks}`, 'Marks', c.accent],
    ['podium-outline', `#${t.rank}`, `of ${t.of}`, '#7C3AED'],
  ] as const;

  const rows = questions.map((q, i) => ({ q, i, mine: t.answers[i], ok: t.answers[i] === q.correct })).filter((r) => (filter === 'all' ? true : filter === 'correct' ? r.ok : !r.ok));

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <View style={styles.center}>
            <View style={styles.top}>
              <IconButton icon="close" label="Close" tone="filled" onPress={() => router.canGoBack() ? router.back() : router.replace('/learning')} />
              <Txt variant="label" color={c.muted}>Result</Txt>
              <View style={{ width: 48 }} />
            </View>

            <View style={[styles.hero, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Txt variant="label" color={c.muted} center>{a.title}</Txt>
              <ProgressRing pct={t.scorePct} size={132} stroke={12} color={ringColor} />
              <Txt variant="caption" color={c.muted}>{t.correct} of {t.total} correct</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Txt variant="title" color={c.primaryDeep}>{v.title}</Txt>
                <Pill text={passed ? 'Passed' : 'Not passed'} tone={passed ? 'success' : 'live'} />
              </View>
              <Txt color={c.inkSoft} center>{v.body}</Txt>
              {best && best.id !== t.id && <Txt variant="caption" color={c.muted}>Your best score: {best.scorePct}%</Txt>}
            </View>

            <View style={styles.stats}>
              {stats.map(([icon, val, l, col]) => (
                <View key={l} style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <Ionicons name={icon} size={20} color={col} />
                  <Txt variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{val}</Txt>
                  <Txt variant="caption" color={c.muted}>{l}</Txt>
                </View>
              ))}
            </View>

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Txt variant="heading">Performance by topic</Txt>
              {t.byTopic.map((b) => (
                <View key={b.topic} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Txt variant="label">{b.topic}</Txt>
                    <Txt variant="label" color={b.pct >= 80 ? c.success : b.pct >= 60 ? c.warning : c.danger}>{b.pct}%</Txt>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <ProgressBar pct={b.pct} color={b.pct >= 80 ? c.success : b.pct >= 60 ? '#F5A524' : c.danger} height={8} />
                  </View>
                </View>
              ))}
            </View>

            <Txt variant="heading" style={{ marginTop: 8 }}>Question review</Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label={`All (${t.total})`} active={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label={`Correct (${t.correct})`} active={filter === 'correct'} onPress={() => setFilter('correct')} />
              <Chip label={`Incorrect (${t.total - t.correct})`} active={filter === 'wrong'} onPress={() => setFilter('wrong')} />
            </View>
            {rows.map(({ q, i, mine, ok }) => {
              const expanded = open === i;
              return (
                <View key={q.id} style={[styles.qRow, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <Pressable onPress={() => setOpen(expanded ? null : i)} style={styles.qHead} accessibilityRole="button" accessibilityState={{ expanded }}>
                    <View style={[styles.qNo, { backgroundColor: ok ? c.successBg : c.dangerBg }]}>
                      <Txt variant="label" color={ok ? c.success : c.danger}>Q{i + 1}</Txt>
                    </View>
                    <Txt variant="label" style={{ flex: 1, fontWeight: '600' }} numberOfLines={expanded ? undefined : 2}>{q.text}</Txt>
                    <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={22} color={ok ? c.success : c.danger} />
                  </Pressable>
                  {expanded && (
                    <View style={{ gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
                      {q.options.map((o, k) => {
                        const isCorrect = k === q.correct;
                        const isMine = k === mine;
                        return (
                          <View key={o} style={[styles.ans, { borderColor: isCorrect ? c.success : isMine ? c.danger : c.border, backgroundColor: isCorrect ? c.successBg : isMine ? c.dangerBg : c.surface }]}>
                            <Txt variant="label" color={c.inkSoft}>{LETTERS[k]}.</Txt>
                            <Txt variant="label" style={{ flex: 1, fontWeight: '500' }}>{o}</Txt>
                            {isCorrect && <Txt variant="caption" color={c.success} style={{ fontWeight: '700' }}>Correct</Txt>}
                            {isMine && !isCorrect && <Txt variant="caption" color={c.danger} style={{ fontWeight: '700' }}>Your answer</Txt>}
                          </View>
                        );
                      })}
                      {mine < 0 && <Txt variant="caption" color={c.warning}>You skipped this question.</Txt>}
                      <View style={[styles.exp, { backgroundColor: c.infoBg }]}>
                        <Ionicons name="bulb-outline" size={18} color={c.info} />
                        <Txt variant="label" color={c.inkSoft} style={{ flex: 1, fontWeight: '500' }}>{q.explanation}</Txt>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View style={[styles.foot, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <View style={[styles.center, { flexDirection: 'row', gap: 10 }]}>
            <Button title="Retake" variant="outline" iconLeft="refresh" style={{ flex: 1 }} onPress={() => router.replace({ pathname: '/quiz/[lessonId]', params: { lessonId: a.id } })} />
            <Button title={a.lessonId ? 'Continue' : 'Done'} iconRight="arrow-forward" style={{ flex: 1.3 }} onPress={() => (a.lessonId ? router.replace({ pathname: '/learn/[courseId]', params: { courseId: course.id } }) : router.replace('/learning'))} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  hero: { alignItems: 'center', gap: 6, padding: 20, borderRadius: 22, borderWidth: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexBasis: '30%', flexGrow: 1, alignItems: 'center', gap: 2, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1 },
  card: { padding: 16, borderRadius: radius.lg, borderWidth: 1, gap: 12 },
  qRow: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  qHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 56 },
  qNo: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ans: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.md, borderWidth: 1.2 },
  exp: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: radius.md },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
});
