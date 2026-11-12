/** Workspace & branding: name, colours (live preview), Bodhin subdomain, custom domain with DNS steps, white-label. */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, workspaceApi } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, ScreenTop, ToggleRow, fmtDay, shared } from '@/ui/section';

const PRIMARY = ['#0B3B73', '#0F6E5A', '#6D28D9', '#B91C1C', '#0E7490', '#1F2937', '#9D174D', '#14532D'];
const ACCENT = ['#D99A1E', '#E8833A', '#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#EAB308', '#F97316'];
type Data = ReturnType<typeof workspaceApi.get>;

export default function Workspace() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [d, setD] = useState<Data | null>(null);
  const [b, setB] = useState({ displayName: '', tagline: '', primary: PRIMARY[0], accent: ACCENT[0], hidePoweredBy: false });
  const [slug, setSlug] = useState('');
  const [slugSheet, setSlugSheet] = useState(false);
  const [host, setHost] = useState('');
  const [fe, setFe] = useState<{ field?: string; msg: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    try {
      const x = workspaceApi.get(userId);
      setD({ ...x, t: { ...x.t, domain: x.t.domain ? { ...x.t.domain } : x.t.domain } });
      const br = x.t.branding;
      setB({ displayName: br.displayName, tagline: br.tagline ?? '', primary: br.primary, accent: br.accent, hidePoweredBy: !!br.hidePoweredBy });
      setSlug(x.t.slug);
    } catch (e) {
      setFe({ msg: e instanceof ApiError ? e.message : 'Not available' });
    }
  }, [userId]);
  useFocusEffect(load);
  if (!d) return <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20 }}>{fe && <Banner text={fe.msg} />}</SafeAreaView>;
  const { t } = d;
  const check = workspaceApi.checkSlug(userId, slug);
  const act = async (fn: () => unknown, ok: string) => {
    setBusy(true);
    setFe(null);
    try {
      await fn();
      setMsg(ok);
      load();
      return true;
    } catch (e) {
      setFe(e instanceof ApiError ? { field: e.field, msg: e.message } : { msg: 'Something went wrong.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Branding & domain" sub={t.customDomain ?? `${t.slug}.thebodhin.com`} />
        <ScrollView contentContainerStyle={shared.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={shared.inner}>
            {msg && <Banner tone="success" text={msg} />}
            {fe && !fe.field && <Banner text={fe.msg} />}

            <Card title="Preview">
              <View style={[styles.preview, { borderColor: c.border }]}>
                <View style={[styles.pvTop, { backgroundColor: b.primary }]}>
                  <View style={[styles.logo, { backgroundColor: b.accent }]}><Txt variant="label" color="#fff">{b.displayName.split(' ').map((w) => w[0]).slice(0, 2).join('')}</Txt></View>
                  <Txt variant="bodyStrong" color="#fff" numberOfLines={1} style={{ flex: 1 }}>{b.displayName || 'Your academy'}</Txt>
                </View>
                <View style={{ padding: 14, gap: 6, backgroundColor: '#FBF7F0' }}>
                  <Txt variant="heading" color="#0E1B33">Learn <Txt variant="heading" color={b.accent}>practically</Txt></Txt>
                  <Txt variant="caption" color="#6B7486">{b.tagline || 'Your tagline appears here'}</Txt>
                  <View style={[styles.pvBtn, { backgroundColor: b.primary }]}><Txt variant="label" color="#fff">Enroll now</Txt></View>
                  {!b.hidePoweredBy && <Txt variant="caption" color="#6B7486" center>Powered by Bodhin</Txt>}
                </View>
              </View>
            </Card>

            <Card title="Brand">
              <TextField label="Workspace name" value={b.displayName} onChangeText={(v) => setB({ ...b, displayName: v })} maxLength={40} error={fe?.field === 'name' ? fe.msg : undefined} />
              <TextField label="Tagline" value={b.tagline} onChangeText={(v) => setB({ ...b, tagline: v })} maxLength={60} />
              <Txt variant="label">Main colour</Txt>
              <View style={shared.chips}>{PRIMARY.map((x) => <Swatch key={x} color={x} on={b.primary === x} onPress={() => setB({ ...b, primary: x })} />)}</View>
              <Txt variant="label">Highlight colour</Txt>
              <View style={shared.chips}>{ACCENT.map((x) => <Swatch key={x} color={x} on={b.accent === x} onPress={() => setB({ ...b, accent: x })} />)}</View>
              <View style={[styles.logoRow, { borderColor: c.border }]}>
                <Ionicons name="image-outline" size={22} color={c.inkSoft} />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong">Logo</Txt>
                  <Txt variant="caption" color={c.muted}>PNG/SVG, square, at least 256 px</Txt>
                </View>
                <Button title="Upload" size="md" variant="outline" onPress={() => setMsg('Logo upload is simulated in this POC — your initials are used.')} />
              </View>
              <ToggleRow title="Hide “Powered by Bodhin”" sub={d.whiteLabel ? 'White-label is included in your plan' : 'Available on Institute plan'} value={b.hidePoweredBy} disabled={!d.whiteLabel} onChange={(v) => setB({ ...b, hidePoweredBy: v })} />
              <Button title="Save branding" size="md" loading={busy} onPress={() => act(() => workspaceApi.saveBranding(userId, b), 'Branding saved. Students see it on your site and in the app.')} />
            </Card>

            <Card title="Bodhin address">
              <View style={styles.domain}>
                <Ionicons name="link" size={20} color={c.primary} />
                <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{t.slug}.thebodhin.com</Txt>
                <Button title="Change" size="md" variant="outline" onPress={() => { setSlug(t.slug); setSlugSheet(true); setFe(null); }} />
              </View>
              <Txt variant="caption" color={c.muted}>Always works, even with a custom domain.</Txt>
            </Card>

            <Card title="Custom domain" right={t.domain ? <Pill text={t.domain.status === 'active' ? 'Live · SSL on' : 'Waiting for DNS'} tone={t.domain.status === 'active' ? 'success' : 'warning'} /> : undefined}>
              {!d.canCustom ? (
                <>
                  <Txt color={c.inkSoft}>Use your own address like learn.youracademy.com. Included in Institute, or add it to any plan.</Txt>
                  <Button title="Get custom domain" size="md" variant="outline" onPress={() => router.push('/edu/subscription')} />
                </>
              ) : !t.domain ? (
                <>
                  <TextField label="Your domain" placeholder="learn.youracademy.com" value={host} onChangeText={setHost} autoCapitalize="none" keyboardType="url" error={fe?.field === 'host' ? fe.msg : undefined} />
                  <Button title="Add domain" size="md" loading={busy} onPress={() => act(() => workspaceApi.addDomain(userId, host), 'Domain added. Now add the DNS records below.')} />
                </>
              ) : (
                <>
                  <View style={styles.domain}>
                    <Ionicons name="globe-outline" size={20} color={c.primary} />
                    <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{t.domain.host}</Txt>
                  </View>
                  <Steps done={t.domain.status === 'active' ? 3 : 1} />
                  {t.domain.status !== 'active' && (
                    <>
                      <Txt variant="label">Add these records at your domain provider (GoDaddy, Hostinger, etc.)</Txt>
                      <Dns type="CNAME" name={t.domain.host.split('.')[0]} value="tenants.thebodhin.com" />
                      <Dns type="TXT" name={`_bodhin.${t.domain.host.split('.')[0]}`} value={`bodhin-verify=${t.id}`} />
                      <Button title="I’ve added them — verify" size="md" loading={busy} onPress={() => act(() => workspaceApi.verifyDomain(userId), 'Domain verified. SSL certificate issued — your site is live.')} />
                    </>
                  )}
                  {t.domain.status === 'active' && <Txt variant="caption" color={c.muted}>Connected since {fmtDay(t.domain.addedAt)}. Checkout here uses your own payment gateway.</Txt>}
                  <Button title="Remove domain" size="md" variant="outline" onPress={() => act(() => workspaceApi.removeDomain(userId), 'Custom domain removed. Your Bodhin address still works.')} />
                </>
              )}
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet open={slugSheet} onClose={() => setSlugSheet(false)} title="Change Bodhin address" footer={<Button title="Save address" size="md" disabled={!check.ok || slug === t.slug} style={{ flex: 1 }} onPress={async () => { if (await act(() => workspaceApi.changeSlug(userId, slug), `Your address is now ${slug}.thebodhin.com. Old links redirect for 90 days.`)) setSlugSheet(false); }} />}>
        <View style={{ gap: 8 }}>
          <TextField label="Address" value={slug} onChangeText={(v) => setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))} autoCapitalize="none" maxLength={30} />
          <Txt variant="caption" color={check.ok ? c.success : c.danger}>{slug}.thebodhin.com — {check.msg}</Txt>
          <Txt variant="caption" color={c.muted}>Changing it updates shared links; old links redirect for 90 days.</Txt>
        </View>
      </BottomSheet>
    </View>
  );
}

function Swatch({ color, on, onPress }: { color: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.swatch, { backgroundColor: color, borderColor: on ? c.ink : 'transparent' }]} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`Colour ${color}`}>
      {on && <Ionicons name="checkmark" size={18} color="#fff" />}
    </Pressable>
  );
}

function Steps({ done }: { done: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {['Domain added', 'DNS verified', 'SSL issued'].map((s, i) => (
        <View key={s} style={{ flex: 1, gap: 4 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: i < done ? c.success : c.border }} />
          <Txt variant="caption" color={i < done ? c.success : c.muted}>{s}</Txt>
        </View>
      ))}
    </View>
  );
}

function Dns({ type, name, value }: { type: string; name: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.dns, { backgroundColor: c.surfaceMuted }]}>
      <Pill text={type} tone="info" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="caption" color={c.muted}>Name: <Txt variant="caption" color={c.ink}>{name}</Txt></Txt>
        <Txt variant="caption" color={c.muted} numberOfLines={1}>Value: <Txt variant="caption" color={c.ink}>{value}</Txt></Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  pvTop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  logo: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pvBtn: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginTop: 4 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 10 },
  domain: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  dns: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 10 },
});
