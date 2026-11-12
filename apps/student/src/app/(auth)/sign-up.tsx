import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { ApiError, auth } from '@/api/client';
import { passwordStrength, v } from '@/core/validate';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Screen } from '@/ui/Screen';
import { BrandLogo } from '@/ui/Brand';
import { TwoTone, Txt } from '@/ui/Txt';
import { TextField, type InputRef } from '@/ui/TextField';
import { Button } from '@/ui/Button';
import { BackButton, Banner, Checkbox } from '@/ui/misc';

type RoleChoice = 'student' | 'tutor';
type Field = 'name' | 'email' | 'phone' | 'password' | 'terms';

export default function SignUp() {
  const { c, tenant } = useTheme();
  const [role, setRole] = useState<RoleChoice>('student');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field | 'form', string | null>>>({});
  const [busy, setBusy] = useState(false);
  const refs = { email: useRef<InputRef>(null), phone: useRef<InputRef>(null), password: useRef<InputRef>(null) };

  const set = (k: keyof typeof f) => (t: string) => {
    setF((s) => ({ ...s, [k]: k === 'phone' ? t.replace(/\D/g, '').slice(0, 10) : t }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: null }));
  };

  async function submit() {
    const e = { name: v.name(f.name), email: v.email(f.email), phone: v.phoneIN(f.phone), password: v.password(f.password), terms: terms ? null : 'Please accept the terms to continue.' };
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    try {
      const r = await auth.signUp({ ...f, role });
      router.push({ pathname: '/verify', params: { userId: r.userId, to: r.otpSentTo, role } });
    } catch (err) {
      const a = err as ApiError;
      setErrors(a.field ? { [a.field]: a.message } : { form: a.message });
    } finally {
      setBusy(false);
    }
  }

  const strength = passwordStrength(f.password);
  const strengthColor = [c.border, c.danger, c.warning, c.success][strength];

  return (
    <Screen
      footer={
        <>
          <Button title={role === 'tutor' ? 'Continue as Educator' : 'Create Account'} iconRight="arrow-forward" loading={busy} onPress={submit} />
          <View style={styles.footRow}>
            <Txt color={c.inkSoft}>Already have an account?</Txt>
            <Link href="/sign-in" replace asChild>
              <Pressable hitSlop={12} accessibilityRole="link">
                <Txt variant="bodyStrong" color={c.primary}>
                  Sign In
                </Txt>
              </Pressable>
            </Link>
          </View>
        </>
      }
    >
      <View style={styles.top}>
        <BackButton fallback="/sign-in" />
        <BrandLogo size="sm" />
        <View style={{ width: 48 }} />
      </View>
      <View style={styles.head}>
        <TwoTone lead="Create your" accent="account" variant="title" center />
        <Txt center color={c.inkSoft}>
          Takes less than a minute.
        </Txt>
      </View>

      {/* Tutor sign-up only exists on the main Bodhin platform; tutor workspaces enrol students. */}
      {!tenant && (
        <View style={styles.roles} accessibilityRole="radiogroup">
          {(
            [
              ['student', 'school', 'Student', 'Learn & earn certificates'],
              ['tutor', 'easel', 'Tutor / Educator', 'Teach & earn revenue'],
            ] as const
          ).map(([key, icon, title, sub]) => {
            const on = role === key;
            return (
              <Pressable
                key={key}
                onPress={() => setRole(key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[styles.role, { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : c.surface }, on && { borderWidth: 2 }]}
              >
                <View style={styles.roleTop}>
                  <Ionicons name={icon} size={26} color={key === 'student' ? c.primary : c.accent} />
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? c.primary : c.borderStrong} />
                </View>
                <Txt variant="bodyStrong">{title}</Txt>
                <Txt variant="caption" color={c.muted}>
                  {sub}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {errors.form && <Banner text={errors.form} />}
        <TextField label="Full name" icon="person-outline" placeholder="As it should appear on certificates" textContentType="name" autoComplete="name" autoCapitalize="words" returnKeyType="next" value={f.name} onChangeText={set('name')} onSubmitEditing={() => refs.email.current?.focus()} error={errors.name} />
        <TextField ref={refs.email} label="Email" icon="mail-outline" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" returnKeyType="next" value={f.email} onChangeText={set('email')} onSubmitEditing={() => refs.phone.current?.focus()} error={errors.email} />
        <TextField ref={refs.phone} label="Mobile number" icon="call-outline" prefix="🇮🇳 +91" placeholder="98765 43210" keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" returnKeyType="next" value={f.phone} onChangeText={set('phone')} onSubmitEditing={() => refs.password.current?.focus()} error={errors.phone} hint="We'll send a 6-digit code to verify it." />
        <View style={{ gap: 8 }}>
          <TextField ref={refs.password} label="Password" icon="lock-closed-outline" placeholder="At least 8 characters" secure textContentType="newPassword" autoComplete="new-password" returnKeyType="done" value={f.password} onChangeText={set('password')} onSubmitEditing={submit} error={errors.password} />
          {f.password.length > 0 && !errors.password && (
            <View style={styles.meter} accessibilityLabel={`Password strength ${['weak', 'weak', 'fair', 'strong'][strength]}`}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={[styles.bar, { backgroundColor: i <= strength ? strengthColor : c.border }]} />
              ))}
              <Txt variant="caption" color={strengthColor} style={{ width: 52, textAlign: 'right' }}>
                {['Weak', 'Weak', 'Fair', 'Strong'][strength]}
              </Txt>
            </View>
          )}
        </View>
        <View>
          <Checkbox checked={terms} onChange={(t) => { setTerms(t); setErrors((e) => ({ ...e, terms: null })); }} label="Agree to Terms and Privacy Policy">
            <Txt variant="label" color={c.inkSoft}>
              I agree to the <Txt variant="label" color={c.primary}>Terms of Service</Txt> and <Txt variant="label" color={c.primary}>Privacy Policy</Txt>
            </Txt>
          </Checkbox>
          {errors.terms && (
            <Txt variant="caption" color={c.danger}>
              {errors.terms}
            </Txt>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  head: { alignItems: 'center', gap: 4, paddingVertical: 14 },
  roles: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  role: { flex: 1, borderWidth: 1.2, borderRadius: radius.lg, padding: 14, gap: 4, minHeight: 112 },
  roleTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  card: { borderRadius: 22, borderWidth: 1, padding: 18, gap: 16 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  footRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, minHeight: 32 },
});
