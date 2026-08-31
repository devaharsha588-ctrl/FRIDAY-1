import type { TaskType } from '../../shared/task-types';

const codePattern = /\b(code|bug|typescript|javascript|python|react|node|api|repo|git|build|lint|test|compile|function|component)\b/i;
const planningPattern = /\b(plan|strategy|roadmap|steps|break down|architecture|design the system|orchestrate)\b/i;
const computerPattern = /\b(open|close|click|type|keypress|keyboard|mouse|window|app|application|browser|tab|file|folder|desktop|whatsapp|send message|read screen|wait)\b/i;
const visionPattern = /\b(image|screenshot|screen|visual|ocr|see|look at|inspect the screen|read screen)\b/i;
const fastPattern = /\b(quick|fast|brief|summarize|rewrite|translate|short answer)\b/i;

export function classifyTask(input: string): TaskType {
  const text = input.trim();

  if (!text) return 'general';
  if (visionPattern.test(text) && /\b(screen|screenshot|image|visual|ocr)\b/i.test(text)) return 'vision';
  if (computerPattern.test(text)) return 'computer';
  if (codePattern.test(text)) return 'coding';
  if (planningPattern.test(text)) return 'planning';
  if (fastPattern.test(text) && text.length < 600) return 'fast';

  return 'general';
}
