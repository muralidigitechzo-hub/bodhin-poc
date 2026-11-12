/**
 * Video surface with thumb-friendly controls.
 * POC: playback is SIMULATED (a clock over the course artwork) because the preview cannot stream video.
 * DEVELOPER: swap the clock for `expo-video` (useVideoPlayer + VideoView) fed by the signed HLS URL from
 * player.open(); keep this component's props so the screen does not change.
 */
import React, { useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Course, Lesson } from '@/core/catalog';
import { Txt } from './Txt';

export interface VideoState {
  playing: boolean;
  t: number;
}

interface Props {
  course: Course;
  lesson: Lesson;
  label: string; // "Module 1 · Lesson 1"
  startAt: number;
  speed: number;
  fullscreen: boolean;
  onTime: (t: number, duration: number) => void;
  onEnded: () => void;
  onSpeed: () => void;
  onQuality: () => void;
  onFullscreen: () => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function VideoSurface({ course, lesson, label, startAt, speed, fullscreen, onTime, onEnded, onSpeed, onQuality, onFullscreen }: Props) {
  const duration = lesson.durationSec ?? 600;
  const [t, setT] = useState(Math.min(startAt, duration - 1));
  const [playing, setPlaying] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [seekHint, setSeekHint] = useState<null | 'back' | 'fwd'>(null);
  const [barW, setBarW] = useState(1);
  const lastTap = useRef<{ at: number; x: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const width = useRef(1);

  // reset when lesson changes
  useEffect(() => {
    setT(Math.min(startAt, duration - 1));
    setPlaying(false);
    setChrome(true);
  }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // simulated clock
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((x) => {
        const n = Math.min(duration, x + 0.5 * speed * 6); // 6× faster than real time so the demo moves
        if (n >= duration) {
          setPlaying(false);
          setTimeout(onEnded, 0);
        }
        return n;
      });
    }, 500);
    return () => clearInterval(id);
  }, [playing, speed, duration, onEnded]);

  useEffect(() => onTime(t, duration), [t]); // eslint-disable-line react-hooks/exhaustive-deps

  // auto-hide controls while playing
  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing && chrome) hideTimer.current = setTimeout(() => setChrome(false), 3000);
  }, [playing, chrome]);

  const seek = (d: number) => setT((x) => Math.max(0, Math.min(duration - 1, x + d)));

  /** Single tap toggles controls; double tap on left/right third seeks ∓10s. */
  const onSurfaceTap = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    const now = Date.now();
    if (lastTap.current && now - lastTap.current.at < 280) {
      const side = x < width.current / 3 ? 'back' : x > (width.current * 2) / 3 ? 'fwd' : null;
      if (side) {
        seek(side === 'back' ? -10 : 10);
        setSeekHint(side);
        setTimeout(() => setSeekHint(null), 500);
      }
      lastTap.current = null;
      return;
    }
    lastTap.current = { at: now, x };
    setTimeout(() => {
      if (lastTap.current && lastTap.current.at === now) setChrome((v) => !v);
    }, 290);
  };

  const scrub = (e: GestureResponderEvent) => setT(Math.max(0, Math.min(duration - 1, (e.nativeEvent.locationX / barW) * duration)));
  const pct = (t / duration) * 100;

  return (
    <View
      style={[styles.box, fullscreen ? styles.full : { aspectRatio: 16 / 9 }]}
      onLayout={(e: LayoutChangeEvent) => (width.current = e.nativeEvent.layout.width)}
      accessibilityLabel={`Video: ${lesson.title}`}
    >
      <LinearGradient colors={[course.art.from, course.art.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Ionicons name={course.art.icon as keyof typeof Ionicons.glyphMap} size={160} color="rgba(255,255,255,0.10)" style={{ position: 'absolute', right: 10, top: 10 }} />
      <View style={[styles.slide, chrome && { opacity: 0 }]}>
        <Txt variant="title" color="#fff" numberOfLines={2} style={{ maxWidth: '75%', fontSize: 20 }}>
          {lesson.title}
        </Txt>
      </View>

      <Pressable style={StyleSheet.absoluteFill} onPress={onSurfaceTap} accessibilityRole="button" accessibilityLabel={chrome ? 'Hide controls' : 'Show controls'} />

      {seekHint && (
        <View style={[styles.seekHint, seekHint === 'back' ? { left: 24 } : { right: 24 }]} pointerEvents="none">
          <Ionicons name={seekHint === 'back' ? 'play-back' : 'play-forward'} size={22} color="#fff" />
          <Txt variant="label" color="#fff">10s</Txt>
        </View>
      )}

      {chrome && (
        <View style={styles.chrome} pointerEvents="box-none">
          <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.6)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={styles.topRow} pointerEvents="box-none">
            <View style={styles.tag}>
              <Txt variant="caption" color="#fff" style={{ fontWeight: '700' }}>{label}</Txt>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={onQuality} style={styles.tag} accessibilityRole="button" accessibilityLabel="Video quality" hitSlop={8}>
                <Ionicons name="settings-outline" size={14} color="#fff" />
              </Pressable>
              <Pressable onPress={onSpeed} style={styles.tag} accessibilityRole="button" accessibilityLabel={`Playback speed ${speed}x`} hitSlop={8}>
                <Txt variant="caption" color="#fff" style={{ fontWeight: '700' }}>{speed}x</Txt>
              </Pressable>
            </View>
          </View>

          <View style={styles.center} pointerEvents="box-none">
            <Pressable onPress={() => seek(-10)} style={styles.small} accessibilityRole="button" accessibilityLabel="Back 10 seconds" hitSlop={8}>
              <Ionicons name="play-back" size={24} color="#fff" />
            </Pressable>
            <Pressable onPress={() => { if (t >= duration - 1) setT(0); setPlaying((p) => !p); }} style={styles.big} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'}>
              <Ionicons name={playing ? 'pause' : 'play'} size={34} color="#fff" style={!playing ? { marginLeft: 4 } : undefined} />
            </Pressable>
            <Pressable onPress={() => seek(10)} style={styles.small} accessibilityRole="button" accessibilityLabel="Forward 10 seconds" hitSlop={8}>
              <Ionicons name="play-forward" size={24} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.bottom} pointerEvents="box-none">
            <Pressable
              onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
              onPress={scrub}
              onResponderMove={scrub}
              onStartShouldSetResponder={() => true}
              style={styles.barHit}
              accessibilityRole="adjustable"
              accessibilityLabel={`Position ${fmt(t)} of ${fmt(duration)}`}
            >
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>
              <View style={[styles.knob, { left: `${pct}%` }]} />
            </Pressable>
            <View style={styles.timeRow}>
              <Txt variant="caption" color="#fff" style={{ fontVariant: ['tabular-nums'] }}>
                {fmt(t)} / {fmt(duration)}
              </Txt>
              <Pressable onPress={onFullscreen} hitSlop={10} accessibilityRole="button" accessibilityLabel={fullscreen ? 'Exit full screen' : 'Full screen'}>
                <Ionicons name={fullscreen ? 'contract' : 'expand'} size={22} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>
      )}
      {!chrome && (
        <View style={styles.thin} pointerEvents="none">
          <View style={[styles.fill, { width: `${pct}%`, height: 3 }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', backgroundColor: '#000', overflow: 'hidden' },
  full: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 },
  slide: { position: 'absolute', left: 20, bottom: 56, right: 20 },
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, minHeight: 30, minWidth: 30, justifyContent: 'center', borderRadius: 999 },
  center: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 34 },
  big: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  small: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  bottom: { paddingHorizontal: 14, paddingBottom: 8 },
  barHit: { height: 28, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#F5A524' },
  knob: { position: 'absolute', width: 16, height: 16, borderRadius: 8, marginLeft: -8, backgroundColor: '#F5A524', top: 6 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seekHint: { position: 'absolute', top: '40%', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  thin: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
});
