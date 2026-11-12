/** Tutor sign-up lands here: educator application status (blueprint: Draft → Submitted → Under review → Decision). */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { auth } from '@/api/client';
import { useAuth } from '@/store/auth';
import { Banner } from '@/ui/misc';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from '@/ui/Screen';
import { BrandLogo } from '@/ui/Brand';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';

const STAGES = [
  { key: 'submitted', title: 'Application submitted', sub: 'We have your details.' },
  { key: 'under_review', title: 'Under review', sub: 'Our team verifies educators within 1–2 working days.' },
  { key: 'approved', title: 'Workspace activated', sub: 'Pick your subdomain (yourname.thebodhin.com), add branding and launch courses.' },
];

export default function ApplicationStatus() {
  const { c } = useTheme();
  const { session, signOut, setSession, setMode } = useAuth();
  const app = session ? auth.getApplication(session.user.id) : null;
  const current = Math.max(0, STAGES.findIndex((s) => s.key === app?.status));

  // A draft never reaches the Super Admin — send the tutor to the form instead of a misleading "submitted" timeline.
  React.useEffect(() => {
    if (app?.status === 'draft') router.replace('/apply');
  }, [app?.status]);
  if (app?.status === 'draft') return null;

  return (
    <Screen
      footer={
        <>
          {app?.status === 'approved' ? (
            <Button title="Open my educator workspace" iconRight="arrow-forward" onPress={() => { setSession(auth.refreshSession(session!.user.id)); setMode('educator'); router.replace('/educator/home'); }} />
          ) : app?.status === 'changes_requested' ? (
            <Button title="Edit & resubmit application" iconRight="create-outline" onPress={() => router.push('/apply')} />
          ) : (
            <Button title="Explore Bodhin as a learner" iconRight="arrow-forward" onPress={() => router.replace('/home')} />
          )}
          <Button title="Sign out" variant="ghost" onPress={() => { signOut(); router.replace('/sign-in'); }} />
        </>
      }
    >
      <BrandLogo size="sm" />
      <View style={styles.head}>
        <TwoTone lead="Thanks," accent={session?.user.name.split(' ')[0] ?? 'there'} variant="title" center />
        <Txt center color={c.inkSoft}>
          Your educator application is in. We'll notify you by SMS and email when your workspace is ready.
        </Txt>
      </View>
      {app?.note && (app.status === 'changes_requested' || app.status === 'rejected') && <Banner tone={app.status === 'rejected' ? 'danger' : 'info'} text={`${app.status === 'rejected' ? 'Not approved' : 'Bodhin asked for changes'}: ${app.note}`} />}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {STAGES.map((s, i) => {
          const done = i < current || (i === current && s.key === 'approved');
          const active = i === current;
          const color = done ? c.success : active ? c.primary : c.borderStrong;
          return (
            <View key={s.key} style={styles.stage}>
              <View style={{ alignItems: 'center' }}>
                <View style={[styles.node, { borderColor: color, backgroundColor: done ? c.success : active ? c.primarySoft : c.surface }]}>
                  {done ? <Ionicons name="checkmark" size={16} color="#fff" /> : active ? <View style={[styles.pulse, { backgroundColor: c.primary }]} /> : null}
                </View>
                {i < STAGES.length - 1 && <View style={[styles.line, { backgroundColor: i < current ? c.success : c.border }]} />}
              </View>
              <View style={{ flex: 1, paddingBottom: 18 }}>
                <Txt variant="bodyStrong" color={active || done ? c.ink : c.muted}>
                  {s.title}
                </Txt>
                <Txt variant="label" color={c.muted} style={{ fontWeight: '400' }}>
                  {s.sub}
                </Txt>
              </View>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  card: { borderRadius: 22, borderWidth: 1, padding: 18 },
  stage: { flexDirection: 'row', gap: 14 },
  node: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pulse: { width: 10, height: 10, borderRadius: 5 },
  line: { width: 2, flex: 1, minHeight: 24, marginVertical: 2 },
});
