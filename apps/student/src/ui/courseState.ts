import type { CourseState } from '@/api/client';

/** Label + tone for a course's lifecycle/listing state (educator views). */
export const STATE_META: Record<CourseState, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'gold' | 'live'; icon: string; help: string }> = {
  draft: { label: 'Draft', tone: 'neutral', icon: 'create-outline', help: 'Only you can see this course.' },
  private: { label: 'Published · your site', tone: 'info', icon: 'lock-closed', help: 'Live on your site and private links. Not on the Bodhin marketplace.' },
  in_review: { label: 'Awaiting Bodhin approval', tone: 'warning', icon: 'hourglass', help: 'Live on your site. Bodhin is reviewing the marketplace listing (usually 24–48 h).' },
  listed: { label: 'Published', tone: 'success', icon: 'storefront', help: 'Live on your site and listed in the Bodhin marketplace.' },
  promoted: { label: 'Published + promotion', tone: 'gold', icon: 'megaphone', help: 'Listed, and Bodhin may feature it in campaigns and newsletters.' },
  changes: { label: 'Changes requested', tone: 'live', icon: 'alert-circle', help: 'Bodhin asked for changes before listing. Still live on your site.' },
  archived: { label: 'Archived', tone: 'neutral', icon: 'archive', help: 'Hidden from new students. Enrolled students keep access.' },
};
