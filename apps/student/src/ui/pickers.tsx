/** Thumb-friendly date & time pickers (bottom sheets, no native module needed) + scrollable pill tabs. */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { fmtTime } from '@/core/batch';
import { Txt } from './Txt';
import { Button } from './Button';
import { BottomSheet } from './kit';

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** A field that shows a date and opens a month calendar sheet. */
export function DateField({ label, value, onChange, min, error }: { label: string; value: string; onChange: (iso: string) => void; min?: string; error?: string | null }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Txt variant="label">{label}</Txt>
      <Pressable onPress={() => setOpen(true)} style={[styles.field, { borderColor: error ? c.danger : c.border, backgroundColor: c.surfaceMuted }]} accessibilityRole="button" accessibilityLabel={`${label}: ${value ? fmtDate(value) : 'not set'}`}>
        <Ionicons name="calendar-outline" size={18} color={c.inkSoft} />
        <Txt style={{ flex: 1 }} numberOfLines={1} color={value ? c.ink : c.muted}>{value ? fmtDate(value) : 'Choose date'}</Txt>
      </Pressable>
      {error && <Txt variant="caption" color={c.danger}>{error}</Txt>}
      <DateSheet open={open} onClose={() => setOpen(false)} value={value} min={min} title={label} onPick={(d) => { onChange(d); setOpen(false); }} />
    </View>
  );
}

export function DateSheet({ open, onClose, value, onPick, min, title }: { open: boolean; onClose: () => void; value?: string; onPick: (iso: string) => void; min?: string; title: string }) {
  const { c } = useTheme();
  const base = value ? new Date(value) : new Date();
  const [cursor, setCursor] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const minT = min ? new Date(new Date(min).toDateString()).getTime() : -Infinity;
  const days = useMemo(() => {
    const first = new Date(cursor);
    const out: (Date | null)[] = Array(first.getDay()).fill(null);
    const n = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= n; i++) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), i));
    return out;
  }, [cursor]);
  const sel = value ? new Date(value).toDateString() : '';
  const today = new Date().toDateString();
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <View style={styles.monthRow}>
        <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={22} color={c.ink} />
        </Pressable>
        <Txt variant="heading">{cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Txt>
        <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={22} color={c.ink} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WD.map((d, i) => (
          <View key={`h${i}`} style={styles.cell}><Txt variant="caption" color={c.muted} style={{ fontWeight: '700' }}>{d}</Txt></View>
        ))}
        {days.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={styles.cell} />;
          const disabled = d.getTime() < minT;
          const on = d.toDateString() === sel;
          const isToday = d.toDateString() === today;
          return (
            <Pressable key={d.toISOString()} disabled={disabled} onPress={() => { const x = new Date(d); x.setHours(12, 0, 0, 0); onPick(x.toISOString()); }} style={styles.cell} accessibilityRole="button" accessibilityLabel={d.toDateString()} accessibilityState={{ selected: on, disabled }}>
              <View style={[styles.day, on && { backgroundColor: c.primary }, !on && isToday && { borderWidth: 1.5, borderColor: c.primary }]}>
                <Txt variant="bodyStrong" color={on ? '#fff' : disabled ? c.borderStrong : c.ink}>{d.getDate()}</Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const TIMES = Array.from({ length: 34 }, (_, i) => {
  const mins = 6 * 60 + i * 30; // 6:00 AM → 10:30 PM
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
});

export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (hhmm: string) => void }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Txt variant="label">{label}</Txt>
      <Pressable onPress={() => setOpen(true)} style={[styles.field, { borderColor: c.border, backgroundColor: c.surfaceMuted }]} accessibilityRole="button" accessibilityLabel={`${label}: ${fmtTime(value)}`}>
        <Ionicons name="time-outline" size={18} color={c.inkSoft} />
        <Txt style={{ flex: 1 }}>{fmtTime(value)}</Txt>
      </Pressable>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        <View style={styles.times}>
          {TIMES.map((t) => (
            <Pressable key={t} onPress={() => { onChange(t); setOpen(false); }} style={[styles.time, { borderColor: t === value ? c.primary : c.border, backgroundColor: t === value ? c.primary : c.surface }]} accessibilityRole="radio" accessibilityState={{ checked: t === value }}>
              <Txt variant="label" color={t === value ? '#fff' : c.ink}>{fmtTime(t)}</Txt>
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

/** Stepper for small numbers (capacity etc.). */
export function Stepper({ label, value, onChange, min = 1, max = 500, step = 1 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label">{label}</Txt>
      <View style={[styles.stepper, { borderColor: c.border, backgroundColor: c.surfaceMuted }]}>
        <Pressable onPress={() => onChange(Math.max(min, value - step))} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`}>
          <Ionicons name="remove" size={22} color={c.ink} />
        </Pressable>
        <Txt variant="heading" style={{ flex: 1, textAlign: 'center', fontVariant: ['tabular-nums'] }} accessibilityLiveRegion="polite">{value}</Txt>
        <Pressable onPress={() => onChange(Math.min(max, value + step))} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={`Increase ${label}`}>
          <Ionicons name="add" size={22} color={c.ink} />
        </Pressable>
      </View>
    </View>
  );
}

/** Scrollable pill tabs used on Batch, Student profile and similar screens. */
export function PillTabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: keyof typeof Ionicons.glyphMap }[]; value: T; onChange: (t: T) => void }) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ flexGrow: 0 }} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <Pressable key={t.id} onPress={() => onChange(t.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.tab, { backgroundColor: on ? c.primary : c.surface, borderColor: on ? c.primary : c.border }]}>
            {t.icon && <Ionicons name={t.icon} size={16} color={on ? '#fff' : c.inkSoft} />}
            <Txt variant="label" color={on ? '#fff' : c.ink}>{t.label}</Txt>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export { Button };

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.2, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 50 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  time: { width: '30%', flexGrow: 1, minHeight: 46, borderRadius: radius.md, borderWidth: 1.2, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.2, borderRadius: radius.md, minHeight: 50 },
  stepBtn: { width: 52, height: 50, alignItems: 'center', justifyContent: 'center' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, minHeight: 42, borderRadius: radius.pill, borderWidth: 1.2 },
});
