/**
 * MeetCat Injectable Script for Tauri WebView
 *
 * This script is injected into the Google Meet WebView and handles:
 * - Homepage: Parse meetings, show overlay, respond to daemon triggers
 * - Meeting page: Apply media settings, show countdown, auto-join
 */

// Prevent duplicate injection - declare global interface
declare global {
  interface Window {
    __meetcatInitialized?: string; // stores the path that was initialized
  }
}

import { parseMeetingCards, getNextJoinableMeeting } from "./parser/index.js";
import {
  setMicState,
  setCameraState,
  clickJoinButton,
  getMeetingCodeFromPath,
  findJoinButton,
  findLeaveButton,
  findMediaButtons,
} from "./controller/index.js";
import {
  createHomepageOverlay,
  createJoinCountdown,
  ensureStyles,
  type HomepageOverlay,
  type JoinCountdown,
} from "./ui/index.js";
import { appendAutoJoinParam, hasAutoJoinParam } from "./auto-join.js";
import {
  isTauriEnvironment,
  reportMeetings,
  getSettings,
  onCheckMeetings,
  onNavigateAndJoin,
  onSettingsChanged,
  reportJoined,
  reportMeetingClosed,
  getJoinedMeetings,
  getSuppressedMeetings,
  logEvent,
  type LogLevel,
  type CheckMeetingsPayload,
  type TauriSettings,
  type NavigateAndJoinCommand,
} from "./tauri-bridge.js";
import type { Meeting } from "./types.js";
import { DEFAULT_SETTINGS as SETTINGS_DEFAULTS } from "@meetcat/settings";
import {
  createHomepageReloadWatchdog,
  createMeetingsFingerprint,
} from "./utils/homepage-reload-watchdog.js";

// Module state
let settings: TauriSettings | null = null;
let overlay: HomepageOverlay | null = null;
let countdown: JoinCountdown | null = null;
let lastMeetings: Meeting[] = [];
let mediaApplied = false;
let joinAttempted = false;
let autoJoinBlocked = false;
let joinedMeetings: Set<string> = new Set();
let suppressedMeetings: Set<string> = new Set();
let unsubscribers: Array<() => void> = [];
let fallbackIntervalId: ReturnType<typeof setInterval> | null = null;
let currentMeetingCallId: string | null = null;
let homepageKeydownHandler: ((event: KeyboardEvent) => void) | null = null;
let meetingEntryObserver: MutationObserver | null = null;
let homepageVisibilityHandler: (() => void) | null = null;
let homepageBlurHandler: (() => void) | null = null;
let lastHomepageRecoveryLogKey: string | null = null;
let homepageReloadWatchdog = createHomepageReloadWatchdog();

// Icon URL for overlays
const ICON_URL =
  "data:image/png;base64,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";

// Default settings when IPC fails (use centralized defaults from @meetcat/settings)
const DEFAULT_SETTINGS: TauriSettings = {
  checkIntervalSeconds: SETTINGS_DEFAULTS.checkIntervalSeconds,
  joinBeforeMinutes: SETTINGS_DEFAULTS.joinBeforeMinutes,
  maxMinutesAfterStart: SETTINGS_DEFAULTS.maxMinutesAfterStart,
  autoClickJoin: SETTINGS_DEFAULTS.autoClickJoin,
  joinCountdownSeconds: SETTINGS_DEFAULTS.joinCountdownSeconds,
  titleExcludeFilters: SETTINGS_DEFAULTS.titleExcludeFilters,
  defaultMicState: SETTINGS_DEFAULTS.defaultMicState,
  defaultCameraState: SETTINGS_DEFAULTS.defaultCameraState,
  showCountdownOverlay: SETTINGS_DEFAULTS.showCountdownOverlay,
};

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

function getLogConfig(): { enabled: boolean; level: LogLevel } {
  return {
    enabled: settings?.tauri?.logCollectionEnabled ?? false,
    level: settings?.tauri?.logLevel ?? "info",
  };
}

function shouldSendLog(level: LogLevel): boolean {
  const config = getLogConfig();
  if (!settings?.tauri) return false;
  if (!config.enabled) return false;
  return LOG_LEVEL_ORDER[level] <= LOG_LEVEL_ORDER[config.level];
}

function shouldConsoleLog(level: LogLevel): boolean {
  if (level === "error" || level === "warn") return true;
  if (!settings?.tauri?.logCollectionEnabled) return false;
  const threshold = settings?.tauri?.logLevel ?? "info";
  return LOG_LEVEL_ORDER[level] <= LOG_LEVEL_ORDER[threshold];
}

async function syncJoinedMeetings(): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    const joined = await getJoinedMeetings();
    joinedMeetings = new Set([...joinedMeetings, ...joined]);
    const suppressed = await getSuppressedMeetings();
    suppressedMeetings = new Set([...suppressedMeetings, ...suppressed]);
  } catch (e) {
    logToConsole("warn", "[MeetCat] Failed to load joined meetings", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function reportJoinedOnce(callId: string): void {
  if (joinedMeetings.has(callId)) return;
  joinedMeetings.add(callId);
  reportJoined(callId).catch((e) => console.error("[MeetCat] Failed to report join:", e));
  logToDisk("debug", "meeting", "join.reported", "Meeting reported joined", {
    callId,
  });
}

function logToConsole(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): void {
  if (!shouldConsoleLog(level)) return;
  if (level === "error") {
    console.error(message, context ?? "");
  } else if (level === "warn") {
    console.warn(message, context ?? "");
  } else {
    console.log(message, context ?? "");
  }
}

function logToDisk(
  level: LogLevel,
  module: string,
  event: string,
  message: string,
  context?: Record<string, unknown>
): void {
  if (!shouldSendLog(level)) return;
  if (!isTauriEnvironment()) return;

  logEvent({
    level,
    module,
    event,
    message,
    context,
    tsMs: Date.now(),
    scope: "webview",
  }).catch((error) => {
    console.warn("[MeetCat] Failed to write log event:", error);
  });
}

function reportPageDetectedForNativeState(
  path: string,
  homepage: boolean,
  meeting: boolean
): void {
  if (!isTauriEnvironment()) return;
  if (!settings?.tauri) return;
  if (settings.tauri.logCollectionEnabled) return;

  logEvent({
    level: "info",
    module: "inject",
    event: "init.page_detected",
    message: "Detected page type",
    context: {
      path,
      homepage,
      meeting,
    },
    tsMs: Date.now(),
    scope: "webview",
  }).catch((error) => {
    console.warn("[MeetCat] Failed to report page detection:", error);
  });
}

function detectEnteredMeeting(stage: string): boolean {
  const { button, matchedText } = findLeaveButton(document);
  if (!button) return false;

  if (!autoJoinBlocked) {
    autoJoinBlocked = true;
    cleanupCountdown();
    logToConsole("info", "[MeetCat] Detected in-meeting state, blocking auto-join", {
      stage,
      matchedText,
      callId: currentMeetingCallId,
    });
    logToDisk(
      "info",
      "meeting",
      "join.blocked_in_meeting",
      "Detected in-meeting state, blocking auto-join",
      {
        stage,
        matchedText,
        callId: currentMeetingCallId,
      }
    );
  }

  if (currentMeetingCallId) {
    reportJoinedOnce(currentMeetingCallId);
  }

  return true;
}

function startMeetingEntryObserver(): void {
  if (meetingEntryObserver) return;
  meetingEntryObserver = new MutationObserver(() => {
    if (detectEnteredMeeting("observer")) {
      stopMeetingEntryObserver();
    }
  });
  meetingEntryObserver.observe(document.body, { childList: true, subtree: true });
}

function stopMeetingEntryObserver(): void {
  if (meetingEntryObserver) {
    meetingEntryObserver.disconnect();
    meetingEntryObserver = null;
  }
}

/**
 * Initialize the injectable script
 */
async function init(): Promise<void> {
  // Prevent duplicate initialization for the same path
  const currentPath = location.pathname;
  if (window.__meetcatInitialized === currentPath) {
    logToConsole("info", "[MeetCat] Already initialized for path:", {
      path: currentPath,
    });
    logToDisk("debug", "inject", "init.skipped", "Already initialized", {
      path: currentPath,
    });
    return;
  }
  window.__meetcatInitialized = currentPath;

  logToConsole("info", "[MeetCat] Initializing injectable script...");
  logToConsole("info", "[MeetCat] Tauri environment:", {
    isTauri: isTauriEnvironment(),
  });
  logToConsole("info", "[MeetCat] Current path:", { path: currentPath });

  // Ensure styles are injected first (this doesn't need Tauri)
  ensureStyles(document);

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element | null;
      if (!target) return;
      const clickedButton = target.closest("button");
      if (!clickedButton) return;
      const { button } = findJoinButton(document);
      if (!button) return;
      if (clickedButton === button || button.contains(clickedButton)) {
        const meetingCode = getMeetingCodeFromPath(location.pathname);
        if (meetingCode) {
          reportJoinedOnce(meetingCode);
        }
      }
    },
    true
  );

  // Try to load settings from Tauri, fall back to defaults
  try {
    if (isTauriEnvironment()) {
      settings = await getSettings();
      logToConsole("info", "[MeetCat] Settings loaded from Tauri:", {
        settings,
      });
      logToDisk("info", "settings", "settings.loaded", "Loaded settings", {
        source: "tauri",
        logCollectionEnabled: settings?.tauri?.logCollectionEnabled ?? false,
        logLevel: settings?.tauri?.logLevel ?? "info",
      });
    } else {
      settings = DEFAULT_SETTINGS;
      logToConsole("info", "[MeetCat] Using default settings (not in Tauri)");
      logToDisk("info", "settings", "settings.loaded", "Using defaults", {
        source: "fallback",
      });
    }
  } catch (error) {
    console.warn("[MeetCat] Failed to load settings, using defaults:", error);
    settings = DEFAULT_SETTINGS;
    logToDisk("error", "settings", "settings.load_failed", "Failed to load settings", {
      source: "tauri",
    });
  }

  // Try to set up event listeners (non-blocking)
  setupEventListeners().catch((e) => {
    console.warn("[MeetCat] Failed to setup event listeners:", e);
  });

  // Detect page type and initialize accordingly
  const pathname = location.pathname;
  const isHomepage = isMeetHomepagePath(pathname);
  const isMeetingPage = getMeetingCodeFromPath(pathname) !== null;

  logToConsole("info", "[MeetCat] Page type detected", {
    homepage: isHomepage,
    meeting: isMeetingPage,
  });
  logToDisk("info", "inject", "init.page_detected", "Detected page type", {
    path: pathname,
    homepage: isHomepage,
    meeting: isMeetingPage,
  });
  reportPageDetectedForNativeState(pathname, isHomepage, isMeetingPage);

  try {
    if (isHomepage) {
      await initHomepage();
    } else if (isMeetingPage) {
      await initMeetingPage();
    } else {
      logToConsole("info", "[MeetCat] Unknown page type, skipping initialization");
    }
  } catch (error) {
    console.error("[MeetCat] Page init error:", error);
  }
}

/**
 * Set up Tauri event listeners (non-blocking)
 */
async function setupEventListeners(): Promise<void> {
  if (!isTauriEnvironment()) return;

  try {
    const unsubSettings = await onSettingsChanged((newSettings) => {
      logToConsole("info", "[MeetCat] Settings changed:", {
        settings: newSettings,
      });
      settings = newSettings;
      updateOverlayVisibility();
      logToDisk("info", "settings", "settings.changed", "Settings updated", {
        logCollectionEnabled: settings?.tauri?.logCollectionEnabled ?? false,
        logLevel: settings?.tauri?.logLevel ?? "info",
      });
    });
    unsubscribers.push(unsubSettings);
    logToDisk("debug", "inject", "listener.settings", "Settings listener attached");
  } catch (e) {
    console.warn("[MeetCat] Failed to listen for settings changes:", e);
    logToDisk("warn", "inject", "listener.settings_failed", "Settings listener failed");
  }
}

/**
 * Initialize homepage monitoring
 */
async function initHomepage(): Promise<void> {
  logToConsole("info", "[MeetCat] Initializing homepage monitoring");
  const isTauri = isTauriEnvironment();
  let hasCheckListener = false;
  logToDisk("info", "homepage", "init.start", "Homepage monitoring init");

  // Create overlay if enabled
  if (settings?.showCountdownOverlay) {
    logToConsole("info", "[MeetCat] Creating homepage overlay");
    createOverlay();
  }

  attachHomepageShortcuts();
  attachHomepageRecoveryListeners();

  // Try to set up Tauri event listeners (non-blocking)
  if (isTauri) {
    try {
      const unsubCheck = await onCheckMeetings(async (payload: CheckMeetingsPayload) => {
        logToConsole("info", "[MeetCat] Check meetings triggered", {
          checkId: payload.checkId,
        });
        logToDisk("debug", "homepage", "check.received", "Check event received", {
          checkId: payload.checkId,
          intervalSeconds: payload.intervalSeconds,
          emittedAtMs: payload.emittedAtMs,
        });
        await checkAndReportMeetings({ source: "check-meetings", checkId: payload.checkId });
      });
      unsubscribers.push(unsubCheck);
      hasCheckListener = true;
      logToDisk("debug", "homepage", "listener.check", "Check listener attached");
    } catch (e) {
      console.warn("[MeetCat] Failed to listen for check-meetings:", e);
      logToDisk("warn", "homepage", "listener.check_failed", "Check listener failed");
    }

    try {
      const unsubNav = await onNavigateAndJoin(handleNavigateAndJoin);
      unsubscribers.push(unsubNav);
    } catch (e) {
      console.warn("[MeetCat] Failed to listen for navigate-and-join:", e);
    }
  }

  // Initial check
  await checkAndReportMeetings({ source: "init" });

  if (!isTauri || !hasCheckListener) {
    startFallbackInterval();
  }
}

/**
 * Parse meetings from DOM and report to Rust backend
 */
async function checkAndReportMeetings(meta: {
  source?: "init" | "check-meetings" | "fallback-interval";
  checkId?: number;
} = {}): Promise<void> {
  const result = parseMeetingCards(document);
  lastMeetings = result.meetings;

  logToConsole("info", "[MeetCat] Parsed meetings", {
    meetingsCount: result.meetings.length,
    cardsFound: result.cardsFound,
    hiddenCards: result.hiddenCards ?? 0,
    hiddenReasons: result.hiddenReasons ?? {},
  });
  logToDisk("debug", "homepage", "parse.result", "Parsed meetings", {
    source: meta.source ?? "unknown",
    checkId: meta.checkId,
    cardsFound: result.cardsFound,
    meetingsCount: result.meetings.length,
    hiddenCards: result.hiddenCards ?? 0,
    hiddenReasons: result.hiddenReasons ?? {},
  });

  if (evaluateHomepageRecovery(meta.source ?? "unknown", result.meetings)) {
    return;
  }

  // Update overlay with next meeting
  if (overlay) {
    await syncJoinedMeetings();
    const nextMeeting = getNextJoinableMeeting(result.meetings, {
      gracePeriodMinutes:
        settings?.maxMinutesAfterStart ?? SETTINGS_DEFAULTS.maxMinutesAfterStart,
      alreadyJoined: joinedMeetings,
      suppressedMeetings,
      joinBeforeMinutes: settings?.joinBeforeMinutes ?? SETTINGS_DEFAULTS.joinBeforeMinutes,
    });
    overlay.update(nextMeeting);
    logToDisk("debug", "overlay", "overlay.update", "Overlay updated", {
      source: meta.source ?? "unknown",
      checkId: meta.checkId,
      meeting: nextMeeting
        ? {
            callId: nextMeeting.callId,
            title: nextMeeting.title,
            startsInMinutes: nextMeeting.startsInMinutes,
          }
        : null,
      graceMinutes:
        settings?.maxMinutesAfterStart ?? SETTINGS_DEFAULTS.maxMinutesAfterStart,
    });
  }

  // Report to Rust backend
  try {
    await reportMeetings(result.meetings);
    logToDisk("debug", "homepage", "meetings.reported", "Meetings reported", {
      source: meta.source ?? "unknown",
      checkId: meta.checkId,
      meetingsCount: result.meetings.length,
    });
  } catch (error) {
    console.error("[MeetCat] Failed to report meetings:", error);
    logToDisk("error", "homepage", "meetings.report_failed", "Report failed", {
      source: meta.source ?? "unknown",
      checkId: meta.checkId,
    });
  }
}

/**
 * Create homepage overlay
 */
function createOverlay(): void {
  if (overlay) return;

  overlay = createHomepageOverlay(document.body, {
    iconUrl: ICON_URL,
    onHide: () => {
      logToDisk("info", "overlay", "overlay.hidden_by_user", "Overlay hidden by user", {
        overlayType: "homepage",
      });
    },
  });
  logToDisk("info", "overlay", "overlay.created", "Homepage overlay created");

  // Update with current next meeting
  if (lastMeetings.length > 0) {
    void syncJoinedMeetings().then(() => {
      const nextMeeting = getNextJoinableMeeting(lastMeetings, {
        gracePeriodMinutes:
          settings?.maxMinutesAfterStart ?? SETTINGS_DEFAULTS.maxMinutesAfterStart,
        alreadyJoined: joinedMeetings,
        suppressedMeetings,
        joinBeforeMinutes: settings?.joinBeforeMinutes ?? SETTINGS_DEFAULTS.joinBeforeMinutes,
      });
      overlay?.update(nextMeeting);
    });
  }
}

function isMeetHomepagePath(pathname: string = location.pathname): boolean {
  return pathname === "/" || pathname === "" || pathname === "/landing";
}

function isHomepageForeground(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

function logHomepageRecovery(
  source: string,
  fingerprint: string,
  evaluation: ReturnType<typeof homepageReloadWatchdog.evaluate>
): void {
  if (evaluation.reason === "fingerprint_changed") {
    logToDisk("info", "homepage", "homepage.fingerprint.changed", "Homepage fingerprint changed", {
      source,
      fingerprint,
    });
    lastHomepageRecoveryLogKey = null;
    return;
  }

  if (evaluation.action === "defer" && evaluation.stateChanged) {
    logToDisk("info", "homepage", "homepage.reload.deferred", "Homepage reload deferred in foreground", {
      source,
      staleForMs: evaluation.staleForMs,
      backoffMs: evaluation.backoffMs,
    });
    lastHomepageRecoveryLogKey = null;
    return;
  }

  if (evaluation.action === "reload") {
    logToDisk("warn", "homepage", "homepage.reload.triggered", "Reloading stale homepage", {
      source,
      staleForMs: evaluation.staleForMs,
      backoffMs: evaluation.backoffMs,
      reloadCountToday: evaluation.reloadCountToday,
      consecutiveReloadsWithoutChange: evaluation.consecutiveReloadsWithoutChange,
    });
    lastHomepageRecoveryLogKey = null;
    return;
  }

  if (evaluation.reason === "cooldown" || evaluation.reason === "daily_limit") {
    const logKey = evaluation.reason;
    if (lastHomepageRecoveryLogKey === logKey) return;
    lastHomepageRecoveryLogKey = logKey;

    if (evaluation.reason === "cooldown") {
      logToDisk(
        "debug",
        "homepage",
        "homepage.reload.cooldown",
        "Stale homepage reload waiting for cooldown",
        {
          source,
          cooldownRemainingMs: evaluation.cooldownRemainingMs,
          backoffMs: evaluation.backoffMs,
        }
      );
      return;
    }

    logToDisk(
      "warn",
      "homepage",
      "homepage.reload.daily_limit",
      "Stale homepage reload skipped due to daily limit",
      {
        source,
        reloadCountToday: evaluation.reloadCountToday,
      }
    );
    return;
  }

  lastHomepageRecoveryLogKey = null;
}

/**
 * Detect stale homepage snapshots and recover with controlled reloads.
 * We defer reload while the page is foreground to avoid visible flicker.
 */
function evaluateHomepageRecovery(
  source: string,
  meetings: Meeting[],
  nowMs: number = Date.now()
): boolean {
  if (!isMeetHomepagePath()) return false;

  const fingerprint = createMeetingsFingerprint(meetings);
  const evaluation = homepageReloadWatchdog.evaluate({
    fingerprint,
    nowMs,
    isHomepage: true,
    isForeground: isHomepageForeground(),
  });

  logHomepageRecovery(source, fingerprint, evaluation);
  if (evaluation.action !== "reload") return false;

  location.reload();
  return true;
}

function flushPendingHomepageReload(source: string): boolean {
  if (!homepageReloadWatchdog.hasPendingReload()) return false;
  return evaluateHomepageRecovery(source, lastMeetings);
}

function attachHomepageRecoveryListeners(): void {
  if (homepageVisibilityHandler || homepageBlurHandler) return;

  homepageVisibilityHandler = () => {
    if (document.visibilityState === "visible") return;
    flushPendingHomepageReload("visibilitychange");
  };
  homepageBlurHandler = () => {
    flushPendingHomepageReload("window-blur");
  };

  document.addEventListener("visibilitychange", homepageVisibilityHandler, true);
  window.addEventListener("blur", homepageBlurHandler, true);
}

function attachHomepageShortcuts(): void {
  if (homepageKeydownHandler) return;

  homepageKeydownHandler = (event: KeyboardEvent) => {
    if (!event.metaKey) return;
    if (event.ctrlKey || event.altKey || event.shiftKey) return;
    if (event.key.toLowerCase() !== "r") return;

    event.preventDefault();
    event.stopPropagation();
    logToDisk("info", "homepage", "shortcut.reload", "Homepage reload triggered");
    location.reload();
  };

  document.addEventListener("keydown", homepageKeydownHandler, true);
}

function startFallbackInterval(): void {
  if (fallbackIntervalId !== null) return;

  const intervalSeconds = Math.max(
    settings?.checkIntervalSeconds || SETTINGS_DEFAULTS.checkIntervalSeconds,
    1
  );
  const intervalMs = intervalSeconds * 1000;

  fallbackIntervalId = setInterval(() => {
    checkAndReportMeetings({ source: "fallback-interval" }).catch((e) => {
      console.warn("[MeetCat] Periodic check failed:", e);
    });
  }, intervalMs);

  logToDisk("info", "homepage", "fallback.start", "Fallback interval started", {
    intervalSeconds,
  });
}

function stopFallbackInterval(): void {
  if (fallbackIntervalId === null) return;
  clearInterval(fallbackIntervalId);
  fallbackIntervalId = null;
  logToDisk("info", "homepage", "fallback.stop", "Fallback interval stopped");
}

/**
 * Update overlay visibility based on settings
 */
function updateOverlayVisibility(): void {
  if (settings?.showCountdownOverlay && !overlay) {
    createOverlay();
    logToDisk("info", "overlay", "overlay.shown", "Overlay shown");
  } else if (!settings?.showCountdownOverlay && overlay) {
    overlay.destroy();
    overlay = null;
    logToDisk("info", "overlay", "overlay.hidden", "Overlay hidden");
  }
}

/**
 * Handle navigate-and-join command from Rust
 */
function handleNavigateAndJoin(cmd: NavigateAndJoinCommand): void {
  logToConsole("info", "[MeetCat] Navigate and join:", { url: cmd.url });
  logToDisk("info", "meeting", "navigate_and_join", "Navigate and join", {
    url: cmd.url,
  });

  // Update settings with the ones from the command
  settings = cmd.settings;

  // Navigate to meeting URL
  location.href = appendAutoJoinParam(cmd.url);
}

/**
 * Initialize meeting page handling
 */
async function initMeetingPage(): Promise<void> {
  autoJoinBlocked = false;
  const meetingCode = getMeetingCodeFromPath(location.pathname);
  logToConsole("info", "[MeetCat] Initializing meeting page:", {
    callId: meetingCode,
  });
  currentMeetingCallId = meetingCode;
  const isAutoJoinRequested = hasAutoJoinParam(location.href);
  logToDisk("info", "meeting", "meeting.init", "Meeting page init", {
    callId: meetingCode,
    autoJoinRequested: isAutoJoinRequested,
  });

  // Wait for media buttons to appear
  await waitForMediaButtons();

  // Apply media settings
  applyMediaSettings();

  if (!isAutoJoinRequested) {
    logToConsole("info", "[MeetCat] Skip auto-join: meeting not opened by MeetCat");
    return;
  }

  // Start join countdown for auto-join (UI always shown on meeting page)
  if (settings?.autoClickJoin) {
    startJoinCountdown();
  }
}

/**
 * Wait for media buttons to appear
 */
async function waitForMediaButtons(
  maxAttempts = 20,
  intervalMs = 500
): Promise<boolean> {
  return new Promise((resolve) => {
    let attempts = 0;

    const check = (): void => {
      const buttons = findMediaButtons(document);
      if (buttons.micButton && buttons.cameraButton) {
        logToConsole("info", "[MeetCat] Media buttons found");
        logToDisk("debug", "meeting", "media_buttons.found", "Media buttons found", {
          attempts,
        });
        resolve(true);
        return;
      }

      attempts++;
      if (attempts >= maxAttempts) {
        logToConsole("info", "[MeetCat] Media buttons not found after max attempts", {
          attempts,
        });
        logToDisk("warn", "meeting", "media_buttons.not_found", "Media buttons not found", {
          attempts,
        });
        resolve(false);
        return;
      }

      setTimeout(check, intervalMs);
    };

    check();
  });
}

/**
 * Apply media settings based on configuration
 */
function applyMediaSettings(): void {
  if (mediaApplied || !settings) return;

  const micEnabled = settings.defaultMicState === "unmuted";
  const cameraEnabled = settings.defaultCameraState === "unmuted";

  const micResult = setMicState(document, micEnabled);
  const cameraResult = setCameraState(document, cameraEnabled);

  logToConsole("info", "[MeetCat] Media settings applied:", {
    mic: { desired: micEnabled, result: micResult },
    camera: { desired: cameraEnabled, result: cameraResult },
  });
  logToDisk("info", "meeting", "media_settings.applied", "Media settings applied", {
    micDesired: micEnabled,
    micChanged: micResult.changed,
    micSuccess: micResult.success,
    cameraDesired: cameraEnabled,
    cameraChanged: cameraResult.changed,
    cameraSuccess: cameraResult.success,
  });

  mediaApplied = true;
}

/**
 * Start the join countdown
 */
function startJoinCountdown(): void {
  if (countdown || !settings) return;
  if (autoJoinBlocked) return;

  if (detectEnteredMeeting("countdown.precheck")) {
    return;
  }

  const seconds = settings.joinCountdownSeconds ?? SETTINGS_DEFAULTS.joinCountdownSeconds;

  if (seconds <= 0) {
    logToDisk("info", "meeting", "join.immediate", "Joining immediately");
    performJoin();
    return;
  }

  logToDisk("info", "meeting", "join.countdown_start", "Join countdown started", {
    seconds,
  });

  countdown = createJoinCountdown(document.body, {
    seconds,
    iconUrl: ICON_URL,
    onComplete: () => {
      performJoin();
      cleanupCountdown();
    },
    onCancel: (state) => {
      logToConsole("info", "[MeetCat] Join cancelled by user");
      logToDisk("info", "meeting", "join.countdown_cancel", "Join cancelled by user", {
        remainingSeconds: state?.remainingSeconds ?? null,
        totalSeconds: state?.totalSeconds ?? null,
        callId: currentMeetingCallId,
        autoJoinRequested: hasAutoJoinParam(location.href),
      });
      cleanupCountdown();
    },
    onHide: (state) => {
      logToDisk("info", "meeting", "join.countdown_hidden", "Join countdown hidden by user", {
        remainingSeconds: state.remainingSeconds,
        totalSeconds: state.totalSeconds,
      });
    },
  });

  startMeetingEntryObserver();
  countdown.start();
}

/**
 * Perform the actual join action
 */
function performJoin(): void {
  if (joinAttempted) return;
  if (autoJoinBlocked) return;
  if (detectEnteredMeeting("join.precheck")) return;
  joinAttempted = true;

  const success = clickJoinButton(document);
  logToConsole("info", "[MeetCat] Join button clicked:", { success });
  logToDisk("info", "meeting", "join.attempt", "Join button clicked", {
    success,
  });

  if (success) {
    const meetingCode = getMeetingCodeFromPath(location.pathname);
    if (meetingCode) {
      reportJoinedOnce(meetingCode);
    }

  }
}

/**
 * Cleanup countdown overlay
 */
function cleanupCountdown(): void {
  if (countdown) {
    countdown.destroy();
    countdown = null;
  }
  stopMeetingEntryObserver();
}

/**
 * Cleanup all resources
 */
function cleanup(reason: "beforeunload" | "navigation" | "manual" = "manual"): void {
  logToConsole("info", "[MeetCat] Cleaning up", {
    reason,
    callId: currentMeetingCallId,
  });
  logToDisk("info", "inject", "cleanup", "Cleanup", {
    reason,
    callId: currentMeetingCallId,
  });

  if (currentMeetingCallId) {
    logToDisk("info", "meeting", "meeting.closed_report", "Reporting meeting closed", {
      callId: currentMeetingCallId,
      closedAtMs: Date.now(),
      reason,
    });
    reportMeetingClosed(currentMeetingCallId, Date.now()).catch((e) =>
      console.error("[MeetCat] Failed to report meeting closed:", e)
    );
    currentMeetingCallId = null;
  }

  // Unsubscribe from events
  unsubscribers.forEach((unsub) => unsub());
  unsubscribers = [];

  stopFallbackInterval();
  stopMeetingEntryObserver();

  // Destroy overlays
  if (overlay) {
    overlay.destroy();
    overlay = null;
  }

  cleanupCountdown();

  if (homepageKeydownHandler) {
    document.removeEventListener("keydown", homepageKeydownHandler, true);
    homepageKeydownHandler = null;
  }

  if (homepageVisibilityHandler) {
    document.removeEventListener("visibilitychange", homepageVisibilityHandler, true);
    homepageVisibilityHandler = null;
  }

  if (homepageBlurHandler) {
    window.removeEventListener("blur", homepageBlurHandler, true);
    homepageBlurHandler = null;
  }

  lastHomepageRecoveryLogKey = null;
}

// Initialize on DOMContentLoaded or immediately if already loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => cleanup("beforeunload"));
window.addEventListener("pagehide", () => cleanup("beforeunload"));

// Re-initialize on navigation (for SPA-like behavior)
let lastPathname = location.pathname;
const observer = new MutationObserver(() => {
  if (typeof location === "undefined") {
    return;
  }
  if (location.pathname !== lastPathname) {
    lastPathname = location.pathname;
    cleanup("navigation");
    init();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Export for potential external access
export { init, cleanup, checkAndReportMeetings };
