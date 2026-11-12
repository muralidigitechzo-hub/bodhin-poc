/**
 * Host live room. Stage: slides · screen share · whiteboard (draw with finger/mouse).
 * Panel: Chat · Q&A · Polls · People (raised hands). Phone: stage on top, panel below, controls in thumb zone.
 * ≥900px: stage left, panel right. Chat, polls, board, files and camera/mic/screen are real (same-device WebRTC today; media server across devices).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Switch, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as DocumentPicker from 'expo-document-picker';
import { ApiError, liveAdmin } from '@/api/client';
import type { LiveSummary } from '@/core/batch';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, BottomSheet, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { prepareNative, type PersonInfo } from '@/live/livekit';
import { RoomVideo } from '@/ui/RoomVideo';
import { createRoom, type Provider, type RoomLike } from '@/live/room';
import { BOARD_H, BOARD_W, strokePath, strokePieces, type RoomMsg } from '@/live/protocol';

type Stage = 'slides' | 'screen' | 'board';
type PanelTab = 'chat' | 'qa' | 'polls' | 'people';
type Msg = { id: string; by: string; text: string; me?: boolean; sys?: boolean };
type Q = { id: string; q: string; by: string; votes: number; answered: boolean; a?: string };
type Poll = { q: string; options: string[]; votes: number[]; open: boolean; quiz?: boolean; correct?: number };
type Stroke = { color: string; w: number; pts: [number, number][] };
type Hand = { id: string; name: string };

const COLORS = ['#0E1B33', '#E5383B', '#1D5FD0', '#15803D', '#E8A21B'];
const PEN_W = 7;
const ERASER_W = 40;
const fmt = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
let seq = 0;
const nid = () => `x${++seq}`;

export default function HostRoom() {
  const { id, cam: camP, mic: micP } = useLocalSearchParams<{ id: string; cam?: string; mic?: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const info = useMemo(() => liveAdmin.get(userId, id), [userId, id]);
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const [elapsed, setElapsed] = useState(0);
  const [stage, setStage] = useState<Stage>('slides');
  const [slide, setSlide] = useState(0);
  const [mic, setMic] = useState(false);
  const [cam, setCam] = useState(false);
  const [localCam, setLocalCam] = useState<MediaStream | null>(null);
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  const [speakerView, setSpeakerView] = useState<{ name: string; stream: MediaStream | null } | null>(null);
  const [rec, setRec] = useState(!!info?.session.settings.record);
  const [tab, setTab] = useState<PanelTab>('chat');
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 'w', by: 'Bodhin', text: 'Class is live. Students have been notified.', sys: true }]);
  const [draft, setDraft] = useState('');
  const [qs, setQs] = useState<Q[]>([]);
  const [answering, setAnswering] = useState<Q | null>(null);
  const [answer, setAnswer] = useState('');
  const [poll, setPoll] = useState<Poll | null>(null);
  const [pastPolls, setPastPolls] = useState<Poll[]>([]);
  const [pollForm, setPollForm] = useState(false);
  const [pq, setPq] = useState('');
  const [popts, setPopts] = useState(['', '']);
  const [pquiz, setPquiz] = useState(false);
  const [pcorrect, setPcorrect] = useState(0);
  const [roster, setRoster] = useState<PersonInfo[]>([]);
  const [peak, setPeak] = useState(0);
  const [hands, setHands] = useState<Hand[]>([]);
  const [speaking, setSpeaking] = useState<Hand | null>(null);
  const [mutedAll, setMutedAll] = useState(false);
  const [chapters, setChapters] = useState<LiveSummary['chapters']>([{ atSec: 0, label: 'Class introduction' }]);
  const [materials, setMaterials] = useState<LiveSummary['materials']>([]);
  const [unread, setUnread] = useState(0);
  const [ending, setEnding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [pen, setPen] = useState(COLORS[0]);
  const live = useRef<Stroke | null>(null);
  const [, force] = useState(0);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const audience = info?.audience ?? [];
  const joined = roster.length;
  const slides = useMemo(() => {
    if (!info) return [];
    const lessons = info.course.modules.flatMap((m) => m.lessons.filter((l) => l.type === 'video').map((l) => l.title)).slice(0, 5);
    return [{ t: info.session.title, s: info.course.title }, { t: 'Today’s agenda', s: lessons.slice(0, 3).join(' · ') }, ...lessons.map((l) => ({ t: l, s: info.session.topic })), { t: 'Questions?', s: 'Use Q&A — upvote what you want answered' }];
  }, [info]);

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), Math.min(10_000, Math.max(2000, t.length * 70)));
  };
  const chapter = (label: string) => setChapters((x) => (x[x.length - 1]?.label === label ? x : [...x, { atSec: elapsed, label }]));

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // The real room. Everything below reacts to what learners actually send — nothing is simulated.
  const room = useRef<RoomLike | null>(null);
  const [provider, setProvider] = useState<Provider>('loopback');
  const [roomErr, setRoomErr] = useState('');
  const [screenOn, setScreenOn] = useState(false);
  const micRef = useRef(false);
  const flashRef = useRef((_t: string) => {});
  flashRef.current = flash;
  const voters = useRef(new Map<string, number>()); // learner id → option (one vote each)
  const pollId = useRef('');
  const shared = useRef<{ id: string; name: string; size: number; url: string }[]>([]);
  // latest state for the "hello" replay (a learner who joins late gets the current stage, poll, board and files)
  const snap = useRef({ stage: 'slides' as Stage, slide: 0, slides: [] as { t: string; s: string }[], poll: null as Poll | null, strokes: [] as Stroke[], rec: false });

  const tx = (m: RoomMsg) => {
    Promise.resolve(room.current?.send(m)).catch(() => {});
  };
  const txRef = useRef(tx);
  txRef.current = tx;
  /** Send one whole stroke, in connected pieces of at most 400 points. */
  const sendStroke = (st: Stroke) => {
    for (let i = 0; i < Math.max(1, st.pts.length); i += 399) txRef.current({ t: 'stroke', color: st.color, w: st.w, pts: st.pts.slice(Math.max(0, i - 1), i + 399) });
  };

  useEffect(() => {
    // wait for the signed-in user: on a page refresh the session loads after the first render
    if (!info || !userId) return;
    let dead = false;
    liveAdmin
      .joinHost(userId, id)
      .then(async (r) => {
        if (dead) return;
        setProvider(r.provider);
        if (r.provider === 'livekit') await prepareNative();
        const rc = createRoom(
          r.provider,
          {
            onState: () => {},
            onVideo: (v) => setSpeakerView(v.speaker ?? null),
            onLocal: (v) => {
              setLocalCam(v.camera);
              setLocalScreen(v.screen);
              setScreenOn(!!v.screen);
            },
            onPeople: (p) => {
              const others = p.filter((x) => x.id !== userId);
              setRoster(others);
              setPeak((k) => Math.max(k, others.length));
            },
            onMsg: (m, from) => {
              const sn = snap.current;
              if (m.t === 'chat') {
                setMsgs((x) => [...x.slice(-80), { id: m.id, by: from.name, text: m.text }]);
                if (tabRef.current !== 'chat') setUnread((u) => u + 1);
              } else if (m.t === 'qa') setQs((q) => (q.some((y) => y.id === m.id) ? q : [...q, { id: m.id, q: m.text, by: from.name, votes: 0, answered: false }]));
              else if (m.t === 'hand') setHands((h) => (m.up ? (h.some((y) => y.id === from.id) ? h : [...h, { id: from.id, name: from.name }]) : h.filter((y) => y.id !== from.id)));
              else if (m.t === 'vote') {
                // one vote per learner, counted by the sender's identity (the name inside the message can be faked)
                if (!sn.poll?.open || m.pollId !== pollId.current || voters.current.has(from.id) || m.option >= sn.poll.votes.length) return;
                voters.current.set(from.id, m.option);
                const votes = sn.poll.votes.map((v, i) => (i === m.option ? v + 1 : v));
                sn.poll = { ...sn.poll, votes };
                setPoll(sn.poll);
                txRef.current({ t: 'poll_result', id: pollId.current, votes });
              } else if (m.t === 'hello') {
                // replay the current classroom for the learner who just arrived
                txRef.current({ t: 'stage', mode: sn.stage });
                const sl = sn.slides[sn.slide];
                if (sl) txRef.current({ t: 'slide', index: sn.slide, title: sl.t, sub: sl.s, total: sn.slides.length });
                if (sn.rec) txRef.current({ t: 'record', on: true });
                shared.current.forEach((f) => txRef.current({ t: 'file', ...f }));
                const p = sn.poll;
                if (p && p.open) {
                  txRef.current({ t: 'poll', id: pollId.current, q: p.q, options: p.options, ...(p.quiz ? { quiz: true } : {}) });
                  txRef.current({ t: 'poll_result', id: pollId.current, votes: p.votes });
                }
                sn.strokes.slice(-150).forEach(sendStroke);
              }
            },
          },
          { sessionId: id, userId, name: session?.user.name ?? 'Instructor', isHost: true },
        );
        await rc.connect(r.url, r.token);
        if (dead) {
          rc.disconnect();
          return;
        }
        room.current = rc;
        // start with the choices made on the pre-join screen; a denied permission is shown, not hidden
        if (micP !== '0') rc.setMic(true).then(() => { micRef.current = true; setMic(true); }).catch((e) => flashRef.current((e as Error).message));
        if (camP !== '0') rc.setCam(true).then(() => setCam(true)).catch((e) => flashRef.current((e as Error).message));
      })
      .catch((e) => !dead && setRoomErr((e as ApiError).message ?? 'Could not open the classroom.'));
    return () => {
      dead = true;
      room.current?.disconnect();
      room.current = null;
    };
  }, [id, userId, !!info]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the replay snapshot current (used when a learner joins late)
  snap.current.stage = stage;
  snap.current.slide = slide;
  snap.current.slides = slides;
  snap.current.poll = poll;
  snap.current.strokes = strokes;
  snap.current.rec = rec;

  // Whiteboard: points are stored and sent normalised 0..1 so every learner's screen draws the same picture.
  const boardBox = useRef({ w: 1, h: 1 });
  const penRef = useRef(pen);
  penRef.current = pen;
  const norm = (x: number, y: number): [number, number] => [Math.min(1, Math.max(0, x / boardBox.current.w)), Math.min(1, Math.max(0, y / boardBox.current.h))];
  // What is written reaches learners WHILE the tutor writes: new points are sent every ~60 ms as small connected pieces.
  const sentIdx = useRef(0);
  const lastSent = useRef(0);
  const flushStroke = (final: boolean) => {
    const st = live.current;
    if (!st) return;
    const { pieces, sent } = strokePieces(st.pts, sentIdx.current, final);
    pieces.forEach((pts) => txRef.current({ t: 'stroke', color: st.color, w: st.w, pts }));
    sentIdx.current = sent;
    lastSent.current = Date.now();
  };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          live.current = { color: penRef.current, w: penRef.current === 'eraser' ? ERASER_W : PEN_W, pts: [norm(e.nativeEvent.locationX, e.nativeEvent.locationY)] };
          sentIdx.current = 0;
          lastSent.current = Date.now();
          force((n) => n + 1);
        },
        onPanResponderMove: (e) => {
          const last = live.current?.pts[live.current.pts.length - 1];
          const q = norm(e.nativeEvent.locationX, e.nativeEvent.locationY);
          if (!last || Math.abs(last[0] - q[0]) + Math.abs(last[1] - q[1]) > 0.0015) live.current?.pts.push(q);
          if (Date.now() - lastSent.current > 60) flushStroke(false);
          force((n) => n + 1);
        },
        onPanResponderRelease: () => {
          const st = live.current;
          if (st) {
            flushStroke(true);
            live.current = null;
            setStrokes((x) => [...x.slice(-400), st]);
            setRedo([]);
          }
        },
      }),
    [],
  );

  if (!info || !session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, justifyContent: 'center', gap: 16 }}>
        <Banner text="You can’t host this class." />
        <Button title="Back to Live" onPress={() => router.replace('/educator/live')} />
      </SafeAreaView>
    );
  }
  const s = info.session;
  const toPath = (st: Stroke) => strokePath(st.pts);

  const sendChat = () => {
    if (!draft.trim()) return;
    const mid = nid();
    tx({ t: 'chat', id: `${userId}-${Date.now()}`, by: session.user.name, text: draft.trim().slice(0, 500), at: Date.now() });
    setMsgs((m) => [...m, { id: mid, by: session.user.name, text: draft.trim(), me: true }]);
    setDraft('');
  };
  const launchPoll = () => {
    const options = popts.map((o) => o.trim()).filter(Boolean).slice(0, 6);
    if (pq.trim().length < 4 || options.length < 2) return flash('Add a question and at least 2 options');
    if (pquiz && !popts[pcorrect]?.trim()) return flash('Mark which option is correct');
    // the correct option is the index inside the trimmed, non-empty list
    const correct = pquiz ? popts.slice(0, pcorrect + 1).filter((o) => o.trim()).length - 1 : undefined;
    pollId.current = `poll${Date.now()}`;
    voters.current = new Map();
    tx({ t: 'poll', id: pollId.current, q: pq.trim().slice(0, 200), options, ...(pquiz ? { quiz: true } : {}) });
    tx({ t: 'poll_result', id: pollId.current, votes: options.map(() => 0) });
    setPoll({ q: pq.trim(), options, votes: options.map(() => 0), open: true, quiz: pquiz, correct });
    setPollForm(false);
    setPq('');
    setPopts(['', '']);
    setPquiz(false);
    setPcorrect(0);
    chapter(`${pquiz ? 'Quiz' : 'Poll'}: ${pq.trim()}`);
  };
  const stopPoll = () => {
    if (!poll) return;
    tx({ t: 'poll_close', id: pollId.current, votes: poll.votes, ...(poll.quiz && poll.correct != null ? { correct: poll.correct } : {}) });
    setPastPolls((x) => [...x, { ...poll, open: false }]);
    setPoll(null);
    flash('Closed · results shared with class');
  };
  const shareFile = async () => {
    try {
      const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (pick.canceled || !pick.assets?.[0]) return;
      const f = pick.assets[0];
      if (shared.current.some((x) => x.name === f.name)) return flash('Already shared');
      const up = await liveAdmin.uploadMaterial(userId, id, { name: f.name, sizeBytes: f.size ?? 0, uri: f.uri });
      shared.current.push(up);
      tx({ t: 'file', ...up });
      setMaterials((x) => [...x, { name: up.name, size: up.size >= 1048576 ? `${(up.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(up.size / 1024))} KB`, kind: 'pdf', url: up.url }]);
      setMsgs((x) => [...x, { id: nid(), by: 'Bodhin', text: `📎 ${up.name} shared with the class`, sys: true }]);
      flash('File shared with the class');
    } catch (e) {
      flash((e as Error).message || 'Could not share that file');
    }
  };
  const changeStage = (k: Stage) => {
    setStage(k);
    tx({ t: 'stage', mode: k });
    if (k === 'slides') tx({ t: 'slide', index: slide, title: slides[slide]?.t, sub: slides[slide]?.s, total: slides.length });
    chapter(k === 'board' ? 'Whiteboard explanation' : k === 'screen' ? 'Live demo (screen share)' : slides[slide].t);
    if (k === 'screen') {
      room.current?.setScreen(true).then(() => setScreenOn(true)).catch((e) => flash((e as Error).message));
    } else if (screenOn) {
      room.current?.setScreen(false).catch(() => {});
      setScreenOn(false);
    }
  };
  const goSlide = (n: number) => {
    setSlide(n);
    tx({ t: 'slide', index: n, title: slides[n]?.t, sub: slides[n]?.s, total: slides.length });
    chapter(slides[n].t);
  };
  const toggleRecord = () => {
    setRec(!rec);
    tx({ t: 'record', on: !rec });
    flash(rec ? 'Recording paused' : 'Recording resumed');
  };
  /** Undo: learners only receive additions, so clear their board and replay what is left. */
  const resendBoard = (left: Stroke[]) => {
    tx({ t: 'board_clear' });
    left.slice(-150).forEach(sendStroke);
  };
  const allow = (h: Hand, on: boolean) => {
    try {
      liveAdmin.allowSpeaker(userId, id, h.id, on);
    } catch {
      return flash('Could not change speaking permission');
    }
    tx({ t: 'allow_speak', who: h.id, on });
    setHands((x) => x.filter((y) => y.id !== h.id));
    setSpeaking(on ? h : null);
    if (on) setMutedAll(false);
  };
  const end = () => {
    const allPolls = [...pastPolls, ...(poll ? [poll] : [])].map((p) => ({ q: p.q, options: p.options, votes: p.votes }));
    tx({ t: 'end' });
    room.current?.disconnect();
    liveAdmin.end(userId, id, {
      elapsedSec: elapsed,
      peak: Math.max(peak, joined),
      chapters,
      materials,
      qa: qs.map((q) => ({ q: q.q, by: q.by, a: q.a, votes: q.votes })),
      polls: allPolls,
      chatCount: msgs.filter((m) => !m.sys).length,
    });
    router.replace({ pathname: '/edu/summary/[id]', params: { id, fresh: '1' } });
  };

  const stageView = (
    <View style={[styles.stage, { backgroundColor: stage === 'board' ? '#fff' : '#0B1426' }]}>
      {stage === 'slides' && (
        <View style={styles.slide}>
          <Txt variant="caption" color="rgba(255,255,255,0.6)">{info.course.title.toUpperCase()}</Txt>
          <Txt variant="title" color="#fff" center numberOfLines={3}>{slides[slide]?.t}</Txt>
          <Txt variant="body" color="rgba(255,255,255,0.75)" center numberOfLines={2}>{slides[slide]?.s}</Txt>
          <Txt variant="caption" color="rgba(255,255,255,0.5)" style={{ position: 'absolute', bottom: 8, right: 12 }}>{slide + 1} / {slides.length}</Txt>
        </View>
      )}
      {stage === 'screen' && (
        <View style={styles.slide}>
          {screenOn && localScreen ? (
            <>
              <RoomVideo stream={localScreen} fit="contain" />
              <View style={{ position: 'absolute', left: 8, bottom: 8 }}><Pill text="You are sharing your screen" tone="info" icon="desktop-outline" /></View>
            </>
          ) : (
            <>
              <Ionicons name="desktop-outline" size={34} color="rgba(255,255,255,0.7)" />
              <Txt variant="label" color="rgba(255,255,255,0.8)" center>Choose a window or screen to share. Learners see it live.</Txt>
              <Button title="Share screen" size="md" onPress={() => changeStage('screen')} />
            </>
          )}
        </View>
      )}
      {stage === 'board' && (
        <View style={StyleSheet.absoluteFill} {...pan.panHandlers} onLayout={(e) => { boardBox.current = { w: Math.max(1, e.nativeEvent.layout.width), h: Math.max(1, e.nativeEvent.layout.height) }; }} accessibilityLabel="Whiteboard. Draw with your finger or mouse.">
          <Svg width="100%" height="100%" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} preserveAspectRatio="none">
            {[...strokes, ...(live.current ? [live.current] : [])].map((st, i) => (
              <Path key={i} d={toPath(st)} stroke={st.color === 'eraser' ? '#fff' : st.color} strokeWidth={st.w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </Svg>
          {!strokes.length && !live.current && <Txt variant="caption" color={c.muted} style={{ position: 'absolute', top: 10, left: 12 }} pointerEvents="none">Draw here…</Txt>}
        </View>
      )}
      <View style={styles.selfTile} pointerEvents="none">
        {cam && localCam ? <RoomVideo stream={localCam} fit="cover" /> : <Avatar name={session.user.name} size={36} />}
        {!mic && <Ionicons name="mic-off" size={12} color="#fff" style={styles.selfMic} />}
      </View>
      {speakerView && (
        <View style={styles.speakerTile} pointerEvents="none">
          {speakerView.stream ? <RoomVideo stream={speakerView.stream} fit="cover" /> : <Ionicons name="mic" size={22} color="#3FD17C" style={{ alignSelf: 'center', marginTop: 10 }} />}
          <View style={styles.speakerName}>
            <Ionicons name="mic" size={10} color="#3FD17C" />
            <Txt variant="caption" color="#fff" style={{ fontSize: 10 }} numberOfLines={1}>{speakerView.name}</Txt>
          </View>
        </View>
      )}
      {speaking && !speakerView && <View style={styles.speaking} pointerEvents="none"><Pill text={`${speaking.name.split(' ')[0]} may speak`} tone="success" icon="mic" /></View>}
    </View>
  );

  const stageTools = (
    <View style={styles.tools}>
      <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]}>
        {([['slides', 'easel-outline', 'Slides'], ['screen', 'desktop-outline', 'Screen'], ['board', 'brush-outline', 'Board']] as const).map(([k, ic, l]) => (
          <Pressable key={k} onPress={() => changeStage(k)} style={[styles.segBtn, stage === k && { backgroundColor: c.surface }]} accessibilityRole="tab" accessibilityState={{ selected: stage === k }}>
            <Ionicons name={ic} size={16} color={stage === k ? c.primary : c.inkSoft} />
            <Txt variant="label" color={stage === k ? c.primary : c.inkSoft}>{l}</Txt>
          </Pressable>
        ))}
      </View>
      {stage === 'slides' && (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Small icon="chevron-back" label="Previous slide" disabled={slide === 0} onPress={() => goSlide(Math.max(0, slide - 1))} />
          <Small icon="chevron-forward" label="Next slide" disabled={slide >= slides.length - 1} onPress={() => goSlide(Math.min(slides.length - 1, slide + 1))} />
        </View>
      )}
      {stage === 'board' && (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {COLORS.map((col) => (
            <Pressable key={col} onPress={() => setPen(col)} style={[styles.swatch, { backgroundColor: col, borderColor: pen === col ? c.accent : 'transparent' }]} accessibilityRole="radio" accessibilityState={{ checked: pen === col }} accessibilityLabel={`Pen colour ${col}`} />
          ))}
          <Small icon="remove-circle-outline" label="Eraser" active={pen === 'eraser'} onPress={() => setPen('eraser')} />
          <Small icon="arrow-undo" label="Undo" disabled={!strokes.length} onPress={() => { const rest = strokes.slice(0, -1); setRedo((r) => [...r, strokes[strokes.length - 1]]); setStrokes(rest); resendBoard(rest); }} />
          <Small icon="arrow-redo" label="Redo" disabled={!redo.length} onPress={() => { const next = [...strokes, redo[redo.length - 1]]; setStrokes(next); setRedo((r) => r.slice(0, -1)); sendStroke(next[next.length - 1]); }} />
          <Small icon="trash-outline" label="Clear board" disabled={!strokes.length} onPress={() => { setStrokes([]); setRedo([]); tx({ t: 'board_clear' }); }} />
        </View>
      )}
    </View>
  );

  const openQs = qs.filter((q) => !q.answered).sort((a, b) => b.votes - a.votes);
  const panel = (
    <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.border }, wide ? { width: 360 } : { flex: 1 }]}>
      <View style={[styles.ptabs, { borderBottomColor: c.border }]}>
        {([['chat', 'Chat', unread], ['qa', 'Q&A', openQs.length], ['polls', 'Polls', poll ? 1 : 0], ['people', 'People', hands.length]] as const).map(([k, l, n]) => (
          <Pressable key={k} onPress={() => { setTab(k); if (k === 'chat') setUnread(0); }} style={[styles.ptab, tab === k && { borderBottomColor: c.primary }]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Txt variant="label" color={tab === k ? c.primary : c.inkSoft}>{l}</Txt>
            {n > 0 && <View style={[styles.badge, { backgroundColor: k === 'people' ? c.warning : c.live }]}><Txt variant="caption" color="#fff" style={{ fontSize: 10, lineHeight: 12 }}>{n}</Txt></View>}
          </Pressable>
        ))}
      </View>

      {tab === 'chat' && (
        <>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 8 }} ref={(r) => { r?.scrollToEnd({ animated: false }); }}>
            {!s.settings.chat && <Txt variant="caption" color={c.muted} center>Chat is turned off for this class.</Txt>}
            {msgs.map((m) => (m.sys ? (
              <Txt key={m.id} variant="caption" color={c.muted} center>{m.text}</Txt>
            ) : (
              <View key={m.id} style={[styles.msg, { backgroundColor: m.me ? c.primarySoft : c.surfaceMuted, alignSelf: m.me ? 'flex-end' : 'flex-start' }]}>
                <Txt variant="caption" color={m.me ? c.primary : c.inkSoft} style={{ fontWeight: '700' }}>{m.me ? 'You' : m.by}</Txt>
                <Txt variant="label" style={{ fontWeight: '400' }}>{m.text}</Txt>
              </View>
            )))}
          </ScrollView>
          <View style={[styles.composer, { borderTopColor: c.border }]}>
            <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={sendChat} placeholder="Message the class…" placeholderTextColor={c.muted} style={[styles.input, { backgroundColor: c.surfaceMuted, color: c.ink }]} accessibilityLabel="Chat message" returnKeyType="send" />
            <Pressable onPress={sendChat} style={[styles.send, { backgroundColor: c.primary }]} accessibilityRole="button" accessibilityLabel="Send"><Ionicons name="send" size={18} color="#fff" /></Pressable>
          </View>
        </>
      )}

      {tab === 'qa' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 8 }}>
          {!qs.length && <Txt variant="caption" color={c.muted} center>Questions from students appear here, most upvoted first.</Txt>}
          {[...openQs, ...qs.filter((q) => q.answered)].map((q) => (
            <View key={q.id} style={[styles.qcard, { borderColor: c.border, opacity: q.answered ? 0.65 : 1 }]}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.votes, { backgroundColor: c.surfaceMuted }]}>
                  <Ionicons name="arrow-up" size={14} color={c.primary} />
                  <Txt variant="label">{q.votes}</Txt>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="bodyStrong">{q.q}</Txt>
                  <Txt variant="caption" color={c.muted}>{q.by}{q.answered ? ' · Answered' : ''}</Txt>
                  {q.a && <Txt variant="caption" color={c.inkSoft}>↳ {q.a}</Txt>}
                </View>
              </View>
              {!q.answered && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Answered live" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setQs((x) => x.map((y) => (y.id === q.id ? { ...y, answered: true } : y))); chapter(`Q&A: ${q.q}`); }} />
                  <Button title="Type answer" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setAnswering(q); setAnswer(''); }} />
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {tab === 'polls' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
          {poll ? (
            <View style={[styles.qcard, { borderColor: c.primary }]}>
              <Pill text={poll.quiz ? 'LIVE QUIZ' : 'LIVE POLL'} tone="live" />
              <Txt variant="bodyStrong">{poll.q}</Txt>
              <PollBars poll={poll} />
              <Button title={poll.quiz ? "Close quiz & reveal answer" : "End poll & show results"} size="md" onPress={stopPoll} />
            </View>
          ) : (
            <Button title="Create a poll" iconLeft="add" size="md" onPress={() => setPollForm(true)} />
          )}
          {pastPolls.map((p, i) => (
            <View key={i} style={[styles.qcard, { borderColor: c.border }]}>
              <Txt variant="caption" color={c.muted}>Closed</Txt>
              <Txt variant="bodyStrong">{p.q}</Txt>
              <PollBars poll={p} />
            </View>
          ))}
        </ScrollView>
      )}

      {tab === 'people' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt variant="label">{joined} in class · {audience.length} enrolled</Txt>
            <Button title="Mute speaker" size="md" variant="outline" iconLeft="mic-off-outline" disabled={!speaking} onPress={() => { if (speaking) allow(speaking, false); flash('Speaker muted'); }} />
          </View>
          {!joined && <Txt variant="caption" color={c.muted} center>Nobody has joined yet. Learners can join from 10 minutes before the start.</Txt>}
          {hands.map((h) => (
            <View key={h.id} style={[styles.person, { backgroundColor: c.warningBg }]}>
              <Txt style={{ fontSize: 18 }}>✋</Txt>
              <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{h.name}</Txt>
              <Button title="Allow to speak" size="md" onPress={() => allow(h, true)} />
              <Pressable onPress={() => setHands((x) => x.filter((y) => y.id !== h.id))} accessibilityRole="button" accessibilityLabel={`Lower ${h.name}'s hand`} style={styles.iconHit}><Ionicons name="close" size={18} color={c.inkSoft} /></Pressable>
            </View>
          ))}
          {speaking && (
            <View style={[styles.person, { backgroundColor: c.successBg }]}>
              <Ionicons name="mic" size={18} color={c.success} />
              <Txt variant="bodyStrong" style={{ flex: 1 }}>{speaking.name} may speak</Txt>
              <Button title="Mute" size="md" variant="outline" onPress={() => allow(speaking, false)} />
            </View>
          )}
          {roster.map((p) => (
            <View key={p.id} style={styles.person}>
              <Avatar name={p.name} size={32} />
              <Txt style={{ flex: 1 }} numberOfLines={1}>{p.name}</Txt>
              <Ionicons name={p.micOn ? 'mic' : 'mic-off-outline'} size={16} color={p.micOn ? c.success : c.muted} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const controls = (
    <View style={[styles.controls, { backgroundColor: '#0B1426' }]}>
      <Ctrl icon={mic ? 'mic' : 'mic-off'} label={mic ? 'Mute' : 'Unmute'} off={!mic} onPress={() => { room.current?.setMic(!mic).then(() => { micRef.current = !mic; setMic(!mic); }).catch((e) => flash((e as Error).message)); }} />
      <Ctrl icon={cam ? 'videocam' : 'videocam-off'} label={cam ? 'Camera' : 'Camera off'} off={!cam} onPress={() => { room.current?.setCam(!cam).then(() => setCam(!cam)).catch((e) => flash((e as Error).message)); }} />
      <Ctrl icon="bookmark-outline" label="Bookmark" onPress={() => { chapter(stage === 'slides' ? slides[slide].t : `Bookmark at ${fmt(elapsed)}`); flash('Chapter added to recording'); }} />
      <Ctrl icon="attach" label="Share file" onPress={shareFile} />
      <Ctrl icon={rec ? 'pause-circle' : 'radio-button-on'} label={rec ? 'Pause rec' : 'Record'} off={!rec} onPress={toggleRecord} />
      <Pressable onPress={() => setEnding(true)} style={[styles.endBtn, { backgroundColor: c.live }]} accessibilityRole="button" accessibilityLabel="End class">
        <Ionicons name="call" size={18} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        <Txt variant="label" color="#fff">End</Txt>
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pill text={`LIVE · ${fmt(elapsed)}`} tone="live" icon="radio" />
          {rec && <Pill text="REC" tone="live" icon="ellipse" />}
          <Txt variant="label" numberOfLines={1} style={{ flex: 1 }}>{s.title}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="people" size={16} color={c.inkSoft} />
            <Txt variant="label">{joined}</Txt>
          </View>
        </View>
        {!!roomErr && <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}><Banner text={roomErr} /></View>}
        {wide ? (
          <View style={{ flex: 1, flexDirection: 'row', gap: 12, padding: 12, paddingTop: 0 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>{stageView}</View>
              {stageTools}
              {controls}
            </View>
            {panel}
          </View>
        ) : (
          <View style={{ flex: 1, gap: 8, paddingHorizontal: 10 }}>
            {stageView}
            {stageTools}
            {panel}
            {controls}
          </View>
        )}
        {toast && <View style={[styles.toast, { backgroundColor: c.ink }]} pointerEvents="none"><Txt variant="label" color="#fff" center>{toast}</Txt></View>}
      </SafeAreaView>

      <BottomSheet open={ending} onClose={() => setEnding(false)} title="End class for everyone?" footer={<>
        <Button title="Keep teaching" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setEnding(false)} />
        <Button title="End class" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={end} />
      </>}>
        <View style={{ gap: 8 }}>
          <Txt color={c.inkSoft}>{fmt(elapsed)} live · {Math.max(peak, joined)} students at peak · {qs.length} questions · {pastPolls.length + (poll ? 1 : 0)} polls</Txt>
          {s.settings.trackAttendance && <Txt variant="caption" color={c.muted}>Attendance will be marked automatically from who joined. You can edit it later.</Txt>}
          {rec && <Txt variant="caption" color={c.muted}>The recording will be processed with {chapters.length} chapters{s.settings.saveToCourse ? ' and added to the course' : ''}.</Txt>}
        </View>
      </BottomSheet>

      <BottomSheet open={pollForm} onClose={() => setPollForm(false)} title={pquiz ? "New quiz" : "New poll"} footer={<Button title={pquiz ? "Launch quiz" : "Launch poll"} size="md" style={{ flex: 1 }} onPress={launchPoll} />}>
        <View style={{ gap: 8 }}>
          <TextInput value={pq} onChangeText={setPq} placeholder="Question" placeholderTextColor={c.muted} style={[styles.field, { borderColor: c.border, color: c.ink }]} accessibilityLabel="Poll question" />
          {popts.map((o, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><TextInput value={o} onChangeText={(v) => setPopts((x) => x.map((y, j) => (j === i ? v : y)))} placeholder={`Option ${i + 1}`} placeholderTextColor={c.muted} style={[styles.field, { borderColor: c.border, color: c.ink, flex: 1 }]} accessibilityLabel={`Option ${i + 1}`} />{pquiz && <Pressable onPress={() => setPcorrect(i)} accessibilityRole="radio" accessibilityState={{ checked: pcorrect === i }} accessibilityLabel={`Option ${i + 1} is correct`} style={styles.iconHit}><Ionicons name={pcorrect === i ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={pcorrect === i ? c.success : c.muted} /></Pressable>}</View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Txt variant="label" style={{ flex: 1 }}>Make this a quiz (one correct answer)</Txt><Switch value={pquiz} onValueChange={setPquiz} accessibilityLabel="Make this a quiz" /></View>
          {pquiz && <Txt variant="caption" color={c.muted}>Tap the check next to the correct option. Learners only see it after you close the quiz.</Txt>}
          {popts.length < 4 && <Button title="Add option" variant="outline" size="md" iconLeft="add" onPress={() => setPopts((x) => [...x, ''])} />}
        </View>
      </BottomSheet>

      <BottomSheet open={!!answering} onClose={() => setAnswering(null)} title="Answer in writing" footer={<Button title="Post answer" size="md" style={{ flex: 1 }} onPress={() => { if (!answering || !answer.trim()) return; tx({ t: 'qa_answer', id: answering.id, text: answer.trim().slice(0, 500) }); setQs((x) => x.map((y) => (y.id === answering.id ? { ...y, answered: true, a: answer.trim() } : y))); setAnswering(null); }} />}>
        <Txt variant="bodyStrong">{answering?.q}</Txt>
        <TextInput value={answer} onChangeText={setAnswer} multiline placeholder="Your answer (students see it under the question)" placeholderTextColor={c.muted} style={[styles.field, { borderColor: c.border, color: c.ink, minHeight: 90, textAlignVertical: 'top', marginTop: 8 }]} accessibilityLabel="Answer" />
      </BottomSheet>
    </View>
  );
}

function PollBars({ poll }: { poll: Poll }) {
  const { c } = useTheme();
  const total = poll.votes.reduce((a, b) => a + b, 0) || 1;
  return (
    <View style={{ gap: 6 }}>
      {poll.options.map((o, i) => {
        const pct = Math.round((poll.votes[i] / total) * 100);
        return (
          <View key={i} style={[styles.bar, { backgroundColor: c.surfaceMuted }]}>
            <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: c.primarySoft }]} />
            <Txt variant="label" style={{ flex: 1 }} numberOfLines={1}>{o}</Txt>
            <Txt variant="label">{pct}% · {poll.votes[i]}</Txt>
          </View>
        );
      })}
    </View>
  );
}

function Small({ icon, label, onPress, disabled, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.small, { backgroundColor: active ? c.primarySoft : c.surface, borderColor: active ? c.primary : c.border, opacity: disabled ? 0.4 : 1 }]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={18} color={c.ink} />
    </Pressable>
  );
}

function Ctrl({ icon, label, onPress, off }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; off?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.ctrl} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.ctrlIcon, { backgroundColor: off ? '#E5383B' : 'rgba(255,255,255,0.12)' }]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <Txt variant="caption" color="rgba(255,255,255,0.8)" numberOfLines={1} style={{ fontSize: 10 }}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  stage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, overflow: 'hidden', maxHeight: 620 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
  fakeWin: { width: '80%', borderRadius: 8, overflow: 'hidden' },
  selfTile: { position: 'absolute', right: 8, top: 8, width: 64, height: 48, borderRadius: 10, backgroundColor: '#1E3A5F', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  selfMic: { position: 'absolute', bottom: 2, left: 3, backgroundColor: '#E5383B', borderRadius: 6, padding: 1 },
  speaking: { position: 'absolute', left: 8, top: 8 },
  speakerTile: { position: 'absolute', left: 8, top: 8, width: 120, height: 80, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#3FD17C', backgroundColor: '#0B1426' },
  speakerName: { position: 'absolute', left: 4, right: 4, bottom: 3, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 6, paddingHorizontal: 4 },
  tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 38, borderRadius: 10 },
  small: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 3 },
  panel: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', minHeight: 180 },
  ptabs: { flexDirection: 'row', borderBottomWidth: 1 },
  ptab: { flex: 1, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  badge: { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  msg: { maxWidth: '85%', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  composer: { flexDirection: 'row', gap: 8, padding: 8, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, fontSize: 15 },
  send: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qcard: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  votes: { width: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: 12, paddingHorizontal: 8 },
  iconHit: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10, minHeight: 40, overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, paddingHorizontal: 8, paddingVertical: 6, gap: 2, marginBottom: 4 },
  ctrl: { flex: 1, alignItems: 'center', gap: 2, minHeight: 52, justifyContent: 'center' },
  ctrlIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  endBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 44, borderRadius: 22, marginLeft: 4 },
  field: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 48, fontSize: 15 },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 110, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
});
