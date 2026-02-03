/**
 * Content script for Google Meet meeting page (meet.google.com/xxx-xxxx-xxx)
 *
 * Responsibilities:
 * - Set mic/camera states based on settings
 * - Show join countdown overlay
 * - Auto-click join button when countdown completes
 */

import {
  findMediaButtons,
  setMicState,
  setCameraState,
  clickJoinButton,
  findJoinButton,
  getMeetingCodeFromPath,
  createJoinCountdown,
  type JoinCountdown,
  hasAutoJoinParam,
} from "@meetcat/core";
import { DEFAULT_SETTINGS, type Settings } from "@meetcat/settings";

const STORAGE_KEY = "meetcat_settings";
const ICON_URL = chrome.runtime.getURL("icons/onevcat.png");

interface MeetingState {
  settings: Settings;
  countdown: JoinCountdown | null;
  mediaApplied: boolean;
  joinAttempted: boolean;
  joinReported: boolean;
}

const state: MeetingState = {
  settings: DEFAULT_SETTINGS,
  countdown: null,
  mediaApplied: false,
  joinAttempted: false,
  joinReported: false,
};

/**
 * Load settings from storage
 */
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      state.settings = { ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] };
    }
  } catch (e) {
    console.error("[MeetCat] Failed to load settings:", e);
  }
}

/**
 * Apply media settings (mic/camera)
 */
function applyMediaSettings(): boolean {
  const { micButton, cameraButton } = findMediaButtons(document);

  if (!micButton || !cameraButton) {
    return false;
  }

  const micEnabled = state.settings.defaultMicState === "unmuted";
  const cameraEnabled = state.settings.defaultCameraState === "unmuted";

  setMicState(document, micEnabled);
  setCameraState(document, cameraEnabled);

  console.log("[MeetCat] Media settings applied:", {
    mic: micEnabled ? "unmuted" : "muted",
    camera: cameraEnabled ? "on" : "off",
  });

  return true;
}

/**
 * Wait for media buttons to be available
 */
function waitForMediaButtons(callback: () => void, maxAttempts = 20): void {
  let attempts = 0;

  const check = (): void => {
    const { micButton, cameraButton } = findMediaButtons(document);

    if (micButton && cameraButton) {
      callback();
      return;
    }

    attempts++;
    if (attempts < maxAttempts) {
      setTimeout(check, 500);
    } else {
      console.log("[MeetCat] Media buttons not found after max attempts");
    }
  };

  check();
}

/**
 * Start the join countdown
 */
function startJoinCountdown(): void {
  if (state.countdown || state.joinAttempted) return;
  if (!state.settings.autoClickJoin) return;

  const seconds = state.settings.joinCountdownSeconds;

  if (seconds <= 0) {
    // Join immediately
    performJoin();
    return;
  }

  state.countdown = createJoinCountdown(document.body, {
    seconds,
    iconUrl: ICON_URL,
    onComplete: () => {
      performJoin();
    },
    onCancel: () => {
      console.log("[MeetCat] Join cancelled by user");
      cleanupCountdown();
    },
  });

  state.countdown.start();
}

/**
 * Perform the actual join
 */
function performJoin(): void {
  state.joinAttempted = true;
  cleanupCountdown();

  const success = clickJoinButton(document);
  if (success) {
    console.log("[MeetCat] Join button clicked");
    reportJoined();
  } else {
    console.log("[MeetCat] Join button not found");
  }
}

function reportJoined(): void {
  if (state.joinReported) return;
  const meetingCode = getMeetingCodeFromPath(window.location.pathname);
  if (!meetingCode) return;
  state.joinReported = true;
  chrome.runtime.sendMessage({ type: "MEETING_JOINED", callId: meetingCode }).catch(() => {
    // Service worker might not be ready
  });
}

function reportClosed(): void {
  const meetingCode = getMeetingCodeFromPath(window.location.pathname);
  if (!meetingCode) return;
  chrome.runtime
    .sendMessage({ type: "MEETING_CLOSED", callId: meetingCode, closedAtMs: Date.now() })
    .catch(() => {
      // Service worker might not be ready
    });
}

function observeManualJoinClicks(): void {
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
        reportJoined();
      }
    },
    true
  );
}

/**
 * Cleanup countdown overlay
 */
function cleanupCountdown(): void {
  if (state.countdown) {
    state.countdown.destroy();
    state.countdown = null;
  }
}

/**
 * Initialize meeting page
 */
async function init(): Promise<void> {
  const meetingCode = getMeetingCodeFromPath(window.location.pathname);
  if (!meetingCode) {
    console.log("[MeetCat] Not a valid meeting page");
    return;
  }

  console.log("[MeetCat] Meeting page loaded:", meetingCode);

  await loadSettings();
  observeManualJoinClicks();

  const isAutoJoinRequested = hasAutoJoinParam(window.location.href);

  // Wait for media buttons and apply settings
  waitForMediaButtons(() => {
    if (!state.mediaApplied) {
      state.mediaApplied = applyMediaSettings();
    }

    if (!isAutoJoinRequested) {
      console.log("[MeetCat] Skip auto-join: meeting not opened by MeetCat");
      return;
    }

    // Start countdown for auto-join (UI always shown on meeting page)
    if (state.settings.autoClickJoin) {
      startJoinCountdown();
    }
  });
}

/**
 * Listen for settings changes
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes[STORAGE_KEY]) {
    state.settings = { ...DEFAULT_SETTINGS, ...changes[STORAGE_KEY].newValue };
  }
});

/**
 * Cleanup on unload
 */
window.addEventListener("beforeunload", () => {
  cleanupCountdown();
  reportClosed();
});

window.addEventListener("pagehide", () => {
  reportClosed();
});

// Run when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
