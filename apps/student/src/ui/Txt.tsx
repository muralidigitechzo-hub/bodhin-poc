import React from 'react';
import { Text, TextProps } from 'react-native';
import { type as typeScale } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Variant = keyof typeof typeScale;

export function Txt({ variant = 'body', color, center, style, ...rest }: TextProps & { variant?: Variant; color?: string; center?: boolean }) {
  const { c } = useTheme();
  return <Text {...rest} style={[typeScale[variant], { color: color ?? c.ink }, center && { textAlign: 'center' }, style]} />;
}

/** Headline with the brand's two-tone treatment: "Welcome <accent>Back</accent>" */
export function TwoTone({ lead, accent, variant = 'display', center }: { lead: string; accent: string; variant?: Variant; center?: boolean }) {
  const { c } = useTheme();
  return (
    <Txt variant={variant} center={center} color={c.primaryDeep} accessibilityRole="header">
      {lead} <Text style={{ color: c.accent }}>{accent}</Text>
    </Txt>
  );
}
