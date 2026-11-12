/**
 * Educator dashboard. Order = what needs action first:
 * usage alert → live class → KPIs → needs attention → earnings (by who collected) → completion → activity.
 * A floating "Create" button sits in the thumb zone.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { courseAdmin, educator } from '@/api/client';
import { DEFAULT_RISK_RULES } from '@/core/retention';
import { inr } from '@/ui/section';
import { greeting, sessionStatus, timeRange, dayLabel } from '@/core/time';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { AppHeader, Avatar, BottomSheet, ErrorState, Pill, ProgressBar, SectionHeader, Skeleton, useAsync } from '@/ui/kit';

type Data = Awaited<ReturnType<typeof educator.dashboard>>;
const soon = (f: string, step: string) => router.push({ pathname: '/educator-soon', params: { f, step } });
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export default function EducatorHome() {
  const { isDesktop } = useLayout();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { data, loading, error, reload } = useAsync(() => educator.dashboard(userId), [userId]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const [create, setCreate] = useState(false);
  const { width } = useWindowDimensions();
  const twoCol = width >= 900;

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={false} onRefresh={() => { reload(); }} />} showsVerticalScrollIndicator={false}>
          <View style={[styles.inner, twoCol && { maxWidth: 1080 }]}>
            <AppHeader profileHref="/educator/more" action={{ title: 'Create', onPress: () => setCreate(true) }} />
            {error ? (
              <ErrorState text={error} onRetry={reload} />
            ) : !data || loading ? (
              <View style={{ gap: 12, marginTop: 12 }}>
                <Skeleton h={60} r={16} />
                <Skeleton h={150} r={22} />
                <Skeleton h={180} r={18} />
              </View>
            ) : (
              <Body data={data} twoCol={twoCol} />
            )}
          </View>
        </ScrollView>

        {/* thumb-zone create button (desktop: in the header) */}
        {!isDesktop && <Pressable onPress={() => setCreate(true)} style={[styles.fab, { backgroundColor: c.primary }]} accessibilityRole="button" accessibilityLabel="Create">
          <Ionicons name="add" size={26} color="#fff" />
          <Txt variant="bodyStrong" color="#fff">Create</Txt>
        </Pressable>}
      </SafeAreaView>

      <BottomSheet open={create} onClose={() => setCreate(false)} title="Create">
        <View style={{ gap: 8 }}>
          {(
            [
              ['layers', 'New course', 'Recorded, live or hybrid', () => router.push({ pathname: '/edu/course/[id]', params: { id: courseAdmin.create(userId) } }), data?.ctx.role === 'owner'],
              ['people', 'New batch', 'Group students with a schedule', () => router.push('/edu/batch-new'), data?.ctx.ent.has('batches') && data?.ctx.role === 'owner'],
              ['help-circle', 'Quiz or assignment', 'Test students or collect their work', () => router.push('/edu/assess/new'), true],
              ['radio', 'Schedule live class', 'Pick a batch, date and time', () => router.push('/edu/schedule'), true],
              ['megaphone', 'Announcement', 'Message a batch or all students', () => router.navigate('/educator/batches'), true],
              ['person-add', 'Invite students', 'By link, file or one by one', () => router.navigate({ pathname: '/educator/batches', params: { seg: 'students' } }), data?.ctx.role === 'owner'],
            ] as const
          )
            .filter((x) => x[4])
            .map(([icon, t, sub, fn]) => (
              <Pressable key={t} onPress={() => { setCreate(false); fn(); }} style={[styles.createRow, { borderColor: c.border }]} accessibilityRole="button">
                <View style={[styles.createIcon, { backgroundColor: c.primarySoft }]}>
                  <Ionicons name={icon} size={22} color={c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong">{t}</Txt>
                  <Txt variant="caption" color={c.muted}>{sub}</Txt>
                </View>
                <Ionicons name="chevron-forward" size={20} color={c.muted} />
              </Pressable>
            ))}
        </View>
      </BottomSheet>
    </View>
  );
}

function Body({ data, twoCol }: { data: Data; twoCol: boolean }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const { ctx, kpis, next, attention, earnings, retention, activity } = data;
  const owner = ctx.role === 'owner';
  const worst = ctx.usage.worst;

  const firstSteps = owner ? [
    { done: ctx.tenant.payments?.directGatewayStatus === 'active', icon: 'card', t: 'Connect your payment gateway', s: 'Students on your site pay you directly', go: () => router.push('/edu/payments-setup') },
    { done: kpis.liveCourses > 0 || educator.courses(session?.user.id ?? '').length > 0, icon: 'layers', t: 'Create your first course', s: 'Recorded, live or hybrid', go: () => router.push({ pathname: '/edu/course/[id]', params: { id: courseAdmin.create(session?.user.id ?? '') } }) },
    { done: ctx.tenant.branding.primary !== '#0B3B73', icon: 'color-palette', t: 'Add your brand', s: `Colours, logo · ${ctx.host}`, go: () => router.push('/edu/workspace') },
    { done: kpis.students > 0, icon: 'person-add', t: 'Invite your students', s: 'Share a link or upload a list', go: () => router.navigate({ pathname: '/educator/batches', params: { seg: 'students' } }) },
  ] as const : [];
  const stepsLeft = firstSteps.filter((x) => !x.done).length;

  const left = (
    <>
      {ctx.tenant.status === 'suspended' && (
        <View style={[styles.steps, { backgroundColor: c.dangerBg, borderColor: c.danger }]}>
          <Txt variant="bodyStrong" color={c.danger}>Workspace suspended by Bodhin</Txt>
          <Txt variant="caption" color={c.inkSoft}>New sales and enrolments are paused. Your students keep access. Check notifications or contact support@thebodhin.com.</Txt>
        </View>
      )}
      {stepsLeft > 0 && kpis.students === 0 && (
        <View style={[styles.steps, { backgroundColor: c.surface, borderColor: c.primary }]}>
          <Txt variant="heading">Get your academy live</Txt>
          <Txt variant="caption" color={c.muted}>{firstSteps.length - stepsLeft} of {firstSteps.length} done</Txt>
          {firstSteps.map((x) => (
            <Pressable key={x.t} onPress={x.go} disabled={x.done} style={styles.step} accessibilityRole="button" accessibilityLabel={x.t}>
              <Ionicons name={x.done ? 'checkmark-circle' : (`${x.icon}-outline` as keyof typeof Ionicons.glyphMap)} size={24} color={x.done ? c.success : c.primary} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong" style={x.done ? { textDecorationLine: 'line-through', color: c.muted } : undefined}>{x.t}</Txt>
                <Txt variant="caption" color={c.muted}>{x.s}</Txt>
              </View>
              {!x.done && <Ionicons name="chevron-forward" size={18} color={c.muted} />}
            </Pressable>
          ))}
        </View>
      )}
      {next && <LiveCard next={next} />}
      <View style={styles.kpis}>
        <Kpi icon="people" tint="#E9F0FD" color={c.info} value={kpis.students.toLocaleString('en-IN')} label={owner ? 'Active students' : 'My students'} delta={owner ? `+${kpis.studentsDelta}%` : undefined} onPress={() => router.navigate('/educator/batches')} />
        <Kpi icon="layers" tint="#FDF3E1" color={c.warning} value={String(kpis.liveCourses)} label="Live courses" onPress={() => router.navigate('/educator/courses')} />
        <Kpi icon="radio" tint="#E8F6EC" color={c.success} value={String(kpis.sessionsThisMonth)} label="Classes held" onPress={() => router.navigate('/educator/live')} />
        {earnings ? (
          <Kpi icon="wallet" tint="#F1ECFC" color="#7C3AED" value={inr(earnings.net)} label="Net this month" delta={`${earnings.deltaPct >= 0 ? '+' : ''}${earnings.deltaPct}%`} onPress={() => router.push('/edu/earnings')} />
        ) : (
          <Kpi icon="document-text" tint="#F1ECFC" color="#7C3AED" value={String(attention.find((a) => a.key === 'grade')?.count ?? 0)} label="To grade" onPress={() => router.push('/edu/grading')} />
        )}
      </View>

      {attention.length > 0 && (
        <>
          <SectionHeader title="Needs your attention" />
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: 0 }]}>
            {attention.map((a, i) => (
              <Pressable key={a.key} onPress={() => router.push(a.href as any)} style={[styles.attn, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]} accessibilityRole="button" accessibilityLabel={`${a.count} ${a.label}`}>
                <View style={[styles.attnIcon, { backgroundColor: c.warningBg }]}>
                  <Ionicons name={a.icon as keyof typeof Ionicons.glyphMap} size={20} color={c.warning} />
                </View>
                <Txt variant="bodyStrong" style={{ flex: 1 }}>{a.label}</Txt>
                <View style={[styles.count, { backgroundColor: c.primary }]}>
                  <Txt variant="caption" color="#fff" style={{ fontWeight: '800' }}>{a.count}</Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.muted} />
              </Pressable>
            ))}
          </View>
        </>
      )}
    </>
  );

  const right = (
    <>
      {earnings && <EarningsCard e={earnings} />}
      <SectionHeader title="Retention radar" action="View all" onAction={() => router.push('/edu/retention')} />
      <RetentionCard data={retention} />
      <SectionHeader title="Recent activity" />
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, padding: 0 }]}>
        {activity.map((a, i) => {
          const icon = { enroll: 'school', live: 'radio', submission: 'document-text', certificate: 'ribbon', review: 'star', payout: 'cash' }[a.kind] as keyof typeof Ionicons.glyphMap;
          return (
            <Pressable key={a.id} disabled={!a.link} onPress={() => a.link && router.push(a.link as any)} style={[styles.act, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]} accessibilityRole={a.link ? 'button' : undefined}>
              <View style={[styles.actIcon, { backgroundColor: c.primarySoft }]}>
                <Ionicons name={icon} size={16} color={c.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="label" style={{ fontWeight: '500' }}>{a.text}</Txt>
                <Txt variant="caption" color={c.muted}>{ago(a.at)}</Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  return (
    <>
      {/* workspace + greeting */}
      <Pressable onPress={() => owner && router.push('/edu/workspace')} style={[styles.ws, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="button" accessibilityLabel={`Workspace ${ctx.tenant.branding.displayName}`}>
        <View style={[styles.wsLogo, { backgroundColor: ctx.tenant.branding.primary }]}>
          <Txt variant="label" color="#fff">{ctx.tenant.branding.displayName.split(' ').map((w) => w[0]).slice(0, 2).join('')}</Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>{ctx.tenant.branding.displayName}</Txt>
          <Txt variant="caption" color={c.muted} numberOfLines={1}>{ctx.host}</Txt>
        </View>
        <Pill text={owner ? `${ctx.ent.plan.name} plan` : 'Tutor'} tone={owner ? 'gold' : 'info'} />
      </Pressable>
      <View style={{ marginTop: 14, marginBottom: 4 }}>
        <Txt variant="label" color={c.muted}>{greeting()}</Txt>
        <Txt variant="title" color={c.primaryDeep}>Welcome back, {data.firstName} 👋</Txt>
      </View>

      {ctx.trialDaysLeft != null && owner && (
        <Pressable onPress={() => router.push('/edu/subscription')} style={[styles.banner, { backgroundColor: c.infoBg, borderColor: c.info }]} accessibilityRole="button">
          <Ionicons name="gift-outline" size={22} color={c.info} />
          <Txt variant="label" style={{ flex: 1 }}>{ctx.trialDaysLeft} days left in your free {ctx.ent.plan.name} trial. Pick a plan to keep everything running.</Txt>
          <Ionicons name="chevron-forward" size={18} color={c.info} />
        </Pressable>
      )}

      {worst && owner && <UsageBanner row={worst} />}

      {twoCol ? (
        <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
          <View style={{ flex: 1.15, minWidth: 0 }}>{left}</View>
          <View style={{ flex: 1, minWidth: 0 }}>{right}</View>
        </View>
      ) : (
        <>
          {left}
          {right}
        </>
      )}
    </>
  );
}

function UsageBanner({ row }: { row: NonNullable<Data['ctx']['usage']['worst']> }) {
  const { c } = useTheme();
  const tone = row.level === 'warn' ? { bg: c.warningBg, fg: c.warning } : { bg: c.dangerBg, fg: c.danger };
  const fmt = (n: number) => `${n.toLocaleString('en-IN')}${row.unit ? ` ${row.unit}` : ''}`;
  const title =
    row.level === 'limit' ? `${row.label} limit reached` : row.level === 'critical' ? `${row.pct}% of ${row.label.toLowerCase()} used` : `${row.label}: ${row.pct}% used`;
  return (
    <View style={[styles.banner, { backgroundColor: tone.bg, borderColor: tone.fg, flexDirection: 'column', alignItems: 'stretch' }]} accessibilityRole="alert">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={row.level === 'warn' ? 'warning-outline' : 'alert-circle'} size={22} color={tone.fg} />
        <Txt variant="bodyStrong" style={{ flex: 1 }}>{title}</Txt>
        <Txt variant="label" color={tone.fg}>{fmt(row.used)} / {row.limit == null ? '∞' : fmt(row.limit)}</Txt>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <ProgressBar pct={row.pct} color={tone.fg} height={7} />
      </View>
      <Txt variant="caption" color={c.inkSoft}>{row.level === 'limit' ? row.atLimit : 'Upgrade your plan or add a top-up before you hit the limit. Nothing is charged automatically.'}</Txt>
      {row.level !== 'warn' && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="See plans" size="md" style={{ flex: 1 }} onPress={() => router.push('/edu/subscription')} />
          <Button title="Add top-up" size="md" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/edu/subscription')} />
        </View>
      )}
    </View>
  );
}

function LiveCard({ next }: { next: NonNullable<Data['next']> }) {
  const st = sessionStatus(next.session.startsAt, next.session.endsAt);
  const live = st.state === 'live';
  const mins = Math.round((Date.now() - new Date(next.session.startsAt).getTime()) / 6e4);
  return (
    <LinearGradient colors={['#071F44', '#12407F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.live}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pill text={live ? 'LIVE NOW' : st.label} tone={live ? 'live' : 'info'} icon="radio" />
        <Txt variant="caption" color="rgba(255,255,255,0.75)">{live ? `Started ${mins} min ago` : dayLabel(next.session.startsAt)}</Txt>
      </View>
      <Txt variant="heading" color="#fff" style={{ fontSize: 19, lineHeight: 25 }}>{next.session.title}</Txt>
      <Txt variant="label" color="rgba(255,255,255,0.8)" style={{ fontWeight: '500' }}>{next.course.title} · {timeRange(next.session.startsAt, next.session.endsAt)}</Txt>
      <Button title={live ? 'Rejoin as host' : 'Start class'} iconRight="arrow-forward" style={{ backgroundColor: '#E8A21B', marginTop: 6 }} onPress={() => router.push({ pathname: '/edu/prejoin/[id]', params: { id: next.session.id } })} />
    </LinearGradient>
  );
}

function Kpi({ icon, tint, color, value, label, delta, onPress }: { icon: keyof typeof Ionicons.glyphMap; tint: string; color: string; value: string; label: string; delta?: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.kpi, { backgroundColor: c.surface, borderColor: c.border }, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`${value} ${label}`}>
      <View style={[styles.kpiIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Txt variant="title" style={{ fontSize: 22, lineHeight: 28, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{value}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt variant="caption" color={c.muted} style={{ flexShrink: 1 }} numberOfLines={1}>{label}</Txt>
        {delta && <Txt variant="caption" color={delta.startsWith('-') ? c.danger : c.success} style={{ fontWeight: '700' }}>{delta}</Txt>}
      </View>
    </Pressable>
  );
}

function EarningsCard({ e }: { e: NonNullable<Data['earnings']> }) {
  const { c } = useTheme();
  const total = e.direct.gross + e.marketplace.net || 1;
  const directPct = Math.round((e.direct.gross / total) * 100);
  return (
    <>
      <SectionHeader title="Earnings this month" action="Statement" onAction={() => router.push('/edu/earnings')} />
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View>
            <Txt variant="display" style={{ fontSize: 30, lineHeight: 36, fontVariant: ['tabular-nums'] }}>{inr(e.net)}</Txt>
            <Txt variant="caption" color={e.deltaPct >= 0 ? c.success : c.danger} style={{ fontWeight: '700' }}>{e.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(e.deltaPct)}% vs last month</Txt>
          </View>
          <Spark values={e.history} color={c.primary} />
        </View>

        <View style={styles.split} accessibilityLabel={`${directPct}% direct sales, ${100 - directPct}% marketplace`}>
          <View style={{ flex: Math.max(directPct, 1), backgroundColor: c.success }} />
          <View style={{ flex: Math.max(100 - directPct, 1), backgroundColor: c.accent }} />
        </View>

        <View style={styles.channel}>
          <View style={[styles.dot, { backgroundColor: c.success }]} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong">Direct sales · {inr(e.direct.gross)}</Txt>
            <Txt variant="caption" color={c.muted}>{e.direct.count} sales on your site. Collected straight to your Razorpay. No commission.</Txt>
          </View>
        </View>
        <View style={styles.channel}>
          <View style={[styles.dot, { backgroundColor: c.accent }]} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong">Bodhin marketplace · {inr(e.marketplace.net)}</Txt>
            <Txt variant="caption" color={c.muted}>
              {e.marketplace.count} sales of {inr(e.marketplace.gross)} − commission {inr(e.marketplace.commission)} − gateway fee {inr(e.marketplace.fees)}. Bodhin pays you.
            </Txt>
          </View>
        </View>
        {e.nextPayout && (
          <View style={[styles.payout, { backgroundColor: c.accentSoft }]}>
            <Ionicons name="calendar-outline" size={18} color={c.warning} />
            <Txt variant="label" style={{ flex: 1 }}>
              Next payout {inr(e.nextPayout.amount)} on {new Date(e.nextPayout.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </Txt>
          </View>
        )}
      </View>
    </>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const w = 120, h = 44;
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - ((v - min) / (max - min || 1)) * (h - 8)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <Svg width={w} height={h} accessibilityLabel="Earnings trend, last 9 months">
      <Path d={`${d} L${w},${h} L0,${h} Z`} fill={color} opacity={0.08} />
      <Path d={d} stroke={color} strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={last[0]} cy={last[1]} r={4} fill={color} />
    </Svg>
  );
}

/** Home card: how many students are drifting away, and the three who need a message first. */
function RetentionCard({ data }: { data: Data['retention'] }) {
  const { c } = useTheme();
  const rules = DEFAULT_RISK_RULES;
  if (data.judged === 0) {
    return (
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, alignItems: 'center' }]}>
        <Ionicons name="people-outline" size={30} color={c.muted} />
        <Txt color={c.muted} center>Your students’ attendance and activity show up here once they join a batch or enrol.</Txt>
      </View>
    );
  }
  const ok = data.atRisk === 0;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: ok ? c.border : c.danger, padding: 0 }]}>
      <Pressable onPress={() => router.push('/edu/retention')} style={[styles.rrHead, { padding: 16 }]} accessibilityRole="button" accessibilityLabel={ok ? 'Everyone is on track. Open retention radar' : `${data.atRisk} students at risk. Open retention radar`}>
        <View style={[styles.rrBadge, { backgroundColor: ok ? c.successBg : c.dangerBg }]}>
          <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={26} color={ok ? c.success : c.danger} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt variant="heading">{ok ? 'Everyone is on track' : `${data.atRisk} at risk`}</Txt>
          <Txt variant="caption" color={c.muted}>
            {ok ? `${data.judged} active students · attendance and activity look healthy` : `of ${data.judged} active · ${data.lowAttendance} low attendance (under ${rules.minAttendancePct}%) · ${data.inactive} inactive ${rules.inactiveDays}+ days`}
          </Txt>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.muted} />
      </Pressable>
      {data.top.map((r) => (
        <Pressable key={r.person.id} onPress={() => router.push({ pathname: '/edu/student/[id]', params: { id: r.person.id } })} style={[styles.rrRow, { borderTopColor: c.border }]} accessibilityRole="button" accessibilityLabel={`${r.person.name}: ${r.risk.reasons.map((x) => x.text).join(', ')}`}>
          <Avatar name={r.person.name} size={36} color={r.risk.level === 'high' ? c.danger : c.warning} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="label" numberOfLines={1}>{r.person.name}</Txt>
            <Txt variant="caption" color={c.muted} numberOfLines={1}>{r.risk.reasons[0]?.text}</Txt>
          </View>
          <Pill text={r.risk.level === 'high' ? 'High' : 'Medium'} tone={r.risk.level === 'high' ? 'live' : 'warning'} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  steps: { borderWidth: 1.5, borderRadius: 20, padding: 14, gap: 6 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 110 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth },
  ws: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1, marginTop: 6 },
  wsLogo: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.lg, borderWidth: 1.2, marginTop: 12 },
  live: { borderRadius: 22, padding: 18, gap: 6, marginTop: 14 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  kpi: { flexBasis: '47%', flexGrow: 1, padding: 14, borderRadius: radius.lg, borderWidth: 1, gap: 6 },
  kpiIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16, borderRadius: radius.lg, borderWidth: 1, gap: 12, overflow: 'hidden' },
  rrHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  rrBadge: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rrRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 60, borderTopWidth: 1 },
  attn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 62 },
  attnIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  split: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  channel: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  payout: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.md },
  act: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 56 },
  actIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, height: 56, borderRadius: 28, shadowColor: '#0B2A55', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1, minHeight: 66 },
  createIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
