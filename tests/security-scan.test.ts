import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { KeyManager } from '../src/backend/models/key-manager';
import { validateEnvironment } from '../src/backend/config/env-validator';
import { toPublicModelProvider } from '../src/backend/models/model-registry';

describe('Security Scanning & Credential Protection (Phase 4 + Supabase)', () => {
  it('ensures .gitignore ignores .env, .env.openrouter, .env.supabase and certificate/key files', () => {
    const gitignorePath = path.resolve(__dirname, '../.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf8');

    expect(content).toMatch(/^\.env$/m);
    expect(content).toMatch(/^\.env\.\*$/m);
    expect(content).toMatch(/^!\.env\.example$/m);
    expect(content).toMatch(/^!\.env\.openrouter\.example$/m);
    expect(content).toMatch(/^!\.env\.supabase\.example$/m);
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
    expect(content).toMatch(/OPENROUTER_KEY_5=\s*$/m);
  });

  it('ensures .env.supabase.example exists and contains only empty placeholders (no real credentials)', () => {
    const envSupabasePath = path.resolve(__dirname, '../.env.supabase.example');
    expect(fs.existsSync(envSupabasePath)).toBe(true);

    const content = fs.readFileSync(envSupabasePath, 'utf8');
    // Should have the three required keys as empty placeholders
    expect(content).toMatch(/SUPABASE_URL=\s*$/m);
    expect(content).toMatch(/SUPABASE_ANON_KEY=\s*$/m);
    expect(content).toMatch(/SUPABASE_SERVICE_ROLE_KEY=\s*$/m);
    // Should NOT contain any actual credentials
    expect(content).not.toMatch(/SUPABASE_URL=https/);
    expect(content).not.toMatch(/SUPABASE_ANON_KEY=ey/);
    expect(content).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY=ey/);
    expect(content).not.toContain('service_role');
  });

  it('ensures KeyManager and PublicModelProvider never expose OpenRouter secret tokens', () => {
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

  it('ensures validated env Supabase service role key is never exposed in public model provider', () => {
    const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake-service-role-key';
    const env = validateEnvironment({
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: serviceKey
    });

    // The key is available on the env object for backend-internal use
    expect(env.supabaseServiceRoleKey).toBe(serviceKey);

    // But PublicModelProvider must NOT leak it
    const km = new KeyManager(env);
    const publicProvider = toPublicModelProvider('general', km);
    const serialized = JSON.stringify(publicProvider);
    expect(serialized).not.toContain(serviceKey);
    expect(serialized).not.toContain('service_role');
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

  it('scans all TypeScript source files in src/ for hardcoded Supabase service role patterns', () => {
    function scanDir(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...scanDir(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const fileContent = fs.readFileSync(fullPath, 'utf8');
          // No hardcoded JWT tokens or raw service role keys
          if (fileContent.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']ey/)) {
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

  it('verifies production bundle does not contain service_role key patterns', () => {
    const distDir = path.resolve(__dirname, '../dist/web/assets');
    if (!fs.existsSync(distDir)) {
      // Build hasn't run yet — skip
      return;
    }
    const jsFiles = fs.readdirSync(distDir).filter((f) => f.endsWith('.js'));
    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(distDir, file), 'utf8');
      expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(content).not.toContain('supabaseServiceRoleKey');
    }
  });
});
