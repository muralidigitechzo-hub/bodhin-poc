/** Playground home: pick a stack, resume a saved project, or take a challenge. */
import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { playground } from '@/api/client';
import { CHALLENGES } from '@/playground/challenges';
import { GROUPS, STACKS, stackOf } from '@/playground/stacks';
import { PLAYGROUND_LIMITS, levelOf } from '@/playground/checks';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { IconButton, Pill, SectionHeader, useAsync } from '@/ui/kit';
import { Grid, PAGE, useLayout } from '@/ui/responsive';

const levelTone = { Beginner: 'success', Intermediate: 'info', Advanced: 'gold' } as const;

export default function PlaygroundHome() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { cols, pad, isDesktop } = useLayout();
  const { data, reload } = useAsync(async () => playground.overview(userId), [userId]);
  useFocusEffect(useCallback(() => reload(), [userId])); // eslint-disable-line react-hooks/exhaustive-deps
  const o = data ?? playground.overview(userId);
  const lvl = levelOf(o.points);

  const del = (id: string) => {
    playground.remove(userId, id);
    reload();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 48, paddingHorizontal: pad }}>
          <View style={{ width: '100%', maxWidth: PAGE.wide, gap: 16 }}>
            <View style={{ paddingTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/learning'))} />
              <View style={{ flex: 1 }}>
                <TwoTone lead="Code" accent="Playground" variant="title" />
                <Txt color={c.inkSoft}>Practise any tech stack right here. Nothing to install.</Txt>
              </View>
            </View>

            <View style={[styles.stats, { backgroundColor: c.surface, borderColor: c.border }]}>
              {([
                ['trophy-outline', `${o.points} pts`, lvl.name, '#B7791F'],
                ['checkmark-done-outline', `${o.solved.length}/${CHALLENGES.length}`, 'Challenges solved', c.success],
                ['cloud-outline', `${o.runsLeft}/${PLAYGROUND_LIMITS.remoteRunsPerDay}`, 'Server runs left today', c.primary],
              ] as const).map(([icon, v, l, col]) => (
                <View key={l} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                  <Ionicons name={icon} size={22} color={col} />
                  <Txt variant="heading" accessibilityLabel={`${l}: ${v}`}>{v}</Txt>
                  <Txt variant="caption" color={c.muted} center>{l}</Txt>
                </View>
              ))}
            </View>

            {o.projects.length > 0 && (
              <>
                <SectionHeader title="My projects" />
                <Grid cols={isDesktop ? Math.min(3, cols(300)) : 1} gap={12}>
                  {o.projects.map((p) => (
                    <View key={p.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                      <Pressable onPress={() => router.push({ pathname: '/playground/[stack]', params: { stack: p.stack, project: p.id } })} accessibilityRole="button" accessibilityLabel={`Open project ${p.title}`} style={{ flex: 1, gap: 2 }}>
                        <Txt variant="bodyStrong" numberOfLines={1}>{p.title}</Txt>
                        <Txt variant="caption" color={c.muted}>{stackOf(p.stack)?.name} · {new Date(p.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Txt>
                      </Pressable>
                      <Pressable onPress={() => del(p.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Delete project ${p.title}`}>
                        <Ionicons name="trash-outline" size={20} color={c.muted} />
                      </Pressable>
                    </View>
                  ))}
                </Grid>
              </>
            )}

            {GROUPS.map((g) => (
              <View key={g} style={{ gap: 10 }}>
                <SectionHeader title={g} />
                <Grid cols={isDesktop ? cols(230) : 1} gap={12}>
                  {STACKS.filter((s) => s.group === g).map((s) => (
                    <Pressable key={s.id} onPress={() => router.push({ pathname: '/playground/[stack]', params: { stack: s.id } })} accessibilityRole="button" accessibilityLabel={`Open ${s.name}`} style={({ hovered }: any) => [styles.card, { backgroundColor: hovered ? c.surfaceMuted : c.surface, borderColor: c.border }]}>
                      <View style={[styles.icon, { backgroundColor: s.color + '22' }]}>
                        <Ionicons name={s.icon as keyof typeof Ionicons.glyphMap} size={24} color={s.color} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt variant="bodyStrong">{s.name}</Txt>
                        <Txt variant="caption" color={c.muted} numberOfLines={2}>{s.blurb}</Txt>
                      </View>
                      {s.runner === 'remote' && <Pill text="Server" icon="cloud-outline" tone="info" />}
                    </Pressable>
                  ))}
                </Grid>
              </View>
            ))}

            <SectionHeader title="Challenges" />
            <Grid cols={isDesktop ? Math.min(2, cols(420)) : 1} gap={12}>
              {CHALLENGES.map((ch) => {
                const done = o.solved.includes(ch.id);
                return (
                  <Pressable key={ch.id} onPress={() => router.push({ pathname: '/playground/[stack]', params: { stack: ch.stack, challenge: ch.id } })} accessibilityRole="button" accessibilityLabel={`Challenge: ${ch.title} in ${stackOf(ch.stack)?.name}${done ? ', solved' : ''}`} style={({ hovered }: any) => [styles.card, { backgroundColor: hovered ? c.surfaceMuted : c.surface, borderColor: done ? c.success : c.border }]}>
                    <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={done ? c.success : c.muted} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="bodyStrong">{ch.title}</Txt>
                      <Txt variant="caption" color={c.muted}>{stackOf(ch.stack)?.name} · {ch.points} pts</Txt>
                    </View>
                    <Pill text={ch.level} tone={levelTone[ch.level]} />
                  </Pressable>
                );
              })}
            </Grid>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1 },
  icon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
