/** Profile hub: account, learning records, settings, support. */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, account } from '@/api/client';
import { educatorMembership, useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Avatar, BottomSheet, Chip, Pill, useAsync } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Group, Row } from '@/ui/ListRow';
import { PoweredBy } from '@/ui/Brand';

type Sheet = null | 'edit' | 'password' | 'contact' | 'language' | 'quality' | 'logout' | 'feedback';

export default function Profile() {
  const { isDesktop, pad } = useLayout();
  const { c, tenant, brand } = useTheme();
  const { session, setSession, signOut, setMode } = useAuth();
  const edu = educatorMembership(session);
  const user = session!.user;
  const sum = useAsync(() => account.summary(user.id), [user.id]);
  useFocusEffect(useCallback(() => { sum.reload(); }, [sum.reload])); // eslint-disable-line react-hooks/exhaustive-deps
  const [settings, setSettings] = useState(() => account.settings(user.id));
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);

  const update = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    account.saveSettings(user.id, next);
  };
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };

  const s = sum.data;
  const stats = [
    ['book-outline', s?.enrolled ?? '–', 'Enrolled', c.primary, '/learning'],
    ['checkmark-done-outline', s?.completed ?? '–', 'Completed', c.success, '/learning'],
    ['ribbon-outline', s?.certificates ?? '–', 'Certificates', c.accent, '/certificates'],
    ['trophy-outline', s?.achievements ?? '–', 'Badges', '#7C3AED', '/certificates?tab=badges'],
  ] as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, isDesktop && { paddingHorizontal: pad, paddingTop: 24 }]} showsVerticalScrollIndicator={false}>
          <View style={[styles.inner, isDesktop && { maxWidth: 960 }]}>
            <LinearGradient colors={[c.primaryDeep, c.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                <Avatar name={user.name} size={68} color={c.accent} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt variant="title" color="#fff" numberOfLines={1} style={{ fontSize: 22 }}>{user.name}</Txt>
                  <Txt variant="label" color="rgba(255,255,255,0.8)" numberOfLines={1} style={{ fontWeight: '500' }}>{user.email}</Txt>
                  <Txt variant="label" color="rgba(255,255,255,0.8)" style={{ fontWeight: '500' }}>{user.phone.replace(/^(\+91)(\d{5})(\d{5})$/, '$1 $2 $3')}</Txt>
                </View>
                <Pressable onPress={() => setSheet('edit')} style={styles.editBtn} accessibilityRole="button" accessibilityLabel="Edit profile">
                  <Ionicons name="pencil" size={18} color="#fff" />
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <Pill text="Student" tone="gold" icon="school" />
                <Txt variant="caption" color="rgba(255,255,255,0.75)">Member since {new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</Txt>
              </View>
              <View style={{ marginTop: 14, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Txt variant="label" color="#fff">Overall learning progress</Txt>
                  <Txt variant="label" color="#fff">{s?.pct ?? 0}%</Txt>
                </View>
                <View style={styles.track}><View style={[styles.fill, { width: `${s?.pct ?? 0}%`, backgroundColor: c.accent }]} /></View>
              </View>
            </LinearGradient>

            <View style={[styles.stats, { backgroundColor: c.surface, borderColor: c.border }]}>
              {stats.map(([icon, v, l, col, href]) => (
                <Pressable key={l} onPress={() => router.push(href as any)} style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 }} accessibilityRole="button" accessibilityLabel={`${v} ${l}`}>
                  <Ionicons name={icon} size={22} color={col} />
                  <Txt variant="heading">{String(v)}</Txt>
                  <Txt variant="caption" color={c.muted}>{l}</Txt>
                </Pressable>
              ))}
            </View>

            {tenant && (
              <View style={[styles.tenant, { backgroundColor: c.primarySoft }]}>
                <Ionicons name="business-outline" size={20} color={c.primary} />
                <Txt variant="label" style={{ flex: 1 }}>Learning with {brand.displayName}</Txt>
              </View>
            )}

            {edu && (
              <Pressable onPress={() => { setMode('educator'); router.replace('/educator/home'); }} style={[styles.switch, { backgroundColor: c.primaryDeep }]} accessibilityRole="button">
                <Ionicons name="swap-horizontal" size={22} color={c.accent} />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong" color="#fff">Switch to Educator</Txt>
                  <Txt variant="caption" color="rgba(255,255,255,0.75)">Manage your workspace with the same login</Txt>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </Pressable>
            )}

            <Group title="Learning" icon="school-outline">
              <Row icon="card-outline" title="Payments & enrollments" sub="Orders, invoices and access dates" onPress={() => router.push('/payments')} />
              <Row icon="ribbon-outline" title="Certificates & achievements" sub="Download, share and verify" onPress={() => router.push('/certificates')} />
              <Row icon="code-slash-outline" title="Code Playground" sub="Practise any language, run challenges" onPress={() => router.push('/playground')} />
              <Row icon="download-outline" title="Downloads" sub="Lessons saved for offline" onPress={() => router.push('/downloads')} />
              <Row icon="notifications-outline" title="Notifications" sub={s?.unread ? `${s.unread} unread` : 'All caught up'} onPress={() => router.push('/notifications')} />
            </Group>

            <Group title="My account" icon="person-outline">
              <Row icon="create-outline" title="Edit profile" sub="Name and email" onPress={() => setSheet('edit')} />
              <Row icon="lock-closed-outline" title="Change password" sub="Use 8+ characters with letters and numbers" onPress={() => setSheet('password')} />
              <Row icon="call-outline" title="Email & phone" sub={user.phone} onPress={() => setSheet('contact')} right={user.phoneVerified ? <Pill text="Verified" tone="success" icon="checkmark" /> : <Pill text="Verify" tone="warning" />} />
            </Group>

            <Group title="App settings" icon="settings-outline">
              <Row icon="radio-outline" title="Live class reminders" toggle={{ value: settings.push.live, onChange: (v) => update({ push: { ...settings.push, live: v } }) }} />
              <Row icon="document-text-outline" title="Assignment & grade updates" toggle={{ value: settings.push.assignments, onChange: (v) => update({ push: { ...settings.push, assignments: v } }) }} />
              <Row icon="book-outline" title="New lessons & course news" toggle={{ value: settings.push.course, onChange: (v) => update({ push: { ...settings.push, course: v } }) }} />
              <Row icon="pricetag-outline" title="Offers & recommendations" toggle={{ value: settings.push.offers, onChange: (v) => update({ push: { ...settings.push, offers: v } }) }} />
              <Row icon="wifi-outline" title="Download on Wi-Fi only" toggle={{ value: settings.wifiOnly, onChange: (v) => update({ wifiOnly: v }) }} />
              <Row icon="film-outline" title="Default video quality" sub={{ auto: 'Auto (recommended)', sd: 'Data saver (480p)', hd: 'High (720p)' }[settings.quality]} onPress={() => setSheet('quality')} />
              <Row icon="language-outline" title="App language" sub={settings.language === 'en' ? 'English' : 'தமிழ் (Tamil)'} onPress={() => setSheet('language')} />
            </Group>

            <Group title="Support" icon="headset-outline">
              <Row icon="help-circle-outline" title="Help center" sub="FAQs, guides and your tickets" onPress={() => router.push('/help')} />
              <Row icon="star-outline" title="Send feedback" sub="Tell us what to improve" onPress={() => setSheet('feedback')} />
            </Group>

            <Pressable onPress={() => setSheet('logout')} style={[styles.logout, { borderColor: c.danger }]} accessibilityRole="button">
              <Ionicons name="log-out-outline" size={20} color={c.danger} />
              <Txt variant="bodyStrong" color={c.danger}>Log out</Txt>
            </Pressable>
            <PoweredBy />
            <Txt variant="caption" color={c.muted} center>Bodhin v1.0.0 (POC)</Txt>
          </View>
        </ScrollView>
        {toast && (
          <View style={[styles.toast, { backgroundColor: c.ink }]} accessibilityLiveRegion="polite">
            <Txt variant="label" color="#fff">{toast}</Txt>
          </View>
        )}
      </SafeAreaView>

      <EditSheet open={sheet === 'edit'} onClose={() => setSheet(null)} onSaved={(sess) => { setSession(sess); flash('Profile updated'); }} />
      <PasswordSheet open={sheet === 'password'} onClose={() => setSheet(null)} onSaved={() => flash('Password changed')} />

      <BottomSheet open={sheet === 'contact'} onClose={() => setSheet(null)} title="Email & phone">
        <Row icon="mail-outline" title={user.email} sub="Used for receipts and certificates" />
        <Row icon="call-outline" title={user.phone} sub={user.phoneVerified ? 'Verified with OTP' : 'Not verified'} />
        <Txt variant="caption" color={c.muted}>To change your mobile number, we send a one-time code to the new number. (Connects to the OTP service in production.)</Txt>
      </BottomSheet>

      <BottomSheet open={sheet === 'quality'} onClose={() => setSheet(null)} title="Default video quality">
        <View style={{ gap: 8 }}>
          {([['auto', 'Auto (recommended)', 'Adjusts to your network'], ['sd', 'Data saver (480p)', 'About 4 MB per minute'], ['hd', 'High (720p)', 'About 11 MB per minute']] as const).map(([k, t, sub]) => (
            <Pressable key={k} onPress={() => { update({ quality: k }); setSheet(null); }} style={[styles.choice, { borderColor: settings.quality === k ? c.primary : c.border, backgroundColor: settings.quality === k ? c.primarySoft : c.surface }]} accessibilityRole="radio" accessibilityState={{ checked: settings.quality === k }}>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{t}</Txt>
                <Txt variant="caption" color={c.muted}>{sub}</Txt>
              </View>
              <Ionicons name={settings.quality === k ? 'radio-button-on' : 'radio-button-off'} size={22} color={settings.quality === k ? c.primary : c.borderStrong} />
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      <BottomSheet open={sheet === 'language'} onClose={() => setSheet(null)} title="App language">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Chip label="English" active={settings.language === 'en'} onPress={() => { update({ language: 'en' }); setSheet(null); }} />
          <Chip label="தமிழ் (Tamil)" active={settings.language === 'ta'} onPress={() => { update({ language: 'ta' }); setSheet(null); flash('Tamil translation arrives in the next release'); }} />
        </View>
        <Txt variant="caption" color={c.muted}>All screen text is kept in one place so translations can be added without changing screens.</Txt>
      </BottomSheet>

      <FeedbackSheet open={sheet === 'feedback'} onClose={() => setSheet(null)} onSent={() => flash('Thanks for your feedback!')} />

      <BottomSheet
        open={sheet === 'logout'}
        onClose={() => setSheet(null)}
        title="Log out?"
        footer={
          <>
            <Button title="Cancel" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setSheet(null)} />
            <Button title="Log out" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={() => { setSheet(null); signOut(); router.replace('/sign-in'); }} />
          </>
        }
      >
        <Txt color={c.inkSoft}>Your downloads stay on this phone but play only after you sign in again.</Txt>
      </BottomSheet>
    </View>
  );
}

function EditSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (s: Awaited<ReturnType<typeof account.updateProfile>>) => void }) {
  const { session } = useAuth();
  const [name, setName] = useState(session!.user.name);
  const [email, setEmail] = useState(session!.user.email);
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      onSaved(await account.updateProfile(session!.user.id, { name, email }));
      onClose();
    } catch (e) {
      const a = e as ApiError;
      setErr({ field: a.field, msg: a.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet open={open} onClose={onClose} title="Edit profile" footer={<Button title="Save changes" loading={busy} style={{ flex: 1 }} onPress={save} />}>
      <TextField label="Full name" icon="person-outline" value={name} onChangeText={setName} hint="Shown on your certificates" error={err?.field === 'name' ? err.msg : null} />
      <TextField label="Email" icon="mail-outline" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={err?.field === 'email' ? err.msg : null} />
      {err && !err.field && <Banner text={err.msg} />}
    </BottomSheet>
  );
}

function PasswordSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { session } = useAuth();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await account.changePassword(session!.user.id, cur, next);
      setCur('');
      setNext('');
      onSaved();
      onClose();
    } catch (e) {
      const a = e as ApiError;
      setErr({ field: a.field, msg: a.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomSheet open={open} onClose={onClose} title="Change password" footer={<Button title="Update password" loading={busy} style={{ flex: 1 }} onPress={save} />}>
      <TextField label="Current password" icon="lock-closed-outline" secure value={cur} onChangeText={setCur} error={err?.field === 'current' ? err.msg : null} />
      <TextField label="New password" icon="key-outline" secure value={next} onChangeText={setNext} error={err?.field === 'next' ? err.msg : null} hint="At least 8 characters with letters and numbers" />
    </BottomSheet>
  );
}

function FeedbackSheet({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Send feedback"
      footer={<Button title="Send" disabled={!rating} loading={busy} style={{ flex: 1 }} onPress={async () => { setBusy(true); await account.sendFeedback(session!.user.id, rating, text); setBusy(false); setRating(0); setText(''); onClose(); onSent(); }} />}
    >
      <Txt color={c.inkSoft}>How is your experience with the app?</Txt>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <Pressable key={s} onPress={() => setRating(s)} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel={`${s} stars`}>
            <Ionicons name={s <= rating ? 'star' : 'star-outline'} size={36} color={s <= rating ? '#F5A524' : c.borderStrong} />
          </Pressable>
        ))}
      </View>
      <TextField label="What should we improve? (optional)" value={text} onChangeText={setText} multiline style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 30, paddingTop: 8 },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  hero: { borderRadius: 24, padding: 18 },
  editBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  stats: { flexDirection: 'row', paddingVertical: 12, borderRadius: radius.lg, borderWidth: 1 },
  tenant: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md },
  switch: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 54, borderRadius: radius.pill, borderWidth: 1.4, marginTop: 4 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1.2 },
  toast: { position: 'absolute', bottom: 20, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.pill },
});
