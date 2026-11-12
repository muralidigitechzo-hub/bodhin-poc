/** Demo catalogue. Static seed (not persisted). DEVELOPER: replaced by the courses API. */
import type { Category, Course, LiveSession, Module, Tutor } from '@/core/catalog';

export const categories: Category[] = [
  { id: 'all', name: 'All Courses', icon: 'apps' },
  { id: 'marketing', name: 'Marketing', icon: 'megaphone' },
  { id: 'ai-data', name: 'AI & Data', icon: 'hardware-chip' },
  { id: 'development', name: 'Development', icon: 'code-slash' },
  { id: 'design', name: 'Design', icon: 'color-palette' },
  { id: 'business', name: 'Business', icon: 'briefcase' },
];

export const tutors: Tutor[] = [
  { id: 'tu_rajesh', tenantId: 't_rajesh', name: 'Rajesh Kumar', headline: 'Digital Marketing Expert', yearsExperience: 10, verified: true, color: '#0F6E5A' },
  { id: 'tu_priya', tenantId: 't_codepath', name: 'Priya Natarajan', headline: 'Data Scientist, ex-Zoho', yearsExperience: 8, verified: true, color: '#6D28D9' },
  { id: 'tu_karthik', tenantId: 't_codepath', name: 'Karthik Raman', headline: 'Full-stack Engineer', yearsExperience: 7, verified: true, color: '#1D5FD0' },
  { id: 'tu_meena', tenantId: 't_meena', name: 'Meena Venkat', headline: 'Product Designer', yearsExperience: 6, verified: true, color: '#C2410C' },
  { id: 'tu_arun', tenantId: 't_arun', name: 'Arun Prakash', headline: 'Chartered Accountant', yearsExperience: 12, verified: false, color: '#0E7490' },
  { id: 'tu_meera', tenantId: 't_rajesh', name: 'Meera Iyer', headline: 'Performance Marketing Coach', yearsExperience: 5, verified: true, color: '#9D174D' },
  { id: 'tu_bodhin', tenantId: 't_bodhin', name: 'Bodhin Academy', headline: 'Official Bodhin programs', yearsExperience: 3, verified: true, color: '#0B3B73' },
];

let n = 0;
/** Build a module from short lesson specs: 'v:Title:minutes' | 'p:Title:mb' | 'q:Title:questions' */
function mod(courseKey: string, title: string, specs: string[], previewFirst = false): Module {
  const mid = `${courseKey}_m${++n}`;
  return {
    id: mid,
    title,
    lessons: specs.map((s, i) => {
      const [t, name, val] = s.split('|');
      const id = `${mid}_l${i + 1}`;
      if (t === 'p') return { id, title: name, type: 'pdf', sizeMb: Number(val) };
      if (t === 'q') return { id, title: name, type: 'quiz', questions: Number(val) };
      return { id, title: name, type: 'video', durationSec: Number(val) * 60, preview: previewFirst && i === 0 };
    }),
  };
}

const quick = (key: string, titles: string[]) =>
  titles.map((t, i) => mod(key, t, [`v|${t}: overview|${12 + i * 3}`, `v|${t} in practice|${18 + i * 2}`, `v|Hands-on walkthrough|${22 + i}`, `q|${t} quiz|8`], i === 0));

const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString();

export const courses: Course[] = [
  {
    id: 'c_dm_ai',
    tenantId: 't_rajesh',
    tutorId: 'tu_rajesh',
    title: 'Digital Marketing & AI Mastery (2026)',
    subtitle: 'A complete, practical program to master digital marketing with real-world AI tools.',
    description: 'Learn digital marketing from basics to advanced level with the power of AI tools. Build real campaigns, automate workflows and get job-ready with hands-on projects.',
    categoryId: 'marketing',
    collections: ['career', 'job-ready', 'certification'],
    level: 'all',
    format: 'hybrid',
    priceInr: 17500,
    compareAtInr: 24000,
    offerEndsAt: inDays(9),
    rating: 4.8,
    ratingCount: 2134,
    students: 9850,
    badge: 'bestseller',
    visibility: 'public_promoted',
    moderation: 'approved',
    outcomes: ['Digital Marketing Fundamentals', 'SEO Strategy & Tools', 'Social Media Marketing with AI', 'Paid Ads (Google & Meta)', 'AI Tools for Content, Marketing & Automation'],
    projects: 5,
    certificate: true,
    art: { from: '#0B3B73', to: '#3B5BDB', icon: 'trending-up' },
    publishedAt: '2026-01-10',
    modules: [
      mod('dm', 'Introduction to Digital Marketing', ['v|What is Digital Marketing?|12.6', 'v|Digital Marketing vs Traditional Marketing|15.3', 'v|Core Channels in Digital Marketing|18.1', 'p|Key Terminologies|2.4', 'q|Module 1 Quiz|10'], true),
      mod('dm', 'SEO Strategy & Tools', ['v|How search engines work|16', 'v|Keyword research with AI|22', 'v|On-page SEO|19', 'v|Technical SEO basics|24', 'p|SEO checklist|1.2', 'q|SEO Fundamentals – Quiz 1|10']),
      mod('dm', 'Social Media Marketing', ['v|Social Media Marketing Overview|14', 'v|Content pillars & calendars|21', 'v|Instagram & LinkedIn growth|26', 'v|Community management|17', 'q|Social media quiz|8']),
      mod('dm', 'Paid Advertising (Google & Meta)', ['v|Ad platforms explained|15', 'v|Google Search campaigns|28', 'v|Meta Ads setup|31', 'v|Budgets & bidding|22', 'v|Reading ad reports|19', 'q|Paid ads quiz|10']),
      mod('dm', 'AI Tools for Marketing', ['v|AI writing assistants|18', 'v|AI images & video for ads|24', 'v|Automating reports|20', 'v|Prompting for marketers|27', 'q|AI tools quiz|8']),
      mod('dm', 'Capstone: Launch a Campaign', ['v|Brief & planning|20', 'v|Execution walkthrough|35', 'p|Capstone template|0.8']),
    ],
  },
  {
    id: 'c_python_ai',
    tenantId: 't_codepath',
    tutorId: 'tu_priya',
    title: 'Python for Data & AI Applications',
    subtitle: 'From Python basics to building small AI apps with real datasets.',
    description: 'Write clean Python, analyse data with pandas, visualise it, and ship small AI-powered apps.',
    categoryId: 'ai-data',
    collections: ['career', 'job-ready'],
    level: 'intermediate',
    format: 'recorded',
    priceInr: 15000,
    rating: 4.9,
    ratingCount: 3612,
    students: 12400,
    badge: 'new',
    visibility: 'public',
    moderation: 'approved',
    outcomes: ['Python fundamentals', 'pandas & NumPy', 'Data visualisation', 'Calling AI APIs', 'Deploying a small AI app'],
    projects: 4,
    certificate: true,
    art: { from: '#0F172A', to: '#1E40AF', icon: 'logo-python' },
    publishedAt: '2026-09-02',
    modules: quick('py', ['Python Basics', 'Working with Data', 'pandas Deep Dive', 'Visualisation', 'AI APIs', 'Mini Project']),
  },
  {
    id: 'c_web_ai',
    tenantId: 't_codepath',
    tutorId: 'tu_karthik',
    title: 'Web Development with AI',
    subtitle: 'Build modern websites faster with HTML, CSS, JavaScript and AI pair-programming.',
    description: 'Learn the web platform properly, then use AI assistants to ship features faster without losing quality.',
    categoryId: 'development',
    collections: ['career', 'job-ready'],
    level: 'beginner',
    format: 'hybrid',
    priceInr: 12999,
    rating: 4.8,
    ratingCount: 2087,
    students: 7300,
    badge: 'trending',
    visibility: 'public',
    moderation: 'approved',
    outcomes: ['HTML & CSS layouts', 'Modern JavaScript', 'React basics', 'AI-assisted coding', 'Deploying a site'],
    projects: 6,
    certificate: true,
    art: { from: '#4C1D95', to: '#7C3AED', icon: 'code-slash' },
    publishedAt: '2026-07-18',
    modules: quick('web', ['HTML Foundations', 'CSS Layouts', 'JavaScript Essentials', 'React Basics', 'AI Pair Programming', 'Deploy & Portfolio']),
  },
  {
    id: 'c_seo_growth',
    tenantId: 't_rajesh',
    tutorId: 'tu_rajesh',
    title: 'Advanced SEO & Growth',
    subtitle: 'Technical SEO, content systems and growth loops for serious marketers.',
    description: 'Go beyond basics: site architecture, topical authority, programmatic pages and measurement.',
    categoryId: 'marketing',
    collections: ['certification'],
    level: 'advanced',
    format: 'recorded',
    priceInr: 8999,
    rating: 4.7,
    ratingCount: 1290,
    students: 4100,
    visibility: 'public',
    moderation: 'approved',
    outcomes: ['Technical SEO audits', 'Topical authority', 'Internal linking', 'SEO analytics'],
    projects: 3,
    certificate: true,
    art: { from: '#9A3412', to: '#F59E0B', icon: 'stats-chart' },
    publishedAt: '2026-05-21',
    modules: quick('seo', ['Technical Audits', 'Content Systems', 'Link Strategy', 'Measurement']),
  },
  {
    id: 'c_meta_ads',
    tenantId: 't_rajesh',
    tutorId: 'tu_rajesh',
    title: 'Meta Ads Masterclass',
    subtitle: 'Profitable Facebook & Instagram campaigns, step by step.',
    description: 'Set up, launch and scale Meta campaigns with clear numbers and creative testing.',
    categoryId: 'marketing',
    collections: ['short'],
    level: 'intermediate',
    format: 'live',
    priceInr: 5500,
    rating: 4.8,
    ratingCount: 276,
    students: 1100,
    visibility: 'public',
    moderation: 'approved',
    outcomes: ['Campaign structure', 'Audiences', 'Creative testing', 'Scaling'],
    projects: 1,
    certificate: true,
    art: { from: '#1D4ED8', to: '#06B6D4', icon: 'infinite' },
    publishedAt: '2026-04-02',
    modules: quick('meta', ['Campaign Setup', 'Audiences', 'Creatives', 'Scaling']),
  },
  {
    id: 'c_uiux',
    tenantId: 't_meena',
    tutorId: 'tu_meena',
    title: 'UI/UX Design Foundations',
    subtitle: 'Design usable, beautiful apps — research to Figma prototype.',
    description: 'Learn the full product design process with real app case studies.',
    categoryId: 'design',
    collections: ['career', 'certification'],
    level: 'beginner',
    format: 'recorded',
    priceInr: 9999,
    rating: 4.6,
    ratingCount: 940,
    students: 3800,
    visibility: 'public',
    moderation: 'approved',
    outcomes: ['User research', 'Wireframing', 'Visual design', 'Prototyping in Figma'],
    projects: 3,
    certificate: true,
    art: { from: '#BE185D', to: '#F97316', icon: 'color-palette' },
    publishedAt: '2026-06-11',
    modules: quick('ux', ['Design Thinking', 'Research', 'Wireframes', 'Visual Design', 'Prototyping']),
  },
  {
    id: 'c_excel',
    tenantId: 't_arun',
    tutorId: 'tu_arun',
    title: 'Advanced Excel for Business',
    subtitle: 'Formulas, pivots and dashboards you will use every week.',
    description: 'Practical spreadsheets for finance and operations, with templates.',
    categoryId: 'business',
    collections: ['short', 'job-ready'],
    level: 'all',
    format: 'recorded',
    priceInr: 0,
    rating: 4.6,
    ratingCount: 1980,
    students: 15200,
    visibility: 'public',
    moderation: 'approved',
    outcomes: ['Lookup formulas', 'Pivot tables', 'Dashboards', 'Automation basics'],
    projects: 2,
    certificate: false,
    art: { from: '#065F46', to: '#10B981', icon: 'grid' },
    publishedAt: '2026-03-14',
    modules: quick('xl', ['Formulas', 'Pivot Tables', 'Dashboards']),
  },
  {
    id: 'c_ga4',
    tenantId: 't_rajesh',
    tutorId: 'tu_rajesh',
    title: 'Google Analytics 4 Essentials',
    subtitle: 'Batch-only course for Rajesh Kumar Academy students.',
    description: 'Private course: only enrolled academy students can see this.',
    categoryId: 'marketing',
    collections: ['short'],
    level: 'beginner',
    format: 'recorded',
    priceInr: 2999,
    rating: 4.7,
    ratingCount: 88,
    students: 320,
    visibility: 'private',
    moderation: 'approved',
    outcomes: ['GA4 setup', 'Events & conversions', 'Reports'],
    projects: 1,
    certificate: true,
    art: { from: '#B45309', to: '#FBBF24', icon: 'analytics' },
    publishedAt: '2026-08-01',
    modules: quick('ga', ['Setup', 'Events', 'Reports']),
  },
  {
    id: 'c_career',
    tenantId: 't_bodhin',
    tutorId: 'tu_bodhin',
    title: 'Career Launchpad: Communication & Interviews',
    subtitle: 'Bodhin’s own program to get interview-ready in four weeks.',
    description: 'Resume, LinkedIn, spoken English for interviews and mock interviews with feedback. Built and taught by the Bodhin team.',
    categoryId: 'business',
    collections: ['career', 'job-ready'],
    level: 'beginner',
    format: 'hybrid',
    priceInr: 2999,
    rating: 4.8,
    ratingCount: 1420,
    students: 6100,
    badge: 'trending',
    visibility: 'public_promoted',
    moderation: 'approved',
    outcomes: ['ATS-friendly resume', 'LinkedIn profile that gets calls', 'Confident self-introduction', 'Answering HR & technical rounds'],
    projects: 2,
    certificate: true,
    art: { from: '#0B3B73', to: '#D99A1E', icon: 'briefcase' },
    publishedAt: '2026-08-20',
    modules: quick('car', ['Resume & LinkedIn', 'Communication Basics', 'Interview Rounds', 'Mock Interviews']),
  },
];

/** Live sessions are generated relative to "now" so the demo always has upcoming classes. */
function at(daysFromNow: number, hour: number, minute = 0, durMin = 60) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return { startsAt: d.toISOString(), endsAt: new Date(d.getTime() + durMin * 6e4).toISOString() };
}

/** A class that is live right now, so the demo always has something to join. */
function liveNow() {
  const s = new Date(Date.now() - 32 * 6e4);
  return { startsAt: s.toISOString(), endsAt: new Date(s.getTime() + 8 * 36e5).toISOString() }; // stays open for the demo day
}

/** Only scheduled classes are seeded. Past classes, attendance and recordings appear only after a real class is held. */
export const liveSessions: LiveSession[] = [
  { id: 'ls_now', courseId: 'c_dm_ai', title: 'SEO Strategy with AI Tools', ...liveNow(), registeredUserIds: [] },
  { id: 'ls_1', courseId: 'c_dm_ai', title: 'AI Tools for Marketers – Practical Session', ...at(0, 19, 0, 60), registeredUserIds: ['u_arjun'] },
  { id: 'ls_2', courseId: 'c_dm_ai', title: 'SEO Strategy with AI Insights', ...at(1, 17, 0, 90), registeredUserIds: ['u_arjun'] },
  { id: 'ls_3', courseId: 'c_meta_ads', title: 'Meta Ads Masterclass: Scaling', ...at(3, 19, 0, 60), registeredUserIds: [] },
  { id: 'ls_4', courseId: 'c_web_ai', title: 'Build a Landing Page Live', ...at(4, 18, 30, 90), registeredUserIds: [] },
];
/** Every course gets an upcoming live session, so any enrolled learner sees a class in the Live tab. */
const COVERED = new Set(liveSessions.map((s) => s.courseId));
liveSessions.push(
  ...courses
    .filter((c) => !COVERED.has(c.id))
    .map((c, i): LiveSession => ({ id: `ls_${c.id}`, courseId: c.id, title: `${c.title} – Live Q&A`, ...at(1 + (i % 5), 17 + (i % 3), 0, 60), registeredUserIds: [] })),
);

import type { Review } from '@/core/catalog';
const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
/** A few written reviews per course (the rating totals above stay the headline numbers). */
export const seedReviews: Review[] = [
  { id: 'r1', courseId: 'c_dm_ai', userId: 'u_priya_s', userName: 'Priya S.', rating: 5, text: 'Excellent course! The content is practical, up to date and the instructor explains everything clearly. Highly recommended!', tags: ['Course Content', 'Instructor Support'], createdAt: ago(2) },
  { id: 'r2', courseId: 'c_dm_ai', userId: 'u_karthik_r', userName: 'Karthik R.', rating: 4, text: 'Great learning experience. Real-world examples and campaigns made it easy to understand. Wish the ads module was a bit longer.', tags: ['Practical Projects'], createdAt: ago(5) },
  { id: 'r3', courseId: 'c_dm_ai', userId: 'u_divya', userName: 'Divya M.', rating: 5, text: 'The live sessions were the best part — doubts cleared on the spot. Got my first freelance client after the capstone.', tags: ['Instructor Support', 'Value for Money'], createdAt: ago(9) },
  { id: 'r4', courseId: 'c_python_ai', userId: 'u_meena_v', userName: 'Meena V.', rating: 5, text: 'Sessions are well structured and beginner friendly. The projects helped me build real confidence.', tags: ['Course Structure'], createdAt: ago(7) },
  { id: 'r5', courseId: 'c_python_ai', userId: 'u_sanjay', userName: 'Sanjay K.', rating: 4, text: 'Very clear pandas section. The AI API module needs one more example, otherwise great.', tags: ['Course Content'], createdAt: ago(12) },
  { id: 'r6', courseId: 'c_web_ai', userId: 'u_harini', userName: 'Harini P.', rating: 5, text: 'Finally understood CSS layouts. The AI pair-programming part saved me hours every week.', tags: ['Practical Projects'], createdAt: ago(4) },
  { id: 'r7', courseId: 'c_excel', userId: 'u_vignesh', userName: 'Vignesh M.', rating: 5, text: 'Free and better than many paid courses. Pivot tables explained perfectly.', tags: ['Value for Money'], createdAt: ago(15) },
];
