export type AllowedApp = {
  command: string;
  args?: string[];
  processName?: string;
};

export type AgentEnv = {
  port: number;
  token: string;
  filesRoot: string;
  allowedApps: Record<string, AllowedApp>;
};

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readAgentEnv(env: NodeJS.ProcessEnv = process.env): AgentEnv {
  return {
    port: numberFromEnv(env.FRIDAY_AGENT_PORT, 8787),
    token: env.FRIDAY_AGENT_TOKEN || 'dev-local-token-change-me',
    filesRoot: env.FRIDAY_FILES_ROOT || process.cwd(),
    allowedApps: {
      notepad: { command: 'notepad.exe', processName: 'notepad.exe' },
      calculator: { command: 'calc.exe', processName: 'CalculatorApp.exe' },
      ...parseAllowedApps(env.FRIDAY_ALLOWED_APPS)
    }
  };
}

function parseAllowedApps(value: string | undefined): Record<string, AllowedApp> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as Record<string, AllowedApp>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, app]) => [key.toLowerCase(), app])
    );
  } catch {
    console.warn('[FRIDAY Agent] Ignoring invalid FRIDAY_ALLOWED_APPS JSON.');
    return {};
  }
}

