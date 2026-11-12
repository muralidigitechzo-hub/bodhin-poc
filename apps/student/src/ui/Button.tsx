import React from 'react';
import { ActivityIndicator, Pressable, PressableProps, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';

type Variant = 'primary' | 'outline' | 'ghost' | 'soft';

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: Variant;
  loading?: boolean;
  iconRight?: keyof typeof Ionicons.glyphMap;
  iconLeft?: keyof typeof Ionicons.glyphMap;
  leading?: React.ReactNode;
  style?: ViewStyle;
  size?: 'md' | 'lg';
}

export function Button({ title, variant = 'primary', loading, iconRight, iconLeft, leading, style, size = 'lg', disabled, ...rest }: Props) {
  const { c } = useTheme();
  const bg = { primary: c.primary, outline: c.surface, ghost: 'transparent', soft: c.primarySoft }[variant];
  const fg = variant === 'primary' ? '#fff' : c.primary;
  const border = variant === 'outline' ? c.borderStrong : 'transparent';
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        { minHeight: size === 'lg' ? touch.primary : touch.min, backgroundColor: bg, borderColor: border },
        variant === 'primary' && styles.shadow,
        pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] },
        isDisabled && { opacity: 0.55 },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {leading}
          {iconLeft && <Ionicons name={iconLeft} size={20} color={fg} />}
          <Txt variant="heading" color={fg} style={{ fontSize: size === 'lg' ? 17 : 15 }}>
            {title}
          </Txt>
          {iconRight && <Ionicons name={iconRight} size={20} color={fg} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, borderWidth: 1.2, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shadow: { shadowColor: '#0B2A55', shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
});
