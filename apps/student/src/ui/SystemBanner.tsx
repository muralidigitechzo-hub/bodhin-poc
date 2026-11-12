/** Platform maintenance banner (set by Super Admin). Polls the status endpoint; renders nothing when off. */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { system } from '@/api/client';
import { Txt } from './Txt';

export function SystemBanner() {
  const [s, setS] = useState(() => system.status().maintenance);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const t = setInterval(() => setS({ ...system.status().maintenance }), 3000);
    return () => clearInterval(t);
  }, []);
  if (!s.on) return null;
  return (
    <View style={{ backgroundColor: '#B7791F', paddingTop: insets.top + 6, paddingBottom: 6, paddingHorizontal: 12 }} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Txt variant="label" color="#fff" center numberOfLines={2}>⚠ {s.message}</Txt>
    </View>
  );
}
