/**
 * Content script for Google Meet homepage (meet.google.com)
 *
 * Responsibilities:
 * - Parse meeting cards from the page
 * - Show countdown overlay to next meeting
 * - Send meeting data to service worker
 */

import {
  parseMeetingCards,
  getNextJoinableMeeting,
  createHomepageOverlay,
  type Meeting,
} from "@meetcat/core";
import { DEFAULT_SETTINGS } from "@meetcat/settings";
import type { MeetingsUpdatedMessage, ExtensionMessage } from "../types.js";

const STORAGE_KEY = "meetcat_settings";
const ICON_URL = chrome.runtime.getURL("icons/onevcat.png");

interface HomepageState {
  settings: typeof DEFAULT_SETTINGS;
  overlay: ReturnType<typeof createHomepageOverlay> | null;
  checkInterval: ReturnType<typeof setInterval> | null;
  lastMeetings: Meeting[];
}

const state: HomepageState = {
  settings: DEFAULT_SETTINGS,
  overlay: null,
  checkInterval: null,
  lastMeetings: [],
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
 * Parse meetings and update state
 */
function updateMeetings(): void {
  const result = parseMeetingCards(document);
  state.lastMeetings = result.meetings;

  // Send to service worker
  const message: MeetingsUpdatedMessage = {
    type: "MEETINGS_UPDATED",
    meetings: result.meetings,
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // Service worker might not be ready
  });

  // Update overlay
  if (state.settings.showCountdownOverlay && state.overlay) {
    const next = getNextJoinableMeeting(result.meetings, {
      gracePeriodMinutes: state.settings.maxMinutesAfterStart,
    });
    state.overlay.update(next);
  }
}

/**
 * Initialize overlay
 */
function initOverlay(): void {
  if (!state.settings.showCountdownOverlay) return;
  if (state.overlay) return;

  state.overlay = createHomepageOverlay(document.body, { iconUrl: ICON_URL });
  const next = getNextJoinableMeeting(state.lastMeetings, {
    gracePeriodMinutes: state.settings.maxMinutesAfterStart,
  });
  state.overlay.update(next);
}

/**
 * Start periodic checking
 */
function startChecking(): void {
  if (state.checkInterval) return;

  // Initial check
  updateMeetings();

  // Periodic checks
  const intervalMs = state.settings.checkIntervalSeconds * 1000;
  state.checkInterval = setInterval(updateMeetings, intervalMs);
}

/**
 * Stop checking
 */
function stopChecking(): void {
  if (state.checkInterval) {
    clearInterval(state.checkInterval);
    state.checkInterval = null;
  }
}

/**
 * Handle messages from service worker
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "GET_STATUS") {
    sendResponse({
      meetings: state.lastMeetings,
    });
    return true;
  }
  return false;
});

/**
 * Listen for settings changes
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes[STORAGE_KEY]) {
    state.settings = { ...DEFAULT_SETTINGS, ...changes[STORAGE_KEY].newValue };

    // Restart with new interval
    stopChecking();
    startChecking();

    // Update overlay visibility
    if (state.settings.showCountdownOverlay) {
      initOverlay();
    } else if (state.overlay) {
      state.overlay.destroy();
      state.overlay = null;
    }
  }
});

/**
 * Initialize
 */
async function init(): Promise<void> {
  console.log("[MeetCat] Homepage content script loaded");

  await loadSettings();
  initOverlay();
  startChecking();
}

// Run when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
