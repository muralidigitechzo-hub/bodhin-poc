/** Forgot password in one screen, three steps: identify → code → new password → done. */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ApiError, DEMO_OTP, auth } from '@/api/client';
import { v } from '@/core/validate';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from '@/ui/Screen';
import { TwoTone, Txt } from '@/ui/Txt';
import { TextField } from '@/ui/TextField';
import { Button } from '@/ui/Button';
import { BackButton, Banner, OtpInput } from '@/ui/misc';
import { maskTarget, useResendTimer } from '@/ui/useResendTimer';

type Step = 'identify' | 'code' | 'password' | 'done';
const STEPS: Step[] = ['identify', 'code', 'password'];

export default function ForgotPassword() {
  const { c } = useTheme();
  const [step, setStep] = useState<Step>('identify');
  const [identifier, setIdentifier] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useResendTimer();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => {
    const err = v.identifier(identifier);
    if (err) return setError(err);
    run(async () => {
      const r = await auth.sendOtp(identifier);
      setSentTo(r.sentTo);
      timer.restart();
      setStep('code');
    });
  };
  const checkCode = (value = code) =>
    run(async () => {
      try {
        const r = await auth.verifyResetOtp(identifier, value);
        setToken(r.resetToken);
        setStep('password');
      } catch (e) {
        setCode('');
        throw e;
      }
    });
  const savePassword = () => {
    const err = v.password(pw);
    if (err) return setError(err);
    run(async () => {
      await auth.resetPassword(token, pw);
      setStep('done');
    });
  };

  useEffect(() => {
    if (step === 'code' && code.length === 6) checkCode(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const copy = {
    identify: { lead: 'Forgot', accent: 'password?', body: "Enter your email or mobile number. We'll send you a code to reset it." },
    code: { lead: 'Check your', accent: 'messages', body: `Enter the 6-digit code sent to ${maskTarget(sentTo)}` },
    password: { lead: 'Set a new', accent: 'password', body: 'Use at least 8 characters with letters and numbers.' },
    done: { lead: 'All', accent: 'set!', body: 'Your password has been updated. Sign in with your new password.' },
  }[step];

  const footer = {
    identify: <Button title="Send Code" iconRight="arrow-forward" loading={busy} onPress={sendCode} />,
    code: <Button title="Verify Code" iconRight="arrow-forward" loading={busy} disabled={code.length < 6} onPress={() => checkCode()} />,
    password: <Button title="Update Password" iconRight="checkmark" loading={busy} onPress={savePassword} />,
    done: <Button title="Back to Sign In" iconRight="arrow-forward" onPress={() => router.replace('/sign-in')} />,
  }[step];

  const stepIndex = STEPS.indexOf(step);

  return (
    <Screen footer={footer}>
      <View style={styles.top}>
        <BackButton fallback="/sign-in" />
        {step !== 'done' && (
          <View style={styles.progress} accessibilityLabel={`Step ${stepIndex + 1} of 3`}>
            {STEPS.map((s, i) => (
              <View key={s} style={[styles.seg, { backgroundColor: i <= stepIndex ? c.primary : c.border }]} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: step === 'done' ? c.successBg : c.primarySoft }]}>
          <Ionicons name={step === 'done' ? 'checkmark-done' : step === 'password' ? 'key-outline' : step === 'code' ? 'chatbox-ellipses-outline' : 'lock-open-outline'} size={34} color={step === 'done' ? c.success : c.primary} />
        </View>
        <TwoTone lead={copy.lead} accent={copy.accent} variant="title" center />
        <Txt center color={c.inkSoft}>
          {copy.body}
        </Txt>
      </View>

      {error && step !== 'code' && <Banner text={error} />}

      {step === 'identify' && (
        <TextField label="Email or mobile number" icon="mail-outline" placeholder="you@example.com or 98765 43210" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoFocus value={identifier} onChangeText={(t) => { setIdentifier(t); setError(null); }} onSubmitEditing={sendCode} returnKeyType="send" />
      )}

      {step === 'code' && (
        <View style={{ gap: 14 }}>
          <OtpInput value={code} onChange={(t) => { setCode(t); setError(null); }} error={!!error} />
          {error && (
            <Txt variant="label" color={c.danger} center>
              {error}
            </Txt>
          )}
          <View style={styles.resend}>
            {timer.canResend ? (
              <Pressable onPress={sendCode} hitSlop={10} accessibilityRole="button">
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
        </View>
      )}

      {step === 'password' && (
        <TextField label="New password" icon="lock-closed-outline" placeholder="At least 8 characters" secure autoFocus textContentType="newPassword" autoComplete="new-password" value={pw} onChangeText={(t) => { setPw(t); setError(null); }} onSubmitEditing={savePassword} returnKeyType="done" />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  progress: { flex: 1, flexDirection: 'row', gap: 6 },
  seg: { flex: 1, height: 5, borderRadius: 3 },
  head: { alignItems: 'center', gap: 10, paddingTop: 24, paddingBottom: 24 },
  icon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  resend: { alignItems: 'center', minHeight: 32, justifyContent: 'center' },
});
