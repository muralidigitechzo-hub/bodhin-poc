/**
 * Lesson editor (full screen over the builder). Video or PDF, upload with progress,
 * storage-limit check, extra resources, free preview and completion rule.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, courseAdmin } from '@/api/client';
import type { Lesson } from '@/core/catalog';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, IconButton, Pill, ProgressBar } from '@/ui/kit';
import { Banner } from '@/ui/misc';

type Kind = 'video' | 'pdf';
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export default function LessonEditor() {
  const { courseId, moduleId: moduleParam, lessonId } = useLocalSearchParams<{ courseId: string; moduleId: string; lessonId?: string }>();
  const { c: t } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const info = useMemo(() => courseAdmin.lesson(userId, courseId, lessonId), [userId, courseId, lessonId]);
  const existing = info?.lesson ?? null;

  const [moduleId, setModuleId] = useState(info?.module?.id ?? moduleParam);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [desc, setDesc] = useState(existing?.description ?? '');
  const [kind, setKind] = useState<Kind>(existing?.type === 'pdf' ? 'pdf' : 'video');
  const [file, setFile] = useState<{ name: string; sizeMb: number; durationSec?: number } | null>(
    existing && (existing.durationSec || existing.sizeMb) ? { name: existing.type === 'pdf' ? `${existing.title}.pdf` : `${existing.title}.mp4`, sizeMb: existing.sizeMb ?? Math.round((existing.durationSec ?? 600) / 2.2), durationSec: existing.durationSec } : null,
  );
  const [progress, setProgress] = useState<number | null>(null);
  const [resources, setResources] = useState(existing?.resources ?? []);
  const [preview, setPreview] = useState(!!existing?.preview);
  const [completion, setCompletion] = useState<Lesson['completion']>(existing?.completion ?? 'watch_90');
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!info) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.ivory, padding: 20, justifyContent: 'center', gap: 16 }}>
        <Banner text="You can’t edit lessons in this course." />
        <Button title="Go back" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }
  const { course } = info;
  const module = course.modules.find((m) => m.id === moduleId);
  const space = courseAdmin.canUpload(userId, 0);

  const pick = async (purpose: 'main' | 'resource') => {
    setErr(null);
    const want = purpose === 'main' ? kind : 'pdf';
    let name = '';
    let sizeMb = 0;
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: want === 'video' ? 'video/*' : 'application/pdf', copyToCacheDirectory: false });
      if (r.canceled) return;
      name = r.assets[0].name;
      sizeMb = Math.max(0.2, Math.round(((r.assets[0].size ?? 0) / 1048576) * 10) / 10);
    } catch {
      // Picker unavailable in some preview frames → use a sample file so the flow can be tested.
      name = want === 'video' ? `${(title || 'lesson').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.mp4` : 'lesson-notes.pdf';
      sizeMb = want === 'video' ? 180 + Math.round(Math.random() * 260) : 1.6;
    }
    if (!sizeMb || sizeMb < 0.3) sizeMb = want === 'video' ? 220 : 1.2; // tiny/unknown test files
    if (want === 'video' && sizeMb > 2048) return setErr({ field: 'file', msg: 'Videos can be up to 2 GB. Export at 1080p or lower and try again.' });
    if (purpose === 'resource') {
      if (sizeMb > 50) return setErr({ msg: 'Resources can be up to 50 MB.' });
      setResources((r) => [...r, { name, sizeMb }]);
      return;
    }
    setProgress(0);
    try {
      const res = await courseAdmin.upload(userId, want, name, sizeMb, setProgress);
      setFile({ name: res.fileName, sizeMb: res.sizeMb, durationSec: res.durationSec });
    } catch (e) {
      setErr({ field: 'file', msg: (e as ApiError).message });
    } finally {
      setProgress(null);
    }
  };

  const save = (andNext: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      courseAdmin.saveLesson(userId, course.id, moduleId, {
        id: existing?.id,
        title,
        description: desc.trim() || undefined,
        type: kind,
        durationSec: kind === 'video' ? file?.durationSec : undefined,
        sizeMb: kind === 'pdf' ? file?.sizeMb : undefined,
        preview,
        resources,
        completion: kind === 'video' ? completion : 'manual',
      });
      if (andNext) router.replace({ pathname: '/edu/lesson', params: { courseId: course.id, moduleId } });
      else router.back();
    } catch (e) {
      const a = e as ApiError;
      setErr({ field: a.field, msg: a.message });
    } finally {
      setBusy(false);
    }
  };

  const go = (dir: -1 | 1) => {
    const n = info.flat[info.index + dir];
    if (n) router.replace({ pathname: '/edu/lesson', params: { courseId: course.id, moduleId: n.m.id, lessonId: n.l.id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.top}>
          <IconButton icon="close" label="Close without saving" tone="filled" onPress={() => router.back()} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="heading">{existing ? 'Edit lesson' : 'Add lesson'}</Txt>
            <Txt variant="caption" color={t.muted} numberOfLines={1}>{course.title || 'Untitled course'}</Txt>
          </View>
          {existing && (
            <View style={styles.nav}>
              <IconButton icon="chevron-back" label="Previous lesson" onPress={() => go(-1)} />
              <Txt variant="caption" style={{ fontWeight: '700' }}>{info.index + 1} / {info.total}</Txt>
              <IconButton icon="chevron-forward" label="Next lesson" onPress={() => go(1)} />
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.inner}>
            {err && !err.field && <Banner text={err.msg} />}

            <View style={[styles.section, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Txt variant="label">Module</Txt>
              <View style={styles.wrap}>
                {course.modules.map((m, i) => <Chip key={m.id} label={`${i + 1}. ${m.title}`} active={m.id === moduleId} onPress={() => setModuleId(m.id)} />)}
              </View>
              <TextField label="Lesson title *" placeholder="e.g. What is Digital Marketing?" value={title} onChangeText={(v) => { setTitle(v.slice(0, 150)); setErr(null); }} error={err?.field === 'title' ? err.msg : null} hint={`${title.length} / 150`} />
              <View style={{ gap: 6 }}>
                <Txt variant="label">Description</Txt>
                <TextInput value={desc} onChangeText={(v) => setDesc(v.slice(0, 2000))} multiline placeholder="What this lesson covers, in one or two lines." placeholderTextColor={t.muted} accessibilityLabel="Lesson description" style={[styles.area, { borderColor: t.border, backgroundColor: t.surfaceMuted, color: t.ink }]} />
              </View>
            </View>

            <View style={[styles.section, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Txt variant="heading">Lesson content</Txt>
              <View style={styles.wrap}>
                <Chip label="Video" icon="play-circle-outline" active={kind === 'video'} onPress={() => { if (kind !== 'video') { setKind('video'); setFile(null); } }} />
                <Chip label="Document (PDF)" icon="document-text-outline" active={kind === 'pdf'} onPress={() => { if (kind !== 'pdf') { setKind('pdf'); setFile(null); } }} />
                <Chip label="Quiz" icon="help-circle-outline" onPress={() => router.push({ pathname: '/edu/assess/new', params: { kind: 'quiz', courseId } })} />
              </View>

              {progress != null ? (
                <View style={[styles.upload, { borderColor: t.primary, backgroundColor: t.primarySoft }]}>
                  <Ionicons name="cloud-upload" size={30} color={t.primary} />
                  <Txt variant="bodyStrong">Uploading… {progress}%</Txt>
                  <View style={{ flexDirection: 'row', width: '100%' }}><ProgressBar pct={progress} color={t.primary} height={8} /></View>
                  <Txt variant="caption" color={t.muted}>Keep this screen open. You can keep editing the title and description.</Txt>
                </View>
              ) : file ? (
                <View style={[styles.fileCard, { borderColor: t.border }]}>
                  <View style={[styles.fileIcon, { backgroundColor: kind === 'video' ? t.primarySoft : t.dangerBg }]}>
                    <Ionicons name={kind === 'video' ? 'film' : 'document-text'} size={24} color={kind === 'video' ? t.primary : t.danger} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="label" numberOfLines={1}>{file.name}</Txt>
                    <Txt variant="caption" color={t.muted}>{kind === 'video' && file.durationSec ? `${fmt(file.durationSec)} · ` : ''}{file.sizeMb >= 1 ? `${Math.round(file.sizeMb * 10) / 10} MB` : `${Math.round(file.sizeMb * 1024)} KB`}</Txt>
                    <Pill text={kind === 'video' ? 'Processed · ready' : 'Ready'} tone="success" icon="checkmark" />
                  </View>
                  <View style={{ gap: 4 }}>
                    <Button title="Replace" variant="soft" size="md" onPress={() => pick('main')} />
                  </View>
                </View>
              ) : (
                <Pressable onPress={() => pick('main')} disabled={!space.ok} style={[styles.upload, { borderColor: space.ok ? t.primary : t.danger, backgroundColor: space.ok ? t.primarySoft : t.dangerBg }]} accessibilityRole="button" accessibilityLabel={kind === 'video' ? 'Choose a video to upload' : 'Choose a PDF to upload'}>
                  <Ionicons name="cloud-upload-outline" size={32} color={space.ok ? t.primary : t.danger} />
                  <Txt variant="bodyStrong">{kind === 'video' ? 'Choose video' : 'Choose PDF'}</Txt>
                  <Txt variant="caption" color={t.muted}>{kind === 'video' ? 'MP4, MOV or WEBM · up to 2 GB' : 'PDF · up to 50 MB'}</Txt>
                </Pressable>
              )}
              {err?.field === 'file' && <Banner text={err.msg} />}
              <Txt variant="caption" color={space.ok ? t.muted : t.danger}>
                {space.ok ? (space.leftGb == null ? 'Storage: no limit on your plan.' : `${space.leftGb} GB storage left on your plan.`) : space.message}
              </Txt>
            </View>

            <View style={[styles.section, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Txt variant="heading" style={{ flex: 1 }}>Extra resources</Txt>
                <Button title="Attach PDF" iconLeft="attach" variant="soft" size="md" onPress={() => pick('resource')} />
              </View>
              {resources.length === 0 ? (
                <Txt variant="caption" color={t.muted}>Notes, templates or worksheets learners can download.</Txt>
              ) : (
                resources.map((r, i) => (
                  <View key={`${r.name}${i}`} style={[styles.res, { borderColor: t.border }]}>
                    <Ionicons name="document-attach" size={22} color={t.danger} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="label" numberOfLines={1}>{r.name}</Txt>
                      <Txt variant="caption" color={t.muted}>PDF · {r.sizeMb} MB</Txt>
                    </View>
                    <IconButton icon="trash-outline" label={`Remove ${r.name}`} onPress={() => setResources((x) => x.filter((_, j) => j !== i))} />
                  </View>
                ))
              )}
            </View>

            <View style={[styles.section, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Txt variant="heading">Settings</Txt>
              <Pressable onPress={() => setPreview((p) => !p)} style={styles.toggleRow} accessibilityRole="switch" accessibilityState={{ checked: preview }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong">Free preview</Txt>
                  <Txt variant="caption" color={t.muted}>Anyone can watch this lesson before enrolling.</Txt>
                </View>
                <Switch value={preview} onValueChange={setPreview} trackColor={{ true: t.primary, false: t.borderStrong }} thumbColor="#fff" />
              </Pressable>
              {kind === 'video' && (
                <View style={{ gap: 8 }}>
                  <Txt variant="label">Marked complete when</Txt>
                  <View style={styles.wrap}>
                    <Chip label="90% watched" active={completion === 'watch_90'} onPress={() => setCompletion('watch_90')} />
                    <Chip label="Learner taps “Mark done”" active={completion === 'manual'} onPress={() => setCompletion('manual')} />
                  </View>
                </View>
              )}
            </View>
          </View>
        </ScrollView>

        <View style={[styles.bar, { backgroundColor: t.surface, borderTopColor: t.border }]}>
          <View style={styles.barInner}>
            {existing && (
              <Pressable onPress={() => setConfirmDelete(true)} style={[styles.round, { borderColor: t.border }]} accessibilityRole="button" accessibilityLabel="Delete lesson">
                <Ionicons name="trash-outline" size={22} color={t.danger} />
              </Pressable>
            )}
            <Button title="Save" variant="outline" style={{ flex: 1 }} disabled={progress != null} loading={busy} onPress={() => save(false)} />
            <Button title="Save & add next" iconRight="add" style={{ flex: 1.5 }} disabled={progress != null} onPress={() => save(true)} />
          </View>
        </View>
      </SafeAreaView>

      <BottomSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete lesson?"
        footer={
          <>
            <Button title="Keep" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setConfirmDelete(false)} />
            <Button title="Delete" size="md" style={{ flex: 1, backgroundColor: t.danger }} onPress={() => { courseAdmin.deleteLesson(userId, course.id, existing!.id); setConfirmDelete(false); router.back(); }} />
          </>
        }
      >
        <Txt color={t.inkSoft}>“{existing?.title}” will be removed from {module?.title ?? 'this module'}. Its storage is freed.</Txt>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 6 },
  nav: { flexDirection: 'row', alignItems: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 120, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  section: { padding: 16, borderRadius: radius.lg, borderWidth: 1, gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  area: { minHeight: 90, borderWidth: 1.2, borderRadius: radius.md, padding: 12, fontSize: 15, textAlignVertical: 'top', outlineStyle: 'none' } as any,
  upload: { alignItems: 'center', gap: 6, padding: 22, borderRadius: radius.lg, borderWidth: 1.6, borderStyle: 'dashed' },
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: 1 },
  fileIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  res: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, borderRadius: radius.md, borderWidth: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, alignItems: 'center' },
  barInner: { width: '100%', maxWidth: layout.contentMaxWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 54, height: 54, borderRadius: 27, borderWidth: 1.2, alignItems: 'center', justifyContent: 'center' },
});
