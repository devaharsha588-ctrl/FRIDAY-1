import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

const ENV_FILES = ['.env', '.env.openrouter', '.env.supabase'] as const;

export function loadLocalEnv(baseDir = process.cwd()): void {
  for (const filename of ENV_FILES) {
    const filePath = resolve(baseDir, filename);
    if (existsSync(filePath)) {
      try {
        loadEnvFile(filePath);
      } catch {
        parseEnvFallback(filePath);
      }
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
