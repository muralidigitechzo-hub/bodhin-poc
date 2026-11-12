/** Change preview (from → to + consequences) and the save-with-reason sheet used by every settings editor. */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiError } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';
import { Button } from './Button';
import { TextField } from './TextField';
import { BottomSheet } from './kit';
import { Banner } from './misc';
import { ago } from './admin';

export type Change = { field: string; from: string; to: string };

export function ImpactCard({ changes, notes }: { changes: Change[]; notes: string[] }) {
  const { c } = useTheme();
  if (!changes.length) return null;
  return (
    <View style={{ borderWidth: 1.5, borderColor: c.warning, backgroundColor: c.warningBg, borderRadius: 18, padding: 14, gap: 8 }}>
      <Txt variant="label" color={c.warning}>UNSAVED CHANGES · IMPACT PREVIEW</Txt>
      {changes.map((ch) => (
        <View key={ch.field} style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Txt variant="label">{ch.field}:</Txt>
          {!!ch.from && <Txt variant="label" color={c.muted} style={{ textDecorationLine: 'line-through', fontWeight: '400' }}>{ch.from}</Txt>}
          {!!ch.from && <Ionicons name="arrow-forward" size={14} color={c.inkSoft} />}
          <Txt variant="label" color={c.ink}>{ch.to}</Txt>
        </View>
      ))}
      {notes.map((n) => <Txt key={n} variant="caption" color={c.inkSoft}>• {n}</Txt>)}
    </View>
  );
}

export function SaveSheet({ open, onClose, changes, onSave }: { open: boolean; onClose: () => void; changes: Change[]; onSave: (reason: string) => Promise<void> }) {
  const { c } = useTheme();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setReason(''); setErr(null); } }, [open]);
  return (
    <BottomSheet open={open} onClose={onClose} title={`Save ${changes.length} change${changes.length === 1 ? '' : 's'}?`} footer={<Button title="Save & apply" size="md" loading={busy} style={{ flex: 1 }} onPress={async () => { setBusy(true); setErr(null); try { await onSave(reason); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save.'); } finally { setBusy(false); } }} />}>
      <View style={{ gap: 8 }}>
        {changes.map((ch) => <Txt key={ch.field} variant="label" style={{ fontWeight: '400' }}>• {ch.field}: {ch.from ? `${ch.from} → ` : ''}<Txt variant="label">{ch.to}</Txt></Txt>)}
        <TextField label="Reason (kept in change history)" value={reason} onChangeText={setReason} placeholder="e.g. Approved in pricing review, 6 Nov" error={err && err.includes('reason') ? err : undefined} />
        {err && !err.toLowerCase().includes('reason') && <Banner text={err} />}
        <Txt variant="caption" color={c.muted}>Changes are logged with your name and can be reverted by saving the old values.</Txt>
      </View>
    </BottomSheet>
  );
}

export function History({ rows }: { rows: { id: string; at: string; by: string; label: string; changes: Change[]; reason: string }[] }) {
  const { c } = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, borderRadius: 18, padding: 14, gap: 10 }}>
      <Txt variant="label" color={c.muted}>CHANGE HISTORY</Txt>
      {rows.length === 0 && <Txt color={c.muted}>No changes yet.</Txt>}
      {rows.map((h) => (
        <View key={h.id} style={{ gap: 2 }}>
          <Txt variant="label">{h.label} · {h.changes.map((ch) => `${ch.field}: ${ch.from ? `${ch.from} → ` : ''}${ch.to}`).join(' · ')}</Txt>
          <Txt variant="caption" color={c.muted}>{h.by} · {ago(h.at)} · “{h.reason}”</Txt>
        </View>
      ))}
    </View>
  );
}
