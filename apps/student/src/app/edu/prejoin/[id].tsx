/** Pre-join check for the host: camera/mic preview, devices, connection test, class settings, then go live. */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { Avatar, Chip, IconButton, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';

const CAMS = ['Built-in camera', 'USB webcam'];
const MICS = ['Built-in microphone', 'Headset mic'];

export default function PreJoin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const info = liveAdmin.get(userId, id);
  const [cam, setCam] = useState(true);
  const [mic, setMic] = useState(true);
  const [camDev, setCamDev] = useState(CAMS[0]);
  const [micDev, setMicDev] = useState(MICS[0]);
  const [net, setNet] = useState<'checking' | 'good'>('checking');
  const [level, setLevel] = useState(0.2);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setNet('good'), 1400);
    const m = setInterval(() => setLevel(0.15 + Math.random() * 0.8), 180);
    return () => { clearTimeout(t); clearInterval(m); };
  }, []);

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
    { ok: cam, t: cam ? 'Camera is on' : 'Camera is off — students will see your initials' },
    { ok: mic, t: mic ? 'Microphone is working' : 'Microphone is muted' },
    { ok: net === 'good', t: net === 'good' ? 'Connection is good (42 Mbps)' : 'Testing your connection…' },
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
              {cam ? (
                <View style={{ alignItems: 'center', gap: 8 }}>
                  <View style={[styles.face, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
                    <Ionicons name="person" size={70} color="rgba(255,255,255,0.55)" />
                  </View>
                  <Txt variant="caption" color="rgba(255,255,255,0.7)">Camera preview (simulated in this POC)</Txt>
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

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Txt variant="label" color={c.muted}>DEVICES</Txt>
              <Txt variant="label">Camera</Txt>
              <View style={styles.chips}>{CAMS.map((d) => <Chip key={d} label={d} active={camDev === d} onPress={() => setCamDev(d)} />)}</View>
              <Txt variant="label">Microphone</Txt>
              <View style={styles.chips}>{MICS.map((d) => <Chip key={d} label={d} active={micDev === d} onPress={() => setMicDev(d)} />)}</View>
            </View>

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Txt variant="label" color={c.muted}>CHECKLIST</Txt>
              {checks.map((k) => (
                <View key={k.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name={k.ok ? 'checkmark-circle' : net === 'checking' && k.t.startsWith('Testing') ? 'sync-circle' : 'alert-circle'} size={20} color={k.ok ? c.success : c.warning} />
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
          <Button title={early ? 'Open room early' : 'Go live now'} iconLeft="radio" disabled={net !== 'good'} onPress={go} style={{ width: '100%', maxWidth: layout.contentMaxWidth, backgroundColor: '#E8A21B' }} />
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
