/** Bodhin content — Bodhin's own courses (100% to Bodhin), marketplace curation (hero + featured), categories, Bodhin coupons. */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, contentAdmin, courseAdmin } from '@/api/client';
import type { Course } from '@/core/catalog';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { CourseArt } from '@/ui/course';
import { STATE_META } from '@/ui/courseState';
import { PillTabs } from '@/ui/pickers';
import { Card, ScreenTop, ToggleRow, inr, shared } from '@/ui/section';

type Tab = 'courses' | 'curation' | 'categories';
const ICONS = ['apps', 'megaphone', 'hardware-chip', 'code-slash', 'color-palette', 'briefcase', 'language', 'school', 'musical-notes', 'fitness', 'calculator', 'camera', 'leaf', 'heart'];

export default function Content() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [tab, setTab] = useState<Tab>('courses');
  const [rev, setRev] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<null | 'featured' | 'banners'>(null);
  const [cat, setCat] = useState<null | { id?: string; name: string; icon: string; hidden?: boolean }>(null);
  useFocusEffect(React.useCallback(() => setRev((r) => r + 1), []));
  void rev;
  const courses = contentAdmin.bodhinCourses(userId);
  const cur = contentAdmin.curation(userId);
  const flash = (m: string) => { setMsg(m); setErr(null); setRev((r) => r + 1); setTimeout(() => setMsg(null), 3000); };
  const setList = (which: 'featured' | 'banners', ids: string[]) => { try { contentAdmin.setList(userId, which, ids); flash(which === 'banners' ? 'Hero banners updated — live on Explore' : 'Featured order updated — live on Explore'); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); } };
  const move = (which: 'featured' | 'banners', list: Course[], i: number, d: -1 | 1) => { const ids = list.map((x) => x.id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; setList(which, ids); };

  const ListEditor = ({ which, list, max }: { which: 'featured' | 'banners'; list: Course[]; max: number }) => (
    <Card title={`${which === 'banners' ? 'Hero banners' : 'Featured courses'} · ${list.length}/${max}`} right={list.length < max ? <Pressable onPress={() => setPick(which)} hitSlop={8} accessibilityRole="button"><Txt variant="label" color={c.primary}>+ Add</Txt></Pressable> : undefined}>
      <Txt variant="caption" color={c.muted}>{which === 'banners' ? 'The big cards at the top of Explore on thebodhin.com.' : 'Shown first in “Featured” on Explore, in this order.'}</Txt>
      {list.map((co, i) => (
        <View key={co.id} style={styles.item}>
          <View style={{ width: 56 }}><CourseArt course={co} height={40} rounded={8} /></View>
          <Txt variant="label" style={{ flex: 1 }} numberOfLines={2}>{i + 1}. {co.title}</Txt>
          <Small icon="arrow-up" label="Move up" disabled={i === 0} onPress={() => move(which, list, i, -1)} />
          <Small icon="arrow-down" label="Move down" disabled={i === list.length - 1} onPress={() => move(which, list, i, 1)} />
          <Small icon="close" label={`Remove ${co.title}`} onPress={() => setList(which, list.filter((x) => x.id !== co.id).map((x) => x.id))} />
        </View>
      ))}
      {!list.length && <Txt color={c.muted}>Empty — Explore falls back to promoted / popular courses.</Txt>}
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Bodhin content" sub="Bodhin’s academy & the marketplace" fallback="/admin/more" />
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <PillTabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'courses', label: `Bodhin courses · ${courses.length}`, icon: 'layers-outline' }, { id: 'curation', label: 'Curation', icon: 'star-outline' }, { id: 'categories', label: 'Categories', icon: 'grid-outline' }]} />
        </View>
        <ScrollView contentContainerStyle={shared.scroll} showsVerticalScrollIndicator={false}>
          <View style={shared.inner}>
            {msg && <Banner tone="success" text={msg} />}
            {err && <Banner text={err} />}
            {tab === 'courses' && (
              <>
                <Txt variant="caption" color={c.muted}>Sold and collected by Bodhin (100% to Bodhin). Uses the same course builder as educators; publishing skips review.</Txt>
                <View style={shared.row}>
                  <Button title="New Bodhin course" iconLeft="add" size="md" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/edu/course/[id]', params: { id: courseAdmin.create(userId) } })} />
                  <Button title="Bodhin coupons" iconLeft="pricetags-outline" size="md" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/edu/coupons')} />
                </View>
                {courses.map(({ c: co, state, sales, orders, students, featured }) => (
                  <Pressable key={co.id} onPress={() => router.push({ pathname: '/edu/course/[id]', params: { id: co.id } })} style={({ pressed }) => [styles.course, { backgroundColor: c.surface, borderColor: c.border }, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`Edit ${co.title || 'untitled course'}`}>
                    <View style={{ width: 84 }}><CourseArt course={co} height={62} rounded={12} /></View>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Txt variant="bodyStrong" numberOfLines={2}>{co.title || 'Untitled course'}</Txt>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                        <Pill text={STATE_META[state].label} tone={STATE_META[state].tone} />
                        {featured && <Pill text="Featured" tone="gold" icon="star" />}
                      </View>
                      <Txt variant="caption" color={c.muted}>{co.priceInr ? inr(co.priceInr) : 'Free'} · {students} students · {orders} orders · {inr(sales)} this month</Txt>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={c.muted} />
                  </Pressable>
                ))}
              </>
            )}
            {tab === 'curation' && (
              <>
                <ListEditor which="banners" list={cur.banners} max={3} />
                <ListEditor which="featured" list={cur.featured} max={12} />
                <Txt variant="caption" color={c.muted}>Only approved, public courses can be picked. Educators’ “Promotion” requests are approved in Inbox → Courses.</Txt>
              </>
            )}
            {tab === 'categories' && (
              <>
                <Button title="Add category" iconLeft="add" size="md" variant="outline" onPress={() => setCat({ name: '', icon: 'school' })} />
                <Card title="Explore categories">
                  {cur.categories.map((k) => (
                    <Pressable key={k.id} onPress={() => setCat({ id: k.id, name: k.name, icon: k.icon, hidden: k.hidden })} style={[styles.item, { opacity: k.hidden ? 0.5 : 1 }]} accessibilityRole="button" accessibilityLabel={`Edit ${k.name}`}>
                      <View style={[styles.catIcon, { backgroundColor: c.primarySoft }]}><Ionicons name={k.icon as keyof typeof Ionicons.glyphMap} size={18} color={c.primary} /></View>
                      <Txt variant="bodyStrong" style={{ flex: 1 }}>{k.name}</Txt>
                      <Txt variant="caption" color={c.muted}>{k.id === 'all' ? '' : `${k.courses} course${k.courses === 1 ? '' : 's'}`}</Txt>
                      {k.hidden && <Pill text="Hidden" tone="neutral" />}
                      <Ionicons name="create-outline" size={18} color={c.muted} />
                    </Pressable>
                  ))}
                </Card>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet open={!!pick} onClose={() => setPick(null)} title={pick === 'banners' ? 'Add hero banner' : 'Add featured course'}>
        <View style={{ gap: 8 }}>
          {cur.candidates.filter((co) => !(pick === 'banners' ? cur.banners : cur.featured).some((x) => x.id === co.id)).map((co) => (
            <Pressable key={co.id} onPress={() => { const list = pick === 'banners' ? cur.banners : cur.featured; setList(pick!, [...list.map((x) => x.id), co.id]); setPick(null); }} style={[styles.item, { borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 8 }]} accessibilityRole="button" accessibilityLabel={`Add ${co.title}`}>
              <View style={{ width: 56 }}><CourseArt course={co} height={40} rounded={8} /></View>
              <Txt variant="label" style={{ flex: 1 }} numberOfLines={2}>{co.title}</Txt>
              <Ionicons name="add-circle" size={22} color={c.primary} />
            </Pressable>
          ))}
        </View>
      </BottomSheet>
      <BottomSheet open={!!cat} onClose={() => setCat(null)} title={cat?.id ? 'Edit category' : 'New category'} footer={<Button title="Save" size="md" style={{ flex: 1 }} onPress={() => { try { contentAdmin.saveCategory(userId, cat!); setCat(null); flash('Categories updated — live on Explore and in the course builder'); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Failed'); setCat(null); } }} />}>
        {cat && (
          <View style={{ gap: 10 }}>
            <TextField label="Name" value={cat.name} onChangeText={(v) => setCat({ ...cat, name: v })} maxLength={28} />
            <Txt variant="label">Icon</Txt>
            <View style={shared.chips}>{ICONS.map((i) => <Pressable key={i} onPress={() => setCat({ ...cat, icon: i })} style={[styles.iconPick, { borderColor: cat.icon === i ? c.primary : c.border, backgroundColor: cat.icon === i ? c.primarySoft : c.surface }]} accessibilityRole="radio" accessibilityState={{ checked: cat.icon === i }} accessibilityLabel={i}><Ionicons name={i as keyof typeof Ionicons.glyphMap} size={20} color={c.primary} /></Pressable>)}</View>
            {cat.id && cat.id !== 'all' && <ToggleRow title="Hide from Explore" sub="Courses stay; the chip disappears" value={!!cat.hidden} onChange={(v) => setCat({ ...cat, hidden: v })} />}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

function Small({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.small, { borderColor: c.border, opacity: disabled ? 0.35 : 1 }]} accessibilityRole="button" accessibilityLabel={label}><Ionicons name={icon} size={16} color={c.inkSoft} /></Pressable>;
}

const styles = StyleSheet.create({
  course: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50 },
  small: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  catIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconPick: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
