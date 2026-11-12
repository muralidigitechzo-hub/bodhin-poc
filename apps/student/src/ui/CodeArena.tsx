/**
 * Daily Streak & Code Arena (Home): XP + badge, today's code problem and concept quiz, activity heatmap,
 * weekly leaderboard for the learner's batch. All numbers come from playground.arena() — this file only draws them.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { ApiError, playground } from '@/api/client';
import type { BoardRow, Tier } from '@/playground/arena';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from './Txt';
import { Button } from './Button';
import { Pill, ProgressBar } from './kit';
import { useLayout } from './responsive';

const levelTone = { Beginner: 'success', Intermediate: 'info', Advanced: 'gold' } as const;
const HEAT = ['#EDF0F5', '#BDE8CB', '#6CCB8C', '#2FA35F', '#166B3C'];
const MEDAL = ['#EAB308', '#94A3B8', '#CD7F32'];

export function CodeArena() {
  const { c } = useTheme();
  const { isDesktop: screenWide } = useLayout();
  // The card can sit in a narrow column on a wide screen, so decide by its own width (two columns from ~720px).
  const [cardW, setCardW] = useState(0);
  const isDesktop = cardW ? cardW >= 720 : screenWide;
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [a, setA] = useState(() => playground.arena(userId));
  const refresh = useCallback(() => setA(playground.arena(userId)), [userId]);
  // Re-read when coming back from the playground (or when midnight passes while the app stays open).
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const [quizOpen, setQuizOpen] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gained, setGained] = useState<{ xp: number; bonus: number } | null>(null);

  const { code, quiz, streak, xp } = a;
  const ch = code.challenge;
  const submit = () => {
    if (sel === null) return;
    try {
      const r = playground.answerQuiz(userId, sel);
      setGained({ xp: r.xp, bonus: r.bonus });
      setErr(null);
      refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      refresh();
    }
  };

  const nextLine = a.next ? `${a.next.need} XP to ${a.next.tier.name}` : 'Top badge reached';

  const tasks = (
    <View style={{ gap: 10 }}>
      <Txt variant="label" color={c.muted}>TODAY · EITHER ONE KEEPS YOUR STREAK</Txt>

      {/* Code problem */}
      <View style={[styles.task, { borderColor: code.done ? c.success : c.border, backgroundColor: c.surface }]}>
        <View style={[styles.taskIcon, { backgroundColor: c.primarySoft }]}><Ionicons name="code-slash" size={20} color={c.primary} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Txt variant="bodyStrong" numberOfLines={2}>{ch.title}</Txt>
          <View style={styles.meta}>
            <Pill text={ch.level} tone={levelTone[ch.level]} />
            <Pill text={code.stack?.name ?? ch.stack} tone="neutral" />
            <Txt variant="caption" color={c.muted}>{ch.points} XP</Txt>
            {code.done ? <Pill text="Solved" tone="success" icon="checkmark" /> : null}
          </View>
        </View>
        <Button title={code.done ? 'Again' : 'Solve'} size="md" variant={code.done ? 'outline' : 'primary'} onPress={() => router.push({ pathname: '/playground/[stack]', params: { stack: ch.stack, challenge: ch.id } })} />
      </View>

      {/* Concept quiz */}
      <View style={[styles.task, { borderColor: quiz.answered ? (quiz.correct ? c.success : c.warning) : c.border, backgroundColor: c.surface, flexWrap: 'wrap' }]}>
        <View style={[styles.taskIcon, { backgroundColor: '#EFE9FF' }]}><Ionicons name="help-circle" size={22} color="#7C3AED" /></View>
        <View style={{ flex: 1, minWidth: 110, gap: 4 }}>
          <Txt variant="bodyStrong">Concept quiz · {quiz.topic}</Txt>
          <Txt variant="caption" color={c.muted}>One question · 10 XP for a correct answer, 2 XP for trying</Txt>
          {quiz.answered ? <View style={{ alignSelf: 'flex-start' }}><Pill text={quiz.correct ? 'Correct' : 'Not quite'} tone={quiz.correct ? 'success' : 'warning'} icon={quiz.correct ? 'checkmark' : undefined} /></View> : null}
        </View>
        <Button title={quiz.answered ? (quizOpen ? 'Hide' : 'Review') : quizOpen ? 'Hide' : 'Answer'} size="md" variant={quiz.answered || quizOpen ? 'outline' : 'primary'} onPress={() => setQuizOpen((v) => !v)} />

        {quizOpen && (
          <View style={styles.quizPanel}>
            <Txt variant="bodyStrong" accessibilityRole="header">{quiz.question}</Txt>
            <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
              {quiz.options.map((o, i) => {
                const state = quiz.answered ? (i === quiz.answer ? 'right' : i === quiz.choice ? 'wrong' : 'idle') : i === sel ? 'sel' : 'idle';
                const border = state === 'right' ? c.success : state === 'wrong' ? c.danger : state === 'sel' ? c.primary : c.border;
                const bg = state === 'right' ? c.successBg : state === 'wrong' ? c.dangerBg : state === 'sel' ? c.primarySoft : c.surface;
                return (
                  <Pressable
                    key={i}
                    disabled={quiz.answered}
                    onPress={() => { setSel(i); setErr(null); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: state === 'sel' || state === 'right' || state === 'wrong', disabled: quiz.answered }}
                    accessibilityLabel={`Option ${'ABCD'[i]}: ${o}${state === 'right' ? ', correct answer' : state === 'wrong' ? ', your answer, incorrect' : ''}`}
                    style={[styles.opt, { borderColor: border, backgroundColor: bg }]}
                  >
                    <View style={[styles.letter, { backgroundColor: state === 'idle' ? c.surfaceMuted : border }]}>
                      <Txt variant="label" color={state === 'idle' ? c.inkSoft : '#fff'}>{'ABCD'[i]}</Txt>
                    </View>
                    <Txt style={{ flex: 1 }}>{o}</Txt>
                    {state === 'right' && <Ionicons name="checkmark-circle" size={20} color={c.success} />}
                    {state === 'wrong' && <Ionicons name="close-circle" size={20} color={c.danger} />}
                  </Pressable>
                );
              })}
            </View>
            {err && <Txt variant="caption" color={c.danger} accessibilityLiveRegion="polite">{err}</Txt>}
            {quiz.answered ? (
              <View style={[styles.explain, { backgroundColor: c.surfaceMuted }]} accessibilityLiveRegion="polite">
                <Txt variant="label" color={quiz.correct ? c.success : c.warning}>
                  {quiz.correct ? 'Correct!' : 'Not quite.'}{gained ? ` +${gained.xp} XP${gained.bonus ? ` (includes +${gained.bonus} streak bonus)` : ''}` : ''}
                </Txt>
                <Txt variant="caption" color={c.inkSoft}>{quiz.explain}</Txt>
              </View>
            ) : (
              <Button title="Submit answer" size="md" disabled={sel === null} onPress={submit} />
            )}
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View onLayout={(e) => setCardW(e.nativeEvent.layout.width)} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLabel="Daily streak and code arena">
      {/* Header */}
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="heading">Daily Streak & Code Arena</Txt>
          <Txt variant="caption" color={c.inkSoft}>
            {code.done || quiz.answered
              ? streak.current > 1 ? `Streak safe today. Come back tomorrow for a ${streak.current + 1}-day streak.` : 'Streak started. Come back tomorrow to keep it going.'
              : streak.atRisk ? `Do one challenge today to keep your ${streak.current}-day streak.` : streak.best > 0 ? 'Your streak ended. Start a new one today.' : 'Do one challenge a day to build a streak.'}
          </Txt>
        </View>
        <View style={[styles.flame, { backgroundColor: streak.current > 0 ? '#FFF1E0' : c.surfaceMuted }]} accessibilityRole="text" accessibilityLabel={`${streak.current} day streak`}>
          <Ionicons name="flame" size={22} color={streak.current > 0 ? '#F97316' : c.muted} />
          <Txt variant="heading" color={streak.current > 0 ? '#C2410C' : c.muted}>{streak.current}</Txt>
        </View>
      </View>

      {/* XP + badge */}
      <View style={styles.stats}>
        <View style={[styles.stat, { backgroundColor: c.surfaceMuted, flex: 1.8, minWidth: 130 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Txt variant="title" style={{ fontSize: 24, lineHeight: 28 }} accessibilityLabel={`${xp.total} XP`}>{xp.total}</Txt>
            <Txt variant="label" color={c.muted}>XP</Txt>
            <TierBadge tier={a.tier} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ProgressBar pct={a.next?.pct ?? 100} color={a.next?.tier.color ?? '#4F46E5'} height={6} />
          </View>
          <Txt variant="caption" color={c.muted}>{nextLine}</Txt>
        </View>
        <View style={[styles.stat, { backgroundColor: c.surfaceMuted }]}>
          <Txt variant="title" style={{ fontSize: 24, lineHeight: 28 }}>{xp.week}</Txt>
          <Txt variant="caption" color={c.muted}>XP this week</Txt>
        </View>
        <View style={[styles.stat, { backgroundColor: c.surfaceMuted }]}>
          <Txt variant="title" style={{ fontSize: 24, lineHeight: 28 }}>{streak.best}</Txt>
          <Txt variant="caption" color={c.muted}>Best streak</Txt>
        </View>
      </View>

      {/* Desktop: tasks + heatmap on the left, the leaderboard stretches to the same height on the right. Phone: one column. */}
      <View style={isDesktop ? { flexDirection: 'row', gap: 20, alignItems: 'stretch' } : { gap: 16 }}>
        <View style={[{ gap: 18 }, isDesktop && { flex: 1.2, minWidth: 0 }]}>
          {tasks}
          <Heatmap a={a} />
        </View>
        {isDesktop ? <View style={{ flex: 1, minWidth: 0 }}><Leaderboard board={a.board} fill /></View> : <Leaderboard board={a.board} />}
      </View>
    </View>
  );
}

/* ───────── badge ───────── */

function TierBadge({ tier }: { tier: Tier | null }) {
  const { c } = useTheme();
  if (!tier) return <View style={[styles.badge, { backgroundColor: c.surface, borderColor: c.border }]}><Txt variant="caption" color={c.muted}>No badge yet</Txt></View>;
  return (
    <View style={[styles.badge, { backgroundColor: tier.bg, borderColor: tier.color }]} accessibilityLabel={`${tier.name} badge`}>
      <Ionicons name="medal" size={14} color={tier.color} />
      <Txt variant="caption" color={tier.color} style={{ fontWeight: '700' }}>{tier.name}</Txt>
    </View>
  );
}

/* ───────── heatmap ───────── */

function Heatmap({ a }: { a: ReturnType<typeof playground.arena> }) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const weeks = a.heat.length;
  const gap = 3;
  const cell = w ? Math.max(9, Math.min(26, Math.floor((w - gap * (weeks - 1)) / weeks))) : 12;
  const active = a.heat.flat().filter((x) => x.xp > 0).length;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <Txt variant="label" color={c.muted}>ACTIVITY · LAST {weeks} WEEKS</Txt>
        <Txt variant="caption" color={c.muted}>{active} active day{active === 1 ? '' : 's'}</Txt>
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityRole="image" accessibilityLabel={`Activity heatmap for the last ${weeks} weeks: ${active} active days`}>
        <View style={{ flexDirection: 'row', gap, height: 14, marginBottom: 2 }}>
          {a.months.map((m, i) => (
            <View key={i} style={{ width: cell, overflow: 'visible' }}>
              {m ? <Txt variant="caption" color={c.muted} style={{ fontSize: 10, lineHeight: 12, width: 30 }}>{m}</Txt> : null}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {a.heat.map((col, i) => (
            <View key={i} style={{ gap }}>
              {col.map((d) => (
                <View
                  key={d.day}
                  style={{ width: cell, height: cell, borderRadius: 3, backgroundColor: d.future ? 'transparent' : HEAT[d.level], borderWidth: d.today ? 1.5 : 0, borderColor: c.primary }}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' }}>
        <Txt variant="caption" color={c.muted} style={{ fontSize: 10 }}>Less</Txt>
        {HEAT.map((h) => <View key={h} style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: h }} />)}
        <Txt variant="caption" color={c.muted} style={{ fontSize: 10 }}>More</Txt>
      </View>
    </View>
  );
}

/* ───────── leaderboard ───────── */

function Leaderboard({ board, fill }: { board: ReturnType<typeof playground.arena>['board']; fill?: boolean }) {
  const { c } = useTheme();
  if (!board) {
    return (
      <View style={[styles.empty, { backgroundColor: c.surfaceMuted }, fill && { flex: 1, justifyContent: 'center' }]}>
        <Ionicons name="people-outline" size={22} color={c.muted} />
        <Txt variant="bodyStrong">Weekly leaderboard</Txt>
        <Txt variant="caption" color={c.muted} center>Join a batch to see how you rank among your classmates.</Txt>
      </View>
    );
  }
  return (
    <View style={[{ gap: 8 }, fill && { flex: 1 }]}>
      <View style={{ gap: 2 }}>
        <Txt variant="label" color={c.muted}>THIS WEEK · {board.code}</Txt>
        <Txt variant="caption" color={c.muted}>{board.size} classmates · resets Monday</Txt>
      </View>
      <View style={[styles.board, { borderColor: c.border }, fill && { flex: 1 }]} accessibilityRole="list">
        {board.view.top.map((r) => <Row key={r.id} r={r} fill={fill} />)}
        {board.view.me && (
          <>
            <View style={styles.gap}><Txt variant="caption" color={c.muted}>• • •</Txt></View>
            <Row r={board.view.me} fill={fill} />
          </>
        )}
      </View>
    </View>
  );
}

function Row({ r, fill }: { r: BoardRow; fill?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.row, fill && { flex: 1 }, r.you && { backgroundColor: c.primarySoft }]} accessibilityRole="text" accessibilityLabel={`Rank ${r.rank}, ${r.you ? 'you' : r.name}, ${r.xp} XP this week`}>
      <View style={styles.rank}>
        {r.rank <= 3 ? <Ionicons name="trophy" size={18} color={MEDAL[r.rank - 1]} /> : <Txt variant="label" color={c.muted}>{r.rank}</Txt>}
      </View>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt variant={r.you ? 'bodyStrong' : 'body'} numberOfLines={1} style={{ flexShrink: 1 }}>{r.you ? `${r.name} (you)` : r.name}</Txt>
        {r.tier && <Ionicons name="medal" size={14} color={r.tier.color} accessibilityLabel={`${r.tier.name} badge`} />}
      </View>
      {r.streak > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Ionicons name="flame" size={13} color="#F97316" />
          <Txt variant="caption" color={c.muted}>{r.streak}</Txt>
        </View>
      )}
      <Txt variant="label" style={{ minWidth: 56, textAlign: 'right' }}>{r.xp} XP</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: radius.lg, borderWidth: 1, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  flame: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 44, borderRadius: 22 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 12, borderRadius: radius.md, gap: 4, justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, borderWidth: 1 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1.2 },
  taskIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  quizPanel: { width: '100%', gap: 10, paddingTop: 8 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, minHeight: 48, borderRadius: radius.md, borderWidth: 1.5 },
  letter: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  explain: { padding: 12, borderRadius: radius.md, gap: 4 },
  board: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, minHeight: 44 },
  rank: { width: 24, alignItems: 'center' },
  gap: { alignItems: 'center', paddingVertical: 2 },
  empty: { alignItems: 'center', gap: 6, padding: 20, borderRadius: radius.md },
});
