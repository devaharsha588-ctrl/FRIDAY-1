import { z } from 'zod';

const actionBaseSchema = z.object({
  id: z.string().min(1),
  reason: z.string().optional(),
  confirmed: z.boolean().optional()
});

export const openUrlActionSchema = actionBaseSchema.extend({
  action: z.literal('open_url'),
  url: z.string().url()
});

export const newTabActionSchema = actionBaseSchema.extend({
  action: z.literal('new_tab'),
  url: z.string().url().optional()
});

export const openAppActionSchema = actionBaseSchema.extend({
  action: z.literal('open_app'),
  appName: z.string().min(1)
});

export const closeAppActionSchema = actionBaseSchema.extend({
  action: z.literal('close_app'),
  appName: z.string().min(1)
});

export const switchWindowActionSchema = actionBaseSchema.extend({
  action: z.literal('switch_window'),
  appName: z.string().min(1).optional(),
  title: z.string().min(1).optional()
});

export const clickActionSchema = actionBaseSchema.extend({
  action: z.literal('click'),
  target: z.string().min(1).optional(),
  x: z.number().int().nonnegative().optional(),
  y: z.number().int().nonnegative().optional(),
  button: z.enum(['left', 'right', 'middle']).default('left')
}).refine((value) => value.target || (value.x !== undefined && value.y !== undefined), {
  message: 'click requires a target or coordinates'
});

export const typeTextActionSchema = actionBaseSchema.extend({
  action: z.literal('type_text'),
  target: z.string().min(1).optional(),
  text: z.string().min(1).max(4000)
});

export const keypressActionSchema = actionBaseSchema.extend({
  action: z.literal('keypress'),
  keys: z.array(z.string().min(1)).min(1).max(6)
});

export const readScreenActionSchema = actionBaseSchema.extend({
  action: z.literal('read_screen')
});

export const findElementActionSchema = actionBaseSchema.extend({
  action: z.literal('find_element'),
  query: z.string().min(1)
});

export const waitActionSchema = actionBaseSchema.extend({
  action: z.literal('wait'),
  ms: z.number().int().min(50).max(30000)
});

export const fileOperationActionSchema = actionBaseSchema.extend({
  action: z.literal('file_operation'),
  operation: z.enum(['list', 'read', 'write', 'mkdir', 'delete']),
  path: z.string().min(1).max(500),
  content: z.string().max(200000).optional(),
  overwrite: z.boolean().optional()
});

export const desktopActionSchema = z.union([
  openUrlActionSchema,
  newTabActionSchema,
  openAppActionSchema,
  closeAppActionSchema,
  switchWindowActionSchema,
  clickActionSchema,
  typeTextActionSchema,
  keypressActionSchema,
  readScreenActionSchema,
  findElementActionSchema,
  waitActionSchema,
  fileOperationActionSchema
]);

export const actionStatusSchema = z.enum([
  'success',
  'failed',
  'blocked',
  'unsupported',
  'needs_confirmation'
]);

export const actionResultSchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  status: actionStatusSchema,
  summary: z.string(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  startedAt: z.string(),
  completedAt: z.string()
});

export type DesktopAction = z.infer<typeof desktopActionSchema>;
export type ActionResult = z.infer<typeof actionResultSchema>;
export type ActionStatus = z.infer<typeof actionStatusSchema>;

export function parseDesktopAction(input: unknown): DesktopAction {
  return desktopActionSchema.parse(input);
}

export function createActionResult(
  action: DesktopAction,
  status: ActionStatus,
  summary: string,
  startedAt: Date,
  options: { data?: unknown; error?: string } = {}
): ActionResult {
  return {
    id: action.id,
    action: action.action,
    status,
    summary,
    data: options.data,
    error: options.error,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString()
  };
}
