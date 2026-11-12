/** Pre-join check for the host: camera/mic preview, devices, connection test, class settings, then go live. */
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, liveAdmin } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, IconButton, Pill } from '@/ui/kit';
import { RoomVideo } from '@/ui/RoomVideo';
import { getUserMediaChecked } from '@/live/devices';
import { Banner } from '@/ui/misc';

export default function PreJoin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const info = liveAdmin.get(userId, id);
  const [cam, setCam] = useState(true);
  const [mic, setMic] = useState(true);
  const [net, setNet] = useState<'checking' | 'good' | 'offline'>('checking');
  const [mbps, setMbps] = useState<number | null>(null);
  const [level, setLevel] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const [devErr, setDevErr] = useState<string | null>(null);
  const [labels, setLabels] = useState<{ cam?: string; mic?: string }>({});
  const web = Platform.OS === 'web';

  // real connection check (no invented speed): browser online state and, where the browser reports it, the measured downlink
  useEffect(() => {
    if (!web || typeof navigator === 'undefined') return setNet('good');
    const check = () => {
      const conn = (navigator as unknown as { connection?: { downlink?: number } }).connection;
      setMbps(conn?.downlink ?? null);
      setNet(navigator.onLine ? 'good' : 'offline');
    };
    check();
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    return () => { window.removeEventListener('online', check); window.removeEventListener('offline', check); };
  }, [web]);

  // real camera + microphone preview with a real level meter; released as soon as the host leaves this screen
  useEffect(() => {
    if (!web || !navigator.mediaDevices?.getUserMedia || (!cam && !mic)) { setPreview(null); setLevel(0); return; }
    let dead = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    getUserMediaChecked({ video: cam, audio: mic }, [...(cam ? (['camera'] as const) : []), ...(mic ? (['microphone'] as const) : [])])
      .then((st) => {
        if (dead) return st.getTracks().forEach((t) => t.stop());
        stream = st;
        setDevErr(null);
        setPreview(cam ? st : null);
        setLabels({ cam: st.getVideoTracks()[0]?.label, mic: st.getAudioTracks()[0]?.label });
        if (mic && st.getAudioTracks().length) {
          ctx = new AudioContext();
          const an = ctx.createAnalyser();
          an.fftSize = 256;
          ctx.createMediaStreamSource(st).connect(an);
          const buf = new Uint8Array(an.frequencyBinCount);
          const tick = () => {
            an.getByteTimeDomainData(buf);
            let peak = 0;
            for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
            setLevel(Math.min(1, peak / 64));
            raf = requestAnimationFrame(tick);
          };
          tick();
        }
      })
      .catch((e: Error) => {
        if (dead) return;
        setPreview(null);
        setDevErr(e.message);
      });
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    };
  }, [cam, mic, web]);

  if (!info || !session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, justifyContent: 'center', gap: 16 }}>
        <Banner text="You can’t host this class." />
        <Button title="Back to Live" onPress={() => router.replace('/educator/live')} />
      </SafeAreaView>
    );
  }
  const s = info.session;
  const minsToStart = Math.round((new Date(s.startsAt).getTime() - Date.now()) / 6e4);
  const early = minsToStart > 15;
  const go = () => {
    try {
      liveAdmin.start(userId, id);
      router.replace({ pathname: '/edu/host/[id]', params: { id, cam: cam ? '1' : '0', mic: mic ? '1' : '0' } });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not start the class.');
    }
  };
  const checks = [
    { ok: !cam || !!preview || !web, t: cam ? (preview ? 'Camera is working' : web ? 'Waiting for camera permission…' : 'Camera is on') : 'Camera is off — students will see your initials' },
    { ok: !mic || level > 0.05 || !web, t: mic ? (level > 0.05 ? 'Microphone is picking up your voice' : web ? 'Say something to test your microphone' : 'Microphone is on') : 'Microphone is muted' },
    { ok: net === 'good', t: net === 'good' ? `You are online${mbps ? ` (about ${mbps} Mbps)` : ''}` : net === 'offline' ? 'You are offline — reconnect to go live' : 'Checking your connection…' },
    { ok: true, t: s.settings.record ? 'Recording starts automatically' : 'This class will not be recorded' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/educator/live'))} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="heading" numberOfLines={1}>Ready to go live?</Txt>
            <Txt variant="caption" color={c.muted} numberOfLines={1}>{s.title}</Txt>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            <LinearGradient colors={cam ? ['#1E3A5F', '#0E1B33'] : ['#2A2F3A', '#16191F']} style={styles.preview}>
              {cam && preview ? (
                <RoomVideo stream={preview} fit="cover" />
              ) : cam ? (
                <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 20 }}>
                  <Ionicons name="videocam-outline" size={44} color="rgba(255,255,255,0.7)" />
                  <Txt variant="caption" color="rgba(255,255,255,0.8)" center>{web ? devErr ?? 'Starting your camera…' : 'Camera preview is shown in the web version. Your camera starts when you go live.'}</Txt>
                </View>
              ) : (
                <Avatar name={session.user.name} size={88} />
              )}
              <View style={styles.previewBar}>
                <Pill text={session.user.name.split(' ')[0]} tone="neutral" />
                <View style={styles.meter} accessibilityLabel="Microphone level">
                  {[0, 1, 2, 3, 4].map((i) => <View key={i} style={{ width: 4, borderRadius: 2, height: 6 + i * 3, backgroundColor: mic && level > i * 0.2 ? '#4ADE80' : 'rgba(255,255,255,0.3)' }} />)}
                </View>
              </View>
            </LinearGradient>

            <View style={styles.toggles}>
              <Toggle icon={mic ? 'mic' : 'mic-off'} label={mic ? 'Mic on' : 'Mic off'} on={mic} onPress={() => setMic(!mic)} />
              <Toggle icon={cam ? 'videocam' : 'videocam-off'} label={cam ? 'Camera on' : 'Camera off'} on={cam} onPress={() => setCam(!cam)} />
            </View>

            {web && (labels.cam || labels.mic) && (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Txt variant="label" color={c.muted}>DEVICES IN USE</Txt>
                {!!labels.cam && <Txt>Camera: {labels.cam}</Txt>}
                {!!labels.mic && <Txt>Microphone: {labels.mic}</Txt>}
                <Txt variant="caption" color={c.muted}>To use another device, change the default in your browser or system settings.</Txt>
              </View>
            )}

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Txt variant="label" color={c.muted}>CHECKLIST</Txt>
              {checks.map((k) => (
                <View key={k.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name={k.ok ? 'checkmark-circle' : net === 'checking' && k.t.startsWith('Checking') ? 'sync-circle' : 'alert-circle'} size={20} color={k.ok ? c.success : c.warning} />
                  <Txt style={{ flex: 1 }}>{k.t}</Txt>
                </View>
              ))}
              <View style={[styles.note, { backgroundColor: c.surfaceMuted }]}>
                <Txt variant="caption" color={c.inkSoft}>
                  {info.audience.length} students will be notified the moment you go live. {s.settings.chat ? 'Chat' : 'No chat'} · {s.settings.qa ? 'Q&A on' : 'Q&A off'} · {s.settings.trackAttendance ? 'Auto attendance' : 'Manual attendance'}
                </Txt>
              </View>
            </View>
            {early && <Banner tone="info" text={`This class starts in ${minsToStart >= 120 ? `${Math.round(minsToStart / 60)} hours` : `${minsToStart} minutes`}. You can still open the room early to test.`} />}
            {err && <Banner text={err} />}
          </View>
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
          <Button title={early ? 'Open room early' : 'Go live now'} iconLeft="radio" disabled={net === 'offline'} onPress={go} style={{ width: '100%', maxWidth: layout.contentMaxWidth, backgroundColor: '#E8A21B' }} />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Toggle({ icon, label, on, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.toggle, { backgroundColor: on ? c.surface : c.dangerBg, borderColor: on ? c.border : c.danger }]} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={on ? c.ink : c.danger} />
      <Txt variant="label" color={on ? c.ink : c.danger}>{label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 24 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  preview: { borderRadius: 22, aspectRatio: 4 / 3, maxHeight: 360, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  face: { width: 130, height: 130, borderRadius: 65, alignItems: 'center', justifyContent: 'center' },
  previewBar: { position: 'absolute', left: 12, right: 12, bottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meter: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, backgroundColor: 'rgba(0,0,0,0.35)', padding: 6, borderRadius: 8 },
  toggles: { flexDirection: 'row', gap: 10 },
  toggle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 16, minHeight: 54 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { borderRadius: 12, padding: 10 },
  footer: { borderTopWidth: 1, padding: 12, alignItems: 'center' },
});
