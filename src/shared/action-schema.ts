import { z } from 'zod';

// ─── Phase 3B: Action Target Abstraction ──────────────────────────────────────

export const windowTargetSchema = z.object({
  type: z.literal('window'),
  title: z.string().optional(),
  processName: z.string().optional()
});

export const uiElementTargetSchema = z.object({
  type: z.literal('ui_element'),
  role: z.string().optional(),
  name: z.string().optional(),
  automationId: z.string().optional()
});

export const browserElementTargetSchema = z.object({
  type: z.literal('browser_element'),
  selector: z.string().optional(),
  role: z.string().optional(),
  name: z.string().optional(),
  text: z.string().optional()
});

export const coordinateTargetSchema = z.object({
  type: z.literal('coordinate'),
  x: z.number().int(),
  y: z.number().int()
});

export const actionTargetSchema = z.discriminatedUnion('type', [
  windowTargetSchema,
  uiElementTargetSchema,
  browserElementTargetSchema,
  coordinateTargetSchema
]);

export type WindowTarget = z.infer<typeof windowTargetSchema>;
export type UiElementTarget = z.infer<typeof uiElementTargetSchema>;
export type BrowserElementTarget = z.infer<typeof browserElementTargetSchema>;
export type CoordinateTarget = z.infer<typeof coordinateTargetSchema>;
export type ActionTarget = z.infer<typeof actionTargetSchema>;

// ─── Risk ─────────────────────────────────────────────────────────────────────

export const actionRiskSchema = z.enum(['low', 'medium', 'high']);
export type ActionRisk = z.infer<typeof actionRiskSchema>;

const actionBaseSchema = z.object({
  id: z.string().min(1),
  reason: z.string().optional(),
  risk: actionRiskSchema.optional(),
  requiresConfirmation: z.boolean().optional(),
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

// ─── Phase 3B: New Action Schemas ─────────────────────────────────────────────

export const navigateActionSchema = actionBaseSchema.extend({
  action: z.literal('navigate'),
  url: z.string().min(1)
});

export const findWindowActionSchema = actionBaseSchema.extend({
  action: z.literal('find_window'),
  query: z.string().min(1)
});

export const findUiElementActionSchema = actionBaseSchema.extend({
  action: z.literal('find_ui_element'),
  windowTitle: z.string().min(1),
  query: z.string().min(1),
  role: z.string().optional(),
  name: z.string().optional()
});

export const findBrowserElementActionSchema = actionBaseSchema.extend({
  action: z.literal('find_browser_element'),
  selector: z.string().optional(),
  role: z.string().optional(),
  name: z.string().optional(),
  text: z.string().optional()
});

export const waitForConditionActionSchema = actionBaseSchema.extend({
  action: z.literal('wait_for_condition'),
  condition: z.enum(['process_exists', 'window_exists', 'url_matches', 'element_exists']),
  target: z.string().min(1),
  timeoutMs: z.number().int().min(100).max(30000).default(5000)
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
  fileOperationActionSchema,
  navigateActionSchema,
  findWindowActionSchema,
  findUiElementActionSchema,
  findBrowserElementActionSchema,
  waitForConditionActionSchema
]);

export const actionStatusSchema = z.enum([
  'pending',
  'running',
  'success',
  'completed',
  'failed',
  'blocked',
  'unsupported',
  'needs_confirmation',
  'cancelled'
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

export function isDestructiveAction(action: DesktopAction): boolean {
  if (action.action === 'close_app') return true;
  if (action.action === 'file_operation' && action.operation === 'delete') return true;
  if (action.risk === 'high' || action.requiresConfirmation) return true;
  return false;
}

export function evaluateActionRisk(action: DesktopAction): {
  risk: ActionRisk;
  requiresConfirmation: boolean;
  reason?: string;
} {
  if (action.action === 'close_app') {
    return {
      risk: 'high',
      requiresConfirmation: true,
      reason: `Closing application "${action.appName}" may cause unsaved data loss.`
    };
  }

  if (action.action === 'file_operation' && action.operation === 'delete') {
    return {
      risk: 'high',
      requiresConfirmation: true,
      reason: `Deleting file "${action.path}" is irreversible.`
    };
  }

  if (action.action === 'file_operation' && action.operation === 'write' && action.overwrite) {
    return {
      risk: 'medium',
      requiresConfirmation: true,
      reason: `Overwriting file "${action.path}" will replace its current content.`
    };
  }

  return {
    risk: action.risk || 'low',
    requiresConfirmation: action.requiresConfirmation || false
  };
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
