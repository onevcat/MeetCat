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

// Module state
let settings: TauriSettings | null = null;
let overlay: HomepageOverlay | null = null;
let countdown: JoinCountdown | null = null;
let lastMeetings: Meeting[] = [];
let mediaApplied = false;
let joinAttempted = false;
let joinedMeetings: Set<string> = new Set();
let suppressedMeetings: Set<string> = new Set();
let unsubscribers: Array<() => void> = [];
let fallbackIntervalId: ReturnType<typeof setInterval> | null = null;
let currentMeetingCallId: string | null = null;

// Icon URL for overlays
const ICON_URL = "https://avatars.githubusercontent.com/u/1019875?s=128&v=4";

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
  const isHomepage = pathname === "/" || pathname === "" || pathname === "/landing";
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
  });
  logToDisk("debug", "homepage", "parse.result", "Parsed meetings", {
    source: meta.source ?? "unknown",
    checkId: meta.checkId,
    cardsFound: result.cardsFound,
    meetingsCount: result.meetings.length,
  });

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

  countdown.start();
}

/**
 * Perform the actual join action
 */
function performJoin(): void {
  if (joinAttempted) return;
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
}

/**
 * Cleanup all resources
 */
function cleanup(reason: "beforeunload" | "navigation" | "manual" = "manual"): void {
  logToConsole("info", "[MeetCat] Cleaning up", { reason });
  logToDisk("info", "inject", "cleanup", "Cleanup", { reason });

  if (currentMeetingCallId) {
    reportMeetingClosed(currentMeetingCallId, Date.now()).catch((e) =>
      console.error("[MeetCat] Failed to report meeting closed:", e)
    );
    currentMeetingCallId = null;
  }

  // Unsubscribe from events
  unsubscribers.forEach((unsub) => unsub());
  unsubscribers = [];

  stopFallbackInterval();

  // Destroy overlays
  if (overlay) {
    overlay.destroy();
    overlay = null;
  }

  cleanupCountdown();
}

// Initialize on DOMContentLoaded or immediately if already loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => cleanup("beforeunload"));

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
