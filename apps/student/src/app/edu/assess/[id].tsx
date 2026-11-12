/**
 * Assessment builder — one screen for quiz, exam and assignment.
 * Tabs: Setup · Questions (quiz/exam) or Brief (assignment) · Results (once published). Autosaves.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, assessAdmin, grading } from '@/api/client';
import type { Assessment, Question } from '@/core/assess';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Avatar, BottomSheet, Chip, IconButton, Pill, ProgressBar } from '@/ui/kit';
import { Banner, Checkbox } from '@/ui/misc';
import { DateField, PillTabs, Stepper, TimeField } from '@/ui/pickers';
import { KIND_META } from '@/ui/assessMeta';

type Tab = 'setup' | 'content' | 'results';
type Info = NonNullable<ReturnType<typeof assessAdmin.get>>;
type Draft = { id?: string; text: string; options: string[]; correct: number; topic: string; explanation: string; hint: string };
const EMPTY: Draft = { text: '', options: ['', '', '', ''], correct: -1, topic: '', explanation: '', hint: '' };
const ACCEPTS = ['PDF', 'DOCX', 'PPTX', 'ZIP', 'JPG', 'Link'];
const hhmm = (iso?: string) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '18:00');
const withTime = (dateIso: string, t: string) => {
  const d = new Date(dateIso);
  const [h, m] = t.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export default function Builder() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [info, setInfo] = useState<Info | null>(() => assessAdmin.get(userId, id));
  const [tab, setTab] = useState<Tab>(info && info.a.status !== 'draft' && info.locked ? 'results' : 'setup');
  const [title, setTitle] = useState(info?.a.title ?? '');
  const [instructions, setInstructions] = useState(info?.a.instructions ?? '');
  const [q, setQ] = useState<Draft | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);
  const [bank, setBank] = useState<Question[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [req, setReq] = useState('');
  const [menu, setMenu] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => setInfo(assessAdmin.get(userId, id)), [userId, id]);
  useFocusEffect(reload);
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };

  if (!info) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, justifyContent: 'center', gap: 16 }}>
        <Banner text="This assessment isn’t available to you." />
        <Button title="Back" onPress={() => router.replace('/edu/assess')} />
      </SafeAreaView>
    );
  }
  const { a, course, questions, batches, locked } = info;
  const m = KIND_META[a.kind];
  const draft = a.status === 'draft';
  const set = (patch: Partial<Assessment>) => {
    try {
      assessAdmin.update(userId, id, patch);
      reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save.');
    }
  };
  const commitText = () => {
    if (title !== a.title || (a.kind === 'assignment' && instructions !== (a.instructions ?? ''))) set({ title, ...(a.kind === 'assignment' ? { instructions } : {}) });
  };
  const checklist = assessAdmin.checklist({ ...a, title, instructions });
  const ready = checklist.every((x) => x.ok);

  const publish = async () => {
    commitText();
    setErr(null);
    setBusy(true);
    try {
      await assessAdmin.publish(userId, id);
      reload();
      flash('Published · students notified');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  };
  const saveQ = () => {
    if (!q) return;
    const opts = q.options.map((o) => o.trim()).filter((o, i) => o || i < 2);
    try {
      assessAdmin.upsertQuestion(userId, id, { id: q.id, text: q.text, options: opts.length ? opts : q.options, correct: q.correct, topic: q.topic, explanation: q.explanation, hint: q.hint });
      setQ(null);
      reload();
      flash(q.id ? 'Question updated' : 'Question added');
    } catch (e) {
      setQErr(e instanceof ApiError ? e.message : 'Could not save the question.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => { commitText(); router.canGoBack() && !fresh ? router.back() : router.replace('/edu/assess'); }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="heading" numberOfLines={1}>{title || `New ${m.label.toLowerCase()}`}</Txt>
            <Txt variant="caption" color={c.muted} numberOfLines={1}>{m.label} · {course.title}</Txt>
          </View>
          <Pill text={draft ? 'Draft' : 'Published'} tone={draft ? 'neutral' : 'success'} />
          <IconButton icon="ellipsis-horizontal" label="More actions" tone="filled" onPress={() => setMenu(true)} />
        </View>
        <View style={styles.tabsWrap}>
          <PillTabs<Tab> value={tab} onChange={(t) => { commitText(); setTab(t); }} tabs={[
            { id: 'setup', label: 'Setup', icon: 'options-outline' },
            a.kind === 'assignment' ? { id: 'content', label: 'Brief & rubric', icon: 'document-text-outline' } : { id: 'content', label: `Questions · ${questions.length}`, icon: 'list-outline' },
            ...(!draft ? [{ id: 'results' as const, label: a.kind === 'assignment' ? 'Submissions' : 'Results', icon: 'stats-chart-outline' as const }] : []),
          ]} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            {err && <Banner text={err} />}
            {!draft && locked && tab !== 'results' && <Banner tone="info" text="Students have already responded. Changes apply to new attempts and submissions only." />}

            {tab === 'setup' && (
              <>
                <Card title="Basics">
                  <TextField label="Title" placeholder={a.kind === 'assignment' ? 'e.g. Keyword Research Project' : 'e.g. Module 2 – SEO basics quiz'} value={title} onChangeText={setTitle} onBlur={commitText} maxLength={90} />
                  <Txt variant="label">Who gets it</Txt>
                  <View style={styles.chips}>
                    <Chip label="All course students" active={!a.batchId} onPress={() => set({ batchId: null })} />
                    {batches.map((b) => <Chip key={b.id} label={b.code} active={a.batchId === b.id} onPress={() => set({ batchId: b.id })} />)}
                  </View>
                </Card>

                {a.kind === 'assignment' ? (
                  <Card title="Deadline & files">
                    <DateField label="Due date" value={a.dueAt ?? new Date().toISOString()} onChange={(d) => set({ dueAt: withTime(d, hhmm(a.dueAt)) })} min={new Date().toISOString()} />
                    <TimeField label="Due time" value={hhmm(a.dueAt)} onChange={(t) => set({ dueAt: withTime(a.dueAt ?? new Date().toISOString(), t) })} />
                    <Toggle title="Accept late submissions" sub="Marked “Late” in your grading queue" value={!!a.settings?.lateAllowed} onChange={(v) => set({ settings: { ...a.settings!, lateAllowed: v } })} />
                    <Txt variant="label">Accepted formats</Txt>
                    <View style={styles.chips}>
                      {ACCEPTS.map((f) => {
                        const on = (a.accepts ?? []).includes(f);
                        return <Chip key={f} label={f} active={on} onPress={() => set({ accepts: on ? (a.accepts ?? []).filter((x) => x !== f) : [...(a.accepts ?? []), f] })} />;
                      })}
                    </View>
                    <Txt variant="label">Max file size</Txt>
                    <View style={styles.chips}>{[10, 25, 50, 100].map((mb) => <Chip key={mb} label={`${mb} MB`} active={a.maxMb === mb} onPress={() => set({ maxMb: mb })} />)}</View>
                    <Txt variant="caption" color={c.muted}>Uploads count towards your plan’s storage.</Txt>
                  </Card>
                ) : (
                  <Card title={a.kind === 'exam' ? 'Exam window & rules' : 'Rules'}>
                    {a.kind === 'exam' && (
                      <>
                        <DateField label="Opens on" value={a.opensAt ?? new Date().toISOString()} onChange={(d) => set({ opensAt: withTime(d, hhmm(a.opensAt)) })} min={new Date().toISOString()} />
                        <TimeField label="Opens at" value={hhmm(a.opensAt)} onChange={(t) => set({ opensAt: withTime(a.opensAt ?? new Date().toISOString(), t) })} />
                      </>
                    )}
                    <Txt variant="label">Time limit</Txt>
                    <View style={styles.chips}>{(a.kind === 'exam' ? [30, 45, 60, 90, 120] : [5, 10, 15, 20, 30]).map((n) => <Chip key={n} label={`${n} min`} active={a.durationMin === n} onPress={() => set({ durationMin: n })} />)}</View>
                    <Txt variant="label">Pass mark</Txt>
                    <View style={styles.chips}>{[40, 50, 60, 70, 80].map((n) => <Chip key={n} label={`${n}%`} active={a.passPct === n} onPress={() => set({ passPct: n })} />)}</View>
                    <Txt variant="label">Attempts allowed</Txt>
                    <View style={styles.chips}>{[1, 2, 3, 0].map((n) => <Chip key={n} label={n ? String(n) : 'Unlimited'} active={(a.settings?.attempts ?? 0) === n} onPress={() => set({ settings: { ...(a.settings ?? { shuffle: false, showAnswers: true, lateAllowed: false, attempts: 0 }), attempts: n } })} />)}</View>
                    <Toggle title="Shuffle questions" sub="Each student sees a different order" value={!!a.settings?.shuffle} onChange={(v) => set({ settings: { ...(a.settings ?? { attempts: 0, showAnswers: true, lateAllowed: false, shuffle: false }), shuffle: v } })} />
                    <Toggle title="Show answers after submit" sub="Correct answer + explanation for each question" value={a.settings?.showAnswers ?? true} onChange={(v) => set({ settings: { ...(a.settings ?? { attempts: 0, shuffle: false, lateAllowed: false, showAnswers: true }), showAnswers: v } })} />
                  </Card>
                )}

                {draft && (
                  <Card title="Ready to publish?">
                    {checklist.map((k) => (
                      <View key={k.text} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <Ionicons name={k.ok ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={k.ok ? c.success : c.borderStrong} />
                        <Txt color={k.ok ? c.ink : c.inkSoft}>{k.text}</Txt>
                      </View>
                    ))}
                  </Card>
                )}
              </>
            )}

            {tab === 'content' && a.kind !== 'assignment' && (
              <>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Add question" iconLeft="add" size="md" style={{ flex: 1 }} onPress={() => { setQ({ ...EMPTY, options: ['', '', '', ''] }); setQErr(null); }} />
                  <Button title="From bank" iconLeft="albums-outline" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setBank(assessAdmin.bank(userId, id)); setPicked([]); }} />
                </View>
                <Txt variant="caption" color={c.muted}>{questions.length} questions · {a.marks} marks{a.kind === 'exam' && a.createdBy ? ' (2 per question)' : ''}</Txt>
                {questions.length === 0 && (
                  <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <Ionicons name="help-circle-outline" size={34} color={c.muted} />
                    <Txt color={c.muted} center>Add your own questions or pick from questions you’ve used in this course.</Txt>
                  </View>
                )}
                {questions.map((qq, i) => (
                  <View key={qq.id} style={[styles.qcard, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Txt variant="label" color={c.primary}>Q{i + 1}</Txt>
                      <Txt variant="bodyStrong" style={{ flex: 1 }}>{qq.text}</Txt>
                    </View>
                    {qq.options.map((o, k) => (
                      <View key={k} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <Ionicons name={k === qq.correct ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={k === qq.correct ? c.success : c.borderStrong} />
                        <Txt variant="label" style={{ fontWeight: k === qq.correct ? '700' : '400', flex: 1 }}>{o}</Txt>
                      </View>
                    ))}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Pill text={qq.topic} tone="neutral" />
                      <View style={{ flex: 1 }} />
                      <Small icon="arrow-up" label="Move up" disabled={i === 0} onPress={() => { assessAdmin.moveQuestion(userId, id, qq.id, -1); reload(); }} />
                      <Small icon="arrow-down" label="Move down" disabled={i === questions.length - 1} onPress={() => { assessAdmin.moveQuestion(userId, id, qq.id, 1); reload(); }} />
                      <Small icon="create-outline" label="Edit question" onPress={() => { setQ({ id: qq.id, text: qq.text, options: [...qq.options], correct: qq.correct, topic: qq.topic, explanation: qq.explanation, hint: qq.hint ?? '' }); setQErr(null); }} />
                      <Small icon="trash-outline" label="Remove question" onPress={() => { assessAdmin.removeQuestion(userId, id, qq.id); reload(); flash('Question removed'); }} />
                    </View>
                  </View>
                ))}
              </>
            )}

            {tab === 'content' && a.kind === 'assignment' && (
              <>
                <Card title="Instructions">
                  <TextInput value={instructions} onChangeText={setInstructions} onBlur={commitText} multiline placeholder="What should students do? Be specific about the deliverable." placeholderTextColor={c.muted} style={[styles.area, { borderColor: c.border, color: c.ink, backgroundColor: c.surfaceMuted }]} accessibilityLabel="Instructions" />
                </Card>
                <Card title="Checklist for students">
                  {(a.requirements ?? []).map((r, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <Ionicons name="checkbox-outline" size={18} color={c.inkSoft} />
                      <Txt style={{ flex: 1 }}>{r}</Txt>
                      <Small icon="close" label={`Remove ${r}`} onPress={() => set({ requirements: (a.requirements ?? []).filter((_, j) => j !== i) })} />
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput value={req} onChangeText={setReq} placeholder="e.g. Include 20–30 keywords" placeholderTextColor={c.muted} style={[styles.input, { borderColor: c.border, color: c.ink }]} accessibilityLabel="New checklist item" onSubmitEditing={() => { if (req.trim()) { set({ requirements: [...(a.requirements ?? []), req.trim()] }); setReq(''); } }} />
                    <Button title="Add" size="md" variant="outline" onPress={() => { if (req.trim()) { set({ requirements: [...(a.requirements ?? []), req.trim()] }); setReq(''); } }} />
                  </View>
                </Card>
                <Card title={`Grading rubric · ${a.marks} marks`}>
                  {(a.rubric ?? []).map((r, i) => (
                    <View key={i} style={{ gap: 6 }}>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <TextInput value={r.item} onChangeText={(v) => set({ rubric: (a.rubric ?? []).map((x, j) => (j === i ? { ...x, item: v } : x)) })} style={[styles.input, { borderColor: c.border, color: c.ink }]} accessibilityLabel={`Rubric item ${i + 1}`} />
                        <Small icon="trash-outline" label="Remove rubric item" disabled={(a.rubric ?? []).length <= 1} onPress={() => set({ rubric: (a.rubric ?? []).filter((_, j) => j !== i) })} />
                      </View>
                      <Stepper label="Marks" value={r.max} min={1} max={100} onChange={(n) => set({ rubric: (a.rubric ?? []).map((x, j) => (j === i ? { ...x, max: n } : x)) })} />
                    </View>
                  ))}
                  <Button title="Add rubric item" iconLeft="add" size="md" variant="outline" onPress={() => set({ rubric: [...(a.rubric ?? []), { item: 'New criterion', max: 5 }] })} />
                </Card>
              </>
            )}

            {tab === 'results' && (a.kind === 'assignment' ? <Submissions a={a} userId={userId} /> : <Results id={id} userId={userId} passPct={a.passPct} />)}
          </View>
        </ScrollView>
        {draft && (
          <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
            <Txt variant="caption" color={c.muted} center>Saved automatically as draft</Txt>
            <Button title={ready ? 'Publish & notify students' : `Publish (${checklist.filter((x) => !x.ok).length} left)`} iconLeft="send" loading={busy} onPress={publish} style={{ width: '100%', maxWidth: layout.contentMaxWidth }} />
          </View>
        )}
        {toast && <View style={[styles.toast, { backgroundColor: c.ink }]} pointerEvents="none"><Txt variant="label" color="#fff" center>{toast}</Txt></View>}
      </SafeAreaView>

      <BottomSheet open={!!q} onClose={() => setQ(null)} title={q?.id ? 'Edit question' : 'New question'} footer={<Button title="Save question" size="md" style={{ flex: 1 }} onPress={saveQ} />}>
        {q && (
          <View style={{ gap: 10 }}>
            <TextInput value={q.text} onChangeText={(v) => setQ({ ...q, text: v })} multiline placeholder="Question" placeholderTextColor={c.muted} style={[styles.area, { minHeight: 70, borderColor: c.border, color: c.ink }]} accessibilityLabel="Question text" />
            <Txt variant="caption" color={c.muted}>Tap the circle to mark the correct answer.</Txt>
            {q.options.map((o, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Pressable onPress={() => setQ({ ...q, correct: i })} style={styles.radio} accessibilityRole="radio" accessibilityState={{ checked: q.correct === i }} accessibilityLabel={`Mark option ${i + 1} correct`}>
                  <Ionicons name={q.correct === i ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={q.correct === i ? c.success : c.borderStrong} />
                </Pressable>
                <TextInput value={o} onChangeText={(v) => setQ({ ...q, options: q.options.map((x, j) => (j === i ? v : x)) })} placeholder={`Option ${i + 1}${i >= 2 ? ' (optional)' : ''}`} placeholderTextColor={c.muted} style={[styles.input, { borderColor: q.correct === i ? c.success : c.border, color: c.ink }]} accessibilityLabel={`Option ${i + 1}`} />
              </View>
            ))}
            <TextInput value={q.topic} onChangeText={(v) => setQ({ ...q, topic: v })} placeholder="Topic (for per-topic results), e.g. On-Page SEO" placeholderTextColor={c.muted} style={[styles.input, { borderColor: c.border, color: c.ink, flex: 0 }]} accessibilityLabel="Topic" />
            <TextInput value={q.explanation} onChangeText={(v) => setQ({ ...q, explanation: v })} multiline placeholder="Explanation shown after submit (recommended)" placeholderTextColor={c.muted} style={[styles.area, { minHeight: 60, borderColor: c.border, color: c.ink }]} accessibilityLabel="Explanation" />
            {qErr && <Banner text={qErr} />}
          </View>
        )}
      </BottomSheet>

      <BottomSheet open={!!bank} onClose={() => setBank(null)} title="Question bank" footer={<Button title={picked.length ? `Add ${picked.length} question${picked.length > 1 ? 's' : ''}` : 'Select questions'} size="md" disabled={!picked.length} style={{ flex: 1 }} onPress={() => { assessAdmin.importQuestions(userId, id, picked); setBank(null); reload(); flash(`${picked.length} added`); }} />}>
        <View style={{ gap: 8 }}>
          {bank?.length === 0 && <Txt color={c.muted}>No other questions in this course yet.</Txt>}
          {bank?.map((bq) => (
            <Checkbox key={bq.id} checked={picked.includes(bq.id)} onChange={(v) => setPicked((x) => (v ? [...x, bq.id] : x.filter((y) => y !== bq.id)))} label={bq.text}>
              <View style={{ flex: 1 }}>
                <Txt variant="label">{bq.text}</Txt>
                <Txt variant="caption" color={c.muted}>{bq.topic}</Txt>
              </View>
            </Checkbox>
          ))}
        </View>
      </BottomSheet>

      <BottomSheet open={menu} onClose={() => setMenu(false)} title="Actions">
        <View style={{ gap: 8 }}>
          <Button title="Duplicate" variant="outline" iconLeft="copy-outline" onPress={() => { setMenu(false); router.replace({ pathname: '/edu/assess/[id]', params: { id: assessAdmin.duplicate(userId, id) } }); }} />
          {!draft && <Button title="Move back to draft" variant="outline" iconLeft="eye-off-outline" onPress={() => { setMenu(false); try { assessAdmin.unpublish(userId, id); reload(); flash('Moved to draft · hidden from students'); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not unpublish.'); } }} />}
          {draft && !a.lessonId && <Button title="Delete draft" variant="outline" iconLeft="trash-outline" onPress={() => { setMenu(false); assessAdmin.remove(userId, id); router.replace('/edu/assess'); }} />}
        </View>
      </BottomSheet>
    </View>
  );
}

function Results({ id, userId, passPct }: { id: string; userId: string; passPct: number }) {
  const { c } = useTheme();
  const r = useMemo(() => assessAdmin.results(userId, id), [userId, id]);
  const weak = [...r.perQ].filter((x) => x.pct != null).sort((a, b) => a.pct! - b.pct!);
  return (
    <>
      <View style={styles.stats}>
        <Stat v={`${r.rows.length}/${r.audience}`} l="Attempted" />
        <Stat v={r.avg == null ? '—' : `${r.avg}%`} l="Avg score" />
        <Stat v={r.pass == null ? '—' : `${r.pass}%`} l="Pass rate" />
        <Stat v={r.avgTime == null ? '—' : `${r.avgTime}m`} l="Avg time" />
      </View>
      {r.rows.length === 0 ? <Banner tone="info" text="No attempts yet. Results appear here as students finish." /> : (
        <>
          <Card title="Question accuracy · hardest first">
            {weak.slice(0, 6).map((x) => (
              <View key={x.q.id} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Txt variant="label" style={{ flex: 1, fontWeight: '500' }} numberOfLines={2}>{x.q.text}</Txt>
                  <Txt variant="label" color={x.pct! < 50 ? c.danger : x.pct! < 75 ? c.warning : c.success}>{x.pct}%</Txt>
                </View>
                <ProgressBar pct={x.pct!} color={x.pct! < 50 ? c.danger : x.pct! < 75 ? c.warning : c.success} />
              </View>
            ))}
            {weak[0] && weak[0].pct! < 50 && <Txt variant="caption" color={c.muted}>Tip: under 50% usually means the topic needs a quick recap in the next live class.</Txt>}
          </Card>
          <Card title="Students">
            {r.rows.map((row, i) => (
              <View key={row.t.id} style={styles.person}>
                <Txt variant="label" color={c.muted} style={{ width: 22 }}>{i + 1}</Txt>
                <Avatar name={row.name} size={30} />
                <Txt style={{ flex: 1 }} numberOfLines={1}>{row.name}</Txt>
                <View><Pill text={`${row.t.scorePct}%`} tone={row.t.scorePct >= passPct ? 'success' : 'live'} /></View>
              </View>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function Submissions({ a, userId }: { a: Assessment; userId: string }) {
  const { c } = useTheme();
  const [d, setD] = useState<Awaited<ReturnType<typeof grading.queue>> | null>(null);
  const [g, setG] = useState<Awaited<ReturnType<typeof grading.queue>> | null>(null);
  useFocusEffect(useCallback(() => { grading.queue(userId, 'to_grade', a.id).then(setD); grading.queue(userId, 'graded', a.id).then(setG); }, [userId, a.id]));
  if (!d || !g) return null;
  const avg = g.rows.length ? Math.round(g.rows.reduce((s, r) => s + (r.s.grade?.pct ?? 0), 0) / g.rows.length) : null;
  return (
    <>
      <View style={styles.stats}>
        <Stat v={String(d.counts.to_grade)} l="To grade" />
        <Stat v={String(d.counts.graded)} l="Graded" />
        <Stat v={String(d.counts.returned)} l="Returned" />
        <Stat v={avg == null ? '—' : `${avg}%`} l="Avg grade" />
      </View>
      {d.counts.to_grade > 0 && <Button title={`Grade ${d.counts.to_grade} submission${d.counts.to_grade > 1 ? 's' : ''}`} iconLeft="create-outline" onPress={() => router.push({ pathname: '/edu/grade/[id]', params: { id: d.rows[0].s.id } })} />}
      <Card title="Latest">
        {[...d.rows, ...g.rows].slice(0, 12).map((r) => (
          <Pressable key={r.s.id} onPress={() => router.push({ pathname: '/edu/grade/[id]', params: { id: r.s.id } })} style={styles.person} accessibilityRole="button" accessibilityLabel={`${r.name} submission`}>
            <Avatar name={r.name} size={30} />
            <Txt style={{ flex: 1 }} numberOfLines={1}>{r.name}</Txt>
            {r.late && <View><Pill text="Late" tone="warning" /></View>}
            <View><Pill text={r.s.grade ? `${r.s.grade.pct}%` : 'To grade'} tone={r.s.grade ? 'success' : 'info'} /></View>
          </Pressable>
        ))}
      </Card>
    </>
  );
}

function Toggle({ title, sub, value, onChange }: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        {!!sub && <Txt variant="caption" color={c.muted}>{sub}</Txt>}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={title} trackColor={{ true: c.primary, false: c.borderStrong }} thumbColor="#fff" />
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Txt variant="label" color={c.muted}>{title.toUpperCase()}</Txt>
      {children}
    </View>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Txt variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{v}</Txt>
      <Txt variant="caption" color={c.muted} numberOfLines={1}>{l}</Txt>
    </View>
  );
}

function Small({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.small, { borderColor: c.border, opacity: disabled ? 0.35 : 1 }]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={17} color={c.inkSoft} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  tabsWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 30 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  qcard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 6 },
  area: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 110, textAlignVertical: 'top', fontSize: 15 },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 46, fontSize: 15 },
  radio: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  small: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: 1, borderRadius: 18, padding: 24, alignItems: 'center', gap: 8 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 10, gap: 2 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46 },
  footer: { borderTopWidth: 1, padding: 12, paddingTop: 6, alignItems: 'center', gap: 6 },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 110, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
});
