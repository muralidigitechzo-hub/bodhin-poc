/** Help center: searchable FAQs by topic, contact options, my tickets, raise a ticket. */
import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, support } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, IconButton, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';

const TOPICS = [
  ['Course & Learning', 'play-circle-outline', '#E9F0FD'],
  ['Payments & Enrollment', 'card-outline', '#FDF3E1'],
  ['Certificates', 'ribbon-outline', '#F1ECFC'],
  ['Live Classes', 'calendar-outline', '#E8F6EC'],
  ['Account & Profile', 'person-outline', '#FDECEC'],
  ['Technical Support', 'construct-outline', '#EEF2FF'],
] as const;
type Ticket = ReturnType<typeof support.tickets>[number];

export default function Help() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [tickets, setTickets] = useState(() => support.tickets(userId));
  const [sheet, setSheet] = useState<null | 'raise' | Ticket>(null);
  const [toast, setToast] = useState<string | null>(null);

  const faqs = useMemo(() => {
    const t = q.trim().toLowerCase();
    return support.faqs.filter((f) => (!topic || f.cat === topic) && (!t || `${f.q} ${f.a}`.toLowerCase().includes(t)));
  }, [q, topic]);

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2600);
  };
  const statusTone = { open: ['Open', 'warning'], in_progress: ['In progress', 'info'], resolved: ['Resolved', 'success'] } as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            <View style={{ paddingVertical: 8 }}>
              <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
            </View>
            <TwoTone lead="Help Center &" accent="Support" variant="title" />

            <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Ionicons name="search" size={20} color={c.inkSoft} />
              <TextInput value={q} onChangeText={setQ} placeholder="Search help, e.g. refund, certificate" placeholderTextColor={c.muted} accessibilityLabel="Search help" style={[styles.searchInput, { color: c.ink }]} />
              {!!q && <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Clear"><Ionicons name="close-circle" size={20} color={c.muted} /></Pressable>}
            </View>

            {!q && (
              <View style={styles.topics}>
                {TOPICS.map(([t, icon, tint]) => (
                  <Pressable key={t} onPress={() => setTopic(topic === t ? null : t)} style={[styles.topic, { backgroundColor: tint, borderColor: topic === t ? c.primary : 'transparent' }]} accessibilityRole="button" accessibilityState={{ selected: topic === t }}>
                    <Ionicons name={icon} size={24} color={c.primary} />
                    <Txt variant="label">{t}</Txt>
                  </Pressable>
                ))}
              </View>
            )}

            <Txt variant="heading" style={{ marginTop: 4 }}>{q ? `Results for “${q}”` : topic ?? 'Common questions'}</Txt>
            {faqs.length === 0 ? (
              <Txt color={c.muted}>No answers found. Try another word, or raise a ticket below.</Txt>
            ) : (
              faqs.map((f) => {
                const open = openFaq === f.q;
                return (
                  <Pressable key={f.q} onPress={() => setOpenFaq(open ? null : f.q)} style={[styles.faq, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Txt variant="bodyStrong" style={{ flex: 1 }}>{f.q}</Txt>
                      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.muted} />
                    </View>
                    {open && <Txt color={c.inkSoft}>{f.a}</Txt>}
                  </Pressable>
                );
              })
            )}

            <Txt variant="heading" style={{ marginTop: 10 }}>Need more help?</Txt>
            <View style={{ gap: 8 }}>
              <Contact icon="chatbubbles-outline" title="Chat with support" sub="Usually replies in minutes" primary onPress={() => setSheet('raise')} />
              <Contact icon="mail-outline" title="Email us" sub={support.contact.email} onPress={() => Linking.openURL(`mailto:${support.contact.email}`).catch(() => flash(support.contact.email))} />
              <Contact icon="call-outline" title="Call us" sub={`${support.contact.phone} · ${support.contact.hours}`} onPress={() => Linking.openURL(`tel:${support.contact.phone.replace(/\s/g, '')}`).catch(() => flash(support.contact.phone))} />
            </View>

            <Txt variant="heading" style={{ marginTop: 10 }}>My tickets</Txt>
            {tickets.length === 0 && <Txt color={c.muted}>No tickets yet.</Txt>}
            {tickets.map((t) => {
              const [l, tone] = statusTone[t.status];
              return (
                <Pressable key={t.id} onPress={() => setSheet(t)} style={[styles.ticket, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="button">
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt variant="caption" color={c.muted}>#{t.id} · {t.category}</Txt>
                    <Txt variant="label" numberOfLines={1}>{t.subject}</Txt>
                    <Txt variant="caption" color={c.muted}>Created {new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Txt>
                  </View>
                  <Pill text={l} tone={tone} />
                  <Ionicons name="chevron-forward" size={18} color={c.muted} />
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <View style={[styles.foot, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          <View style={styles.inner}>
            <Button title="Raise a support ticket" iconLeft="add-circle-outline" onPress={() => setSheet('raise')} />
          </View>
        </View>
        {toast && (
          <View style={[styles.toast, { backgroundColor: c.ink }]}><Txt variant="label" color="#fff" center>{toast}</Txt></View>
        )}
      </SafeAreaView>

      <RaiseSheet open={sheet === 'raise'} onClose={() => setSheet(null)} onDone={(t) => { setTickets(support.tickets(userId)); flash(`Ticket #${t.id} created. We'll reply by email and notification.`); }} />

      <BottomSheet open={!!sheet && sheet !== 'raise'} onClose={() => setSheet(null)} title={sheet && sheet !== 'raise' ? `Ticket #${sheet.id}` : ''}>
        {sheet && sheet !== 'raise' && (
          <View style={{ gap: 10 }}>
            <Pill text={statusTone[sheet.status][0]} tone={statusTone[sheet.status][1]} />
            <Txt variant="bodyStrong">{sheet.subject}</Txt>
            <View style={[styles.bubble, { backgroundColor: c.primarySoft, alignSelf: 'flex-end' }]}>
              <Txt variant="caption" color={c.muted}>You</Txt>
              <Txt>{sheet.body}</Txt>
            </View>
            {sheet.replies.map((r) => (
              <View key={r.at} style={[styles.bubble, { backgroundColor: c.surfaceMuted }]}>
                <Txt variant="caption" color={c.muted}>{r.by}</Txt>
                <Txt>{r.text}</Txt>
              </View>
            ))}
            {sheet.replies.length === 0 && <Txt variant="caption" color={c.muted}>Our team usually replies within 4 working hours.</Txt>}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

function Contact({ icon, title, sub, onPress, primary }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onPress: () => void; primary?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.contact, { backgroundColor: primary ? c.primary : c.surface, borderColor: primary ? c.primary : c.border }]} accessibilityRole="button">
      <Ionicons name={icon} size={24} color={primary ? '#fff' : c.primary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" color={primary ? '#fff' : c.ink}>{title}</Txt>
        <Txt variant="caption" color={primary ? 'rgba(255,255,255,0.8)' : c.muted} selectable>{sub}</Txt>
      </View>
      <Ionicons name="chevron-forward" size={18} color={primary ? '#fff' : c.muted} />
    </Pressable>
  );
}

function RaiseSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (t: Ticket) => void }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const [cat, setCat] = useState<string>(TOPICS[0][0]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const t = await support.raise(session!.user.id, { category: cat, subject, body });
      setSubject('');
      setBody('');
      onClose();
      onDone(t);
    } catch (e) {
      const a = e as ApiError;
      setErr({ field: a.field, msg: a.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet open={open} onClose={onClose} title="Raise a ticket" footer={<Button title="Submit ticket" iconRight="send" loading={busy} style={{ flex: 1 }} onPress={send} />}>
      <View style={{ gap: 8 }}>
        <Txt variant="label">Topic</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TOPICS.map(([t]) => <Chip key={t} label={t} active={cat === t} onPress={() => setCat(t)} />)}
        </View>
      </View>
      <TextField label="Subject" placeholder="e.g. Paid but course not showing" value={subject} onChangeText={setSubject} error={err?.field === 'subject' ? err.msg : null} />
      <View style={{ gap: 6 }}>
        <Txt variant="label">Describe the problem</Txt>
        <TextInput value={body} onChangeText={setBody} multiline placeholder="What happened? Add payment ID or screen name if relevant." placeholderTextColor={c.muted} accessibilityLabel="Describe the problem" style={[styles.area, { borderColor: err?.field === 'body' ? c.danger : c.border, backgroundColor: c.surfaceMuted, color: c.ink }]} />
        {err?.field === 'body' && <Txt variant="caption" color={c.danger}>{err.msg}</Txt>}
      </View>
      {err && !err.field && <Banner text={err.msg} />}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 110, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12, alignSelf: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 52, borderRadius: radius.pill, borderWidth: 1 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 16, minHeight: 50, outlineStyle: 'none' } as any,
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topic: { flexBasis: '31%', flexGrow: 1, gap: 8, padding: 12, borderRadius: radius.lg, minHeight: 88, borderWidth: 1.6 },
  faq: { padding: 14, borderRadius: radius.lg, borderWidth: 1, gap: 8 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, minHeight: 64 },
  ticket: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, borderWidth: 1 },
  bubble: { padding: 12, borderRadius: 14, gap: 2, maxWidth: '88%' },
  area: { minHeight: 110, borderWidth: 1.2, borderRadius: radius.md, padding: 12, fontSize: 15, textAlignVertical: 'top', outlineStyle: 'none' } as any,
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
  toast: { position: 'absolute', bottom: 90, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.pill, maxWidth: '90%' },
});
