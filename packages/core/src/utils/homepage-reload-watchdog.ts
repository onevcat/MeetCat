import type { Meeting } from "../types.js";

const MINUTE_MS = 60 * 1000;

export const DEFAULT_HOMEPAGE_STALE_THRESHOLD_MS = 30 * MINUTE_MS;
export const DEFAULT_HOMEPAGE_BACKOFF_SCHEDULE_MS = [
  30 * MINUTE_MS,
  60 * MINUTE_MS,
  120 * MINUTE_MS,
];
export const DEFAULT_HOMEPAGE_DAILY_RELOAD_LIMIT = 8;
export const DEFAULT_HOMEPAGE_FORCE_STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000;
/**
 * Stale reloads are deferred while the next meeting starts within this window:
 * a reload cancels the pending join trigger, and a reload that comes back
 * broken (see empty-regression below) can cost the join entirely.
 */
export const DEFAULT_HOMEPAGE_UPCOMING_MEETING_GUARD_MS = 45 * MINUTE_MS;
/**
 * Empty-regression tuning. A "regression" is a page that parsed meetings
 * moments ago and parses zero cards right after a navigation — observed with
 * background (unfocused) reloads of the redesigned Meet homepage, where the
 * page renders cards visually but the parser finds none until a reload
 * happens while the page is visible.
 */
export const DEFAULT_HOMEPAGE_REGRESSION_ARM_WINDOW_MS = 5 * MINUTE_MS;
export const DEFAULT_HOMEPAGE_REGRESSION_CONFIRM_CHECKS = 3;
export const DEFAULT_HOMEPAGE_REGRESSION_RETRY_COOLDOWN_MS = 5 * MINUTE_MS;
export const DEFAULT_HOMEPAGE_REGRESSION_MAX_SILENT_RETRIES = 2;
export const DEFAULT_HOMEPAGE_REGRESSION_FOCUS_LEAD_MS = 15 * MINUTE_MS;
export const DEFAULT_HOMEPAGE_REGRESSION_FOCUS_GRACE_MS = 10 * MINUTE_MS;
/**
 * Post-load rescue tuning. A page load we did not initiate (login redirect,
 * user navigation) invalidates the reload-failure streak accumulated on the
 * previous page — observed after an overnight forced re-login, where the
 * escalated 2h cooldown kept blocking recovery of a fresh page that parsed
 * zero cards for 43 minutes. Within this window after such a load, one stale
 * empty page gets a recovery reload that bypasses the cooldown.
 */
export const DEFAULT_HOMEPAGE_POST_LOAD_RESCUE_WINDOW_MS = 10 * MINUTE_MS;

export const EMPTY_MEETINGS_FINGERPRINT = "0:empty";

export type HomepageReloadAction = "none" | "defer" | "reload";
export type HomepageReloadReason =
  | "initialized"
  | "fingerprint_changed"
  | "not_stale"
  | "not_homepage"
  | "upcoming_meeting"
  | "foreground"
  | "cooldown"
  | "daily_limit"
  | "force_stale"
  | "reload"
  | "post_load_empty"
  | "empty_regression"
  | "empty_regression_visible"
  | "empty_regression_focused"
  | "empty_regression_waiting";

export interface HomepageReloadRegressionState {
  silentRetries: number;
  focusedRetryDone: boolean;
  visibleRetryDone: boolean;
}

export interface HomepageReloadPersistableState {
  consecutiveReloadsWithoutChange: number;
  lastReloadAtMs: number | null;
  reloadCountToday: number;
  reloadDayKey: string | null;
  lastFingerprint: string | null;
  lastFingerprintChangedAtMs: number | null;
  baselineFingerprint: string | null;
  baselineAtMs: number | null;
  baselineNextMeetingStartMs: number | null;
  regression: HomepageReloadRegressionState | null;
}

export interface HomepageReloadWatchdogConfig {
  staleThresholdMs?: number;
  forceStaleThresholdMs?: number;
  backoffScheduleMs?: number[];
  dailyReloadLimit?: number;
  upcomingMeetingGuardMs?: number;
  regressionArmWindowMs?: number;
  regressionConfirmChecks?: number;
  regressionRetryCooldownMs?: number;
  regressionMaxSilentRetries?: number;
  regressionFocusLeadMs?: number;
  regressionFocusGraceMs?: number;
  /**
   * The page load that created this instance was NOT initiated by MeetCat
   * (login redirect, user navigation, first launch). Resets the reload-failure
   * streak and arms a one-shot post-load rescue for a stale empty page.
   */
  externalNavigation?: boolean;
  postLoadRescueWindowMs?: number;
  getDayKey?: (nowMs: number) => string;
  restoredState?: HomepageReloadPersistableState;
}

export interface HomepageReloadWatchdogInput {
  fingerprint: string;
  nowMs: number;
  isHomepage: boolean;
  isForeground: boolean;
  /** Page/tab visible to the user (defaults to isForeground). */
  isVisible?: boolean;
  /**
   * Ms until the next meeting that has not ended yet begins; negative while
   * one is in progress, null/undefined when none is known.
   */
  msUntilNextMeeting?: number | null;
}

export interface HomepageReloadWatchdogState {
  lastFingerprint: string | null;
  lastFingerprintChangedAtMs: number | null;
  consecutiveReloadsWithoutChange: number;
  lastReloadAtMs: number | null;
  pendingReload: boolean;
  reloadCountToday: number;
  reloadDayKey: string | null;
  baselineFingerprint: string | null;
  baselineAtMs: number | null;
  baselineNextMeetingStartMs: number | null;
  regression: HomepageReloadRegressionState | null;
}

export interface HomepageReloadWatchdogEvaluation {
  action: HomepageReloadAction;
  reason: HomepageReloadReason;
  /** Reloads with focus=true must show and focus the window (rescue path). */
  focus: boolean;
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
  if (meetings.length === 0) return EMPTY_MEETINGS_FINGERPRINT;

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

function isEmptyFingerprint(fingerprint: string): boolean {
  return fingerprint.startsWith("0:");
}

/**
 * Ms until the earliest meeting that has not ended yet begins; negative while
 * one is in progress, null when nothing relevant is scheduled. Feeds the
 * upcoming-meeting guard and the regression focus window.
 */
export function msUntilNextRelevantMeeting(
  meetings: Meeting[],
  nowMs: number
): number | null {
  let result: number | null = null;
  for (const meeting of meetings) {
    const endMs = meeting.endTime.getTime();
    if (!Number.isFinite(endMs) || endMs <= nowMs) continue;
    const beginMs = meeting.beginTime.getTime();
    if (!Number.isFinite(beginMs)) continue;
    const msUntil = beginMs - nowMs;
    if (result === null || msUntil < result) {
      result = msUntil;
    }
  }
  return result;
}

function restoreRegressionState(
  value: unknown
): HomepageReloadRegressionState | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.silentRetries !== "number" ||
    typeof candidate.focusedRetryDone !== "boolean" ||
    typeof candidate.visibleRetryDone !== "boolean"
  ) {
    return null;
  }
  return {
    silentRetries: candidate.silentRetries,
    focusedRetryDone: candidate.focusedRetryDone,
    visibleRetryDone: candidate.visibleRetryDone,
  };
}

function restoreNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function restoreStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export class HomepageReloadWatchdog {
  private readonly staleThresholdMs: number;
  private readonly forceStaleThresholdMs: number;
  private readonly backoffScheduleMs: number[];
  private readonly dailyReloadLimit: number;
  private readonly upcomingMeetingGuardMs: number;
  private readonly regressionArmWindowMs: number;
  private readonly regressionConfirmChecks: number;
  private readonly regressionRetryCooldownMs: number;
  private readonly regressionMaxSilentRetries: number;
  private readonly regressionFocusLeadMs: number;
  private readonly regressionFocusGraceMs: number;
  private readonly getDayKey: (nowMs: number) => string;
  private readonly state: HomepageReloadWatchdogState;
  // A restore means a navigation just happened: the first empty parses after
  // it are regression candidates. Consumed by the first non-empty parse.
  private restoredDisruption: boolean;
  private emptyStreak = 0;
  private emptyStreakStartMs: number | null = null;
  private readonly postLoadRescueWindowMs: number;
  private postLoadRescueArmed: boolean;
  private postLoadRescueDeadlineMs: number | null = null;

  constructor(config: HomepageReloadWatchdogConfig = {}) {
    this.staleThresholdMs = Math.max(
      1,
      config.staleThresholdMs ?? DEFAULT_HOMEPAGE_STALE_THRESHOLD_MS
    );
    this.forceStaleThresholdMs = Math.max(
      this.staleThresholdMs,
      config.forceStaleThresholdMs ?? DEFAULT_HOMEPAGE_FORCE_STALE_THRESHOLD_MS
    );
    this.backoffScheduleMs = this.normalizeBackoffSchedule(config.backoffScheduleMs);
    this.dailyReloadLimit = Math.max(
      1,
      config.dailyReloadLimit ?? DEFAULT_HOMEPAGE_DAILY_RELOAD_LIMIT
    );
    this.upcomingMeetingGuardMs = Math.max(
      0,
      config.upcomingMeetingGuardMs ?? DEFAULT_HOMEPAGE_UPCOMING_MEETING_GUARD_MS
    );
    this.regressionArmWindowMs = Math.max(
      0,
      config.regressionArmWindowMs ?? DEFAULT_HOMEPAGE_REGRESSION_ARM_WINDOW_MS
    );
    this.regressionConfirmChecks = Math.max(
      1,
      config.regressionConfirmChecks ?? DEFAULT_HOMEPAGE_REGRESSION_CONFIRM_CHECKS
    );
    this.regressionRetryCooldownMs = Math.max(
      0,
      config.regressionRetryCooldownMs ?? DEFAULT_HOMEPAGE_REGRESSION_RETRY_COOLDOWN_MS
    );
    this.regressionMaxSilentRetries = Math.max(
      0,
      config.regressionMaxSilentRetries ?? DEFAULT_HOMEPAGE_REGRESSION_MAX_SILENT_RETRIES
    );
    this.regressionFocusLeadMs = Math.max(
      0,
      config.regressionFocusLeadMs ?? DEFAULT_HOMEPAGE_REGRESSION_FOCUS_LEAD_MS
    );
    this.regressionFocusGraceMs = Math.max(
      0,
      config.regressionFocusGraceMs ?? DEFAULT_HOMEPAGE_REGRESSION_FOCUS_GRACE_MS
    );
    this.getDayKey = config.getDayKey ?? defaultDayKey;
    this.postLoadRescueWindowMs = Math.max(
      0,
      config.postLoadRescueWindowMs ?? DEFAULT_HOMEPAGE_POST_LOAD_RESCUE_WINDOW_MS
    );
    const restored = config.restoredState;
    // Rescue needs a previous page in this session (restored state): on a
    // brand-new launch an empty parse means an empty schedule, not a page
    // that lost its cards.
    this.postLoadRescueArmed =
      config.externalNavigation === true && restored !== undefined;
    this.restoredDisruption = restored !== undefined;
    this.state = {
      lastFingerprint: restoreStringOrNull(restored?.lastFingerprint),
      lastFingerprintChangedAtMs: restoreNumberOrNull(
        restored?.lastFingerprintChangedAtMs
      ),
      // An external page load (login redirect, user navigation) invalidates
      // the failure streak: it described a page state that no longer exists.
      consecutiveReloadsWithoutChange: this.postLoadRescueArmed
        ? 0
        : restored?.consecutiveReloadsWithoutChange ?? 0,
      lastReloadAtMs: restoreNumberOrNull(restored?.lastReloadAtMs),
      pendingReload: false,
      reloadCountToday: restored?.reloadCountToday ?? 0,
      reloadDayKey: restored?.reloadDayKey ?? null,
      baselineFingerprint: restoreStringOrNull(restored?.baselineFingerprint),
      baselineAtMs: restoreNumberOrNull(restored?.baselineAtMs),
      baselineNextMeetingStartMs: restoreNumberOrNull(
        restored?.baselineNextMeetingStartMs
      ),
      regression: restoreRegressionState(restored?.regression),
    };
  }

  hasPendingReload(): boolean {
    return this.state.pendingReload;
  }

  hasOpenEmptyRegression(): boolean {
    return this.state.regression !== null;
  }

  getState(): HomepageReloadWatchdogState {
    return {
      ...this.state,
      regression: this.state.regression ? { ...this.state.regression } : null,
    };
  }

  getPersistableState(): HomepageReloadPersistableState {
    return {
      consecutiveReloadsWithoutChange: this.state.consecutiveReloadsWithoutChange,
      lastReloadAtMs: this.state.lastReloadAtMs,
      reloadCountToday: this.state.reloadCountToday,
      reloadDayKey: this.state.reloadDayKey,
      lastFingerprint: this.state.lastFingerprint,
      lastFingerprintChangedAtMs: this.state.lastFingerprintChangedAtMs,
      baselineFingerprint: this.state.baselineFingerprint,
      baselineAtMs: this.state.baselineAtMs,
      baselineNextMeetingStartMs: this.state.baselineNextMeetingStartMs,
      regression: this.state.regression ? { ...this.state.regression } : null,
    };
  }

  evaluate(input: HomepageReloadWatchdogInput): HomepageReloadWatchdogEvaluation {
    this.resetDailyCounterIfNeeded(input.nowMs);

    if (this.postLoadRescueArmed && this.postLoadRescueDeadlineMs === null) {
      this.postLoadRescueDeadlineMs = input.nowMs + this.postLoadRescueWindowMs;
    }

    if (isEmptyFingerprint(input.fingerprint)) {
      if (this.emptyStreakStartMs === null) {
        this.emptyStreakStartMs = input.nowMs;
        this.emptyStreak = 0;
      }
      this.emptyStreak += 1;

      const armed =
        this.state.regression !== null || this.isRegressionCandidate();
      if (armed && input.isHomepage) {
        return this.evaluateRegression(input);
      }
    } else {
      const closedEpisode = this.state.regression !== null;
      this.state.baselineFingerprint = input.fingerprint;
      this.state.baselineAtMs = input.nowMs;
      this.state.baselineNextMeetingStartMs =
        typeof input.msUntilNextMeeting === "number"
          ? input.nowMs + input.msUntilNextMeeting
          : null;
      this.state.regression = null;
      this.restoredDisruption = false;
      this.emptyStreak = 0;
      this.emptyStreakStartMs = null;

      if (closedEpisode) {
        // The recovered page may show the exact same meetings as before the
        // regression; treat recovery as a change so the stale clock restarts
        // instead of immediately reloading the page we just fixed.
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
    }

    return this.evaluateStaleness(input);
  }

  private evaluateStaleness(
    input: HomepageReloadWatchdogInput
  ): HomepageReloadWatchdogEvaluation {
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

    // A stale reload is never urgent; never risk one near a meeting where it
    // would cancel the pending join trigger (and can come back unparseable).
    if (
      typeof input.msUntilNextMeeting === "number" &&
      input.msUntilNextMeeting <= this.upcomingMeetingGuardMs
    ) {
      return this.createEvaluation({
        action: "none",
        reason: "upcoming_meeting",
        staleForMs,
        backoffMs: this.getCurrentBackoffMs(),
        cooldownRemainingMs: 0,
        fingerprintChanged: false,
        stateChanged: false,
      });
    }

    // One-shot rescue for a stale empty page right after an external load:
    // the failure streak and its cooldown belong to the previous page, while
    // this one (e.g. fresh from a forced re-login) never got a recovery try.
    if (
      isEmptyFingerprint(input.fingerprint) &&
      this.postLoadRescueArmed &&
      this.postLoadRescueDeadlineMs !== null &&
      input.nowMs <= this.postLoadRescueDeadlineMs &&
      this.emptyStreak >= this.regressionConfirmChecks &&
      this.state.reloadCountToday < this.dailyReloadLimit
    ) {
      this.postLoadRescueArmed = false;
      this.recordRecoveryReload(input.nowMs);
      return this.createEvaluation({
        action: "reload",
        reason: "post_load_empty",
        staleForMs,
        backoffMs: this.getCurrentBackoffMs(),
        cooldownRemainingMs: 0,
        fingerprintChanged: false,
        stateChanged: true,
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

    if (input.isForeground && staleForMs < this.forceStaleThresholdMs) {
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
      reason:
        input.isForeground && staleForMs >= this.forceStaleThresholdMs
          ? "force_stale"
          : "reload",
      staleForMs,
      backoffMs,
      cooldownRemainingMs: 0,
      fingerprintChanged: false,
      stateChanged: true,
    });
  }

  /**
   * A fresh non-empty baseline that turns into empty parses right after a
   * disruption (page load restore, or a reload this instance ordered) marks
   * the page as broken by the navigation rather than legitimately empty.
   */
  private isRegressionCandidate(): boolean {
    const { baselineFingerprint, baselineAtMs, lastReloadAtMs } = this.state;
    if (
      baselineFingerprint === null ||
      isEmptyFingerprint(baselineFingerprint) ||
      baselineAtMs === null ||
      this.emptyStreakStartMs === null
    ) {
      return false;
    }
    if (this.emptyStreakStartMs - baselineAtMs > this.regressionArmWindowMs) {
      return false;
    }
    const reloadedSinceBaseline =
      lastReloadAtMs !== null && lastReloadAtMs >= baselineAtMs;
    return this.restoredDisruption || reloadedSinceBaseline;
  }

  private evaluateRegression(
    input: HomepageReloadWatchdogInput
  ): HomepageReloadWatchdogEvaluation {
    const isVisible = input.isVisible ?? input.isForeground;

    // Meet renders its schedule asynchronously — wait for a few consecutive
    // empty parses (per page load) before treating the page as broken.
    if (this.emptyStreak < this.regressionConfirmChecks) {
      return this.createRegressionEvaluation("none", "empty_regression_waiting", {
        nowMs: input.nowMs,
        stateChanged: false,
      });
    }

    let stateChanged = false;
    if (this.state.regression === null) {
      this.state.regression = {
        silentRetries: 0,
        focusedRetryDone: false,
        visibleRetryDone: false,
      };
      stateChanged = true;
    }
    const regression = this.state.regression;

    // Reloads while the page is visible are the ones observed to recover the
    // parseable DOM, so a visible page gets the first (and instant) retry.
    if (isVisible && !regression.visibleRetryDone) {
      regression.visibleRetryDone = true;
      this.recordRecoveryReload(input.nowMs);
      return this.createRegressionEvaluation("reload", "empty_regression_visible", {
        nowMs: input.nowMs,
        stateChanged: true,
      });
    }

    if (this.isWithinFocusWindow(input.nowMs) && !regression.focusedRetryDone) {
      regression.focusedRetryDone = true;
      this.recordRecoveryReload(input.nowMs);
      return this.createRegressionEvaluation("reload", "empty_regression_focused", {
        nowMs: input.nowMs,
        focus: true,
        stateChanged: true,
      });
    }

    const cooldownRemainingMs =
      this.state.lastReloadAtMs === null
        ? 0
        : Math.max(
            0,
            this.regressionRetryCooldownMs - (input.nowMs - this.state.lastReloadAtMs)
          );
    if (
      regression.silentRetries < this.regressionMaxSilentRetries &&
      cooldownRemainingMs === 0
    ) {
      regression.silentRetries += 1;
      this.recordRecoveryReload(input.nowMs);
      return this.createRegressionEvaluation("reload", "empty_regression", {
        nowMs: input.nowMs,
        stateChanged: true,
      });
    }

    return this.createRegressionEvaluation("none", "empty_regression_waiting", {
      nowMs: input.nowMs,
      cooldownRemainingMs,
      stateChanged,
    });
  }

  private isWithinFocusWindow(nowMs: number): boolean {
    const startMs = this.state.baselineNextMeetingStartMs;
    if (startMs === null) return false;
    return (
      nowMs >= startMs - this.regressionFocusLeadMs &&
      nowMs <= startMs + this.regressionFocusGraceMs
    );
  }

  /**
   * Regression retries and post-load rescues are error recovery, not
   * staleness maintenance: they bypass the backoff escalation (regression
   * retries also bypass the daily limit, bounded instead by the per-episode
   * retry budget), and they do not count as "no change" reloads.
   */
  private recordRecoveryReload(nowMs: number): void {
    this.state.pendingReload = false;
    this.state.lastReloadAtMs = nowMs;
    this.state.reloadCountToday += 1;
  }

  private createRegressionEvaluation(
    action: HomepageReloadAction,
    reason: HomepageReloadReason,
    options: {
      nowMs: number;
      focus?: boolean;
      cooldownRemainingMs?: number;
      stateChanged: boolean;
    }
  ): HomepageReloadWatchdogEvaluation {
    const changedAt = this.state.lastFingerprintChangedAtMs;
    return this.createEvaluation({
      action,
      reason,
      focus: options.focus ?? false,
      staleForMs: changedAt === null ? 0 : Math.max(0, options.nowMs - changedAt),
      backoffMs: this.getCurrentBackoffMs(),
      cooldownRemainingMs: options.cooldownRemainingMs ?? 0,
      fingerprintChanged: false,
      stateChanged: options.stateChanged,
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
    focus?: boolean;
    staleForMs: number;
    backoffMs: number;
    cooldownRemainingMs: number;
    fingerprintChanged: boolean;
    stateChanged: boolean;
  }): HomepageReloadWatchdogEvaluation {
    return {
      ...input,
      focus: input.focus ?? false,
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
