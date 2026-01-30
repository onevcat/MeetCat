/**
 * Service Worker for MeetCat Chrome Extension
 *
 * Responsibilities:
 * - Manage extension state
 * - Handle alarms for periodic checks
 * - Open meeting tabs when triggered
 * - Coordinate between content scripts and popup
 */

import { appendAutoJoinParam, createSchedulerLogic, type Meeting } from "@meetcat/core";
import { DEFAULT_SETTINGS, type Settings } from "@meetcat/settings";
import type { ExtensionMessage, ExtensionStatus } from "../types.js";

const STORAGE_KEY = "meetcat_settings";
const ALARM_NAME = "meetcat_check";
const JOIN_TRIGGER_ALARM = "meetcat_join_trigger";

interface ServiceWorkerState {
  settings: Settings;
  meetings: Meeting[];
  joinedMeetings: Set<string>;
  lastCheck: number | null;
  scheduler: ReturnType<typeof createSchedulerLogic>;
  /** The meeting scheduled to be joined by the precise trigger */
  scheduledJoinMeeting: Meeting | null;
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
  lastCheck: null,
  scheduler: createSchedulerLogic(),
  scheduledJoinMeeting: null,
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

  // Create new alarm
  await chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: state.settings.checkIntervalSeconds / 60,
  });
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
    // Skip already joined
    if (state.joinedMeetings.has(meeting.callId)) continue;

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
  const event = state.scheduler.check(state.meetings, state.joinedMeetings);
  return {
    enabled: true,
    nextMeeting: event.meeting,
    lastCheck: state.lastCheck,
  };
}

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    switch (message.type) {
      case "MEETINGS_UPDATED":
        state.meetings = deserializeMeetings(message.meetings);
        console.log("[MeetCat SW] Meetings updated:", state.meetings.length, "meetings");
        // Schedule trigger asynchronously
        checkMeetings().then(() => {
          sendResponse({ success: true });
        });
        return true; // Keep channel open for async response

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
