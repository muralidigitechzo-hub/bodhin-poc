/* Retention radar: the at-risk rules (pure), who sees whom (owner / tutor / other workspace), ordering and counts. */
import { db } from '@/api/mockDb';
import * as api from '@/api/client';
import { DEFAULT_RISK_RULES, assessRisk, byUrgency } from '@/core/retention';
import { NUDGE_TEMPLATES, cooldownLeftDays, reasonSentence, renderNudge, textProblem, whatsappLink } from '@/core/nudge';

let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: unknown, n: string, x?: unknown) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const NOW = Date.UTC(2026, 10, 12, 10, 0, 0);
const ago = (days: number) => new Date(NOW - days * 864e5).toISOString();
const risk = (o: Partial<Parameters<typeof assessRisk>[0]>) => assessRisk({ attendance: null, lastActiveAt: ago(0), status: 'active', ...o }, DEFAULT_RISK_RULES, NOW);

/* ── the rules ── */
ok(DEFAULT_RISK_RULES.minAttendancePct === 40 && DEFAULT_RISK_RULES.inactiveDays === 7, 'defaults are 40% attendance and 7 days');
ok(!risk({ attendance: { attended: 4, held: 10 } }).atRisk, 'exactly 40% attendance is not flagged');
ok(risk({ attendance: { attended: 3, held: 10 } }).atRisk, '30% attendance is flagged');
ok(!risk({ attendance: { attended: 0, held: 2 } }).atRisk, 'one or two missed classes alone do not flag (needs 3 classes held)');
ok(risk({ attendance: { attended: 0, held: 3 } }).atRisk, 'three classes held and none attended is flagged');
ok(!risk({ lastActiveAt: ago(6) }).atRisk, '6 days away is fine');
ok(risk({ lastActiveAt: ago(7) }).atRisk, '7 days away is flagged');
ok(!risk({ attendance: { attended: 0, held: 5 }, lastActiveAt: ago(30), status: 'completed' }).atRisk, 'a student who finished the course is never flagged');
ok(!risk({ lastActiveAt: ago(30), status: 'on_hold' }).atRisk, 'a student on hold is not flagged');
ok(!risk({ lastActiveAt: ago(30), status: 'pending' }).atRisk, 'a pending (not yet approved) student is not flagged');
ok(!risk({ attendance: null, lastActiveAt: ago(1) }).atRisk, 'a self-paced student with recent activity is fine');
const both = risk({ attendance: { attended: 1, held: 4 }, lastActiveAt: ago(9) });
ok(both.level === 'high' && both.reasons.length === 2, 'low attendance and inactive together is high risk with two reasons', both);
ok(risk({ attendance: { attended: 1, held: 10 } }).level === 'high', 'attendance under half the limit (10%) is high');
ok(risk({ attendance: { attended: 3, held: 10 } }).level === 'medium', '30% attendance alone is medium');
ok(risk({ lastActiveAt: ago(14) }).level === 'high' && risk({ lastActiveAt: ago(8) }).level === 'medium', 'two weeks away is high, 8 days is medium');
ok(/Attended 1 of 4 classes \(25%\)/.test(both.reasons[0].text) && /No activity for 9 days/.test(both.reasons[1].text), 'reasons read in plain words', both.reasons);
const items = [{ risk: risk({ lastActiveAt: ago(8) }) }, { risk: both }, { risk: risk({ lastActiveAt: ago(20) }) }];
const sorted = [...items].sort(byUrgency);
ok(sorted[2].risk.level === 'medium' && sorted[0].risk.level === 'high' && sorted[1].risk.level === 'high', 'high risk comes before medium');
ok(sorted[0].risk.daysInactive === 20 && sorted[1].risk === both, 'among high risk, the one away longest comes first');

/* ── nudge text, cooldown, WhatsApp link ── */
const vars = { name: 'Priya Subramanian', course: 'Digital Marketing', tutor: 'Rajesh Kumar', risk: both };
ok(NUDGE_TEMPLATES.length === 3, 'three templates');
for (const t of NUDGE_TEMPLATES) { const r = renderNudge(t.text, vars); ok(!/[{}]/.test(r) && r.includes('Priya') && !r.includes('Subramanian') && r.includes('Digital Marketing'), `template “${t.id}” fills every placeholder and uses first names`, r); }
ok(reasonSentence(both) === 'you have attended 1 of 4 classes and you have not been active for 9 days', 'the reason reads as a sentence', reasonSentence(both));
ok(reasonSentence(risk({ lastActiveAt: ago(10) })) === 'you have not been active for 10 days', 'an inactive-only reason is short');
ok(renderNudge('Hi {name}, {unknown}', vars).includes('{unknown}'), 'an unknown placeholder stays visible');
ok(cooldownLeftDays(null, NOW) === 0 && cooldownLeftDays(ago(1), NOW) === 2 && cooldownLeftDays(ago(3), NOW) === 0, 'cooldown: free if never nudged, 2 days left after 1 day, free after 3 days');
ok(textProblem('too short') !== null && textProblem('x'.repeat(601)) !== null && textProblem('Hi {name}, come back soon please') !== null && textProblem('Hi Priya, we miss you in class.') === null, 'text must be 10–600 characters with no leftover placeholders');
ok(whatsappLink('+919876543210', 'Hi there')?.startsWith('https://wa.me/919876543210?text=Hi%20there') === true, 'WhatsApp link from a +91 number');
ok(whatsappLink('9876543210', 'Hi')?.includes('wa.me/919876543210') === true, 'a 10-digit number gets the 91 prefix');
ok(whatsappLink('', 'Hi') === null && whatsappLink('12345', 'Hi') === null, 'no link without a usable number');
ok(whatsappLink('+919876543210', 'a & b = c?')!.includes('a%20%26%20b%20%3D%20c%3F'), 'message text is URL-encoded');

/* ── the radar API ── */
async function main() {
  const owner = await api.retention.radar('u_rajesh');
  ok(owner.items.length > 0, 'the demo workspace has at-risk students', owner.items.length);
  ok(owner.items.every((r) => r.risk.atRisk && r.risk.reasons.length > 0), 'every listed student has at least one reason');
  ok(owner.items.every((r) => r.person.tenantId === 't_rajesh'), 'only students of the educator’s own workspace are listed');
  ok(owner.atRisk === owner.items.length, 'the summary count equals the list');
  ok(owner.judged >= owner.atRisk, 'at-risk students are part of the active students judged');
  const order = owner.items.map((r) => (r.risk.level === 'high' ? 0 : 1));
  ok(order.every((v, i) => i === 0 || order[i - 1] <= v), 'high risk students come first');
  ok(owner.items.every((r) => r.status === 'active'), 'only active students are flagged');

  /* a tutor sees only students of the courses assigned to them */
  const tutor = await api.retention.radar('u_meera');
  const assigned = new Set(db.tutorAssignments.filter((a) => a.userId === 'u_meera').map((a) => a.courseId));
  ok(tutor.items.every((r) => assigned.has(r.course.id)), 'a tutor only sees students of assigned courses', tutor.items.map((r) => r.course.id));
  ok(tutor.items.length <= owner.items.length, 'a tutor never sees more than the owner');

  /* course and level filters */
  if (owner.courses.length) {
    const cid = owner.courses.find((c) => c.atRisk > 0)?.course.id;
    if (cid) {
      const f = await api.retention.radar('u_rajesh', { courseId: cid });
      ok(f.items.length > 0 && f.items.every((r) => r.course.id === cid), 'filtering by course keeps only that course');
    }
  }
  const high = await api.retention.radar('u_rajesh', { level: 'high' });
  ok(high.items.every((r) => r.risk.level === 'high'), 'the high-risk filter keeps only high risk');

  /* a tutor of another workspace sees none of Rajesh's students */
  const other = db.users.find((u) => u.id !== 'u_rajesh' && u.id !== 'u_meera' && db.memberships.some((m) => m.userId === u.id && m.role === 'owner' && m.tenantId !== 't_rajesh'));
  if (other) {
    const r = await api.retention.radar(other.id).catch(() => null);
    ok(!r || r.items.every((x) => x.person.tenantId !== 't_rajesh'), 'another workspace never sees Rajesh’s students');
  }

  /* the Home card and the student profile agree with the radar */
  const dash = await api.educator.dashboard('u_rajesh');
  ok(dash.retention.atRisk === owner.atRisk && dash.retention.top.length === Math.min(3, owner.items.length), 'the Home card matches the radar');
  const first = owner.items[0];
  const prof = api.people.profile('u_rajesh', first.person.id);
  ok(prof?.risk?.atRisk === true && prof.risk.level === first.risk.level, 'the student profile shows the same risk as the radar');

  /* ── nudges ── */
  const T = owner.items;
  const a = T[0], b = T[1], d = T[2];
  const draft = api.retention.draft('u_rajesh', a.person.id, 'friendly');
  ok(draft.text.includes(a.person.name.split(' ')[0]) && !/[{}]/.test(draft.text) && draft.waitDays === 0, 'the draft is personal and ready to send', draft.text);
  let tooShort = ''; try { await api.retention.send('u_rajesh', { personIds: [a.person.id], channel: 'app', templateId: 'x', text: 'hi' }); } catch (e: any) { tooShort = e.message; }
  ok(/at least/.test(tooShort), 'a too-short message is refused');
  let waViaSend = ''; try { await api.retention.send('u_rajesh', { personIds: [a.person.id], channel: 'whatsapp' as any, templateId: 'x', text: draft.text }); } catch (e: any) { waViaSend = e.message; }
  ok(/in-app or email/.test(waViaSend), 'WhatsApp cannot be sent in bulk — it opens one chat at a time');

  const notesBefore = db.notifications.length;
  const one = await api.retention.send('u_rajesh', { personIds: [a.person.id], channel: 'app', templateId: 'friendly', text: draft.text });
  ok(one.sent === 1 && one.results[0].status === 'sent', 'one student is nudged', one);
  ok(one.results[0].delivered === (a.person.userId ? 'in_app' : 'email'), 'in-app when the student has the app, otherwise email');
  ok(a.person.userId ? db.notifications.length === notesBefore + 1 : db.notifications.length === notesBefore, 'an app user gets a notification, others do not');
  ok(api.retention.history('u_rajesh', a.person.id).length === 1 && api.retention.history('u_rajesh', a.person.id)[0].text === draft.text, 'the nudge is kept in the student’s history');
  const again = await api.retention.send('u_rajesh', { personIds: [a.person.id], channel: 'email', templateId: 'friendly', text: draft.text });
  ok(again.sent === 0 && /Try again in/.test(again.results[0].reason ?? ''), 'a second nudge within 3 days is blocked', again.results[0]);
  ok(api.retention.draft('u_rajesh', a.person.id, 'motivate').waitDays > 0, 'the draft warns about the cooldown');

  const stranger = db.people.find((x) => x.tenantId !== 't_rajesh');
  if (stranger) { const r = await api.retention.send('u_rajesh', { personIds: [stranger.id], channel: 'email', templateId: 'x', text: draft.text }); ok(r.sent === 0 && /Not one of your students/.test(r.results[0].reason ?? ''), 'a student of another workspace cannot be nudged'); }
  const notFlagged = db.people.find((x) => x.tenantId === 't_rajesh' && !owner.items.some((i) => i.person.id === x.id));
  if (notFlagged) { const r = await api.retention.send('u_rajesh', { personIds: [notFlagged.id], channel: 'email', templateId: 'x', text: draft.text }); ok(r.sent === 0, 'a student who is not at risk is not nudged'); }

  b.person.nudgeOptOut = true;
  const opt = await api.retention.send('u_rajesh', { personIds: [b.person.id], channel: 'email', templateId: 'friendly', text: draft.text });
  ok(opt.sent === 0 && /not to be contacted/.test(opt.results[0].reason ?? ''), 'a student who opted out is never nudged', opt.results[0]);
  let optWa = ''; try { api.retention.logWhatsapp('u_rajesh', b.person.id, draft.text); } catch (e: any) { optWa = e.message; }
  ok(/not to be contacted/.test(optWa), 'opt-out also blocks WhatsApp');
  b.person.nudgeOptOut = false;

  const bulk = await api.retention.send('u_rajesh', { personIds: [a.person.id, b.person.id], channel: 'email', templateId: 'urgent', text: NUDGE_TEMPLATES[2].text });
  ok(bulk.results.length === 2 && bulk.sent === 1 && bulk.skipped === 1 && bulk.results.find((r) => r.personId === a.person.id)?.status === 'skipped', 'bulk: one sent, the one nudged earlier is skipped with a reason', bulk);
  ok(api.retention.history('u_rajesh', b.person.id)[0].text.includes(b.person.name.split(' ')[0]) && !/[{}]/.test(api.retention.history('u_rajesh', b.person.id)[0].text), 'bulk text is personalised for each student');

  const wa = api.retention.logWhatsapp('u_rajesh', d.person.id, NUDGE_TEMPLATES[0].text);
  ok(wa.link.startsWith('https://wa.me/') && wa.link.includes('text='), 'WhatsApp returns a link that opens the chat with the message ready', wa.link);
  ok(api.retention.history('u_rajesh', d.person.id)[0].channel === 'whatsapp', 'the WhatsApp nudge is logged too');
  let waTwice = ''; try { api.retention.logWhatsapp('u_rajesh', d.person.id, NUDGE_TEMPLATES[0].text); } catch (e: any) { waTwice = e.message; }
  ok(/Try again in/.test(waTwice), 'the cooldown also applies to WhatsApp');
  const phoneless = db.people.find((x) => x.tenantId === 't_rajesh' && !x.phone && owner.items.some((i) => i.person.id === x.id));
  if (phoneless) { let m = ''; try { api.retention.logWhatsapp('u_rajesh', phoneless.id, draft.text); } catch (e: any) { m = e.message; } ok(/no valid WhatsApp number/.test(m), 'no number, no WhatsApp'); }

  /* a tutor can only nudge students of their own courses */
  const tutorRadar = await api.retention.radar('u_meera');
  const outsider = owner.items.find((i) => !tutorRadar.items.some((t) => t.person.id === i.person.id));
  if (outsider) {
    const r = await api.retention.send('u_meera', { personIds: [outsider.person.id], channel: 'email', templateId: 'x', text: 'Hi there, we miss you in class.' });
    ok(r.sent === 0 && /Not one of your students/.test(r.results[0].reason ?? ''), 'a tutor cannot nudge a student outside their courses');
  }

  /* did the nudge work? */
  const stats = (await api.retention.radar('u_rajesh')).nudges;
  ok(stats.sent >= 3 && stats.returned === 0, 'the radar counts the nudges of the last 30 days', stats);
  db.people.find((x) => x.id === a.person.id)!.lastActiveAt = new Date(Date.now() + 1000).toISOString();
  ok(api.retention.history('u_rajesh', a.person.id)[0].returned === true, 'a student who is active after the nudge is marked as returned');
  ok((await api.retention.radar('u_rajesh')).nudges.returned >= 1, 'the radar counts returned students');
  ok(api.people.profile('u_rajesh', a.person.id)?.nudges.length === 1, 'the student profile carries the nudge history');

  /* a student who returns drops off the list */
  const p = db.people.find((x) => x.id === d.person.id)!;
  const wasAtRisk = (await api.retention.radar('u_rajesh')).items.some((r) => r.person.id === p.id);
  p.lastActiveAt = new Date().toISOString();
  const still = (await api.retention.radar('u_rajesh')).items.find((r) => r.person.id === p.id);
  ok(wasAtRisk && (!still || !still.risk.reasons.some((r) => r.kind === 'inactive')), 'once the student is active again the “inactive” flag clears');

  console.log(`retention.test: PASS ${pass}  FAIL ${fail}`);
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
