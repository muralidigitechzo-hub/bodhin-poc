/** Certificate requests waiting for the course creator + custom certificate template editor. Shared by Tutor (/edu/certificates) and Admin (/admin/certificates). */
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, certification } from '@/api/client';
import { CERT_MIN_PROGRESS, DEFAULT_CERT_TEMPLATE, type CertTemplate } from '@/core/certification';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Avatar, BottomSheet, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, ScreenTop, shared } from '@/ui/section';
import { CertificatePaper } from '@/ui/CertificatePaper';

type Scope = 'educator' | 'admin';
type Queue = ReturnType<typeof certification.queue>;
type Row = Queue['pending'][number];
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const COLOR_SWATCHES = {
  primaryColor: ['#0B3B73', '#0F6E5A', '#4C1D95', '#9A3412', '#BE185D', '#1E293B'],
  accentColor: ['#C98A12', '#10B981', '#7C3AED', '#EA580C', '#0284C7', '#B45309'],
  bgColor: ['#FFFBF3', '#FFFFFF', '#F8FAFC', '#F0FDF4', '#FAF5FF', '#FFF7ED'],
  textColor: ['#101828', '#1E293B', '#0F172A', '#14532D', '#3B0764', '#431407'],
} as const;

export function CertApprovals({ scope, fallback }: { scope: Scope; fallback: string }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [rev, setRev] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<Row | null>(null);
  const [note, setNote] = useState('');
  const [editingTpl, setEditingTpl] = useState(false);
  const [draft, setDraft] = useState<CertTemplate>(DEFAULT_CERT_TEMPLATE);
  const [tplErr, setTplErr] = useState<string | null>(null);
  useFocusEffect(useCallback(() => setRev((r) => r + 1), []));
  void rev;

  let q: Queue | null = null;
  let denied: string | null = null;
  let tplInfo: ReturnType<typeof certification.template> | null = null;
  try {
    q = certification.queue(userId, scope);
    tplInfo = certification.template(userId, scope);
  } catch (e) {
    denied = e instanceof ApiError ? e.message : 'You can’t review certificates.';
  }

  const openTemplateEditor = () => {
    setTplErr(null);
    setDraft(tplInfo?.template ?? DEFAULT_CERT_TEMPLATE);
    setEditingTpl(true);
  };

  const pickTemplateImage = async () => {
    setTplErr(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], multiple: false, copyToCacheDirectory: true });
      if (r.canceled) return;
      const f = r.assets[0];
      if (f.size && f.size > 1.5 * 1024 * 1024) return setTplErr('Image is too large. Use a JPG, PNG or WebP under 1.5 MB.');
      let uri = f.uri;
      if (Platform.OS === 'web') {
        const blob = await (await fetch(f.uri)).blob();
        uri = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.onerror = () => rej(new Error('read'));
          fr.readAsDataURL(blob);
        });
      }
      setDraft((d) => ({ ...d, backgroundImage: uri }));
    } catch {
      setTplErr('Couldn’t read that image. Try another file.');
    }
  };

  const saveTemplate = () => {
    setTplErr(null);
    try {
      certification.saveTemplate(userId, scope, draft);
      setEditingTpl(false);
      setMsg('Certificate template saved. Newly approved certificates will use it.');
      setRev((r) => r + 1);
    } catch (e) {
      setTplErr(e instanceof ApiError ? e.message : 'Could not save template.');
    }
  };

  const resetTemplate = () => {
    setTplErr(null);
    try {
      const res = certification.resetTemplate(userId, scope);
      setDraft(res.template);
      setEditingTpl(false);
      setMsg('Certificate template reset to default.');
      setRev((r) => r + 1);
    } catch (e) {
      setTplErr(e instanceof ApiError ? e.message : 'Could not reset template.');
    }
  };

  const decide = async (row: Row, decision: 'approve' | 'reject', text = '') => {
    setBusy(row.r.id);
    setErr(null);
    try {
      await certification.decide(userId, scope, row.r.id, decision, text);
      setMsg(decision === 'approve' ? `Approved. ${row.student} can now download the certificate.` : `Declined. ${row.student} has been told what to fix.`);
      setDeclining(null);
      setNote('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      if (decision === 'approve') setDeclining(null);
    } finally {
      setBusy(null);
      setRev((r) => r + 1);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Certificate approvals" sub={scope === 'admin' ? 'For Bodhin’s own courses' : 'Learners who finished your courses'} fallback={fallback} />
        <ScrollView contentContainerStyle={shared.scroll} showsVerticalScrollIndicator={false}>
          <View style={shared.inner}>
            {msg && <Banner tone="success" text={msg} />}
            {err && !declining && <Banner text={err} />}
            {denied ? <Banner text={denied} /> : q && (
              <>
                <Txt variant="caption" color={c.muted}>A request appears here on its own once a learner has bought the course, finished at least {CERT_MIN_PROGRESS}% of it and passed its quizzes. Approving issues the certificate to the learner.</Txt>

                {tplInfo && (
                  <Card title="Certificate template" right={<Pill text={tplInfo.customized ? 'Custom' : 'Default'} tone={tplInfo.customized ? 'success' : 'neutral'} />}>
                    <CertificatePaper
                      compact
                      template={tplInfo.template}
                      recipientName="Learner Name"
                      courseTitle="Sample Course Title"
                      tutorName={session?.user.name ?? 'Instructor'}
                      issuedAt={new Date().toISOString()}
                    />
                    <View style={styles.actions}>
                      <Button title="Upload / Edit template" iconLeft="color-palette-outline" size="md" style={{ flex: 1 }} onPress={openTemplateEditor} />
                      {tplInfo.customized && <Button title="Reset" size="md" variant="outline" onPress={resetTemplate} />}
                    </View>
                  </Card>
                )}

                <Card title={`Waiting for you · ${q.pending.length}`}>
                  {q.pending.length === 0 ? (
                    <Txt color={c.muted}>Nothing to approve right now.</Txt>
                  ) : (
                    <View style={{ gap: 12 }}>
                      {q.pending.map((row) => (
                        <View key={row.r.id} style={[styles.row, { borderColor: c.border }]}>
                          <View style={styles.top}>
                            <Avatar name={row.student} size={40} />
                            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                              <Txt variant="bodyStrong" numberOfLines={1}>{row.student}</Txt>
                              <Txt variant="caption" color={c.muted} numberOfLines={2}>{row.course.title}</Txt>
                            </View>
                            <Txt variant="caption" color={c.muted}>{day(row.r.requestedAt)}</Txt>
                          </View>
                          <View style={styles.pills}>
                            <Pill text={`${row.r.progressPct}% of lessons`} tone="success" icon="checkmark" />
                            <Pill text={row.r.quizzes ? `Quizzes passed · avg ${row.r.quizPct ?? '–'}%` : 'No quiz in this course'} tone="info" />
                            {!row.eligible && <Pill text="No longer qualifies" tone="warning" />}
                          </View>
                          {!row.eligible && <Txt variant="caption" color={c.danger}>The learner’s progress changed after asking, so approval is blocked. You can decline with a note.</Txt>}
                          <View style={styles.actions}>
                            <Button title="Approve" iconLeft="checkmark" size="md" style={{ flex: 1 }} loading={busy === row.r.id} disabled={!row.eligible || !!busy} onPress={() => decide(row, 'approve')} />
                            <Button title="Decline" size="md" variant="outline" style={{ flex: 1 }} disabled={!!busy} onPress={() => { setErr(null); setNote(''); setDeclining(row); }} />
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </Card>
                {q.decided.length > 0 && (
                  <Card title="Recently decided">
                    <View style={{ gap: 10 }}>
                      {q.decided.map((row) => (
                        <View key={row.r.id} style={styles.top}>
                          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <Txt variant="label" numberOfLines={1}>{row.student} · {row.course.title}</Txt>
                            <Txt variant="caption" color={c.muted} numberOfLines={2}>{day(row.r.decidedAt)}{row.r.decidedByName ? ` · ${row.r.decidedByName}` : ''}{row.r.note ? ` · “${row.r.note}”` : ''}</Txt>
                          </View>
                          <Pill text={row.r.status === 'approved' ? 'Approved' : 'Declined'} tone={row.r.status === 'approved' ? 'success' : 'neutral'} />
                        </View>
                      ))}
                    </View>
                  </Card>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet
        open={editingTpl}
        onClose={() => setEditingTpl(false)}
        title="Customize certificate template"
        footer={
          <>
            <Button title="Reset" variant="outline" size="md" onPress={resetTemplate} />
            <Button title="Save template" size="md" style={{ flex: 1 }} onPress={saveTemplate} />
          </>
        }
      >
        <CertificatePaper
          compact
          template={draft}
          recipientName="Learner Name"
          courseTitle="Sample Course Title"
          tutorName={session?.user.name ?? 'Instructor'}
          issuedAt={new Date().toISOString()}
        />

        <View style={{ gap: 6 }}>
          <Txt variant="label" color={c.muted}>TEMPLATE BACKGROUND IMAGE</Txt>
          <View style={styles.actions}>
            <Button title={draft.backgroundImage ? 'Change template image' : 'Upload template image'} iconLeft="cloud-upload-outline" size="md" variant="outline" style={{ flex: 1 }} onPress={pickTemplateImage} />
            {!!draft.backgroundImage && (
              <Button title="Remove" size="md" variant="ghost" onPress={() => setDraft((d) => ({ ...d, backgroundImage: undefined }))} />
            )}
          </View>
          <Txt variant="caption" color={c.muted}>JPG, PNG or WebP under 1.5 MB. Shown behind the certificate frame.</Txt>
        </View>

        <View style={{ gap: 8 }}>
          <Txt variant="label" color={c.muted}>TEMPLATE TEXT</Txt>
          <TextField label="Organization / Header" value={draft.orgName} onChangeText={(v) => setDraft((d) => ({ ...d, orgName: v }))} maxLength={60} />
          <View style={styles.actions}>
            <View style={{ flex: 1 }}><TextField label="Heading" value={draft.heading} onChangeText={(v) => setDraft((d) => ({ ...d, heading: v }))} maxLength={40} /></View>
            <View style={{ flex: 1 }}><TextField label="Subheading" value={draft.subheading} onChangeText={(v) => setDraft((d) => ({ ...d, subheading: v }))} maxLength={60} /></View>
          </View>
          <TextField label="Intro line" value={draft.introText} onChangeText={(v) => setDraft((d) => ({ ...d, introText: v }))} maxLength={120} />
          <TextField label="Completion line" value={draft.completionText} onChangeText={(v) => setDraft((d) => ({ ...d, completionText: v }))} maxLength={120} />
          <TextField label="Instructor label" value={draft.instructorLabel} onChangeText={(v) => setDraft((d) => ({ ...d, instructorLabel: v }))} maxLength={40} />
        </View>

        <View style={{ gap: 10 }}>
          <Txt variant="label" color={c.muted}>TEMPLATE COLORS</Txt>
          <ColorPickerRow label="Primary / Border color" value={draft.primaryColor} swatches={COLOR_SWATCHES.primaryColor} onChange={(v) => setDraft((d) => ({ ...d, primaryColor: v }))} />
          <ColorPickerRow label="Accent color" value={draft.accentColor} swatches={COLOR_SWATCHES.accentColor} onChange={(v) => setDraft((d) => ({ ...d, accentColor: v }))} />
          <ColorPickerRow label="Background color" value={draft.bgColor} swatches={COLOR_SWATCHES.bgColor} onChange={(v) => setDraft((d) => ({ ...d, bgColor: v }))} />
          <ColorPickerRow label="Text color" value={draft.textColor} swatches={COLOR_SWATCHES.textColor} onChange={(v) => setDraft((d) => ({ ...d, textColor: v }))} />
        </View>

        {tplErr && <Banner text={tplErr} />}
      </BottomSheet>

      <BottomSheet open={!!declining} onClose={() => setDeclining(null)} title="Decline certificate" footer={<Button title="Decline and tell learner" size="md" style={{ flex: 1 }} loading={!!busy} disabled={!note.trim()} onPress={() => declining && decide(declining, 'reject', note)} />}>
        <Txt color={c.inkSoft}>{declining?.student} · {declining?.course.title}</Txt>
        <TextField label="What should they fix?" value={note} onChangeText={setNote} placeholder="e.g. Please resubmit the final project before we issue it" multiline maxLength={300} hint={`${note.length} / 300`} />
        {err && <Banner text={err} />}
      </BottomSheet>
    </View>
  );
}

function ColorPickerRow({ label, value, swatches, onChange }: { label: string; value: string; swatches: readonly string[]; onChange: (v: string) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="caption" color={c.inkSoft}>{label}</Txt>
      <View style={styles.colorRow}>
        <View style={styles.swatches}>
          {swatches.map((hex) => {
            const active = value.toUpperCase() === hex.toUpperCase();
            return (
              <Pressable
                key={hex}
                onPress={() => onChange(hex)}
                accessibilityRole="button"
                accessibilityLabel={`${label} ${hex}`}
                style={[styles.swatch, { backgroundColor: hex, borderColor: active ? c.ink : c.borderStrong, borderWidth: active ? 2.5 : 1 }]}
              >
                {active && <Ionicons name="checkmark" size={14} color={hex === '#FFFFFF' || hex === '#FFFBF3' || hex === '#F8FAFC' || hex === '#F0FDF4' || hex === '#FAF5FF' || hex === '#FFF7ED' ? '#101828' : '#fff'} />}
              </Pressable>
            );
          })}
        </View>
        <View style={{ width: 110 }}>
          <TextField label="Hex" value={value} onChangeText={onChange} placeholder="#0B3B73" maxLength={7} autoCapitalize="characters" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  colorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flex: 1 },
  swatch: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
