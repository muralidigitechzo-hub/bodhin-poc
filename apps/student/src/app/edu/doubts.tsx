/** Doubts inbox: lesson questions from students, oldest unanswered first. Answer with templates in one sheet. */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, doubts, type DoubtFilter } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, BottomSheet, Chip, IconButton, Pill, Skeleton } from '@/ui/kit';

type Data = Awaited<ReturnType<typeof doubts.list>>;
type Row = Data['rows'][number];
const age = (h: number) => (h < 1 ? 'just now' : h < 24 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago`);
const TEMPLATES = ['Great question! ', 'This is covered in the next lesson — ', 'We’ll go through this in Saturday’s live class. ', 'Please check the resources tab of this lesson. '];

export default function DoubtsInbox() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [filter, setFilter] = useState<DoubtFilter>('open');
  const [courseId, setCourseId] = useState<string | undefined>();
  const [data, setData] = useState<Data | null>(null);
  const [sel, setSel] = useState<Row | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const load = useCallback(() => { doubts.list(userId, filter, courseId).then(setData); }, [userId, filter, courseId]);
  useFocusEffect(load);

  const send = async () => {
    if (!sel) return;
    setBusy(true);
    setErr(null);
    try {
      await doubts.answer(userId, sel.q.id, text);
      setSel(null);
      load();
      setToast('Answer posted · student notified');
      setTimeout(() => setToast(null), 2200);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not post the answer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/educator/home'))} />
          <Txt variant="heading" style={{ flex: 1 }}>Student doubts</Txt>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label={`Waiting (${data?.counts.open ?? '…'})`} active={filter === 'open'} onPress={() => setFilter('open')} />
              <Chip label={`Answered (${data?.counts.answered ?? '…'})`} active={filter === 'answered'} onPress={() => setFilter('answered')} />
            </View>
            {(data?.courses.length ?? 0) > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Chip label="All courses" active={!courseId} onPress={() => setCourseId(undefined)} />
                {data!.courses.map((x) => <Chip key={x.c.id} label={`${x.c.title.length > 22 ? `${x.c.title.slice(0, 21)}…` : x.c.title}${x.open ? ` · ${x.open}` : ''}`} active={courseId === x.c.id} onPress={() => setCourseId(x.c.id)} />)}
              </ScrollView>
            )}
            {!data ? <View style={{ gap: 8 }}><Skeleton h={100} /><Skeleton h={100} /></View> : data.rows.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Ionicons name={filter === 'open' ? 'checkmark-done-circle-outline' : 'chatbubbles-outline'} size={36} color={filter === 'open' ? c.success : c.muted} />
                <Txt color={c.muted} center>{filter === 'open' ? 'No doubts waiting. Nice work!' : 'No answered doubts yet.'}</Txt>
              </View>
            ) : (
              data.rows.map((r) => (
                <Pressable key={r.q.id} onPress={() => { setSel(r); setText(r.q.answer?.text ?? ''); setErr(null); }} style={({ pressed }) => [styles.card, { backgroundColor: c.surface, borderColor: filter === 'open' && r.ageH > 24 ? c.warning : c.border }, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`Doubt from ${r.q.userName}: ${r.q.text}`}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar name={r.q.userName} size={34} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="label" numberOfLines={1}>{r.q.userName}</Txt>
                      <Txt variant="caption" color={c.muted} numberOfLines={1}>{r.lesson || r.course.title}</Txt>
                    </View>
                    {filter === 'open' && r.ageH > 24 ? <View><Pill text={age(r.ageH)} tone="warning" /></View> : <Txt variant="caption" color={c.muted}>{age(r.ageH)}</Txt>}
                  </View>
                  <Txt>{r.q.text}</Txt>
                  {r.q.answer ? (
                    <View style={[styles.ans, { backgroundColor: c.surfaceMuted }]}>
                      <Txt variant="caption" color={c.primary} style={{ fontWeight: '700' }}>{r.q.answer.by}</Txt>
                      <Txt variant="label" style={{ fontWeight: '400' }} numberOfLines={3}>{r.q.answer.text}</Txt>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="return-down-forward" size={16} color={c.primary} />
                      <Txt variant="label" color={c.primary}>Answer</Txt>
                    </View>
                  )}
                </Pressable>
              ))
            )}
            <Txt variant="caption" color={c.muted} center>Answers appear under the lesson for every student in the course.</Txt>
          </View>
        </ScrollView>
        {toast && <View style={[styles.toast, { backgroundColor: c.ink }]} pointerEvents="none"><Txt variant="label" color="#fff" center>{toast}</Txt></View>}
      </SafeAreaView>

      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel?.q.answer ? 'Edit answer' : 'Answer doubt'} footer={<Button title={sel?.q.answer ? 'Update answer' : 'Post answer'} size="md" loading={busy} style={{ flex: 1 }} onPress={send} />}>
        {sel && (
          <View style={{ gap: 10 }}>
            <View style={[styles.ans, { backgroundColor: c.surfaceMuted }]}>
              <Txt variant="caption" color={c.muted}>{sel.q.userName} · {sel.lesson}</Txt>
              <Txt variant="bodyStrong">{sel.q.text}</Txt>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {TEMPLATES.map((t) => <Chip key={t} label={t.trim()} onPress={() => setText((x) => x + t)} />)}
            </View>
            <TextInput value={text} onChangeText={setText} multiline autoFocus placeholder="Type your answer…" placeholderTextColor={c.muted} style={[styles.area, { borderColor: err ? c.danger : c.border, color: c.ink }]} accessibilityLabel="Answer" />
            {err && <Txt variant="caption" color={c.danger}>{err}</Txt>}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 24 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  ans: { borderRadius: 12, padding: 10, gap: 2 },
  empty: { borderWidth: 1, borderRadius: 18, padding: 28, alignItems: 'center', gap: 8 },
  area: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 110, textAlignVertical: 'top', fontSize: 15 },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 30, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
});
