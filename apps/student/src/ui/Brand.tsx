/** Logo: Bodhin wordmark on the platform, tutor's own name/logo on their workspace. */
import React from 'react';
import { Image, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';

const mark = require('../../assets/brand/mark.png');
const wordmark = require('../../assets/brand/wordmark.png');

export function BrandLogo({ size = 'md', align = 'center' }: { size?: 'sm' | 'md' | 'lg'; align?: 'center' | 'flex-start' }) {
  const { tenant, brand, c } = useTheme();
  const h = { sm: 34, md: 52, lg: 74 }[size];

  if (tenant) {
    const initials = brand.displayName.split(' ').map((w) => w[0]).slice(0, 2).join('');
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: align }} accessibilityLabel={brand.displayName}>
        {brand.logoUrl ? (
          <Image source={{ uri: brand.logoUrl }} style={{ width: h, height: h, borderRadius: 12 }} />
        ) : (
          <View style={{ width: h, height: h, borderRadius: 14, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Txt variant="title" color="#fff" style={{ fontSize: h * 0.42 }}>
              {initials}
            </Txt>
          </View>
        )}
        <View>
          <Txt variant="heading" color={c.primaryDeep} style={{ fontSize: h * 0.36, lineHeight: h * 0.44 }}>
            {brand.displayName}
          </Txt>
          {brand.tagline && size !== 'sm' && (
            <Txt variant="caption" color={c.muted}>
              {brand.tagline}
            </Txt>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: h * 0.18, alignSelf: align }} accessibilityLabel="Bodhin — Discover What You Can Become">
      <Image source={mark} style={{ width: h * 1.11, height: h }} resizeMode="contain" />
      <View style={{ width: 1.5, height: h * 0.9, backgroundColor: c.accent }} />
      <Image source={wordmark} style={{ width: h * 2.9, height: h * 0.8 }} resizeMode="contain" />
    </View>
  );
}

/** Small "Powered by Bodhin" line shown on tutor workspaces. */
export function PoweredBy() {
  const { tenant, c } = useTheme();
  if (!tenant) return null;
  return (
    <Txt variant="caption" color={c.muted} center>
      Powered by Bodhin
    </Txt>
  );
}
