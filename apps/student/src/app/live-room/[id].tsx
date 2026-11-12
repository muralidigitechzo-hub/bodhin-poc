/**
 * Student live class room — everything on screen comes from the real room, nothing is scripted.
 *  1 Live video & audio   2 Whiteboard (view)   3 Screen sharing (view)   4 Chat & Q&A   5 Emoji reactions
 *  6 Raise hand           7 Live poll & quiz    8 Attendance             9 Recording      10 File sharing
 * Transport: `livekit` (real media server, token from the live-token function) or `loopback`
 * (a host tab and learner tab on one device exchange every non-media feature; see src/live/loopback.ts).
 * mode=recording opens a finished class: recording, chapters, shared files and the learner's own attendance.
 * Phone portrait first: stage on top, panel below, controls in the thumb zone. ≥900px: stage + side panel.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { ApiError, liveTab } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, BottomSheet, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { RoomVideo } from '@/ui/RoomVideo';
import { prepareNative, type PersonInfo } from '@/live/livekit';
import { createRoom, type Provider, type RoomLike } from '@/live/room';
import { BOARD_H, BOARD_W, makeRateLimiter, REACTIONS, strokePath, type RoomMsg } from '@/live/protocol';

type Msg = { id: string; who: string; role: 'student' | 'instructor' | 'me' | 'system'; text: string; at: string };
type QaItem = { id: string; by: string; text: string; mine: boolean; answer?: string };
type PollState = { id: string; q: string; options: string[]; votes: number[]; quiz: boolean; closed: boolean; mine?: number; correct?: number };
type FileItem = { id: string; name: string; size: number; url: string };
type Stroke = { color: string; w: number; pts: [number, number][] };
type Stage = 'slides' | 'screen' | 'board';
type Panel = 'chat' | 'qa' | 'people' | 'files';

const clock = (d = new Date()) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const sizeLabel = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const hms = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const MAX_STROKES = 800;

export default function LiveRoom() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const { ready, session } = useAuth();
  const info = liveTab.session(id);
  // On a page refresh the signed-in user loads a moment after the first render; joining before that fails with "not enrolled".
  if (!ready) return <View style={{ flex: 1, backgroundColor: '#050B18' }} />;
  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050B18', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        <Banner text="Sign in to join this class." />
        <Button title="Sign in" onPress={() => router.replace('/sign-in')} />
      </View>
    );
  }
  if (!info) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050B18', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        <Banner text="This class could not be found." />
        <Button title="Back to Live" onPress={() => router.replace('/live')} />
      </View>
    );
  }
  return mode === 'recording' ? <RecordingView id={id} /> : <Room id={id} info={info} />;
}

/* ───────────────────────────── live room ───────────────────────────── */

function Room({ id, info }: { id: string; info: NonNullable<ReturnType<typeof liveTab.session>> }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const myName = session?.user.name ?? 'Learner';
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { session: s, course, tutor } = info;

  const [phase, setPhase] = useState<'joining' | 'in' | 'error' | 'ended'>('joining');
  const [err, setErr] = useState('');
  const [conn, setConn] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [provider, setProvider] = useState<Provider>('loopback');
  const [people, setPeople] = useState<PersonInfo[]>([]);
  const [hands, setHands] = useState<string[]>([]);
  const [hostCam, setHostCam] = useState<MediaStream | null>(null);
  const [hostScreen, setHostScreen] = useState<MediaStream | null>(null);
  const [speaker, setSpeaker] = useState<{ name: string; stream: MediaStream | null } | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [slide, setSlide] = useState<{ index: number; title?: string; sub?: string; total?: number } | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [qa, setQa] = useState<QaItem[]>([]);
  const [poll, setPoll] = useState<PollState | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [floating, setFloating] = useState<{ key: string; emoji: string; by: string }[]>([]);
  const [recordOn, setRecordOn] = useState(false);
  const [speakAllowed, setSpeakAllowed] = useState(false);
  const [mic, setMic] = useState(false);
  const [cam, setCam] = useState(false);
  const [hand, setHand] = useState(false);
  const [panel, setPanel] = useState<Panel>('chat');
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState({ chat: 0, qa: 0, files: 0 });
  const [pollOpen, setPollOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<string | null>(null);

  const room = useRef<RoomLike | null>(null);
  const alive = useRef(true);
  const joinedAt = useRef(Date.now());
  const hostSeenAt = useRef<number | null>(null); // attendance only counts while the instructor is in the room
  const sending = useRef(makeRateLimiter(5, 5000));
  const reacting = useRef(makeRateLimiter(4, 3000));
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const handle = useRef<(m: RoomMsg, from: PersonInfo) => void>(() => {});

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A message the learner cannot miss (the chat panel may be on another tab). */
  const flash = useCallback((t: string) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => alive.current && setToast(null), Math.min(10_000, Math.max(3000, t.length * 70)));
  }, []);
  const sys = useCallback((text: string) => setMsgs((x) => [...x, { id: `sys${Date.now()}${Math.random()}`, who: 'Bodhin', role: 'system', text, at: clock() }]), []);
  const bump = (k: 'chat' | 'qa' | 'files') => panelRef.current !== k && setUnread((u) => ({ ...u, [k]: u[k] + 1 }));

  handle.current = (m, from) => {
    switch (m.t) {
      case 'chat':
        setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, { id: m.id, who: from.name, role: from.isHost ? 'instructor' : 'student', text: m.text, at: clock() }]));
        bump('chat');
        break;
      case 'qa':
        setQa((x) => (x.some((y) => y.id === m.id) ? x : [...x, { id: m.id, by: from.name, text: m.text, mine: false }]));
        bump('qa');
        break;
      case 'qa_answer':
        setQa((x) => x.map((y) => (y.id === m.id ? { ...y, answer: m.text } : y)));
        bump('qa');
        break;
      case 'hand':
        setHands((h) => (m.up ? (h.includes(from.id) ? h : [...h, from.id]) : h.filter((y) => y !== from.id)));
        break;
      case 'react': {
        const key = `${Date.now()}${Math.random()}`;
        setFloating((f) => [...f.slice(-5), { key, emoji: m.emoji, by: from.name }]);
        setTimeout(() => alive.current && setFloating((f) => f.filter((y) => y.key !== key)), 2200);
        break;
      }
      case 'poll':
        setPoll({ id: m.id, q: m.q, options: m.options, votes: m.options.map(() => 0), quiz: !!m.quiz, closed: false });
        setPollOpen(true);
        sys(m.quiz ? 'A quiz question was posted.' : 'A poll was posted.');
        break;
      case 'poll_result':
        setPoll((p) => (p && p.id === m.id && !p.closed && m.votes.length === p.options.length ? { ...p, votes: m.votes } : p));
        break;
      case 'poll_close':
        setPoll((p) => (p && p.id === m.id ? { ...p, closed: true, votes: m.votes && m.votes.length === p.options.length ? m.votes : p.votes, correct: m.correct } : p));
        break;
      case 'slide':
        setSlide({ index: m.index, title: m.title, sub: m.sub, total: m.total });
        break;
      case 'stage':
        setStage(m.mode);
        break;
      case 'stroke':
        setStrokes((x) => [...x.slice(-(MAX_STROKES - 1)), { color: m.color, w: m.w, pts: m.pts }]);
        break;
      case 'board_clear':
        setStrokes([]);
        break;
      case 'file':
        setFiles((x) => {
          if (x.some((y) => y.id === m.id)) return x;
          bump('files');
          return [...x, { id: m.id, name: m.name, size: m.size, url: m.url }];
        });
        break;
      case 'record':
        setRecordOn(m.on);
        break;
      case 'allow_speak':
        if (m.who === userId) {
          setSpeakAllowed(m.on);
          setHand(false);
          if (m.on) {
            sys('The instructor allowed you to speak. You can unmute now.');
            if (provider === 'livekit') connect(true).catch(() => {});
          } else {
            sys('The instructor muted you.');
            room.current?.setMic(false).catch(() => {});
            room.current?.setCam(false).catch(() => {});
            setMic(false);
            setCam(false);
          }
        }
        break;
      case 'end':
        endedByHost();
        break;
    }
  };

  const stayedMin = () => (hostSeenAt.current ? (Date.now() - Math.max(joinedAt.current, hostSeenAt.current)) / 6e4 : 0);
  const endedByHost = () => {
    if (!alive.current) return;
    liveTab.leave(userId, id, stayedMin());
    room.current?.disconnect();
    room.current = null;
    setPhase('ended');
  };

  const connect = async (again = false) => {
    const r = await liveTab.join(userId, id);
    if (!alive.current) return;
    setProvider(r.provider);
    setSpeakAllowed(r.speakAllowed);
    if (r.provider === 'livekit') await prepareNative();
    await room.current?.disconnect();
    const rm = createRoom(
      r.provider,
      {
        onState: (st) => {
          if (!alive.current) return;
          setConn(st === 'connected' || st === 'connecting' ? 'connected' : st);
        },
        onPeople: (p) => {
          if (!alive.current) return;
          setPeople(p);
          if (p.some((x) => x.isHost)) hostSeenAt.current ??= Date.now();
        },
        onVideo: (v) => {
          if (!alive.current) return;
          setHostCam(v.hostCamera);
          setHostScreen(v.hostScreen);
          setSpeaker(v.speaker ?? null);
        },
        onMsg: (m, from) => handle.current(m, from),
      },
      { sessionId: id, userId, name: r.name, isHost: false },
    );
    await rm.connect(r.url, r.token);
    room.current = rm;
    await rm.send({ t: 'hello', by: r.name });
    if (!again) joinedAt.current = Date.now();
  };

  useEffect(() => {
    alive.current = true;
    connect()
      .then(() => alive.current && setPhase('in'))
      .catch((e) => {
        if (!alive.current) return;
        setErr((e as ApiError).message ?? String(e));
        setPhase('error');
      });
    return () => {
      alive.current = false;
      room.current?.disconnect();
      room.current = null;
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // class clock + attendance heartbeat (one minute of presence per minute in the room)
  useEffect(() => {
    if (phase !== 'in') return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const beat = setInterval(() => hostHere.current && liveTab.heartbeat(userId, id), 60_000);
    return () => {
      clearInterval(tick);
      clearInterval(beat);
    };
  }, [phase, id, userId]);

  // tell the host when the hand goes up or down
  const hostHere = useRef(false);
  const firstHand = useRef(true);
  useEffect(() => {
    if (firstHand.current) {
      firstHand.current = false;
      return;
    }
    room.current?.send({ t: 'hand', by: myName, up: hand });
  }, [hand]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!reactOpen) return;
    const t = setTimeout(() => setReactOpen(false), 6000);
    return () => clearTimeout(t);
  }, [reactOpen]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setReactOpen(false);
      setMore(false);
      setPollOpen(false);
      setLeaveAsk(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const list = useRef<FlatList<Msg>>(null);
  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [msgs.length, panel]);

  const leave = () => {
    liveTab.leave(userId, id, stayedMin());
    room.current?.disconnect();
    room.current = null;
    router.canGoBack() ? router.back() : router.replace('/live');
  };

  const host = people.find((p) => p.isHost);
  hostHere.current = !!host;
  const elapsed = Math.max(0, Math.floor((now - new Date(s.startsAt).getTime()) / 1000));

  /* ── actions ── */
  const send = () => {
    const t = draft.trim();
    if (!t || !room.current) return;
    if (!sending.current(userId)) return flash('Slow down a little — you are sending messages too fast.');
    const mid = `${userId}-${Date.now()}`;
    if (panel === 'qa') {
      room.current.send({ t: 'qa', id: mid, by: myName, text: t.slice(0, 500), at: Date.now() });
      setQa((x) => [...x, { id: mid, by: myName, text: t.slice(0, 500), mine: true }]);
    } else {
      room.current.send({ t: 'chat', id: mid, by: myName, text: t.slice(0, 500), at: Date.now() });
      setMsgs((x) => [...x, { id: mid, who: 'You', role: 'me', text: t.slice(0, 500), at: clock() }]);
    }
    setDraft('');
  };
  const vote = (i: number) => {
    if (!poll || poll.closed || poll.mine != null || !room.current) return;
    room.current.send({ t: 'vote', pollId: poll.id, option: i, by: myName });
    setPoll({ ...poll, mine: i, votes: poll.votes.map((v, k) => (k === i ? v + 1 : v)) });
  };
  const react = (e: string) => {
    setReactOpen(false);
    if (!reacting.current(userId)) return;
    room.current?.send({ t: 'react', by: myName, emoji: e });
    const key = `${Date.now()}${Math.random()}`;
    setFloating((f) => [...f.slice(-5), { key, emoji: e, by: 'You' }]);
    setTimeout(() => alive.current && setFloating((f) => f.filter((y) => y.key !== key)), 2200);
  };
  const media = async (kind: 'mic' | 'cam') => {
    if (!speakAllowed) return flash('You joined listen-only. Tap Raise hand — the instructor can let you speak.');
    const on = kind === 'mic' ? !mic : !cam;
    try {
      await (kind === 'mic' ? room.current?.setMic(on) : room.current?.setCam(on));
      kind === 'mic' ? setMic(on) : setCam(on);
    } catch (e) {
      flash((e as Error).message || 'Could not turn that on.');
    }
  };
  const openFile = (f: FileItem) => Linking.openURL(f.url).catch(() => sys('Could not open that file.'));
  const openPanel = (p: Panel) => {
    setPanel(p);
    if (p !== 'people') setUnread((u) => ({ ...u, [p]: 0 }));
  };

  /* ── screens: joining / error / ended ── */
  if (phase === 'joining' || phase === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: '#050B18', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        {phase === 'joining' ? (
          <>
            <Ionicons name="radio" size={40} color="#fff" />
            <Txt variant="heading" color="#fff" center>Joining {s.title}…</Txt>
            <Txt variant="label" color="rgba(255,255,255,0.7)" center>You’ll join with mic and camera off.</Txt>
          </>
        ) : (
          <>
            <Banner text={err} />
            <Button title="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/live'))} />
          </>
        )}
      </View>
    );
  }
  if (phase === 'ended') {
    return (
      <View style={{ flex: 1, backgroundColor: '#050B18', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        <Ionicons name="checkmark-circle" size={48} color="#3FD17C" />
        <Txt variant="heading" color="#fff" center>The class has ended</Txt>
        <Txt variant="label" color="rgba(255,255,255,0.7)" center>Your attendance is saved. If the class was recorded, the recording appears in Live → Past & Attendance.</Txt>
        <Button title="Back to Live" onPress={() => router.replace('/live')} />
      </View>
    );
  }

  /* ── stage ── */
  const main = stage === 'board' ? 'board' : stage === 'slides' && slide ? 'slide' : hostScreen ? 'screen' : hostCam ? 'cam' : 'wait';
  const pip = hostCam && (main === 'slide' || main === 'board' || main === 'screen');
  const stageView = (
    <View style={[styles.stage, wide && { flex: 1 }]}>
      <View style={styles.stageBox}>
        {main === 'board' && <Board strokes={strokes} />}
        {main === 'slide' && slide && (
          <View style={[styles.slide, { backgroundColor: '#FFFBF3' }]}>
            <Txt variant="caption" color="#64748B" style={{ fontWeight: '700' }}>{course.title.toUpperCase()}</Txt>
            <Txt variant="title" color="#0E1B33" style={{ fontSize: wide ? 30 : 20, lineHeight: wide ? 36 : 26 }}>{slide.title ?? `Slide ${slide.index + 1}`}</Txt>
            <View style={{ width: 44, height: 3, backgroundColor: '#E8A21B', borderRadius: 2 }} />
            {!!slide.sub && <Txt variant={wide ? 'body' : 'label'} color="#1E293B">{slide.sub}</Txt>}
            <Txt variant="caption" color="#94A3B8" style={{ position: 'absolute', right: 12, bottom: 8 }}>{slide.index + 1}{slide.total ? ` / ${slide.total}` : ''}</Txt>
          </View>
        )}
        {main === 'screen' && <RoomVideo stream={hostScreen} fit="contain" />}
        {main === 'cam' && <RoomVideo stream={hostCam} fit="cover" />}
        {main === 'wait' && (
          <View style={styles.wait}>
            <Avatar name={tutor.name} color={tutor.color} size={64} />
            <Txt variant="label" color="#fff" center>
              {host ? (provider === 'loopback' ? `${host.name} is in the class. Waiting for a slide or the whiteboard…` : `Waiting for ${host.name.split(' ')[0]} to start video…`) : `Waiting for ${tutor.name} to start the class…`}
            </Txt>
          </View>
        )}
        {pip && (
          <View style={styles.pip}>
            <RoomVideo stream={hostCam} fit="cover" />
          </View>
        )}
        {speaker && (
          <View style={styles.speakerTile} pointerEvents="none">
            {speaker.stream ? <RoomVideo stream={speaker.stream} fit="cover" /> : <Ionicons name="mic" size={22} color="#3FD17C" style={{ alignSelf: 'center', marginTop: 10 }} />}
            <View style={styles.speakerName}>
              <Ionicons name="mic" size={10} color="#3FD17C" />
              <Txt variant="caption" color="#fff" style={{ fontSize: 10 }} numberOfLines={1}>{speaker.name}</Txt>
            </View>
          </View>
        )}
        <View style={styles.floatRow} pointerEvents="none">
          {floating.map((f) => (
            <View key={f.key} style={styles.floatChip}>
              <Txt style={{ fontSize: 26 }}>{f.emoji}</Txt>
              <Txt variant="caption" color="#fff" numberOfLines={1} style={{ maxWidth: 70 }}>{f.by}</Txt>
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  /* ── panel ── */
  const roster = people.filter((p) => !p.isHost);
  const tabs: [Panel, string, number][] = [
    ['chat', 'Chat', unread.chat],
    ['qa', 'Q&A', unread.qa],
    ['people', `People (${people.length})`, 0],
    ['files', 'Files', unread.files],
  ];
  const panelView = (
    <View style={[styles.panel, { backgroundColor: c.surface }, wide && { width: 380, borderRadius: 20, margin: 12 }]}>
      <View style={styles.panelTabs} accessibilityRole="tablist">
        {tabs.map(([k, l, n]) => (
          <Pressable key={k} onPress={() => openPanel(k)} accessibilityRole="tab" accessibilityState={{ selected: panel === k }} style={[styles.pTab, panel === k && { backgroundColor: c.primary }]}>
            <Txt variant="caption" color={panel === k ? '#fff' : c.inkSoft} style={{ fontWeight: '700' }} numberOfLines={1}>{l}</Txt>
            {n > 0 && panel !== k && <View style={[styles.dot, { backgroundColor: c.live }]} />}
          </Pressable>
        ))}
      </View>

      {poll && (panel === 'chat' || panel === 'qa') && (
        <Pressable onPress={() => setPollOpen(true)} style={[styles.pollBanner, { backgroundColor: c.primarySoft, borderColor: c.primary }]} accessibilityRole="button">
          <Ionicons name={poll.quiz ? 'help-circle' : 'bar-chart'} size={18} color={c.primary} />
          <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>{poll.q}</Txt>
          <Txt variant="label" color={c.primary}>{poll.closed ? 'Results' : poll.mine == null ? (poll.quiz ? 'Answer' : 'Vote') : 'Live'}</Txt>
        </Pressable>
      )}

      {panel === 'chat' && (
        <FlatList
          ref={list}
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 10, flexGrow: 1 }}
          ListEmptyComponent={<Txt variant="caption" color={c.muted} center style={{ marginTop: 24 }}>No messages yet. Say hello to the class.</Txt>}
          renderItem={({ item: m }) =>
            m.role === 'system' ? (
              <Txt variant="caption" color={c.muted} center>{m.text}</Txt>
            ) : (
              <View style={[styles.msg, m.role === 'me' && { alignSelf: 'flex-end', backgroundColor: c.primary }, m.role === 'instructor' && { backgroundColor: c.accentSoft }, m.role === 'student' && { backgroundColor: c.surfaceMuted }]}>
                <Txt variant="caption" color={m.role === 'me' ? 'rgba(255,255,255,0.8)' : c.inkSoft} style={{ fontWeight: '700' }}>
                  {m.who}{m.role === 'instructor' ? ' · Instructor' : ''} <Txt variant="caption" color={m.role === 'me' ? 'rgba(255,255,255,0.6)' : c.muted} style={{ fontWeight: '400' }}>{m.at}</Txt>
                </Txt>
                <Txt variant="label" color={m.role === 'me' ? '#fff' : c.ink} style={{ fontWeight: '500' }}>{m.text}</Txt>
              </View>
            )
          }
        />
      )}

      {panel === 'qa' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10, flexGrow: 1 }}>
          {!qa.length && <Txt variant="caption" color={c.muted} center style={{ marginTop: 24 }}>No questions yet. Ask the instructor below — answers appear under your question.</Txt>}
          {qa.map((q) => (
            <View key={q.id} style={[styles.qa, { borderColor: q.mine ? c.primary : c.border }]}>
              <Txt variant="caption" color={c.muted}>{q.mine ? 'You asked' : `${q.by} asked`}</Txt>
              <Txt variant="bodyStrong">{q.text}</Txt>
              {q.answer ? (
                <View style={[styles.answer, { backgroundColor: c.accentSoft }]}>
                  <Txt variant="caption" color={c.inkSoft} style={{ fontWeight: '700' }}>Instructor</Txt>
                  <Txt variant="label" style={{ fontWeight: '500' }}>{q.answer}</Txt>
                </View>
              ) : (
                <Txt variant="caption" color={c.muted}>Waiting for an answer</Txt>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {panel === 'people' && (
        <FlatList
          data={[...(host ? [host] : []), ...roster]}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 12, gap: 6, flexGrow: 1 }}
          ListEmptyComponent={<Txt variant="caption" color={c.muted} center style={{ marginTop: 24 }}>No one else is in the room yet.</Txt>}
          renderItem={({ item: p }) => (
            <View style={styles.person}>
              <Avatar name={p.name} size={34} color={p.isHost ? tutor.color : c.inkSoft} />
              <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>{p.id === userId ? 'You' : p.name}{p.isHost ? ' (Instructor)' : ''}</Txt>
              {hands.includes(p.id) && <Txt style={{ fontSize: 16 }}>✋</Txt>}
              <Ionicons name={p.micOn ? 'mic' : 'mic-off'} size={16} color={p.micOn ? c.success : c.muted} />
            </View>
          )}
        />
      )}

      {panel === 'files' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}>
          {!files.length && <Txt variant="caption" color={c.muted} center style={{ marginTop: 24 }}>No files shared yet. Files your instructor shares appear here.</Txt>}
          {files.map((f) => (
            <Pressable key={f.id} onPress={() => openFile(f)} style={[styles.file, { borderColor: c.border }]} accessibilityRole="button" accessibilityLabel={`Download ${f.name}`}>
              <Ionicons name="document-attach-outline" size={22} color={c.danger} />
              <View style={{ flex: 1 }}>
                <Txt variant="label" numberOfLines={2}>{f.name}</Txt>
                <Txt variant="caption" color={c.muted}>{sizeLabel(f.size)}</Txt>
              </View>
              <Ionicons name="download-outline" size={22} color={c.primary} />
            </Pressable>
          ))}
        </ScrollView>
      )}

      {(panel === 'chat' || panel === 'qa') && (
        <View style={[styles.compose, { borderTopColor: c.border }]}>
          <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={send} placeholder={panel === 'qa' ? 'Ask the instructor a question…' : 'Message everyone…'} placeholderTextColor={c.muted} returnKeyType="send" maxLength={500} accessibilityLabel={panel === 'qa' ? 'Ask a question' : 'Chat message'} style={[styles.input, { backgroundColor: c.surfaceMuted, color: c.ink }]} />
          <Pressable onPress={send} disabled={!draft.trim()} style={[styles.sendBtn, { backgroundColor: c.primary, opacity: draft.trim() ? 1 : 0.5 }]} accessibilityRole="button" accessibilityLabel="Send">
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#050B18' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TopBar title={s.title} sub={course.title} onBack={() => setLeaveAsk(true)} viewers={people.length} time={hms(elapsed)} rec={recordOn && !!host} started={!!host} />
          {conn !== 'connected' && (
            <View style={[styles.statusBar, { backgroundColor: conn === 'reconnecting' ? c.accent : c.danger }]}>
              <Txt variant="label" color="#fff" style={{ flex: 1 }}>{conn === 'reconnecting' ? 'Connection lost. Reconnecting…' : 'You were disconnected from the class.'}</Txt>
              {conn === 'disconnected' && <Pressable onPress={() => connect(true).then(() => setConn('connected')).catch((e) => sys((e as Error).message))} accessibilityRole="button"><Txt variant="label" color="#fff" style={{ fontWeight: '800' }}>Rejoin</Txt></Pressable>}
            </View>
          )}
          {hand && (
            <View style={[styles.statusBar, { backgroundColor: c.accent }]}>
              <Ionicons name="hand-left" size={16} color="#fff" />
              <Txt variant="label" color="#fff">Hand raised · waiting for the instructor</Txt>
            </View>
          )}
          <View style={[{ flex: 1 }, wide && { flexDirection: 'row' }]}>
            {stageView}
            {panelView}
          </View>

          {reactOpen && (
            <View style={styles.reactRow}>
              {REACTIONS.map((e) => (
                <Pressable key={e} onPress={() => react(e)} style={styles.reactBtn} accessibilityRole="button" accessibilityLabel={`React ${e}`}>
                  <Txt style={{ fontSize: 26 }}>{e}</Txt>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.controls}>
            <Ctl icon={mic ? 'mic' : 'mic-off'} label={mic ? 'Mute' : 'Unmute'} off={!mic} onPress={() => media('mic')} />
            <Ctl icon={cam ? 'videocam' : 'videocam-off'} label={cam ? 'Stop video' : 'Video'} off={!cam} onPress={() => media('cam')} />
            <Ctl icon="hand-left" label={hand ? 'Lower' : 'Raise hand'} active={hand} onPress={() => setHand((h) => !h)} />
            <Ctl icon="happy-outline" label="React" active={reactOpen} onPress={() => setReactOpen((v) => !v)} />
            <Ctl icon="ellipsis-horizontal" label="More" onPress={() => setMore(true)} />
            <Pressable onPress={() => setLeaveAsk(true)} style={styles.leave} accessibilityRole="button" accessibilityLabel="Leave class">
              <Ionicons name="call" size={22} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Txt variant="label" color="#fff" center>{toast}</Txt>
        </View>
      )}

      <BottomSheet open={pollOpen && !!poll} onClose={() => setPollOpen(false)} title={poll?.quiz ? 'Live quiz' : 'Live poll'}>
        {poll && <PollCard poll={poll} onVote={vote} />}
      </BottomSheet>

      <BottomSheet open={more} onClose={() => setMore(false)} title="More">
        {([
          ['bar-chart-outline', poll?.quiz ? 'Live quiz' : 'Live poll', poll ? (poll.closed ? 'See results' : 'Answer or see live results') : 'Nothing posted yet', () => { setMore(false); if (poll) setPollOpen(true); else flash('No poll or quiz has been posted yet.'); }],
          ['document-attach-outline', 'Class files', files.length ? `${files.length} shared` : 'None shared yet', () => { openPanel('files'); setMore(false); }],
          ['people-outline', 'People in class', `${people.length} in the room`, () => { openPanel('people'); setMore(false); }],
        ] as const).map(([icon, t, sub, fn]) => (
          <Pressable key={t} onPress={fn} style={styles.moreRow} accessibilityRole="button">
            <Ionicons name={icon} size={24} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{t}</Txt>
              <Txt variant="caption" color={c.muted}>{sub}</Txt>
            </View>
          </Pressable>
        ))}
      </BottomSheet>

      <BottomSheet
        open={leaveAsk}
        onClose={() => setLeaveAsk(false)}
        title="Leave this class?"
        footer={
          <>
            <Button title="Stay" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setLeaveAsk(false)} />
            <Button title="Leave" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={leave} />
          </>
        }
      >
        <Txt color={c.inkSoft}>The time you spent in the class is saved as your attendance.{recordOn && host ? ' This class is being recorded — the recording appears in Live → Past & Attendance once it is ready.' : ''}</Txt>
      </BottomSheet>
    </View>
  );
}

/* ───────────────────────────── recording of a finished class ───────────────────────────── */

function RecordingView({ id }: { id: string }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const data = liveTab.recording(userId, id);
  const video = useRef<any>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/live'));
  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050B18', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        <Banner text="Only enrolled learners can open this recording." />
        <Button title="Back" onPress={back} />
      </View>
    );
  }
  const { session: s, course, tutor, recording, chapters, materials, attendance, attended } = data;
  const seek = (sec: number) => {
    if (video.current) {
      video.current.currentTime = sec;
      video.current.play?.().catch(() => {});
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: '#050B18' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <TopBar title={s.title} sub={`Recording · ${new Date(s.startsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`} onBack={back} />
        <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 30 }}>
          <View style={{ width: '100%', maxWidth: 960, gap: 14 }}>
            {recording.state === 'ready' && recording.url ? (
              Platform.OS === 'web' ? (
                <View style={{ aspectRatio: 16 / 9, backgroundColor: '#000' }}>
                  {React.createElement('video', { ref: video, src: recording.url, controls: true, playsInline: true, preload: 'metadata', 'aria-label': 'Class recording', style: { width: '100%', height: '100%', background: '#000' } })}
                </View>
              ) : (
                <View style={{ padding: 20 }}>
                  <Button title="Play recording" iconLeft="play" onPress={() => Linking.openURL(recording.url!)} />
                </View>
              )
            ) : (
              <View style={[styles.recInfo, { margin: 16 }]}>
                <Ionicons name={recording.state === 'processing' ? 'hourglass-outline' : 'videocam-off-outline'} size={34} color="rgba(255,255,255,0.8)" />
                <Txt variant="bodyStrong" color="#fff" center>{recording.state === 'processing' ? 'The recording is being prepared' : recording.state === 'unavailable' ? 'The recording is not available' : 'This class was not recorded'}</Txt>
                <Txt variant="caption" color="rgba(255,255,255,0.65)" center>{recording.state === 'processing' ? 'It shows up here as soon as it is ready — usually within an hour of the class ending.' : recording.state === 'unavailable' ? 'This class was recorded, but the file is not available. Ask your instructor to upload it again.' : 'Your instructor did not record this class.'}</Txt>
              </View>
            )}

            <View style={{ paddingHorizontal: 20, gap: 6 }}>
              <Txt variant="heading" color="#fff">{s.title}</Txt>
              <Txt variant="label" color="rgba(255,255,255,0.7)">{tutor.name} · {course.title}</Txt>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <Pill text={attended ? `Attended · ${attendance?.minutes ?? 0} min` : 'Missed'} tone={attended ? 'success' : 'warning'} icon={attended ? 'checkmark' : undefined} />
              </View>
            </View>

            {chapters.length > 1 && (
              <View style={{ paddingHorizontal: 20, gap: 6 }}>
                <Txt variant="label" color="rgba(255,255,255,0.7)" style={{ fontWeight: '700' }}>CHAPTERS</Txt>
                {chapters.map((ch, i) => (
                  <Pressable key={i} onPress={() => seek(ch.atSec)} disabled={recording.state !== 'ready'} style={styles.chapter} accessibilityRole="button" accessibilityLabel={`Jump to ${ch.label}`}>
                    <Txt variant="caption" color="#E8A21B" style={{ width: 54, fontWeight: '700' }}>{hms(ch.atSec).replace(/^00:/, '')}</Txt>
                    <Txt variant="label" color="#fff" style={{ flex: 1 }}>{ch.label}</Txt>
                  </Pressable>
                ))}
              </View>
            )}

            {materials.length > 0 && (
              <View style={{ paddingHorizontal: 20, gap: 6 }}>
                <Txt variant="label" color="rgba(255,255,255,0.7)" style={{ fontWeight: '700' }}>FILES SHARED IN CLASS</Txt>
                {materials.map((m, i) => (
                  <Pressable key={i} onPress={() => m.url && Linking.openURL(m.url)} disabled={!m.url} style={[styles.chapter, { opacity: m.url ? 1 : 0.6 }]} accessibilityRole="button" accessibilityLabel={`Open ${m.name}`}>
                    <Ionicons name="document-attach-outline" size={20} color="#fff" />
                    <Txt variant="label" color="#fff" style={{ flex: 1 }} numberOfLines={2}>{m.name}</Txt>
                    <Txt variant="caption" color="rgba(255,255,255,0.6)">{m.size}</Txt>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/* ───────────────────────────── small pieces ───────────────────────────── */

function Board({ strokes }: { strokes: Stroke[] }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }]} accessibilityLabel="Instructor whiteboard">
      <Svg width="100%" height="100%" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} preserveAspectRatio="xMidYMid meet">
        {strokes.map((st, i) => (
          <Path key={i} d={strokePath(st.pts)} stroke={st.color === 'eraser' ? '#fff' : st.color} strokeWidth={st.w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </Svg>
    </View>
  );
}

function PollCard({ poll, onVote }: { poll: PollState; onVote: (i: number) => void }) {
  const { c } = useTheme();
  const total = poll.votes.reduce((a, b) => a + b, 0);
  const showResults = poll.closed || poll.mine != null;
  const right = poll.quiz && poll.closed && poll.correct != null ? poll.mine === poll.correct : null;
  return (
    <View style={[styles.poll, { borderColor: c.primary, backgroundColor: c.primarySoft }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={poll.quiz ? 'help-circle' : 'bar-chart'} size={16} color={c.primary} />
        <Txt variant="caption" color={c.primary} style={{ fontWeight: '800' }}>{poll.quiz ? 'LIVE QUIZ' : 'LIVE POLL'}{poll.closed ? ' · CLOSED' : ''}</Txt>
      </View>
      <Txt variant="bodyStrong">{poll.q}</Txt>
      {poll.options.map((o, i) => {
        const pct = total ? Math.round((poll.votes[i] / total) * 100) : 0;
        const isRight = poll.closed && poll.correct === i;
        const isMine = poll.mine === i;
        const border = isRight ? c.success : isMine ? c.primary : c.border;
        return (
          <Pressable key={o + i} disabled={poll.closed || poll.mine != null} onPress={() => onVote(i)} style={[styles.pollOpt, { borderColor: border, backgroundColor: c.surface }]} accessibilityRole="radio" accessibilityState={{ checked: isMine, disabled: poll.closed || poll.mine != null }}>
            {showResults && <View style={[StyleSheet.absoluteFill, { width: `${pct}%`, backgroundColor: isRight ? c.successBg : isMine ? c.primarySoft : c.surfaceMuted, borderRadius: radius.md }]} />}
            <Txt variant="label" style={{ flex: 1 }}>{o}</Txt>
            {isRight && <Ionicons name="checkmark-circle" size={18} color={c.success} />}
            {showResults && <Txt variant="label" color={c.inkSoft}>{pct}%</Txt>}
          </Pressable>
        );
      })}
      <Txt variant="caption" color={right === true ? c.success : right === false ? c.danger : c.muted}>
        {right === true ? 'Correct!' : right === false ? (poll.mine == null ? 'You did not answer this one.' : 'Not quite — the correct answer is marked.') : poll.closed ? `Closed · ${total} ${total === 1 ? 'response' : 'responses'}` : poll.mine != null ? `Answer sent · ${total} so far` : poll.quiz ? 'Pick your answer' : 'Tap an option to vote'}
      </Txt>
    </View>
  );
}

function TopBar({ title, sub, onBack, viewers, time, rec, started }: { title: string; sub: string; onBack: () => void; viewers?: number; time?: string; rec?: boolean; started?: boolean }) {
  const live = viewers != null;
  return (
    <View style={styles.top}>
      <Pressable onPress={onBack} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Leave">
        <Ionicons name="chevron-back" size={22} color="#fff" />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" color="#fff" numberOfLines={1}>{title}</Txt>
        <Txt variant="caption" color="rgba(255,255,255,0.6)" numberOfLines={1}>{sub}</Txt>
      </View>
      {live && (
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {rec && (
              <View style={[styles.liveTag, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                <Ionicons name="ellipse" size={8} color="#FF6B6E" />
                <Txt variant="caption" color="#fff" style={{ fontWeight: '800' }}>REC</Txt>
              </View>
            )}
            {started ? (
              <View style={styles.liveTag}>
                <View style={styles.liveDot} />
                <Txt variant="caption" color="#fff" style={{ fontWeight: '800' }}>LIVE</Txt>
              </View>
            ) : (
              <View style={[styles.liveTag, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                <Txt variant="caption" color="#fff" style={{ fontWeight: '800' }}>NOT STARTED</Txt>
              </View>
            )}
          </View>
          <Txt variant="caption" color="rgba(255,255,255,0.7)" style={{ fontVariant: ['tabular-nums'], fontSize: 11 }}>
            👁 {viewers}{started ? ` · ${time}` : ''}
          </Txt>
        </View>
      )}
    </View>
  );
}

function Ctl({ icon, label, onPress, off, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; off?: boolean; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.ctl} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active }}>
      <View style={[styles.ctlIcon, off && { backgroundColor: 'rgba(229,56,59,0.18)' }, active && { backgroundColor: '#D99A1E' }]}>
        <Ionicons name={icon} size={22} color={off ? '#FF6B6E' : '#fff'} />
      </View>
      <Txt variant="caption" color="rgba(255,255,255,0.8)" style={{ fontSize: 10.5 }} numberOfLines={1}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  topBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E5383B', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  statusBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  stage: { padding: 12, paddingTop: 4, justifyContent: 'center' },
  stageBox: { width: '100%', maxWidth: 1100, alignSelf: 'center', aspectRatio: 16 / 9, backgroundColor: '#0B1426', borderRadius: 14, overflow: 'hidden' },
  slide: { flex: 1, padding: 16, gap: 8, justifyContent: 'center' },
  wait: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 },
  pip: { position: 'absolute', right: 8, bottom: 8, width: 104, height: 72, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#3FD17C', backgroundColor: '#000' },
  speakerTile: { position: 'absolute', left: 8, top: 8, width: 96, height: 64, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#3FD17C', backgroundColor: '#0B1426' },
  speakerName: { position: 'absolute', left: 4, right: 4, bottom: 3, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6, paddingHorizontal: 4 },
  floatRow: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', gap: 6, alignItems: 'flex-end' },
  floatChip: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4 },
  panel: { flex: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  panelTabs: { flexDirection: 'row', gap: 6, padding: 8 },
  pTab: { flex: 1, minHeight: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, flexDirection: 'row', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  msg: { maxWidth: '86%', padding: 10, borderRadius: 14, gap: 2, alignSelf: 'flex-start' },
  qa: { borderWidth: 1.2, borderRadius: 14, padding: 10, gap: 6 },
  answer: { borderRadius: 10, padding: 8, gap: 2 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  compose: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderTopWidth: 1 },
  input: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: 999, paddingHorizontal: 16, fontSize: 15, outlineStyle: 'none' } as any,
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  reactRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 6, backgroundColor: '#0B1426' },
  reactBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6, paddingTop: 10, paddingBottom: 8, backgroundColor: '#050B18' },
  ctl: { alignItems: 'center', gap: 4, minWidth: 54 },
  ctlIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  leave: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#E5383B', alignItems: 'center', justifyContent: 'center' },
  pollBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10, marginBottom: 4, paddingHorizontal: 12, minHeight: 44, borderRadius: radius.md, borderWidth: 1.2 },
  poll: { borderWidth: 1.4, borderRadius: radius.lg, padding: 12, gap: 8, marginTop: 4 },
  pollOpt: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1.2, overflow: 'hidden' },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60 },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 120, maxWidth: 420, marginHorizontal: 16, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, backgroundColor: 'rgba(30,41,59,0.96)' },
  recInfo: { alignItems: 'center', gap: 8, padding: 28, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)' },
  chapter: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
});
