/**
 * Service Worker for MeetCat Chrome Extension
 *
 * Responsibilities:
 * - Manage extension state
 * - Handle alarms for periodic checks
 * - Open meeting tabs when triggered
 * - Coordinate between content scripts and popup
 */

import {
  appendAutoJoinParam,
  createSchedulerLogic,
  isMeetHomepageUrl,
  type Meeting,
} from "@meetcat/core";
import { DEFAULT_SETTINGS, type Settings } from "@meetcat/settings";
import type { ExtensionMessage, ExtensionStatus } from "../types.js";
import { HomepageRecoveryController } from "./homepage-recovery.js";

const STORAGE_KEY = "meetcat_settings";
const ALARM_NAME = "meetcat_check";
const JOIN_TRIGGER_ALARM = "meetcat_join_trigger";
const PARSE_REQUEST_ALARM = "meetcat_parse_request";
const PARSE_RESPONSE_TIMEOUT_MS = 15000;
const PARSE_FAILURE_THRESHOLD = 3;

interface ServiceWorkerState {
  settings: Settings;
  meetings: Meeting[];
  joinedMeetings: Set<string>;
  suppressedMeetings: Map<string, number>;
  lastCheck: number | null;
  scheduler: ReturnType<typeof createSchedulerLogic>;
  /** The meeting scheduled to be joined by the precise trigger */
  scheduledJoinMeeting: Meeting | null;
  parseFailures: number;
  pendingParseRequest: boolean;
  parseRequestTimeoutId: ReturnType<typeof setTimeout> | null;
  homepageRecovery: HomepageRecoveryController;
  lastRecoveryLogKey: string | null;
}

/**
 * Deserialize meetings from JSON (Date objects become strings during message passing)
 */
function deserializeMeetings(meetings: unknown[]): Meeting[] {
  return meetings.map((m) => {
    const meeting = m as Record<string, unknown>;
    return {
      ...meeting,
      beginTime: new Date(meeting.beginTime as string),
      endTime: new Date(meeting.endTime as string),
    } as Meeting;
  });
}

const state: ServiceWorkerState = {
  settings: DEFAULT_SETTINGS,
  meetings: [],
  joinedMeetings: new Set(),
  suppressedMeetings: new Map(),
  lastCheck: null,
  scheduler: createSchedulerLogic(),
  scheduledJoinMeeting: null,
  parseFailures: 0,
  pendingParseRequest: false,
  parseRequestTimeoutId: null,
  homepageRecovery: new HomepageRecoveryController(),
  lastRecoveryLogKey: null,
};

/**
 * Load settings from storage
 */
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      state.settings = { ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] };
      state.scheduler.updateConfig({
        joinBeforeMinutes: state.settings.joinBeforeMinutes,
        maxMinutesAfterStart: state.settings.maxMinutesAfterStart,
        titleExcludeFilters: state.settings.titleExcludeFilters,
      });
    }
  } catch (e) {
    console.error("[MeetCat SW] Failed to load settings:", e);
  }
}

/**
 * Save settings to storage
 */
async function saveSettings(settings: Partial<Settings>): Promise<void> {
  try {
    const newSettings = { ...state.settings, ...settings };
    await chrome.storage.sync.set({ [STORAGE_KEY]: newSettings });
    state.settings = newSettings;
    state.scheduler.updateConfig({
      joinBeforeMinutes: newSettings.joinBeforeMinutes,
      maxMinutesAfterStart: newSettings.maxMinutesAfterStart,
      titleExcludeFilters: newSettings.titleExcludeFilters,
    });
  } catch (e) {
    console.error("[MeetCat SW] Failed to save settings:", e);
  }
}

/**
 * Open a meeting in a new tab and bring browser to foreground
 */
async function openMeeting(meeting: Meeting): Promise<void> {
  const openInNewTab = state.settings.extension?.openInNewTab ?? true;
  const meetingUrl = appendAutoJoinParam(meeting.url);

  let tab: chrome.tabs.Tab;

  if (openInNewTab) {
    tab = await chrome.tabs.create({ url: meetingUrl, active: true });
  } else {
    // Find an existing Meet tab or create new
    const tabs = await chrome.tabs.query({ url: "https://meet.google.com/*" });
    if (tabs.length > 0 && tabs[0].id) {
      tab = await chrome.tabs.update(tabs[0].id, { url: meetingUrl, active: true });
    } else {
      tab = await chrome.tabs.create({ url: meetingUrl, active: true });
    }
  }

  // Try to bring the browser window to foreground
  if (tab.windowId) {
    try {
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (e) {
      console.warn("[MeetCat SW] Failed to focus window:", e);
    }
  }

  state.joinedMeetings.add(meeting.callId);
}

/**
 * Check for meetings and schedule precise trigger
 *
 * This is called periodically (every 30s by default) to:
 * 1. Log current status
 * 2. Re-schedule the precise join trigger based on latest meeting data
 *
 * Note: Actual joining is handled by the precise trigger, not here.
 */
async function checkMeetings(): Promise<void> {
  state.lastCheck = Date.now();

  if (state.meetings.length > 0) {
    const firstMeeting = state.meetings[0];
    const now = Date.now();
    const timeUntil = firstMeeting.beginTime.getTime() - now;
    console.log(
      `[MeetCat SW] Check: ${state.meetings.length} meetings, first "${firstMeeting.title}" starts in ${Math.round(timeUntil / 1000)}s`
    );
  } else {
    console.log("[MeetCat SW] Check: no meetings");
  }

  // Schedule precise trigger (this will update/replace any existing trigger)
  await scheduleJoinTrigger();
}

/**
 * Set up the check alarm (periodic check for parsing meetings)
 */
async function setupAlarm(): Promise<void> {
  // Clear existing alarm
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.clear(PARSE_REQUEST_ALARM);

  // Create new alarm
  await chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: state.settings.checkIntervalSeconds / 60,
  });

  await chrome.alarms.create(PARSE_REQUEST_ALARM, {
    periodInMinutes: 0.5,
  });
}

function clearParseRequestTimeout(): void {
  if (state.parseRequestTimeoutId) {
    clearTimeout(state.parseRequestTimeoutId);
    state.parseRequestTimeoutId = null;
  }
}

function isHomepageTab(tab: chrome.tabs.Tab): boolean {
  if (!tab.url) return false;
  return isMeetHomepageUrl(tab.url);
}

async function getHomepageTab(
  preferredTabId?: number
): Promise<chrome.tabs.Tab | null> {
  if (typeof preferredTabId === "number") {
    try {
      const preferredTab = await chrome.tabs.get(preferredTabId);
      if (isHomepageTab(preferredTab) && typeof preferredTab.id === "number") {
        return preferredTab;
      }
    } catch {
      // Tab may be gone; fall through to generic lookup.
    }
  }

  const tabs = await chrome.tabs.query({
    url: "https://meet.google.com/*",
  });
  const targetTab = tabs.find((tab) => isHomepageTab(tab) && typeof tab.id === "number");
  return targetTab ?? null;
}

async function isTabForeground(tab: chrome.tabs.Tab): Promise<boolean> {
  if (!tab.active) return false;
  if (typeof tab.windowId !== "number") return false;
  try {
    const win = await chrome.windows.get(tab.windowId);
    return Boolean(win.focused);
  } catch {
    return false;
  }
}

function logRecoveryDecision(
  source: string,
  fingerprint: string,
  decision: ReturnType<HomepageRecoveryController["evaluate"]>
): void {
  const { evaluation } = decision;

  if (evaluation.reason === "fingerprint_changed") {
    console.log(
      `[MeetCat SW] Homepage fingerprint changed (${source}): ${fingerprint}`
    );
    state.lastRecoveryLogKey = null;
    return;
  }

  if (evaluation.action === "defer" && evaluation.stateChanged) {
    console.log(
      `[MeetCat SW] Homepage reload deferred in foreground (${source}), stale=${Math.round(
        evaluation.staleForMs / 1000
      )}s`
    );
    state.lastRecoveryLogKey = null;
    return;
  }

  if (evaluation.action === "reload") {
    console.warn(
      `[MeetCat SW] Reloading stale homepage (${source}), stale=${Math.round(
        evaluation.staleForMs / 1000
      )}s, backoff=${Math.round(evaluation.backoffMs / 1000)}s, countToday=${evaluation.reloadCountToday}`
    );
    state.lastRecoveryLogKey = null;
    return;
  }

  if (evaluation.reason === "cooldown" || evaluation.reason === "daily_limit") {
    const logKey = evaluation.reason;
    if (state.lastRecoveryLogKey !== logKey) {
      if (evaluation.reason === "cooldown") {
        console.log(
          `[MeetCat SW] Homepage stale reload cooling down (${source}), remaining=${Math.round(
            evaluation.cooldownRemainingMs / 1000
          )}s`
        );
      } else {
        console.warn(
          `[MeetCat SW] Homepage stale reload skipped (${source}), daily limit reached`
        );
      }
      state.lastRecoveryLogKey = logKey;
    }
    return;
  }

  state.lastRecoveryLogKey = null;
}

async function evaluateHomepageRecovery(
  source: string,
  preferredTabId?: number
): Promise<void> {
  const targetTab = await getHomepageTab(preferredTabId);
  if (!targetTab?.id) return;

  const nowMs = Date.now();
  const decision = state.homepageRecovery.evaluate({
    meetings: state.meetings,
    nowMs,
    isHomepage: isHomepageTab(targetTab),
    isForeground: await isTabForeground(targetTab),
  });
  logRecoveryDecision(source, decision.fingerprint, decision);

  if (decision.evaluation.action !== "reload") return;
  await chrome.tabs.reload(targetTab.id);
}

async function flushPendingHomepageRecovery(source: string): Promise<void> {
  if (!state.homepageRecovery.hasPendingReload()) return;
  await evaluateHomepageRecovery(source);
}

async function requestHomepageParse(): Promise<void> {
  if (state.pendingParseRequest) return;
  console.log("[MeetCat SW] Requesting homepage parse");
  state.pendingParseRequest = true;
  clearParseRequestTimeout();
  state.parseRequestTimeoutId = setTimeout(() => {
    state.pendingParseRequest = false;
    state.parseFailures += 1;
    state.parseRequestTimeoutId = null;
    console.warn("[MeetCat SW] Homepage parse request timed out");
    maybeReloadHomepageTab();
  }, PARSE_RESPONSE_TIMEOUT_MS);

  const targetTab = await getHomepageTab();
  if (!targetTab?.id) {
    console.log("[MeetCat SW] No homepage tab available for parse request");
    resetParseFailures();
    clearParseRequestTimeout();
    state.pendingParseRequest = false;
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(targetTab.id, {
      type: "REQUEST_MEETINGS_PARSE",
    });
    clearParseRequestTimeout();
    state.pendingParseRequest = false;
    if (!response?.success) {
      state.parseFailures += 1;
      maybeReloadHomepageTab();
      return;
    }
    console.log("[MeetCat SW] Homepage parse acknowledged");
    resetParseFailures();
  } catch (error) {
    console.warn("[MeetCat SW] Failed to request homepage parse", error);
    clearParseRequestTimeout();
    state.pendingParseRequest = false;
    state.parseFailures += 1;
    maybeReloadHomepageTab();
    return;
  }
}

function resetParseFailures(): void {
  state.parseFailures = 0;
}

async function maybeReloadHomepageTab(): Promise<void> {
  if (state.parseFailures < PARSE_FAILURE_THRESHOLD) return;
  const targetTab = await getHomepageTab();
  if (!targetTab?.id) return;

  console.warn("[MeetCat SW] Reloading Meet homepage after parse failures");
  await chrome.tabs.reload(targetTab.id);
  resetParseFailures();
}

/**
 * Schedule a precise join trigger for the next meeting
 *
 * This calculates the exact time when we should open the meeting
 * (joinBeforeMinutes before start, up to maxMinutesAfterStart after).
 */
async function scheduleJoinTrigger(): Promise<void> {
  // Clear any existing join trigger
  await chrome.alarms.clear(JOIN_TRIGGER_ALARM);
  state.scheduledJoinMeeting = null;

  const joinBeforeMs = state.settings.joinBeforeMinutes * 60 * 1000;
  const maxAfterStartMs = state.settings.maxMinutesAfterStart * 60 * 1000;
  const now = Date.now();

  // Find the next meeting to schedule
  let nextTrigger: { meeting: Meeting; triggerTime: number } | null = null;

  for (const meeting of state.meetings) {
    // Skip if title matches any exclude filter
    if (
      state.settings.titleExcludeFilters.length > 0 &&
      state.settings.titleExcludeFilters.some((filter) => meeting.title.includes(filter))
    ) {
      continue;
    }

    const startTime = meeting.beginTime.getTime();
    const triggerTime = startTime - joinBeforeMs;
    const timeSinceStart = now - startTime;

    // Skip already ended
    if (meeting.endTime.getTime() <= now) continue;

    // Skip if suppressed after trigger time
    if (state.suppressedMeetings.has(meeting.callId) && now >= triggerTime) {
      continue;
    }

    // Skip already joined only after meeting starts
    if (state.joinedMeetings.has(meeting.callId) && now >= startTime) {
      continue;
    }

    // Check if this meeting is valid for triggering
    if (triggerTime > now) {
      // Trigger is in the future
      if (!nextTrigger || triggerTime < nextTrigger.triggerTime) {
        nextTrigger = { meeting, triggerTime };
      }
    } else if (timeSinceStart < maxAfterStartMs) {
      // Already past trigger time but still within join window - schedule immediately
      if (!nextTrigger || triggerTime < nextTrigger.triggerTime) {
        nextTrigger = { meeting, triggerTime: now };
      }
    }
  }

  if (nextTrigger) {
    const delayMs = Math.max(0, nextTrigger.triggerTime - now);
    const delayMinutes = delayMs / 60000;

    console.log(
      `[MeetCat SW] Scheduling join for "${nextTrigger.meeting.title}" in ${delayMs}ms (${delayMinutes.toFixed(1)} minutes)`
    );

    // Store the scheduled meeting so we can verify it when the alarm fires
    state.scheduledJoinMeeting = nextTrigger.meeting;

    // Chrome alarms minimum is 1 minute, but we can use `when` for precise timing
    // Note: Chrome alarms have a minimum granularity of about 1 minute in Manifest V3
    // For immediate triggers (delayMs <= 0), we'll handle it directly
    if (delayMs <= 1000) {
      // Trigger immediately
      console.log("[MeetCat SW] Triggering join immediately");
      handleJoinTrigger();
    } else {
      // Schedule the alarm for the exact time
      await chrome.alarms.create(JOIN_TRIGGER_ALARM, {
        when: nextTrigger.triggerTime,
      });
    }
  } else {
    console.log("[MeetCat SW] No meeting to schedule trigger for");
  }
}

function pruneMeetingState(): void {
  const now = Date.now();
  const activeCallIds = new Set(
    state.meetings
      .filter((meeting) => meeting.endTime.getTime() > now)
      .map((meeting) => meeting.callId)
  );

  for (const callId of state.joinedMeetings) {
    if (!activeCallIds.has(callId)) {
      state.joinedMeetings.delete(callId);
    }
  }

  for (const callId of state.suppressedMeetings.keys()) {
    if (!activeCallIds.has(callId)) {
      state.suppressedMeetings.delete(callId);
    }
  }
}

async function handleMeetingClosed(callId: string, closedAtMs: number): Promise<void> {
  const meeting = state.meetings.find((m) => m.callId === callId);
  if (!meeting) return;

  const triggerAtMs =
    meeting.beginTime.getTime() - state.settings.joinBeforeMinutes * 60 * 1000;

  if (closedAtMs >= triggerAtMs) {
    state.suppressedMeetings.set(callId, closedAtMs);
  }

  pruneMeetingState();
  await scheduleJoinTrigger();
}

/**
 * Handle the join trigger alarm
 */
async function handleJoinTrigger(): Promise<void> {
  const meeting = state.scheduledJoinMeeting;
  if (!meeting) {
    console.log("[MeetCat SW] Join trigger fired but no meeting scheduled");
    return;
  }

  // Verify the meeting is still valid and not already joined
  if (state.joinedMeetings.has(meeting.callId)) {
    console.log("[MeetCat SW] Meeting already joined, skipping");
    state.scheduledJoinMeeting = null;
    // Schedule next trigger
    await scheduleJoinTrigger();
    return;
  }

  console.log("[MeetCat SW] Precise trigger fired, joining:", meeting.title);
  await openMeeting(meeting);

  // Clear the scheduled meeting
  state.scheduledJoinMeeting = null;

  // Schedule the next trigger (if there are more meetings)
  await scheduleJoinTrigger();
}

/**
 * Get current status
 */
function getStatus(): ExtensionStatus {
  const event = state.scheduler.check(
    state.meetings,
    state.joinedMeetings,
    state.suppressedMeetings,
    Date.now()
  );
  return {
    enabled: true,
    nextMeeting: event.meeting,
    lastCheck: state.lastCheck,
    joinedCallIds: Array.from(state.joinedMeetings),
    suppressedCallIds: Array.from(state.suppressedMeetings.keys()),
  };
}

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    switch (message.type) {
      case "MEETINGS_UPDATED":
        state.meetings = deserializeMeetings(message.meetings);
        console.log("[MeetCat SW] Meetings updated:", state.meetings.length, "meetings");
        clearParseRequestTimeout();
        state.pendingParseRequest = false;
        resetParseFailures();
        pruneMeetingState();
        // Schedule trigger asynchronously
        checkMeetings()
          .then(async () => {
            const senderTabId =
              typeof sender.tab?.id === "number" ? sender.tab.id : undefined;
            await evaluateHomepageRecovery("meetings-updated", senderTabId);
            sendResponse({ success: true });
          })
          .catch((error) => {
            console.warn("[MeetCat SW] Failed to process meetings update", error);
            sendResponse({ success: false });
          });
        return true; // Keep channel open for async response

      case "MEETING_JOINED":
        state.joinedMeetings.add(message.callId);
        scheduleJoinTrigger();
        sendResponse({ success: true });
        return true;

      case "MEETING_CLOSED":
        handleMeetingClosed(message.callId, message.closedAtMs).then(() => {
          sendResponse({ success: true });
        });
        return true;

      case "GET_SETTINGS":
        sendResponse(state.settings);
        break;

      case "UPDATE_SETTINGS":
        saveSettings(message.settings).then(() => {
          setupAlarm();
          // Reschedule trigger with new settings
          scheduleJoinTrigger();
          sendResponse({ success: true });
        });
        return true; // Keep channel open for async response

      case "GET_STATUS":
        sendResponse(getStatus());
        break;

      default:
        sendResponse({ error: "Unknown message type" });
    }

    return false;
  }
);

/**
 * Handle alarms
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    // Periodic check alarm - update meetings and reschedule trigger
    await checkMeetings();
    await flushPendingHomepageRecovery("periodic-check");
  } else if (alarm.name === PARSE_REQUEST_ALARM) {
    await requestHomepageParse();
    await flushPendingHomepageRecovery("parse-alarm");
  } else if (alarm.name === JOIN_TRIGGER_ALARM) {
    // Precise join trigger alarm - open the meeting
    await handleJoinTrigger();
  }
});

/**
 * Handle storage changes
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes[STORAGE_KEY]) {
    state.settings = { ...DEFAULT_SETTINGS, ...changes[STORAGE_KEY].newValue };
    state.scheduler.updateConfig({
      joinBeforeMinutes: state.settings.joinBeforeMinutes,
      maxMinutesAfterStart: state.settings.maxMinutesAfterStart,
      titleExcludeFilters: state.settings.titleExcludeFilters,
    });
    setupAlarm();
  }
});

chrome.tabs.onActivated.addListener(() => {
  void flushPendingHomepageRecovery("tab-activated");
});

chrome.windows.onFocusChanged.addListener(() => {
  void flushPendingHomepageRecovery("window-focus-changed");
});

/**
 * Initialize on install
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[MeetCat SW] Extension installed");
  await loadSettings();
  await setupAlarm();
});

/**
 * Initialize on startup
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log("[MeetCat SW] Extension started");
  await loadSettings();
  await setupAlarm();
});

// Load settings immediately
loadSettings().then(setupAlarm);

console.log("[MeetCat SW] Service worker loaded");
