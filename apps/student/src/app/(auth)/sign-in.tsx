import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { ApiError, auth } from '@/api/client';
import { v } from '@/core/validate';
import { homePath, useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from '@/ui/Screen';
import { BrandLogo, PoweredBy } from '@/ui/Brand';
import { TwoTone, Txt } from '@/ui/Txt';
import { TextField, type InputRef } from '@/ui/TextField';
import { Button } from '@/ui/Button';
import { Banner, Checkbox, Divider } from '@/ui/misc';

export default function SignIn() {
  const { c, brand } = useTheme();
  const { setSession } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ identifier?: string | null; password?: string | null; form?: string }>({});
  const [busy, setBusy] = useState<null | 'form' | 'google' | 'apple'>(null);
  const pwRef = useRef<InputRef>(null);

  async function submit() {
    const e = { identifier: v.identifier(identifier), password: password ? null : 'Enter your password.' };
    setErrors(e);
    if (e.identifier || e.password) return;
    setBusy('form');
    try {
      const sess = await auth.signIn(identifier, password);
      setSession(sess);
      router.replace(homePath(sess, null) as any);
    } catch (err) {
      const a = err as ApiError;
      setErrors(a.field ? { [a.field]: a.message } : { form: a.message });
    } finally {
      setBusy(null);
    }
  }

  async function social(p: 'google' | 'apple') {
    setBusy(p);
    try {
      setSession(await auth.socialSignIn(p));
      router.replace('/home');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      footer={
        <>
          <Button title="Sign In" iconRight="arrow-forward" loading={busy === 'form'} disabled={!!busy && busy !== 'form'} onPress={submit} />
          <View style={styles.footRow}>
            <Txt color={c.inkSoft}>Don't have an account?</Txt>
            <Link href="/sign-up" replace asChild>
              <Pressable hitSlop={12} accessibilityRole="link">
                <Txt variant="bodyStrong" color={c.primary}>
                  Sign Up
                </Txt>
              </Pressable>
            </Link>
          </View>
        </>
      }
    >
      <View style={styles.head}>
        <BrandLogo size="md" />
        <TwoTone lead="Welcome" accent="Back" center />
        <Txt center color={c.inkSoft}>
          Sign in to {brand.displayName} and continue your learning journey.
        </Txt>
      </View>

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {errors.form && <Banner text={errors.form} />}
        <TextField
          label="Email or mobile number"
          icon="mail-outline"
          placeholder="you@example.com or 98765 43210"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="username"
          returnKeyType="next"
          value={identifier}
          onChangeText={(t) => {
            setIdentifier(t);
            if (errors.identifier) setErrors((e) => ({ ...e, identifier: null }));
          }}
          onSubmitEditing={() => pwRef.current?.focus()}
          error={errors.identifier}
        />
        <TextField
          ref={pwRef}
          label="Password"
          icon="lock-closed-outline"
          placeholder="Enter your password"
          secure
          textContentType="password"
          autoComplete="password"
          returnKeyType="go"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            if (errors.password) setErrors((e) => ({ ...e, password: null }));
          }}
          onSubmitEditing={submit}
          error={errors.password}
        />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Checkbox checked={remember} onChange={setRemember} label="Remember me">
              <Txt variant="label" color={c.inkSoft}>
                Remember me
              </Txt>
            </Checkbox>
          </View>
          <Link href="/forgot-password" asChild>
            <Pressable hitSlop={10} accessibilityRole="link" style={styles.link}>
              <Txt variant="label" color={c.primary}>
                Forgot password?
              </Txt>
            </Pressable>
          </Link>
        </View>

        <Divider label="or continue with" />
        <View style={styles.social}>
          <Button title="Google" variant="outline" size="md" style={{ flex: 1 }} loading={busy === 'google'} disabled={!!busy} leading={<Ionicons name="logo-google" size={18} color="#DB4437" />} onPress={() => social('google')} />
          <Button title="Apple" variant="outline" size="md" style={{ flex: 1 }} loading={busy === 'apple'} disabled={!!busy} leading={<Ionicons name="logo-apple" size={20} color="#000" />} onPress={() => social('apple')} />
        </View>
      </View>

      <View style={[styles.demo, { backgroundColor: c.accentSoft }]}>
        <Txt variant="caption" color={c.inkSoft} center>
          Student: arjun@demo.in · Educator: rajesh@demo.in · Tutor: meera@demo.in · Super Admin (web): admin@demo.in · password demo123
        </Txt>
      </View>
      <PoweredBy />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 10, paddingTop: 16, paddingBottom: 20 },
  card: { borderRadius: 22, borderWidth: 1, padding: 18, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  link: { minHeight: 44, justifyContent: 'center' },
  social: { flexDirection: 'row', gap: 12 },
  footRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, minHeight: 32 },
  demo: { marginTop: 14, borderRadius: 12, padding: 10, marginBottom: 8 },
});
