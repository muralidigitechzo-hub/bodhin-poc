/**
 * Educator application form (blueprint: Draft → Submitted → Under review → Decision).
 * A bare tutor sign-up creates only a draft; THIS form is what reaches the Super Admin inbox,
 * so the reviewer has real details (academy, subjects, experience) to verify.
 */
import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ApiError, auth } from '@/api/client';
import { useAuth } from '@/store/auth';
import { Banner } from '@/ui/misc';
import { useTheme } from '@/theme/ThemeProvider';
import { Screen } from '@/ui/Screen';
import { BrandLogo } from '@/ui/Brand';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';

export default function Apply() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const existing = useMemo(() => (userId ? auth.getApplication(userId) : null), [userId]);
  const [f, setF] = useState({
    workspaceName: existing?.workspaceName ?? '',
    subjects: existing?.subjects?.join(', ') ?? '',
    experienceYears: existing?.experienceYears ? String(existing.experienceYears) : '',
    city: existing?.city ?? '',
    plannedStudents: existing?.plannedStudents ? String(existing.plannedStudents) : '',
    sampleUrl: existing?.sampleUrl ?? '',
  });
  const [idVerified, setIdVerified] = useState(!!existing?.idVerified);
  const [idBusy, setIdBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: null })); setError(null); };
  const refs = { subjects: useRef<any>(null), experience: useRef<any>(null), city: useRef<any>(null), students: useRef<any>(null), sample: useRef<any>(null) };

  /** POC: simulates DigiLocker/Aadhaar verification. Production: real DigiLocker flow; we never store ID numbers. */
  const verifyId = async () => {
    setIdBusy(true);
    await new Promise((r) => setTimeout(r, 1200));
    setIdVerified(true);
    setIdBusy(false);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.submitApplication(userId, {
        workspaceName: f.workspaceName,
        subjects: f.subjects.split(/[,，]/),
        experienceYears: Number(f.experienceYears) || 0,
        city: f.city,
        plannedStudents: Number(f.plannedStudents) || 0,
        sampleUrl: f.sampleUrl || undefined,
        idVerified,
      });
      router.replace('/application-status');
    } catch (e) {
      const err = e as ApiError;
      if (err.field) setErrors((x) => ({ ...x, [err.field!]: err.message }));
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!session) {
    router.replace('/sign-in');
    return null;
  }
  return (
    <Screen scroll footer={<Button title={existing?.status === 'changes_requested' ? 'Resubmit application' : 'Submit application'} iconRight="arrow-forward" loading={busy} onPress={submit} />}>
      <BrandLogo size="sm" />
      <View style={styles.head}>
        <TwoTone lead="Tell us about your" accent="academy" variant="title" center />
        <Txt center color={c.inkSoft}>Our team reviews every educator within 1–2 working days. These details are what we verify.</Txt>
      </View>
      {existing?.status === 'changes_requested' && existing.note && <Banner tone="info" text={`Bodhin asked for changes: ${existing.note}`} />}
      {error && <Banner tone="danger" text={error} />}
      <TextField label="Academy name" icon="business-outline" placeholder="e.g. Udhay Maths Academy" value={f.workspaceName} onChangeText={set('workspaceName')} error={errors.workspaceName} returnKeyType="next" onSubmitEditing={() => refs.subjects.current?.focus()} hint="Shown to students. Your web address comes after approval." />
      <TextField ref={refs.subjects} label="Subjects you teach" icon="book-outline" placeholder="e.g. Maths, Physics" value={f.subjects} onChangeText={set('subjects')} error={errors.subjects} returnKeyType="next" onSubmitEditing={() => refs.experience.current?.focus()} hint="Separate with commas." />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <TextField ref={refs.experience} label="Experience (years)" icon="ribbon-outline" placeholder="5" keyboardType="number-pad" value={f.experienceYears} onChangeText={set('experienceYears')} error={errors.experienceYears} returnKeyType="next" onSubmitEditing={() => refs.city.current?.focus()} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField ref={refs.students} label="Students planned" icon="people-outline" placeholder="100" keyboardType="number-pad" value={f.plannedStudents} onChangeText={set('plannedStudents')} error={errors.plannedStudents} hint="A rough 6-month goal." />
        </View>
      </View>
      <TextField ref={refs.city} label="City" icon="location-outline" placeholder="e.g. Madurai" value={f.city} onChangeText={set('city')} error={errors.city} returnKeyType="next" onSubmitEditing={() => refs.sample.current?.focus()} autoCapitalize="words" />
      <TextField ref={refs.sample} label="Teaching sample (optional)" icon="videocam-outline" placeholder="YouTube / Drive link" keyboardType="url" autoCapitalize="none" value={f.sampleUrl} onChangeText={set('sampleUrl')} error={errors.sampleUrl} hint="A short class video speeds up approval." />
      <View style={[styles.idCard, { backgroundColor: c.surface, borderColor: idVerified ? c.success : c.border }]}>
        <Ionicons name={idVerified ? 'shield-checkmark' : 'shield-outline'} size={22} color={idVerified ? c.success : c.primary} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">{idVerified ? 'Government ID verified' : 'Verify your identity'}</Txt>
          <Txt variant="label" color={c.muted} style={{ fontWeight: '400' }}>
            {idVerified ? 'Verified via DigiLocker (demo).' : 'Takes a minute via DigiLocker. We never see or store your ID number.'}
          </Txt>
        </View>
        {!idVerified && <Button title="Verify" variant="ghost" loading={idBusy} onPress={verifyId} />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  row: { flexDirection: 'row', gap: 12 },
  idCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 4 },
});
