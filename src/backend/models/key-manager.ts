import { FRIDAY_KEY_ROLES, type FridayRole, type KeySlot } from './friday-key-roles';
import type { ValidatedBackendEnv } from '../config/env-validator';

export type HealthState = 'healthy' | 'degraded' | 'invalid' | 'unavailable';

export type RoleHealthStatus = {
  role: FridayRole;
  keySlot: KeySlot;
  state: HealthState;
  hasKey: boolean;
  cooldownUntil?: number;
  rateLimitRemaining: {
    rpm: number;
    rpd: number;
  };
  lastError?: string;
};

export type PublicRoleStatus = {
  role: FridayRole;
  model: string;
  keySlot: KeySlot;
  available: boolean;
  free: boolean;
  healthy: boolean;
  state: HealthState;
  rateLimitRemaining: {
    rpm: number;
    rpd: number;
  };
  verification: 'catalog verified' | 'live API request verified' | 'unconfigured' | 'unavailable';
};

type RequestTimestamp = number;

export class KeyManager {
  private keys: Partial<Record<KeySlot, string>>;
  private roleToKeySlot: Record<FridayRole, KeySlot>;
  private slotState: Record<KeySlot, { state: HealthState; cooldownUntil: number; lastError?: string }>;
  private requestHistory: Map<string, RequestTimestamp[]> = new Map(); // keySlot:model -> timestamps
  private verifiedRoles: Set<FridayRole> = new Set();

  private cooldownDurationMs: number;
  private limitRpm: number;
  private limitRpd: number;

  constructor(env: ValidatedBackendEnv) {
    this.keys = { ...env.keys };
    this.cooldownDurationMs = env.modelFailureCooldownMs;
    this.limitRpm = env.freeModelRateLimitRpm;
    this.limitRpd = env.freeModelRateLimitRpd;

    this.roleToKeySlot = {
      coding: 'key_1',
      fast: 'key_2',
      complex: 'key_3',
      grammar: 'key_4',
      general: 'key_5'
    };

    // If a role's dedicated key is not set, check if we have any other key to share (spare-key promotion / single-key sharing)
    const availableSlots = env.configuredKeySlots;
    if (availableSlots.length > 0) {
      const fallbackSlot = availableSlots[0];
      for (const role of Object.keys(this.roleToKeySlot) as FridayRole[]) {
        const dedicatedSlot = FRIDAY_KEY_ROLES[role].keySlot;
        if (!this.keys[dedicatedSlot]) {
          this.roleToKeySlot[role] = fallbackSlot;
        }
      }
    }

    this.slotState = {
      key_1: { state: this.keys.key_1 ? 'healthy' : 'unavailable', cooldownUntil: 0 },
      key_2: { state: this.keys.key_2 ? 'healthy' : 'unavailable', cooldownUntil: 0 },
      key_3: { state: this.keys.key_3 ? 'healthy' : 'unavailable', cooldownUntil: 0 },
      key_4: { state: this.keys.key_4 ? 'healthy' : 'unavailable', cooldownUntil: 0 },
      key_5: { state: this.keys.key_5 ? 'healthy' : 'unavailable', cooldownUntil: 0 }
    };
  }

  getKeySlotForRole(role: FridayRole): KeySlot {
    return this.roleToKeySlot[role];
  }

  getKeyForRole(role: FridayRole): string | null {
    const slot = this.getKeySlotForRole(role);
    return this.keys[slot] ?? null;
  }

  getKeyForSlot(slot: KeySlot): string | null {
    return this.keys[slot] ?? null;
  }

  hasKeyForRole(role: FridayRole): boolean {
    const key = this.getKeyForRole(role);
    return Boolean(key && key.length > 0);
  }

  getRoleHealth(role: FridayRole, model?: string): RoleHealthStatus {
    const slot = this.getKeySlotForRole(role);
    const key = this.keys[slot];
    const targetModel = model || FRIDAY_KEY_ROLES[role].primary;

    if (!key) {
      return {
        role,
        keySlot: slot,
        state: 'unavailable',
        hasKey: false,
        rateLimitRemaining: { rpm: 0, rpd: 0 },
        lastError: 'No OpenRouter API key configured for this role'
      };
    }

    const slotInfo = this.slotState[slot];
    const now = Date.now();

    // Check if degraded cooldown expired
    let currentState = slotInfo.state;
    if (currentState === 'degraded' && slotInfo.cooldownUntil > 0 && now >= slotInfo.cooldownUntil) {
      currentState = 'healthy';
      this.slotState[slot].state = 'healthy';
      this.slotState[slot].cooldownUntil = 0;
    }

    const remaining = this.getRemainingQuota(slot, targetModel);

    // If RPM or RPD is exhausted, treat as degraded
    if (currentState === 'healthy' && (remaining.rpm <= 0 || remaining.rpd <= 0)) {
      currentState = 'degraded';
    }

    return {
      role,
      keySlot: slot,
      state: currentState,
      hasKey: true,
      cooldownUntil: slotInfo.cooldownUntil > now ? slotInfo.cooldownUntil : undefined,
      rateLimitRemaining: remaining,
      lastError: slotInfo.lastError
    };
  }

  isAvailable(role: FridayRole, model?: string): boolean {
    const health = this.getRoleHealth(role, model);
    return health.hasKey && health.state !== 'invalid' && health.state !== 'unavailable';
  }

  recordUsage(slot: KeySlot, model: string): void {
    const key = `${slot}:${model}`;
    const timestamps = this.requestHistory.get(key) || [];
    timestamps.push(Date.now());
    this.requestHistory.set(key, timestamps);
  }

  recordSuccess(slot: KeySlot, role?: FridayRole): void {
    if (this.slotState[slot].state === 'degraded' && Date.now() >= this.slotState[slot].cooldownUntil) {
      this.slotState[slot].state = 'healthy';
      this.slotState[slot].cooldownUntil = 0;
      this.slotState[slot].lastError = undefined;
    }
    if (role) {
      this.verifiedRoles.add(role);
    }
  }

  recordRateLimit(slot: KeySlot, cooldownMs?: number, errorMessage?: string): void {
    const cooldown = cooldownMs ?? this.cooldownDurationMs;
    this.slotState[slot].state = 'degraded';
    this.slotState[slot].cooldownUntil = Date.now() + cooldown;
    this.slotState[slot].lastError = errorMessage || 'Rate limited (HTTP 429)';
  }

  recordAuthFailure(slot: KeySlot, errorMessage?: string): void {
    this.slotState[slot].state = 'invalid';
    this.slotState[slot].cooldownUntil = 0;
    this.slotState[slot].lastError = errorMessage || 'Invalid OpenRouter API Key (HTTP 401/403)';
  }

  recordGenericFailure(slot: KeySlot, errorMessage?: string): void {
    // For 5xx / timeouts, apply brief cooldown
    this.slotState[slot].state = 'degraded';
    this.slotState[slot].cooldownUntil = Date.now() + 10000;
    this.slotState[slot].lastError = errorMessage;
  }

  getRemainingQuota(slot: KeySlot, model: string): { rpm: number; rpd: number } {
    const key = `${slot}:${model}`;
    const now = Date.now();
    const timestamps = this.requestHistory.get(key) || [];

    // Filter out entries older than 24 hours
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneMinuteAgo = now - 60 * 1000;

    const validDay = timestamps.filter((t) => t > oneDayAgo);
    this.requestHistory.set(key, validDay);

    const minuteCount = validDay.filter((t) => t > oneMinuteAgo).length;
    const dayCount = validDay.length;

    return {
      rpm: Math.max(0, this.limitRpm - minuteCount),
      rpd: Math.max(0, this.limitRpd - dayCount)
    };
  }

  markLiveVerified(role: FridayRole): void {
    this.verifiedRoles.add(role);
  }

  getAllRoleStatuses(): Record<FridayRole, PublicRoleStatus> {
    const result = {} as Record<FridayRole, PublicRoleStatus>;

    for (const [roleKey, config] of Object.entries(FRIDAY_KEY_ROLES) as Array<[FridayRole, typeof FRIDAY_KEY_ROLES[FridayRole]]>) {
      const health = this.getRoleHealth(roleKey, config.primary);
      const isLiveVerified = this.verifiedRoles.has(roleKey);

      let verification: PublicRoleStatus['verification'] = 'unconfigured';
      if (!health.hasKey) {
        verification = 'unconfigured';
      } else if (health.state === 'invalid' || health.state === 'unavailable') {
        verification = 'unavailable';
      } else if (isLiveVerified) {
        verification = 'live API request verified';
      } else {
        verification = 'catalog verified';
      }

      result[roleKey] = {
        role: roleKey,
        model: config.primary,
        keySlot: health.keySlot,
        available: health.hasKey && health.state !== 'invalid' && health.state !== 'unavailable',
        free: true,
        healthy: health.state === 'healthy',
        state: health.state,
        rateLimitRemaining: health.rateLimitRemaining,
        verification
      };
    }

    return result;
  }
}
