import { Ionicons } from '@expo/vector-icons';
import type { AssessKind } from '@/core/assess';

export const KIND_META: Record<AssessKind, { icon: keyof typeof Ionicons.glyphMap; label: string; tint: string; color: string }> = {
  quiz: { icon: 'help-circle', label: 'Quiz', tint: '#E9F0FD', color: '#1D5FD0' },
  exam: { icon: 'school', label: 'Exam', tint: '#F1ECFC', color: '#7C3AED' },
  assignment: { icon: 'document-text', label: 'Assignment', tint: '#FDF3E1', color: '#B7791F' },
};
