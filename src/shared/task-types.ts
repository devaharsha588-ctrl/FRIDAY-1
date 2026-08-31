export const taskTypes = ['general', 'coding', 'planning', 'computer', 'vision', 'fast'] as const;

export type TaskType = (typeof taskTypes)[number];

export const taskTypeLabels: Record<TaskType, string> = {
  general: 'General',
  coding: 'Coding',
  planning: 'Planning',
  computer: 'Computer',
  vision: 'Vision',
  fast: 'Fast tasks'
};

export function isTaskType(value: string): value is TaskType {
  return taskTypes.includes(value as TaskType);
}

