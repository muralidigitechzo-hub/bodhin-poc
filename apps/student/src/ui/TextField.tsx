import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';

export type InputRef = React.ComponentRef<typeof TextInput>;

interface Props extends TextInputProps {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string | null;
  hint?: string;
  prefix?: string; // e.g. "🇮🇳 +91"
  secure?: boolean;
}

export const TextField = forwardRef<InputRef, Props>(function TextField({ label, icon, error, hint, prefix, secure, style, onFocus, onBlur, ...rest }, ref) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const borderColor = error ? c.danger : focused ? c.primary : c.border;

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.labelRow}>
        {icon && <Ionicons name={icon} size={16} color={c.inkSoft} />}
        <Txt variant="label" color={c.ink}>
          {label}
        </Txt>
      </View>
      <View style={[styles.box, { borderColor, backgroundColor: focused ? c.surface : c.surfaceMuted }, focused && { borderWidth: 1.6 }]}>
        {prefix && (
          <View style={[styles.prefix, { borderRightColor: c.border }]}>
            <Txt variant="bodyStrong">{prefix}</Txt>
          </View>
        )}
        <TextInput
          ref={ref}
          placeholderTextColor={c.muted}
          secureTextEntry={secure && hidden}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: c.ink }, style]}
          {...rest}
        />
        {secure && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityRole="button" accessibilityLabel={hidden ? 'Show password' : 'Hide password'} style={styles.eye}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={22} color={c.inkSoft} />
          </Pressable>
        )}
      </View>
      {error ? (
        <Txt variant="caption" color={c.danger} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="caption" color={c.muted}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.2, borderRadius: radius.md, minHeight: touch.primary },
  prefix: { paddingHorizontal: 14, borderRightWidth: 1, alignSelf: 'stretch', justifyContent: 'center' },
  input: { flex: 1, paddingHorizontal: 14, fontSize: 16, minHeight: touch.primary, outlineStyle: 'none' } as any,
  eye: { paddingHorizontal: 14, minHeight: touch.min, justifyContent: 'center' },
});
