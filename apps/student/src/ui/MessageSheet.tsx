import React, { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { ApiError, people as peopleApi } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from './Txt';
import { Button } from './Button';
import { BottomSheet } from './kit';
import { Banner } from './misc';

export function MessageSheet({ target, onClose, userId, flash }: { target: { id: string; name: string; linked: boolean } | null; onClose: () => void; userId: string; flash: (t: string) => void }) {
  const { c } = useTheme();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <BottomSheet
      open={!!target}
      onClose={onClose}
      title={`Message ${target?.name.split(' ')[0] ?? ''}`}
      footer={<Button title="Send" iconRight="send" loading={busy} disabled={!text.trim()} style={{ flex: 1 }} onPress={async () => { if (!target) return; setBusy(true); try { const r = await peopleApi.message(userId, target.id, text); setText(''); onClose(); flash(r.delivered === 'in_app' ? 'Sent · they’ll see it in the app' : 'Sent by email'); } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); } }} />}
    >
      {err && <Banner text={err} />}
      <TextInput value={text} onChangeText={setText} multiline autoFocus placeholder="Write a short, friendly message…" placeholderTextColor={c.muted} accessibilityLabel="Message" style={[styles.area, { borderColor: c.border, backgroundColor: c.surfaceMuted, color: c.ink }]} />
      <Txt variant="caption" color={c.muted}>{target?.linked ? 'Delivered as an in-app notification.' : 'Delivered by email (this student hasn’t installed the app yet).'}</Txt>
    </BottomSheet>
  );
}


const styles = StyleSheet.create({
  area: { minHeight: 110, borderWidth: 1.2, borderRadius: radius.md, padding: 12, fontSize: 15, textAlignVertical: 'top', outlineStyle: 'none' } as any,
});
