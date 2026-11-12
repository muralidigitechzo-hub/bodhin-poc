/** Grade one submission: files/link/note, rubric steppers, quick feedback, Grade & next or ask to resubmit. */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, grading } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, BottomSheet, Chip, IconButton, Pill, ProgressRing } from '@/ui/kit';
import { Banner } from '@/ui/misc';

const QUICK = ['Well researched and clearly presented.', 'Good effort — add more specific examples.', 'Follow the template format next time.', 'Great use of data to support your points.'];

export default function GradeSubmission() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const d = grading.detail(userId, id);
  const [scores, setScores] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ret, setRet] = useState(false);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!d) return;
    setScores(d.s.grade ? d.s.grade.rubric.map((r) => r.score) : d.rubric.map(() => 0));
    setFeedback(d.s.grade?.feedback ?? '');
    setErr(null);
    setDone(null);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, justifyContent: 'center', gap: 16 }}>
        <Banner text="This submission isn’t available to you." />
        <Button title="Back to queue" onPress={() => router.replace('/edu/grading')} />
      </SafeAreaView>
    );
  }
  const total = d.rubric.reduce((s, r) => s + r.max, 0);
  const got = scores.reduce((s, n) => s + n, 0);
  const pct = total ? Math.round((got / total) * 100) : 0;
  const pass = pct >= d.a.passPct;
  const next = (nid: string | null) => (nid ? router.replace({ pathname: '/edu/grade/[id]', params: { id: nid } }) : router.replace('/edu/grading'));

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await grading.grade(userId, id, { scores, feedback });
      setDone(`Graded ${r.pct}% · student notified`);
      setTimeout(() => next(r.nextId), 900);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save the grade.');
    } finally {
      setBusy(false);
    }
  };
  const sendBack = async () => {
    try {
      const r = await grading.requestResubmit(userId, id, note);
      setRet(false);
      setDone('Sent back for resubmission');
      setTimeout(() => next(r.nextId), 900);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not return.');
      setRet(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="chevron-back" label="Back to queue" tone="filled" onPress={() => router.replace('/edu/grading')} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="heading" numberOfLines={1}>{d.a.title}</Txt>
            <Txt variant="caption" color={c.muted}>{d.s.status === 'submitted' ? `${d.remaining} more waiting after this` : d.s.status === 'graded' ? 'Already graded — you can update it' : 'Returned to student'}</Txt>
          </View>
          {d.nextId && <IconButton icon="play-skip-forward" label="Skip to next" tone="filled" onPress={() => next(d.nextId)} />}
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            {done && <Banner tone="success" text={done} />}
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <Avatar name={d.name} size={48} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong" numberOfLines={1}>{d.name}</Txt>
                <Txt variant="caption" color={c.muted}>Submitted {d.s.submittedAt ? new Date(d.s.submittedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'}</Txt>
                {d.history.length > 0 && <Txt variant="caption" color={c.inkSoft}>Past grades: {d.history.slice(0, 3).map((h) => `${h.pct}%`).join(', ')}</Txt>}
              </View>
              {d.late && <View><Pill text="Late" tone="warning" /></View>}
              {d.person && <IconButton icon="person-outline" label="Open student profile" onPress={() => router.push({ pathname: '/edu/student/[id]', params: { id: d.person!.id } })} />}
            </View>

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Txt variant="label" color={c.muted}>SUBMISSION</Txt>
              {d.s.files.map((f) => (
                <Pressable key={f.name} onPress={() => setPreview(f.name)} style={[styles.file, { borderColor: c.border }]} accessibilityRole="button" accessibilityLabel={`Open ${f.name}`}>
                  <View style={[styles.fileIcon, { backgroundColor: c.dangerBg }]}><Ionicons name="document-text" size={20} color={c.danger} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="bodyStrong" numberOfLines={1}>{f.name}</Txt>
                    <Txt variant="caption" color={c.muted}>{f.sizeMb} MB · tap to view</Txt>
                  </View>
                  <Ionicons name="eye-outline" size={20} color={c.inkSoft} />
                </Pressable>
              ))}
              {!!d.s.link && (
                <View style={[styles.file, { borderColor: c.border }]}>
                  <View style={[styles.fileIcon, { backgroundColor: c.infoBg }]}><Ionicons name="link" size={20} color={c.info} /></View>
                  <Txt variant="label" color={c.info} numberOfLines={1} style={{ flex: 1 }}>{d.s.link}</Txt>
                </View>
              )}
              {!!d.s.note && <Txt color={c.inkSoft}>“{d.s.note}”</Txt>}
              {!!d.a.requirements?.length && (
                <View style={{ gap: 4, marginTop: 4 }}>
                  <Txt variant="caption" color={c.muted}>Brief checklist</Txt>
                  {d.a.requirements.map((r) => <Txt key={r} variant="caption" color={c.inkSoft}>• {r}</Txt>)}
                </View>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <ProgressRing pct={pct} size={58} color={pass ? c.success : c.warning} />
                <View style={{ flex: 1 }}>
                  <Txt variant="heading">{got} / {total} marks</Txt>
                  <Txt variant="caption" color={pass ? c.success : c.warning}>{pass ? 'Pass' : `Below pass mark (${d.a.passPct}%)`}</Txt>
                </View>
              </View>
              {d.rubric.map((r, i) => (
                <View key={r.item} style={styles.rubric}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="label" numberOfLines={2}>{r.item}</Txt>
                    <Txt variant="caption" color={c.muted}>out of {r.max}</Txt>
                  </View>
                  <Pressable onPress={() => setScores((x) => x.map((v, j) => (j === i ? Math.max(0, v - 1) : v)))} style={[styles.step, { borderColor: c.border }]} accessibilityRole="button" accessibilityLabel={`Decrease ${r.item}`}><Ionicons name="remove" size={20} color={c.ink} /></Pressable>
                  <Txt variant="heading" style={{ width: 34, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{scores[i] ?? 0}</Txt>
                  <Pressable onPress={() => setScores((x) => x.map((v, j) => (j === i ? Math.min(r.max, v + 1) : v)))} style={[styles.step, { borderColor: c.border }]} accessibilityRole="button" accessibilityLabel={`Increase ${r.item}`}><Ionicons name="add" size={20} color={c.ink} /></Pressable>
                  <Pressable onPress={() => setScores((x) => x.map((v, j) => (j === i ? r.max : v)))} style={[styles.full, { backgroundColor: c.successBg }]} accessibilityRole="button" accessibilityLabel={`Full marks for ${r.item}`}><Txt variant="caption" color={c.success}>Full</Txt></Pressable>
                </View>
              ))}
            </View>

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Txt variant="label" color={c.muted}>FEEDBACK FOR THE STUDENT</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {QUICK.map((t) => <Chip key={t} label={t} onPress={() => setFeedback((f) => (f ? `${f} ${t}` : t))} />)}
              </View>
              <TextInput value={feedback} onChangeText={setFeedback} multiline placeholder="What went well, and one thing to improve." placeholderTextColor={c.muted} style={[styles.area, { borderColor: err ? c.danger : c.border, color: c.ink }]} accessibilityLabel="Feedback" />
              {err && <Txt variant="caption" color={c.danger}>{err}</Txt>}
            </View>
          </View>
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
          <View style={{ flexDirection: 'row', gap: 8, width: '100%', maxWidth: layout.contentMaxWidth }}>
            <Button title="Send back" variant="outline" size="md" iconLeft="arrow-undo" style={{ flex: 1 }} onPress={() => { setNote(''); setRet(true); }} />
            <Button title={d.nextId ? 'Grade & next' : 'Save grade'} size="md" iconLeft="checkmark" loading={busy} style={{ flex: 1.4 }} onPress={submit} />
          </View>
        </View>
      </SafeAreaView>

      <BottomSheet open={ret} onClose={() => setRet(false)} title="Ask for a resubmission" footer={<Button title="Send back" size="md" style={{ flex: 1 }} onPress={sendBack} />}>
        <Txt color={c.inkSoft}>The student gets a notification and can upload again. No grade is recorded.</Txt>
        <TextInput value={note} onChangeText={setNote} multiline placeholder="e.g. Please add the keyword metrics table (volume, difficulty)." placeholderTextColor={c.muted} style={[styles.area, { borderColor: c.border, color: c.ink, marginTop: 8 }]} accessibilityLabel="What to fix" />
      </BottomSheet>
      <BottomSheet open={!!preview} onClose={() => setPreview(null)} title={preview ?? ''}>
        <View style={[styles.doc, { backgroundColor: c.surfaceMuted }]}>
          {[90, 70, 85, 60, 95, 40, 80, 75].map((w, i) => <View key={i} style={{ height: i === 0 ? 14 : 8, width: `${w}%`, backgroundColor: i === 0 ? c.inkSoft : c.borderStrong, borderRadius: 4 }} />)}
          <Txt variant="caption" color={c.muted} center style={{ marginTop: 10 }}>Document preview (simulated in this POC)</Txt>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 24 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 10, minHeight: 56 },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rubric: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 52 },
  step: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  full: { paddingHorizontal: 8, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  area: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 100, textAlignVertical: 'top', fontSize: 15 },
  doc: { borderRadius: 14, padding: 18, gap: 10 },
  footer: { borderTopWidth: 1, padding: 12, alignItems: 'center' },
});
