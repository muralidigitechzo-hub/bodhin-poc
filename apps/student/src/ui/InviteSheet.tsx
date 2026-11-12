import React, { useState } from 'react';
import { Share, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, batchesApi, educator, people } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from './Txt';
import { Button } from './Button';
import { TextField } from './TextField';
import { BottomSheet, Chip } from './kit';
import { Banner } from './misc';

/** Invite: share link · add one · import CSV. New students count against the plan's active-student limit. */
export function InviteSheet({ open, onClose, userId, batchId }: { open: boolean; onClose: () => void; userId: string; batchId?: string }) {
  const { c } = useTheme();
  const ctx = educator.context(userId);
  const courses = educator.courses(userId).filter((x) => x.status !== 'draft');
  const batch = batchId ? batchesApi.get(userId, batchId) : null;
  const [mode, setMode] = useState<'link' | 'one' | 'csv'>('link');
  const [courseId, setCourseId] = useState(batch?.batch.courseId ?? courses[0]?.id ?? '');
  const [f, setF] = useState({ name: '', email: '', phone: '' });
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!ctx) return null;
  const seats = ctx.usage.rows.find((r) => r.key === 'activeStudents')!;
  const link = batch ? batch.joinLink : `https://${ctx.host}/course/${courseId}`;

  const add = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const p = await people.invite(userId, { ...f, courseId, batchId });
      setF({ name: '', email: '', phone: '' });
      setMsg({ tone: 'success', text: `${p.name} added. An invite email with the login link is on its way.` });
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as ApiError).message });
    } finally {
      setBusy(false);
    }
  };
  const importRows = async () => {
    setBusy(true);
    const res = await people.importCsv(userId, csv, courseId, batchId);
    const ok = res.filter((r) => r.ok).length;
    const bad = res.filter((r) => !r.ok);
    setMsg({ tone: bad.length ? 'info' : 'success', text: `${ok} added${bad.length ? `, ${bad.length} skipped: ${bad.slice(0, 3).map((b) => `“${b.line.split(',')[0]}” (${b.reason})`).join('; ')}` : ''}.` });
    if (ok) setCsv('');
    setBusy(false);
  };

  return (
    <BottomSheet open={open} onClose={() => { onClose(); setMsg(null); }} title={batch ? `Add to ${batch.batch.code}` : 'Invite students'}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Share link" icon="link" active={mode === 'link'} onPress={() => setMode('link')} />
        <Chip label="Add one" icon="person-add" active={mode === 'one'} onPress={() => setMode('one')} />
        <Chip label="Import CSV" icon="document-text" active={mode === 'csv'} onPress={() => setMode('csv')} />
      </View>
      {!batch && (
        <View style={{ gap: 6 }}>
          <Txt variant="label">Course</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {courses.map((x) => <Chip key={x.id} label={x.title} active={courseId === x.id} onPress={() => setCourseId(x.id)} />)}
          </View>
        </View>
      )}
      <Txt variant="caption" color={seats.level === 'ok' ? c.muted : c.warning}>Active students: {seats.used.toLocaleString('en-IN')} / {seats.limit?.toLocaleString('en-IN') ?? '∞'} on your plan. New invites count toward this.</Txt>
      {msg && <Banner tone={msg.tone} text={msg.text} />}
      {mode === 'link' && (
        <View style={{ gap: 10 }}>
          <View style={[styles.linkBox, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}>
            <Ionicons name="link" size={18} color={c.primary} />
            <Txt variant="label" selectable style={{ flex: 1 }} numberOfLines={2}>{link}</Txt>
          </View>
          <Button title="Share link" iconLeft="share-social-outline" onPress={async () => { try { await Share.share({ message: `Join ${batch ? batch.batch.name : 'my course'} on ${ctx.tenant.branding.displayName}: ${link}`, url: link }); } catch { setMsg({ tone: 'info', text: 'Copy the link above and share it on WhatsApp or email.' }); } }} />
          <Txt variant="caption" color={c.muted}>Students who join through your link pay you directly (no marketplace commission).</Txt>
        </View>
      )}
      {mode === 'one' && (
        <View style={{ gap: 12 }}>
          <TextField label="Full name" value={f.name} onChangeText={(v) => setF((x) => ({ ...x, name: v }))} />
          <TextField label="Email" keyboardType="email-address" autoCapitalize="none" value={f.email} onChangeText={(v) => setF((x) => ({ ...x, email: v }))} />
          <TextField label="Mobile (optional)" prefix="+91" keyboardType="phone-pad" value={f.phone} onChangeText={(v) => setF((x) => ({ ...x, phone: v.replace(/\D/g, '').slice(0, 10) }))} />
          <Button title="Add student" iconLeft="person-add" loading={busy} onPress={add} />
        </View>
      )}
      {mode === 'csv' && (
        <View style={{ gap: 10 }}>
          <Txt variant="caption" color={c.inkSoft}>One student per line: name, email, mobile. A header row is skipped automatically.</Txt>
          <TextInput value={csv} onChangeText={setCsv} multiline placeholder={'name,email,phone\nRamesh K,ramesh@email.com,9876500001'} placeholderTextColor={c.muted} accessibilityLabel="CSV rows" style={[styles.csv, { borderColor: c.border, backgroundColor: c.surfaceMuted, color: c.ink }]} />
          <Button title="Import" iconLeft="cloud-upload-outline" loading={busy} disabled={!csv.trim()} onPress={importRows} />
        </View>
      )}
    </BottomSheet>
  );
}


const styles = StyleSheet.create({
  linkBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  csv: { minHeight: 110, borderWidth: 1.2, borderRadius: radius.md, padding: 12, fontSize: 14, textAlignVertical: 'top', outlineStyle: 'none', fontFamily: 'monospace' } as any,
});
