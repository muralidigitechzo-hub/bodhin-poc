/**
 * Video drop-off view for a tutor: how many viewers are still watching at each moment, where they leave,
 * and the three places to look at first. Numbers come from core/watch.ts and real playback only.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Line, Path } from 'react-native-svg';
import { insights } from '@/api/client';
import { mmss, type WatchAnalysis } from '@/core/watch';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from './Txt';

const advice = (pct: number) => (pct >= 30 ? 'A lot of viewers leave here. Re-record, shorten or split this part.' : 'Worth a look: check the pace or whether this part is clear.');

export function Dropoff({ a, durationSec }: { a: WatchAnalysis; durationSec: number }) {
  const { c } = useTheme();
  const [sel, setSel] = useState<number | null>(null);

  if (a.status === 'not_enough') {
    return (
      <View style={[styles.empty, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}>
        <Ionicons name="eye-off-outline" size={30} color={c.muted} />
        <Txt variant="bodyStrong" center>Not enough views yet</Txt>
        <Txt variant="caption" color={c.muted} center>{a.viewers} of {a.minViewers} enrolled learners have watched this video. The chart appears once {a.minViewers} have watched, so you never see guesses.</Txt>
      </View>
    );
  }

  const n = a.curve.length;
  const pts = a.curve.map((v, i) => [n === 1 ? 0 : (i / (n - 1)) * 100, 100 - v] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const area = `${line} L100 100 L0 100 Z`;
  const maxHeat = Math.max(...a.heat, 1);
  const win = sel != null ? { at: sel * a.windowSec, end: Math.min(durationSec, (sel + 1) * a.windowSec), pct: a.heat[sel] } : null;

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.stats}>
        <Stat v={String(a.viewers)} l="Viewers" />
        <Stat v={`${a.finishPct}%`} l="Finished" />
        <Stat v={`${a.avgWatchedPct}%`} l="Avg watched" />
      </View>

      <View style={{ gap: 6 }}>
        <Txt variant="label" color={c.muted}>VIEWERS STILL WATCHING</Txt>
        <View style={[styles.chart, { backgroundColor: c.surfaceMuted }]} accessibilityLabel={`Chart: ${a.curve[0]}% at the start, ${a.curve[n - 1]}% at the end`}>
          <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <Line x1="0" y1="50" x2="100" y2="50" stroke={c.border} strokeWidth={0.6} strokeDasharray="2 2" />
            <Path d={area} fill={c.primarySoft} />
            <Path d={line} stroke={c.primary} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
          </Svg>
          <Txt variant="caption" color={c.muted} style={styles.y100}>100%</Txt>
          <Txt variant="caption" color={c.muted} style={styles.y0}>0%</Txt>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Txt variant="label" color={c.muted}>WHERE VIEWERS LEAVE · tap a block</Txt>
        <View style={styles.heat}>
          {a.heat.map((h, i) => (
            <Pressable key={i} onPress={() => setSel(sel === i ? null : i)} accessibilityRole="button" accessibilityLabel={`${mmss(i * a.windowSec)} to ${mmss(Math.min(durationSec, (i + 1) * a.windowSec))}: ${h}% stopped watching`} style={[styles.cell, { backgroundColor: h ? `rgba(229,56,59,${(0.18 + 0.82 * (h / maxHeat)).toFixed(2)})` : c.surfaceMuted }, sel === i && { borderColor: c.ink, borderWidth: 2 }]} />
          ))}
        </View>
        <View style={styles.axis}>
          <Txt variant="caption" color={c.muted}>0:00</Txt>
          <Txt variant="caption" color={c.muted}>{mmss(durationSec / 2)}</Txt>
          <Txt variant="caption" color={c.muted}>{mmss(durationSec)}</Txt>
        </View>
        {win && (
          <Txt variant="label" style={{ fontWeight: '500' }}>
            {mmss(win.at)}–{mmss(win.end)}: {win.pct}% of viewers stopped watching here
          </Txt>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Txt variant="label" color={c.muted}>LOOK AT THESE FIRST</Txt>
        {a.moments.length === 0 ? (
          <View style={[styles.moment, { borderColor: c.border }]}>
            <Ionicons name="checkmark-circle" size={20} color={c.success} />
            <Txt style={{ flex: 1 }}>No single part makes people leave. Viewers drop off slowly and evenly.</Txt>
          </View>
        ) : (
          a.moments.map((m, i) => (
            <View key={m.atSec} style={[styles.moment, { borderColor: c.danger, backgroundColor: c.dangerBg }]}>
              <View style={[styles.rank, { backgroundColor: c.danger }]}>
                <Txt variant="caption" color="#fff" style={{ fontWeight: '800' }}>{i + 1}</Txt>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="bodyStrong">{m.label}</Txt>
                <Txt variant="label" style={{ fontWeight: '500' }}>{m.pct}% of viewers ({m.count} learner{m.count === 1 ? '' : 's'}) stopped watching here</Txt>
                <Txt variant="caption" color={c.inkSoft}>{advice(m.pct)}</Txt>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: c.surfaceMuted }]}>
      <Txt variant="heading">{v}</Txt>
      <Txt variant="caption" color={c.muted}>{l}</Txt>
    </View>
  );
}

/** Drop-off card for the lesson editor. */
export function LessonDropoff({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const r = insights.lesson(session?.user.id ?? '', courseId, lessonId);
  if (!r) return null;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="analytics-outline" size={20} color={c.primary} />
        <Txt variant="heading" style={{ flex: 1 }}>Viewer drop-off</Txt>
        <Pressable onPress={() => router.push({ pathname: '/edu/watch/[courseId]', params: { courseId, lessonId } })} accessibilityRole="button" accessibilityLabel="See all video insights" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Txt variant="label" color={c.primary}>All videos</Txt>
        </Pressable>
      </View>
      <Dropoff a={r.analysis} durationSec={r.durationSec} />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 6, padding: 20, borderRadius: radius.lg, borderWidth: 1 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 16, gap: 14 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: radius.md, padding: 10, alignItems: 'center' },
  chart: { height: 110, borderRadius: radius.md, overflow: 'hidden' },
  y100: { position: 'absolute', top: 2, left: 6, fontSize: 10 },
  y0: { position: 'absolute', bottom: 2, left: 6, fontSize: 10 },
  heat: { flexDirection: 'row', height: 40, gap: 2 },
  cell: { flex: 1, borderRadius: 4, borderWidth: 0 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  moment: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: radius.md, padding: 12 },
  rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
