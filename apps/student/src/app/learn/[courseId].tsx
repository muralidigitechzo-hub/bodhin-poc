/**
 * Lesson player. Video on top (eyes), content in the middle, Prev / Complete / Next pinned at the
 * bottom (thumb). Handles video, PDF and quiz lessons; auto-completes a video at 90% watched.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLayout } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, downloads, notes as notesApi, player, questions as qaApi } from '@/api/client';
import { allLessons, type Lesson } from '@/core/catalog';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { Avatar, BottomSheet, IconButton, Pill } from '@/ui/kit';
import { VideoSurface } from '@/ui/VideoSurface';
import { Banner } from '@/ui/misc';
import { BrandLogo } from '@/ui/Brand';

type Tab = 'lessons' | 'notes' | 'qa' | 'resources';
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const QUALITIES = ['Auto', '720p', '480p', '360p'];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function Player() {
  const { isDesktop } = useLayout();
  const { courseId, lesson: lessonParam } = useLocalSearchParams<{ courseId: string; lesson?: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [lessonId, setLessonId] = useState(lessonParam);
  const [rev, setRev] = useState(0); // bump to re-read state after mutations
  const [tab, setTab] = useState<Tab>('lessons');
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState('Auto');
  const [sheet, setSheet] = useState<null | 'speed' | 'quality' | 'download'>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [now, setNow] = useState(0);
  const [upNext, setUpNext] = useState<number | null>(null);
  const [dl, setDl] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const lastSaved = useRef(0);

  const data = useMemo(() => {
    try {
      return { ok: true as const, ...player.open(userId, courseId, lessonId) };
    } catch (e) {
      return { ok: false as const, error: (e as ApiError).message };
    }
  }, [userId, courseId, lessonId, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2000);
  };

  const go = useCallback((l: Lesson | null) => {
    if (!l) return;
    setUpNext(null);
    setLessonId(l.id);
    setNow(0);
    router.setParams({ lesson: l.id });
  }, []);

  // "Up next" countdown after a video ends
  useEffect(() => {
    if (upNext == null) return;
    if (upNext <= 0) {
      if (data.ok) go(data.next);
      return;
    }
    const t = setTimeout(() => setUpNext((x) => (x == null ? x : x - 1)), 1000);
    return () => clearTimeout(t);
  }, [upNext]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data.ok) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20, justifyContent: 'center', gap: 16 }}>
        <Banner text={data.error} />
        <Button title="View course" onPress={() => router.replace({ pathname: '/course/[id]', params: { id: courseId } })} />
      </SafeAreaView>
    );
  }

  const { course, module, lesson, prev, next, enrolled, completed, tutor } = data;
  const isDone = completed.has(lesson.id);
  const moduleNo = course.modules.indexOf(module) + 1;
  const lessonNo = module.lessons.indexOf(lesson) + 1;
  const downloaded = downloads.has(userId, lesson.id);
  const bookmarked = player.isBookmarked(userId, lesson.id);

  const onTime = (t: number, duration: number) => {
    setNow(t);
    if (Math.abs(t - lastSaved.current) >= 5) {
      player.savePosition(userId, lesson.id, t);
      lastSaved.current = t;
    }
    if (enrolled && !isDone && t / duration >= 0.9) {
      player.setComplete(userId, course.id, lesson.id);
      setRev((r) => r + 1);
      flash('Lesson completed ✓');
    }
  };

  const toggleDone = () => {
    if (!enrolled) return;
    player.setComplete(userId, course.id, lesson.id, !isDone);
    setRev((r) => r + 1);
    if (!isDone && next) flash('Marked complete');
  };

  const startDownload = (q: 'sd' | 'hd') => {
    setSheet(null);
    setDl(0);
    downloads.start(userId, course.id, lesson.id, q, setDl).done.then(() => {
      setDl(null);
      setRev((r) => r + 1);
      flash('Saved for offline viewing');
    });
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/course/[id]', params: { id: course.id } }));

  // Desktop has no Lessons tab (outline panel instead) → Notes is the default tab there.
  const on = (id: string) => tab === id || (isDesktop && tab === 'lessons' && id === 'notes');
  // Prev · Mark done · Next — pinned bar on phones, inline under the video on desktop.
  const navEls = (
    <>
    <Pressable disabled={!prev} onPress={() => go(prev)} style={[styles.prev, { borderColor: c.border, opacity: prev ? 1 : 0.4 }]} accessibilityRole="button" accessibilityLabel="Previous lesson">
      <Ionicons name="chevron-back" size={22} color={c.ink} />
    </Pressable>
    {enrolled && (
      <Pressable onPress={toggleDone} style={[styles.done, { borderColor: isDone ? c.success : c.border, backgroundColor: isDone ? c.successBg : c.surface }]} accessibilityRole="checkbox" accessibilityState={{ checked: isDone }} accessibilityLabel="Mark lesson complete">
        <Ionicons name={isDone ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isDone ? c.success : c.inkSoft} />
        <Txt variant="label" color={isDone ? c.success : c.ink}>{isDone ? 'Done' : 'Mark done'}</Txt>
      </Pressable>
    )}
    <Button title={next ? 'Next' : 'Finish'} iconRight={next ? 'arrow-forward' : 'trophy'} style={{ flex: 1 }} disabled={!!next && !enrolled && !next.preview} onPress={() => (next ? go(next) : back())} />
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        {/* header */}
        <View style={styles.head}>
          <IconButton icon="chevron-back" label="Back to course" tone="filled" onPress={back} />
          <BrandLogo size="sm" />
          <IconButton icon={bookmarked ? 'bookmark' : 'bookmark-outline'} label={bookmarked ? 'Remove bookmark' : 'Bookmark lesson'} tone="filled" onPress={() => { const on = player.toggleBookmark(userId, lesson.id); setRev((r) => r + 1); flash(on ? 'Lesson bookmarked' : 'Bookmark removed'); }} />
        </View>

        <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: isDesktop ? 48 : 110 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={[styles.center, isDesktop && { maxWidth: 1100, paddingHorizontal: 24 }]}>
            {/* media */}
            {lesson.type === 'video' ? (
              <View style={[styles.media, isDesktop && { borderRadius: 18 }]}>
                <VideoSurface
                  course={course}
                  lesson={lesson}
                  label={`Module ${moduleNo} · Lesson ${lessonNo}`}
                  startAt={data.position}
                  speed={speed}
                  fullscreen={fullscreen}
                  onTime={onTime}
                  onEnded={() => next && setUpNext(5)}
                  onSpeed={() => setSheet('speed')}
                  onQuality={() => setSheet('quality')}
                  onFullscreen={() => setFullscreen((f) => !f)}
                />
                {upNext != null && next && (
                  <View style={styles.upNext}>
                    <Txt variant="caption" color="rgba(255,255,255,0.8)">Up next in {upNext}s</Txt>
                    <Txt variant="heading" color="#fff" numberOfLines={2} center>{next.title}</Txt>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Button title="Cancel" variant="outline" size="md" onPress={() => setUpNext(null)} />
                      <Button title="Play now" size="md" iconRight="play" onPress={() => go(next)} />
                    </View>
                  </View>
                )}
              </View>
            ) : (
              <DocCard lesson={lesson} onOpen={() => (lesson.type === 'quiz' ? router.push({ pathname: '/quiz/[lessonId]', params: { lessonId: lesson.id, courseId: course.id } }) : flash('PDF opens in the in-app reader on your phone'))} />
            )}

            <View style={styles.pad}>
              {/* title */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14 }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="title" style={{ fontSize: 21, lineHeight: 27 }}>{lesson.title}</Txt>
                  <Txt variant="label" color={c.muted} style={{ fontWeight: '500' }}>Module {moduleNo}: {module.title}</Txt>
                </View>
                {isDone ? <Pill text="Completed" tone="success" icon="checkmark" /> : !enrolled ? <Pill text="Free preview" tone="info" /> : null}
              </View>

              {/* actions */}
              <View style={styles.actions}>
                <Action icon={dl != null ? 'cloud-download' : downloaded ? 'checkmark-done-circle' : 'download-outline'} label={dl != null ? `${dl}%` : downloaded ? 'Saved' : 'Download'} active={downloaded} disabled={!enrolled || dl != null} onPress={() => (downloaded ? router.push('/downloads') : setSheet('download'))} />
                <Action icon="create-outline" label="Add note" disabled={!enrolled || lesson.type !== 'video'} onPress={() => setTab('notes')} />
                <Action icon="help-circle-outline" label="Ask doubt" disabled={!enrolled} onPress={() => setTab('qa')} />
                <Action icon="list-outline" label="Course" onPress={() => router.replace({ pathname: '/course/[id]', params: { id: course.id } })} />
              </View>

              {isDesktop && !fullscreen && <View style={[styles.barInner, { maxWidth: undefined, marginTop: 4 }]}>{navEls}</View>}

              {!enrolled && (
                <View style={[styles.cta, { backgroundColor: c.primarySoft }]}>
                  <Txt variant="label" style={{ flex: 1 }}>Liked the preview? Get all {allLessons(course).length} lessons, notes and doubt support.</Txt>
                  <Button title="Enroll" size="md" onPress={() => router.replace({ pathname: '/course/[id]', params: { id: course.id } })} />
                </View>
              )}

              {/* tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: 16, marginBottom: 12, flexGrow: 0 }}>
                {(([
                  ['lessons', `Lessons (${module.lessons.length})`],
                  ['notes', 'My notes'],
                  ['qa', `Q&A (${qaApi.list(lesson.id).length})`],
                  ['resources', 'Resources'],
                ] as const).filter(([id]) => !(isDesktop && id === 'lessons'))).map(([id, label]) => (
                  <Pressable key={id} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityState={{ selected: on(id) }} style={[styles.tab, { backgroundColor: on(id) ? c.primary : c.surface, borderColor: on(id) ? c.primary : c.border }]}>
                    <Txt variant="label" color={on(id) ? '#fff' : c.ink}>{label}</Txt>
                  </Pressable>
                ))}
              </ScrollView>

              {tab === 'lessons' && !isDesktop && (
                <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <Txt variant="bodyStrong" style={{ padding: 14, paddingBottom: 6 }}>Module {moduleNo}: {module.title}</Txt>
                  {module.lessons.map((l, i) => {
                    const cur = l.id === lesson.id;
                    const done = completed.has(l.id);
                    const locked = !enrolled && !l.preview;
                    return (
                      <Pressable key={l.id} disabled={locked} onPress={() => go(l)} style={[styles.row, { borderTopColor: c.border }, cur && { backgroundColor: c.primarySoft }]} accessibilityRole="button" accessibilityState={{ selected: cur, disabled: locked }}>
                        <Ionicons name={l.type === 'video' ? (cur ? 'play-circle' : 'play-circle-outline') : l.type === 'pdf' ? 'document-text-outline' : 'help-circle-outline'} size={26} color={cur ? c.primary : c.inkSoft} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Txt variant="label" numberOfLines={2} style={{ fontWeight: cur ? '700' : '600' }}>{i + 1}. {l.title}</Txt>
                          <Txt variant="caption" color={c.muted}>{l.type === 'video' ? fmt(l.durationSec ?? 0) : l.type === 'pdf' ? `PDF · ${l.sizeMb} MB` : `${l.questions} questions`}</Txt>
                        </View>
                        {done ? <Ionicons name="checkmark-circle" size={22} color={c.success} /> : locked ? <Ionicons name="lock-closed-outline" size={18} color={c.muted} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {(tab === 'notes' || (isDesktop && tab === 'lessons')) && <Notes userId={userId} courseId={course.id} lesson={lesson} now={now} enrolled={enrolled} />}
              {tab === 'qa' && <QA userId={userId} name={session?.user.name ?? 'You'} courseId={course.id} lessonId={lesson.id} tutorName={tutor.name} enrolled={enrolled} />}
              {tab === 'resources' && (
                <View style={{ gap: 10 }}>
                  {allLessons(course).filter((l) => l.type === 'pdf').map((l) => (
                    <View key={l.id} style={[styles.res, { backgroundColor: c.surface, borderColor: c.border }]}>
                      <View style={[styles.resIcon, { backgroundColor: c.dangerBg }]}><Ionicons name="document-text" size={20} color={c.danger} /></View>
                      <View style={{ flex: 1 }}>
                        <Txt variant="label">{l.title}.pdf</Txt>
                        <Txt variant="caption" color={c.muted}>PDF · {l.sizeMb} MB</Txt>
                      </View>
                      <IconButton icon="download-outline" label={`Download ${l.title}`} onPress={() => (enrolled ? flash('Saved to Downloads') : flash('Enroll to download resources'))} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </ScrollView>

        {/* thumb bar (phones/tablets; desktop shows these inline under the video) */}
        {!fullscreen && !isDesktop && (
          <View style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
            <View style={styles.barInner}>
              {navEls}
            </View>
          </View>
        )}
        </View>

        {/* Desktop: full course outline beside the video */}
        {isDesktop && !fullscreen && (
          <View style={[styles.panel, { backgroundColor: c.surface, borderLeftColor: c.border }]}>
            <View style={{ padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}>
              <Txt variant="heading" numberOfLines={2}>{course.title}</Txt>
              <Txt variant="caption" color={c.muted}>{completed.size} of {allLessons(course).length} lessons done</Txt>
            </View>
            <ScrollView>
              {course.modules.map((mod, mi) => (
                <View key={mod.id}>
                  <Txt variant="label" color={c.muted} style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>MODULE {mi + 1} · {mod.title.toUpperCase()}</Txt>
                  {mod.lessons.map((l, i) => {
                    const cur = l.id === lesson.id;
                    const done = completed.has(l.id);
                    const locked = !enrolled && !l.preview;
                    return (
                      <Pressable key={l.id} disabled={locked} onPress={() => go(l)} style={({ hovered }: any) => [styles.row, { borderTopColor: c.border, paddingHorizontal: 16 }, cur ? { backgroundColor: c.primarySoft } : hovered && { backgroundColor: c.surfaceMuted }]} accessibilityRole="button" accessibilityState={{ selected: cur, disabled: locked }}>
                        <Ionicons name={l.type === 'video' ? (cur ? 'play-circle' : 'play-circle-outline') : l.type === 'pdf' ? 'document-text-outline' : 'help-circle-outline'} size={22} color={cur ? c.primary : c.inkSoft} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Txt variant="label" numberOfLines={2} style={{ fontWeight: cur ? '700' : '600' }}>{i + 1}. {l.title}</Txt>
                          <Txt variant="caption" color={c.muted}>{l.type === 'video' ? fmt(l.durationSec ?? 0) : l.type === 'pdf' ? `PDF · ${l.sizeMb} MB` : `${l.questions} questions`}</Txt>
                        </View>
                        {done ? <Ionicons name="checkmark-circle" size={20} color={c.success} /> : locked ? <Ionicons name="lock-closed-outline" size={16} color={c.muted} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        )}
        </View>

        {toast && (
          <View style={[styles.toast, { backgroundColor: c.ink }]} accessibilityLiveRegion="polite">
            <Txt variant="label" color="#fff">{toast}</Txt>
          </View>
        )}
      </SafeAreaView>

      <BottomSheet open={sheet === 'speed'} onClose={() => setSheet(null)} title="Playback speed">
        <View style={styles.optGrid}>
          {SPEEDS.map((s) => (
            <Pressable key={s} onPress={() => { setSpeed(s); setSheet(null); }} style={[styles.opt, { borderColor: speed === s ? c.primary : c.border, backgroundColor: speed === s ? c.primarySoft : c.surface }]} accessibilityRole="radio" accessibilityState={{ checked: speed === s }}>
              <Txt variant="bodyStrong" color={speed === s ? c.primary : c.ink}>{s === 1 ? 'Normal' : `${s}x`}</Txt>
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      <BottomSheet open={sheet === 'quality'} onClose={() => setSheet(null)} title="Video quality">
        <View style={styles.optGrid}>
          {QUALITIES.map((q) => (
            <Pressable key={q} onPress={() => { setQuality(q); setSheet(null); }} style={[styles.opt, { borderColor: quality === q ? c.primary : c.border, backgroundColor: quality === q ? c.primarySoft : c.surface }]} accessibilityRole="radio" accessibilityState={{ checked: quality === q }}>
              <Txt variant="bodyStrong" color={quality === q ? c.primary : c.ink}>{q}</Txt>
            </Pressable>
          ))}
        </View>
        <Txt variant="caption" color={c.muted}>Auto adjusts to your network to avoid buffering.</Txt>
      </BottomSheet>

      <BottomSheet open={sheet === 'download'} onClose={() => setSheet(null)} title="Download for offline">
        <Txt color={c.inkSoft}>Watch without internet inside the Bodhin app. Downloads stay valid while your enrolment is active.</Txt>
        {(['sd', 'hd'] as const).map((q) => (
          <Pressable key={q} onPress={() => startDownload(q)} style={[styles.dlOpt, { borderColor: c.border, backgroundColor: c.surface }]} accessibilityRole="button">
            <Ionicons name={q === 'sd' ? 'phone-portrait-outline' : 'tv-outline'} size={24} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{q === 'sd' ? 'Standard (480p)' : 'High (720p)'}</Txt>
              <Txt variant="caption" color={c.muted}>{q === 'sd' ? 'Saves data and storage' : 'Sharper text on slides'}</Txt>
            </View>
            <Txt variant="label" color={c.inkSoft}>~{downloads.estimateMb(lesson.id, q)} MB</Txt>
          </Pressable>
        ))}
      </BottomSheet>
    </View>
  );
}

function Action({ icon, label, onPress, disabled, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} style={({ pressed }) => [styles.action, { backgroundColor: c.surface, borderColor: active ? c.success : c.border, opacity: disabled ? 0.45 : 1 }, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={22} color={active ? c.success : c.primary} />
      <Txt variant="caption" style={{ fontWeight: '600' }} numberOfLines={1}>{label}</Txt>
    </Pressable>
  );
}

function DocCard({ lesson, onOpen }: { lesson: Lesson; onOpen: () => void }) {
  const { c } = useTheme();
  const quiz = lesson.type === 'quiz';
  return (
    <View style={[styles.doc, { backgroundColor: quiz ? '#F1ECFC' : c.infoBg }]}>
      <View style={[styles.docIcon, { backgroundColor: c.surface }]}>
        <Ionicons name={quiz ? 'help-circle' : 'document-text'} size={40} color={quiz ? '#7C3AED' : c.info} />
      </View>
      <Txt variant="heading" center>{lesson.title}</Txt>
      <Txt variant="label" color={c.inkSoft} center style={{ fontWeight: '500' }}>
        {quiz ? `${lesson.questions} questions · about ${Math.ceil((lesson.questions ?? 10) * 1.5)} minutes` : `PDF document · ${lesson.sizeMb} MB`}
      </Txt>
      <Button title={quiz ? 'Start quiz' : 'Open PDF'} iconRight={quiz ? 'arrow-forward' : 'open-outline'} size="md" onPress={onOpen} />
    </View>
  );
}

function Notes({ userId, courseId, lesson, now, enrolled }: { userId: string; courseId: string; lesson: Lesson; now: number; enrolled: boolean }) {
  const { c } = useTheme();
  const [text, setText] = useState('');
  const [list, setList] = useState(() => notesApi.list(userId, lesson.id));
  useEffect(() => setList(notesApi.list(userId, lesson.id)), [userId, lesson.id]);
  if (!enrolled) return <Txt color={c.muted} center style={{ paddingVertical: 20 }}>Enroll to take notes on lessons.</Txt>;
  const add = () => {
    if (!text.trim()) return;
    notesApi.add({ userId, courseId, lessonId: lesson.id, atSec: lesson.type === 'video' ? now : 0, text });
    setText('');
    setList(notesApi.list(userId, lesson.id));
  };
  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.noteBox, { backgroundColor: c.surface, borderColor: c.border }]}>
        {lesson.type === 'video' && <Pill text={`at ${fmt(now)}`} tone="info" icon="time-outline" />}
        <TextInput value={text} onChangeText={setText} placeholder="Write a note for this moment…" placeholderTextColor={c.muted} multiline accessibilityLabel="New note" style={[styles.noteInput, { color: c.ink }]} />
        <Button title="Save note" size="md" disabled={!text.trim()} onPress={add} />
      </View>
      {list.length === 0 ? (
        <Txt variant="caption" color={c.muted} center>Your notes for this lesson appear here, linked to the exact time.</Txt>
      ) : (
        list.map((n) => (
          <View key={n.id} style={[styles.note, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Txt variant="label" color={c.primary}>{fmt(n.atSec)}</Txt>
            <Txt style={{ flex: 1 }}>{n.text}</Txt>
            <IconButton icon="trash-outline" label="Delete note" onPress={() => { notesApi.remove(n.id); setList(notesApi.list(userId, lesson.id)); }} />
          </View>
        ))
      )}
    </View>
  );
}

function QA({ userId, name, courseId, lessonId, tutorName, enrolled }: { userId: string; name: string; courseId: string; lessonId: string; tutorName: string; enrolled: boolean }) {
  const { c } = useTheme();
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(() => qaApi.list(lessonId));
  useEffect(() => setList(qaApi.list(lessonId)), [lessonId]);
  const ask = async () => {
    setBusy(true);
    setErr(null);
    try {
      await qaApi.ask({ courseId, lessonId, userId, userName: name.split(' ')[0] + (name.split(' ')[1] ? ` ${name.split(' ')[1][0]}.` : ''), text });
      setText('');
      setList(qaApi.list(lessonId));
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      {enrolled && (
        <View style={[styles.noteBox, { backgroundColor: c.surface, borderColor: c.border }]}>
          <TextInput value={text} onChangeText={(t) => { setText(t); setErr(null); }} placeholder={`Ask ${tutorName.split(' ')[0]} a doubt about this lesson…`} placeholderTextColor={c.muted} multiline accessibilityLabel="Your question" style={[styles.noteInput, { color: c.ink }]} />
          {err && <Txt variant="caption" color={c.danger}>{err}</Txt>}
          <Button title="Post question" size="md" iconRight="send" loading={busy} disabled={!text.trim()} onPress={ask} />
        </View>
      )}
      {list.length === 0 && <Txt variant="caption" color={c.muted} center>No questions yet. Be the first to ask.</Txt>}
      {list.map((q) => (
        <View key={q.id} style={[styles.qa, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Avatar name={q.userName} size={32} color={c.inkSoft} />
            <Txt variant="label" style={{ flex: 1 }}>{q.userName}{q.userId === userId ? ' (you)' : ''}</Txt>
            {!q.answer && <Pill text="Awaiting answer" tone="warning" />}
          </View>
          <Txt>{q.text}</Txt>
          {q.answer && (
            <View style={[styles.answer, { backgroundColor: c.accentSoft }]}>
              <Txt variant="label">{q.answer.by} · Instructor</Txt>
              <Txt color={c.inkSoft}>{q.answer.text}</Txt>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6 },
  center: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center' },
  panel: { width: 380, borderLeftWidth: StyleSheet.hairlineWidth },
  media: { borderRadius: 0, overflow: 'hidden' },
  pad: { paddingHorizontal: 20 },
  upNext: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(7,20,40,0.85)', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, zIndex: 60 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  action: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, minHeight: 64, justifyContent: 'center' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, marginTop: 12 },
  tab: { paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1.2 },
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 60, paddingVertical: 8, borderTopWidth: 1 },
  res: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: 1 },
  resIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  doc: { marginHorizontal: 20, borderRadius: 22, padding: 22, alignItems: 'center', gap: 8, marginTop: 4 },
  docIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  noteBox: { padding: 12, borderRadius: radius.lg, borderWidth: 1, gap: 10 },
  noteInput: { minHeight: 70, fontSize: 15, textAlignVertical: 'top', outlineStyle: 'none' } as any,
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingVertical: 4, borderRadius: radius.md, borderWidth: 1 },
  qa: { padding: 14, borderRadius: radius.lg, borderWidth: 1, gap: 8 },
  answer: { padding: 12, borderRadius: radius.md, gap: 4 },
  optGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  opt: { flexBasis: '30%', flexGrow: 1, alignItems: 'center', minHeight: 54, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1.4 },
  dlOpt: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, minHeight: 68 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, alignItems: 'center' },
  barInner: { width: '100%', maxWidth: layout.contentMaxWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  prev: { width: 54, height: 54, borderRadius: 27, borderWidth: 1.2, alignItems: 'center', justifyContent: 'center' },
  done: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 54, borderRadius: 27, borderWidth: 1.2 },
  toast: { position: 'absolute', bottom: 96, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.pill },
});
