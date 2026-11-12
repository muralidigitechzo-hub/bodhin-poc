/** Live tab — combines the Live Classes and Live Class History & Attendance designs. */
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { live as liveApi, liveTab } from '@/api/client';
import { dateParts, dayLabel, sessionStatus, timeRange } from '@/core/time';
import { buildIcs } from '@/core/ics';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { AppHeader, BottomSheet, ErrorState, Pill, Skeleton, useAsync } from '@/ui/kit';

type Data = Awaited<ReturnType<typeof liveTab.schedule>>;
type Row = Data['past'][number];

export default function Live() {
  const { isDesktop, pad } = useLayout();
  const { c, tenant } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [seg, setSeg] = useState<'upcoming' | 'past'>('upcoming');
  const [calOpen, setCalOpen] = useState(false);
  const [calMsg, setCalMsg] = useState('');
  const { data, loading, error, reload } = useAsync(() => liveTab.schedule(userId, tenant?.id ?? null), [userId, tenant?.id]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const web = Platform.OS === 'web';
  /** Web: download an .ics file with every upcoming class and a 15-minute reminder. */
  const downloadCalendar = () => {
    if (!data) return;
    const rows = [...data.liveNow, ...data.upcoming];
    if (!rows.length) return setCalMsg('You have no upcoming classes to add yet.');
    const ics = buildIcs(rows.map((r) => ({ id: r.session.id, title: r.session.title, startsAt: r.session.startsAt, endsAt: r.session.endsAt, description: `${r.course.title} · ${r.tutor.name}` })));
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bodhin-live-classes.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setCalMsg(`Downloaded ${rows.length} class${rows.length === 1 ? '' : 'es'}. Open the file to add them to your calendar.`);
  };

  const join = (id: string) => router.push({ pathname: '/live-room/[id]', params: { id } });

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, isDesktop && { paddingHorizontal: pad, paddingTop: 24 }]} refreshControl={<RefreshControl refreshing={false} onRefresh={() => { reload(); }} />} showsVerticalScrollIndicator={false}>
          <View style={[styles.inner, isDesktop && { maxWidth: 960 }]}>
            <AppHeader />
            <View style={{ marginTop: 10, marginBottom: 14 }}>
              <TwoTone lead="Live" accent="Classes" variant="title" />
              <Txt color={c.inkSoft}>Join live, ask questions, catch up on recordings.</Txt>
            </View>

            <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
              {(['upcoming', 'past'] as const).map((s) => (
                <Pressable key={s} onPress={() => setSeg(s)} accessibilityRole="tab" accessibilityState={{ selected: seg === s }} style={[styles.segBtn, seg === s && { backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 }]}>
                  <Txt variant="label" color={seg === s ? c.primary : c.inkSoft}>{s === 'upcoming' ? 'Upcoming' : 'Past & Attendance'}</Txt>
                </Pressable>
              ))}
            </View>

            {error ? (
              <ErrorState text={error} onRetry={reload} />
            ) : !data ? (
              <View style={{ gap: 12, marginTop: 14 }}>
                <Skeleton h={150} r={22} />
                <Skeleton h={90} r={18} />
              </View>
            ) : seg === 'upcoming' ? (
              <View style={{ gap: 12, marginTop: 14 }}>
                {data.liveNow.map((r) => <LiveNowCard key={r.session.id} row={r} onJoin={() => join(r.session.id)} />)}
                {data.upcoming.length === 0 && data.liveNow.length === 0 && (
                  <Txt color={c.muted} center style={{ paddingVertical: 30 }}>No live classes scheduled. Your tutors' sessions will appear here.</Txt>
                )}
                {groupByDay(data.upcoming).map(([day, rows]) => (
                  <View key={day} style={{ gap: 10 }}>
                    <Txt variant="label" color={c.muted} style={{ marginTop: 6 }}>{day.toUpperCase()}</Txt>
                    {rows.map((r) => <UpcomingRow key={r.session.id} row={r} userId={userId} onJoin={() => join(r.session.id)} onChange={reload} />)}
                  </View>
                ))}
                <Pressable onPress={() => { setCalMsg(''); setCalOpen(true); }} style={[styles.cal, { backgroundColor: c.primarySoft }]} accessibilityRole="button">
                  <Ionicons name={!web && data.calendarSync ? 'checkmark-circle' : 'calendar-outline'} size={28} color={!web && data.calendarSync ? c.success : c.primary} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">{!web && data.calendarSync ? 'Calendar sync is on' : 'Add classes to your calendar'}</Txt>
                    <Txt variant="caption" color={c.inkSoft}>{web ? 'Download a calendar file with a reminder 15 minutes before each class.' : data.calendarSync ? 'New and changed classes update automatically.' : 'Never miss a session. Get automatic reminders.'}</Txt>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={c.muted} />
                </Pressable>
              </View>
            ) : (
              <Past data={data} />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet
        open={calOpen}
        onClose={() => setCalOpen(false)}
        title="Add to calendar"
        footer={
          web ? (
            <Button title="Download calendar file" iconLeft="download-outline" style={{ flex: 1 }} onPress={downloadCalendar} />
          ) : (
            <Button
              title={data?.calendarSync ? 'Turn off sync' : 'Sync with my calendar'}
              variant={data?.calendarSync ? 'outline' : 'primary'}
              style={{ flex: 1 }}
              onPress={() => { liveTab.setCalendarSync(userId, !data?.calendarSync); setCalOpen(false); reload(); }}
            />
          )
        }
      >
        {web ? (
          <>
            <Txt color={c.inkSoft}>Download a calendar file (.ics) with your upcoming live classes and a reminder 15 minutes before each one. Open it to add the classes to Google, Outlook or Apple Calendar.</Txt>
            <Txt variant="caption" color={c.muted}>The file is a snapshot — download it again after a class is rescheduled.</Txt>
          </>
        ) : (
          <>
            <Txt color={c.inkSoft}>Bodhin adds your enrolled live classes to your phone's calendar with a reminder 15 minutes before. Rescheduled or cancelled classes update on their own.</Txt>
            <Txt variant="caption" color={c.muted}>Your phone will ask for calendar permission the first time.</Txt>
          </>
        )}
        {!!calMsg && <Txt variant="label" color={c.success}>{calMsg}</Txt>}
      </BottomSheet>
    </View>
  );
}

function groupByDay(rows: Row[]) {
  const m = new Map<string, Row[]>();
  rows.forEach((r) => {
    const k = dayLabel(r.session.startsAt);
    m.set(k, [...(m.get(k) ?? []), r]);
  });
  return [...m.entries()];
}

function LiveNowCard({ row, onJoin }: { row: Row; onJoin: () => void }) {
  const mins = Math.round((Date.now() - new Date(row.session.startsAt).getTime()) / 6e4);
  return (
    <LinearGradient colors={['#071F44', '#12407F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.liveNow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pill text="LIVE NOW" tone="live" icon="radio" />
        <Txt variant="caption" color="rgba(255,255,255,0.75)">Started {mins} min ago</Txt>
      </View>
      <Txt variant="heading" color="#fff" style={{ fontSize: 20, lineHeight: 26 }}>{row.session.title}</Txt>
      <Txt variant="label" color="rgba(255,255,255,0.8)" style={{ fontWeight: '500' }}>{row.tutor.name} · {row.course.title}</Txt>
      <Button title="Join class" iconRight="enter-outline" onPress={onJoin} style={{ backgroundColor: '#E5383B', marginTop: 6 }} />
    </LinearGradient>
  );
}

function UpcomingRow({ row, userId, onJoin, onChange }: { row: Row; userId: string; onJoin: () => void; onChange: () => void }) {
  const { c } = useTheme();
  const d = dateParts(row.session.startsAt);
  const st = sessionStatus(row.session.startsAt, row.session.endsAt);
  const canJoin = st.state === 'soon';
  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: canJoin ? c.live : c.border }]}>
      <View style={[styles.date, { backgroundColor: c.primarySoft }]}>
        <Txt variant="caption" color={c.inkSoft}>{d.month}</Txt>
        <Txt variant="title" color={c.primaryDeep} style={{ lineHeight: 28 }}>{d.day}</Txt>
        <Txt variant="caption" color={c.inkSoft}>{d.weekday}</Txt>
      </View>
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={2}>{row.session.title}</Txt>
        <Txt variant="caption" color={c.muted} numberOfLines={1}>{row.course.title}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="time-outline" size={13} color={c.muted} />
          <Txt variant="caption" color={c.inkSoft}>{timeRange(row.session.startsAt, row.session.endsAt)}</Txt>
        </View>
        <Txt variant="caption" color={canJoin ? c.live : c.info} style={{ fontWeight: '700' }}>{st.label}</Txt>
      </View>
      {canJoin ? (
        <Button title="Join" size="md" onPress={onJoin} />
      ) : (
        <Pressable
          onPress={async () => { await liveApi.toggleReminder(userId, row.session.id); onChange(); }}
          accessibilityRole="switch"
          accessibilityState={{ checked: row.reminder }}
          accessibilityLabel="Remind me"
          style={[styles.remind, { borderColor: row.reminder ? c.success : c.primary, backgroundColor: row.reminder ? c.successBg : c.surface }]}
        >
          <Ionicons name={row.reminder ? 'notifications' : 'notifications-outline'} size={18} color={row.reminder ? c.success : c.primary} />
          <Txt variant="caption" color={row.reminder ? c.success : c.primary} style={{ fontWeight: '700' }}>{row.reminder ? 'On' : 'Remind'}</Txt>
        </Pressable>
      )}
    </View>
  );
}

function Past({ data }: { data: Data }) {
  const { c } = useTheme();
  const recent = data.past.slice(0, 14).reverse();
  const stats = [
    ['calendar-outline', String(data.stats.total), 'Classes', c.primary],
    ['checkmark-circle-outline', String(data.stats.attended), 'Attended', c.success],
    ['pie-chart-outline', `${data.stats.pct}%`, 'Attendance', c.accent],
    ['close-circle-outline', String(data.stats.missed), 'Missed', c.danger],
  ] as const;
  return (
    <View style={{ gap: 12, marginTop: 14 }}>
      <View style={[styles.stats, { backgroundColor: c.surface, borderColor: c.border }]}>
        {stats.map(([icon, v, l, col]) => (
          <View key={l} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Ionicons name={icon} size={22} color={col} />
            <Txt variant="heading">{v}</Txt>
            <Txt variant="caption" color={c.muted}>{l}</Txt>
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Txt variant="bodyStrong">Last {recent.length} classes</Txt>
        <View style={styles.strip}>
          {recent.map((r) => {
            const ok = r.attended;
            const d = dateParts(r.session.startsAt);
            return (
              <View key={r.session.id} style={{ alignItems: 'center', gap: 4 }} accessibilityLabel={`${d.day} ${d.month}: ${ok ? 'attended' : 'missed'}`}>
                <Txt variant="caption" color={c.muted} style={{ fontSize: 10 }}>{d.day}</Txt>
                <View style={[styles.dot, { backgroundColor: ok ? c.successBg : c.dangerBg }]}>
                  <Ionicons name={ok ? 'checkmark' : 'close'} size={14} color={ok ? c.success : c.danger} />
                </View>
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <Legend color={c.success} label="Attended" />
          <Legend color={c.danger} label="Missed" />
        </View>
      </View>

      <Txt variant="heading" style={{ marginTop: 6 }}>Recordings</Txt>
      {data.past.length === 0 && <Txt color={c.muted} center style={{ paddingVertical: 24 }}>No finished classes yet. Attendance and recordings appear here after your first live class.</Txt>}
      {data.past.map((r) => (
        <Pressable key={r.session.id} onPress={() => router.push({ pathname: '/live-room/[id]', params: { id: r.session.id, mode: 'recording' } })} style={[styles.rec, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="button" accessibilityLabel={`Watch recording: ${r.session.title}`}>
          <LinearGradient colors={[r.course.art.from, r.course.art.to]} style={styles.thumb}>
            <Ionicons name={r.recording.state === 'ready' ? 'play' : r.recording.state === 'processing' ? 'hourglass-outline' : 'videocam-off-outline'} size={18} color="#fff" />
            <Txt variant="caption" color="#fff" style={styles.dur}>{Math.round((new Date(r.session.endsAt).getTime() - new Date(r.session.startsAt).getTime()) / 6e4)} min</Txt>
          </LinearGradient>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt variant="label" numberOfLines={2}>{r.session.title}</Txt>
            <Txt variant="caption" color={c.muted}>{new Date(r.session.startsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {timeRange(r.session.startsAt, r.session.endsAt)}</Txt>
            <Txt variant="caption" color={r.recording.state === 'ready' ? c.success : c.muted}>{r.recording.state === 'ready' ? 'Recording ready' : r.recording.state === 'processing' ? 'Recording is being prepared' : r.recording.state === 'unavailable' ? 'Recording not available' : 'Not recorded'}</Txt>
          </View>
          {r.attended ? <Pill text={`Attended · ${r.attendance?.minutes ?? 0} min`} tone="success" icon="checkmark" /> : <Pill text="Missed" tone="warning" />}
        </Pressable>
      ))}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Txt variant="caption" color={c.inkSoft}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 30 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth },
  seg: { flexDirection: 'row', padding: 4, borderRadius: radius.pill },
  segBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  liveNow: { borderRadius: 22, padding: 18, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1.2 },
  date: { width: 60, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center' },
  remind: { alignItems: 'center', justifyContent: 'center', gap: 2, width: 64, minHeight: 56, borderRadius: radius.md, borderWidth: 1.2 },
  cal: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, marginTop: 4 },
  stats: { flexDirection: 'row', paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1 },
  card: { padding: 14, borderRadius: radius.lg, borderWidth: 1, gap: 12 },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dot: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rec: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1 },
  thumb: { width: 92, height: 60, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dur: { position: 'absolute', right: 6, bottom: 4, fontSize: 10 },
});
