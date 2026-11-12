/** Admin team & roles: who has access, what each role can do, invite / change role / remove. */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, staffAdmin } from '@/api/client';
import { ADMIN_ROLES, ROLE_LABEL, ROLE_PERMS, type AdminPerm, type AdminRole } from '@/core/admin';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Avatar, BottomSheet, Chip, Pill } from '@/ui/kit';
import { Banner } from '@/ui/misc';
import { Card, ScreenTop, shared } from '@/ui/section';
import { ago } from '@/ui/admin';

const GROUPS: [string, AdminPerm[]][] = [
  ['Approvals', ['approvals.educators', 'approvals.courses', 'approvals.reports']],
  ['Tenants', ['tenants.view', 'tenants.manage']],
  ['Plans & rules', ['plans.edit', 'config.edit']],
  ['Money', ['money.view', 'payouts.run', 'refunds']],
  ['Content', ['content.bodhin']],
  ['Users & support', ['users.view', 'users.manage', 'support.tickets', 'broadcast']],
  ['Security', ['admins.manage', 'audit.view']],
];

export default function Team() {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [, force] = useState(0);
  const rows = staffAdmin.list(userId);
  const [inv, setInv] = useState(false);
  const [f, setF] = useState<{ name: string; email: string; role: AdminRole }>({ name: '', email: '', role: 'support' });
  const [edit, setEdit] = useState<(typeof rows)[number] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const done = (m: string) => { setMsg(m); setErr(null); force((n) => n + 1); };
  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Admin team & roles" sub={`${rows.length} people`} fallback="/admin/more" />
        <ScrollView contentContainerStyle={shared.scroll}>
          <View style={shared.inner}>
            {msg && <Banner tone="success" text={msg} />}
            {err && !inv && !edit && <Banner text={err} />}
            <Card title="Team">
              {rows.map((r) => (
                <Pressable key={r.u.id} onPress={() => { setEdit(r); setErr(null); }} style={styles.row} accessibilityRole="button" accessibilityLabel={`${r.u.name}, ${ROLE_LABEL[r.role]}`}>
                  <Avatar name={r.u.name} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="bodyStrong" numberOfLines={1}>{r.u.name}{r.u.id === userId ? ' (you)' : ''}</Txt>
                    <Txt variant="caption" color={c.muted} numberOfLines={1}>{r.u.email} · {r.lastSignIn ? `signed in ${ago(r.lastSignIn)}` : 'never signed in'}</Txt>
                  </View>
                  <Pill text={ROLE_LABEL[r.role]} tone={r.role === 'super_admin' ? 'gold' : 'info'} />
                </Pressable>
              ))}
            </Card>
            <Card title="What each role can do">
              <View style={styles.matrixHead}>
                <View style={{ flex: 1.6 }} />
                {ADMIN_ROLES.map((r) => <Txt key={r} variant="caption" color={c.muted} center style={{ flex: 1 }} numberOfLines={1}>{ROLE_LABEL[r].split(' ')[0]}</Txt>)}
              </View>
              {GROUPS.map(([g, perms]) => (
                <View key={g} style={styles.matrixRow}>
                  <Txt variant="label" style={{ flex: 1.6, fontWeight: '500' }}>{g}</Txt>
                  {ADMIN_ROLES.map((r) => {
                    const n = perms.filter((p) => ROLE_PERMS[r].includes(p)).length;
                    return <View key={r} style={{ flex: 1, alignItems: 'center' }}><Ionicons name={n === perms.length ? 'checkmark-circle' : n ? 'ellipse-outline' : 'remove'} size={18} color={n === perms.length ? c.success : n ? c.warning : c.borderStrong} /></View>;
                  })}
                </View>
              ))}
              <Txt variant="caption" color={c.muted}>✓ full · ○ partial (view only) · — none. Everyone uses 2-step sign-in; all actions are in the audit log.</Txt>
            </Card>
          </View>
        </ScrollView>
        <View style={[shared.footer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
          <Button title="Add team member" iconLeft="person-add" onPress={() => { setInv(true); setErr(null); setF({ name: '', email: '', role: 'support' }); }} style={{ width: '100%', maxWidth: 720 }} />
        </View>
      </SafeAreaView>
      <BottomSheet open={inv} onClose={() => setInv(false)} title="Add team member" footer={<Button title="Add" size="md" style={{ flex: 1 }} onPress={async () => { try { const e = await staffAdmin.invite(userId, f); setInv(false); done(`${e} added — they sign in with 2-step verification`); } catch (x) { setErr(x instanceof ApiError ? x.message : 'Failed'); } }} />}>
        <View style={{ gap: 10 }}>
          <TextField label="Name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
          <TextField label="Work email" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} autoCapitalize="none" keyboardType="email-address" />
          <Txt variant="label">Role</Txt>
          <View style={shared.chips}>{ADMIN_ROLES.map((r) => <Chip key={r} label={ROLE_LABEL[r]} active={f.role === r} onPress={() => setF({ ...f, role: r })} />)}</View>
          {err && <Banner text={err} />}
        </View>
      </BottomSheet>
      <BottomSheet open={!!edit} onClose={() => setEdit(null)} title={edit?.u.name ?? ''} footer={edit && edit.u.id !== userId ? <Button title="Remove from team" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { try { staffAdmin.remove(userId, edit.u.id); setEdit(null); done('Removed from admin team'); } catch (x) { setErr(x instanceof ApiError ? x.message : 'Failed'); } }} /> : undefined}>
        {edit && (
          <View style={{ gap: 10 }}>
            <Txt variant="label">Role</Txt>
            <View style={shared.chips}>{ADMIN_ROLES.map((r) => <Chip key={r} label={ROLE_LABEL[r]} active={edit.role === r} onPress={() => { try { staffAdmin.setRole(userId, edit.u.id, r); setEdit({ ...edit, role: r }); done(`${edit.u.name} is now ${ROLE_LABEL[r]}`); } catch (x) { setErr(x instanceof ApiError ? x.message : 'Failed'); } }} />)}</View>
            <Txt variant="caption" color={c.muted}>{ROLE_PERMS[edit.role].length} permissions. Changes apply on their next screen load.</Txt>
            {err && <Banner text={err} />}
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  matrixHead: { flexDirection: 'row', alignItems: 'center' },
  matrixRow: { flexDirection: 'row', alignItems: 'center', minHeight: 34 },
});
