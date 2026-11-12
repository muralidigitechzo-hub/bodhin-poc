/**
 * Nudge sheet: pick a template, check or edit the message, send it in-app/by email, or open it in the tutor's own WhatsApp.
 * One student → an editable, ready-made message. Several students → one template, personalised for each on send.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, retention } from '@/api/client';
import { NUDGE_MAX_CHARS, NUDGE_TEMPLATES, renderNudge, textProblem } from '@/core/nudge';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from './Txt';
import { Button } from './Button';
import { BottomSheet, Chip } from './kit';
import { Banner } from './misc';

export type NudgeTarget = Awaited<ReturnType<typeof retention.radar>>['items'][number];
type Result = Awaited<ReturnType<typeof retention.send>>;

export function NudgeSheet({ targets, onClose, onDone }: { targets: NudgeTarget[]; onClose: () => void; onDone: (message: string) => void }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const tutor = session?.user.name ?? 'Your tutor';
  const open = targets.length > 0;
  const many = targets.length > 1;
  const one = targets[0];
  const [templateId, setTemplateId] = useState<string>(NUDGE_TEMPLATES[0].id);
  const [channel, setChannel] = useState<'app' | 'whatsapp'>('app');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // single student: a ready-made message for that student · several: the template with {placeholders}
  const info = useMemo(() => (open && !many ? retention.draft(userId, one.person.id, templateId) : null), [open, many, userId, one?.person.id, templateId]);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setText(many ? NUDGE_TEMPLATES.find((t) => t.id === templateId)!.text : info?.text ?? '');
  }, [open, many, templateId, info?.text]);
  useEffect(() => {
    if (open) {
      setTemplateId(NUDGE_TEMPLATES[0].id);
      setChannel('app');
      setResult(null);
    }
  }, [open]);

  const preview = one ? renderNudge(text, { name: one.person.name, course: one.course.title, tutor, risk: one.risk }) : '';
  const problem = text.trim() ? textProblem(many ? preview : text) : 'Write a message first.';
  const blocked = !many && info ? (info.optOut ? `${one.person.name.split(' ')[0]} asked not to be contacted.` : info.waitDays > 0 ? `Already nudged recently. You can nudge again in ${info.waitDays} day${info.waitDays === 1 ? '' : 's'}.` : null) : null;
  const names = targets.map((t) => t.person.name.split(' ')[0]).join(', ');

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (channel === 'whatsapp' && !many) {
        const { link } = retention.logWhatsapp(userId, one.person.id, text);
        await Linking.openURL(link);
        onDone('WhatsApp opened with your message. Tap Send there to deliver it.');
        return;
      }
      const r = await retention.send(userId, { personIds: targets.map((t) => t.person.id), channel: 'app', templateId, text });
      if (r.skipped === 0) onDone(r.sent === 1 ? `Nudge sent to ${names}.` : `Nudge sent to ${r.sent} students.`);
      else setResult(r); // show who was skipped and why
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not send the nudge.');
    } finally {
      setBusy(false);
    }
  };

  const title = many ? `Nudge ${targets.length} students` : `Nudge ${one?.person.name.split(' ')[0] ?? ''}`;
  return (
    <BottomSheet
      open={open}
      onClose={() => (result ? onDone(`${result.sent} nudge${result.sent === 1 ? '' : 's'} sent, ${result.skipped} skipped.`) : onClose())}
      title={result ? 'Nudge result' : title}
      footer={
        result ? (
          <Button title="Done" style={{ flex: 1 }} onPress={() => onDone(`${result.sent} nudge${result.sent === 1 ? '' : 's'} sent, ${result.skipped} skipped.`)} />
        ) : (
          <Button
            title={channel === 'whatsapp' ? 'Open WhatsApp' : many ? `Send to ${targets.length} students` : 'Send nudge'}
            iconRight={channel === 'whatsapp' ? 'logo-whatsapp' : 'send'}
            loading={busy}
            disabled={!!problem || !!blocked}
            style={{ flex: 1, ...(channel === 'whatsapp' ? { backgroundColor: '#1FA855' } : null) }}
            onPress={send}
          />
        )
      }
    >
      {result ? (
        <View style={{ gap: 8 }}>
          <Txt color={c.inkSoft}>{result.sent} sent · {result.skipped} skipped</Txt>
          {result.results.filter((r) => r.status === 'skipped').map((r) => (
            <View key={r.personId} style={[styles.skip, { borderColor: c.border, backgroundColor: c.surfaceMuted }]}>
              <Ionicons name="remove-circle-outline" size={18} color={c.warning} />
              <Txt variant="label" style={{ flex: 1, fontWeight: '500' }}><Txt variant="label" style={{ fontWeight: '700' }}>{r.name}</Txt> · {r.reason}</Txt>
            </View>
          ))}
        </View>
      ) : (
        <>
          {err && <Banner text={err} />}
          {blocked && <Banner tone="info" text={blocked} />}
          {!many && one && (
            <View style={{ gap: 2 }}>
              {one.risk.reasons.map((x) => (
                <Txt key={x.kind} variant="caption" color={c.muted}>• {x.text}</Txt>
              ))}
            </View>
          )}
          <Txt variant="label" color={c.muted}>MESSAGE STYLE</Txt>
          <View style={styles.chips}>
            {NUDGE_TEMPLATES.map((t) => <Chip key={t.id} label={t.label} active={templateId === t.id} onPress={() => setTemplateId(t.id)} />)}
          </View>
          {!many && (
            <>
              <Txt variant="label" color={c.muted}>SEND VIA</Txt>
              <View style={styles.chips}>
                <Chip label="In-app / email" active={channel === 'app'} onPress={() => setChannel('app')} />
                <Chip label="WhatsApp" active={channel === 'whatsapp'} onPress={() => (info?.canWhatsapp ? setChannel('whatsapp') : setErr('This student has no valid WhatsApp number.'))} />
              </View>
            </>
          )}
          <TextInput value={text} onChangeText={setText} multiline maxLength={NUDGE_MAX_CHARS + 50} accessibilityLabel="Nudge message" style={[styles.area, { borderColor: problem && text.trim() ? c.danger : c.border, backgroundColor: c.surfaceMuted, color: c.ink }]} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt variant="caption" color={problem && text.trim() ? c.danger : c.muted} style={{ flex: 1 }}>{problem && text.trim() ? problem : many ? '{name}, {course} and {reason} are filled in for each student.' : 'You can edit the message before sending.'}</Txt>
            <Txt variant="caption" color={c.muted}>{text.length}/{NUDGE_MAX_CHARS}</Txt>
          </View>
          {many && (
            <View style={[styles.preview, { borderColor: c.border }]}>
              <Txt variant="caption" color={c.muted}>Example for {one.person.name.split(' ')[0]}</Txt>
              <Txt variant="label" style={{ fontWeight: '500' }}>{preview}</Txt>
            </View>
          )}
          <Txt variant="caption" color={c.muted}>
            {channel === 'whatsapp' ? 'Opens your own WhatsApp with this message ready. Nothing is sent until you tap Send there.' : many ? 'Delivered in the app, or by email for students without the app. Each student is nudged at most once every 3 days.' : info?.lastNudge ? `Delivered in the app or by email. Last nudge: ${new Date(info.lastNudge.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.` : 'Delivered in the app, or by email if the student has not installed the app.'}
          </Txt>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  area: { minHeight: 120, borderWidth: 1.2, borderRadius: radius.md, padding: 12, fontSize: 15, textAlignVertical: 'top', outlineStyle: 'none' } as any,
  preview: { borderWidth: 1, borderRadius: radius.md, padding: 10, gap: 4, borderStyle: 'dashed' },
  skip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.md, padding: 10 },
});
