/** Admin More: profile, role, modules (by permission), install tip, sign out. */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { admin } from '@/api/client';
import { ROLE_LABEL, ROLE_PERMS, can } from '@/core/admin';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, BottomSheet, Pill } from '@/ui/kit';
import { Group, Row } from '@/ui/ListRow';

export default function AdminMore() {
  const { c } = useTheme();
  const { session, signOut } = useAuth();
  const userId = session?.user.id ?? '';
  const me = admin.me(userId);
  const [out, setOut] = useState(false);
  if (!me) return null;
  const r = me.role;

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            <View style={[styles.me, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Avatar name={me.user.name} size={56} color={c.primaryDeep} />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Txt variant="heading" numberOfLines={1}>{me.user.name}</Txt>
                <Txt variant="caption" color={c.muted} numberOfLines={1}>{me.user.email}</Txt>
                <View style={{ flexDirection: 'row', gap: 6 }}><Pill text={ROLE_LABEL[r]} tone="gold" icon="shield-checkmark" /><Pill text={`${ROLE_PERMS[r].length} permissions`} tone="info" /></View>
              </View>
            </View>

            {(can(r, 'plans.edit') || can(r, 'config.edit')) && (
              <Group title="Platform" icon="settings-outline">
                <Row icon="pricetags-outline" title="Plans & limits" sub="Prices, limits, features, add-ons, trial" onPress={() => router.push('/admin/plans')} />
                <Row icon="options-outline" title="Platform rules" sub="Commission %, gateway fee, refund hold, payout day" onPress={() => router.push('/admin/settings')} />
                <Row icon="toggle-outline" title="Feature flags & maintenance" onPress={() => router.push('/admin/flags')} />
              </Group>
            )}
            {can(r, 'content.bodhin') && (
              <Group title="Bodhin content" icon="sparkles-outline">
                <Row icon="layers-outline" title="Bodhin’s own courses" sub="Sold by Bodhin, 100% to Bodhin" onPress={() => router.push('/admin/content')} />
                <Row icon="star-outline" title="Marketplace curation" sub="Featured, banners, categories, Bodhin coupons" onPress={() => router.push('/admin/content')} />
              </Group>
            )}
            {(can(r, 'users.view') || can(r, 'support.tickets') || can(r, 'broadcast')) && (
              <Group title="People" icon="people-outline">
                {can(r, 'users.view') && <Row icon="person-circle-outline" title="Users" sub="Students & educators, lock / reset / roles" onPress={() => router.push('/admin/users')} />}
                {can(r, 'support.tickets') && <Row icon="chatbubbles-outline" title="Support tickets" onPress={() => router.push('/admin/tickets')} />}
                {can(r, 'broadcast') && <Row icon="megaphone-outline" title="Broadcast" sub="Notify all tutors or students" onPress={() => router.push('/admin/broadcast')} />}
              </Group>
            )}
            {(can(r, 'admins.manage') || can(r, 'audit.view')) && (
              <Group title="Security" icon="lock-closed-outline">
                {can(r, 'admins.manage') && <Row icon="key-outline" title="Admin team & roles" onPress={() => router.push('/admin/team')} />}
                {can(r, 'audit.view') && <Row icon="list-outline" title="Audit log" sub="Every admin action, before → after" onPress={() => router.push('/admin/audit')} />}
              </Group>
            )}
            <Group title="This device" icon="phone-portrait-outline">
              <Row icon="add-circle-outline" title="Install as app" sub="Browser menu → Add to Home Screen. Opens full-screen like an app." />
              <Row icon="log-out-outline" title="Sign out" danger onPress={() => setOut(true)} />
            </Group>
            <Txt variant="caption" color={c.muted} center>Bodhin Admin · web portal (POC)</Txt>
          </View>
        </ScrollView>
      </SafeAreaView>
      <BottomSheet open={out} onClose={() => setOut(false)} title="Sign out of admin?" footer={<>
        <Button title="Cancel" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setOut(false)} />
        <Button title="Sign out" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={() => { admin.signOut(userId); setOut(false); signOut(); router.replace('/sign-in'); }} />
      </>}>
        <Txt color={c.inkSoft}>You’ll need the 6-digit code again next time.</Txt>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 30 },
  inner: { width: '100%', maxWidth: 720, gap: 12, paddingTop: 12 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, borderWidth: 1 },
});
