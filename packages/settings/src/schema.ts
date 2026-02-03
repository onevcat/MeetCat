import { z } from "zod";
import defaults from "./defaults.json";

type DefaultsJson = {
  checkIntervalSeconds: number;
  joinBeforeMinutes: number;
  maxMinutesAfterStart: number;
  autoClickJoin: boolean;
  joinCountdownSeconds: number;
  titleExcludeFilters: string[];
  defaultMicState: "muted" | "unmuted";
  defaultCameraState: "muted" | "unmuted";
  showCountdownOverlay: boolean;
  extension: {
    openInNewTab: boolean;
  };
  tauri: {
    startAtLogin: boolean;
    showTrayIcon: boolean;
    trayDisplayMode: "iconOnly" | "iconWithTime" | "iconWithCountdown";
    trayShowMeetingTitle: boolean;
    logCollectionEnabled: boolean;
    logLevel: "error" | "warn" | "info" | "debug" | "trace";
  };
};

const DEFAULTS = defaults as DefaultsJson;

/**
 * Media state options
 */
export const MediaStateSchema = z.enum(["muted", "unmuted"]);

/**
 * Tray display options
 */
export const TrayDisplayModeSchema = z.enum([
  "iconOnly",
  "iconWithTime",
  "iconWithCountdown",
]);

/**
 * Log level options
 */
export const LogLevelSchema = z.enum(["error", "warn", "info", "debug", "trace"]);

/**
 * Extension-specific settings
 */
export const ExtensionSettingsSchema = z.object({
  /** Open meeting in new tab (default: true) */
  openInNewTab: z.boolean().default(DEFAULTS.extension.openInNewTab),
});

/**
 * Tauri-specific settings
 */
export const TauriSettingsSchema = z.object({
  /** Start app at system login (default: false) */
  startAtLogin: z.boolean().default(DEFAULTS.tauri.startAtLogin),
  /** Show system tray icon (default: true) */
  showTrayIcon: z.boolean().default(DEFAULTS.tauri.showTrayIcon),
  /** Tray display mode (default: iconOnly) */
  trayDisplayMode: TrayDisplayModeSchema.default(DEFAULTS.tauri.trayDisplayMode),
  /** Show next meeting title in tray (default: false) */
  trayShowMeetingTitle: z.boolean().default(DEFAULTS.tauri.trayShowMeetingTitle),
  /** Enable log collection to disk (default: false) */
  logCollectionEnabled: z
    .boolean()
    .default(DEFAULTS.tauri.logCollectionEnabled),
  /** Log level for collection (default: info) */
  logLevel: LogLevelSchema.default(DEFAULTS.tauri.logLevel),
});

/**
 * Main settings schema for MeetCat
 */
export const SettingsSchema = z.object({
  // Timing
  /** Interval in seconds between checking for meetings (30-120, default: 30) */
  checkIntervalSeconds: z
    .number()
    .min(30)
    .max(120)
    .default(DEFAULTS.checkIntervalSeconds),
  /** Minutes before meeting start to trigger auto-join (default: 1) */
  joinBeforeMinutes: z
    .number()
    .min(0)
    .max(30)
    .default(DEFAULTS.joinBeforeMinutes),
  /** Max minutes after start to still auto-join (0-30, default: 10) */
  maxMinutesAfterStart: z
    .number()
    .min(0)
    .max(30)
    .default(DEFAULTS.maxMinutesAfterStart),

  // Join behavior
  /** Automatically click join button (false = only open page) */
  autoClickJoin: z.boolean().default(DEFAULTS.autoClickJoin),
  /** Seconds to countdown before auto-join (allows user to cancel) */
  joinCountdownSeconds: z
    .number()
    .min(0)
    .max(60)
    .default(DEFAULTS.joinCountdownSeconds),
  /** Exclude meetings with titles containing any of these strings (case-sensitive) */
  titleExcludeFilters: z
    .array(z.string())
    .default([...DEFAULTS.titleExcludeFilters]),

  // Media defaults
  /** Default microphone state when joining */
  defaultMicState: MediaStateSchema.default(DEFAULTS.defaultMicState),
  /** Default camera state when joining */
  defaultCameraState: MediaStateSchema.default(DEFAULTS.defaultCameraState),

  // UI
  /** Show next meeting overlay on Google Meet homepage */
  showCountdownOverlay: z.boolean().default(DEFAULTS.showCountdownOverlay),

  // Platform-specific
  /** Chrome Extension specific settings */
  extension: ExtensionSettingsSchema.optional(),
  /** Tauri app specific settings */
  tauri: TauriSettingsSchema.optional(),
});

/**
 * Settings type inferred from schema
 */
export type Settings = z.infer<typeof SettingsSchema>;

/**
 * Extension settings type
 */
export type ExtensionSettings = z.infer<typeof ExtensionSettingsSchema>;

/**
 * Tauri settings type
 */
export type TauriSettings = z.infer<typeof TauriSettingsSchema>;

/**
 * Media state type
 */
export type MediaState = z.infer<typeof MediaStateSchema>;
