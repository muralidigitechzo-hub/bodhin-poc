/** Settings-style rows and grouped cards used on Profile and related screens. */
import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from './Txt';

export function Group({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.gHead}>
        <Ionicons name={icon} size={20} color={c.primary} />
        <Txt variant="heading">{title}</Txt>
      </View>
      {children}
    </View>
  );
}

export function Row({ icon, title, sub, onPress, right, danger, toggle }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub?: string; onPress?: () => void; right?: React.ReactNode; danger?: boolean; toggle?: { value: boolean; onChange: (v: boolean) => void } }) {
  const { c } = useTheme();
  const body = (
    <>
      <View style={[styles.icon, { backgroundColor: danger ? c.dangerBg : c.surfaceMuted }]}>
        <Ionicons name={icon} size={20} color={danger ? c.danger : c.inkSoft} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" color={danger ? c.danger : c.ink}>{title}</Txt>
        {sub && <Txt variant="caption" color={c.muted} numberOfLines={2}>{sub}</Txt>}
      </View>
      {right}
      {toggle ? (
        <Switch value={toggle.value} onValueChange={toggle.onChange} trackColor={{ true: c.primary, false: c.borderStrong }} thumbColor="#fff" accessibilityLabel={title} />
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={20} color={c.muted} />
      ) : null}
    </>
  );
  if (toggle) return <Pressable onPress={() => toggle.onChange(!toggle.value)} style={[styles.row, { borderTopColor: c.border }]} accessibilityRole="switch" accessibilityState={{ checked: toggle.value }}>{body}</Pressable>;
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { borderTopColor: c.border }, pressed && { backgroundColor: c.surfaceMuted }]} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    <View style={[styles.row, { borderTopColor: c.border }]}>{body}</View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  gHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 62, paddingVertical: 8, borderTopWidth: 1 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
