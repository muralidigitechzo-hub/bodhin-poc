/**
 * Course Builder — one screen, four steps: Details · Content · Pricing & where to sell · Publish.
 * Saves on every step. Private courses go live instantly; marketplace listings go to Bodhin review.
 * Owners and tutors both manage details, content, pricing, where to sell and publishing for their courses.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Switch, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, COVER_ICONS, COVER_PRESETS, catalog, courseAdmin, platform } from '@/api/client';
import { FORMAT_LABEL, LEVEL_LABEL, allLessons, courseRef, inr, type Course, type Format, type Level } from '@/core/catalog';
import { paymentRoute, splitOrder } from '@/core/business';
import { coursesHome, useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, IconButton, Pill } from '@/ui/kit';
import { Banner, Checkbox } from '@/ui/misc';
import { CourseArt } from '@/ui/course';
import { STATE_META } from '@/ui/courseState';

const STEPS = ['Details', 'Content', 'Pricing', 'Publish'] as const;
const LANGS = ['English', 'Tamil', 'Hindi', 'Telugu', 'Malayalam', 'Kannada'];
const fmtDur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${Math.round(s / 60)} min`);

export default function CourseBuilder() {
  const { isDesktop } = useLayout();
  const { id, step: stepParam } = useLocalSearchParams<{ id: string; step?: string }>();
  const { c: t } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [step, setStep] = useState(Number(stepParam ?? 0));
  const [c, setC] = useState<Course | null>(null);
  const [meta, setMeta] = useState<ReturnType<typeof courseAdmin.get>>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | ReturnType<typeof courseAdmin.get>>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);

  const load = useCallback(() => {
    const m = courseAdmin.get(userId, id);
    setMeta(m);
    setC(m ? m.course : null);
  }, [userId, id]);
  useFocusEffect(load);

  const flash = (x: string, ms = 2000) => {
    setToast(x);
    setTimeout(() => setToast(null), ms);
  };

  if (!meta || !c) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.ivory, padding: 20, gap: 16, justifyContent: 'center' }}>
        <Banner text="This course isn’t available to you." />
        <Button title="Back to courses" onPress={() => router.replace(coursesHome(session) as never)} />
      </SafeAreaView>
    );
  }
  const owner = meta.role === 'owner' || meta.role === 'tutor'; // tutors price, choose where to sell and publish their own courses
  const set = (patch: Partial<Course>) => {
    setC((x) => (x ? { ...x, ...patch } : x));
    setErr(null);
  };

  /** Save fields this role may change for the current step. */
  const save = (silent = false) => {
    try {
      const base: Partial<Course> = { title: c.title, subtitle: c.subtitle, description: c.description, categoryId: c.categoryId, level: c.level, language: c.language, art: c.art, outcomes: c.outcomes.filter((o) => o.trim()) };
      const pricing: Partial<Course> = owner ? { priceInr: c.priceInr, compareAtInr: c.compareAtInr, offerEndsAt: c.offerEndsAt, format: c.format, accessMonths: c.accessMonths, drip: c.drip, ...(meta.state === 'draft' ? { visibility: c.visibility } : {}) } : {};
      const saved = courseAdmin.update(userId, c.id, { ...base, ...pricing });
      setC(saved);
      if (!silent) flash('Saved');
      return true;
    } catch (e) {
      setErr((e as ApiError).message);
      return false;
    }
  };

  const validate = (s: number): string | null => {
    if (s === 0) {
      if (c.title.trim().length < 5) return 'Add a course title (5+ characters).';
      if (!c.categoryId) return 'Choose a category.';
      if (c.description.trim().length < 50) return 'Write a description of at least 50 characters.';
    }
    if (s === 2 && owner) {
      if (c.priceInr !== 0 && c.priceInr < 99) return 'Set a price of at least ₹99, or make the course free.';
      if (c.compareAtInr && c.compareAtInr <= c.priceInr) return 'The original price must be higher than the selling price.';
      if (c.compareAtInr && !c.offerEndsAt) return 'Pick when the offer ends. A crossed-out price needs a real deadline.';
    }
    return null;
  };

  const next = () => {
    const v = validate(step);
    if (v) return setErr(v);
    if (!save(true)) return;
    setStep((s) => Math.min(3, s + 1));
  };

  const publish = async () => {
    if (c.visibility !== 'private' && !agree) return setErr('Tick the marketplace guidelines box to submit the listing.');
    if (!save(true)) return;
    setBusy(true);
    try {
      await courseAdmin.publish(userId, c.id);
      const m = courseAdmin.get(userId, c.id);
      setMeta(m);
      setC(m!.course);
      // Close the builder and land on the course list, which shows the new status.
      const msg = m?.state === 'in_review' ? 'Submitted. Bodhin will review it and it will show as Published once approved.' : 'Course published.';
      router.replace({ pathname: coursesHome(session) as never, params: { msg } });
    } catch (e) {
      setErr((e as ApiError).message);
      flash((e as ApiError).message, 6000); // the banner is at the top of the page, so also show it here
    } finally {
      setBusy(false);
    }
  };

  const exit = () => {
    save(true);
    router.canGoBack() ? router.back() : router.replace(coursesHome(session) as never);
  };

  // Back · Save · Next/Publish — pinned bar on phones, inline under the form on desktop.
  const navBar = (
    <>
    {step > 0 ? (
      <Pressable onPress={() => { save(true); setStep(step - 1); }} style={[styles.round, { borderColor: t.border }]} accessibilityRole="button" accessibilityLabel="Previous step">
        <Ionicons name="chevron-back" size={22} color={t.ink} />
      </Pressable>
    ) : null}
    <Button title="Save" variant="outline" iconLeft="save-outline" style={{ flex: 1 }} onPress={() => save()} />
    {step < 3 ? (
      <Button title={`Next: ${STEPS[step + 1]}`} iconRight="arrow-forward" style={{ flex: 1.6 }} onPress={next} />
    ) : owner && meta.state === 'draft' ? (
      <Button title={c.visibility === 'private' ? 'Publish' : 'Publish & submit'} iconRight="rocket-outline" loading={busy} style={{ flex: 1.6 }} onPress={publish} />
    ) : (
      <Button title="Done" iconRight="checkmark" style={{ flex: 1.6 }} onPress={() => { save(true); router.replace(coursesHome(session) as never); }} />
    )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={[styles.top, isDesktop && { paddingHorizontal: 24, paddingVertical: 14 }]}>
          <IconButton icon="chevron-back" label="Save and go back" tone="filled" onPress={exit} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="heading" numberOfLines={1}>{c.title || 'New course'}</Txt>
            <Pill text={STATE_META[meta.state].label} tone={STATE_META[meta.state].tone} />
          </View>
          <IconButton icon="eye-outline" label="Preview as a student" tone="filled" onPress={() => { save(true); router.push({ pathname: '/course/[id]', params: { id: c.id } }); }} />
        </View>

        <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column' }}>
        {/* stepper (desktop: vertical step list on the left) */}
        <View style={isDesktop ? [styles.stepCol, { borderRightColor: t.border }] : styles.stepper} accessibilityRole="tablist">
          {STEPS.map((s, i) => {
            const on = i === step;
            const past = i < step;
            return (
              <Pressable key={s} onPress={() => { if (i > step) { const v = validate(step); if (v) return setErr(v); } save(true); setStep(i); }} style={isDesktop ? [styles.stepRow, on && { backgroundColor: t.primarySoft }] : styles.stepItem} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <View style={[styles.stepDot, { backgroundColor: on ? t.primary : past ? t.success : t.surface, borderColor: on ? t.primary : past ? t.success : t.borderStrong }]}>
                  {past ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Txt variant="caption" color={on ? '#fff' : t.muted} style={{ fontWeight: '800' }}>{i + 1}</Txt>}
                </View>
                <Txt variant="caption" color={on ? t.primary : t.inkSoft} style={{ fontWeight: on ? '800' : '600' }}>{s}</Txt>
              </Pressable>
            );
          })}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.scroll, isDesktop && { paddingHorizontal: 32, paddingTop: 8, paddingBottom: 48 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.inner, isDesktop && { maxWidth: 860 }]}>
            {err && <Banner text={err} />}
            {step === 0 && <Details c={c} set={set} userId={userId} />}
            {step === 1 && <Content c={c} userId={userId} reload={load} onError={setErr} />}
            {step === 2 && (owner ? <Pricing c={c} set={set} state={meta.state} payReady={meta.ctx.tenant.payments?.directGatewayStatus === 'active'} host={meta.ctx.host} /> : <OwnerOnly />)}
            {step === 3 && <Publish c={c} set={set} meta={meta} owner={owner} goStep={setStep} agree={agree || meta.state !== 'draft'} setAgree={setAgree} />}
            {isDesktop && <View style={[styles.barInner, { maxWidth: undefined, marginTop: 12 }]}>{navBar}</View>}
          </View>
        </ScrollView>
        </View>

        {!isDesktop && (
          <View style={[styles.bar, { backgroundColor: t.surface, borderTopColor: t.border }]}>
            <View style={styles.barInner}>{navBar}</View>
          </View>
        )}
        {toast && (
          <View style={[styles.toast, { backgroundColor: t.ink }]} accessibilityLiveRegion="polite">
            <Txt variant="label" color="#fff">{toast}</Txt>
          </View>
        )}
      </SafeAreaView>

      <BottomSheet
        open={!!done}
        onClose={() => setDone(null)}
        title={done?.state === 'in_review' ? 'Published · in review' : 'Course published'}
        footer={
          <>
            <Button title="Share link" variant="outline" iconLeft="link-outline" size="md" style={{ flex: 1 }} onPress={() => { const url = `https://${meta.ctx.host}/course/${courseRef(c)}`; Share.share({ message: `${c.title}
${url}`, url }).catch(() => flash(`Link: ${url}`)); }} />
            <Button title="Preview" variant="outline" size="md" style={{ flex: 1 }} onPress={() => { setDone(null); router.push({ pathname: '/course/[id]', params: { id: c.id } }); }} />
            <Button title="My courses" size="md" style={{ flex: 1 }} onPress={() => { setDone(null); router.replace(coursesHome(session) as never); }} />
          </>
        }
      >
        <View style={{ alignItems: 'center', gap: 10 }}>
          <View style={[styles.okIcon, { backgroundColor: t.successBg }]}>
            <Ionicons name="rocket" size={36} color={t.success} />
          </View>
          <Txt center color={t.inkSoft}>
            {done?.state === 'in_review'
              ? `“${c.title}” is live on ${meta.ctx.host} now. Bodhin will review the marketplace listing within 24–48 hours and notify you.`
              : `“${c.title}” is live on ${meta.ctx.host}. Share the link with your students.`}
          </Txt>
        </View>
      </BottomSheet>
    </View>
  );
}

/* ───────── Step 1: Details ───────── */
function Details({ c, set, userId }: { c: Course; set: (p: Partial<Course>) => void; userId: string }) {
  const { c: t } = useTheme();
  const cats = catalog.allCategories().filter((k) => k.id !== 'all');
  const outcomes = c.outcomes.length ? c.outcomes : [''];
  const [newCat, setNewCat] = useState<string | null>(null); // null = closed
  const [catErr, setCatErr] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const addCat = () => {
    try {
      set({ categoryId: catalog.addCategory(userId, newCat ?? '') });
      setNewCat(null);
      setCatErr(null);
    } catch (e) {
      setCatErr((e as ApiError).message);
    }
  };
  const pickImage = async () => {
    setImgErr(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], multiple: false, copyToCacheDirectory: true });
      if (r.canceled) return;
      const f = r.assets[0];
      if (f.size && f.size > 1.5 * 1024 * 1024) return setImgErr('Image is too large. Use a JPG, PNG or WebP under 1.5 MB.');
      let uri = f.uri;
      if (Platform.OS === 'web') {
        // blob: URLs die on reload, so keep the picture itself.
        const blob = await (await fetch(f.uri)).blob();
        uri = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.onerror = () => rej(new Error('read'));
          fr.readAsDataURL(blob);
        });
      }
      set({ art: { ...c.art, image: uri } });
    } catch {
      setImgErr('Couldn’t read that image. Try another file.');
    }
  };
  return (
    <>
      <Section icon="information-circle-outline" title="Course details" sub="This is what learners see first.">
        <TextField label="Course title *" placeholder="e.g. Digital Marketing & AI Mastery" value={c.title} onChangeText={(v) => set({ title: v.slice(0, 100) })} hint={`${c.title.length} / 100`} />
        <TextField label="Subtitle" placeholder="One line on what learners achieve" value={c.subtitle} onChangeText={(v) => set({ subtitle: v.slice(0, 150) })} hint={`${c.subtitle.length} / 150`} />
        <Field label="Category *">
          <View style={styles.wrap}>
            {cats.map((k) => <Chip key={k.id} label={k.name} icon={k.icon as any} active={c.categoryId === k.id} onPress={() => set({ categoryId: k.id })} />)}
            <Chip label="Add category" icon="add" active={newCat !== null} onPress={() => setNewCat(newCat === null ? '' : null)} />
          </View>
          {newCat !== null && (
            <View style={{ gap: 8 }}>
              <TextField label="New category name" placeholder="e.g. Java Programming" value={newCat} onChangeText={(v) => { setNewCat(v.slice(0, 40)); setCatErr(null); }} error={catErr ?? undefined} />
              <Button title="Add and select" size="md" iconLeft="add" onPress={addCat} />
            </View>
          )}
        </Field>
        <Field label="Level *">
          <View style={styles.wrap}>
            {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => <Chip key={l} label={LEVEL_LABEL[l]} active={c.level === l} onPress={() => set({ level: l })} />)}
          </View>
        </Field>
        <Field label="Teaching language *">
          <View style={styles.wrap}>
            {LANGS.map((l) => <Chip key={l} label={l} active={(c.language ?? 'English') === l} onPress={() => set({ language: l })} />)}
          </View>
        </Field>
        <Field label="Description *">
          <TextInput value={c.description} onChangeText={(v) => set({ description: v.slice(0, 2000) })} multiline placeholder="What will learners be able to do after this course? Who is it for? Any prerequisites?" placeholderTextColor={t.muted} accessibilityLabel="Course description" style={[styles.area, { borderColor: t.border, backgroundColor: t.surfaceMuted, color: t.ink }]} />
          <Txt variant="caption" color={c.description.length < 50 ? t.warning : t.muted} style={{ alignSelf: 'flex-end' }}>{c.description.length < 50 ? `${50 - c.description.length} more characters needed` : `${c.description.length} / 2000`}</Txt>
        </Field>
      </Section>

      <Section icon="image-outline" title="Cover" sub="Shown on cards and the course page.">
        <CourseArt course={c} height={150} rounded={18} showTitle />
        <Field label="Thumbnail image">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={c.art.image ? 'Change image' : 'Upload image'} variant="outline" size="md" iconLeft="cloud-upload-outline" style={{ flex: 1 }} onPress={pickImage} />
            {c.art.image && <Button title="Remove" variant="outline" size="md" onPress={() => set({ art: { from: c.art.from, to: c.art.to, icon: c.art.icon } })} />}
          </View>
          {imgErr && <Txt variant="caption" color={t.danger}>{imgErr}</Txt>}
          <Txt variant="caption" color={t.muted}>Best at 1280 × 720. JPG, PNG or WebP, under 1.5 MB. Without an image, the colour and icon below are used.</Txt>
        </Field>
        <Field label="Colour">
          <View style={styles.wrap}>
            {COVER_PRESETS.map((p) => {
              const on = c.art.from === p.from && c.art.to === p.to;
              return (
                <Pressable key={p.from} onPress={() => set({ art: { ...c.art, ...p } })} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel="Cover colour" style={[styles.swatch, { borderColor: on ? t.ink : 'transparent' }]}>
                  <View style={{ flex: 1, borderRadius: 10, overflow: 'hidden', flexDirection: 'row' }}>
                    <View style={{ flex: 1, backgroundColor: p.from }} />
                    <View style={{ flex: 1, backgroundColor: p.to }} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Field>
        <Field label="Icon">
          <View style={styles.wrap}>
            {COVER_ICONS.map((i) => {
              const on = c.art.icon === i;
              return (
                <Pressable key={i} onPress={() => set({ art: { ...c.art, icon: i } })} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={i} style={[styles.iconPick, { borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : t.surface }]}>
                  <Ionicons name={i as any} size={22} color={on ? t.primary : t.inkSoft} />
                </Pressable>
              );
            })}
          </View>
        </Field>
      </Section>

      <Section icon="flag-outline" title="What learners will get" sub="Add 3–6 outcomes. Start each with a verb.">
        {outcomes.map((o, i) => (
          <View key={i} style={styles.outRow}>
            <Ionicons name="checkmark-circle" size={20} color={o.trim() ? t.success : t.borderStrong} />
            <TextInput value={o} onChangeText={(v) => set({ outcomes: outcomes.map((x, j) => (j === i ? v.slice(0, 90) : x)) })} placeholder={['Run a Google Ads campaign', 'Plan a month of content', 'Read an analytics report'][i] ?? 'Another outcome'} placeholderTextColor={t.muted} accessibilityLabel={`Outcome ${i + 1}`} style={[styles.outInput, { color: t.ink, borderColor: t.border }]} />
            <IconButton icon="trash-outline" label={`Remove outcome ${i + 1}`} onPress={() => set({ outcomes: outcomes.filter((_, j) => j !== i) })} />
          </View>
        ))}
        {outcomes.length < 6 && <Button title="Add outcome" iconLeft="add" variant="soft" size="md" onPress={() => set({ outcomes: [...outcomes, ''] })} />}
        <Txt variant="caption" color={outcomes.filter((o) => o.trim()).length >= 3 ? t.success : t.muted}>{outcomes.filter((o) => o.trim()).length} of 3 minimum</Txt>
      </Section>
    </>
  );
}

/* ───────── Step 2: Content ───────── */
function Content({ c, userId, reload, onError }: { c: Course; userId: string; reload: () => void; onError: (e: string) => void }) {
  const { c: t } = useTheme();
  const [open, setOpen] = useState<Set<string>>(() => new Set(c.modules.map((m) => m.id)));
  const [sheet, setSheet] = useState<null | { mode: 'add' } | { mode: 'rename'; id: string; title: string } | { mode: 'delete'; id: string; title: string }>(null);
  const [name, setName] = useState('');
  const lessons = allLessons(c);
  const dur = lessons.reduce((s, l) => s + (l.durationSec ?? 0), 0);
  const resources = lessons.filter((l) => l.type === 'pdf').length + lessons.reduce((s, l) => s + (l.resources?.length ?? 0), 0);
  const run = (fn: () => void) => {
    try {
      fn();
      reload();
      setSheet(null);
    } catch (e) {
      onError((e as ApiError).message);
      setSheet(null);
    }
  };
  const openLesson = (moduleId: string, lessonId?: string) => router.push({ pathname: '/edu/lesson', params: { courseId: c.id, moduleId, ...(lessonId ? { lessonId } : {}) } });

  return (
    <>
      <View style={[styles.statsRow, { backgroundColor: t.surface, borderColor: t.border }]}>
        {([['layers-outline', c.modules.length, 'Modules'], ['play-circle-outline', lessons.length, 'Lessons'], ['time-outline', fmtDur(dur), 'Duration'], ['document-text-outline', resources, 'Resources']] as const).map(([i, v, l]) => (
          <View key={l} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Ionicons name={i} size={20} color={t.primary} />
            <Txt variant="bodyStrong">{String(v)}</Txt>
            <Txt variant="caption" color={t.muted}>{l}</Txt>
          </View>
        ))}
      </View>

      {c.modules.map((m, mi) => {
        const isOpen = open.has(m.id);
        const mDur = m.lessons.reduce((s, l) => s + (l.durationSec ?? 0), 0);
        return (
          <View key={m.id} style={[styles.module, { backgroundColor: t.surface, borderColor: m.lessons.length ? t.border : t.warning }]}>
            <View style={styles.modHead}>
              <Pressable onPress={() => setOpen((s) => { const n = new Set(s); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minHeight: 48 }} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
                <View style={[styles.modNo, { backgroundColor: t.primarySoft }]}><Txt variant="label" color={t.primary}>{mi + 1}</Txt></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" numberOfLines={2}>{m.title}</Txt>
                  <Txt variant="caption" color={m.lessons.length ? t.muted : t.warning}>{m.lessons.length ? `${m.lessons.length} lessons · ${fmtDur(mDur)}` : 'No lessons yet'}</Txt>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={t.muted} />
              </Pressable>
            </View>
            {isOpen && (
              <>
                {m.lessons.map((l, li) => (
                  <View key={l.id} style={[styles.lesson, { borderTopColor: t.border }]}>
                    <Pressable onPress={() => openLesson(m.id, l.id)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 }} accessibilityRole="button" accessibilityLabel={`Edit lesson ${l.title}`}>
                      <Ionicons name={l.type === 'video' ? 'play-circle-outline' : l.type === 'pdf' ? 'document-text-outline' : 'help-circle-outline'} size={24} color={t.inkSoft} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt variant="label" numberOfLines={2}>{li + 1}. {l.title}</Txt>
                        <Txt variant="caption" color={t.muted}>{l.type === 'video' ? `Video · ${fmtDur(l.durationSec ?? 0)}` : l.type === 'pdf' ? `PDF · ${l.sizeMb} MB` : `Quiz · ${l.questions} questions`}{l.preview ? ' · Free preview' : ''}</Txt>
                      </View>
                    </Pressable>
                    <View style={{ flexDirection: 'row' }}>
                      <IconButton icon="chevron-up" label="Move lesson up" onPress={() => run(() => courseAdmin.moveLesson(userId, c.id, m.id, l.id, -1))} />
                      <IconButton icon="chevron-down" label="Move lesson down" onPress={() => run(() => courseAdmin.moveLesson(userId, c.id, m.id, l.id, 1))} />
                    </View>
                  </View>
                ))}
                <View style={[styles.modActions, { borderTopColor: t.border }]}>
                  <Pressable onPress={() => openLesson(m.id)} style={[styles.addLesson, { backgroundColor: t.primarySoft }]} accessibilityRole="button">
                    <Ionicons name="add" size={20} color={t.primary} />
                    <Txt variant="label" color={t.primary}>Add lesson</Txt>
                  </Pressable>
                  <IconButton icon="pencil-outline" label="Rename module" onPress={() => { setName(m.title); setSheet({ mode: 'rename', id: m.id, title: m.title }); }} />
                  <IconButton icon="arrow-up-outline" label="Move module up" onPress={() => run(() => courseAdmin.moveModule(userId, c.id, m.id, -1))} />
                  <IconButton icon="arrow-down-outline" label="Move module down" onPress={() => run(() => courseAdmin.moveModule(userId, c.id, m.id, 1))} />
                  <IconButton icon="trash-outline" label="Delete module" onPress={() => setSheet({ mode: 'delete', id: m.id, title: m.title })} />
                </View>
              </>
            )}
          </View>
        );
      })}

      <Button title="Add module" iconLeft="add-circle-outline" variant="outline" onPress={() => { setName(''); setSheet({ mode: 'add' }); }} />

      <View style={[styles.tips, { backgroundColor: t.accentSoft }]}>
        <Ionicons name="bulb-outline" size={20} color={t.warning} />
        <Txt variant="caption" color={t.inkSoft} style={{ flex: 1 }}>Keep lessons 5–20 minutes. Mark the first lesson as a free preview: it helps marketplace learners decide. Quizzes are added from the Quiz builder.</Txt>
      </View>

      <BottomSheet
        open={!!sheet && sheet.mode !== 'delete'}
        onClose={() => setSheet(null)}
        title={sheet?.mode === 'rename' ? 'Rename module' : 'Add module'}
        footer={<Button title={sheet?.mode === 'rename' ? 'Save' : 'Add module'} style={{ flex: 1 }} onPress={() => run(() => (sheet?.mode === 'rename' ? courseAdmin.renameModule(userId, c.id, sheet.id, name) : courseAdmin.addModule(userId, c.id, name)))} />}
      >
        <TextField label="Module name" placeholder="e.g. SEO Strategy & Tools" autoFocus value={name} onChangeText={setName} />
      </BottomSheet>
      <BottomSheet
        open={sheet?.mode === 'delete'}
        onClose={() => setSheet(null)}
        title="Delete module?"
        footer={
          <>
            <Button title="Keep" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setSheet(null)} />
            <Button title="Delete" size="md" style={{ flex: 1, backgroundColor: t.danger }} onPress={() => sheet?.mode === 'delete' && run(() => courseAdmin.deleteModule(userId, c.id, sheet.id))} />
          </>
        }
      >
        <Txt color={t.inkSoft}>“{sheet?.mode === 'delete' ? sheet.title : ''}” and its lessons will be removed from this course.</Txt>
      </BottomSheet>
    </>
  );
}

/* ───────── Step 3: Pricing & where to sell ───────── */
function Pricing({ c, set, state, payReady, host }: { c: Course; set: (p: Partial<Course>) => void; state: string; payReady: boolean; host: string }) {
  const { c: t } = useTheme();
  const cfg = platform.config();
  const [isPaid, setPaid] = useState(c.priceInr > 0);
  const [priceText, setPriceText] = useState(c.priceInr ? String(c.priceInr) : '');
  const [offer, setOffer] = useState(!!c.compareAtInr);
  const [cmpText, setCmpText] = useState(c.compareAtInr ? String(c.compareAtInr) : '');
  useEffect(() => {
    if (!isPaid) set({ priceInr: 0, compareAtInr: undefined, offerEndsAt: undefined });
    else set({ priceInr: Number(priceText) || 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaid]);
  const pct = c.compareAtInr && c.priceInr ? Math.round((1 - c.priceInr / c.compareAtInr) * 100) : 0;
  const direct = splitOrder(c.priceInr, paymentRoute(c.tenantId, c.tenantId, cfg), cfg);
  const market = splitOrder(c.priceInr, paymentRoute(c.tenantId, null, cfg), cfg);
  const published = state !== 'draft';
  const endIn = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
  };

  return (
    <>
      <Section icon="pricetag-outline" title="Price" sub="Prices include GST. Learners see the full price before paying.">
        <View style={styles.twoCards}>
          {([[true, 'cash-outline', 'Paid', 'One-time fee for full access'], [false, 'gift-outline', 'Free', 'Anyone in your workspace can join']] as const).map(([v, icon, l, sub]) => (
            <Pressable key={l} onPress={() => setPaid(v)} style={[styles.choice, { borderColor: isPaid === v ? t.primary : t.border, backgroundColor: isPaid === v ? t.primarySoft : t.surface }, isPaid === v && { borderWidth: 2 }]} accessibilityRole="radio" accessibilityState={{ checked: isPaid === v }}>
              <Ionicons name={icon} size={24} color={t.primary} />
              <Txt variant="bodyStrong">{l}</Txt>
              <Txt variant="caption" color={t.muted}>{sub}</Txt>
            </Pressable>
          ))}
        </View>
        {isPaid && (
          <>
            <TextField label="Selling price (₹) *" prefix="₹" keyboardType="number-pad" placeholder="17500" value={priceText} onChangeText={(v) => { const n = v.replace(/\D/g, '').slice(0, 7); setPriceText(n); set({ priceInr: Number(n) || 0 }); }} />
            <Pressable onPress={() => { const on = !offer; setOffer(on); if (!on) { setCmpText(''); set({ compareAtInr: undefined, offerEndsAt: undefined }); } }} style={styles.toggleRow} accessibilityRole="switch" accessibilityState={{ checked: offer }}>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">Limited-time offer</Txt>
                <Txt variant="caption" color={t.muted}>Show the original price crossed out until a real end date.</Txt>
              </View>
              <Switch value={offer} onValueChange={(v) => { setOffer(v); if (!v) { setCmpText(''); set({ compareAtInr: undefined, offerEndsAt: undefined }); } }} trackColor={{ true: t.primary, false: t.borderStrong }} thumbColor="#fff" />
            </Pressable>
            {offer && (
              <>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
                  <View style={{ flex: 1 }}>
                    <TextField label="Original price (₹)" prefix="₹" keyboardType="number-pad" placeholder="24500" value={cmpText} onChangeText={(v) => { const n = v.replace(/\D/g, '').slice(0, 7); setCmpText(n); set({ compareAtInr: Number(n) || undefined }); }} />
                  </View>
                  {pct > 0 && <View style={{ marginBottom: 12 }}><Pill text={`${pct}% OFF`} tone="success" icon="pricetag" /></View>}
                </View>
                <Field label="Offer ends *">
                  <View style={styles.wrap}>
                    {[7, 14, 30].map((d) => {
                      const iso = endIn(d);
                      const on = !!c.offerEndsAt && Math.abs(new Date(c.offerEndsAt).getTime() - new Date(iso).getTime()) < 864e5 / 2;
                      return <Chip key={d} label={`${d} days`} active={on} onPress={() => set({ offerEndsAt: iso })} />;
                    })}
                  </View>
                  {c.offerEndsAt && <Txt variant="caption" color={t.inkSoft}>Ends {new Date(c.offerEndsAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}. After that the normal price shows automatically.</Txt>}
                </Field>
              </>
            )}
          </>
        )}
      </Section>

      <Section icon="layers-outline" title="Delivery & access">
        <Field label="How it’s taught">
          <View style={styles.wrap}>
            {(['recorded', 'live', 'hybrid'] as Format[]).map((f) => <Chip key={f} label={FORMAT_LABEL[f]} icon={f === 'live' ? 'radio' : f === 'recorded' ? 'play-circle' : 'layers'} active={c.format === f} onPress={() => set({ format: f })} />)}
          </View>
        </Field>
        <Field label="Access after enrolling">
          <View style={styles.wrap}>
            {[3, 6, 12, null].map((m) => <Chip key={String(m)} label={m ? `${m} months` : 'Lifetime'} active={(c.accessMonths ?? null) === m} onPress={() => set({ accessMonths: m })} />)}
          </View>
        </Field>
        <Pressable onPress={() => set({ drip: { everyDays: c.drip?.everyDays ?? 7, enabled: !c.drip?.enabled } })} style={styles.toggleRow} accessibilityRole="switch" accessibilityState={{ checked: !!c.drip?.enabled }}>
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong">Release modules gradually</Txt>
            <Txt variant="caption" color={t.muted}>Unlock the next module on a schedule after enrolling.</Txt>
          </View>
          <Switch value={!!c.drip?.enabled} onValueChange={(v) => set({ drip: { everyDays: c.drip?.everyDays ?? 7, enabled: v } })} trackColor={{ true: t.primary, false: t.borderStrong }} thumbColor="#fff" />
        </Pressable>
        {c.drip?.enabled && (
          <View style={styles.wrap}>
            {[3, 7, 14].map((d) => <Chip key={d} label={`Every ${d} days`} active={c.drip?.everyDays === d} onPress={() => set({ drip: { enabled: true, everyDays: d } })} />)}
          </View>
        )}
      </Section>

      <Section icon="storefront-outline" title="Where to sell" sub="Private by default. Listing and promotion are separate choices you can change any time.">
        {published && <Banner tone="info" text="Change listing for a published course from My Courses → course menu." />}
        {([
          ['private', 'lock-closed-outline', 'Only my students', `Sell on ${host} and private links. You collect the payment directly. No commission.`],
          ['public', 'storefront-outline', 'Also list on Bodhin marketplace', 'Bodhin reviews it first (24–48 h). Sales made on Bodhin are collected by Bodhin and paid out to you after commission.'],
          ['public_promoted', 'megaphone-outline', 'List + allow Bodhin promotion', 'Bodhin may also feature it in campaigns and newsletters. Withdraw consent any time.'],
        ] as const).map(([v, icon, l, sub]) => {
          const on = c.visibility === v;
          return (
            <Pressable key={v} disabled={published} onPress={() => set({ visibility: v })} style={[styles.sell, { borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : t.surface, opacity: published && !on ? 0.5 : 1 }, on && { borderWidth: 2 }]} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: published }}>
              <Ionicons name={icon} size={24} color={t.primary} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{l}</Txt>
                <Txt variant="caption" color={t.inkSoft}>{sub}</Txt>
              </View>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? t.primary : t.borderStrong} />
            </Pressable>
          );
        })}
      </Section>

      {c.priceInr > 0 && (
        <Section icon="wallet-outline" title="What you receive" sub={`On a ${inr(c.priceInr)} sale`}>
          <Receive label="Sold on your site" sub="Paid straight to your gateway" amount={direct.educatorNet} tone={t.success} />
          {c.visibility !== 'private' && (
            <Receive label="Sold on Bodhin marketplace" sub={`${inr(market.gross)} − ${Math.round(cfg.commissionRate * 100)}% commission ${inr(market.commission)} − gateway fee ${inr(market.gatewayFee)}. Paid weekly after the ${cfg.refundHoldDays}-day refund window.`} amount={market.educatorNet} tone={t.accent} />
          )}
          {!payReady && <Banner text="Connect your payment gateway (More → Payments setup) before selling on your own site." />}
        </Section>
      )}

      <Pressable onPress={() => router.push({ pathname: '/educator-soon', params: { f: 'Coupons & offers', step: 'E6' } })} style={[styles.linkRow, { borderColor: t.border, backgroundColor: t.surface }]} accessibilityRole="button">
        <Ionicons name="ticket-outline" size={22} color={t.primary} />
        <Txt variant="bodyStrong" style={{ flex: 1 }}>Coupons & early-bird codes</Txt>
        <Ionicons name="chevron-forward" size={18} color={t.muted} />
      </Pressable>
    </>
  );
}

function Receive({ label, sub, amount, tone }: { label: string; sub: string; amount: number; tone: string }) {
  const { c: t } = useTheme();
  return (
    <View style={[styles.receive, { borderColor: t.border }]}>
      <View style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, backgroundColor: tone }} />
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{label}</Txt>
        <Txt variant="caption" color={t.muted}>{sub}</Txt>
      </View>
      <Txt variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{inr(amount)}</Txt>
    </View>
  );
}

function OwnerOnly() {
  const { c: t } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 40 }}>
      <Ionicons name="lock-closed-outline" size={36} color={t.muted} />
      <Txt variant="bodyStrong">Managed by the workspace owner</Txt>
      <Txt color={t.muted} center>Pricing, listing and publishing are set by the owner. You can keep editing details and lessons.</Txt>
    </View>
  );
}

/* ───────── Step 4: Publish ───────── */
function Publish({ c, set, meta, owner, goStep, agree, setAgree }: { c: Course; set: (p: Partial<Course>) => void; meta: NonNullable<ReturnType<typeof courseAdmin.get>>; owner: boolean; goStep: (s: number) => void; agree: boolean; setAgree: (v: boolean) => void }) {
  const { c: t } = useTheme();
  const list = useMemo(() => courseAdmin.checklist(c, meta.ctx.tenant.payments), [c, meta]);
  const doneCount = list.filter((x) => x.ok || x.optional).length;
  const lessons = allLessons(c);
  const listing = c.visibility !== 'private';
  return (
    <>
      <Section icon="eye-outline" title="Preview" sub="How learners will see it.">
        <CourseArt course={c} height={150} rounded={18} showTitle />
        <Txt variant="heading">{c.title || 'Untitled course'}</Txt>
        <Txt color={t.inkSoft}>{c.subtitle}</Txt>
        <View style={styles.wrap}>
          <Pill text={`${lessons.length} lessons`} />
          <Pill text={fmtDur(lessons.reduce((s, l) => s + (l.durationSec ?? 0), 0))} />
          <Pill text={LEVEL_LABEL[c.level]} />
          <Pill text={c.priceInr ? inr(c.priceInr) : 'Free'} tone="info" />
        </View>
        <Button title="Preview as a student" variant="outline" iconLeft="eye-outline" size="md" onPress={() => router.push({ pathname: '/course/[id]', params: { id: c.id } })} />
      </Section>

      <Section icon="checkmark-done-outline" title="Publishing checklist" sub={`${doneCount} of ${list.length} complete`}>
        {list.map((x) => (
          <Pressable key={x.key} onPress={() => goStep(x.step)} style={styles.check} accessibilityRole="button" accessibilityLabel={`${x.label}: ${x.ok ? 'done' : 'not done'}`}>
            <Ionicons name={x.ok ? 'checkmark-circle' : x.optional ? 'ellipse-outline' : 'close-circle'} size={24} color={x.ok ? t.success : x.optional ? t.borderStrong : t.danger} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{x.label}{x.optional && !x.ok ? ' (recommended)' : ''}</Txt>
              <Txt variant="caption" color={t.muted}>{x.sub}</Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.muted} />
          </Pressable>
        ))}
      </Section>

      <Section icon="globe-outline" title="Where it will appear">
        <View style={styles.where}>
          <Ionicons name="checkmark-circle" size={20} color={t.success} />
          <Txt style={{ flex: 1 }}><Txt variant="bodyStrong">Your site</Txt> · {meta.ctx.host}/course/{courseRef(c)}</Txt>
        </View>
        <View style={styles.where}>
          <Ionicons name={listing ? 'hourglass-outline' : 'remove-circle-outline'} size={20} color={listing ? t.warning : t.muted} />
          <Txt style={{ flex: 1 }}><Txt variant="bodyStrong">Bodhin marketplace</Txt> · {listing ? (meta.state === 'listed' || meta.state === 'promoted' ? 'listed' : 'after Bodhin review, usually 24–48 h') : 'not listed (private)'}</Txt>
        </View>
        {meta.state === 'draft' && owner && (
          <Button title={listing ? 'Sell only to my students instead' : 'List on Bodhin marketplace'} variant="outline" size="md" iconLeft={listing ? 'lock-closed-outline' : 'storefront-outline'} onPress={() => { set({ visibility: listing ? 'private' : 'public' }); }} />
        )}
        {listing && meta.state === 'draft' && (
          <Checkbox checked={agree} onChange={setAgree} label="Agree to marketplace guidelines">
            <Txt variant="label" color={t.inkSoft}>The content is mine or licensed, follows Bodhin’s marketplace guidelines, and makes no guaranteed-income claims.</Txt>
          </Checkbox>
        )}
      </Section>
      {!owner && <OwnerOnly />}
      {owner && listing && meta.state === 'draft' && !agree && <Txt variant="caption" color={t.warning} center>Tick the guidelines box to submit for listing.</Txt>}
    </>
  );
}

/* ───────── shared bits ───────── */
function Section({ icon, title, sub, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub?: string; children: React.ReactNode }) {
  const { c: t } = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Ionicons name={icon} size={22} color={t.primary} />
        <View style={{ flex: 1 }}>
          <Txt variant="heading">{title}</Txt>
          {sub && <Txt variant="caption" color={t.muted}>{sub}</Txt>}
        </View>
      </View>
      {children}
    </View>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="label">{label}</Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 6 },
  stepper: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, paddingBottom: 8, maxWidth: layout.contentMaxWidth, width: '100%', alignSelf: 'center' },
  stepCol: { width: 240, borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 12, gap: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 52, borderRadius: 14 },
  stepItem: { alignItems: 'center', gap: 4, minWidth: 64, minHeight: 48, justifyContent: 'center' },
  stepDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.6, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 120, alignItems: 'center' },
  inner: { width: '100%', maxWidth: layout.contentMaxWidth, gap: 12 },
  section: { padding: 16, borderRadius: radius.lg, borderWidth: 1, gap: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  area: { minHeight: 130, borderWidth: 1.2, borderRadius: radius.md, padding: 12, fontSize: 15, textAlignVertical: 'top', outlineStyle: 'none' } as any,
  swatch: { width: 52, height: 40, borderRadius: 12, borderWidth: 2.5, padding: 2 },
  iconPick: { width: 48, height: 48, borderRadius: 14, borderWidth: 1.4, alignItems: 'center', justifyContent: 'center' },
  outRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outInput: { flex: 1, minWidth: 0, minHeight: 46, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, fontSize: 15, outlineStyle: 'none' } as any,
  statsRow: { flexDirection: 'row', paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1 },
  module: { borderRadius: radius.lg, borderWidth: 1.2, overflow: 'hidden' },
  modHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  modNo: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  lesson: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, borderTopWidth: 1 },
  modActions: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 8, borderTopWidth: 1 },
  addLesson: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: radius.md },
  tips: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md },
  twoCards: { flexDirection: 'row', gap: 10 },
  choice: { flex: 1, padding: 14, borderRadius: radius.lg, borderWidth: 1.2, gap: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  sell: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1.2 },
  receive: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, minHeight: 58 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  where: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, alignItems: 'center' },
  barInner: { width: '100%', maxWidth: layout.contentMaxWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 54, height: 54, borderRadius: 27, borderWidth: 1.2, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', bottom: 92, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.pill },
  okIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
});
