/** Phone: full-screen Workspace 360. */
import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { TenantPanel } from '@/ui/adminTenant';
import { ScreenTop } from '@/ui/section';

export default function TenantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Workspace" fallback="/admin/tenants" />
        <View style={{ flex: 1, paddingHorizontal: 16, width: '100%', maxWidth: 820, alignSelf: 'center' }}>
          <TenantPanel id={id} userId={session?.user.id ?? ''} />
        </View>
      </SafeAreaView>
    </View>
  );
}
