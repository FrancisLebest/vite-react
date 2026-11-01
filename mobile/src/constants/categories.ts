import type {Category, CategoryId} from '../api/types';

/**
 * Static reference data — identical to `GET /categories` (ids are fixed by the
 * API contract). Used only as an offline/first-paint fallback and for icons.
 */
export const STATIC_CATEGORIES: Category[] = [
  {id: 'study-tips', label: 'Study Tips', icon: 'school-outline'},
  {id: 'exams', label: 'Exams', icon: 'document-text-outline'},
  {id: 'assignments', label: 'Assignments', icon: 'clipboard-outline'},
  {id: 'math', label: 'Math', icon: 'calculator-outline'},
  {id: 'science', label: 'Science', icon: 'flask-outline'},
  {id: 'programming', label: 'Programming', icon: 'laptop-outline'},
  {id: 'business', label: 'Business', icon: 'bar-chart-outline'},
  {id: 'notes', label: 'Notes', icon: 'book-outline'},
  {id: 'languages', label: 'Languages', icon: 'language-outline'},
  {id: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline'},
];

export function categoryLabel(
  id: CategoryId,
  list: Category[] = STATIC_CATEGORIES,
): string {
  return (
    list.find(c => c.id === id)?.label ??
    STATIC_CATEGORIES.find(c => c.id === id)?.label ??
    id
  );
}

export const COMMUNITY_ICONS = [
  'school-outline',
  'book-outline',
  'code-slash-outline',
  'flask-outline',
  'calculator-outline',
  'bulb-outline',
  'business-outline',
  'globe-outline',
  'musical-notes-outline',
  'basketball-outline',
];

export const COMMUNITY_COLORS = [
  '#3B1FA8',
  '#5B3FD6',
  '#E5484D',
  '#2FB36B',
  '#F5A524',
  '#0EA5E9',
  '#DB2777',
  '#16142B',
];

export const ROLES = [
  {key: 'student', label: 'Student'},
  {key: 'professor', label: 'Professor'},
  {key: 'creator', label: 'Creator'},
] as const;
