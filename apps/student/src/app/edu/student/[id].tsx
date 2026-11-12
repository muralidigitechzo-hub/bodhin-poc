/** Student profile (educator view): progress, insights, courses, assessments, attendance, private notes. */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, people } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, IconButton, Pill, ProgressBar, ProgressRing } from '@/ui/kit';
import { CourseArt } from '@/ui/course';
import { Banner } from '@/ui/misc';
import { PillTabs } from '@/ui/pickers';
import { MessageSheet } from '@/ui/MessageSheet';

type Tab = 'overview' | 'courses' | 'assessments' | 'attendance' | 'notes';
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
import { agoLabel } from '@/core/nudge';
const mask = (p: string) => (p ? p.replace(/^(\+\d{2})(\d{2})\d{6}(\d{2})$/, '$1 $2••••••$3') : '—');

export default function StudentProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [rev, setRev] = useState(0);
  const data = useMemo(() => people.profile(userId, id), [userId, id, rev]);
  const [tab, setTab] = useState<Tab>('overview');
  const [msg, setMsg] = useState(false);
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };
  if (!data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, justifyContent: 'center', gap: 16 }}>
        <Banner text="This student isn’t in your workspace." />
        <Button title="Go back" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }
  const { person: p } = data;
  const active = data.enrolled.filter((e) => e.progress < 100).length;
  const completed = data.enrolled.length - active;
  const hours = `${Math.floor(p.learningMinutes / 60)}h ${p.learningMinutes % 60}m`;

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/educator/batches', params: { seg: 'students' } }))} />
          <Txt variant="heading" style={{ flex: 1 }}>Student</Txt>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.pad}>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                <Avatar name={p.name} size={64} color={c.primary} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt variant="title" style={{ fontSize: 22 }} numberOfLines={1}>{p.name}</Txt>
                  <Txt variant="caption" color={c.muted} selectable>{p.email}</Txt>
                  <Txt variant="caption" color={c.muted}>{mask(p.phone)} · {p.enrollmentId}</Txt>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                    <Pill text={Date.now() - new Date(p.lastActiveAt).getTime() < 14 * 864e5 ? 'Active' : 'Inactive'} tone={Date.now() - new Date(p.lastActiveAt).getTime() < 14 * 864e5 ? 'success' : 'live'} />
                    {data.risk?.atRisk && <Pill text={data.risk.level === 'high' ? 'High risk' : 'At risk'} tone={data.risk.level === 'high' ? 'live' : 'warning'} icon="alert-circle" />}
                    {p.userId && <Pill text="Uses the app" tone="info" icon="phone-portrait-outline" />}
                  </View>
                </View>
              </View>
              <View style={styles.stats}>
                {([['layers-outline', data.enrolled.length, 'Courses'], ['play-circle-outline', active, 'Active'], ['ribbon-outline', completed, 'Completed'], ['trending-up-outline', `${data.overall}%`, 'Progress']] as const).map(([i, v, l]) => (
                  <View key={l} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                    <Ionicons name={i} size={18} color={c.primary} />
                    <Txt variant="bodyStrong">{String(v)}</Txt>
                    <Txt variant="caption" color={c.muted}>{l}</Txt>
                  </View>
                ))}
              </View>
              {data.risk?.atRisk && (
                <View style={[styles.riskBox, { backgroundColor: c.warningBg, borderColor: data.risk.level === 'high' ? c.danger : c.warning }]} accessibilityRole="alert">
                  <Txt variant="label" style={{ fontWeight: '700' }}>Why this student is flagged</Txt>
                  {data.risk.reasons.map((x) => (
                    <View key={x.kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name={x.kind === 'attendance' ? 'calendar-outline' : 'time-outline'} size={16} color={c.warning} />
                      <Txt variant="label" style={{ flex: 1, fontWeight: '500' }}>{x.text}</Txt>
                    </View>
                  ))}
                </View>
              )}
              {data.nudges.length > 0 && (
                <View style={[styles.riskBox, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}>
                  <Txt variant="label" style={{ fontWeight: '700' }}>Nudge history</Txt>
                  {data.nudges.map((n) => (
                    <View key={n.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name={n.returned ? 'checkmark-circle' : 'paper-plane-outline'} size={16} color={n.returned ? c.success : c.muted} />
                      <Txt variant="caption" color={n.returned ? c.success : c.inkSoft} style={{ flex: 1 }}>
                        {agoLabel(n.at)} · {n.channel === 'app' ? 'in-app' : n.channel === 'email' ? 'email' : 'WhatsApp'}{n.returned ? ' · came back' : ''}
                      </Txt>
                    </View>
                  ))}
                  <Txt variant="caption" color={c.muted}>To send another nudge, open the Retention radar.</Txt>
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Message" iconLeft="chatbubble-outline" size="md" style={{ flex: 1 }} onPress={() => setMsg(true)} />
                <Button title="Add note" iconLeft="document-text-outline" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setTab('notes')} />
              </View>
            </View>
          </View>

          <View style={{ paddingVertical: 10 }}>
            <PillTabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'courses', label: `Courses (${data.enrolled.length})` },
                { id: 'assessments', label: 'Assessments' },
                { id: 'attendance', label: 'Attendance' },
                { id: 'notes', label: `Notes (${p.notes.length})` },
              ]}
            />
          </View>

          <View style={styles.pad}>
            <View style={styles.inner}>
              {tab === 'overview' && (
                <>
                  <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
                    <ProgressRing pct={data.overall} size={92} stroke={10} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <Txt variant="heading">Learning progress</Txt>
                      <Line icon="play-circle-outline" t={`${data.lessons.done} / ${data.lessons.total} lessons`} />
                      <Line icon="checkbox-outline" t={data.attendance.total ? `${data.attendance.attended} / ${data.attendance.total} live classes` : 'No live classes yet'} />
                      <Line icon="document-text-outline" t={`${data.assignments.submitted} / ${data.assignments.total} assignments`} />
                    </View>
                  </View>
                  <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <Txt variant="heading">Insights</Txt>
                    <KV k="Total learning time" v={hours} />
                    <KV k="Last active" v={ago(p.lastActiveAt)} />
                    <KV k="Learning streak" v={`${p.streak} days`} />
                    <KV k="Avg assessment score" v={data.avgScore == null ? '—' : `${data.avgScore}%`} />
                    <KV k="Certificates" v={String(data.certificates)} />
                  </View>
                  <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <Txt variant="heading">Recent activity</Txt>
                    {data.activity.length === 0 && <Txt color={c.muted}>No activity yet.</Txt>}
                    {data.activity.map((a, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                        <Ionicons name={a.icon as any} size={20} color={c.success} />
                        <Txt style={{ flex: 1 }} numberOfLines={2}>{a.text}</Txt>
                        <Txt variant="caption" color={c.muted}>{ago(a.at)}</Txt>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {tab === 'courses' &&
                data.enrolled.map((e) => (
                  <View key={e.pc.courseId + (e.pc.batchId ?? '')} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ width: 88 }}><CourseArt course={e.course} height={64} rounded={radius.md} /></View>
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <Txt variant="bodyStrong" numberOfLines={2}>{e.course.title}</Txt>
                        <Txt variant="caption" color={c.muted}>{e.batch ? `Batch ${e.batch.code}` : 'Self-paced'} · enrolled {new Date(e.pc.enrolledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Txt>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ProgressBar pct={e.progress} color={e.progress === 100 ? c.info : c.success} />
                      <Txt variant="label">{e.progress}%</Txt>
                    </View>
                    {e.batch && <Button title="Open batch" variant="soft" size="md" iconRight="arrow-forward" onPress={() => router.push({ pathname: '/edu/batch/[id]', params: { id: e.batch!.id } })} />}
                  </View>
                ))}

              {tab === 'assessments' && (
                <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                    <View style={{ alignItems: 'center' }}>
                      <Txt variant="title">{data.scores.filter((s) => s.pct != null).length}/{data.scores.length || 0}</Txt>
                      <Txt variant="caption" color={c.muted}>Completed</Txt>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Txt variant="title" color={c.success}>{data.avgScore == null ? '—' : `${data.avgScore}%`}</Txt>
                      <Txt variant="caption" color={c.muted}>Average score</Txt>
                    </View>
                  </View>
                  {data.scores.length === 0 && <Txt color={c.muted}>No quizzes attempted yet.</Txt>}
                  {data.scores.map((s, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name={s.pct == null ? 'ellipse-outline' : 'checkmark-circle'} size={22} color={s.pct == null ? c.borderStrong : c.success} />
                      <Txt style={{ flex: 1 }}>{s.title}</Txt>
                      <Pill text={s.pct == null ? 'Pending' : `${s.pct}%`} tone={s.pct == null ? 'warning' : s.pct >= 75 ? 'success' : 'info'} />
                    </View>
                  ))}
                </View>
              )}

              {tab === 'attendance' &&
                (data.enrolled.filter((e) => e.marks.length).length === 0 ? (
                  <Txt color={c.muted} center style={{ paddingVertical: 24 }}>No live classes recorded yet.</Txt>
                ) : (
                  data.enrolled.filter((e) => e.marks.length).map((e) => (
                    <View key={e.pc.batchId} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Txt variant="bodyStrong" style={{ flex: 1 }}>{e.batch?.name}</Txt>
                        <Pill text={`${e.attendance}%`} tone={(e.attendance ?? 0) >= 75 ? 'success' : 'live'} />
                      </View>
                      <View style={styles.dots}>
                        {e.marks.map((m) => (
                          <View key={m.sessionId} style={[styles.dot, { backgroundColor: m.status === 'present' ? c.successBg : m.status === 'late' ? c.warningBg : c.dangerBg }]} accessibilityLabel={m.status}>
                            <Ionicons name={m.status === 'present' ? 'checkmark' : m.status === 'late' ? 'time' : 'close'} size={13} color={m.status === 'present' ? c.success : m.status === 'late' ? c.warning : c.danger} />
                          </View>
                        ))}
                      </View>
                      <Txt variant="caption" color={c.muted}>{e.marks.filter((m) => m.status !== 'absent').length} of {e.marks.length} classes attended · {e.marks.filter((m) => m.status === 'late').length} late</Txt>
                    </View>
                  ))
                ))}

              {tab === 'notes' && (
                <>
                  <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <Txt variant="label">Private note (only your team sees this)</Txt>
                    <TextInput value={note} onChangeText={(v) => { setNote(v); setNoteErr(null); }} multiline placeholder="e.g. Strong in SEO; needs help with ad budgets." placeholderTextColor={c.muted} accessibilityLabel="New note" style={[styles.area, { borderColor: c.border, backgroundColor: c.surfaceMuted, color: c.ink }]} />
                    {noteErr && <Txt variant="caption" color={c.danger}>{noteErr}</Txt>}
                    <Button title="Save note" size="md" disabled={!note.trim()} onPress={() => { try { people.addNote(userId, p.id, note); setNote(''); setRev((r) => r + 1); flash('Note saved'); } catch (e) { setNoteErr((e as ApiError).message); } }} />
                  </View>
                  {p.notes.map((n) => (
                    <View key={n.id} style={[styles.card, { backgroundColor: c.accentSoft, borderColor: c.border }]}>
                      <Txt>{n.text}</Txt>
                      <Txt variant="caption" color={c.muted}>{n.by} · {ago(n.at)}</Txt>
                    </View>
                  ))}
                </>
              )}
            </View>
          </View>
        </ScrollView>
        {toast && (
          <View style={[styles.toast, { backgroundColor: c.ink }]}>
            <Txt variant="label" color="#fff">{toast}</Txt>
          </View>
        )}
      </SafeAreaView>
      <MessageSheet target={msg ? { id: p.id, name: p.name, linked: !!p.userId } : null} onClose={() => setMsg(false)} userId={userId} flash={flash} />
    </View>
  );
}

function Line({ icon, t }: { icon: keyof typeof Ionicons.glyphMap; t: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name={icon} size={16} color={c.primary} />
      <Txt variant="label" style={{ fontWeight: '500' }}>{t}</Txt>
    </View>
  );
}
function KV({ k, v }: { k: string; v: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Txt color={c.inkSoft}>{k}</Txt>
      <Txt variant="bodyStrong">{v}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  riskBox: { borderWidth: 1.2, borderRadius: 14, padding: 12, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 6 },
  pad: { paddingHorizontal: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  card: { width: '100%', maxWidth: layout.contentMaxWidth, padding: 14, borderRadius: radius.lg, borderWidth: 1, gap: 12 },
  stats: { flexDirection: 'row' },
  area: { minHeight: 90, borderWidth: 1.2, borderRadius: radius.md, padding: 12, fontSize: 15, textAlignVertical: 'top', outlineStyle: 'none' } as any,
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dot: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', bottom: 24, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.pill },
});
