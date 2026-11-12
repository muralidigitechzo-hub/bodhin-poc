/** Assignment: details, submission (file and/or link + note, save draft or submit) and feedback. */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, assessments } from '@/api/client';
import type { Submission } from '@/core/assess';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { IconButton, Pill, ProgressBar } from '@/ui/kit';
import { Banner } from '@/ui/misc';

type Tab = 'details' | 'submission' | 'feedback';
const fmtDue = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function AssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const found = assessments.get(id);
  const [sub, setSub] = useState<Submission | null>(() => assessments.submission(userId, id));
  const [tab, setTab] = useState<Tab>(sub?.status === 'graded' ? 'feedback' : sub ? 'submission' : 'details');
  const [files, setFiles] = useState(sub?.files ?? []);
  const [mode, setMode] = useState<'file' | 'link'>(sub?.link ? 'link' : 'file');
  const [link, setLink] = useState(sub?.link ?? '');
  const [note, setNote] = useState(sub?.note ?? '');
  const [busy, setBusy] = useState<null | 'draft' | 'submit'>(null);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  if (!found) return null;
  const { a, course, tutor } = found;
  const status = assessments.statusOf(userId, a);
  const locked = sub?.status === 'graded';
  const submitted = sub?.status === 'submitted';
  const overdue = status === 'overdue';
  const msLeft = a.dueAt ? new Date(a.dueAt).getTime() - Date.now() : 0;
  const daysLeft = Math.ceil(msLeft / 864e5);

  const pick = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: false });
      if (r.canceled) return;
      const f = r.assets[0];
      const ext = (f.name.split('.').pop() ?? '').toUpperCase();
      if (a.accepts && !a.accepts.includes(ext)) return setMsg({ tone: 'danger', text: `${f.name} is not an accepted type. Use ${a.accepts.join(', ')}.` });
      setFiles([{ name: f.name, sizeMb: Math.max(0.1, Math.round(((f.size ?? 0) / 1048576) * 10) / 10) }]);
      setMsg(null);
    } catch {
      // Picker unavailable (some preview frames) → attach a sample so the flow can be tested.
      setFiles([{ name: `${a.title.toLowerCase().replace(/[^a-z]+/g, '-')}.pdf`, sizeMb: 3.8 }]);
    }
  };

  const save = async (submit: boolean) => {
    setBusy(submit ? 'submit' : 'draft');
    setMsg(null);
    try {
      const s = await assessments.saveSubmission(userId, a.id, { files: mode === 'file' ? files : [], link: mode === 'link' ? link : undefined, note }, submit);
      setSub(s);
      setMsg({ tone: 'success', text: submit ? `Submitted. ${tutor.name.split(' ')[0]} will review it and you'll get a notification.` : 'Draft saved.' });
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as ApiError).message });
    } finally {
      setBusy(null);
    }
  };

  const statusPill = { pending: ['Pending', 'warning'], in_progress: ['Draft saved', 'info'], overdue: ['Overdue', 'live'], submitted: ['Submitted', 'success'], graded: ['Graded', 'success'], scheduled: ['Scheduled', 'info'], completed: ['Completed', 'success'] } as const;
  const [pl, pt] = statusPill[status];

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.center}>
            <View style={styles.top}>
              <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/learning', params: { tab: 'assessments' } }))} />
            </View>

            <View style={{ gap: 6 }}>
              <Pill text={pl} tone={pt} />
              <Txt variant="title">{a.title}</Txt>
              <Txt variant="label" color={c.muted} style={{ fontWeight: '500' }}>{course.title}{a.moduleTitle ? ` · ${a.moduleTitle}` : ''}</Txt>
            </View>

            {a.dueAt && (
              <View style={[styles.due, { backgroundColor: overdue ? c.dangerBg : c.surface, borderColor: overdue ? c.danger : c.border }]}>
                <Ionicons name="calendar-outline" size={22} color={overdue ? c.danger : c.primary} />
                <View style={{ flex: 1 }}>
                  <Txt variant="caption" color={c.muted}>Due</Txt>
                  <Txt variant="bodyStrong">{fmtDue(a.dueAt)}</Txt>
                </View>
                <Txt variant="label" color={overdue ? c.danger : daysLeft <= 2 ? c.warning : c.success}>
                  {locked || submitted ? `${a.marks} marks` : overdue ? 'Overdue' : daysLeft <= 1 ? 'Due today' : `${daysLeft} days left`}
                </Txt>
              </View>
            )}

            <View style={styles.tabs} accessibilityRole="tablist">
              {([['details', 'Details'], ['submission', 'My submission'], ['feedback', 'Feedback']] as const).map(([k, l]) => (
                <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} style={[styles.tab, { backgroundColor: tab === k ? c.primary : c.surface, borderColor: tab === k ? c.primary : c.border }]}>
                  <Txt variant="label" color={tab === k ? '#fff' : c.ink}>{l}</Txt>
                </Pressable>
              ))}
            </View>

            {msg && <Banner tone={msg.tone} text={msg.text} />}
            {!!sub?.returnNote && sub.status === 'draft' && <Banner tone="info" text={`Your tutor asked for a resubmission: “${sub.returnNote}”`} />}

            {tab === 'details' && (
              <>
                <Section icon="document-text-outline" title="Instructions">
                  <Txt color={c.inkSoft}>{a.instructions}</Txt>
                </Section>
                {!!a.requirements?.length && (
                  <Section icon="checkbox-outline" title="Requirements">
                    {a.requirements.map((r) => (
                      <View key={r} style={{ flexDirection: 'row', gap: 10 }}>
                        <Ionicons name="checkmark-circle" size={20} color={c.accent} />
                        <Txt style={{ flex: 1 }}>{r}</Txt>
                      </View>
                    ))}
                  </Section>
                )}
                {!!a.resources?.length && (
                  <Section icon="folder-open-outline" title="Resources">
                    {a.resources.map((r) => (
                      <View key={r.name} style={[styles.res, { borderColor: c.border }]}>
                        <Ionicons name={r.kind === 'pdf' ? 'document-text' : 'link'} size={22} color={r.kind === 'pdf' ? c.danger : c.info} />
                        <View style={{ flex: 1 }}>
                          <Txt variant="label">{r.name}</Txt>
                          <Txt variant="caption" color={c.muted}>{r.kind === 'pdf' ? `PDF · ${r.size}` : 'External link'}</Txt>
                        </View>
                        <Ionicons name={r.kind === 'pdf' ? 'download-outline' : 'open-outline'} size={20} color={c.primary} />
                      </View>
                    ))}
                  </Section>
                )}
                <Section icon="star-outline" title="Grading">
                  <Txt color={c.inkSoft}>{a.marks} marks · pass at {a.passPct}%. Graded by {tutor.name} within 3 working days.</Txt>
                </Section>
              </>
            )}

            {tab === 'submission' && (
              <View style={{ gap: 12 }}>
                {!msg && (submitted || locked) && sub?.submittedAt && (
                  <Banner tone="success" text={`Submitted on ${fmtDue(sub.submittedAt)}${submitted && !overdue ? '. You can update it until the due date.' : '.'}`} />
                )}
                <View style={[styles.mode, { backgroundColor: c.surfaceMuted }]}>
                  {(['file', 'link'] as const).map((m) => (
                    <Pressable key={m} disabled={locked} onPress={() => setMode(m)} style={[styles.modeBtn, mode === m && { backgroundColor: c.surface }]} accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
                      <Ionicons name={m === 'file' ? 'cloud-upload-outline' : 'link-outline'} size={18} color={mode === m ? c.primary : c.inkSoft} />
                      <Txt variant="label" color={mode === m ? c.primary : c.inkSoft}>{m === 'file' ? 'Upload file' : 'Add link'}</Txt>
                    </Pressable>
                  ))}
                </View>

                {mode === 'file' ? (
                  files.length ? (
                    files.map((f) => (
                      <View key={f.name} style={[styles.file, { backgroundColor: c.surface, borderColor: c.border }]}>
                        <View style={[styles.fileIcon, { backgroundColor: c.dangerBg }]}><Txt variant="caption" color={c.danger} style={{ fontWeight: '800' }}>{(f.name.split('.').pop() ?? '').toUpperCase()}</Txt></View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Txt variant="label" numberOfLines={1}>{f.name}</Txt>
                          <Txt variant="caption" color={c.muted}>{f.sizeMb} MB</Txt>
                        </View>
                        {!locked && <IconButton icon="close" label={`Remove ${f.name}`} onPress={() => setFiles([])} />}
                      </View>
                    ))
                  ) : (
                    <Pressable onPress={pick} style={[styles.drop, { borderColor: c.primary, backgroundColor: c.primarySoft }]} accessibilityRole="button" accessibilityLabel="Choose a file to upload">
                      <Ionicons name="cloud-upload-outline" size={34} color={c.primary} />
                      <Txt variant="bodyStrong">Tap to choose a file</Txt>
                      <Txt variant="caption" color={c.muted}>{a.accepts?.join(', ')} · max {a.maxMb} MB</Txt>
                    </Pressable>
                  )
                ) : (
                  <TextField label="Link to your work" icon="link-outline" placeholder="https://docs.google.com/…" autoCapitalize="none" keyboardType="url" editable={!locked} value={link} onChangeText={setLink} hint="Make sure the link is shared as “Anyone with the link can view”." />
                )}

                <View style={{ gap: 6 }}>
                  <Txt variant="label">Note to tutor (optional)</Txt>
                  <TextInput value={note} onChangeText={(t) => setNote(t.slice(0, 500))} editable={!locked} placeholder="Anything the tutor should know?" placeholderTextColor={c.muted} multiline accessibilityLabel="Note to tutor" style={[styles.note, { borderColor: c.border, backgroundColor: c.surface, color: c.ink }]} />
                  <Txt variant="caption" color={c.muted} style={{ alignSelf: 'flex-end' }}>{note.length} / 500</Txt>
                </View>
              </View>
            )}

            {tab === 'feedback' &&
              (sub?.grade ? (
                <View style={{ gap: 12 }}>
                  <View style={[styles.grade, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <Txt variant="display" color={c.success}>{sub.grade.pct}%</Txt>
                    <Txt variant="label" color={c.muted}>Graded by {sub.grade.by} · {new Date(sub.grade.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Txt>
                  </View>
                  <Section icon="chatbubble-ellipses-outline" title="Tutor feedback">
                    <Txt color={c.inkSoft}>{sub.grade.feedback}</Txt>
                  </Section>
                  <Section icon="list-outline" title="Rubric">
                    {sub.grade.rubric.map((r) => (
                      <View key={r.item} style={{ gap: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Txt variant="label">{r.item}</Txt>
                          <Txt variant="label" color={c.inkSoft}>{r.score} / {r.max}</Txt>
                        </View>
                        <View style={{ flexDirection: 'row' }}><ProgressBar pct={(r.score / r.max) * 100} height={7} /></View>
                      </View>
                    ))}
                  </Section>
                </View>
              ) : (
                <View style={{ alignItems: 'center', gap: 8, paddingVertical: 30 }}>
                  <Ionicons name="hourglass-outline" size={34} color={c.muted} />
                  <Txt color={c.muted} center>{submitted ? 'Your tutor is reviewing your submission. Feedback will appear here.' : 'Submit your work to get feedback and a grade.'}</Txt>
                </View>
              ))}
          </View>
        </ScrollView>

        {!locked && (
          <View style={[styles.foot, { backgroundColor: c.surface, borderTopColor: c.border }]}>
            <View style={[styles.center, { flexDirection: 'row', gap: 10 }]}>
              {tab !== 'submission' ? (
                <Button title={submitted ? 'View submission' : sub ? 'Continue submission' : 'Start submission'} iconRight="arrow-forward" style={{ flex: 1 }} onPress={() => setTab('submission')} />
              ) : (
                <>
                  {!submitted && <Button title="Save draft" variant="outline" iconLeft="document-outline" loading={busy === 'draft'} disabled={!!busy} style={{ flex: 1 }} onPress={() => save(false)} />}
                  <Button title={submitted ? 'Update submission' : overdue ? 'Submit late' : 'Submit'} iconRight="send" loading={busy === 'submit'} disabled={!!busy} style={{ flex: 1.3 }} onPress={() => save(true)} />
                </>
              )}
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

function Section({ icon, title, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={icon} size={20} color={c.primary} />
        <Txt variant="heading">{title}</Txt>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', gap: 12 },
  top: { paddingVertical: 8 },
  due: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1.2 },
  tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tab: { paddingHorizontal: 16, minHeight: 42, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1.2 },
  section: { padding: 16, borderRadius: radius.lg, borderWidth: 1, gap: 10 },
  res: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  mode: { flexDirection: 'row', padding: 4, borderRadius: radius.pill },
  modeBtn: { flex: 1, flexDirection: 'row', gap: 6, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  drop: { alignItems: 'center', gap: 6, padding: 26, borderRadius: radius.lg, borderWidth: 1.6, borderStyle: 'dashed' },
  file: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1 },
  fileIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  note: { minHeight: 90, borderWidth: 1.2, borderRadius: radius.md, padding: 12, fontSize: 15, textAlignVertical: 'top', outlineStyle: 'none' } as any,
  grade: { alignItems: 'center', padding: 20, borderRadius: radius.lg, borderWidth: 1, gap: 2 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
});
