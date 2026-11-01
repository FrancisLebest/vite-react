export const CATEGORIES = [
  { id: 'study-tips', label: 'Study Tips', icon: 'school-outline' },
  { id: 'exams', label: 'Exams', icon: 'document-text-outline' },
  { id: 'assignments', label: 'Assignments', icon: 'clipboard-outline' },
  { id: 'math', label: 'Math', icon: 'calculator-outline' },
  { id: 'science', label: 'Science', icon: 'flask-outline' },
  { id: 'programming', label: 'Programming', icon: 'laptop-outline' },
  { id: 'business', label: 'Business', icon: 'bar-chart-outline' },
  { id: 'notes', label: 'Notes', icon: 'book-outline' },
  { id: 'languages', label: 'Languages', icon: 'language-outline' },
  { id: 'other', label: 'Other', icon: 'apps-outline' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];
