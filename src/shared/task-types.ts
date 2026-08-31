export const taskTypes = [
  'general',
  'coding',
  'fast',
  'complex',
  'grammar',
  'planning',
  'computer',
  'vision'
] as const;

export type TaskType = (typeof taskTypes)[number];

export const taskTypeLabels: Record<TaskType, string> = {
  general: 'General',
  coding: 'Coding',
  fast: 'Fast tasks',
  complex: 'Complex reasoning',
  grammar: 'Grammar & text',
  planning: 'Planning',
  computer: 'Computer',
  vision: 'Vision'
};

export function isTaskType(value: string): value is TaskType {
  return taskTypes.includes(value as TaskType);
}
