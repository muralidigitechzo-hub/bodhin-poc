/** Class summary & recording: Overview · Recording (chapters) · Materials · Attendance · Q&A. Share with the batch in one tap. */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { liveAdmin } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, IconButton, Pill, ProgressRing } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { PillTabs } from '@/ui/pickers';
import { VideoSurface } from '@/ui/VideoSurface';

type Tab = 'overview' | 'recording' | 'materials' | 'attendance' | 'qa';
type Data = NonNullable<ReturnType<typeof liveAdmin.summary>>;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`);

export default function ClassSummary() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [seek, setSeek] = useState(0);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const reload = useCallback(() => setD(liveAdmin.summary(userId, id)), [userId, id]);
  useFocusEffect(reload);
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };

  if (!d) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, justifyContent: 'center', gap: 16 }}>
        <Banner text="This class summary isn’t available to you." />
        <Button title="Back to Live" onPress={() => router.replace('/educator/live')} />
      </SafeAreaView>
    );
  }
  const { session: s, sum, course, marks } = d;
  const pct = sum.total ? Math.round((sum.attended / sum.total) * 100) : 0;
  const lesson = { id: `rec_${s.id}`, title: s.title, type: 'video' as const, durationSec: sum.durationSec };
  const share = async () => {
    setSharing(true);
    await liveAdmin.shareSummary(userId, id);
    setSharing(false);
    reload();
    flash(s.batchId ? 'Shared with the batch · students notified' : 'Shared');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (fresh ? router.replace('/educator/live') : router.canGoBack() ? router.back() : router.replace('/educator/live'))} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="heading" numberOfLines={1}>Class summary</Txt>
            <Txt variant="caption" color={c.muted} numberOfLines={1}>{s.batchName ?? course.title}</Txt>
          </View>
        </View>
        <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
          <View style={styles.pad}>
            <View style={styles.inner}>
              {fresh === '1' && <Banner tone="success" text={`Class ended · ${s.settings.trackAttendance && s.batchId ? 'attendance marked automatically' : 'summary ready'}${sum.recordingPublished ? ' · recording added to the course' : ''}.`} />}
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Pill text="Completed" tone="success" icon="checkmark-circle" />
                <Txt variant="heading">{s.title}</Txt>
                <Txt variant="caption" color={c.muted}>{new Date(s.startsAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {dur(sum.durationSec)}</Txt>
                <View style={styles.stats}>
                  <Stat icon="people" v={`${sum.attended}/${sum.total}`} l="Attended" />
                  <Stat icon="trending-up" v={String(sum.peak)} l="Peak live" />
                  <Stat icon="help-circle" v={String(sum.qa.length)} l="Questions" />
                  <Stat icon="chatbubbles" v={String(sum.chatCount)} l="Chat" />
                </View>
              </View>
            </View>
          </View>
          <View style={[styles.pad, { backgroundColor: c.ivory, paddingVertical: 10 }]}>
            <View style={styles.inner}>
            <PillTabs<Tab> flush value={tab} onChange={setTab} tabs={[
              { id: 'overview', label: 'Overview', icon: 'reader-outline' },
              { id: 'recording', label: 'Recording', icon: 'play-circle-outline' },
              { id: 'materials', label: `Materials · ${sum.materials.length}`, icon: 'document-attach-outline' },
              ...(s.batchId ? [{ id: 'attendance' as const, label: 'Attendance', icon: 'checkbox-outline' as const }] : []),
              { id: 'qa', label: `Q&A · ${sum.qa.length}`, icon: 'help-circle-outline' },
            ]} />
            </View>
          </View>
          <View style={styles.pad}>
            <View style={styles.inner}>
              {tab === 'overview' && (
                <>
                  <Section title="Summary" action={editing ? 'Save' : 'Edit'} onAction={() => { if (editing) { liveAdmin.updateSummary(id, { text }); reload(); flash('Summary saved'); } else setText(sum.text); setEditing(!editing); }}>
                    {editing ? (
                      <TextInput value={text} onChangeText={setText} multiline style={[styles.area, { borderColor: c.border, color: c.ink }]} accessibilityLabel="Class summary" />
                    ) : <Txt color={c.inkSoft}>{sum.text}</Txt>}
                    <Txt variant="caption" color={c.muted}>Auto-drafted from the class (slides, chapters, Q&A). Edit before sharing.</Txt>
                  </Section>
                  <Section title="Key takeaways">
                    {sum.takeaways.map((t, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                        <Ionicons name="checkmark-circle" size={18} color={c.success} />
                        <Txt style={{ flex: 1 }}>{t}</Txt>
                      </View>
                    ))}
                  </Section>
                  {sum.polls.length > 0 && (
                    <Section title="Polls">
                      {sum.polls.map((p, i) => {
                        const total = p.votes.reduce((a, b) => a + b, 0) || 1;
                        const top = p.votes.indexOf(Math.max(...p.votes));
                        return <Txt key={i} color={c.inkSoft}>{p.q} → <Txt variant="bodyStrong">{p.options[top]}</Txt> ({Math.round((p.votes[top] / total) * 100)}%)</Txt>;
                      })}
                    </Section>
                  )}
                  {d.next && (
                    <Section title="Next class">
                      <Txt variant="bodyStrong">{d.next.title}</Txt>
                      <Txt variant="caption" color={c.muted}>{new Date(d.next.startsAt).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Txt>
                    </Section>
                  )}
                </>
              )}

              {tab === 'recording' && (
                <>
                  {s.settings.record ? (
                    <>
                      <VideoSurface key={seek} course={course} lesson={lesson} label="Class recording" startAt={seek} speed={1} fullscreen={false} onTime={() => {}} onEnded={() => {}} onSpeed={() => {}} onQuality={() => {}} onFullscreen={() => {}} />
                      <View style={[styles.toggle, { backgroundColor: c.surface, borderColor: c.border }]}>
                        <View style={{ flex: 1 }}>
                          <Txt variant="bodyStrong">Visible to students</Txt>
                          <Txt variant="caption" color={c.muted}>{sum.recordingPublished ? 'In their Live tab → Past & Attendance' : 'Only you and your team can see it'}</Txt>
                        </View>
                        <Switch value={sum.recordingPublished} onValueChange={(v) => { liveAdmin.updateSummary(id, { recordingPublished: v }); reload(); }} accessibilityLabel="Recording visible to students" trackColor={{ true: c.primary, false: c.borderStrong }} thumbColor="#fff" />
                      </View>
                      <Section title={`Chapters · ${sum.chapters.length}`}>
                        {sum.chapters.map((ch, i) => (
                          <Pressable key={i} onPress={() => setSeek(Math.min(ch.atSec, sum.durationSec - 5))} style={styles.chapter} accessibilityRole="button" accessibilityLabel={`Play from ${mmss(ch.atSec)}: ${ch.label}`}>
                            <Txt variant="label" color={c.primary} style={{ width: 56, fontVariant: ['tabular-nums'] }}>{mmss(ch.atSec)}</Txt>
                            <Txt style={{ flex: 1 }} numberOfLines={2}>{ch.label}</Txt>
                            <Ionicons name="play" size={14} color={c.muted} />
                          </Pressable>
                        ))}
                      </Section>
                    </>
                  ) : <Banner tone="info" text="Recording was off for this class." />}
                </>
              )}

              {tab === 'materials' && (
                <Section title="Shared in class">
                  {!sum.materials.length && <Txt color={c.muted}>No files were shared during this class.</Txt>}
                  {sum.materials.map((m, i) => (
                    <View key={i} style={styles.file}>
                      <View style={[styles.fileIcon, { backgroundColor: c.dangerBg }]}><Ionicons name="document-text" size={20} color={c.danger} /></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt variant="bodyStrong" numberOfLines={1}>{m.name}</Txt>
                        <Txt variant="caption" color={c.muted}>{m.size}</Txt>
                      </View>
                    </View>
                  ))}
                </Section>
              )}

              {tab === 'attendance' && s.batchId && (
                <>
                  <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
                    <ProgressRing pct={pct} size={64} />
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong">{sum.attended} of {sum.total} attended</Txt>
                      <Txt variant="caption" color={c.muted}>Marked from live join time. Late = joined 10+ min after start.</Txt>
                    </View>
                  </View>
                  <Button title="Edit attendance" variant="outline" iconLeft="create-outline" onPress={() => router.push({ pathname: '/edu/batch/[id]', params: { id: s.batchId!, tab: 'attendance' } })} />
                  <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: 6 }]}>
                    {marks.map((m) => (
                      <View key={m.person.id} style={styles.file}>
                        <Avatar name={m.person.name} size={32} />
                        <Txt style={{ flex: 1 }} numberOfLines={1}>{m.person.name}</Txt>
                        <View><Pill text={m.mark ? m.mark.status[0].toUpperCase() + m.mark.status.slice(1) : 'Not marked'} tone={!m.mark ? 'neutral' : m.mark.status === 'present' ? 'success' : m.mark.status === 'late' ? 'warning' : 'live'} /></View>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {tab === 'qa' && (
                <Section title="Questions from class">
                  {!sum.qa.length && <Txt color={c.muted}>No questions were asked.</Txt>}
                  {[...sum.qa].sort((a, b) => b.votes - a.votes).map((q, i) => (
                    <View key={i} style={{ gap: 2, paddingVertical: 6 }}>
                      <Txt variant="bodyStrong">{q.q}</Txt>
                      <Txt variant="caption" color={c.muted}>{q.by} · {q.votes} upvotes</Txt>
                      {q.a ? <Txt variant="label" color={c.inkSoft} style={{ fontWeight: '400' }}>↳ {q.a}</Txt> : <Txt variant="caption" color={c.muted}>Answered live (see recording)</Txt>}
                    </View>
                  ))}
                </Section>
              )}
            </View>
          </View>
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
          <Button
            title={sum.sharedAt ? 'Shared with students ✓' : s.batchId ? 'Share summary with batch' : 'Share summary'}
            iconLeft="send"
            loading={sharing}
            disabled={!!sum.sharedAt}
            onPress={share}
            style={{ width: '100%', maxWidth: layout.contentMaxWidth }}
          />
        </View>
        {toast && <View style={[styles.toast, { backgroundColor: c.ink }]} pointerEvents="none"><Txt variant="label" color="#fff" center>{toast}</Txt></View>}
      </SafeAreaView>
    </View>
  );
}

function Stat({ icon, v, l }: { icon: keyof typeof Ionicons.glyphMap; v: string; l: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: c.surfaceMuted }]}>
      <Ionicons name={icon} size={16} color={c.primary} />
      <Txt variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{v}</Txt>
      <Txt variant="caption" color={c.muted} numberOfLines={1}>{l}</Txt>
    </View>
  );
}

function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt variant="label" color={c.muted}>{title.toUpperCase()}</Txt>
        {action && <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button"><Txt variant="label" color={c.primary}>{action}</Txt></Pressable>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  pad: { paddingHorizontal: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  tabsWrap: { paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 8 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 4 },
  stat: { flex: 1, borderRadius: 12, padding: 8, alignItems: 'center', gap: 2 },
  area: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 110, textAlignVertical: 'top', fontSize: 15 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 12 },
  chapter: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 6 },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: 1, padding: 12, alignItems: 'center' },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 90, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
});
