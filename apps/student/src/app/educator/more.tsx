/** Educator "More": business, workspace, teaching tools, account. Tutors see only what their role allows. */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { certification, educator } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { AppHeader, Avatar, BottomSheet, Pill } from '@/ui/kit';
import { Group, Row } from '@/ui/ListRow';


export default function More() {
  const { c } = useTheme();
  const { session, setMode, signOut } = useAuth();
  const userId = session?.user.id ?? '';
  const ctx = educator.context(userId);
  const [logout, setLogout] = useState(false);
  if (!ctx || !session) return null;
  const owner = ctx.role === 'owner';
  const certPending = certification.pendingCount(userId, 'educator');
  const directOk = ctx.tenant.payments?.directGatewayStatus === 'active';
  const payoutOk = !!ctx.tenant.payments?.payoutAccount?.verified;

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            <AppHeader profileHref="/educator/more" />
            <View style={[styles.me, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Avatar name={session.user.name} size={56} color={c.primaryDeep} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="heading" numberOfLines={1}>{session.user.name}</Txt>
                <Txt variant="caption" color={c.muted} numberOfLines={1}>{ctx.tenant.branding.displayName}</Txt>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  <Pill text={owner ? 'Owner' : 'Tutor'} tone="info" />
                  {owner && <Pill text={`${ctx.ent.plan.name} · ${ctx.sub.billing}`} tone="gold" />}
                </View>
              </View>
            </View>

            {owner && (
              <Group title="Business" icon="briefcase-outline">
                <Row icon="wallet-outline" title="Earnings & payouts" sub="Direct sales, marketplace statement, payouts" onPress={() => router.push('/edu/earnings')} />
                <Row icon="speedometer-outline" title="Subscription & usage" sub={ctx.usage.worst ? `${ctx.usage.worst.label} at ${ctx.usage.worst.pct}%` : `${ctx.ent.plan.name} plan · renews ${new Date(ctx.sub.periodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`} onPress={() => router.push('/edu/subscription')} right={ctx.usage.worst ? <Pill text={`${ctx.usage.worst.pct}%`} tone={ctx.usage.worst.level === 'warn' ? 'warning' : 'live'} /> : undefined} />
                <Row icon="card-outline" title="Payments setup" sub="Your gateway for direct sales · bank for Bodhin payouts" onPress={() => router.push('/edu/payments-setup')} right={<Pill text={directOk && payoutOk ? 'Ready' : 'Action needed'} tone={directOk && payoutOk ? 'success' : 'warning'} />} />
                <Row icon="pricetags-outline" title="Coupons & offers" sub="Real, dated offers only" onPress={() => router.push('/edu/coupons')} />
              </Group>
            )}

            <Group title="Teaching" icon="school-outline">
              <Row icon="document-text-outline" title="Grade assignments" sub="Rubric scoring, oldest first" onPress={() => router.push('/edu/grading')} />
              <Row icon="help-circle-outline" title="Quizzes & assignments" sub="Create, publish and see results" onPress={() => router.push('/edu/assess')} />
              <Row icon="ribbon-outline" title="Certificate approvals" sub="Learners who finished a course" onPress={() => router.push('/edu/certificates')} right={certPending > 0 ? <Pill text={String(certPending)} tone="info" /> : undefined} />
              <Row icon="pulse-outline" title="Retention radar" sub="Students at risk of dropping out" onPress={() => router.push('/edu/retention')} />
              <Row icon="chatbubbles-outline" title="Student doubts" sub="Lesson questions waiting for you" onPress={() => router.push('/edu/doubts')} />
              <Row icon="megaphone-outline" title="Announcements" sub="Open a batch → Updates" onPress={() => router.navigate('/educator/batches')} />
            </Group>

            {owner && (
              <Group title="Workspace" icon="business-outline">
                <Row icon="color-palette-outline" title="Branding & domain" sub={ctx.host} onPress={() => router.push('/edu/workspace')} />
                <Row icon="people-circle-outline" title="Team & tutors" sub={`${ctx.usage.rows.find((r) => r.key === 'tutorSeats')?.used} of ${ctx.ent.limits.tutorSeats ?? '∞'} seats used`} onPress={() => router.push('/edu/team')} />
                <Row icon="storefront-outline" title="Marketplace listing" sub="Which courses Bodhin lists and promotes" onPress={() => router.navigate('/educator/courses')} />
              </Group>
            )}

            <Group title="Account" icon="person-outline">
              <Row icon="swap-horizontal-outline" title="Switch to learner view" sub="See Bodhin as a student, with the same login" onPress={() => { setMode('learner'); router.replace('/home'); }} />
              <Row icon="notifications-outline" title="Notifications" onPress={() => router.push('/notifications')} />
              <Row icon="help-buoy-outline" title="Help center" onPress={() => router.push('/help')} />
              <Row icon="log-out-outline" title="Log out" danger onPress={() => setLogout(true)} />
            </Group>
            <Txt variant="caption" color={c.muted} center>Bodhin v1.0.0 (POC)</Txt>
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet
        open={logout}
        onClose={() => setLogout(false)}
        title="Log out?"
        footer={
          <>
            <Button title="Cancel" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setLogout(false)} />
            <Button title="Log out" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={() => { setLogout(false); signOut(); router.replace('/sign-in'); }} />
          </>
        }
      >
        <Txt color={c.inkSoft}>You can sign back in any time with the same account.</Txt>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 30 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, borderWidth: 1, marginTop: 6 },
});
