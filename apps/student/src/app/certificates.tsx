/** Certificates & achievements (combined), with certificate viewer, share and public verification. */
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { badges, certificates } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, IconButton, Pill, ProgressBar } from '@/ui/kit';
import { BrandLogo } from '@/ui/Brand';

type Cert = ReturnType<typeof certificates.list>[number];
type Tab = 'certificates' | 'badges' | 'verify';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Certificates() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'badges' ? 'badges' : 'certificates');
  const [view, setView] = useState<Cert | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const list = certificates.list(userId);
  const bs = badges.list(userId);
  const earned = bs.filter((b) => b.earned).length;

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2400);
  };
  const share = async (cert: Cert) => {
    const url = certificates.verifyUrl(cert.id);
    try {
      await Share.share({ message: `I completed “${cert.title}” on Bodhin. Verify: ${url}`, url });
    } catch {
      flash(`Share link: ${url}`);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            <View style={{ paddingVertical: 8 }}>
              <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
            </View>
            <TwoTone lead="Certificates &" accent="Achievements" variant="title" />

            <View style={[styles.summary, { backgroundColor: c.primaryDeep }]}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Txt variant="display" color="#fff">{list.length}</Txt>
                <Txt variant="caption" color="rgba(255,255,255,0.8)">Certificates</Txt>
              </View>
              <View style={{ width: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.2)' }} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Txt variant="display" color={c.accent}>{earned}<Txt variant="heading" color="rgba(255,255,255,0.6)">/{bs.length}</Txt></Txt>
                <Txt variant="caption" color="rgba(255,255,255,0.8)">Badges earned</Txt>
              </View>
            </View>

            <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
              {([['certificates', 'Certificates'], ['badges', 'Badges'], ['verify', 'Verify']] as const).map(([k, l]) => (
                <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} style={[styles.segBtn, tab === k && { backgroundColor: c.surface }]}>
                  <Txt variant="label" color={tab === k ? c.primary : c.inkSoft}>{l}</Txt>
                </Pressable>
              ))}
            </View>

            {tab === 'certificates' &&
              (list.length === 0 ? (
                <Txt color={c.muted} center style={{ paddingVertical: 30 }}>Complete a course to earn your first certificate.</Txt>
              ) : (
                list.map((cert) => (
                  <Pressable key={cert.id} onPress={() => setView(cert)} style={[styles.cert, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="button" accessibilityLabel={`Certificate: ${cert.title}`}>
                    <View style={[styles.mini, { borderColor: c.accent, backgroundColor: '#FFFBF3' }]}>
                      <Ionicons name="ribbon" size={26} color={c.accent} />
                      <View style={{ width: 34, height: 3, backgroundColor: c.primaryDeep, borderRadius: 2 }} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Txt variant="bodyStrong" numberOfLines={2}>{cert.title}</Txt>
                      <Txt variant="caption" color={c.muted}>Issued {day(cert.issuedAt)}</Txt>
                      <Pill text="Verified" tone="success" icon="shield-checkmark" />
                    </View>
                    <IconButton icon="share-social-outline" label={`Share ${cert.title}`} onPress={() => share(cert)} />
                  </Pressable>
                ))
              ))}

            {tab === 'badges' && (
              <View style={styles.grid}>
                {bs.map((b) => (
                  <View key={b.id} style={[styles.badge, { backgroundColor: c.surface, borderColor: b.earned ? b.color : c.border, opacity: b.earned ? 1 : 0.75 }]} accessibilityLabel={`${b.title}: ${b.earned ? 'earned' : 'locked'}. ${b.desc}`}>
                    <View style={[styles.badgeIcon, { backgroundColor: b.earned ? b.color : c.surfaceMuted }]}>
                      <Ionicons name={(b.earned ? b.icon : 'lock-closed') as keyof typeof Ionicons.glyphMap} size={26} color={b.earned ? '#fff' : c.muted} />
                    </View>
                    <Txt variant="label" center>{b.title}</Txt>
                    <Txt variant="caption" color={c.muted} center>{b.desc}</Txt>
                    {!b.earned && (
                      <View style={{ flexDirection: 'row', width: '100%' }}>
                        <ProgressBar pct={Math.round(b.progress * 100)} color={b.color} height={5} />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {tab === 'verify' && <Verify />}
          </View>
        </ScrollView>

        {toast && (
          <View style={[styles.toast, { backgroundColor: c.ink }]} accessibilityLiveRegion="polite">
            <Txt variant="label" color="#fff" center>{toast}</Txt>
          </View>
        )}
      </SafeAreaView>

      <BottomSheet
        open={!!view}
        onClose={() => setView(null)}
        title="Certificate"
        footer={
          view ? (
            <>
              <Button title="Share" variant="outline" size="md" iconLeft="share-social-outline" style={{ flex: 1 }} onPress={() => share(view)} />
              <Button title="Save PDF" size="md" iconLeft="download-outline" style={{ flex: 1 }} onPress={() => flash('PDF saved to your phone')} />
            </>
          ) : undefined
        }
      >
        {view && (
          <>
            <CertificateCard cert={view} name={session?.user.name ?? ''} />
            <View style={{ gap: 8 }}>
              {([['Certificate ID', view.id], ['Program', view.program], ['Duration', `${view.weeks} weeks`], ['Issued', day(view.issuedAt)]] as const).map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Txt color={c.inkSoft}>{k}</Txt>
                  <Txt variant="bodyStrong" style={{ flexShrink: 1, textAlign: 'right' }} selectable>{v}</Txt>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => Linking.openURL(`https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(view.title)}&organizationName=Bodhin&certId=${view.id}&certUrl=${encodeURIComponent(certificates.verifyUrl(view.id))}`).catch(() => {})}
              style={[styles.linkedin, { borderColor: '#0A66C2' }]}
              accessibilityRole="link"
            >
              <Ionicons name="logo-linkedin" size={20} color="#0A66C2" />
              <Txt variant="label" color="#0A66C2">Add to LinkedIn profile</Txt>
            </Pressable>
          </>
        )}
      </BottomSheet>
    </View>
  );
}

/** The certificate itself (also the template for the PDF the backend generates). */
function CertificateCard({ cert, name }: { cert: Cert; name: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.paper, { borderColor: c.primaryDeep }]} accessibilityLabel={`Certificate of completion for ${name}: ${cert.title}`}>
      <View style={[styles.inset, { borderColor: c.accent }]}>
        <BrandLogo size="sm" />
        <Txt variant="title" color={c.ink} center style={{ letterSpacing: 2, fontSize: 20, marginTop: 8 }}>CERTIFICATE</Txt>
        <Txt variant="caption" color={c.inkSoft} center style={{ letterSpacing: 3 }}>OF COMPLETION</Txt>
        <Txt variant="caption" color={c.muted} center style={{ marginTop: 10 }}>This is to certify that</Txt>
        <Txt variant="title" color={c.primaryDeep} center style={{ fontStyle: 'italic', fontSize: 24 }}>{name}</Txt>
        <View style={{ height: 1, backgroundColor: c.border, alignSelf: 'stretch', marginVertical: 4 }} />
        <Txt variant="caption" color={c.muted} center>has successfully completed</Txt>
        <Txt variant="bodyStrong" center>{cert.title}</Txt>
        <Txt variant="caption" color={c.inkSoft} center>{cert.program}</Txt>
        <View style={styles.sigs}>
          <View style={{ alignItems: 'center' }}>
            <Txt variant="label" style={{ fontStyle: 'italic' }}>{cert.tutor}</Txt>
            <Txt variant="caption" color={c.muted} style={{ fontSize: 10 }}>Instructor</Txt>
          </View>
          <Ionicons name="ribbon" size={34} color={c.accent} />
          <View style={{ alignItems: 'center' }}>
            <Txt variant="label">{day(cert.issuedAt)}</Txt>
            <Txt variant="caption" color={c.muted} style={{ fontSize: 10 }}>Date of issue</Txt>
          </View>
        </View>
        <Txt variant="caption" color={c.muted} center style={{ fontSize: 10 }}>Verify at thebodhin.com/verify · {cert.id}</Txt>
      </View>
    </View>
  );
}

function Verify() {
  const { c } = useTheme();
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Awaited<ReturnType<typeof certificates.verify>> | null>(null);
  return (
    <View style={[styles.verify, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Txt color={c.inkSoft}>Anyone can check that a Bodhin certificate is genuine. Enter the certificate ID printed at the bottom.</Txt>
      <TextField label="Certificate ID" icon="shield-checkmark-outline" placeholder="BODHIN-DM-AI-2026-0487" autoCapitalize="characters" value={id} onChangeText={(t) => { setId(t); setRes(null); }} onSubmitEditing={async () => { setBusy(true); setRes(await certificates.verify(id)); setBusy(false); }} />
      <Button title="Verify" iconLeft="search" loading={busy} disabled={!id.trim()} onPress={async () => { setBusy(true); setRes(await certificates.verify(id)); setBusy(false); }} />
      {res && (
        <View style={[styles.result, { backgroundColor: res.valid ? c.successBg : c.dangerBg }]} accessibilityLiveRegion="polite">
          <Ionicons name={res.valid ? 'shield-checkmark' : 'close-circle'} size={28} color={res.valid ? c.success : c.danger} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong" color={res.valid ? c.success : c.danger}>{res.valid ? 'Genuine certificate' : 'No certificate found'}</Txt>
            <Txt variant="label" color={c.inkSoft} style={{ fontWeight: '500' }}>{res.valid ? `${res.name} · ${res.title} · issued ${day(res.issuedAt)}` : 'Check the ID for typos. IDs look like BODHIN-XX-2026-0000.'}</Txt>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  summary: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderRadius: 22 },
  seg: { flexDirection: 'row', padding: 4, borderRadius: radius.pill },
  segBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  cert: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1 },
  mini: { width: 76, height: 58, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: { flexBasis: '46%', flexGrow: 1, alignItems: 'center', gap: 6, padding: 14, borderRadius: radius.lg, borderWidth: 1.4 },
  badgeIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  verify: { padding: 16, borderRadius: radius.lg, borderWidth: 1, gap: 12 },
  result: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: radius.md, alignItems: 'center' },
  paper: { borderWidth: 6, borderRadius: 8, backgroundColor: '#FFFBF3', padding: 6 },
  inset: { borderWidth: 1.5, borderRadius: 4, padding: 14, alignItems: 'center', gap: 2 },
  sigs: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', marginTop: 12, marginBottom: 6 },
  linkedin: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: radius.pill, borderWidth: 1.4 },
  toast: { position: 'absolute', bottom: 20, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.pill, maxWidth: '90%' },
});
