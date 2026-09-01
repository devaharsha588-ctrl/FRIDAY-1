import { describe, it, expect } from 'vitest';
import { routeSimpleCommand, normalizeCommandText, isCompoundCommand } from '../src/backend/orchestrator/command-router';

describe('command-router', () => {
  describe('normalization', () => {
    it('strips polite prefixes and punctuation', () => {
      expect(normalizeCommandText('Open YouTube.')).toBe('Open YouTube');
      expect(normalizeCommandText('please open youtube')).toBe('open youtube');
      expect(normalizeCommandText('can you open youtube?')).toBe('open youtube');
      expect(normalizeCommandText('could you please open youtube')).toBe('open youtube');
      expect(normalizeCommandText('would you please open youtube')).toBe('open youtube');
      expect(normalizeCommandText('go ahead and open youtube')).toBe('open youtube');
      expect(normalizeCommandText('just open youtube')).toBe('open youtube');
    });
  });

  describe('websites and URLs', () => {
    it('recognizes youtube', () => {
      const r = routeSimpleCommand('Open YouTube.');
      expect(r.isSimple).toBe(true);
      if (r.isSimple) {
        expect(r.action.action).toBe('open_url');
        expect((r.action as any).url).toBe('https://www.youtube.com');
        expect(r.successMessage).toBe('Opened YouTube.');
      }
    });

    it('recognizes github', () => {
      const r = routeSimpleCommand('go to github.com');
      expect(r.isSimple).toBe(true);
      if (r.isSimple) {
        expect(r.action.action).toBe('open_url');
        expect((r.action as any).url).toBe('https://github.com');
      }
    });

    it('recognizes wikipedia', () => {
      const r = routeSimpleCommand('open wikipedia');
      expect(r.isSimple).toBe(true);
      if (r.isSimple) {
        expect(r.action.action).toBe('open_url');
        expect((r.action as any).url).toBe('https://www.wikipedia.org');
      }
    });

    it('recognizes chatgpt', () => {
      const r = routeSimpleCommand('open chatgpt');
      expect(r.isSimple).toBe(true);
      if (r.isSimple) {
        expect(r.action.action).toBe('open_url');
        expect((r.action as any).url).toBe('https://chatgpt.com');
      }
    });

    it('recognizes direct https URL', () => {
      const r = routeSimpleCommand('open https://youtube.com');
      expect(r.isSimple).toBe(true);
      if (r.isSimple) {
        expect(r.action.action).toBe('open_url');
        expect((r.action as any).url).toBe('https://youtube.com/');
      }
    });

    it('rejects dangerous URI schemes', () => {
      expect(routeSimpleCommand('javascript:alert(1)').isSimple).toBe(false);
      expect(routeSimpleCommand('data:text/html,<div>').isSimple).toBe(false);
      expect(routeSimpleCommand('file:///C:/windows').isSimple).toBe(false);
      expect(routeSimpleCommand('powershell:calc').isSimple).toBe(false);
    });
  });

  describe('applications', () => {
    it('recognizes Calculator', () => {
      const r = routeSimpleCommand('Open Calculator.');
      expect(r.isSimple).toBe(true);
      if (r.isSimple) {
        expect(r.action.action).toBe('open_app');
        expect((r.action as any).appName).toBe('calculator');
        expect(r.successMessage).toBe('Opened Calculator.');
      }
    });

    it('recognizes Chrome', () => {
      const r = routeSimpleCommand('open chrome');
      expect(r.isSimple).toBe(true);
      if (r.isSimple) {
        expect(r.action.action).toBe('open_app');
        expect((r.action as any).appName).toBe('chrome');
      }
    });

    it('recognizes VS Code', () => {
      const r = routeSimpleCommand('open vscode');
      expect(r.isSimple).toBe(true);
      if (r.isSimple) {
        expect(r.action.action).toBe('open_app');
        expect((r.action as any).appName).toBe('vscode');
      }
    });

    it('recognizes File Explorer', () => {
      const r = routeSimpleCommand('loute open file explorer');
      expect(routeSimpleCommand('open file explorer').isSimple).toBe(true);
    });

    it('rejects unknown apps', () => {
      expect(routeSimpleCommand('open some_random_unknown_app').isSimple).toBe(false);
    });
  });

  describe('browser tabs', () => {
    it('recognizes new tab', () => {
      const r = routeSimpleCommand('open a new tab');
      expect(r.isSimple).toBe(true);
      if (r.isSimple) {
        expect(r.action.action).toBe('new_tab');
        expect(r.successMessage).toBe('Opened a new tab.');
      }
    });
  });

  describe('window switching', () => {
    it('recognizes switch to Chrome', () => {
      const r = routeSimpleCommand('Switch to Chrome');
      expect(r.isSimple).toBe(true);
      if (r.isSimple) {
        expect(r.action.action).toBe('switch_window');
        expect(r.successMessage).toBe('Switched to Chrome.');
      }
    });
  });

  describe('keypresses and typing', () => {
    it('recognizes press Enter', () => {
      const r = routeSimpleCommand('Press Enter');
      expect(r.isSimple).toBe(true);
      if (r.isSimple) {
        expect(r.action.action).toBe('keypress');
        expect((r.action as any).keys).toEqual(['enter']);
        expect(r.successMessage).toBe('Pressed Enter.');
      }
    });

    it('recognizes press Ctrl+C', () => {
      const r = routeSimpleCommand('press ctrl+c');
      expect(r.isSimple).toBe(true);
      if (r.isSimple) {
        expect((r.action as any).keys).toEqual(['ctrl', 'c']);
      }
    });

    it('recognizes direct typing', () => {
      const r = routeSimpleCommand('type hello world');
      expect(r.isSimple).toBe(true);
      if (r.isSimple) {
        expect(r.action.action).toBe('type_text');
        expect((r.action as any).text).toBe('hello world');
      }
    });
  });

  describe('compound command rejection', () => {
    it('rejects "Open YouTube and search Python"', () => {
      const r = routeSimpleCommand('Open YouTube and search for Python.');
      expect(r.isSimple).toBe(false);
    });

    it('rejects "Open Chrome and find weather"', () => {
      const r = routeSimpleCommand('Open Chrome and find weather');
      expect(r.isSimple).toBe(false);
    });

    it('rejects "Open WhatsApp and send Rahul a message"', () => {
      const r = routeSimpleCommand('Open GitHub and send Rahul a message');
      expect(r.isSimple).toBe(false);
    });

    it('rejects "Open YouTube, then search for Iron Man"', () => {
      const r = routeSimpleCommand('Open YouTube, then search for Iron Man');
      expect(r.isSimple).toBe(false);
    });
  });
});
