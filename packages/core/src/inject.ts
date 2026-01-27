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

import { parseMeetingCards } from "./parser/index.js";
import {
  setMicState,
  setCameraState,
  clickJoinButton,
  getMeetingCodeFromPath,
  findMediaButtons,
} from "./controller/index.js";
import {
  createHomepageOverlay,
  createJoinCountdown,
  ensureStyles,
  type HomepageOverlay,
  type JoinCountdown,
} from "./ui/index.js";
import {
  isTauriEnvironment,
  reportMeetings,
  getSettings,
  onCheckMeetings,
  onNavigateAndJoin,
  onSettingsChanged,
  reportJoined,
  showNotification,
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
let unsubscribers: Array<() => void> = [];

// Icon URL for overlays
const ICON_URL = "https://avatars.githubusercontent.com/u/1019875?s=128&v=4";

// Default settings when IPC fails (use centralized defaults from @meetcat/settings)
const DEFAULT_SETTINGS: TauriSettings = {
  checkIntervalSeconds: SETTINGS_DEFAULTS.checkIntervalSeconds,
  joinBeforeMinutes: SETTINGS_DEFAULTS.joinBeforeMinutes,
  autoClickJoin: SETTINGS_DEFAULTS.autoClickJoin,
  joinCountdownSeconds: SETTINGS_DEFAULTS.joinCountdownSeconds,
  titleExcludeFilters: SETTINGS_DEFAULTS.titleExcludeFilters,
  defaultMicState: SETTINGS_DEFAULTS.defaultMicState,
  defaultCameraState: SETTINGS_DEFAULTS.defaultCameraState,
  showNotifications: SETTINGS_DEFAULTS.showNotifications,
  showCountdownOverlay: SETTINGS_DEFAULTS.showCountdownOverlay,
};

/**
 * Initialize the injectable script
 */
async function init(): Promise<void> {
  // Prevent duplicate initialization for the same path
  const currentPath = location.pathname;
  if (window.__meetcatInitialized === currentPath) {
    console.log("[MeetCat] Already initialized for path:", currentPath);
    return;
  }
  window.__meetcatInitialized = currentPath;

  console.log("[MeetCat] Initializing injectable script...");
  console.log("[MeetCat] Tauri environment:", isTauriEnvironment());
  console.log("[MeetCat] Current path:", currentPath);

  // Ensure styles are injected first (this doesn't need Tauri)
  ensureStyles(document);

  // Try to load settings from Tauri, fall back to defaults
  try {
    if (isTauriEnvironment()) {
      settings = await getSettings();
      console.log("[MeetCat] Settings loaded from Tauri:", settings);
    } else {
      settings = DEFAULT_SETTINGS;
      console.log("[MeetCat] Using default settings (not in Tauri)");
    }
  } catch (error) {
    console.warn("[MeetCat] Failed to load settings, using defaults:", error);
    settings = DEFAULT_SETTINGS;
  }

  // Try to set up event listeners (non-blocking)
  setupEventListeners().catch((e) => {
    console.warn("[MeetCat] Failed to setup event listeners:", e);
  });

  // Detect page type and initialize accordingly
  const pathname = location.pathname;
  const isHomepage = pathname === "/" || pathname === "" || pathname === "/landing";
  const isMeetingPage = getMeetingCodeFromPath(pathname) !== null;

  console.log("[MeetCat] Page type - homepage:", isHomepage, "meeting:", isMeetingPage);

  try {
    if (isHomepage) {
      await initHomepage();
    } else if (isMeetingPage) {
      await initMeetingPage();
    } else {
      console.log("[MeetCat] Unknown page type, skipping initialization");
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
      console.log("[MeetCat] Settings changed:", newSettings);
      settings = newSettings;
      updateOverlayVisibility();
    });
    unsubscribers.push(unsubSettings);
  } catch (e) {
    console.warn("[MeetCat] Failed to listen for settings changes:", e);
  }
}

/**
 * Initialize homepage monitoring
 */
async function initHomepage(): Promise<void> {
  console.log("[MeetCat] Initializing homepage monitoring");

  // Create overlay if enabled
  if (settings?.showCountdownOverlay) {
    console.log("[MeetCat] Creating homepage overlay");
    createOverlay();
  }

  // Try to set up Tauri event listeners (non-blocking)
  if (isTauriEnvironment()) {
    try {
      const unsubCheck = await onCheckMeetings(async () => {
        console.log("[MeetCat] Check meetings triggered");
        await checkAndReportMeetings();
      });
      unsubscribers.push(unsubCheck);
    } catch (e) {
      console.warn("[MeetCat] Failed to listen for check-meetings:", e);
    }

    try {
      const unsubNav = await onNavigateAndJoin(handleNavigateAndJoin);
      unsubscribers.push(unsubNav);
    } catch (e) {
      console.warn("[MeetCat] Failed to listen for navigate-and-join:", e);
    }
  }

  // Initial check
  await checkAndReportMeetings();

  // Set up periodic check as fallback
  setInterval(() => {
    checkAndReportMeetings().catch((e) => {
      console.warn("[MeetCat] Periodic check failed:", e);
    });
  }, (settings?.checkIntervalSeconds || SETTINGS_DEFAULTS.checkIntervalSeconds) * 1000);
}

/**
 * Parse meetings from DOM and report to Rust backend
 */
async function checkAndReportMeetings(): Promise<void> {
  const result = parseMeetingCards(document);
  lastMeetings = result.meetings;

  console.log(
    `[MeetCat] Parsed ${result.meetings.length} meetings from ${result.cardsFound} cards`
  );

  // Update overlay with next meeting
  if (overlay) {
    const nextMeeting = result.meetings[0] || null;
    overlay.update(nextMeeting);
  }

  // Report to Rust backend
  try {
    await reportMeetings(result.meetings);
  } catch (error) {
    console.error("[MeetCat] Failed to report meetings:", error);
  }
}

/**
 * Create homepage overlay
 */
function createOverlay(): void {
  if (overlay) return;

  overlay = createHomepageOverlay(document.body, { iconUrl: ICON_URL });

  // Update with current next meeting
  if (lastMeetings.length > 0) {
    overlay.update(lastMeetings[0]);
  }
}

/**
 * Update overlay visibility based on settings
 */
function updateOverlayVisibility(): void {
  if (settings?.showCountdownOverlay && !overlay) {
    createOverlay();
  } else if (!settings?.showCountdownOverlay && overlay) {
    overlay.destroy();
    overlay = null;
  }
}

/**
 * Handle navigate-and-join command from Rust
 */
function handleNavigateAndJoin(cmd: NavigateAndJoinCommand): void {
  console.log("[MeetCat] Navigate and join:", cmd.url);

  // Update settings with the ones from the command
  settings = cmd.settings;

  // Navigate to meeting URL
  location.href = cmd.url;
}

/**
 * Initialize meeting page handling
 */
async function initMeetingPage(): Promise<void> {
  const meetingCode = getMeetingCodeFromPath(location.pathname);
  console.log("[MeetCat] Initializing meeting page:", meetingCode);

  // Wait for media buttons to appear
  await waitForMediaButtons();

  // Apply media settings
  applyMediaSettings();

  // Start join countdown if enabled
  if (settings?.autoClickJoin && settings?.showCountdownOverlay) {
    startJoinCountdown();
  } else if (settings?.autoClickJoin) {
    // No overlay, just wait and join
    setTimeout(() => {
      performJoin();
    }, (settings?.joinCountdownSeconds || SETTINGS_DEFAULTS.joinCountdownSeconds) * 1000);
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
        console.log("[MeetCat] Media buttons found");
        resolve(true);
        return;
      }

      attempts++;
      if (attempts >= maxAttempts) {
        console.log("[MeetCat] Media buttons not found after max attempts");
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

  console.log("[MeetCat] Media settings applied:", {
    mic: { desired: micEnabled, result: micResult },
    camera: { desired: cameraEnabled, result: cameraResult },
  });

  mediaApplied = true;
}

/**
 * Start the join countdown
 */
function startJoinCountdown(): void {
  if (countdown || !settings) return;

  const seconds = settings.joinCountdownSeconds || SETTINGS_DEFAULTS.joinCountdownSeconds;

  countdown = createJoinCountdown(document.body, {
    seconds,
    iconUrl: ICON_URL,
    onComplete: () => {
      performJoin();
      cleanupCountdown();
    },
    onCancel: () => {
      console.log("[MeetCat] Join cancelled by user");
      cleanupCountdown();
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
  console.log("[MeetCat] Join button clicked:", success);

  if (success) {
    const meetingCode = getMeetingCodeFromPath(location.pathname);
    if (meetingCode) {
      reportJoined(meetingCode).catch((e) =>
        console.error("[MeetCat] Failed to report join:", e)
      );
    }

    // Show notification
    if (settings?.showNotifications) {
      const title = document.title || "Meeting";
      showNotification("MeetCat", `Joined: ${title}`).catch((e) =>
        console.error("[MeetCat] Failed to show notification:", e)
      );
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
function cleanup(): void {
  console.log("[MeetCat] Cleaning up");

  // Unsubscribe from events
  unsubscribers.forEach((unsub) => unsub());
  unsubscribers = [];

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
window.addEventListener("beforeunload", cleanup);

// Re-initialize on navigation (for SPA-like behavior)
let lastPathname = location.pathname;
const observer = new MutationObserver(() => {
  if (location.pathname !== lastPathname) {
    lastPathname = location.pathname;
    cleanup();
    init();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Export for potential external access
export { init, cleanup, checkAndReportMeetings };
