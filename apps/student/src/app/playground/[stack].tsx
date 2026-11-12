/**
 * Playground workspace: editor + Run + output, with optional challenge checking.
 * Phone: Code / Result segments. Desktop: editor left, result right.
 * Browser runners (HTML/CSS/JS, JS, TS, React, Python, SQL) run locally in a sandbox; compiled languages run on Bodhin's code server.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, playground } from '@/api/client';
import { challengeOf, type Challenge } from '@/playground/challenges';
import { gradeDom, gradeIo, gradeSql, summary, validateProject, ISSUE_TEXT, PLAYGROUND_LIMITS, type TestResult } from '@/playground/checks';
import { browserCapable, observeDom, previewDoc, runInBrowser, stopAll } from '@/playground/runners';
import { stackOf, type PFile } from '@/playground/stacks';
import type { RunResult } from '@/playground/types';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { CodeEditor } from '@/ui/CodeEditor';
import { PreviewFrame } from '@/ui/PreviewFrame';
import { TextField } from '@/ui/TextField';
import { BottomSheet, IconButton, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { PAGE, useLayout } from '@/ui/responsive';

const clone = (fs: PFile[]) => fs.map((f) => ({ ...f }));

export default function WorkspaceRoute() {
  const q = useLocalSearchParams<{ stack: string; project?: string; challenge?: string }>();
  // New stack / project / challenge = a fresh workspace (expo-router reuses the screen otherwise and would keep the old code).
  return <Workspace key={`${q.stack}|${q.project ?? ''}|${q.challenge ?? ''}`} />;
}

function Workspace() {
  const { stack: stackId, project: projectId, challenge: challengeId } = useLocalSearchParams<{ stack: string; project?: string; challenge?: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { isDesktop, pad } = useLayout();
  const stack = stackOf(stackId);
  const challenge: Challenge | undefined = challengeId ? challengeOf(challengeId) : undefined;
  const saved = useMemo(() => (projectId ? playground.overview(userId).projects.find((p) => p.id === projectId) : undefined), [projectId, userId]);
  const starter = useMemo(() => clone((challenge ?? stack)?.files ?? []), [challenge, stack]);

  const [files, setFiles] = useState<PFile[]>(() => (saved ? (saved.files as PFile[]) : starter));
  const [active, setActive] = useState(0);
  const [stdin, setStdin] = useState('');
  const [tab, setTab] = useState<'code' | 'result'>('code');
  const [busy, setBusy] = useState<'run' | 'check' | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [tests, setTests] = useState<TestResult[] | null>(null);
  const [doc, setDoc] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [title, setTitle] = useState(saved?.title ?? '');
  const [savedId, setSavedId] = useState<string | undefined>(saved?.id);
  const [toast, setToast] = useState<string | null>(null);
  const [runsLeft, setRunsLeft] = useState<number | null>(null);
  const [won, setWon] = useState<number | null>(null);
  const solvedBefore = useRef(challenge ? playground.overview(userId).solved.includes(challenge.id) : false);

  useEffect(() => () => stopAll(), []);
  // console output from the live preview iframe (web)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const h = (e: MessageEvent) => {
      const d = e.data;
      if (!d?.bodhin || (d.t !== 'out' && d.t !== 'err')) return;
      setResult((r) => ({ ok: true, ms: 0, stdout: '', stderr: '', ...(r ?? {}), [d.t === 'out' ? 'stdout' : 'stderr']: ((r as any)?.[d.t === 'out' ? 'stdout' : 'stderr'] ?? '') + d.s }));
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);

  if (!stack) {
    return (
      <View style={{ flex: 1, backgroundColor: c.ivory, padding: 24, justifyContent: 'center', gap: 12 }}>
        <Banner text="That stack doesn’t exist." />
        <Button title="Back to Playground" onPress={() => router.replace('/playground')} />
      </View>
    );
  }

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };
  const file = files[Math.min(active, files.length - 1)];
  const webLike = stack.runner === 'web' || stack.runner === 'react';
  const onServer = stack.runner === 'remote' || !browserCapable(stack);
  const setCode = (code: string) => setFiles((fs) => fs.map((f, i) => (i === active ? { ...f, code } : f)));
  const problem = validateProject(files, stdin);

  const fail = (e: unknown) => {
    const m = (e as ApiError).message ?? 'Something went wrong.';
    setError(m);
    setResult(null);
    setTests(null);
  };

  /* ── Run ── */
  const run = async () => {
    if (problem) return setError(ISSUE_TEXT[problem]);
    setBusy('run');
    setError(null);
    setTests(null);
    setWon(null);
    setResult(null);
    setTab('result');
    try {
      if (webLike && browserCapable(stack)) {
        const p = previewDoc(stack, files);
        if ('error' in p) setResult({ ok: false, stdout: '', stderr: p.error + '\n', ms: 0, phase: 'compile' });
        else {
          setDoc(p.doc);
          setPreviewKey((k) => k + 1);
          setResult({ ok: true, stdout: '', stderr: '', ms: 0 });
        }
      } else if (browserCapable(stack) && !onServer) {
        setResult(await runInBrowser(stack, files, stdin));
      } else {
        const [r] = await playground.runRemote(userId, stack.id, files, [stdin]);
        setResult(r);
        if (r.runsLeft !== undefined) setRunsLeft(r.runsLeft);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  /* ── Check against the challenge's tests ── */
  const check = async () => {
    if (!challenge) return;
    if (problem) return setError(ISSUE_TEXT[problem]);
    setBusy('check');
    setError(null);
    setResult(null);
    setWon(null);
    setTab('result');
    try {
      let rs: TestResult[] = [];
      if (challenge.kind === 'dom') {
        const obs = await observeDom(files, challenge.checks);
        if (!obs) throw new ApiError('preview', 'The page could not be checked. Make sure it loads without errors.');
        rs = challenge.checks.map((ck, i) => gradeDom(ck, obs[i]));
        const p = previewDoc(stack, files);
        if ('doc' in p) { setDoc(p.doc); setPreviewKey((k) => k + 1); }
      } else if (challenge.kind === 'sql') {
        const r = await runInBrowser(stack, [{ ...files[0], code: challenge.setup + '\n' + files[0].code }], '');
        if (r.stderr) rs = [{ name: 'Query result', pass: false, error: r.stderr.trim() }];
        else rs = [gradeSql(challenge.expect, r.tables?.length ? r.tables[r.tables.length - 1].rows : null, challenge.ordered)];
        setResult(r);
      } else if (browserCapable(stack) && !onServer) {
        for (const t of challenge.tests) {
          const r = await runInBrowser(stack, files, t.stdin);
          rs.push(gradeIo(t, r.stdout, r.ok ? undefined : r.stderr.trim() || 'Your program stopped with an error.'));
          if (!r.ok && r.timedOut) break;
        }
      } else {
        const out = await playground.runRemote(userId, stack.id, files, challenge.tests.map((t) => t.stdin));
        rs = challenge.tests.map((t, i) => gradeIo(t, out[i]?.stdout ?? '', out[i]?.ok ? undefined : (out[i]?.stderr || 'Your program stopped with an error.').trim()));
        if (out[0]?.runsLeft !== undefined) setRunsLeft(out[0].runsLeft!);
      }
      setTests(rs);
      if (summary(rs).allPass) {
        playground.markSolved(userId, challenge.id);
        setWon(solvedBefore.current ? 0 : challenge.points);
        solvedBefore.current = true;
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setFiles(clone(starter));
    setResult(null);
    setTests(null);
    setError(null);
    setDoc(null);
    setWon(null);
    flash('Reset to the starter code');
  };
  const doSave = () => {
    try {
      const id = playground.save(userId, { id: savedId, stack: stack.id, title: title || `${stack.name} project`, files });
      setSavedId(id);
      setSaveOpen(false);
      flash('Saved to My projects');
    } catch (e) {
      setError((e as ApiError).message);
      setSaveOpen(false);
    }
  };

  /* ── pieces ── */
  const editor = (
    <View style={{ gap: 8 }}>
      {files.length > 1 && (
        <View style={styles.fileTabs} accessibilityRole="tablist">
          {files.map((f, i) => (
            <Pressable key={f.name} onPress={() => setActive(i)} accessibilityRole="tab" accessibilityState={{ selected: i === active }} accessibilityLabel={`File ${f.name}`} style={[styles.fileTab, { backgroundColor: i === active ? '#282c34' : c.surfaceMuted }]}>
              <Txt variant="label" color={i === active ? '#fff' : c.inkSoft}>{f.name}</Txt>
            </Pressable>
          ))}
        </View>
      )}
      <CodeEditor key={`${stack.id}-${file.name}`} value={file.code} onChange={setCode} lang={file.lang} label={`Code editor, ${file.name}`} minHeight={isDesktop ? 420 : 300} />
      {stack.stdin && (
        <View style={{ gap: 4 }}>
          <Txt variant="label" color={c.inkSoft}>Input (what the program reads)</Txt>
          <TextInput value={stdin} onChangeText={setStdin} multiline placeholder="Type input here, one value per line" placeholderTextColor={c.muted} accessibilityLabel="Program input" style={[styles.stdin, { backgroundColor: c.surface, borderColor: c.border, color: c.ink }]} />
        </View>
      )}
    </View>
  );

  const resultPane = (
    <View style={{ gap: 12 }}>
      {error && <Banner text={error} />}
      {busy && <Txt color={c.inkSoft} accessibilityLiveRegion="polite">{busy === 'check' ? 'Checking your answer…' : onServer ? 'Running on the code server…' : stack.runner === 'python' || stack.runner === 'sql' ? 'Running… (the first run downloads the runtime)' : 'Running…'}</Txt>}
      {won !== null && (
        <View style={[styles.win, { backgroundColor: c.successBg, borderColor: c.success }]} accessibilityLiveRegion="polite">
          <Ionicons name="trophy" size={24} color={c.success} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong" color={c.success}>All tests passed!</Txt>
            <Txt variant="caption" color={c.inkSoft}>{won > 0 ? `+${won} points added to your profile.` : 'You had already solved this one.'}</Txt>
          </View>
          <Button title="More challenges" size="md" variant="outline" onPress={() => router.replace('/playground')} />
        </View>
      )}
      {tests && (
        <View style={{ gap: 8 }}>
          <Txt variant="heading" accessibilityLabel={`${summary(tests).passed} of ${summary(tests).total} tests passed`}>{summary(tests).passed}/{summary(tests).total} tests passed</Txt>
          {tests.map((t, i) => (
            <View key={i} style={[styles.test, { borderColor: t.pass ? c.success : c.danger, backgroundColor: t.pass ? c.successBg : c.dangerBg }]}>
              <Ionicons name={t.pass ? 'checkmark-circle' : 'close-circle'} size={20} color={t.pass ? c.success : c.danger} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="bodyStrong">{t.name}</Txt>
                {!t.pass && t.error && <Txt variant="caption" color={c.danger} style={styles.mono}>{t.error}</Txt>}
                {!t.pass && !t.error && t.expected !== undefined && (
                  <Txt variant="caption" color={c.inkSoft} style={styles.mono}>Expected:{'\n'}{t.expected || '(nothing)'}{'\n'}You printed:{'\n'}{t.got || '(nothing)'}</Txt>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
      {doc && webLike && (
        <View style={{ gap: 6 }}>
          <Txt variant="label" color={c.inkSoft}>Preview</Txt>
          <PreviewFrame key={previewKey} doc={doc} title="Live preview" height={isDesktop ? 340 : 280} />
        </View>
      )}
      {result && (result.stdout || result.stderr || !webLike) && (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt variant="label" color={c.inkSoft}>{webLike ? 'Console' : 'Output'}</Txt>
            {!webLike && result.ms > 0 && <Txt variant="caption" color={c.muted}>{result.ms} ms</Txt>}
            {result.phase === 'compile' && <Pill text="Compile error" tone="warning" />}
          </View>
          <View style={styles.console} accessibilityLabel="Program output">
            {result.stdout ? <Txt style={[styles.mono, { color: '#e6e6e6' }]} selectable>{result.stdout}</Txt> : null}
            {result.stderr ? <Txt style={[styles.mono, { color: '#ff8b8b' }]} selectable>{result.stderr}</Txt> : null}
            {!result.stdout && !result.stderr && !result.tables?.length ? <Txt style={[styles.mono, { color: '#9aa3b2' }]}>(no output)</Txt> : null}
          </View>
        </View>
      )}
      {result?.tables?.map((t, ti) => (
        <ScrollView key={ti} horizontal style={{ borderRadius: 12 }}>
          <View style={[styles.table, { borderColor: c.border }]} accessibilityLabel={`Result table ${ti + 1}`}>
            <View style={{ flexDirection: 'row', backgroundColor: c.surfaceMuted }}>{t.columns.map((col) => <Txt key={col} variant="label" style={styles.cell}>{col}</Txt>)}</View>
            {t.rows.slice(0, 200).map((r, ri) => (
              <View key={ri} style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border }}>{r.map((v, ci) => <Txt key={ci} style={styles.cell}>{v === null ? 'NULL' : String(v)}</Txt>)}</View>
            ))}
            {t.rows.length === 0 && <Txt variant="caption" color={c.muted} style={styles.cell}>0 rows</Txt>}
          </View>
        </ScrollView>
      ))}
      {!busy && !result && !tests && !error && !doc && <Txt color={c.muted}>Press Run to see the result here.</Txt>}
    </View>
  );

  const actions = (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <Button title="Run" iconLeft="play" size="md" loading={busy === 'run'} disabled={!!busy} onPress={run} accessibilityLabel="Run code" style={{ flexGrow: 1, minWidth: 110 }} />
      {challenge && <Button title="Check answer" iconLeft="checkmark-done" size="md" variant="soft" loading={busy === 'check'} disabled={!!busy} onPress={check} accessibilityLabel="Check answer" style={{ flexGrow: 1, minWidth: 140 }} />}
      <Button title="Save" iconLeft="save-outline" size="md" variant="outline" onPress={() => setSaveOpen(true)} accessibilityLabel="Save project" />
      <Button title="Reset" iconLeft="refresh" size="md" variant="ghost" onPress={reset} accessibilityLabel="Reset to starter code" />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 40, paddingHorizontal: pad }} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: PAGE.wide, gap: 12 }}>
            <View style={{ paddingTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconButton icon="chevron-back" label="Go back" tone="filled" onPress={() => (router.canGoBack() ? router.back() : router.replace('/playground'))} />
              <View style={{ flex: 1 }}>
                <Txt variant="heading" numberOfLines={1}>{challenge ? challenge.title : saved?.title ?? stack.name}</Txt>
                <Txt variant="caption" color={c.muted}>{stack.name}{challenge ? ` · ${challenge.level} · ${challenge.points} pts` : ''}</Txt>
              </View>
              {onServer && <Pill text={runsLeft !== null ? `${runsLeft} server runs left` : 'Runs on server'} icon="cloud-outline" tone="info" />}
            </View>

            {challenge && (
              <View style={[styles.prompt, { backgroundColor: c.primarySoft, borderColor: c.primary }]} accessibilityLabel="Challenge instructions">
                <Ionicons name="flag-outline" size={20} color={c.primary} />
                <Txt style={{ flex: 1 }}>{challenge.prompt}</Txt>
              </View>
            )}
            {toast && <Txt variant="label" color={c.success} accessibilityLiveRegion="polite">{toast}</Txt>}

            {!isDesktop && (
              <View style={[styles.seg, { backgroundColor: c.surfaceMuted }]} accessibilityRole="tablist">
                {(['code', 'result'] as const).map((k) => (
                  <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} style={[styles.segBtn, tab === k && { backgroundColor: c.surface }]}>
                    <Txt variant="label" color={tab === k ? c.primary : c.inkSoft}>{k === 'code' ? 'Code' : 'Result'}</Txt>
                  </Pressable>
                ))}
              </View>
            )}

            {isDesktop ? (
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
                <View style={{ flex: 1.15, minWidth: 0, gap: 12 }}>{editor}{actions}</View>
                <View style={{ flex: 1, minWidth: 0, gap: 12 }}>{resultPane}</View>
              </View>
            ) : (
              <>
                {tab === 'code' ? editor : resultPane}
                {actions}
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet open={saveOpen} onClose={() => setSaveOpen(false)} title="Save project" footer={<Button title="Save" size="md" style={{ flex: 1 }} onPress={doSave} />}>
        <TextField label="Project name" value={title} onChangeText={setTitle} placeholder={`${stack.name} project`} maxLength={80} />
        <Txt variant="caption" color={c.muted}>You can keep up to {PLAYGROUND_LIMITS.savedProjects} projects.</Txt>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fileTabs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  fileTab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  stdin: { minHeight: 64, borderWidth: 1, borderRadius: 12, padding: 10, fontSize: 14, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  console: { backgroundColor: '#1b1f27', borderRadius: 12, padding: 12, minHeight: 60 },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 13, lineHeight: 19 },
  test: { flexDirection: 'row', gap: 10, padding: 10, borderRadius: radius.md, borderWidth: 1 },
  prompt: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  win: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, flexWrap: 'wrap' },
  seg: { flexDirection: 'row', padding: 4, borderRadius: radius.pill },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.pill },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', alignSelf: 'flex-start' },
  cell: { minWidth: 110, paddingHorizontal: 12, paddingVertical: 8 },
});
