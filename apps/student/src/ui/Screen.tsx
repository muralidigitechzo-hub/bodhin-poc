/**
 * Screen shell for the thumb-first layout:
 *  - content scrolls in the upper area
 *  - `footer` (primary actions) is pinned to the bottom, inside the thumb zone
 *  - centred with a max width on tablet/web so phone layouts don't stretch
 */
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { layout, space } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Waves } from './Waves';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from './Txt';
import { useLayout } from './responsive';

interface Props {
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  decor?: boolean;
}

export function Screen({ children, footer, maxWidth = layout.authMaxWidth, scroll = true, contentStyle, decor = true }: Props) {
  const { c, brand, tenant } = useTheme();
  const { isDesktop } = useLayout();
  // Auth-sized screens (sign-in, sign-up, OTP, apply…) get a brand panel on the left on desktop.
  const split = isDesktop && maxWidth <= layout.authMaxWidth;
  // Desktop: primary actions sit inline under the content (no pinned bottom bar).
  const inlineFooter = isDesktop && !!footer;
  const body = (
    <View style={[styles.inner, { maxWidth }, contentStyle]}>
      {children}
      {inlineFooter && <View style={[styles.footer, { marginTop: space.xl }]}>{footer}</View>}
    </View>
  );
  const page = (
    <View style={[styles.root, { backgroundColor: c.ivory }]}>
      {decor && <Waves />}
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {scroll ? (
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {body}
            </ScrollView>
          ) : (
            <View style={[styles.root, styles.scroll]}>{body}</View>
          )}
          {footer && !inlineFooter && (
            <View style={styles.footerWrap}>
              <View style={[styles.footer, { maxWidth }]}>{footer}</View>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
  if (!split) return page;
  const points: [keyof typeof Ionicons.glyphMap, string][] = tenant
    ? [['play-circle-outline', 'Recorded courses and live classes'], ['ribbon-outline', 'Certificates when you complete'], ['phone-portrait-outline', 'Same account on web and mobile']]
    : [['school-outline', 'Courses from verified Indian educators'], ['radio-outline', 'Live classes, doubts and assessments'], ['briefcase-outline', 'Teach on Bodhin with your own academy']];
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.ivory }}>
      <LinearGradient colors={[c.primaryDeep, c.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.brand}>
        <View style={{ maxWidth: 460, gap: 22 }}>
          <Txt variant="caption" color="rgba(255,255,255,0.7)" style={{ letterSpacing: 1.2 }}>{(tenant ? brand.displayName : 'BODHIN').toUpperCase()}</Txt>
          <Txt variant="display" color="#fff" style={{ fontSize: 40, lineHeight: 48 }}>{tenant ? `Learn with ${brand.displayName}` : 'Discover what you can become.'}</Txt>
          <View style={{ gap: 14 }}>
            {points.map(([ic, t]) => (
              <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={styles.brandIcon}><Ionicons name={ic} size={20} color="#fff" /></View>
                <Txt color="rgba(255,255,255,0.9)" style={{ fontSize: 16 }}>{t}</Txt>
              </View>
            ))}
          </View>
        </View>
      </LinearGradient>
      <View style={{ width: 560, maxWidth: '50%' }}>{page}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  brand: { flex: 1, justifyContent: 'center', paddingHorizontal: 64 },
  brandIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.xl },
  inner: { width: '100%', flexGrow: 1 },
  footerWrap: { alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.md },
  footer: { width: '100%', gap: space.md },
});
