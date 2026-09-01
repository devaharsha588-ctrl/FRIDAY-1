/**
 * Free-tier content guards for Supabase.
 * Enforces payload size limits to keep the Free-plan database small.
 * Rejects oversized payloads rather than silently truncating.
 */

export type GuardResult = { ok: true } | { ok: false; error: string };

// Default limits — designed for comfortable personal use well below Supabase Free limits
const LIMITS = {
  messageContent: 50_000,       // characters
  memoryContent: 5_000,         // characters
  taskGoal: 20_000,             // characters
  actionResultSummary: 10_000,  // characters
  jsonMetadata: 10_240,         // bytes (10 KB)
  conversationTitle: 500,       // characters
  preferenceKey: 200,           // characters
} as const;

export type FreeTierLimits = typeof LIMITS;

function byteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

export function guardMessageContent(content: string): GuardResult {
  if (content.length > LIMITS.messageContent) {
    return {
      ok: false,
      error: `Message content exceeds the ${LIMITS.messageContent.toLocaleString()} character limit (got ${content.length.toLocaleString()}).`
    };
  }
  return { ok: true };
}

export function guardMemoryContent(content: string): GuardResult {
  if (content.length > LIMITS.memoryContent) {
    return {
      ok: false,
      error: `Memory content exceeds the ${LIMITS.memoryContent.toLocaleString()} character limit (got ${content.length.toLocaleString()}). Keep memories concise.`
    };
  }
  return { ok: true };
}

export function guardTaskGoal(goal: string): GuardResult {
  if (goal.length > LIMITS.taskGoal) {
    return {
      ok: false,
      error: `Task goal exceeds the ${LIMITS.taskGoal.toLocaleString()} character limit (got ${goal.length.toLocaleString()}).`
    };
  }
  return { ok: true };
}

export function guardActionResultSummary(summary: string): GuardResult {
  if (summary.length > LIMITS.actionResultSummary) {
    return {
      ok: false,
      error: `Action result summary exceeds the ${LIMITS.actionResultSummary.toLocaleString()} character limit (got ${summary.length.toLocaleString()}).`
    };
  }
  return { ok: true };
}

export function guardJsonMetadata(metadata: unknown): GuardResult {
  if (metadata === null || metadata === undefined) return { ok: true };
  const bytes = byteSize(metadata);
  if (bytes > LIMITS.jsonMetadata) {
    return {
      ok: false,
      error: `Metadata payload exceeds the ${LIMITS.jsonMetadata.toLocaleString()} byte limit (got ${bytes.toLocaleString()} bytes). Reduce metadata size.`
    };
  }
  return { ok: true };
}

export function guardConversationTitle(title: string): GuardResult {
  if (title.length > LIMITS.conversationTitle) {
    return {
      ok: false,
      error: `Conversation title exceeds the ${LIMITS.conversationTitle.toLocaleString()} character limit (got ${title.length.toLocaleString()}).`
    };
  }
  return { ok: true };
}

export function guardPreferenceKey(key: string): GuardResult {
  if (key.length > LIMITS.preferenceKey) {
    return {
      ok: false,
      error: `Preference key exceeds the ${LIMITS.preferenceKey.toLocaleString()} character limit (got ${key.length.toLocaleString()}).`
    };
  }
  return { ok: true };
}

/**
 * Throws a FreeTierViolationError if any guard fails.
 * Convenience wrapper for use in repository methods.
 */
export function assertGuard(result: GuardResult): void {
  if (!result.ok) {
    throw new FreeTierViolationError(result.error);
  }
}

export class FreeTierViolationError extends Error {
  constructor(message: string) {
    super(`[FreeTier] ${message}`);
    this.name = 'FreeTierViolationError';
  }
}

export { LIMITS as FREE_TIER_LIMITS };
