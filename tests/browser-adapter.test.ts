import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { BrowserAdapter, createBrowserAdapter } from '../src/local-agent/adapters/browser-adapter';

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: MockWebSocket[] = [];
  static latest: MockWebSocket | null = null;

  url: string;
  private _onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;
  readyState = 1; // WebSocket.OPEN

  close = vi.fn();
  send = vi.fn((raw: string) => {
    try {
      const payload = JSON.parse(raw) as { id: number; method: string; params?: Record<string, unknown> };
      let res: unknown = {};

      if (payload.method === 'Page.navigate') {
        res = { frameId: '123' };
      } else if (payload.method === 'Runtime.evaluate') {
        const expr = (payload.params?.expression as string) || '';
        if (expr.includes('document.title') || expr.includes('window.location.href')) {
          res = { result: { value: { url: 'https://test.com', title: 'Test Title', focusedElement: null } } };
        } else if (expr.includes('getBoundingClientRect')) {
          res = {
            result: {
              value: {
                nodeId: 0,
                selector: 'button#my-btn',
                tagName: 'button',
                text: 'Click',
                role: 'button',
                name: 'btn',
                bounds: { x: 0, y: 0, width: 100, height: 30 }
              }
            }
          };
        } else if (expr.includes('.click()')) {
          res = { result: { value: null } }; // null = success (no error)
        } else {
          res = { result: { value: true } };
        }
      } else if (payload.method === 'Input.dispatchKeyEvent') {
        res = {};
      }

      queueMicrotask(() => {
        this.onmessage?.({ data: JSON.stringify({ id: payload.id, result: res }) });
      });
    } catch {}
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    MockWebSocket.latest = this;
  }

  get onopen(): (() => void) | null {
    return this._onopen;
  }

  set onopen(fn: (() => void) | null) {
    this._onopen = fn;
    if (fn) {
      queueMicrotask(() => {
        if (this._onopen === fn) {
          fn();
        }
      });
    }
  }
}

describe('BrowserAdapter and createBrowserAdapter', () => {
  let fetchMock: Mock;

  beforeEach(() => {
    MockWebSocket.instances = [];
    MockWebSocket.latest = null;

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('createBrowserAdapter', () => {
    it('initializes with default config', () => {
      const adapter = createBrowserAdapter();
      expect(adapter).toBeInstanceOf(BrowserAdapter);
    });

    it('initializes with custom config', () => {
      const adapter = createBrowserAdapter({ debugPort: 9222, connectTimeoutMs: 5000 });
      expect(adapter).toBeInstanceOf(BrowserAdapter);
    });
  });

  describe('getPages', () => {
    it('fetches and filters out pages without webSocketDebuggerUrl', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [
          { id: '1', type: 'page', title: 'Ex', url: 'https://example.com', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/1' },
          { id: '2', type: 'page', title: 'Ext', url: 'chrome-extension://some-id/page.html' },
          { id: '3', type: 'background_page', title: 'Bg', url: 'chrome-extension://other-id/_generated.html' },
          { id: '4', type: 'page', title: 'Local', url: 'http://localhost:3000', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/4' }
        ]
      });

      const adapter = createBrowserAdapter();
      const pages = await adapter.getPages();
      
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:9222/json', expect.anything());
      expect(pages).toHaveLength(2);
      expect(pages[0].id).toBe('1');
      expect(pages[1].id).toBe('4');
    });

    it('throws error when Chrome is not reachable', async () => {
      fetchMock.mockRejectedValue(new Error('fetch failed'));
      const adapter = createBrowserAdapter();
      await expect(adapter.getPages()).rejects.toThrow('fetch failed');
    });
  });

  describe('getActivePage', () => {
    it('returns the first eligible page', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [
          { id: '2', type: 'page', title: 'Ex', url: 'https://example.com', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/2' }
        ]
      });

      const adapter = createBrowserAdapter();
      const page = await adapter.getActivePage();
      expect(page).toBeDefined();
      expect(page?.id).toBe('2');
    });

    it('returns null if no eligible pages exist', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => []
      });

      const adapter = createBrowserAdapter();
      const page = await adapter.getActivePage();
      expect(page).toBeNull();
    });
  });

  describe('WebSocket CDP interactions', () => {
    let adapter: BrowserAdapter;

    beforeEach(async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [
          { id: '1', type: 'page', title: 'Page', url: 'https://example.com', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/1' }
        ]
      });

      adapter = createBrowserAdapter();
      await adapter.connect();
    });

    it('navigateTo(url) sends Page.navigate', async () => {
      const res = await adapter.navigateTo('https://example.com');
      expect(res.success).toBe(true);
    });

    it('getPageState() retrieves url and title', async () => {
      const state = await adapter.getPageState();
      expect(state.url).toBe('https://test.com');
      expect(state.title).toBe('Test Title');
    });

    it('findElement(query) searches DOM', async () => {
      const result = await adapter.findElement({ selector: '#my-btn' });
      expect(result?.tagName).toBe('button');
    });

    it('clickElement(query) dispatches click', async () => {
      const res = await adapter.clickElement({ selector: '.link' });
      expect(res.success).toBe(true);
    });

    it('typeIntoElement(query, text) types text', async () => {
      const res = await adapter.typeIntoElement({ selector: 'input' }, 'hello');
      expect(res.success).toBe(true);
    });

    it('pressKey(key) dispatches key event', async () => {
      await expect(adapter.pressKey('Enter')).resolves.toBeUndefined();
    });

    it('disconnect() closes WebSocket', () => {
      const ws = MockWebSocket.latest!;
      adapter.disconnect();
      expect(ws.close).toHaveBeenCalled();
    });
  });
});
