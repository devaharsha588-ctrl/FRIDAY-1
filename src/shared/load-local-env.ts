import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

export function loadLocalEnv(baseDir = process.cwd()): void {
  const envPath = resolve(baseDir, '.env');
  if (existsSync(envPath)) {
    try {
      loadEnvFile(envPath);
    } catch {
      parseEnvFallback(envPath);
    }
  }

  const openRouterEnvPath = resolve(baseDir, '.env.openrouter');
  if (existsSync(openRouterEnvPath)) {
    try {
      loadEnvFile(openRouterEnvPath);
    } catch {
      parseEnvFallback(openRouterEnvPath);
    }
  }
}

function parseEnvFallback(filePath: string): void {
  try {
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const rawVal = trimmed.slice(eqIdx + 1).trim();
        const cleanVal = rawVal.replace(/^["']|["']$/g, '');
        if (key) {
          process.env[key] = cleanVal;
        }
      }
    }
  } catch {
    // Ignore fallback errors
  }
}
