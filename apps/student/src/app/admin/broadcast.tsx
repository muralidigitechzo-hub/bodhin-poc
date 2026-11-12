/** Broadcast: one message to learners, all educators, trial or paying educators. Preview + history. */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AUDIENCE_LABEL, ApiError, broadcastAdmin, type Audience } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, ScreenTop, shared } from '@/ui/section';
import { ago } from '@/ui/admin';

export default function Broadcast() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [, force] = useState(0);
  const d = broadcastAdmin.info(userId);
  const [aud, setAud] = useState<Audience>('all_educators');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Broadcast" sub="In-app notification + email" fallback="/admin/more" />
        <ScrollView contentContainerStyle={shared.scroll} keyboardShouldPersistTaps="handled">
          <View style={shared.inner}>
            {msg && <Banner tone="success" text={msg} />}
            <Card title="Audience">
              <View style={shared.chips}>{(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => <Chip key={a} label={`${AUDIENCE_LABEL[a]} · ${d.counts[a]}`} active={aud === a} onPress={() => setAud(a)} />)}</View>
            </Card>
            <Card title="Message">
              <TextField label="Title" value={title} onChangeText={setTitle} maxLength={70} />
              <TextInput value={body} onChangeText={setBody} multiline maxLength={400} placeholder="What should they know or do?" placeholderTextColor={c.muted} style={[styles.area, { borderColor: c.border, color: c.ink }]} accessibilityLabel="Message" />
              <Txt variant="caption" color={c.muted}>{body.length}/400 · keep it short and actionable</Txt>
            </Card>
            {(title || body) && (
              <Card title="Preview">
                <View style={[styles.preview, { backgroundColor: c.surfaceMuted }]}>
                  <Txt variant="bodyStrong">{title || 'Title'}</Txt>
                  <Txt variant="label" color={c.inkSoft} style={{ fontWeight: '400' }}>{body || 'Message'}</Txt>
                </View>
              </Card>
            )}
            <Card title="Sent">
              {d.history.map((h) => <View key={h.id} style={{ gap: 2 }}><Txt variant="label">{h.title}</Txt><Txt variant="caption" color={c.muted}>{h.audience} · {h.reached} people · {h.by} · {ago(h.at)}</Txt></View>)}
            </Card>
          </View>
        </ScrollView>
        <View style={[shared.footer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
          <Button title={`Send to ${d.counts[aud]} people`} iconLeft="megaphone" disabled={!title || !body} onPress={() => { setErr(null); setConfirm(true); }} style={{ width: '100%', maxWidth: 720 }} />
        </View>
      </SafeAreaView>
      <BottomSheet open={confirm} onClose={() => setConfirm(false)} title="Send broadcast?" footer={<Button title="Send now" size="md" loading={busy} style={{ flex: 1 }} onPress={async () => { setBusy(true); try { const n = await broadcastAdmin.send(userId, { audience: aud, title, body }); setConfirm(false); setTitle(''); setBody(''); setMsg(`Sent to ${n} people`); force((x) => x + 1); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); } finally { setBusy(false); } }} />}>
        <Txt color={c.inkSoft}>“{title}” goes to {AUDIENCE_LABEL[aud].toLowerCase()} ({d.counts[aud]}). This can’t be unsent.</Txt>
        {err && <Banner text={err} />}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  area: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 110, textAlignVertical: 'top', fontSize: 15 },
  preview: { borderRadius: 14, padding: 12, gap: 4 },
});
