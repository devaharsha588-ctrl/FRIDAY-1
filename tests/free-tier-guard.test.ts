import { describe, it, expect } from 'vitest';
import {
  guardMessageContent,
  guardMemoryContent,
  guardTaskGoal,
  guardActionResultSummary,
  guardJsonMetadata,
  guardConversationTitle,
  guardPreferenceKey,
  assertGuard,
  FreeTierViolationError,
  FREE_TIER_LIMITS
} from '../src/backend/database/free-tier-guard';

describe('Free-tier guards', () => {
  // ─── message content ──────────────────────────────────────────────────────
  it('allows normal message content', () => {
    expect(guardMessageContent('Hello FRIDAY! How are you?')).toEqual({ ok: true });
  });

  it('allows message content at exactly the limit', () => {
    expect(guardMessageContent('x'.repeat(FREE_TIER_LIMITS.messageContent))).toEqual({ ok: true });
  });

  it('rejects message content exceeding 50,000 chars', () => {
    const result = guardMessageContent('x'.repeat(50_001));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('50,000');
  });

  // ─── memory content ───────────────────────────────────────────────────────
  it('allows normal memory content', () => {
    expect(guardMemoryContent('User prefers TypeScript over JavaScript')).toEqual({ ok: true });
  });

  it('rejects memory content exceeding 5,000 chars', () => {
    const result = guardMemoryContent('x'.repeat(5_001));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('5,000');
  });

  it('allows memory content at exactly 5,000 chars', () => {
    expect(guardMemoryContent('x'.repeat(5_000))).toEqual({ ok: true });
  });

  // ─── task goal ────────────────────────────────────────────────────────────
  it('allows normal task goals', () => {
    expect(guardTaskGoal('Open YouTube and search for TypeScript tutorials')).toEqual({ ok: true });
  });

  it('rejects task goals exceeding 20,000 chars', () => {
    const result = guardTaskGoal('x'.repeat(20_001));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('20,000');
  });

  // ─── action result summary ────────────────────────────────────────────────
  it('allows normal action result summaries', () => {
    expect(guardActionResultSummary('Clicked the submit button successfully')).toEqual({ ok: true });
  });

  it('rejects action summaries exceeding 10,000 chars', () => {
    const result = guardActionResultSummary('x'.repeat(10_001));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('10,000');
  });

  // ─── JSON metadata ────────────────────────────────────────────────────────
  it('allows null metadata', () => {
    expect(guardJsonMetadata(null)).toEqual({ ok: true });
  });

  it('allows small metadata objects', () => {
    expect(guardJsonMetadata({ theme: 'dark', version: 1 })).toEqual({ ok: true });
  });

  it('rejects metadata exceeding 10 KB', () => {
    const result = guardJsonMetadata({ data: 'x'.repeat(11_000) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('10,240');
  });

  it('allows metadata at just under 10 KB', () => {
    // 9900 bytes of content ~ under 10240 bytes JSON-serialized
    expect(guardJsonMetadata({ data: 'x'.repeat(9_000) })).toEqual({ ok: true });
  });

  // ─── conversation title ───────────────────────────────────────────────────
  it('allows normal conversation titles', () => {
    expect(guardConversationTitle('My coding session')).toEqual({ ok: true });
  });

  it('rejects titles exceeding 500 chars', () => {
    const result = guardConversationTitle('x'.repeat(501));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('500');
  });

  // ─── preference key ───────────────────────────────────────────────────────
  it('allows normal preference keys', () => {
    expect(guardPreferenceKey('theme')).toEqual({ ok: true });
    expect(guardPreferenceKey('response_style')).toEqual({ ok: true });
  });

  it('rejects preference keys exceeding 200 chars', () => {
    const result = guardPreferenceKey('k'.repeat(201));
    expect(result.ok).toBe(false);
  });

  // ─── assertGuard ─────────────────────────────────────────────────────────
  it('assertGuard passes on ok result', () => {
    expect(() => assertGuard({ ok: true })).not.toThrow();
  });

  it('assertGuard throws FreeTierViolationError on failure', () => {
    expect(() => assertGuard({ ok: false, error: 'Too large' })).toThrow(FreeTierViolationError);
  });

  it('FreeTierViolationError has correct name', () => {
    try {
      assertGuard({ ok: false, error: 'Too large' });
    } catch (e) {
      expect(e).toBeInstanceOf(FreeTierViolationError);
      expect((e as Error).name).toBe('FreeTierViolationError');
    }
  });

  // ─── Does not reject normal conversational messages ───────────────────────
  it('does not reject normal chat messages of reasonable length', () => {
    const normalMessage = 'Can you help me write a TypeScript function that sorts an array of objects by multiple keys? Here is what I need: '.repeat(10);
    expect(guardMessageContent(normalMessage)).toEqual({ ok: true });
  });
});
