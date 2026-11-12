/**
 * Super Admin portal — web only (admin.thebodhin.com). Not part of the store apps.
 * Gate: signed in → Bodhin staff role → 2-step code (12 h). Then tabs + stack screens.
 */
import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Redirect, Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, admin } from '@/api/client';
import { ROLE_LABEL } from '@/core/admin';
import { adminMembership, useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { BrandLogo } from '@/ui/Brand';
import { OtpInput } from '@/ui/misc';

export default function AdminLayout() {
  const { session, ready, signOut } = useAuth();
  const [, force] = useState(0);
  if (!ready) return null;
  if (!session) return <Redirect href="/sign-in" />;
  if (!adminMembership(session)) return <Redirect href="/home" />;
  if (Platform.OS !== 'web') return <WebOnly onSignOut={() => { signOut(); router.replace('/sign-in'); }} />;
  const me = admin.me(session.user.id);
  if (!me) return <Redirect href="/home" />;
  if (!me.verified) return <TwoStep userId={session.user.id} name={me.user.name} role={ROLE_LABEL[me.role]} onDone={() => force((n) => n + 1)} onCancel={() => { signOut(); router.replace('/sign-in'); }} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

function TwoStep({ userId, name, role, onDone, onCancel }: { userId: string; name: string; role: string; onDone: () => void; onCancel: () => void }) {
  const { c } = useTheme();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (v = code) => {
    setBusy(true);
    setErr(null);
    try {
      await admin.verify(userId, v);
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not verify.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={[styles.gate, { backgroundColor: c.ivory }]}>
      <View style={styles.box}>
        <BrandLogo size="md" />
        <View style={[styles.lock, { backgroundColor: c.primarySoft }]}><Ionicons name="shield-checkmark" size={30} color={c.primary} /></View>
        <Txt variant="title" center>Admin verification</Txt>
        <Txt color={c.muted} center>{name} · {role}. Enter the 6-digit code from your authenticator app.</Txt>
        <OtpInput value={code} onChange={(v) => { setCode(v); if (v.length === 6) go(v); }} error={!!err} />
        {err ? <Txt variant="caption" color={c.danger} center>{err}</Txt> : <Txt variant="caption" color={c.muted} center>Demo code: 123456 · valid for 12 hours on this device</Txt>}
        <Button title="Verify" loading={busy} disabled={code.length !== 6} onPress={() => go()} />
        <Button title="Use a different account" variant="ghost" onPress={onCancel} />
      </View>
    </SafeAreaView>
  );
}

function WebOnly({ onSignOut }: { onSignOut: () => void }) {
  const { c } = useTheme();
  return (
    <SafeAreaView style={[styles.gate, { backgroundColor: c.ivory }]}>
      <View style={styles.box}>
        <Ionicons name="desktop-outline" size={44} color={c.primary} style={{ alignSelf: 'center' }} />
        <Txt variant="title" center>Admin portal is web-only</Txt>
        <Txt color={c.muted} center>Open admin.thebodhin.com in your phone or laptop browser. Tip: “Add to Home Screen” makes it open like an app.</Txt>
        <Button title="Sign out" variant="outline" onPress={onSignOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  box: { width: '100%', maxWidth: 420, gap: 14 },
  lock: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
});
