/** Support inbox: learner/educator tickets, oldest first. Reply or reply & resolve in one sheet. */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, ticketsAdmin, type TicketFilter } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { ScreenTop, shared } from '@/ui/section';
import { ago } from '@/ui/admin';

const QUICK = ['Thanks for reaching out! ', 'I’ve checked your account — ', 'Your payment is confirmed and the course is now in My Learning. ', 'Please update the app and try again. '];

export default function Tickets() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [f, setF] = useState<TicketFilter>('open');
  const [, force] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useFocusEffect(React.useCallback(() => force((n) => n + 1), []));
  const d = ticketsAdmin.list(userId, f);
  const t = [...ticketsAdmin.list(userId, 'open').rows, ...ticketsAdmin.list(userId, 'in_progress').rows, ...ticketsAdmin.list(userId, 'resolved').rows].find((x) => x.t.id === sel);
  const send = async (resolve: boolean) => {
    try { await ticketsAdmin.reply(userId, sel!, text, resolve); setSel(null); setMsg(resolve ? 'Resolved · user notified' : 'Reply sent · user notified'); force((n) => n + 1); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); }
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Support tickets" fallback="/admin/more" />
        <ScrollView contentContainerStyle={shared.scroll}>
          <View style={shared.inner}>
            {msg && <Banner tone="success" text={msg} />}
            <View style={shared.chips}>
              {([['open', 'Open'], ['in_progress', 'Waiting on user'], ['resolved', 'Resolved']] as const).map(([k, l]) => <Chip key={k} label={`${l} ${d.counts[k]}`} active={f === k} onPress={() => setF(k)} />)}
            </View>
            {d.rows.length === 0 && <Txt color={c.muted} center style={{ padding: 20 }}>Nothing here.</Txt>}
            {d.rows.map(({ t: tk, u }) => (
              <Pressable key={tk.id} onPress={() => { setSel(tk.id); setText(''); setErr(null); }} style={({ pressed }) => [styles.card, { backgroundColor: c.surface, borderColor: c.border }, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`${tk.id} ${tk.subject}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Avatar name={u?.name ?? '?'} size={34} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="bodyStrong" numberOfLines={1}>{tk.subject}</Txt>
                    <Txt variant="caption" color={c.muted}>{tk.id} · {u?.name} · {tk.category} · {ago(tk.createdAt)}</Txt>
                  </View>
                  {tk.replies.length > 0 && <Pill text={`${tk.replies.length} repl${tk.replies.length === 1 ? 'y' : 'ies'}`} tone="neutral" />}
                </View>
                <Txt color={c.inkSoft} numberOfLines={2}>{tk.body}</Txt>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
      <BottomSheet open={!!t} onClose={() => setSel(null)} title={t ? `${t.t.id} · ${t.t.subject}` : ''} footer={t && t.t.status !== 'resolved' ? <>
        <Button title="Reply" size="md" variant="outline" style={{ flex: 1 }} onPress={() => send(false)} />
        <Button title="Reply & resolve" size="md" style={{ flex: 1.3 }} onPress={() => send(true)} />
      </> : <Button title="Reopen" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { ticketsAdmin.reopen(userId, sel!); setSel(null); force((n) => n + 1); }} />}>
        {t && (
          <View style={{ gap: 10 }}>
            <View style={[styles.msg, { backgroundColor: c.surfaceMuted }]}><Txt variant="caption" color={c.muted}>{t.u?.name} · {t.u?.email}</Txt><Txt>{t.t.body}</Txt></View>
            {t.t.replies.map((r, i) => <View key={i} style={[styles.msg, { backgroundColor: c.primarySoft, alignSelf: 'flex-end' }]}><Txt variant="caption" color={c.primary}>{r.by} · {ago(r.at)}</Txt><Txt>{r.text}</Txt></View>)}
            {t.t.status !== 'resolved' && (
              <>
                <View style={shared.chips}>{QUICK.map((q) => <Chip key={q} label={q.trim()} onPress={() => setText((x) => x + q)} />)}</View>
                <TextInput value={text} onChangeText={setText} multiline placeholder="Write a reply…" placeholderTextColor={c.muted} style={[styles.area, { borderColor: c.border, color: c.ink }]} accessibilityLabel="Reply" />
              </>
            )}
            {err && <Banner text={err} />}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 8 },
  msg: { borderRadius: 14, padding: 10, gap: 2, maxWidth: '92%' },
  area: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 90, textAlignVertical: 'top', fontSize: 15 },
});
