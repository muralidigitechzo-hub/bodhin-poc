/** Search with live results, recent searches and a bottom-sheet filter panel. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { catalog } from '@/api/client';
import { FORMAT_LABEL, LEVEL_LABEL, type CourseQuery, type Format, type Level } from '@/core/catalog';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { layout, radius } from '@/theme/tokens';
import { Txt } from '@/ui/Txt';
import type { InputRef } from '@/ui/TextField';
import { Button } from '@/ui/Button';
import { BottomSheet, Chip, Skeleton, useAsync } from '@/ui/kit';
import { CourseRow } from '@/ui/course';

const TRENDING = ['Digital Marketing', 'Python', 'AI tools', 'SEO', 'UI/UX', 'Excel'];
const SORTS: { id: NonNullable<CourseQuery['sort']>; label: string }[] = [
  { id: 'relevance', label: 'Most relevant' },
  { id: 'popular', label: 'Most popular' },
  { id: 'rating', label: 'Highest rated' },
  { id: 'newest', label: 'Newest' },
  { id: 'price_low', label: 'Price: low to high' },
  { id: 'price_high', label: 'Price: high to low' },
];
const PRICES: { id: NonNullable<CourseQuery['price']>; label: string }[] = [
  { id: 'any', label: 'Any price' },
  { id: 'free', label: 'Free' },
  { id: 'under5k', label: 'Under ₹5,000' },
  { id: '5to15k', label: '₹5,000 – ₹15,000' },
  { id: 'over15k', label: 'Above ₹15,000' },
];
type Filters = Pick<CourseQuery, 'levels' | 'formats' | 'price' | 'minRating' | 'categoryId'>;
const EMPTY: Filters = { levels: [], formats: [], price: 'any', minRating: 0, categoryId: 'all' };

const toggle = <T,>(arr: T[] = [], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export default function Search() {
  const { c, tenant } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const params = useLocalSearchParams<{ sort?: string; collection?: string; title?: string; filters?: string }>();

  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<CourseQuery['sort']>((params.sort as CourseQuery['sort']) ?? 'relevance');
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [sheet, setSheet] = useState<null | 'filters' | 'sort'>(params.filters ? 'filters' : null);
  const [recent, setRecent] = useState(() => catalog.recentSearches(userId));
  const input = useRef<InputRef>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 250);
    return () => clearTimeout(t);
  }, [text]);

  const collection = params.collection;
  const activeCount = (filters.levels?.length ?? 0) + (filters.formats?.length ?? 0) + (filters.price !== 'any' ? 1 : 0) + (filters.minRating ? 1 : 0) + (filters.categoryId !== 'all' ? 1 : 0);
  const browsing = !!(debounced || collection || activeCount || params.sort);

  const query = useMemo<CourseQuery>(() => ({ text: debounced, sort, collection, ...filters }), [debounced, sort, collection, filters]);
  const { data, loading } = useAsync(() => catalog.search(query, tenant?.id ?? null), [JSON.stringify(query), tenant?.id]);

  const runSearch = (t: string) => {
    setText(t);
    setDebounced(t);
    catalog.saveSearch(userId, t);
    setRecent(catalog.recentSearches(userId));
  };

  const openFilters = () => {
    setDraft(filters);
    setSheet('filters');
  };
  useEffect(() => {
    if (params.filters) setDraft(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cats = catalog.categories();

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={styles.wrap}>
          {/* Search field */}
          <View style={styles.top}>
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/explore'))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back" style={[styles.back, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Ionicons name="chevron-back" size={22} color={c.ink} />
            </Pressable>
            <View style={[styles.field, { backgroundColor: c.surface, borderColor: c.primary }]}>
              <Ionicons name="search" size={20} color={c.inkSoft} />
              <TextInput
                ref={input}
                value={text}
                onChangeText={setText}
                onSubmitEditing={() => runSearch(text)}
                placeholder={collection ? `Search in ${params.title}` : 'Courses, skills or tutors'}
                placeholderTextColor={c.muted}
                autoFocus={!params.filters && !collection && !params.sort}
                returnKeyType="search"
                accessibilityLabel="Search"
                style={[styles.input, { color: c.ink }]}
              />
              {!!text && (
                <Pressable onPress={() => setText('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                  <Ionicons name="close-circle" size={20} color={c.muted} />
                </Pressable>
              )}
            </View>
          </View>

          {!browsing ? (
            <View style={{ paddingHorizontal: 20, gap: 22, paddingTop: 12 }}>
              {recent.length > 0 && (
                <View style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Txt variant="heading">Recent searches</Txt>
                    <Pressable onPress={() => { catalog.clearSearches(userId); setRecent([]); }} hitSlop={10} accessibilityRole="button">
                      <Txt variant="label" color={c.primary}>
                        Clear
                      </Txt>
                    </Pressable>
                  </View>
                  {recent.map((r) => (
                    <Pressable key={r} onPress={() => runSearch(r)} style={styles.recent} accessibilityRole="button">
                      <Ionicons name="time-outline" size={20} color={c.muted} />
                      <Txt style={{ flex: 1 }}>{r}</Txt>
                      <Ionicons name="arrow-up-outline" size={18} color={c.muted} style={{ transform: [{ rotate: '-45deg' }] }} />
                    </Pressable>
                  ))}
                </View>
              )}
              <View style={{ gap: 10 }}>
                <Txt variant="heading">Trending on {tenant ? tenant.branding.displayName : 'Bodhin'}</Txt>
                <View style={styles.wrapRow}>
                  {TRENDING.map((t) => (
                    <Chip key={t} label={t} icon="trending-up" onPress={() => runSearch(t)} />
                  ))}
                </View>
              </View>
            </View>
          ) : (
            <FlatList
              data={data ?? []}
              keyExtractor={(x) => x.course.id}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 10 }}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <Txt variant="label" color={c.muted} style={{ paddingVertical: 8 }}>
                  {loading ? 'Searching…' : `${data?.length ?? 0} course${data?.length === 1 ? '' : 's'}${collection ? ` in ${params.title}` : ''}${debounced ? ` for “${debounced}”` : ''}`}
                </Txt>
              }
              ListEmptyComponent={
                loading ? (
                  <View style={{ gap: 10 }}>
                    <Skeleton h={124} r={18} />
                    <Skeleton h={124} r={18} />
                  </View>
                ) : (
                  <View style={{ alignItems: 'center', gap: 8, paddingVertical: 40 }}>
                    <Ionicons name="search-outline" size={36} color={c.muted} />
                    <Txt variant="bodyStrong">No courses found</Txt>
                    <Txt color={c.muted} center>
                      Try a different word or clear some filters.
                    </Txt>
                    {activeCount > 0 && <Button title="Clear filters" variant="outline" size="md" onPress={() => setFilters(EMPTY)} />}
                  </View>
                )
              }
              renderItem={({ item }) => <CourseRow course={item.course} tutor={item.tutor} />}
            />
          )}
        </View>

        {/* Thumb-zone action bar */}
        {browsing && (
          <View style={styles.dockWrap} pointerEvents="box-none">
            <View style={[styles.dock, { backgroundColor: c.primaryDeep }]}>
              <Pressable onPress={openFilters} style={styles.dockBtn} accessibilityRole="button" accessibilityLabel={`Filters${activeCount ? `, ${activeCount} active` : ''}`}>
                <Ionicons name="options-outline" size={20} color="#fff" />
                <Txt variant="label" color="#fff">
                  Filters{activeCount ? ` (${activeCount})` : ''}
                </Txt>
              </Pressable>
              <View style={styles.dockSep} />
              <Pressable onPress={() => setSheet('sort')} style={styles.dockBtn} accessibilityRole="button">
                <Ionicons name="swap-vertical" size={20} color="#fff" />
                <Txt variant="label" color="#fff" numberOfLines={1}>
                  {SORTS.find((s) => s.id === sort)?.label}
                </Txt>
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>

      <BottomSheet
        open={sheet === 'filters'}
        onClose={() => setSheet(null)}
        title="Filters"
        footer={
          <>
            <Button title="Reset" variant="outline" size="md" style={{ flex: 1 }} onPress={() => setDraft(EMPTY)} />
            <Button title="Show results" size="md" style={{ flex: 2 }} onPress={() => { setFilters(draft); setSheet(null); }} />
          </>
        }
      >
        <FilterGroup title="Category">
          {cats.map((k) => (
            <Chip key={k.id} label={k.name} active={draft.categoryId === k.id} onPress={() => setDraft((d) => ({ ...d, categoryId: k.id }))} />
          ))}
        </FilterGroup>
        <FilterGroup title="Level">
          {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
            <Chip key={l} label={LEVEL_LABEL[l]} active={draft.levels?.includes(l)} onPress={() => setDraft((d) => ({ ...d, levels: toggle(d.levels, l) }))} />
          ))}
        </FilterGroup>
        <FilterGroup title="Format">
          {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => (
            <Chip key={f} label={FORMAT_LABEL[f]} icon={f === 'live' ? 'radio' : f === 'recorded' ? 'play-circle' : 'layers'} active={draft.formats?.includes(f)} onPress={() => setDraft((d) => ({ ...d, formats: toggle(d.formats, f) }))} />
          ))}
        </FilterGroup>
        <FilterGroup title="Price">
          {PRICES.map((p) => (
            <Chip key={p.id} label={p.label} active={draft.price === p.id} onPress={() => setDraft((d) => ({ ...d, price: p.id }))} />
          ))}
        </FilterGroup>
        <FilterGroup title="Rating">
          {[0, 4, 4.5].map((r) => (
            <Chip key={r} label={r ? `${r}★ & above` : 'Any rating'} active={(draft.minRating ?? 0) === r} onPress={() => setDraft((d) => ({ ...d, minRating: r }))} />
          ))}
        </FilterGroup>
      </BottomSheet>

      <BottomSheet open={sheet === 'sort'} onClose={() => setSheet(null)} title="Sort by">
        <View>
          {SORTS.map((s) => (
            <Pressable key={s.id} onPress={() => { setSort(s.id); setSheet(null); }} style={[styles.sortRow, { borderBottomColor: c.border }]} accessibilityRole="radio" accessibilityState={{ checked: sort === s.id }}>
              <Txt variant={sort === s.id ? 'bodyStrong' : 'body'} style={{ flex: 1 }}>
                {s.label}
              </Txt>
              <Ionicons name={sort === s.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={sort === s.id ? c.primary : c.borderStrong} />
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Txt variant="bodyStrong">{title}</Txt>
      <View style={styles.wrapRow}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 10 },
  back: { width: 48, height: 48, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  field: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 50, borderRadius: radius.pill, borderWidth: 1.6 },
  input: { flex: 1, minWidth: 0, width: '100%', fontSize: 16, minHeight: 48, outlineStyle: 'none' } as any,
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dockWrap: { position: 'absolute', left: 0, right: 0, bottom: 20, alignItems: 'center' },
  dock: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: 6, shadowColor: '#0B2A55', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  dockBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, minHeight: 50, maxWidth: 200 },
  dockSep: { width: 1, height: 22, backgroundColor: 'rgba(255,255,255,0.3)' },
  sortRow: { flexDirection: 'row', alignItems: 'center', minHeight: 54, borderBottomWidth: 1 },
});
