import type { Meeting } from "../types.js";

const MINUTE_MS = 60 * 1000;

export const DEFAULT_HOMEPAGE_STALE_THRESHOLD_MS = 30 * MINUTE_MS;
export const DEFAULT_HOMEPAGE_BACKOFF_SCHEDULE_MS = [
  30 * MINUTE_MS,
  60 * MINUTE_MS,
  120 * MINUTE_MS,
];
export const DEFAULT_HOMEPAGE_DAILY_RELOAD_LIMIT = 8;

export type HomepageReloadAction = "none" | "defer" | "reload";
export type HomepageReloadReason =
  | "initialized"
  | "fingerprint_changed"
  | "not_stale"
  | "not_homepage"
  | "foreground"
  | "cooldown"
  | "daily_limit"
  | "reload";

export interface HomepageReloadWatchdogConfig {
  staleThresholdMs?: number;
  backoffScheduleMs?: number[];
  dailyReloadLimit?: number;
  getDayKey?: (nowMs: number) => string;
}

export interface HomepageReloadWatchdogInput {
  fingerprint: string;
  nowMs: number;
  isHomepage: boolean;
  isForeground: boolean;
}

export interface HomepageReloadWatchdogState {
  lastFingerprint: string | null;
  lastFingerprintChangedAtMs: number | null;
  consecutiveReloadsWithoutChange: number;
  lastReloadAtMs: number | null;
  pendingReload: boolean;
  reloadCountToday: number;
  reloadDayKey: string | null;
}

export interface HomepageReloadWatchdogEvaluation {
  action: HomepageReloadAction;
  reason: HomepageReloadReason;
  staleForMs: number;
  backoffMs: number;
  cooldownRemainingMs: number;
  pendingReload: boolean;
  consecutiveReloadsWithoutChange: number;
  reloadCountToday: number;
  fingerprintChanged: boolean;
  stateChanged: boolean;
}

function defaultDayKey(nowMs: number): string {
  const date = new Date(nowMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Build a stable fingerprint from meeting identity fields only.
 * We intentionally exclude time-relative fields (e.g. startsInMinutes)
 * so normal ticking does not look like data changes.
 */
export function createMeetingsFingerprint(meetings: Meeting[]): string {
  if (meetings.length === 0) return "0:empty";

  const normalized = meetings
    .map((meeting) => {
      const beginMs = Number.isFinite(meeting.beginTime.getTime())
        ? meeting.beginTime.getTime()
        : 0;
      const endMs = Number.isFinite(meeting.endTime.getTime())
        ? meeting.endTime.getTime()
        : 0;
      return [
        meeting.callId,
        beginMs,
        endMs,
        meeting.eventId ?? "",
        normalizeTitle(meeting.title),
      ].join("|");
    })
    .sort();

  return `${normalized.length}:${hashString(normalized.join("||"))}`;
}

export class HomepageReloadWatchdog {
  private readonly staleThresholdMs: number;
  private readonly backoffScheduleMs: number[];
  private readonly dailyReloadLimit: number;
  private readonly getDayKey: (nowMs: number) => string;
  private readonly state: HomepageReloadWatchdogState;

  constructor(config: HomepageReloadWatchdogConfig = {}) {
    this.staleThresholdMs = Math.max(
      1,
      config.staleThresholdMs ?? DEFAULT_HOMEPAGE_STALE_THRESHOLD_MS
    );
    this.backoffScheduleMs = this.normalizeBackoffSchedule(config.backoffScheduleMs);
    this.dailyReloadLimit = Math.max(
      1,
      config.dailyReloadLimit ?? DEFAULT_HOMEPAGE_DAILY_RELOAD_LIMIT
    );
    this.getDayKey = config.getDayKey ?? defaultDayKey;
    this.state = {
      lastFingerprint: null,
      lastFingerprintChangedAtMs: null,
      consecutiveReloadsWithoutChange: 0,
      lastReloadAtMs: null,
      pendingReload: false,
      reloadCountToday: 0,
      reloadDayKey: null,
    };
  }

  hasPendingReload(): boolean {
    return this.state.pendingReload;
  }

  getState(): HomepageReloadWatchdogState {
    return { ...this.state };
  }

  evaluate(input: HomepageReloadWatchdogInput): HomepageReloadWatchdogEvaluation {
    this.resetDailyCounterIfNeeded(input.nowMs);

    if (this.state.lastFingerprint === null) {
      this.state.lastFingerprint = input.fingerprint;
      this.state.lastFingerprintChangedAtMs = input.nowMs;
      return this.createEvaluation({
        action: "none",
        reason: "initialized",
        staleForMs: 0,
        backoffMs: this.getCurrentBackoffMs(),
        cooldownRemainingMs: 0,
        fingerprintChanged: false,
        stateChanged: true,
      });
    }

    if (this.state.lastFingerprint !== input.fingerprint) {
      this.state.lastFingerprint = input.fingerprint;
      this.state.lastFingerprintChangedAtMs = input.nowMs;
      this.state.consecutiveReloadsWithoutChange = 0;
      this.state.pendingReload = false;
      return this.createEvaluation({
        action: "none",
        reason: "fingerprint_changed",
        staleForMs: 0,
        backoffMs: this.getCurrentBackoffMs(),
        cooldownRemainingMs: 0,
        fingerprintChanged: true,
        stateChanged: true,
      });
    }

    const fingerprintChangedAt = this.state.lastFingerprintChangedAtMs ?? input.nowMs;
    const staleForMs = Math.max(0, input.nowMs - fingerprintChangedAt);
    if (staleForMs < this.staleThresholdMs) {
      return this.createEvaluation({
        action: "none",
        reason: "not_stale",
        staleForMs,
        backoffMs: this.getCurrentBackoffMs(),
        cooldownRemainingMs: 0,
        fingerprintChanged: false,
        stateChanged: false,
      });
    }

    if (!input.isHomepage) {
      return this.createEvaluation({
        action: "none",
        reason: "not_homepage",
        staleForMs,
        backoffMs: this.getCurrentBackoffMs(),
        cooldownRemainingMs: 0,
        fingerprintChanged: false,
        stateChanged: false,
      });
    }

    const backoffMs = this.getCurrentBackoffMs();
    const cooldownRemainingMs = this.getCooldownRemainingMs(input.nowMs, backoffMs);
    if (cooldownRemainingMs > 0) {
      return this.createEvaluation({
        action: "none",
        reason: "cooldown",
        staleForMs,
        backoffMs,
        cooldownRemainingMs,
        fingerprintChanged: false,
        stateChanged: false,
      });
    }

    if (this.state.reloadCountToday >= this.dailyReloadLimit) {
      return this.createEvaluation({
        action: "none",
        reason: "daily_limit",
        staleForMs,
        backoffMs,
        cooldownRemainingMs: 0,
        fingerprintChanged: false,
        stateChanged: false,
      });
    }

    if (input.isForeground) {
      const stateChanged = !this.state.pendingReload;
      this.state.pendingReload = true;
      return this.createEvaluation({
        action: "defer",
        reason: "foreground",
        staleForMs,
        backoffMs,
        cooldownRemainingMs: 0,
        fingerprintChanged: false,
        stateChanged,
      });
    }

    this.state.pendingReload = false;
    this.state.lastReloadAtMs = input.nowMs;
    this.state.reloadCountToday += 1;
    this.state.consecutiveReloadsWithoutChange += 1;
    return this.createEvaluation({
      action: "reload",
      reason: "reload",
      staleForMs,
      backoffMs,
      cooldownRemainingMs: 0,
      fingerprintChanged: false,
      stateChanged: true,
    });
  }

  private normalizeBackoffSchedule(schedule?: number[]): number[] {
    if (!schedule || schedule.length === 0) {
      return [...DEFAULT_HOMEPAGE_BACKOFF_SCHEDULE_MS];
    }
    const normalized = schedule
      .map((value) => Math.max(0, Math.floor(value)))
      .filter((value) => Number.isFinite(value));
    if (normalized.length === 0) {
      return [...DEFAULT_HOMEPAGE_BACKOFF_SCHEDULE_MS];
    }
    return normalized;
  }

  private resetDailyCounterIfNeeded(nowMs: number): void {
    const nextDayKey = this.getDayKey(nowMs);
    if (this.state.reloadDayKey === nextDayKey) return;
    this.state.reloadDayKey = nextDayKey;
    this.state.reloadCountToday = 0;
  }

  private getCurrentBackoffMs(): number {
    const idx = Math.min(
      this.state.consecutiveReloadsWithoutChange,
      this.backoffScheduleMs.length - 1
    );
    return this.backoffScheduleMs[idx];
  }

  private getCooldownRemainingMs(nowMs: number, backoffMs: number): number {
    if (backoffMs <= 0) return 0;
    if (this.state.lastReloadAtMs === null) return 0;
    const elapsed = nowMs - this.state.lastReloadAtMs;
    return elapsed >= backoffMs ? 0 : backoffMs - elapsed;
  }

  private createEvaluation(input: {
    action: HomepageReloadAction;
    reason: HomepageReloadReason;
    staleForMs: number;
    backoffMs: number;
    cooldownRemainingMs: number;
    fingerprintChanged: boolean;
    stateChanged: boolean;
  }): HomepageReloadWatchdogEvaluation {
    return {
      ...input,
      pendingReload: this.state.pendingReload,
      consecutiveReloadsWithoutChange: this.state.consecutiveReloadsWithoutChange,
      reloadCountToday: this.state.reloadCountToday,
    };
  }
}

export function createHomepageReloadWatchdog(
  config: HomepageReloadWatchdogConfig = {}
): HomepageReloadWatchdog {
  return new HomepageReloadWatchdog(config);
}
