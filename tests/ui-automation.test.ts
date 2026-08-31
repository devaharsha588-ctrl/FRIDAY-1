import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getWindowState,
  findUiElement,
  getUiElementState,
  listUiElements,
  clickUiElement,
  waitForWindow,
  checkProcessExists,
} from '../src/local-agent/adapters/ui-automation';
import { runPowerShell } from '../src/local-agent/adapters/windows-adapter';

vi.mock('../src/local-agent/adapters/windows-adapter', () => ({
  runPowerShell: vi.fn(),
}));

describe('UI Automation Adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('checkProcessExists', () => {
    it('returns true when PowerShell returns the process name', async () => {
      vi.mocked(runPowerShell).mockResolvedValue('1');
      const result = await checkProcessExists('notepad');
      expect(result).toBe(true);
      expect(runPowerShell).toHaveBeenCalled();
    });

    it('returns false when PowerShell returns empty or null', async () => {
      vi.mocked(runPowerShell).mockResolvedValue('');
      const result = await checkProcessExists('notepad');
      expect(result).toBe(false);
    });
  });

  describe('getWindowState', () => {
    it('returns parsed WindowState when PowerShell returns JSON', async () => {
      const mockState = { ProcessName: 'notepad', MainWindowTitle: 'Untitled - Notepad' };
      vi.mocked(runPowerShell).mockResolvedValue(JSON.stringify(mockState));
      const result = await getWindowState('notepad');
      expect(result).toEqual(mockState);
    });

    it('returns null on error or empty output', async () => {
      vi.mocked(runPowerShell).mockResolvedValue('');
      const result = await getWindowState('notepad');
      expect(result).toBeNull();
    });
  });

  describe('findUiElement', () => {
    it('returns parsed UiElementInfo when found', async () => {
      const mockElement = { Name: 'File', AutomationId: 'MenuBar' };
      vi.mocked(runPowerShell).mockResolvedValue(JSON.stringify(mockElement));
      const result = await findUiElement('notepad', { name: 'File' });
      expect(result).toEqual(mockElement);
    });

    it('returns null when element not found or invalid JSON', async () => {
      vi.mocked(runPowerShell).mockResolvedValue('Not found');
      const result = await findUiElement('notepad', { name: 'File' });
      expect(result).toBeNull();
    });
  });

  describe('getUiElementState', () => {
    it('returns element state', async () => {
      const mockState = { IsEnabled: true, HasKeyboardFocus: false };
      vi.mocked(runPowerShell).mockResolvedValue(JSON.stringify(mockState));
      const result = await getUiElementState('notepad', 'File');
      expect(result).toEqual(mockState);
    });
  });

  describe('listUiElements', () => {
    it('returns array of UiElementInfo', async () => {
      const mockElements = [{ Name: 'File' }, { Name: 'Edit' }];
      vi.mocked(runPowerShell).mockResolvedValue(JSON.stringify(mockElements));
      const result = await listUiElements('notepad');
      expect(result).toEqual(mockElements);
    });

    it('returns empty array on failure', async () => {
      vi.mocked(runPowerShell).mockResolvedValue('');
      const result = await listUiElements('notepad');
      expect(result).toEqual([]);
    });
  });

  describe('clickUiElement', () => {
    it('returns { success: true } on successful invoke', async () => {
      vi.mocked(runPowerShell).mockResolvedValue('{"success":true}');
      const result = await clickUiElement('notepad', { name: 'File' });
      expect(result).toEqual({ success: true });
    });

    it('returns { success: false, error: ... } on failure', async () => {
      vi.mocked(runPowerShell).mockRejectedValue(new Error('Failed to click'));
      const result = await clickUiElement('notepad', { name: 'File' });
      expect(result).toEqual({ success: false, error: 'Failed to click' });
    });
  });

  describe('waitForWindow', () => {
    it('returns WindowState when window appears within timeout', async () => {
      const mockState = { ProcessName: 'notepad', MainWindowTitle: 'Untitled - Notepad' };
      vi.mocked(runPowerShell).mockResolvedValue(JSON.stringify(mockState));
      const result = await waitForWindow('notepad', 1000);
      expect(result).toEqual(mockState);
    });

    it('returns null on timeout', async () => {
      vi.mocked(runPowerShell).mockResolvedValue('');
      const result = await waitForWindow('notepad', 100);
      expect(result).toBeNull();
    });
  });
});
