import {
  createHomepageReloadWatchdog,
  createMeetingsFingerprint,
  type HomepageReloadWatchdogConfig,
  type HomepageReloadWatchdogEvaluation,
  type Meeting,
} from "@meetcat/core";

const MINUTE_MS = 60 * 1000;

export const HOMEPAGE_STALE_THRESHOLD_MS = 30 * MINUTE_MS;
export const HOMEPAGE_RELOAD_BACKOFF_MS = [
  30 * MINUTE_MS,
  60 * MINUTE_MS,
  120 * MINUTE_MS,
];
export const HOMEPAGE_DAILY_RELOAD_LIMIT = 8;

export interface HomepageRecoveryInput {
  meetings: Meeting[];
  nowMs: number;
  isHomepage: boolean;
  isForeground: boolean;
}

export interface HomepageRecoveryDecision {
  fingerprint: string;
  evaluation: HomepageReloadWatchdogEvaluation;
}

/**
 * Encapsulates stale-homepage recovery policy so the service worker only
 * handles browser I/O and can keep this logic fully unit tested.
 */
export class HomepageRecoveryController {
  private readonly watchdog;

  constructor(config: HomepageReloadWatchdogConfig = {}) {
    this.watchdog = createHomepageReloadWatchdog({
      staleThresholdMs: HOMEPAGE_STALE_THRESHOLD_MS,
      backoffScheduleMs: HOMEPAGE_RELOAD_BACKOFF_MS,
      dailyReloadLimit: HOMEPAGE_DAILY_RELOAD_LIMIT,
      ...config,
    });
  }

  hasPendingReload(): boolean {
    return this.watchdog.hasPendingReload();
  }

  evaluate(input: HomepageRecoveryInput): HomepageRecoveryDecision {
    const fingerprint = createMeetingsFingerprint(input.meetings);
    const evaluation = this.watchdog.evaluate({
      fingerprint,
      nowMs: input.nowMs,
      isHomepage: input.isHomepage,
      isForeground: input.isForeground,
    });
    return { fingerprint, evaluation };
  }
}
