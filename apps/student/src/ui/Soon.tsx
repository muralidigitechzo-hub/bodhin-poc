/** Placeholder for educator screens that arrive in a later build step. */
import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from './Screen';
import { TwoTone, Txt } from './Txt';
import { Button } from './Button';
import { AppHeader } from './kit';

export function Soon({ title, step, icon = 'construct-outline', back = false }: { title: string; step: string; icon?: keyof typeof Ionicons.glyphMap; back?: boolean }) {
  const { c } = useTheme();
  return (
    <Screen maxWidth={720} footer={back ? <Button title="Go back" variant="outline" iconLeft="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/educator/home'))} /> : undefined}>
      {!back && <AppHeader profileHref="/educator/more" />}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 40 }}>
        <View style={{ width: 80, height: 80, borderRadius: 26, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={38} color={c.primary} />
        </View>
        <TwoTone lead={title} accent="" variant="title" center />
        <Txt color={c.muted} center>Built in step {step}.</Txt>
      </View>
    </Screen>
  );
}
