import type { TauriSettings } from "./tauri-bridge.js";

// Keep the injected IIFE self-contained. Runtime imports from workspace
// packages can be externalized to undefined in the browser bundle.
export const INJECT_FALLBACK_SETTINGS: TauriSettings = {
  checkIntervalSeconds: 30,
  joinBeforeMinutes: 1,
  maxMinutesAfterStart: 10,
  autoClickJoin: true,
  autoMaximizeInMeeting: true,
  joinCountdownSeconds: 20,
  titleExcludeFilters: [],
  defaultMicState: "muted",
  defaultCameraState: "muted",
  showCountdownOverlay: true,
};
