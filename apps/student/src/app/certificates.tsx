/** Certificates & achievements (combined), with certificate viewer, share and public verification. */
import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, badges, certificates, certification } from '@/api/client';
import { certificateHtml } from '@/core/certification';
import { saveText } from '@/ui/calendarActions';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { TwoTone, Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, IconButton, Pill, ProgressBar } from '@/ui/kit';
import { CertificatePaper } from '@/ui/CertificatePaper';

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
  const [rev, setRev] = useState(0);
  // Pick up progress made before this screen was opened: a qualifying course raises its request now.
  useFocusEffect(useCallback(() => { certification.sync(userId); setRev((r) => r + 1); }, [userId]));
  void rev;
  const list = certificates.list(userId);
  const wait = certification.mine(userId);
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

  const download = async (cert: Cert) => {
    try {
      const url = certificates.verifyUrl(cert.id);
      await saveText(`${cert.id}.html`, certificateHtml(cert, session?.user.name ?? '', url, cert.template), 'text/html', `My Bodhin certificate: “${cert.title}”. Verify: ${url}`);
      flash('Certificate downloaded. Open it and choose Print → Save as PDF.');
    } catch {
      flash('Could not save the certificate. Please try again.');
    }
  };
  const askAgain = (id: string) => {
    try { certification.reRequest(userId, id); flash('Requested again. You’ll be told when it’s reviewed.'); } catch (e) { flash(e instanceof ApiError ? e.message : 'Could not send the request.'); }
    setRev((r) => r + 1);
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

            {tab === 'certificates' && wait.requests.map(({ r, title, by }) => (
              <View key={r.id} style={[styles.req, { backgroundColor: c.surface, borderColor: r.status === 'rejected' ? c.danger : c.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name={r.status === 'pending' ? 'hourglass-outline' : 'alert-circle-outline'} size={24} color={r.status === 'pending' ? c.accent : c.danger} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="bodyStrong" numberOfLines={2}>{title}</Txt>
                    <Txt variant="caption" color={c.muted}>{r.status === 'pending' ? `Waiting for ${by} to approve · asked ${day(r.requestedAt)}` : `Not approved yet · ${day(r.decidedAt ?? r.requestedAt)}`}</Txt>
                  </View>
                  <Pill text={r.status === 'pending' ? 'Pending approval' : 'Needs changes'} tone={r.status === 'pending' ? 'info' : 'warning'} />
                </View>
                {r.status === 'rejected' && (
                  <>
                    {!!r.note && <Txt variant="caption" color={c.inkSoft}>“{r.note}”</Txt>}
                    <Button title="Request again" size="md" variant="outline" onPress={() => askAgain(r.id)} />
                  </>
                )}
              </View>
            ))}

            {tab === 'certificates' && wait.inProgress.map(({ course, st }) => (
              <View key={course.id} style={[styles.req, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Txt variant="bodyStrong" numberOfLines={2}>{course.title}</Txt>
                <ProgressBar pct={Math.min(100, Math.round((st.progressPct / 75) * 100))} height={6} />
                <Txt variant="caption" color={c.muted}>Certificate: {st.eligible ? 'ready to request' : st.missing.join(' · ')}</Txt>
              </View>
            ))}

            {tab === 'certificates' &&
              (list.length === 0 ? (
                <Txt color={c.muted} center style={{ paddingVertical: 30 }}>{wait.requests.length || wait.inProgress.length ? 'Approved certificates will appear here.' : 'Finish 75% of a course and pass its quizzes to earn your first certificate.'}</Txt>
              ) : (
                list.map((cert) => (
                  <View key={cert.id} style={[styles.cert, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <Pressable onPress={() => setView(cert)} style={styles.certMain} accessibilityRole="button" accessibilityLabel={`Certificate: ${cert.title}`}>
                      <View style={[styles.mini, { borderColor: c.accent, backgroundColor: '#FFFBF3' }]}>
                        <Ionicons name="ribbon" size={26} color={c.accent} />
                        <View style={{ width: 34, height: 3, backgroundColor: c.primaryDeep, borderRadius: 2 }} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <Txt variant="bodyStrong" numberOfLines={2}>{cert.title}</Txt>
                        <Txt variant="caption" color={c.muted}>Issued {day(cert.issuedAt)}</Txt>
                        <Pill text="Verified" tone="success" icon="shield-checkmark" />
                      </View>
                    </Pressable>
                    <IconButton icon="download-outline" label={`Download ${cert.title}`} onPress={() => download(cert)} />
                    <IconButton icon="share-social-outline" label={`Share ${cert.title}`} onPress={() => share(cert)} />
                  </View>
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
              <Button title="Download" size="md" iconLeft="download-outline" style={{ flex: 1 }} onPress={() => download(view)} />
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
  return (
    <CertificatePaper
      template={cert.template}
      recipientName={name}
      courseTitle={cert.title}
      program={cert.program}
      tutorName={cert.tutor}
      issuedAt={cert.issuedAt}
      certId={cert.id}
    />
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
  req: { padding: 12, borderRadius: radius.lg, borderWidth: 1.2, gap: 8 },
  cert: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1 },
  certMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
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
