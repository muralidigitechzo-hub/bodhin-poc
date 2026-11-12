/** Users: every learner, educator and staff account — search, filter, tap for the 360. */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usersAdmin, type UserFilter } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Avatar, Chip, Pill } from '@/ui/kit';
import { ScreenTop, shared } from '@/ui/section';
import { ago } from '@/ui/admin';

const F: [UserFilter, string][] = [['all', 'All'], ['students', 'Learners'], ['educators', 'Educators'], ['staff', 'Staff'], ['locked', 'Locked']];

export default function Users() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [f, setF] = useState<UserFilter>('all');
  const [q, setQ] = useState('');
  const [, force] = useState(0);
  useFocusEffect(React.useCallback(() => force((n) => n + 1), []));
  const d = usersAdmin.list(userId, f, q);
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Users" sub={`${d.counts.all} accounts`} fallback="/admin/more" />
        <ScrollView contentContainerStyle={shared.scroll} keyboardShouldPersistTaps="handled">
          <View style={shared.inner}>
            <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Ionicons name="search" size={18} color={c.muted} />
              <TextInput value={q} onChangeText={setQ} placeholder="Name, email or phone" placeholderTextColor={c.muted} style={[styles.input, { color: c.ink }]} accessibilityLabel="Search users" autoCapitalize="none" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {F.map(([k, l]) => <Chip key={k} label={`${l} ${d.counts[k]}`} active={f === k} onPress={() => setF(k)} />)}
            </ScrollView>
            <View style={[shared.list, { backgroundColor: c.surface, borderColor: c.border }]}>
              {d.rows.length === 0 && <Txt color={c.muted} center style={{ padding: 20 }}>No users match.</Txt>}
              {d.rows.map((r, i) => (
                <Pressable key={r.u.id} onPress={() => router.push({ pathname: '/admin/user/[id]', params: { id: r.u.id } })} style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={`${r.u.name}, ${r.u.email}`}>
                  <Avatar name={r.u.name} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="bodyStrong" numberOfLines={1}>{r.u.name}</Txt>
                    <Txt variant="caption" color={c.muted} numberOfLines={1}>{r.u.email} · joined {ago(r.u.createdAt)}</Txt>
                  </View>
                  {r.locked ? <Pill text="Locked" tone="live" /> : <Pill text={r.kind === 'students' ? `${r.enrolments} courses` : r.kind === 'educators' ? 'Educator' : 'Staff'} tone={r.kind === 'staff' ? 'gold' : r.kind === 'educators' ? 'info' : 'neutral'} />}
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, minHeight: 46 },
  input: { flex: 1, minWidth: 0, fontSize: 15, minHeight: 44 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 64 },
});
