/**
 * Tauri IPC bridge for MeetCat injectable script
 *
 * This module provides a communication layer between the injected
 * JavaScript code running in the WebView and the Rust backend.
 */

import type { Meeting } from "./types.js";

/**
 * Settings structure matching Rust Settings
 */
export interface TauriSettings {
  checkIntervalSeconds: number;
  joinBeforeMinutes: number;
  maxMinutesAfterStart: number;
  autoClickJoin: boolean;
  joinCountdownSeconds: number;
  titleExcludeFilters: string[];
  defaultMicState: "muted" | "unmuted";
  defaultCameraState: "muted" | "unmuted";
  showCountdownOverlay: boolean;
  tauri?: {
    startAtLogin: boolean;
    showTrayIcon: boolean;
    trayDisplayMode: "iconOnly" | "iconWithTime" | "iconWithCountdown";
    trayShowMeetingTitle: boolean;
    logCollectionEnabled: boolean;
    logLevel: "error" | "warn" | "info" | "debug" | "trace";
  };
}

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

export type LogEventInput = {
  level: LogLevel;
  module: string;
  event: string;
  message?: string;
  context?: Record<string, unknown> | null;
  tsMs?: number;
  scope?: string;
};

export type CheckMeetingsPayload = {
  checkId: number;
  intervalSeconds: number;
  emittedAtMs: number;
};

/**
 * Navigation command from Rust
 */
export interface NavigateAndJoinCommand {
  url: string;
  settings: TauriSettings;
}

/**
 * Check if running inside Tauri WebView
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/**
 * Get Tauri API object
 */
function getTauriApi(): typeof window.__TAURI__ | null {
  if (!isTauriEnvironment()) return null;
  return window.__TAURI__;
}

/**
 * Invoke a Tauri command
 */
export async function invoke<T>(cmd: string, args?: object): Promise<T> {
  const tauri = getTauriApi();
  if (!tauri) {
    throw new Error("Not running in Tauri environment");
  }
  return tauri.core.invoke<T>(cmd, args);
}

/**
 * Listen to Tauri events
 */
export async function listen<T>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> {
  const tauri = getTauriApi();
  if (!tauri) {
    throw new Error("Not running in Tauri environment");
  }
  return tauri.event.listen<T>(event, (e) => handler(e.payload));
}

/**
 * Report parsed meetings to Rust backend
 */
export async function reportMeetings(meetings: Meeting[]): Promise<void> {
  // Convert Date objects to ISO strings for serialization
  const serializedMeetings = meetings.map((m) => ({
    call_id: m.callId,
    url: m.url,
    title: m.title,
    display_time: m.displayTime,
    begin_time: m.beginTime.toISOString(),
    end_time: m.endTime.toISOString(),
    event_id: m.eventId,
    starts_in_minutes: m.startsInMinutes,
  }));
  await invoke("meetings_updated", { meetings: serializedMeetings });
}

/**
 * Get settings from Rust backend
 */
export async function getSettings(): Promise<TauriSettings> {
  return invoke<TauriSettings>("get_settings");
}

/**
 * Report that a meeting was joined
 */
export async function reportJoined(callId: string): Promise<void> {
  await invoke("meeting_joined", { callId });
}

/**
 * Report that a meeting page was closed
 */
export async function reportMeetingClosed(callId: string, closedAtMs: number): Promise<void> {
  await invoke("meeting_closed", { callId, closedAtMs });
}

/**
 * Get joined meeting call IDs from Rust backend
 */
export async function getJoinedMeetings(): Promise<string[]> {
  return invoke<string[]>("get_joined_meetings");
}

/**
 * Get suppressed meeting call IDs from Rust backend
 */
export async function getSuppressedMeetings(): Promise<string[]> {
  return invoke<string[]>("get_suppressed_meetings");
}

/**
 * Listen for check-meetings trigger from Rust daemon
 */
export async function onCheckMeetings(
  handler: (payload: CheckMeetingsPayload) => void
): Promise<() => void> {
  return listen<CheckMeetingsPayload>("check-meetings", handler);
}

/**
 * Listen for navigate-and-join command from Rust
 */
export async function onNavigateAndJoin(
  handler: (cmd: NavigateAndJoinCommand) => void
): Promise<() => void> {
  return listen<NavigateAndJoinCommand>("navigate-and-join", handler);
}

/**
 * Listen for settings changes from Rust
 */
export async function onSettingsChanged(
  handler: (settings: TauriSettings) => void
): Promise<() => void> {
  return listen<TauriSettings>("settings_changed", handler);
}

/**
 * Send log event to Rust backend
 */
export async function logEvent(input: LogEventInput): Promise<void> {
  await invoke("log_event", { input });
}

// Extend Window interface for Tauri
declare global {
  interface Window {
    __TAURI__: {
      core: {
        invoke<T>(cmd: string, args?: object): Promise<T>;
      };
      event: {
        listen<T>(
          event: string,
          handler: (event: { payload: T }) => void
        ): Promise<() => void>;
        emit(event: string, payload?: unknown): Promise<void>;
      };
    };
  }
}
