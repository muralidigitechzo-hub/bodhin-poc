/**
 * 1-on-1 mentoring call. Same room layer as live classes (live/room.ts): LiveKit when the backend returns provider 'livekit',
 * otherwise the in-browser loopback room (two tabs on one device get chat + presence; audio/video need the media server).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { mentorship } from '@/api/mentorship';
import { prepareNative, type PersonInfo } from '@/live/livekit';
import { createRoom, type RoomLike } from '@/live/room';
import { minutesUntil } from '@/core/mentorship';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { RoomVideo } from '@/ui/RoomVideo';
import { clock } from '@/ui/calendarActions';

type Info = ReturnType<typeof mentorship.join>;
type Line = { id: string; by: string; text: string; at: number; mine: boolean };
const rid = () => Math.random().toString(36).slice(2, 10);

export default function MentorCall() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { session, ready } = useAuth();
  const userId = session?.user.id ?? '';
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [conn, setConn] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting');
  const [people, setPeople] = useState<PersonInfo[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState('');
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [mic, setMic] = useState(false);
  const [cam, setCam] = useState(false);
  const [mediaNote, setMediaNote] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const room = useRef<RoomLike | null>(null);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const leave = useCallback(async () => {
    try { await room.current?.disconnect(); } catch { /* already closed */ }
    room.current = null;
    router.canGoBack() ? router.back() : router.replace('/home');
  }, []);

  useEffect(() => {
    // Wait for the stored session to load: on a refresh or a direct link userId is '' until auth is ready.
    if (!ready || !userId) return;
    let dead = false;
    setErr(null);
    (async () => {
      try {
        const r = mentorship.join(userId, id);
        if (dead) return;
        setInfo(r);
        if (r.provider === 'livekit') await prepareNative();
        const rm = createRoom(
          r.provider,
          {
            onMsg: (m, from) => {
              if (m.t === 'chat') setLines((l) => (l.some((x) => x.id === m.id) ? l : [...l, { id: m.id, by: from.name, text: m.text, at: m.at, mine: false }]));
            },
            onPeople: setPeople,
            onState: setConn,
            onVideo: (v) => setRemote(r.role === 'host' ? v.peerCamera ?? null : v.hostCamera),
          },
          { sessionId: r.room, userId, name: r.name, isHost: r.role === 'host' },
        );
        room.current = rm;
        await rm.connect(r.url, r.token);
      } catch (e) {
        if (!dead) setErr(e instanceof ApiError || e instanceof Error ? e.message : 'Could not start the call.');
      }
    })();
    const t = setInterval(() => setTick((x) => x + 1), 20000);
    return () => { dead = true; clearInterval(t); room.current?.disconnect(); room.current = null; };
  }, [id, userId, ready]);

  useEffect(() => { scroller.current?.scrollToEnd({ animated: true }); }, [lines.length]);

  const send = () => {
    const t = text.trim();
    if (!t || !info) return;
    const m = { t: 'chat' as const, id: rid(), by: info.name, text: t.slice(0, 500), at: Date.now() };
    room.current?.send(m);
    setLines((l) => [...l, { id: m.id, by: 'You', text: m.text, at: m.at, mine: true }]);
    setText('');
  };
  const toggle = async (kind: 'mic' | 'cam') => {
    try {
      if (kind === 'mic') { await room.current?.setMic(!mic); setMic(!mic); } else { await room.current?.setCam(!cam); setCam(!cam); }
      setMediaNote(null);
    } catch (e) {
      setMediaNote(e instanceof Error ? e.message : 'Could not change your devices.');
    }
  };

  if (ready && !userId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, gap: 16, justifyContent: 'center' }}>
        <Banner text="Sign in to join your session." />
        <Button title="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
      </SafeAreaView>
    );
  }
  if (err) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, gap: 16, justifyContent: 'center' }}>
        <Banner text={err} />
        <Button title="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
      </SafeAreaView>
    );
  }
  if (!info) return <View style={{ flex: 1, backgroundColor: c.ivory }} />;

  const peer = people.find((p) => p.id !== userId);
  const mins = minutesUntil(info.startsAt, new Date());
  void tick;
  const when = mins > 0 ? `Starts in ${mins} min` : `Ends at ${clock(info.endsAt)}`;

  return (
    <View style={{ flex: 1, backgroundColor: '#0B1220' }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.bar}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong" color="#fff" numberOfLines={1}>{info.topic} · {info.peerName}</Txt>
              <Txt variant="caption" color="rgba(255,255,255,0.7)">{when} · {clock(info.startsAt)}–{clock(info.endsAt)}</Txt>
            </View>
            <View style={[styles.state, { backgroundColor: conn === 'connected' ? '#16A34A' : '#B45309' }]} accessibilityLabel={`Connection: ${conn}`}>
              <Txt variant="caption" color="#fff" style={{ fontWeight: '700' }}>{conn === 'connected' ? 'Connected' : conn === 'reconnecting' ? 'Reconnecting' : conn === 'disconnected' ? 'Disconnected' : 'Connecting…'}</Txt>
            </View>
          </View>

          <View style={styles.stage}>
            {remote ? (
              <RoomVideo stream={remote} fit="cover" style={{ borderRadius: radius.lg }} />
            ) : (
              <View style={styles.wait} accessibilityLiveRegion="polite">
                <Avatar name={info.peerName} size={84} />
                <Txt variant="heading" color="#fff">{peer ? `${info.peerName} is here` : `Waiting for ${info.peerName} to join…`}</Txt>
                <Txt variant="caption" color="rgba(255,255,255,0.7)" center>
                  {peer ? 'Say hello in the chat. Video and audio connect through the live media server.' : 'They will see you the moment they open the session.'}
                </Txt>
              </View>
            )}
            {!!info.note && (
              <View style={styles.noteCard}>
                <Txt variant="caption" color="rgba(255,255,255,0.7)">{info.role === 'host' ? 'Learner’s note' : 'Your note'}</Txt>
                <Txt variant="label" color="#fff">“{info.note}”</Txt>
              </View>
            )}
          </View>

          {mediaNote && <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}><Banner tone="info" text={mediaNote} /></View>}

          <View style={styles.chat}>
            <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, padding: 12 }}>
              {lines.length === 0 && <Txt variant="caption" color="rgba(255,255,255,0.55)" center>Chat with {info.peerName}. Messages are only visible in this session.</Txt>}
              {lines.map((l) => (
                <View key={l.id} style={[styles.bubble, l.mine ? { alignSelf: 'flex-end', backgroundColor: c.primary } : { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)' }]}>
                  <Txt variant="caption" color="rgba(255,255,255,0.7)">{l.by}</Txt>
                  <Txt color="#fff">{l.text}</Txt>
                </View>
              ))}
            </ScrollView>
            <View style={styles.compose}>
              <TextInput value={text} onChangeText={setText} onSubmitEditing={send} placeholder="Type a message" placeholderTextColor="rgba(255,255,255,0.5)" accessibilityLabel="Chat message" returnKeyType="send" maxLength={500} style={styles.input} />
              <Pressable onPress={send} disabled={!text.trim()} accessibilityRole="button" accessibilityLabel="Send message" style={[styles.send, { backgroundColor: text.trim() ? c.primary : 'rgba(255,255,255,0.15)' }]}>
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>

          <View style={styles.controls}>
            <Ctl icon={mic ? 'mic' : 'mic-off'} label={mic ? 'Mute microphone' : 'Unmute microphone'} on={mic} onPress={() => toggle('mic')} />
            <Ctl icon={cam ? 'videocam' : 'videocam-off'} label={cam ? 'Turn camera off' : 'Turn camera on'} on={cam} onPress={() => toggle('cam')} />
            <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Leave call" style={[styles.leave]}>
              <Ionicons name="call" size={22} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              <Txt variant="bodyStrong" color="#fff">Leave</Txt>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Ctl({ icon, label, on, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} style={[styles.ctl, { backgroundColor: on ? '#fff' : 'rgba(255,255,255,0.16)' }]}>
      <Ionicons name={icon} size={22} color={on ? '#0B1220' : '#fff'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  state: { paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: 'center' },
  stage: { flex: 1.1, marginHorizontal: 16, borderRadius: radius.lg, backgroundColor: '#111A2E', overflow: 'hidden', minHeight: 180 },
  wait: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  noteCard: { position: 'absolute', left: 10, bottom: 10, right: 10, padding: 10, borderRadius: radius.md, backgroundColor: 'rgba(0,0,0,0.55)', gap: 2 },
  chat: { flex: 1, marginHorizontal: 16, marginTop: 10, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden', minHeight: 140 },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, gap: 1 },
  compose: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  input: { flex: 1, minHeight: 44, borderRadius: 22, paddingHorizontal: 16, color: '#fff', backgroundColor: 'rgba(255,255,255,0.1)', fontSize: 16, outlineStyle: 'none' } as any,
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 12 },
  ctl: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  leave: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, height: 52, borderRadius: 26, backgroundColor: '#DC2626' },
});
