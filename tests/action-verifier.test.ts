import { describe, it, expect, vi } from 'vitest';
import { extractExpectedDomain, verifyAction, type VerificationContext } from '../src/backend/orchestrator/action-verifier';
import type { DesktopAction, ActionResult, ActionStatus } from '../src/shared/action-schema';

function mockResult(status: ActionStatus, options?: Partial<ActionResult>): ActionResult {
  return {
    id: 'test-res-id',
    action: 'test-action',
    status,
    summary: 'test summary',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...options
  };
}

describe('action-verifier', () => {
  describe('extractExpectedDomain', () => {
    it('extracts domain from http urls', () => {
      expect(extractExpectedDomain('http://example.com/foo/bar')).toBe('example.com');
    });
    
    it('extracts domain from https urls', () => {
      expect(extractExpectedDomain('https://www.google.com/search?q=test')).toBe('www.google.com');
    });

    it('returns null for invalid urls', () => {
      expect(extractExpectedDomain('not-a-valid-url')).toBeNull();
    });
  });

  describe('verifyAction', () => {
    const mockContext = (): VerificationContext => ({
      checkProcessExists: vi.fn(),
      findWindows: vi.fn(),
      getBrowserUrl: vi.fn(),
      getBrowserTitle: vi.fn()
    });

    describe('open_app', () => {
      it('is verified when checkProcessExists returns true', async () => {
        const ctx = mockContext();
        vi.mocked(ctx.checkProcessExists).mockResolvedValue(true);
        const action: DesktopAction = { id: '1', action: 'open_app', appName: 'notepad' };
        const result = mockResult('success');
        const res = await verifyAction(action, result, ctx);
        expect(res).toEqual({
          verified: true,
          observation: 'Process notepad is running',
          confidence: 'high',
          retryable: false
        });
      });

      it('is unverified and retryable when checkProcessExists returns false', async () => {
        const ctx = mockContext();
        vi.mocked(ctx.checkProcessExists).mockResolvedValue(false);
        const action: DesktopAction = { id: '1', action: 'open_app', appName: 'notepad' };
        const result = mockResult('success');
        const res = await verifyAction(action, result, ctx);
        expect(res).toEqual({
          verified: false,
          observation: 'Process notepad is not running',
          confidence: 'high',
          retryable: true
        });
      });
    });

    describe('open_url / navigate', () => {
      it('is verified when getBrowserUrl returns URL with matching domain', async () => {
        const ctx = mockContext();
        vi.mocked(ctx.getBrowserUrl!).mockResolvedValue('https://www.google.com/search');
        const action: DesktopAction = { id: '1', action: 'open_url', url: 'https://www.google.com' };
        const result = mockResult('success');
        const res = await verifyAction(action, result, ctx);
        expect(res).toEqual({
          verified: true,
          observation: 'Browser URL matches expected domain www.google.com',
          confidence: 'high',
          retryable: false
        });
      });

      it('is unverified and retryable when getBrowserUrl returns different domain', async () => {
        const ctx = mockContext();
        vi.mocked(ctx.getBrowserUrl!).mockResolvedValue('https://example.com');
        const action: DesktopAction = { id: '1', action: 'open_url', url: 'https://www.google.com' };
        const result = mockResult('success');
        const res = await verifyAction(action, result, ctx);
        expect(res).toEqual({
          verified: false,
          observation: 'Browser URL https://example.com does not match expected domain www.google.com',
          confidence: 'high',
          retryable: true
        });
      });

      it('is verified with low confidence when getBrowserUrl is undefined', async () => {
        const ctx = mockContext();
        ctx.getBrowserUrl = undefined;
        const action: DesktopAction = { id: '1', action: 'open_url', url: 'https://www.google.com' };
        const result = mockResult('success');
        const res = await verifyAction(action, result, ctx);
        expect(res).toEqual({
          verified: true,
          observation: 'Browser URL check not available, assuming success',
          confidence: 'low',
          retryable: false
        });
      });
    });

    describe('close_app', () => {
      it('is verified when process does not exist', async () => {
        const ctx = mockContext();
        vi.mocked(ctx.checkProcessExists).mockResolvedValue(false);
        const action: DesktopAction = { id: '1', action: 'close_app', appName: 'notepad' };
        const result = mockResult('success');
        const res = await verifyAction(action, result, ctx);
        expect(res).toEqual({
          verified: true,
          observation: 'Process notepad is not running',
          confidence: 'high',
          retryable: false
        });
      });

      it('is unverified and retryable when process still exists', async () => {
        const ctx = mockContext();
        vi.mocked(ctx.checkProcessExists).mockResolvedValue(true);
        const action: DesktopAction = { id: '1', action: 'close_app', appName: 'notepad' };
        const result = mockResult('success');
        const res = await verifyAction(action, result, ctx);
        expect(res).toEqual({
          verified: false,
          observation: 'Process notepad is still running',
          confidence: 'high',
          retryable: true
        });
      });
    });

    describe('switch_window', () => {
      it('is verified when result has matchedTitle', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'switch_window', title: 'Note' };
        const result = mockResult('success', { data: { matchedTitle: 'Untitled - Notepad' } });
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(true);
        expect(res.observation).toBe('Switched to window: Untitled - Notepad');
      });

      it('is unverified and retryable when result failed or no matchedTitle', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'switch_window', title: 'Note' };
        const result = mockResult('success', { data: {} });
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(false);
        expect(res.retryable).toBe(true);
      });
    });

    describe('type_text & keypress', () => {
      it('is verified (medium confidence) on success for type_text', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'type_text', text: 'hello' };
        const result = mockResult('success');
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(true);
        expect(res.confidence).toBe('medium');
      });

      it('is unverified and not retryable on failure for type_text', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'type_text', text: 'hello' };
        const result = mockResult('failed');
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(false);
        expect(res.retryable).toBe(false);
      });
    });

    describe('click', () => {
      it('is verified on success (low confidence, retryable)', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'click', button: 'left', target: 'button' };
        const result = mockResult('success');
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(true);
        expect(res.confidence).toBe('low');
        expect(res.retryable).toBe(true);
      });
    });

    describe('find_element / find_window', () => {
      it('is verified when matches array has items', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'find_element', query: 'btn' };
        const result = mockResult('success', { data: { matches: [{ title: 'Button' }] } });
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(true);
        expect(res.observation).toContain('Found 1 matches');
      });

      it('is unverified and retryable when matches is empty', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'find_element', query: 'btn' };
        const result = mockResult('success', { data: { matches: [] } });
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(false);
        expect(res.retryable).toBe(true);
      });
    });

    describe('find_ui_element / find_browser_element', () => {
      it('is verified when result data is present', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'find_ui_element', windowTitle: 'App', query: 'btn' };
        const result = mockResult('success', { data: { name: 'Search', role: 'Button' } });
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(true);
      });

      it('is unverified and retryable when result data is null/undefined', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'find_ui_element', windowTitle: 'App', query: 'btn' };
        const result = mockResult('success', { data: null });
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(false);
        expect(res.retryable).toBe(true);
      });
    });

    describe('wait_for_condition', () => {
      it('is verified on success', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'wait_for_condition', condition: 'process_exists', target: 'notepad', timeoutMs: 5000 };
        const result = mockResult('success');
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(true);
      });

      it('is unverified and retryable on failure', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'wait_for_condition', condition: 'process_exists', target: 'notepad', timeoutMs: 5000 };
        const result = mockResult('failed');
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(false);
        expect(res.retryable).toBe(true);
      });
    });

    describe('file_operation', () => {
      it('read/list: unverified + retryable on failure', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'file_operation', operation: 'read', path: 'test.txt' };
        const result = mockResult('failed');
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(false);
        expect(res.retryable).toBe(true);
      });

      it('write/delete: unverified + not retryable on failure', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'file_operation', operation: 'write', path: 'test.txt', content: 'content' };
        const result = mockResult('failed');
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(false);
        expect(res.retryable).toBe(false);
      });
    });

    describe('Statuses: blocked, unsupported, cancelled, needs_confirmation', () => {
      it('returns unverified + not retryable for blocked', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'open_app', appName: 'cmd' };
        const result = mockResult('blocked');
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(false);
        expect(res.retryable).toBe(false);
      });

      it('returns unverified + not retryable for cancelled', async () => {
        const ctx = mockContext();
        const action: DesktopAction = { id: '1', action: 'open_app', appName: 'cmd' };
        const result = mockResult('cancelled');
        const res = await verifyAction(action, result, ctx);
        expect(res.verified).toBe(false);
        expect(res.retryable).toBe(false);
      });
    });
  });
});
