import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { KeyManager } from '../src/backend/models/key-manager';
import { validateEnvironment } from '../src/backend/config/env-validator';
import { toPublicModelProvider } from '../src/backend/models/model-registry';
import { loadLocalEnv } from '../src/shared/load-local-env';

describe('Security Scanning & Credential Protection (Phase 4)', () => {
  it('ensures .gitignore ignores .env, .env.openrouter, and certificate/key files', () => {
    const gitignorePath = path.resolve(__dirname, '../.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf8');

    expect(content).toMatch(/^\.env$/m);
    expect(content).toMatch(/^\.env\.\*$/m);
    expect(content).toMatch(/^!\.env\.example$/m);
    expect(content).toMatch(/^!\.env\.openrouter\.example$/m);
    expect(content).toMatch(/\*\.key/);
    expect(content).toMatch(/\*\.pem/);
  });

  it('ensures .env.example contains no real API keys', () => {
    const envExamplePath = path.resolve(__dirname, '../.env.example');
    const content = fs.readFileSync(envExamplePath, 'utf8');

    expect(content).not.toContain('sk-or-v1-');
    expect(content).toMatch(/OPENROUTER_KEY_1=\s*$/m);
    expect(content).toMatch(/OPENROUTER_KEY_2=\s*$/m);
    expect(content).toMatch(/OPENROUTER_KEY_3=\s*$/m);
    expect(content).toMatch(/OPENROUTER_KEY_4=\s*$/m);
    expect(content).toMatch(/OPENROUTER_KEY_5=\s*$/m);
  });

  it('ensures .env.openrouter.example exists and contains only empty placeholders', () => {
    const envOpenRouterExamplePath = path.resolve(__dirname, '../.env.openrouter.example');
    expect(fs.existsSync(envOpenRouterExamplePath)).toBe(true);

    const content = fs.readFileSync(envOpenRouterExamplePath, 'utf8');
    expect(content).not.toContain('sk-or-v1-');
    expect(content).toMatch(/OPENROUTER_KEY_1=\s*$/m);
    expect(content).toMatch(/OPENROUTER_KEY_2=\s*$/m);
    expect(content).toMatch(/OPENROUTER_KEY_3=\s*$/m);
    expect(content).toMatch(/OPENROUTER_KEY_4=\s*$/m);
    expect(content).toMatch(/OPENROUTER_KEY_5=\s*$/m);
  });

  it('ensures KeyManager and PublicModelProvider never expose secret tokens', () => {
    const secretKey = 'sk-or-v1-99999999999999999999999999999999';
    const env = validateEnvironment({
      OPENROUTER_KEY_1: secretKey
    });

    const km = new KeyManager(env);
    const statuses = km.getAllRoleStatuses();
    const publicProvider = toPublicModelProvider('coding', km);

    const serialized = JSON.stringify({ statuses, publicProvider });
    expect(serialized).not.toContain(secretKey);
    expect(serialized).not.toContain('sk-or-');
    expect(publicProvider).not.toHaveProperty('apiKey');
  });

  it('scans all TypeScript source files in src/ for hardcoded OpenRouter keys', () => {
    function scanDir(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...scanDir(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const fileContent = fs.readFileSync(fullPath, 'utf8');
          if (fileContent.includes('sk-or-v1-')) {
            results.push(fullPath);
          }
        }
      }
      return results;
    }

    const srcDir = path.resolve(__dirname, '../src');
    const taintedFiles = scanDir(srcDir);
    expect(taintedFiles).toHaveLength(0);
  });
});
