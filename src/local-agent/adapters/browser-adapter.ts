export type BrowserPage = {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
};

export type BrowserElementInfo = {
  nodeId: number;
  selector: string;
  tagName: string;
  text: string;
  role: string;
  name: string;
  bounds: { x: number; y: number; width: number; height: number } | null;
};

export type BrowserState = {
  url: string;
  title: string;
  focusedElement: string | null;
};

export type BrowserAdapterConfig = {
  debugPort: number;  // default 9222
  connectTimeoutMs: number;  // default 3000
};

export class BrowserAdapter {
  private config: BrowserAdapterConfig;
  private ws: WebSocket | null = null;
  private nextRequestId = 1;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  constructor(config?: Partial<BrowserAdapterConfig>) {
    this.config = {
      debugPort: config?.debugPort ?? 9222,
      connectTimeoutMs: config?.connectTimeoutMs ?? 3000,
    };
  }

  async connect(): Promise<void> {
    try {
      const page = await this.getActivePage();
      if (!page) {
        throw new Error('No active page found to connect to.');
      }
      await this.connectToPage(page);
    } catch (err) {
      throw new Error(`Failed to connect to Chrome debugging endpoint: ${err}`);
    }
  }

  async getPages(): Promise<BrowserPage[]> {
    const url = `http://127.0.0.1:${this.config.debugPort}/json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(this.config.connectTimeoutMs) });
    if (!res.ok) {
      throw new Error(`HTTP Error fetching pages: ${res.status}`);
    }
    const data = await res.json() as Array<{ id: string; title: string; url: string; webSocketDebuggerUrl?: string; type: string }>;
    return data
      .filter((p) => p.type === 'page' && p.webSocketDebuggerUrl)
      .map((p) => ({
        id: p.id,
        title: p.title,
        url: p.url,
        webSocketDebuggerUrl: p.webSocketDebuggerUrl!,
      }));
  }

  async getActivePage(): Promise<BrowserPage | null> {
    const pages = await this.getPages();
    return pages.length > 0 ? pages[0] : null;
  }

  private async connectToPage(page: BrowserPage): Promise<void> {
    this.disconnect();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, this.config.connectTimeoutMs);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.ws = ws;
        resolve();
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket Error: ${err}`));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString()) as { id?: number; result?: unknown; error?: { message: string } };
          if (data.id && this.pendingRequests.has(data.id)) {
            const req = this.pendingRequests.get(data.id)!;
            this.pendingRequests.delete(data.id);
            if (data.error) {
              req.reject(new Error(data.error.message));
            } else {
              req.resolve(data.result);
            }
          }
        } catch (e) {
          // Ignore parse errors for unsolicited messages
        }
      };

      ws.onclose = () => {
        this.ws = null;
        for (const [_, req] of this.pendingRequests) {
          req.reject(new Error('WebSocket closed'));
        }
        this.pendingRequests.clear();
      };
    });
  }

  private async sendCdpCommand<T>(method: string, params?: Record<string, unknown>, timeoutMs = 5000): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const id = this.nextRequestId++;
    const payload = JSON.stringify({ id, method, params });

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`CDP command ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val as T);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.ws!.send(payload);
    });
  }

  async navigateTo(url: string): Promise<{ success: boolean; finalUrl: string }> {
    try {
      await this.sendCdpCommand<{ frameId: string; loaderId: string }>('Page.navigate', { url });
      // Wait briefly for navigation to commit
      await new Promise((r) => setTimeout(r, 1000));
      const state = await this.getPageState();
      return { success: true, finalUrl: state.url };
    } catch (err) {
      return { success: false, finalUrl: '' };
    }
  }

  async getPageState(): Promise<BrowserState> {
    type EvalResult = { result: { value: { url: string; title: string; focusedElement: string | null } } };
    const res = await this.sendCdpCommand<EvalResult>('Runtime.evaluate', {
      expression: `
        (() => {
          const active = document.activeElement;
          let focused = null;
          if (active && active !== document.body) {
            focused = active.tagName.toLowerCase();
            if (active.id) focused += '#' + active.id;
            if (active.className && typeof active.className === 'string') {
              focused += '.' + active.className.split(' ').join('.');
            }
          }
          return {
            url: window.location.href,
            title: document.title,
            focusedElement: focused
          };
        })()
      `,
      returnByValue: true
    });
    return res.result.value;
  }

  async findElement(query: { selector?: string; role?: string; name?: string; text?: string }): Promise<BrowserElementInfo | null> {
    const jsQuery = `
      (() => {
        let el = null;
        if (${JSON.stringify(query.selector)}) {
          el = document.querySelector(${JSON.stringify(query.selector)});
        } else if (${JSON.stringify(query.role)}) {
          el = document.querySelector('[role="${query.role}"]');
        } else if (${JSON.stringify(query.name)}) {
          el = document.querySelector('[name="${query.name}"], [aria-label="${query.name}"], [placeholder="${query.name}"]');
        } else if (${JSON.stringify(query.text)}) {
          const elements = Array.from(document.querySelectorAll('*'));
          el = elements.find(e => e.children.length === 0 && e.textContent && e.textContent.includes(${JSON.stringify(query.text)}));
        }
        
        if (!el) return null;
        
        const rect = el.getBoundingClientRect();
        return {
          nodeId: 0,
          selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''),
          tagName: el.tagName.toLowerCase(),
          text: el.textContent || '',
          role: el.getAttribute('role') || '',
          name: el.getAttribute('name') || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '',
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          }
        };
      })()
    `;

    type EvalResult = { result: { value: BrowserElementInfo | null } };
    try {
      const res = await this.sendCdpCommand<EvalResult>('Runtime.evaluate', {
        expression: jsQuery,
        returnByValue: true
      });
      return res.result.value;
    } catch (e) {
      return null;
    }
  }

  async clickElement(query: { selector?: string; role?: string; name?: string; text?: string }): Promise<{ success: boolean; error?: string }> {
    const jsQuery = `
      (() => {
        let el = null;
        if (${JSON.stringify(query.selector)}) {
          el = document.querySelector(${JSON.stringify(query.selector)});
        } else if (${JSON.stringify(query.role)}) {
          el = document.querySelector('[role="${query.role}"]');
        } else if (${JSON.stringify(query.name)}) {
          el = document.querySelector('[name="${query.name}"], [aria-label="${query.name}"], [placeholder="${query.name}"]');
        } else if (${JSON.stringify(query.text)}) {
          const elements = Array.from(document.querySelectorAll('*'));
          el = elements.find(e => e.children.length === 0 && e.textContent && e.textContent.includes(${JSON.stringify(query.text)}));
        }
        
        if (!el) return 'Element not found';
        
        el.scrollIntoView({ block: 'center' });
        el.focus();
        el.click();
        return null;
      })()
    `;

    type EvalResult = { result: { value: string | null } };
    try {
      const res = await this.sendCdpCommand<EvalResult>('Runtime.evaluate', {
        expression: jsQuery,
        returnByValue: true
      });
      const error = res.result.value;
      if (error) {
        return { success: false, error };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async typeIntoElement(query: { selector?: string; role?: string; name?: string; text?: string }, text: string): Promise<{ success: boolean; error?: string }> {
    const focusResult = await this.clickElement(query);
    if (!focusResult.success) {
      return focusResult;
    }

    try {
      for (const char of text) {
        await this.sendCdpCommand('Input.dispatchKeyEvent', {
          type: 'char',
          text: char
        });
        await new Promise((r) => setTimeout(r, 50));
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async pressKey(key: string): Promise<void> {
    const mapKeyToCode = (k: string) => {
      const map: Record<string, string> = {
        'Enter': 'Enter',
        'Backspace': 'Backspace',
        'Tab': 'Tab',
        'Escape': 'Escape',
      };
      return map[k] || k;
    };

    const code = mapKeyToCode(key);
    
    if (code.length === 1) {
      await this.sendCdpCommand('Input.dispatchKeyEvent', {
        type: 'char',
        text: code
      });
    } else {
      await this.sendCdpCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: code
      });
      await this.sendCdpCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: code
      });
    }
  }

  async waitForNavigation(timeoutMs = 10000): Promise<{ success: boolean; url: string }> {
    const startUrl = (await this.getPageState()).url;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const state = await this.getPageState();
        if (state.url !== startUrl) {
          return { success: true, url: state.url };
        }
      } catch (e) {
        // Ignore evaluation errors during navigation
      }
    }
    
    return { success: false, url: startUrl };
  }

  async waitForElement(query: { selector?: string; role?: string; name?: string; text?: string }, timeoutMs = 10000): Promise<BrowserElementInfo | null> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const el = await this.findElement(query);
      if (el) {
        return el;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    
    return null;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    for (const [_, req] of this.pendingRequests) {
      req.reject(new Error('WebSocket closed manually'));
    }
    this.pendingRequests.clear();
  }
}

export function createBrowserAdapter(config?: Partial<BrowserAdapterConfig>): BrowserAdapter {
  return new BrowserAdapter(config);
}
