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
  applyMicState,
  applyCameraState,
  clickJoinButton,
  findJoinButton,
  findLeaveButton,
  getMeetingCodeFromPath,
  createJoinCountdown,
  type JoinCountdown,
  hasAutoJoinParam,
  readPendingCardJoin,
  clearPendingCardJoin,
} from "@meetcat/core";
import { initI18n } from "@meetcat/i18n";
import { DEFAULT_SETTINGS, type Settings } from "@meetcat/settings";

const STORAGE_KEY = "meetcat_settings";
const ICON_URL = chrome?.runtime?.getURL
  ? chrome.runtime.getURL("icons/icon-color.png")
  : "";

interface MeetingState {
  settings: Settings;
  countdown: JoinCountdown | null;
  mediaApplied: boolean;
  joinAttempted: boolean;
  joinReported: boolean;
  autoJoinBlocked: boolean;
  /**
   * Calendar instance id of the card whose click opened this meeting page.
   * The scheduler tracks v2 meetings by that id, so joins and closes must be
   * reported under it as well as under the real meeting code.
   */
  cardJoinAliasId: string | null;
}

const state: MeetingState = {
  settings: DEFAULT_SETTINGS,
  countdown: null,
  mediaApplied: false,
  joinAttempted: false,
  joinReported: false,
  autoJoinBlocked: false,
  cardJoinAliasId: null,
};

async function safeRuntimeSendMessage<T = unknown>(message: unknown): Promise<T | null> {
  if (!chrome?.runtime?.sendMessage) return null;
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch {
    return null;
  }
}

let meetingEntryObserver: MutationObserver | null = null;

function detectEnteredMeeting(stage: string): boolean {
  const { button, matchedText } = findLeaveButton(document);
  if (!button) return false;

  if (!state.autoJoinBlocked) {
    state.autoJoinBlocked = true;
    cleanupCountdown();
    console.log("[MeetCat] Detected in-meeting state, blocking auto-join:", {
      stage,
      matchedText,
    });
  }

  reportJoined();
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
async function applyMediaSettings(): Promise<boolean> {
  const { micButton, cameraButton } = findMediaButtons(document);

  if (!micButton || !cameraButton) {
    return false;
  }

  const micEnabled = state.settings.defaultMicState === "unmuted";
  const cameraEnabled = state.settings.defaultCameraState === "unmuted";

  const [micResult, cameraResult] = await Promise.all([
    applyMicState(document, micEnabled),
    applyCameraState(document, cameraEnabled),
  ]);

  console.log("[MeetCat] Media settings applied:", {
    mic: {
      desired: micEnabled ? "unmuted" : "muted",
      result: micResult,
    },
    camera: {
      desired: cameraEnabled ? "on" : "off",
      result: cameraResult,
    },
  });

  return micResult.success && cameraResult.success;
}

/**
 * Wait for media buttons to be available
 */
function waitForMediaButtons(callback: () => void | Promise<void>, maxAttempts = 20): void {
  let attempts = 0;

  const check = (): void => {
    const { micButton, cameraButton } = findMediaButtons(document);

    if (micButton && cameraButton) {
      void callback();
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
  if (state.autoJoinBlocked) return;

  if (detectEnteredMeeting("countdown.precheck")) {
    return;
  }

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

  startMeetingEntryObserver();
  state.countdown.start();
}

/**
 * Perform the actual join
 */
function performJoin(): void {
  if (state.autoJoinBlocked) return;
  if (detectEnteredMeeting("join.precheck")) return;
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
  void safeRuntimeSendMessage({ type: "MEETING_JOINED", callId: meetingCode });

  // Redesigned homepage: also report under the calendar instance id
  if (state.cardJoinAliasId && state.cardJoinAliasId !== meetingCode) {
    void safeRuntimeSendMessage({ type: "MEETING_JOINED", callId: state.cardJoinAliasId });
  }
  clearPendingCardJoin();
}

function reportClosed(): void {
  const meetingCode = getMeetingCodeFromPath(window.location.pathname);
  if (!meetingCode) return;
  const closedAtMs = Date.now();
  void safeRuntimeSendMessage({
    type: "MEETING_CLOSED",
    callId: meetingCode,
    closedAtMs,
  });
  // Redesigned homepage: also close under the calendar instance id so the
  // service worker's suppression bookkeeping matches its meeting list
  if (state.cardJoinAliasId && state.cardJoinAliasId !== meetingCode) {
    void safeRuntimeSendMessage({
      type: "MEETING_CLOSED",
      callId: state.cardJoinAliasId,
      closedAtMs,
    });
  }
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
  stopMeetingEntryObserver();
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
  await initI18n(state.settings.language);
  observeManualJoinClicks();

  // Auto-join intent arrives via URL param (legacy navigation) or via the
  // pending card-join flag (redesigned homepage, where Meet navigates itself)
  const pendingCardJoin = readPendingCardJoin();
  state.cardJoinAliasId =
    pendingCardJoin && pendingCardJoin.callId !== meetingCode
      ? pendingCardJoin.callId
      : null;
  const isAutoJoinRequested =
    hasAutoJoinParam(window.location.href) || Boolean(pendingCardJoin?.auto);

  // Wait for media buttons and apply settings
  waitForMediaButtons(async () => {
    if (!state.mediaApplied) {
      state.mediaApplied = await applyMediaSettings();
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
