/** Demo question banks and assessments. DEVELOPER: replaced by the assessments API. */
import type { Assessment, Question } from '@/core/assess';
import { courses } from './catalogSeed';

type Q = [text: string, options: string[], correct: number, topic: string, explanation: string, hint?: string];
const bank = (key: string, qs: Q[]): Question[] => qs.map(([text, options, correct, topic, explanation, hint], i) => ({ id: `${key}${i + 1}`, text, options, correct, topic, explanation, hint }));

export const QUESTIONS: Question[] = [
  ...bank('seo', [
    ['Which tool is widely used for free keyword research?', ['Google Keyword Planner', 'Canva', 'Trello', 'Figma'], 0, 'Keyword Research', 'Keyword Planner (inside Google Ads) shows search volume and competition for free.'],
    ['What is the main benefit of long-tail keywords?', ['Higher search volume', 'Lower competition and clearer intent', 'They work only for ads', 'They need no content'], 1, 'Keyword Research', 'Long-tail phrases have less volume but much clearer intent and lower competition.'],
    ['Which of these is the primary purpose of keyword research?', ['Design a website layout', 'Identify the search terms users are looking for', 'Increase site speed', 'Manage social media'], 1, 'Keyword Research', 'Keyword research tells you what your audience actually types into search.', 'Think about what helps a page rank for relevant searches.'],
    ['Which of the following is NOT an on-page SEO factor?', ['Title tag', 'Meta description', 'Backlinks from other sites', 'Header tags'], 2, 'On-Page SEO', 'Backlinks are off-page signals; the rest live on your own page.'],
    ['What does a meta description mainly do?', ['Directly boosts rankings', 'Summarises the page in search results to earn clicks', 'Hides content from Google', 'Speeds up the page'], 1, 'On-Page SEO', 'It is a snippet that influences click-through rate, not a direct ranking factor.'],
    ['Where should the main keyword ideally appear?', ['Only in the footer', 'In the title and first paragraph', 'In image file names only', 'Nowhere, to avoid spam'], 1, 'On-Page SEO', 'Title and opening paragraph tell users and search engines what the page is about.'],
    ['What does a robots.txt file control?', ['Page colours', 'Which URLs crawlers may access', 'Ad budgets', 'Email delivery'], 1, 'Technical SEO', 'robots.txt gives crawl instructions; it does not remove pages from the index by itself.'],
    ['Which metric is part of Core Web Vitals?', ['Bounce rate', 'Largest Contentful Paint (LCP)', 'Domain age', 'Keyword density'], 1, 'Technical SEO', 'LCP, INP and CLS are the Core Web Vitals.'],
    ['What is an XML sitemap for?', ['Listing important URLs for search engines', 'Designing navigation menus', 'Tracking conversions', 'Blocking spam'], 0, 'Technical SEO', 'Sitemaps help search engines discover and prioritise your pages.'],
    ['Which tool shows how your site performs in Google Search?', ['Google Search Console', 'Google Docs', 'Meta Business Suite', 'Mailchimp'], 0, 'SEO Tools', 'Search Console reports impressions, clicks, queries and indexing issues.'],
  ]),
  ...bank('dmi', [
    ['Digital marketing mainly uses which channels?', ['Billboards and print', 'Online channels like search, social and email', 'Only TV', 'Door-to-door sales'], 1, 'Basics', 'Digital marketing reaches people through internet-connected channels.'],
    ['What is a key advantage of digital over traditional marketing?', ['It is always free', 'Results can be measured precisely', 'It needs no strategy', 'It works without content'], 1, 'Basics', 'Clicks, conversions and costs are tracked in near real time.'],
    ['SEO stands for…', ['Search Engine Optimisation', 'Social Engagement Online', 'Sales Email Outreach', 'Site Error Output'], 0, 'Channels', 'SEO improves visibility in organic search results.'],
    ['Which is an example of paid media?', ['A Google Search ad', 'Your own blog post', 'A customer’s organic review', 'An unpaid Instagram post'], 0, 'Channels', 'Paid media is any placement you pay for, like search or social ads.'],
    ['CTR measures…', ['Cost per thousand views', 'Clicks divided by impressions', 'Time on page', 'Total revenue'], 1, 'Metrics', 'Click-through rate = clicks ÷ impressions.'],
    ['A “conversion” is…', ['Any page view', 'A visitor completing a desired action', 'A deleted comment', 'A server error'], 1, 'Metrics', 'Conversions are goals like sign-ups, purchases or leads.'],
    ['Which channel is best for nurturing existing leads?', ['Email marketing', 'Billboards', 'Cold calling only', 'Radio'], 0, 'Channels', 'Email lets you send relevant follow-ups to people who opted in.'],
    ['A buyer persona describes…', ['Your ideal customer', 'Your website hosting', 'Your ad budget', 'Your logo'], 0, 'Basics', 'Personas summarise who you are trying to reach and what they need.'],
    ['ROI in marketing compares…', ['Likes to followers', 'Return generated to amount invested', 'Posts to comments', 'Emails sent to opened'], 1, 'Metrics', 'ROI = (gain − cost) ÷ cost.'],
    ['Which is an owned media channel?', ['Your website', 'A news article about you', 'A paid banner', 'An influencer’s post'], 0, 'Channels', 'Owned media is any channel you control, like your site or newsletter.'],
  ]),
  ...bank('py', [
    ['Which keyword defines a function in Python?', ['func', 'def', 'function', 'lambda only'], 1, 'Basics', '`def name():` defines a function.'],
    ['What does `len([1, 2, 3])` return?', ['2', '3', '6', 'Error'], 1, 'Basics', 'len returns the number of items.'],
    ['Which library is used for data frames?', ['pandas', 'requests', 'flask', 'pytest'], 0, 'Data', 'pandas provides the DataFrame type.'],
    ['`df.head()` shows…', ['The last rows', 'The first five rows', 'Column types', 'A chart'], 1, 'Data', 'head() returns the first n rows (5 by default).'],
    ['Which is a mutable type?', ['tuple', 'str', 'list', 'int'], 2, 'Basics', 'Lists can be changed in place.'],
    ['Which library is common for plotting?', ['matplotlib', 'numpy.random', 'os', 'json'], 0, 'Visualisation', 'matplotlib is the classic plotting library.'],
    ['What does an API key usually do?', ['Speeds up Python', 'Identifies and authorises your app to a service', 'Encrypts files', 'Installs packages'], 1, 'AI APIs', 'Keys authenticate requests; keep them secret.'],
    ['`pip install` is used to…', ['Run a script', 'Install packages', 'Create a function', 'Open a file'], 1, 'Basics', 'pip installs packages from PyPI.'],
  ]),
  ...bank('gen', [
    ['What is the best first step before starting a new topic?', ['Skip to the quiz', 'Skim the outline and goals', 'Download everything', 'Watch at 2x only'], 1, 'Study skills', 'Knowing the goals helps you focus on what matters.'],
    ['Spaced repetition means…', ['Studying once for many hours', 'Reviewing material at increasing intervals', 'Reading faster', 'Highlighting everything'], 1, 'Study skills', 'Spacing reviews improves long-term memory.'],
    ['A good way to check understanding is to…', ['Re-read silently', 'Explain it in your own words', 'Copy the slides', 'Skip practice'], 1, 'Study skills', 'Teaching it back reveals gaps.'],
    ['Practice projects help because they…', ['Replace all theory', 'Apply ideas to real problems', 'Are always graded', 'Take no time'], 1, 'Practice', 'Application turns knowledge into skill.'],
    ['When stuck on a lesson, the best move is to…', ['Give up', 'Ask a doubt in Q&A with details', 'Skip the course', 'Guess'], 1, 'Practice', 'Specific questions get faster, better answers.'],
    ['Notes are most useful when they…', ['Copy every word', 'Capture key ideas with examples', 'Are never reviewed', 'Are only images'], 1, 'Study skills', 'Short, example-led notes are easier to revise.'],
  ]),
];

const ids = (prefix: string, n?: number) => QUESTIONS.filter((q) => q.id.startsWith(prefix)).slice(0, n).map((q) => q.id);
const inDays = (d: number, h = 23, m = 59) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  x.setHours(h, m, 0, 0);
  return x.toISOString();
};

/** One quiz assessment per quiz lesson in every course, plus exams and assignments. */
function quizzesFromCurriculum(): Assessment[] {
  return courses.flatMap((c) =>
    c.modules.flatMap((m) =>
      m.lessons
        .filter((l) => l.type === 'quiz')
        .map((l) => {
          const bankKey = /seo/i.test(l.title) || /SEO/.test(m.title) ? 'seo' : c.id === 'c_dm_ai' ? 'dmi' : c.categoryId === 'ai-data' ? 'py' : c.categoryId === 'marketing' ? 'dmi' : 'gen';
          const qs = ids(bankKey, l.questions);
          return { id: `as_${l.id}`, courseId: c.id, kind: 'quiz' as const, title: l.title, moduleTitle: m.title, lessonId: l.id, durationMin: Math.max(5, Math.ceil(qs.length * 1.5)), marks: qs.length, passPct: 60, questionIds: qs };
        }),
    ),
  );
}

export const ASSESSMENTS: Assessment[] = [
  ...quizzesFromCurriculum(),
  { id: 'ex_m2', courseId: 'c_dm_ai', kind: 'exam', title: 'Module 2 – Assessment', moduleTitle: 'SEO Strategy & Tools', durationMin: 30, marks: 50, passPct: 60, questionIds: [...ids('seo'), ...ids('dmi')] },
  { id: 'ex_final', courseId: 'c_dm_ai', kind: 'exam', title: 'Final Course Assessment', durationMin: 90, marks: 100, passPct: 65, opensAt: inDays(9, 17, 0), questionIds: [...ids('seo'), ...ids('dmi')] },
  {
    id: 'asg_kw',
    courseId: 'c_dm_ai',
    kind: 'assignment',
    title: 'Keyword Research Project',
    moduleTitle: 'SEO Strategy & Tools',
    marks: 20,
    passPct: 50,
    dueAt: inDays(4),
    instructions: 'Perform keyword research for a real business or niche and create a keyword strategy report. Use professional SEO tools (e.g. Google Keyword Planner, Ahrefs or Semrush) and submit your findings in the required format.',
    requirements: ['Identify 20–30 relevant keywords', 'Include keyword metrics (volume, difficulty, intent)', 'Group keywords by topic/cluster', 'Suggest a content plan (minimum 5 topics)', 'Submit as a PDF or a shareable Google Doc link'],
    resources: [{ name: 'Assignment_Template.pdf', kind: 'pdf', size: '248 KB' }, { name: 'Recommended tools & references', kind: 'link' }],
    accepts: ['PDF', 'DOC', 'DOCX', 'ZIP'],
    maxMb: 50,
  },
  {
    id: 'asg_audit',
    courseId: 'c_dm_ai',
    kind: 'assignment',
    title: 'SEO Audit Report',
    moduleTitle: 'SEO Strategy & Tools',
    marks: 20,
    passPct: 50,
    dueAt: inDays(6),
    instructions: 'Audit any small business website. Cover technical health, on-page issues and three quick wins.',
    requirements: ['Run a crawl and list top 10 issues', 'Check Core Web Vitals for 3 key pages', 'Recommend 3 quick wins with expected impact'],
    resources: [{ name: 'Audit_Checklist.pdf', kind: 'pdf', size: '180 KB' }],
    accepts: ['PDF', 'DOCX'],
    maxMb: 25,
  },
  {
    id: 'asg_meta',
    courseId: 'c_dm_ai',
    kind: 'assignment',
    title: 'Create a Meta Ads Campaign',
    moduleTitle: 'Paid Advertising (Google & Meta)',
    marks: 25,
    passPct: 50,
    dueAt: inDays(9),
    instructions: 'Plan a Meta Ads campaign for a local brand: objective, audiences, three creatives and a ₹5,000 test budget split.',
    requirements: ['Campaign objective and KPI', 'Two audience definitions', 'Three ad creative mockups', 'Budget split with reasoning'],
    resources: [{ name: 'Campaign_Planner.pdf', kind: 'pdf', size: '320 KB' }],
    accepts: ['PDF', 'ZIP'],
    maxMb: 50,
  },
  {
    id: 'asg_content',
    courseId: 'c_dm_ai',
    kind: 'assignment',
    title: 'Content Strategy Plan',
    moduleTitle: 'Social Media Marketing',
    marks: 20,
    passPct: 50,
    dueAt: inDays(-1),
    instructions: 'Build a one-month content calendar for a brand of your choice.',
    requirements: ['Three content pillars', '12 post ideas with formats', 'Posting schedule'],
    rubric: [{ item: 'Three content pillars', max: 7 }, { item: '12 post ideas with formats', max: 7 }, { item: 'Posting schedule', max: 6 }],
    resources: [],
    accepts: ['PDF', 'DOCX'],
    maxMb: 25,
  },
  {
    id: 'asg_final',
    courseId: 'c_dm_ai',
    kind: 'assignment',
    title: 'Final Project – Digital Marketing Campaign',
    moduleTitle: 'Capstone: Launch a Campaign',
    marks: 100,
    passPct: 60,
    dueAt: inDays(-5),
    instructions: 'Plan and present a full-funnel campaign: research, channels, creatives, budget and measurement.',
    requirements: ['Research summary', 'Channel plan', 'Creatives', 'Budget & KPIs', 'Measurement plan'],
    resources: [],
    accepts: ['PDF', 'ZIP'],
    maxMb: 100,
  },
];
