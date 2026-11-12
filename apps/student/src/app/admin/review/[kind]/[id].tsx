/** Phone: full-screen review of one application or course. */
import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { ApplicationReview, CourseReview } from '@/ui/adminReview';
import { ScreenTop } from '@/ui/section';

export default function ReviewScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const done = (msg: string) => router.replace({ pathname: '/admin/inbox', params: { tab: kind === 'course' ? 'courses' : 'educators', msg } });
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title={kind === 'course' ? 'Course review' : 'Educator application'} fallback="/admin/inbox" />
        <View style={{ flex: 1, paddingHorizontal: 16, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
          {kind === 'course' ? <CourseReview id={id} userId={userId} onDone={done} /> : <ApplicationReview id={id} userId={userId} onDone={done} />}
        </View>
      </SafeAreaView>
    </View>
  );
}
