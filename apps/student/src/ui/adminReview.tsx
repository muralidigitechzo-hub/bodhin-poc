/** Review panes used by the Approvals inbox (phone: full screen · desktop: right-hand pane). */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ApiError, approvals } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';
import { Button } from './Button';
import { TextField } from './TextField';
import { Avatar, BottomSheet, Chip, Pill } from './kit';
import { Banner } from './misc';
import { CourseArt } from './course';
import { ToggleRow } from './section';
import { ago } from './admin';

const REJECT_EDU = ['ID proof is missing or unclear.', 'Please share a sample teaching video (5–10 min).', 'Subject area isn’t supported on Bodhin yet.', 'Details look incomplete — add experience and subjects.'];
const REJECT_COURSE = ['Please add a free preview lesson.', 'Description should explain what learners can do after the course.', 'Some lessons look copied from public videos — please upload your own content.', 'Remove the strike-through price or add a real offer end date.'];

function Checks({ list }: { list: { label: string; ok: boolean; soft: boolean }[] }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {list.map((k) => (
        <View key={k.label} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Ionicons name={k.ok ? 'checkmark-circle' : k.soft ? 'alert-circle' : 'close-circle'} size={20} color={k.ok ? c.success : k.soft ? c.warning : c.danger} />
          <Txt variant="label" style={{ flex: 1, fontWeight: '500' }} color={k.ok ? c.ink : k.soft ? c.warning : c.danger}>{k.label}</Txt>
          {!k.ok && <Txt variant="caption" color={c.muted}>{k.soft ? 'advisory' : 'required'}</Txt>}
        </View>
      ))}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Txt variant="label" color={c.muted}>{title.toUpperCase()}</Txt>
      {children}
    </View>
  );
}

function DecisionSheet({ open, title, templates, cta, danger, onClose, onSubmit, children }: { open: boolean; title: string; templates?: string[]; cta: string; danger?: boolean; onClose: () => void; onSubmit: (note: string) => Promise<void>; children?: React.ReactNode }) {
  const { c } = useTheme();
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setNote(''); setErr(null); } }, [open]);
  return (
    <BottomSheet open={open} onClose={onClose} title={title} footer={<Button title={cta} size="md" loading={busy} style={{ flex: 1, ...(danger ? { backgroundColor: c.danger } : {}) }} onPress={async () => { setBusy(true); setErr(null); try { await onSubmit(note); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Something went wrong.'); } finally { setBusy(false); } }} />}>
      <View style={{ gap: 10 }}>
        {children}
        {templates && (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{templates.map((t) => <Chip key={t} label={t} onPress={() => setNote((n) => (n ? `${n} ${t}` : t))} />)}</View>
            <TextInput value={note} onChangeText={setNote} multiline placeholder="Message to the educator (they’ll see this)" placeholderTextColor={c.muted} style={[styles.area, { borderColor: err ? c.danger : c.border, color: c.ink }]} accessibilityLabel="Reason" />
          </>
        )}
        {err && <Banner text={err} />}
      </View>
    </BottomSheet>
  );
}

export function ApplicationReview({ id, userId, onDone }: { id: string; userId: string; onDone: (msg: string) => void }) {
  const { c } = useTheme();
  const [rev, setRev] = useState(0);
  const d = approvals.appDetail(userId, id);
  const [slug, setSlug] = useState(d?.slug ?? '');
  const [sheet, setSheet] = useState<null | 'approve' | 'changes' | 'reject'>(null);
  useEffect(() => { approvals.startReview(userId, id); setSlug(approvals.appDetail(userId, id)?.slug ?? ''); setRev((r) => r + 1); }, [id, userId]);
  if (!d) return <Banner text="Application not found." />;
  const { a, u } = d;
  const decided = a.status === 'approved' || a.status === 'rejected';
  const blocked = d.checks.some((k) => !k.ok && !k.soft);
  return (
    <View style={{ flex: 1 }} key={rev}>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Avatar name={u.name} size={52} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="heading" numberOfLines={2}>{a.workspaceName ?? u.name}</Txt>
              <Txt variant="caption" color={c.muted}>{u.name} · {a.city ?? "city not given"} · applied {a.submittedAt ? ago(a.submittedAt) : ''}</Txt>
            </View>
            <Pill text={a.status.replace('_', ' ')} tone={a.status === 'approved' ? 'success' : a.status === 'rejected' ? 'live' : a.status === 'changes_requested' ? 'warning' : 'info'} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{a.subjects?.map((s) => <Pill key={s} text={s} tone="neutral" />)}</View>
          <View style={styles.facts}>
            <Fact k="Experience" v={`${a.experienceYears} yrs`} />
            <Fact k="Planned students" v={String(a.plannedStudents ?? '—')} />
            <Fact k="Phone" v={u.phone} />
            <Fact k="Email" v={u.email} />
          </View>
          {a.sampleUrl && <View style={[styles.link, { backgroundColor: c.infoBg }]}><Ionicons name="logo-youtube" size={18} color={c.info} /><Txt variant="label" color={c.info} numberOfLines={1} style={{ flex: 1 }}>{a.sampleUrl}</Txt></View>}
        </View>
        {a.note && <Banner tone="info" text={`${a.status === 'rejected' ? 'Rejected' : 'Changes asked'}${a.reviewedBy ? ` by ${a.reviewedBy}` : ''}: ${a.note}`} />}
        <Section title="Automatic checks"><Checks list={d.checks} /></Section>
        <Section title="If approved">
          <Txt color={c.inkSoft}>• Workspace at <Txt variant="bodyStrong">{slug || '…'}.thebodhin.com</Txt>{'\n'}• {d.trial.days}-day free {d.trial.plan.name} trial (limits: {d.trial.plan.activeStudents} students, {d.trial.plan.videoStorageGb} GB){'\n'}• Owner access with the same login · SMS + email + in-app notice{'\n'}• They connect their own gateway for direct sales</Txt>
        </Section>
        {d.log.length > 0 && <Section title="History">{d.log.map((e) => <Txt key={e.id} variant="caption" color={c.inkSoft}>{ago(e.at)} · {e.actorName}: {e.summary}</Txt>)}</Section>}
      </ScrollView>
      {!decided && (
        <View style={[styles.bar, { borderTopColor: c.border, backgroundColor: c.surface }]}>
          <Button title="Changes" size="md" variant="outline" style={{ flex: 1 }} onPress={() => setSheet('changes')} />
          <Button title="Reject" size="md" variant="outline" style={{ flex: 1 }} onPress={() => setSheet('reject')} />
          <Button title="Approve" size="md" iconLeft="checkmark" disabled={blocked} style={{ flex: 1.3 }} onPress={() => setSheet('approve')} />
        </View>
      )}
      <DecisionSheet open={sheet === 'approve'} title="Approve educator" cta="Approve & create workspace" onClose={() => setSheet(null)} onSubmit={async () => { const r = await approvals.approveEducator(userId, id, slug); setSheet(null); onDone(`Approved · ${r.slug}.thebodhin.com created`); }}>
        <TextField label="Workspace address" value={slug} onChangeText={(v) => setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))} autoCapitalize="none" hint={`${slug}.thebodhin.com · they can change it later`} />
      </DecisionSheet>
      <DecisionSheet open={sheet === 'changes'} title="Ask for changes" templates={REJECT_EDU} cta="Send to applicant" onClose={() => setSheet(null)} onSubmit={async (n) => { await approvals.decideEducator(userId, id, 'changes_requested', n); setSheet(null); onDone('Changes requested · applicant notified'); }} />
      <DecisionSheet open={sheet === 'reject'} title="Reject application" templates={REJECT_EDU} cta="Reject" danger onClose={() => setSheet(null)} onSubmit={async (n) => { await approvals.decideEducator(userId, id, 'rejected', n); setSheet(null); onDone('Application rejected · applicant notified'); }} />
    </View>
  );
}

export function CourseReview({ id, userId, onDone }: { id: string; userId: string; onDone: (msg: string) => void }) {
  const { c } = useTheme();
  const d = approvals.courseDetail(userId, id);
  const [sheet, setSheet] = useState<null | 'approve' | 'reject'>(null);
  const [promote, setPromote] = useState(true);
  const [open, setOpen] = useState<number | null>(0);
  if (!d) return <Banner text="Course not found." />;
  const { c: course, t } = d;
  const pending = course.moderation === 'pending';
  const blocked = d.checks.some((k) => !k.ok && !k.soft);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <CourseArt course={course} height={120} rounded={14} />
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Pill text={course.visibility === 'public_promoted' ? 'Listing + promotion' : 'Marketplace listing'} tone={course.visibility === 'public_promoted' ? 'gold' : 'info'} />
            <Pill text={course.level} tone="neutral" />
            <Pill text={course.format} tone="neutral" />
          </View>
          <Txt variant="heading">{course.title}</Txt>
          <Txt color={c.inkSoft}>{course.subtitle}</Txt>
          <Txt variant="caption" color={c.muted}>{t.branding.displayName} · {d.owner?.name} · submitted {course.updatedAt ? ago(course.updatedAt) : ''}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Txt variant="title" style={{ fontSize: 22 }}>₹{course.priceInr.toLocaleString('en-IN')}</Txt>
            {course.compareAtInr ? <Txt color={c.muted} style={{ textDecorationLine: 'line-through' }}>₹{course.compareAtInr.toLocaleString('en-IN')}</Txt> : null}
            {course.offerEndsAt ? <Txt variant="caption" color={c.warning}>offer ends {new Date(course.offerEndsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Txt> : null}
          </View>
          <Txt variant="caption" color={c.muted}>Marketplace split: Bodhin {Math.round(d.rate * 100)}% · educator gets the rest after the refund hold</Txt>
        </View>
        <Section title="Automatic checks"><Checks list={d.checks} /></Section>
        <Section title="About">
          <Txt color={c.inkSoft}>{course.description}</Txt>
          {course.outcomes.map((o) => <Txt key={o} variant="label" style={{ fontWeight: '400' }}>✓ {o}</Txt>)}
        </Section>
        <Section title={`Curriculum · ${course.modules.length} modules`}>
          {course.modules.map((m, i) => (
            <View key={m.id}>
              <Pressable onPress={() => setOpen(open === i ? null : i)} style={styles.mod} accessibilityRole="button" accessibilityState={{ expanded: open === i }}>
                <Txt variant="bodyStrong" style={{ flex: 1 }}>{i + 1}. {m.title}</Txt>
                <Txt variant="caption" color={c.muted}>{m.lessons.length}</Txt>
                <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={16} color={c.muted} />
              </Pressable>
              {open === i && m.lessons.map((l) => (
                <Pressable key={l.id} onPress={() => router.push({ pathname: '/learn/[courseId]', params: { courseId: course.id, lesson: l.id } })} style={styles.lesson} accessibilityRole="button" accessibilityLabel={`Preview ${l.title}`}>
                  <Ionicons name={l.type === 'video' ? 'play-circle-outline' : l.type === 'pdf' ? 'document-text-outline' : 'help-circle-outline'} size={18} color={c.inkSoft} />
                  <Txt variant="label" style={{ flex: 1, fontWeight: '400' }} numberOfLines={1}>{l.title}</Txt>
                  {l.preview && <Pill text="Free preview" tone="success" />}
                  <Ionicons name="eye-outline" size={18} color={c.primary} />
                </Pressable>
              ))}
            </View>
          ))}
        </Section>
        <Section title="Workspace">
          <Txt color={c.inkSoft}>{t.branding.displayName} · {t.subscription?.plan} plan · {d.others} other listed course{d.others === 1 ? '' : 's'}</Txt>
          {d.reports.map((r) => <Banner key={r.id} tone="info" text={`Report (${r.status}): ${r.reason} — ${r.detail}`} />)}
        </Section>
      </ScrollView>
      {pending && (
        <View style={[styles.bar, { borderTopColor: c.border, backgroundColor: c.surface }]}>
          <Button title="Ask for changes" size="md" variant="outline" style={{ flex: 1 }} onPress={() => setSheet('reject')} />
          <Button title="Approve listing" size="md" iconLeft="checkmark" disabled={blocked} style={{ flex: 1.2 }} onPress={() => setSheet('approve')} />
        </View>
      )}
      <DecisionSheet open={sheet === 'approve'} title="Approve marketplace listing" cta="Approve & publish" onClose={() => setSheet(null)} onSubmit={async () => { await approvals.decideCourse(userId, id, 'approve', { promote }); setSheet(null); onDone('Listing approved · educator notified'); }}>
        <Txt color={c.inkSoft}>The course goes live on thebodhin.com. Sales there are collected by Bodhin; the educator is paid weekly minus commission.</Txt>
        {course.visibility === 'public_promoted' && <ToggleRow title="Allow Bodhin promotion" sub="Featured placements, campaigns and newsletters" value={promote} onChange={setPromote} />}
      </DecisionSheet>
      <DecisionSheet open={sheet === 'reject'} title="Ask for changes" templates={REJECT_COURSE} cta="Send to educator" onClose={() => setSheet(null)} onSubmit={async (n) => { await approvals.decideCourse(userId, id, 'reject', { note: n }); setSheet(null); onDone('Changes requested · educator notified'); }} />
    </View>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.fact, { backgroundColor: c.surfaceMuted }]}>
      <Txt variant="caption" color={c.muted}>{k}</Txt>
      <Txt variant="label" numberOfLines={1}>{v}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { flexGrow: 1, flexBasis: '45%', borderRadius: 12, padding: 10 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 10 },
  bar: { flexDirection: 'row', gap: 8, borderTopWidth: 1, padding: 12 },
  area: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 90, textAlignVertical: 'top', fontSize: 15 },
  mod: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  lesson: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingLeft: 12 },
});
