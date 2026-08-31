import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

export function loadLocalEnv(baseDir = process.cwd()): void {
  const envPath = resolve(baseDir, '.env');
  if (existsSync(envPath)) {
    loadEnvFile(envPath);
  }

  const openRouterEnvPath = resolve(baseDir, '.env.openrouter');
  if (existsSync(openRouterEnvPath)) {
    loadEnvFile(openRouterEnvPath);
  }
}
