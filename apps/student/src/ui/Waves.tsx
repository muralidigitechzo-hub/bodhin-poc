/** Soft gold sweeps from the approved designs, drawn with plain views (no SVG dependency). */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme/ThemeProvider';

export function Waves() {
  const { c } = useTheme();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[c.ivoryDeep, c.ivory, c.ivory]} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
      <View style={[styles.arc, { top: -260, left: -220, borderColor: c.accent, opacity: 0.22 }]} />
      <View style={[styles.arc, { top: -240, left: -250, borderColor: c.accent, opacity: 0.12, width: 560, height: 560 }]} />
      <View style={[styles.arc, { bottom: -300, right: -260, borderColor: c.accent, opacity: 0.2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  arc: { position: 'absolute', width: 520, height: 520, borderRadius: 999, borderWidth: 1.5 },
});
