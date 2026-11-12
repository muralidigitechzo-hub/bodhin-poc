/** Audit log: every admin action with who, when, what and before → after. Filter, search, export. */
import React, { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auditAdmin } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Avatar, Chip } from '@/ui/kit';
import { ScreenTop, shared } from '@/ui/section';
import { ago } from '@/ui/admin';

export default function AuditLog() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [area, setArea] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [, force] = useState(0);
  useFocusEffect(React.useCallback(() => force((n) => n + 1), []));
  const d = auditAdmin.list(userId, area, q);
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Audit log" sub={`${d.total} entries`} fallback="/admin/more" right={<Pressable onPress={async () => { try { await Share.share({ message: auditAdmin.csv(d.rows) }); } catch { /* ignore */ } }} hitSlop={8} accessibilityRole="button"><Txt variant="label" color={c.primary}>Export</Txt></Pressable>} />
        <ScrollView contentContainerStyle={shared.scroll} keyboardShouldPersistTaps="handled">
          <View style={shared.inner}>
            <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Ionicons name="search" size={18} color={c.muted} />
              <TextInput value={q} onChangeText={setQ} placeholder="Person, workspace, action…" placeholderTextColor={c.muted} style={[styles.input, { color: c.ink }]} accessibilityLabel="Search audit log" autoCapitalize="none" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="All" active={area === 'all'} onPress={() => setArea('all')} />
              {d.areas.map((a) => <Chip key={a} label={a} active={area === a} onPress={() => setArea(a)} />)}
            </ScrollView>
            <View style={[shared.list, { backgroundColor: c.surface, borderColor: c.border }]}>
              {d.rows.length === 0 && <Txt color={c.muted} center style={{ padding: 20 }}>No entries.</Txt>}
              {d.rows.map((e, i) => (
                <Pressable key={e.id} onPress={() => setOpen(open === e.id ? null : e.id)} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]} accessibilityRole="button" accessibilityState={{ expanded: open === e.id }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Avatar name={e.actorName} size={32} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Txt variant="label">{e.actorName} <Txt variant="caption" color={c.muted}>· {e.action} · {ago(e.at)}</Txt></Txt>
                      <Txt variant="label" color={c.inkSoft} style={{ fontWeight: '400' }}>{e.summary}</Txt>
                      <Txt variant="caption" color={c.muted}>{e.target.kind}: {e.target.label} · {new Date(e.at).toLocaleString('en-IN')}</Txt>
                    </View>
                  </View>
                  {open === e.id && (e.before !== undefined || e.after !== undefined) && (
                    <View style={[styles.diff, { backgroundColor: c.surfaceMuted }]}>
                      {e.before !== undefined && <Txt variant="caption" color={c.danger} selectable>Before: {JSON.stringify(e.before).slice(0, 600)}</Txt>}
                      {e.after !== undefined && <Txt variant="caption" color={c.success} selectable>After: {JSON.stringify(e.after).slice(0, 600)}</Txt>}
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
            <Txt variant="caption" color={c.muted} center>Entries can’t be edited or deleted (production: append-only table, kept 7 years).</Txt>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, minHeight: 46 },
  input: { flex: 1, minWidth: 0, fontSize: 15, minHeight: 44 },
  row: { padding: 12, gap: 8 },
  diff: { borderRadius: 10, padding: 10, gap: 4 },
});
