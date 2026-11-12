/**
 * Certification rules. No React imports.
 * A learner who has bought a course and finished at least 75% of its lessons AND passed every quiz/exam of the course
 * gets a certificate request. The course creator (the tutor's workspace, or Bodhin for Bodhin's own courses) reviews it;
 * only an approval issues the certificate.
 */

export const CERT_MIN_PROGRESS = 75;

export type CertRequestStatus = 'pending' | 'approved' | 'rejected';

export interface CertRequest {
  id: string;
  userId: string;
  courseId: string;
  /** Workspace that owns the course. Bodhin's own tenant means the Admin portal reviews it. */
  tenantId: string;
  status: CertRequestStatus;
  requestedAt: string;
  /** Snapshot when requested, so the reviewer sees what the learner had achieved. */
  progressPct: number;
  quizPct: number | null;
  quizzes: number;
  decidedAt?: string;
  decidedBy?: string;
  decidedByName?: string;
  /** Reviewer's message to the learner (required context when declining). */
  note?: string;
  /** Set when approved. */
  certId?: string;
}

export interface QuizStanding {
  id: string;
  title: string;
  passPct: number;
  /** Best score the learner has reached, or null if never attempted. */
  best: number | null;
}

export interface Eligibility {
  progressPct: number;
  progressOk: boolean;
  quizzes: (QuizStanding & { passed: boolean })[];
  quizzesPassed: number;
  quizOk: boolean;
  /** Average of the best scores across the course quizzes (null when the course has none or none attempted). */
  quizPct: number | null;
  eligible: boolean;
  /** What is still missing, in plain words (empty when eligible). */
  missing: string[];
}

/** Pure: can this learner ask for a certificate? */
export function eligibility(progressPct: number, quizzes: QuizStanding[]): Eligibility {
  const rows = quizzes.map((q) => ({ ...q, passed: q.best != null && q.best >= q.passPct }));
  const passed = rows.filter((q) => q.passed).length;
  const progressOk = progressPct >= CERT_MIN_PROGRESS;
  const quizOk = passed === rows.length; // a course with no quiz has nothing to pass
  const scored = rows.map((q) => q.best).filter((x): x is number => x != null);
  const missing: string[] = [];
  if (!progressOk) missing.push(`Finish ${CERT_MIN_PROGRESS}% of the lessons (you are at ${progressPct}%)`);
  rows.filter((q) => !q.passed).forEach((q) => missing.push(q.best == null ? `Take “${q.title}” (pass mark ${q.passPct}%)` : `Pass “${q.title}” (best ${q.best}%, pass mark ${q.passPct}%)`));
  return {
    progressPct,
    progressOk,
    quizzes: rows,
    quizzesPassed: passed,
    quizOk,
    quizPct: scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
    eligible: progressOk && quizOk,
    missing,
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export interface CertTemplate {
  /** Optional uploaded template image (data URL or file URI) used as the certificate background. */
  backgroundImage?: string;
  orgName: string;
  heading: string;
  subheading: string;
  introText: string;
  completionText: string;
  instructorLabel: string;
  primaryColor: string;
  accentColor: string;
  bgColor: string;
  textColor: string;
}

export const DEFAULT_CERT_TEMPLATE: CertTemplate = {
  orgName: 'BODHIN',
  heading: 'CERTIFICATE',
  subheading: 'OF COMPLETION',
  introText: 'This is to certify that',
  completionText: 'has successfully completed',
  instructorLabel: 'Instructor',
  primaryColor: '#0B3B73',
  accentColor: '#C98A12',
  bgColor: '#FFFBF3',
  textColor: '#101828',
};

export const isHexColor = (s: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.trim());

export function resolveCertTemplate(partial?: Partial<CertTemplate> | null): CertTemplate {
  const p = partial ?? {};
  const str = (v: string | undefined, fb: string) => (v !== undefined && v.trim() ? v.trim() : fb);
  const col = (v: string | undefined, fb: string) => (v && isHexColor(v) ? v.trim() : fb);
  return {
    backgroundImage: p.backgroundImage || undefined,
    orgName: str(p.orgName, DEFAULT_CERT_TEMPLATE.orgName),
    heading: str(p.heading, DEFAULT_CERT_TEMPLATE.heading),
    subheading: str(p.subheading, DEFAULT_CERT_TEMPLATE.subheading),
    introText: str(p.introText, DEFAULT_CERT_TEMPLATE.introText),
    completionText: str(p.completionText, DEFAULT_CERT_TEMPLATE.completionText),
    instructorLabel: str(p.instructorLabel, DEFAULT_CERT_TEMPLATE.instructorLabel),
    primaryColor: col(p.primaryColor, DEFAULT_CERT_TEMPLATE.primaryColor),
    accentColor: col(p.accentColor, DEFAULT_CERT_TEMPLATE.accentColor),
    bgColor: col(p.bgColor, DEFAULT_CERT_TEMPLATE.bgColor),
    textColor: col(p.textColor, DEFAULT_CERT_TEMPLATE.textColor),
  };
}

/** A self-contained, printable certificate page (open it and choose Print → Save as PDF). */
export function certificateHtml(cert: { id: string; title: string; program: string; issuedAt: string; tutor: string }, name: string, verifyUrl: string, template?: Partial<CertTemplate> | null): string {
  const t = resolveCertTemplate(template);
  const day = new Date(cert.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const bgStyle = t.backgroundImage ? `background-image: url('${t.backgroundImage.replace(/'/g, '%27')}'); background-size: cover; background-position: center;` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Certificate · ${esc(cert.title)}</title>
<style>
  @page { size: A4 landscape; margin: 0 }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: #f4f1ea; color: ${t.textColor}; }
  .paper { box-sizing: border-box; width: 297mm; min-height: 210mm; margin: 0 auto; padding: 14mm; background: ${t.bgColor}; border: 8px solid ${t.primaryColor}; ${bgStyle} }
  .in { box-sizing: border-box; min-height: 176mm; border: 2px solid ${t.accentColor}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; padding: 16mm; background: ${t.backgroundImage ? 'rgba(255,255,255,0.82)' : 'transparent'}; }
  h1 { margin: 0; letter-spacing: 6px; font-size: 40px; color: ${t.textColor} } h2 { margin: 0; letter-spacing: 8px; font-size: 16px; font-weight: 400; color: #475467 }
  .name { font-size: 44px; font-style: italic; color: ${t.primaryColor}; margin: 10px 0 } .muted { color: #667085; font-size: 15px } .course { font-size: 28px; font-weight: bold; color: ${t.textColor} }
  .row { display: flex; justify-content: space-between; align-self: stretch; margin-top: 28px; font-size: 16px } .id { margin-top: 18px; font-size: 12px; color: #667085 }
</style></head><body><div class="paper"><div class="in">
  <div class="muted">${esc(t.orgName)}</div><h1>${esc(t.heading)}</h1><h2>${esc(t.subheading)}</h2>
  <div class="muted" style="margin-top:14px">${esc(t.introText)}</div><div class="name">${esc(name)}</div>
  <div class="muted">${esc(t.completionText)}</div><div class="course">${esc(cert.title)}</div><div class="muted">${esc(cert.program)}</div>
  <div class="row"><div><i>${esc(cert.tutor)}</i><br><span class="muted">${esc(t.instructorLabel)}</span></div><div>${esc(day)}<br><span class="muted">Date of issue</span></div></div>
  <div class="id">Certificate ID ${esc(cert.id)} · Verify at ${esc(verifyUrl)}</div>
</div></div></body></html>`;
}
