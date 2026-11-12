/** Sign-up OTP verification. Auto-submits on the 6th digit. */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ApiError, DEMO_OTP, auth } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from '@/ui/Screen';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { BackButton, OtpInput } from '@/ui/misc';
import { maskTarget, useResendTimer } from '@/ui/useResendTimer';

export default function Verify() {
  const { c } = useTheme();
  const { setSession } = useAuth();
  const { userId, to = '', role } = useLocalSearchParams<{ userId: string; to: string; role: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useResendTimer();

  async function submit(value = code) {
    if (value.length < 6) return setError('Enter the 6-digit code.');
    setBusy(true);
    setError(null);
    try {
      const s = await auth.verifySignupOtp(userId, value);
      setSession(s);
      router.replace(role === 'tutor' ? '/apply' : '/home'); // tutor completes the academy form before anything reaches review
    } catch (e) {
      setError((e as ApiError).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (code.length === 6) submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <Screen
      footer={
        <>
          <Button title="Verify & Continue" iconRight="arrow-forward" loading={busy} disabled={code.length < 6} onPress={() => submit()} />
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.change} accessibilityRole="button">
            <Txt variant="label" color={c.primary}>
              Change mobile number
            </Txt>
          </Pressable>
        </>
      }
    >
      <BackButton fallback="/sign-up" />
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: c.primarySoft }]}>
          <Ionicons name="phone-portrait-outline" size={34} color={c.primary} />
        </View>
        <TwoTone lead="Verify your" accent="number" variant="title" center />
        <Txt center color={c.inkSoft}>
          Enter the 6-digit code we sent to{'\n'}
          <Txt variant="bodyStrong">{maskTarget(to)}</Txt>
        </Txt>
      </View>
      <OtpInput value={code} onChange={(v) => { setCode(v); setError(null); }} error={!!error} />
      {error && (
        <Txt variant="label" color={c.danger} center style={{ marginTop: 10 }} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      )}
      <View style={styles.resend}>
        {timer.canResend ? (
          <Pressable onPress={timer.restart} hitSlop={10} accessibilityRole="button">
            <Txt variant="bodyStrong" color={c.primary}>
              Resend code
            </Txt>
          </Pressable>
        ) : (
          <Txt color={c.muted}>Resend code in {timer.label}</Txt>
        )}
      </View>
      <Txt variant="caption" color={c.muted} center>
        Demo code: {DEMO_OTP}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 10, paddingTop: 20, paddingBottom: 28 },
  icon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  resend: { alignItems: 'center', marginTop: 24, marginBottom: 8, minHeight: 32, justifyContent: 'center' },
  change: { alignSelf: 'center', minHeight: 36, justifyContent: 'center' },
});
